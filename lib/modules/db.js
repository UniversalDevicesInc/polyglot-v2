const mongoose = require('mongoose')
const config = require('../config/config')
const SettingsModel = require('../models/settings')
const UserModel = require('../models/user')
const isy = require('../modules/isy')
const logger = require('./logger')

mongoose.Promise = global.Promise

/**
 * Database Module
 * @module modules/db
 * @version 2.0
 */
module.exports = {
	/** MongoDB Connection var */
	Server: null,

  /**
	 * MongoDB Start Service and Connect via .env MONGO_URI provided.
	 * @method
	 * @param {startCallback} callback - Callback when connected and all NodeServers were retrieved.
	 */
	startService(callback) {
		if (!this.Server) {
			// Connect to database
			opts = {
				useMongoClient: true,
				reconnectTries: Number.MAX_VALUE,
				reconnectInterval: 5000,
				promiseLibrary: global.Promise
			}
			var mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/'
			this.Server = mongoose.connect(mongoURI + 'polyglot', opts)
				// On Connection
				mongoose.connection.on('connected', () => {
					logger.info('MongoDB: Connected')
					config.dbConnected = true
					UserModel.verifyDefaultUser()
					SettingsModel.loadSettings(() => {
						isy.getVersion()
						if (callback) { return callback()}
					})
				})

				mongoose.connection.on('disconnected', () => {
					config.dbConnected = false
					logger.error('MongoDB: Disconnected from database. Retrying every 5 seconds.')
				})

				// On Error
				mongoose.connection.on('error', (err) => {
					logger.error('MongoDB: ' + err)
					config.dbConnected = false
					this.Server.disconnect()
				})
		}
	},

	/**
	 * MongoDB Stop Service run on program shutdown.
	 * @method
	 * @param {stopCallback} callback - Callback when shutdown or error.
	 */
	stopService(callback) {
		if (this.Server) {
			this.Server.disconnect((err) => {
				this.Server = null
				logger.info('MongoDB: Disconnected')
				if(callback) { callback() }
			})
		} else {
			if(callback) { callback() }
		}
	}
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
