const logger = require('../modules/logger')
const config = require('../config/config')
const SettingsModel = require('../models/settings')
const NodeServerModel = require('../models/nodeserver')
const db = require('../modules/db')
const mqttc = require('../modules/mqttc')
const mqtts = require('../modules/mqtts')
const web = require('../modules/web')
const child = require('../modules/children')
const async = require('async')
const fs = require('fs')
const path = require('path')

/**
 * Generic Helpers Module that has a couple of various methods that didn't fit elsewhere.
 * @module modules/helpers
 * @version 2.0
 */

module.exports = {

  /**
  * resyncNodesToISY wraps a couple of database/ISY checks to make sure the ISY and Local MongoDB are in sync.
  * @param {function} callback - Simple callback function that returns on error or when function is complete.
  */
  async resyncNodesToISY(callback=null) {
    logger.info(`ReSyncing NodeServers with ISY...`)
    async.each(config.nodeServers, async (nodeServer, callback) => {
      if (!nodeServer) { return callback() }
      await nodeServer.getNodesFromISY()
      if (callback) return callback()
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
  async restartServices() {
    await mqttc.stopService()
    await mqtts.stopService()
    await this.wait(1000)
    await mqtts.startService()
    await mqttc.startService()
    this.resyncNodesToISY()
  },

  /*
  * shutdown is the program stop function to terminate the application gracefully.
  */
  async shutdown() {
    await this.killChildren()
    await this.saveNodeServers()
    await mqttc.stopService()
    await mqtts.stopService()
    await require('../modules/db').stopService()
    process.exit(0)
  },


  /*
  * saveNodeServers will cycle through all the NodeServers and save the current state to MongoDB. This occurrs automatically before shutdown.
  */
  async saveNodeServers() {
    await Promise.all(config.nodeServers.map((ns) => {
      logger.debug(`Saving NodeServer ${ns.name} to database.`)
      ns.save()
    }))
  },

  async killChildren() {
    for (let i = 0; i < config.nodeServers.length; i++) {
      if (config.nodeServers[i]) {
        await config.nodeServers[i].stop()
      }
    }
  /*  let promises = config.nodeServers.map((ns) => ns.stop())
    await Promise.all(promises)*/

    logger.debug(`All NodeServers stopped.`)
  },

  /*
  * Sweet little function wrapper I found to allow me to push
  * functions into arrays for easy reacall with params.
  */
  wrapFunction(fn, context, params) {
    return function() {
      fn.apply(context, params);
    }
  },

  /*
  * Async/Await pause method
  */
  async wait (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /*
  * Return directories in a given path, includes symlinks
  */
 dirs(p) {
   return fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory())
 },

}
