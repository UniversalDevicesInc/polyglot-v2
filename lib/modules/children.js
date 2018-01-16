const logger = require('../modules/logger')
const config = require('../config/config')
const os = require('os')
const fs = require('fs-extra')
//const ns = require('../models/nodeserver')
const mqttc = require('../modules/mqttc')
const childProcess = require('child_process')


module.exports = {
  /*
   * Array of local NodeServer process objects. Corresponds to config.NodeServer[profileNum]
   * {process: child_process.spawn, env: {}, args: {}, profileNum: #}
   */
  nodeProcesses: new Array(25),

  cloneRepo(message, callback) {
    if (message.installns.hasOwnProperty('name') && message.installns.hasOwnProperty('url')) {
			let nsPath = `${os.homedir()}/.polyglot/nodeservers/`
      let args = ['clone', '--depth', '1', message.installns.url, message.installns.name]
      let opts = {
        cwd: nsPath,
        shell: '/bin/bash'
      }
      this.spawn(message.installns.name, 'git', args, opts, (err) => {
        if (err) {
          logger.error(`NSChild: ${message.installns.name} clone error: ${err.message}`)
          return callback(err.message)
        }
        let msg = `NSChild: ${message.installns.name} clone complete. Add NodeServer in the Add NodeServer tab.`
        logger.debug(`${msg}`)
        return callback(null, msg)
      })
    } else {
      callback('name or url not found')
    }
  },

  pullRepo(message, callback) {
    if (message.updatens.hasOwnProperty('name')) {
			let nsPath = `${os.homedir()}/.polyglot/nodeservers/${message.updatens.name}`
      let args = ['pull']
      let opts = {
        cwd: nsPath,
        shell: '/bin/bash'
      }
      this.spawn(message.updatens.name, 'git', args, opts, (err) => {
        if (err) { return callback(`NSChild: ${message.updatens.name} pull error: ${err.message}`) }
        logger.debug(`NSChild: ${message.updatens.name} pull sub-process complete.`)
        if (message.updatens.hasOwnProperty('updateProfile')) {
          let found = false
          config.nodeServers.forEach(ns => {
            if (ns.name === message.updatens.name && ns.type === 'local') {
              found = true
              ns.installprofile({'reboot': true}, null, (err, result) => {
                if (err) { return callback(`NSChild: Error - ${err}`) }
                return callback(null, `NSChild: profile update requested for ${message.updatens.name}. Installing...`)
              })
            }
          })
          if (!found) { return callback(`NSChild: profile update requested for ${message.updatens.name} however it isn't installed.`) }
        } else {
          return callback(null, `Update pulled Sucessfully from Git. Restart the NodeServer from the Control tab. Under Dashboard > NodeServer > Details`)
        }
      })
    } else {
      return callback('NSChild: UpdateNS name not found.')
    }
  },

  spawn(name, command, args, opts, callback) {
    const child = childProcess.spawn(command, args, opts)
    child.on('error', callback)
    child.stdout.on('data', (data) => {
      logger.debug(`NSChild: ${name} ${command}: ${data}`)
    })
    child.on('close', (code) => {
      if (code !== 0) return callback(new Error('Non-zero exit code: ' + code))
      logger.debug(`NSChild: ${name} ${command} exited with cause code: ${code}`)
      callback(null)
    })
  },

  stopChildNodeServer(ns) {
    if (!(this.nodeProcesses[ns.profileNum])) { return }
    logger.debug(`NSChild: Stopping Child NodeServer ${ns.name}`)
    this.stopPolls(ns)
    this.nodeProcesses[ns.profileNum].kill()
  },

  runInstallProcess(name) {
    if (name) {
      let nsPath = `${os.homedir()}/.polyglot/nodeservers/${name}/`
      if (fs.existsSync(nsPath + 'server.json')) {
        try {
          let server = require(nsPath + 'server.json')
          if (server.hasOwnProperty('install')) {
            let opts = {
              cwd: nsPath,
              shell: '/bin/bash'
            }
            let runCmd = `/usr/bin/env bash -xe ./${server.install}`
            this.spawn(name, runCmd, [], opts, (err) => {
              if (err) { return logger.error(`NSChild: ${name} install error: ${err.message}`) }
              logger.debug(`NSChild: ${name} install sub-process complete.`)
            })
          } else {
            logger.debug(`NSChild: ${name} does not have an install process defined. Run any install scripts for the nodeserver manually if necessary.`)
          }
        } catch (e) {
          logger.error(`NSChild: Install failed - ${e}`)
        }
      }
    }
  },

  startPolls(ns) {
    if (!config.shortPolls[ns.profileNum] && !config.longPolls[ns.profileNum]) {
      config.shortPolls[ns.profileNum] = setInterval(() => { ns.sendPoll('shortPoll') }, ns.shortPoll * 1000)
      config.shortPolls[ns.profileNum].unref()
      config.longPolls[ns.profileNum] = setInterval(() => { ns.sendPoll('longPoll') }, ns.longPoll * 1000)
      config.longPolls[ns.profileNum].unref()
    }
  },

  stopPolls(ns) {
    clearInterval(config.shortPolls[ns.profileNum])
    clearInterval(config.longPolls[ns.profileNum])
    config.shortPolls[ns.profileNum] = null
    config.longPolls[ns.profileNum] = null
  },

  runChildNodeServer(ns) {
    if (this.nodeProcesses[ns.profileNum]) { return }
    if (ns.homeDir) {
      if (fs.existsSync(ns.homeDir + 'server.json')) {
        try {
          let server = require(ns.homeDir + 'server.json')
          if (server.hasOwnProperty('type') && server.hasOwnProperty('executable')) {
            let init = JSON.stringify({
              token: ns.token,
              mqttHost: config.settings.mqttHost,
              mqttPort: config.settings.mqttPort.toString(),
              profileNum: ns.profileNum
            })
            let opts = {
              cwd: ns.homeDir,
              shell: '/bin/bash'
            }
            let runCmd = `/usr/bin/env ${server.type} ./${server.executable}`
            try {
              logger.info(`NS: Starting Local NodeServer ${ns.name} profile number ${ns.profileNum}`)
              ns.getNodesFromISY()
              this.nodeProcesses[ns.profileNum] = childProcess.spawn(runCmd, [], opts)
              this.nodeProcesses[ns.profileNum].on('uncaughtException', (err) => {
                logger.error(`NS: Caught Error trying to write to NodeServer ${ns.name}: ${err}`)
                this.stopPolls(ns)
                delete this.nodeProcesses[ns.profileNum]
              })
              this.nodeProcesses[ns.profileNum].on('error', (err) => {
                this.stopPolls(ns)
                logger.error(`NSChild: ${err}`)
                delete this.nodeProcesses[ns.profileNum]
              })
              this.nodeProcesses[ns.profileNum].on('exit', (code, signal) => {
                this.stopPolls(ns)
                if (config.nodeServers[ns.profileNum]) {
                  logger.debug(`NSChild: ${config.nodeServers[ns.profileNum].name} exited with cause code: ${code} and signal: ${signal}`)
                } else {
                  logger.debug(`NSChild: NodeServer Shutdown cause code: ${code} signal: ${signal}`)
                }
                delete this.nodeProcesses[ns.profileNum]
              })
              this.nodeProcesses[ns.profileNum].on('close', (code, signal) => {
                this.stopPolls(ns)
                if (config.nodeServers[ns.profileNum]) {
                  logger.debug(`NSChild: ${config.nodeServers[ns.profileNum].name} exited with cause code: ${code} and signal: ${signal}`)
                } else {
                  logger.debug(`NSChild: NodeServer Shutdown cause code: ${code} signal: ${signal}`)
                }
                delete this.nodeProcesses[ns.profileNum]
              })
              this.nodeProcesses[ns.profileNum].stderr.on('data', (data) => {
                logger.error(`NSChild: ${config.nodeServers[ns.profileNum].name} STDERR: ${data}`)
              })
              this.nodeProcesses[ns.profileNum].stdout.on('data', (data) => {
                logger.debug(`NSChild: ${config.nodeServers[ns.profileNum].name} STDOUT: ${data}`)
                // maybe someday listen for input from stdio? don't want to though we chose MQTT for a reason
                // pass
              })
              setTimeout(() => {
                if (this.nodeProcesses[ns.profileNum]) {
                  this.nodeProcesses[ns.profileNum].stdin.write(init + '\n')
                }
              }, 500)
            } catch (e) {
                logger.debug(`NSChild: Spawn failed with ${e}`)
            }
          } else {
            logger.error(`NSChild: Could not find 'type' or 'executable' in server.json file. Unable to automatically run local NodeServer: ${ns.name} from ${ns.homeDir}`)
          }
        } catch (e) {
          logger.error('NS: Error getting server.json required fields. name and executable are required. - ' + e)
        }
      }
    }
  },

}
