const mongoose = require('mongoose')
var Settings = mongoose.model('Settings')
var User = mongoose.model('User')

const logger = require('../modules/logger')
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
  async start() {
    if (!config.dbConnected) {
      // Connect to database
      opts = {
        // useMongoClient: true, # Removed in 5.x
        useUnifiedTopology: true,
        useFindAndModify: false,
        useNewUrlParser: true,
        reconnectTries: Number.MAX_VALUE,
        reconnectInterval: 1000,
        promiseLibrary: global.Promise,
        poolSize: 20
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
  async stop() {
    if (config.dbConnected) {
      await mongoose.disconnect()
    }
  },
}
