const logger = require('../modules/logger')
const config = require('../config/config')
const os = require('os')
const fs = require('fs-extra')
const ns = require('../models/nodeserver')
const childProcess = require('child_process')


module.exports = {
  /*
   * Array of local NodeServer process objects. Corresponds to config.NodeServer[profileNum]
   * {process: child_process.spawn, env: {}, args: {}, profileNum: #}
   */
  nodeProcesses: new Array(11),

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
        logger.debug(`NSChild: ${message.installns.name} clone sub-process complete.`)
        return callback(null)
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
        if (err) {
          logger.error(`NSChild: ${message.updatens.name} pull error: ${err.message}`)
          return callback(err.message)
        }
        logger.debug(`NSChild: ${message.updatens.name} pull sub-process complete.`)
        return callback(null)
      })
    } else {
      callback('name not found')
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
            let runCmd = `./${server.install}`
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

  runChildNodeServer(ns) {
    if (this.nodeProcesses[ns.profileNum]) { return }
    if (ns.homeDir) {
      if (fs.existsSync(ns.homeDir + 'server.json')) {
        try {
          let server = require(ns.homeDir + 'server.json')
          if (server.hasOwnProperty('type') && server.hasOwnProperty('executable')) {
            let init = JSON.stringify({
              ipAddress: config.settings.ipAddress,
              mqttHost: config.settings.mqttHost,
              mqttPort: config.settings.mqttPort.toString(),
              profileNum: ns.profileNum
            })
            let opts = {
              cwd: ns.homeDir,
              shell: '/bin/bash'
            }
            let runCmd = `./${server.executable}`
            try {
              logger.info(`NS: Starting Local NodeServer ${ns.name} profile number ${ns.profileNum}`)
              this.nodeProcesses[ns.profileNum] = childProcess.spawn(runCmd, [], opts)
              this.nodeProcesses[ns.profileNum].on('uncaughtException', (err) => {
                logger.error(`NS: Caught Error trying to write to NodeServer ${ns.name}: ${err}`)
                delete this.nodeProcesses[ns.profileNum]
              })
              this.nodeProcesses[ns.profileNum].on('error', (err) => {
                logger.error(`NSChild: ${err}`)
                delete this.nodeProcesses[ns.profileNum]
              })
              this.nodeProcesses[ns.profileNum].on('close', (code) => {
                logger.debug(`NSChild: ${config.nodeServers[ns.profileNum].name} exited with cause code: ${code}`)
                delete this.nodeProcesses[ns.profileNum]
              })
              this.nodeProcesses[ns.profileNum].stderr.on('data', (data) => {
                logger.error(`NSChild: ${config.nodeServers[ns.profileNum].name} STDERR: ${data}`)
              })
              this.nodeProcesses[ns.profileNum].stdout.on('data', (data) => {
                //
              })
              setTimeout(() => {
                if (this.nodeProcesses[ns.profileNum])
                {
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
