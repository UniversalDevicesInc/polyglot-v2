const logger = require('../modules/logger')
const config = require('../config/config')
const SettingsModel = require('../models/settings')
const NodeServerModel = require('../models/nodeserver')
const db = require('../modules/db')
const mqtt = require('../modules/mqtt')
const web = require('../modules/web')
const async = require('async')


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

  restartServices() {
    mqtt.stopService(() => {
      setTimeout(() => {
        mqtt.startService(() => {
          this.resyncNodesToISY()
        })
      },1000)
    })
  },

  shutdown() {
    async.series([
      this.saveNodeServers(),
      //web.stopService(),
      mqtt.stopService(),
      db.stopService(),
      process.exit(0)
    ])
  },

  saveNodeServers(callback) {
    config.nodeServers.forEach((nodeServer) => {
      logger.debug(`Saving NodeServer ${nodeServer.name} to database.`)
      nodeServer.save()
      if (callback) { return callback() }
    })
  }
}
