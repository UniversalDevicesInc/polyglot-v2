const mongoose = require('mongoose')
const os = require('os')
const fs = require('fs-extra')
const childProcess = require('child_process')

const logger = require('../modules/logger')
const helpers = require('../modules/helpers')
const config = require('../config/config')
const mqtt = require('../modules/mqtt')

function spawn(name, command, args, opts) {
  let p = new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, opts)
    child.on('error', (data) => { logger.error(`child.spawn: ${data}`) })
    child.stdout.on('data', (data) => { logger.debug(`NSChild: ${name} ${command}: ${data}` )})
    child.stderr.on('data', (data) => { logger.debug(`NSChild: ${name} ${command}: ${data}`) })
    child.on('close', (code) => {
      if (code !== 0) reject('Non-zero exit code: ' + code)
      logger.debug(`NSChild: ${name} ${command} exited with cause code: ${code}`)
      resolve()
    })
  })
  return p
}

async function runInstallProcess(name) {
  if (!name) throw new Error(`runInstallProcess: name not found`)
  let nsPath = `${config.polyDir}nodeservers/${name}/`
  if (!fs.existsSync(nsPath + 'server.json')) throw new Error(`runInstallProcess: server.json not found.`)
  try {
    let server = require(nsPath + 'server.json')
    if (server.hasOwnProperty('install')) {
      let opts = {
        cwd: nsPath,
        shell: '/bin/sh'
      }
      let runCmd = `/bin/sh ./${server.install}`
      await spawn(name, runCmd, [], opts)
      logger.debug(`NSChild: ${name} install sub-process complete.`)
    } else {
      logger.debug(`NSChild: ${name} does not have an install process defined. Run any install scripts for the nodeserver manually if necessary.`)
    }
  } catch (err) {
    logger.error(`NSChild: Install failed - ${err}`)
    throw new Error(`runInstallProcess: ${err.stack}`)
  }
}

