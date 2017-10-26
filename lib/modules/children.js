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
            let installProcess = childProcess.spawn(runCmd, [], opts)
            installProcess.stdout.on('data', (data) => {
              logger.debug(`NSChild: ${name} Install : ${data}`)
            })
            installProcess.on('close', (code) => {
              logger.debug(`NSChild: ${name} install process exited with cause code: ${code}`)
            })
            installProcess.on('error', (err) => {
              logger.debug(`NSChild: ${name} install process error: ${err}`)
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
                logger.error(`NSChild: Error ${data}`)
              })
              this.nodeProcesses[ns.profileNum].stdout.on('data', (data) => {
                if (! data ) return
        				try {
                  this.nodeProcesses[ns.profileNum].stdin.write(init + '\n')
                  // Don't use STDIN/STDOUT pass settings to STDOUT and require MQTT from here.
        					// data = JSON.parse(data.toString())
        				} catch (e) {
        					// logger.error('STDIN: Badly formatted JSON input received. ' + e)
        					return
        				}
              })
              setTimeout(() => {
                if (this.nodeProcesses[ns.profileNum])
                {
                  this.nodeProcesses[ns.profileNum].stdin.write(init + '\n')
                }

              }, 200)

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
