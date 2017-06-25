const mongoose = require('mongoose')
const config = require('../config/config')
const SettingsModel = require('../models/settings')
const NodeServerModel = require('../models/nodeserver')
const UserModel = require('../models/user')
const isy = require('../modules/isy')
const bcrypt = require('bcryptjs')
const logger = require('./logger')
const mqtt = require('./mqtt')

mongoose.Promise = global.Promise

module.exports = {
	Server: null,

	startService(callback) {
		if (process.env.MONGO_URI === undefined) {
			logger.error('Could not find DB URI...')
			if (callback) return callback('shutdown')
		}
		if (!this.Server) {
			// Connect to database
			opts = {
				server: {
					reconnectTries: Number.MAX_VALUE,
					reconnectInterval: 5000
				}
			}
			this.Server = mongoose.connect(process.env.MONGO_URI, opts)
				// On Connection
				this.Server.connection.on('connected', () => {
					logger.info('MongoDB: Connected')
					config.dbConnected = true
					isy.getVersion()
					/* SettingsModel.getSettings((err, data) => {
							logger.debug('MongoDB: Config received from database')
							config.settings = data
							isy.getVersion(() => {
								config.settings.save()
							})
						}) */
						NodeServerModel.loadNodeServers(()=> {
							if (callback) { return callback()}
						})
					})

				this.Server.connection.on('disconnected', () => {
					config.dbConnected = false
					logger.error('MongoDB: Disconnected from database. Retrying every 5 seconds.')
				})

				// On Error
				this.Server.connection.on('error', (err) => {
					logger.error('MongoDB: ' + err)
					config.dbConnected = false
					this.Server.disconnect()
				})
		}
	},

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