module.exports = {
  /*
   * Array of local NodeServer process objects. Corresponds to config.NodeServer[profileNum]
   * {process: child_process.spawn, env: {}, args: {}, profileNum: #}
   */
  //nodeProcesses: new Array(25),

  async cloneRepo(message) {
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    let nsPath = `${config.polyDir}nodeservers/`
    let args = ['clone', '--depth', '1', message.url, message.name]
    let opts = {
      cwd: nsPath,
      shell: '/bin/sh'
    }
    try {
        await spawn(message.name, 'git', args, opts)
        logger.info(`NSChild cloneRepo: Successfully cloned ${message.name} into NodeServer directory.`)
        await runInstallProcess(message.name)
        result.message = `${message.name} clone process complete. Add NodeServer in the Add NodeServer tab.`
        result.success = true
        return result
    } catch (err) {
      logger.error(`NSChild: ${message.name} cloneRepo: ${err}`)
      if (err.stack) logger.error(`${err.stack}`)
      result.message = `cloneRepo: ${err}`
      return result
    }
  },

  async pullRepo(message) {
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    let nsPath = `${config.polyDir}nodeservers/${message.name}`
    let args = ['pull']
    let opts = {
      cwd: nsPath,
      shell: '/bin/sh'
    }
    try {
      await spawn(message.name, 'git', args, opts)
      logger.debug(`NSChild: ${message.name} pull sub-process complete.`)
      await runInstallProcess(message.name)
      if (message.hasOwnProperty('updateProfile')) {
        let found = false
        for (let profileNum in config.nodeServers) {
          let ns = config.nodeServers[profileNum]
          if (ns && ns.name === message.name && ns.type === 'local') {
            found = true
            logger.info(`NSChild: profile update requested for ${message.name}. Installing...`)
            require('./nodeserver').installprofile(profileNum, {'reboot': false}, null)
            break
          }
        }
        if (!found) throw new Error(`NSChild: profile update requested for ${message.name} however it isn't installed.`)
      }
      result.message = `Update pulled Sucessfully from Git. Restart the NodeServer from the Control tab. Under Dashboard > NodeServer > Details`
      result.success = true
      return result
    } catch (err) {
      logger.error(`NSChild: ${message.name} pullRepo: ${err}`)
      if (err.stack) logger.error(`${err.stack}`)
      result.message = (`pullRepo: ${err.message}`)
      return result
    }
  },

  async stopChildNodeServer(ns) {
    if (config.nodeProcesses[ns.profileNum]) {
      logger.debug(`NSChild: Stopping Child NodeServer ${ns.name}`)
      this.stopPolls(ns)
      await process.kill(-config.nodeProcesses[ns.profileNum].pid)
    }
  },

  runInstallProcess,

  startPolls(ns) {
    if (!config.shortPolls[ns.profileNum]) {
      config.shortPolls[ns.profileNum] = setInterval(() => { this.sendPoll('shortPoll', ns.profileNum) }, ns.shortPoll * 1000)
      config.shortPolls[ns.profileNum].unref()
    }
    if (!config.longPolls[ns.profileNum]) {
      config.longPolls[ns.profileNum] = setInterval(() => { this.sendPoll('longPoll', ns.profileNum) }, ns.longPoll * 1000)
      config.longPolls[ns.profileNum].unref()
    }
  },

  stopPolls(profileNum) {
    clearInterval(config.shortPolls[profileNum])
    clearInterval(config.longPolls[profileNum])
    config.shortPolls[profileNum] = null
    config.longPolls[profileNum] = null
  },

  sendPoll(type, profileNum) {
    mqtt.makeResponse(profileNum, type, {})
  },

  async runChildNodeServer(ns) {
    if (config.nodeProcesses[ns.profileNum]) { return }
    const NodeServer = mongoose.model('NodeServer')
    if (ns.homeDir) {
      if (fs.existsSync(ns.homeDir + 'server.json')) {
        try {
          let server = JSON.parse(fs.readFileSync(ns.homeDir + 'server.json', 'utf8'))
          if (server.hasOwnProperty('type') && server.hasOwnProperty('executable')) {
            //await ns.getNodesFromISY()
            let init = JSON.stringify({
              token: ns.token,
              mqttHost: config.settings.mqttHost,
              mqttPort: config.settings.mqttPort.toString(),
              profileNum: ns.profileNum
            })
            let opts = {
              cwd: ns.homeDir,
              shell: '/bin/sh',
              detached: true
            }
            let runCmd = `/usr/bin/env ${server.type} ./${server.executable}`
            let version = server.credits[0].hasOwnProperty('version') ? server.credits[0].version : 'Not Found'
            logger.info(`NS: Starting Local NodeServer ${ns.name} profile number ${ns.profileNum} :: Version ${version}`)
            let update = {
              timeStarted: Date.now(),
              currentVersion: version
            }
            NodeServer.findOneAndUpdate({ profileNum: ns.profileNum }, update ).exec()
            config.nodeProcesses[ns.profileNum] = childProcess.spawn(runCmd, [], opts)
            // STDERR
            config.nodeProcesses[ns.profileNum].stderr.on('data', (data) => {
              this.stopPolls(ns.profileNum)
              logger.error(`NSChild STDERR: ${config.nodeServers[ns.profileNum].name}: ${String(data)}`)
              delete config.nodeProcesses[ns.profileNum]
            })
            // STDOUT
            config.nodeProcesses[ns.profileNum].stdout.on('data', (data) => {
              logger.debug(`NSChild STDOUT: ${config.nodeServers[ns.profileNum].name}: ${String(data)}`)
              // maybe someday listen for input from stdio? don't want to though we chose MQTT for a reason
              // pass
            })
            config.nodeProcesses[ns.profileNum].on('error', (err) => {
              logger.error(`NSChild Error: ${err}`)
              if (config.nodeProcesses[ns.profileNum]) {
                this.stopPolls(ns.profileNum)
                delete config.nodeProcesses[ns.profileNum]
              }
            })
            // EXIT
            config.nodeProcesses[ns.profileNum].on('exit', (code, signal) => {
              if (config.nodeProcesses[ns.profileNum]) {
                this.stopPolls(ns.profileNum)
                delete config.nodeProcesses[ns.profileNum]
              }
              if (config.nodeServers[ns.profileNum]) {
                logger.debug(`NSChild Exit: ${config.nodeServers[ns.profileNum].name} exited with cause code: ${code} and signal: ${signal}`)
              } else {
                logger.debug(`NSChild: NodeServer Shutdown cause code: ${code} signal: ${signal}`)
              }
              let update = {
                timeStarted: 0
              }
              NodeServer.findOneAndUpdate({ profileNum: ns.profileNum }, update ).exec()
              require('./nodeserver').connected(ns.profileNum, false, 'connected')
            })

            setTimeout(() => {
              if (config.nodeProcesses[ns.profileNum]) {
                config.nodeProcesses[ns.profileNum].stdin.write(init + '\n')
              }
            }, 500)
          } else {
            logger.error(`NSChild: Could not find 'type' or 'executable' in server.json file. Unable to automatically run local NodeServer: ${ns.name} from ${ns.homeDir}`)
          }
        } catch (e) {
          logger.error(`NS: Error getting server.json required fields. name and executable are required :: ${e}`)
        }
      }
    }
  },

}
