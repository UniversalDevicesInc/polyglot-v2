const mongoose = require('mongoose')

const logger = require('./logger')
const config = require('../config/config')

mongoose.Promise = global.Promise

/**
 * Database Module
 * @module modules/db
 * @version 2.0
 */
module.exports = {
  /**
   * MongoDB Start Service and Connect via .env MONGO_URI provided.
   * @method
   * @param {startCallback} callback - Callback when connected and all NodeServers were retrieved.
   */
  async startService() {
    if (!config.dbConnected) {
      // Connect to database
      opts = {
        useMongoClient: true,
        reconnectTries: Number.MAX_VALUE,
        reconnectInterval: 5000,
        promiseLibrary: global.Promise
      }
      var mongoURI
      if (process.env.USEDOCKER) {
        mongoURI = 'mongodb://mongo:27017/'
      } else {
        mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/'
      }
        config.dbServer = await mongoose.connect(mongoURI + 'polyglot', opts)
        config.dbConnected = true

        // On Connection
        mongoose.connection.on('connected', () => {
          logger.info('MongoDB: Connected')

        })

        mongoose.connection.on('disconnected', () => {
          config.dbConnected = false
          logger.debug('MongoDB: Disconnected from database.')
        })

        // On Error
        mongoose.connection.on('error', (err) => {
          logger.error('MongoDB: ' + err)
          config.dbConnected = false
          config.dbServer.disconnect()
        })
    }
  },

  /**
   * MongoDB Stop Service run on program shutdown.
   * @method
   * @param {stopCallback} callback - Callback when shutdown or error.
   */
  async stopService() {
    if (config.dbConnected) {
      await mongoose.disconnect()
    }
  },
}

/**
@callback startCallback
@param {string} error - An Error if encountered
@param {Object} documents - Documents returned if sucessfully connected and retrieved existing NodeServer documents.
*/

/**
@callback stopCallback
@param {string} error - An Error if encountered
*/
