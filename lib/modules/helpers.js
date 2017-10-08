const logger = require('../modules/logger')
const config = require('../config/config')
const SettingsModel = require('../models/settings')
const NodeServerModel = require('../models/nodeserver')
const db = require('../modules/db')
const mqttc = require('../modules/mqttc')
const mqtts = require('../modules/mqtts')
const web = require('../modules/web')
const async = require('async')

/**
 * Generic Helpers Module that has a couple of various methods that didn't fit elsewhere.
 * @module modules/helpers
 * @version 2.0
 */

module.exports = {
  /*
  checkServices() {
    if (!mqtt.Client) {
      mqtt.startService(() => {
          this.resyncNodesToISY()
      })
    } else {
      mqtt.stopService()
    }
  }, */

  /**
   * resyncNodesToISY wraps a couple of database/ISY checks to make sure the ISY and Local MongoDB are in sync.
   * @param {function} callback - Simple callback function that returns on error or when function is complete.
   */
  resyncNodesToISY(callback=null) {
    logger.info(`ReSyncing NodeServers with ISY...`)
    async.each(config.nodeServers, (nodeServer, callback) => {
      if (!nodeServer) { return callback() }
      nodeServer.getNodesFromISY(() => {
        if (callback) return callback()
      })
    }, (err) => {
      if (err) {
        logger.error(`ReSync NodeServers ERROR: ${err}`)
        if (callback) return callback(err)
      } else {
        SettingsModel.sendUpdate()
        NodeServerModel.sendUpdate()
        if (callback) return callback()
      }
    })
  },

  /**
   * restartServices is an external function to stop then restart the MQTT service and re-initiate a NodeServer Resync
   */
  restartServices() {
    mqttc.stopService(() => {
      mqtts.stopService(() => {
        setTimeout(() => {
          mqtts.startService(() => {
            mqttc.startService(() => {
              this.resyncNodesToISY()
            })
          })
        },1000)
      })
    })
  },

  /**
   * shutdown is the program stop function to terminate the application gracefully.
   */
  shutdown() {
    async.series([
      this.saveNodeServers(),
      //web.stopService(),
      mqttc.stopService(),
      mqtts.stopService(),
      db.stopService(),
      process.exit(0)
    ])
  },

  /**
   * saveNodeServers will cycle through all the NodeServers and save the current state to MongoDB. This occurrs automatically before shutdown.
   */
  saveNodeServers(callback) {
    config.nodeServers.forEach((nodeServer) => {
      logger.debug(`Saving NodeServer ${nodeServer.name} to database.`)
      nodeServer.save()
      if (callback) { return callback() }
    })
  }
}
