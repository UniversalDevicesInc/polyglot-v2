const mongoose = require('mongoose')
const encrypt = require('../modules/encryption')
const bcrypt = require('bcryptjs')
const logger = require('../modules/logger')
const config = require('../config/config')
const mqttc = require('../modules/mqttc')
const ip = require('ip')

// Node Schema
const SettingsSchema = mongoose.Schema({
	name: {
		type: String,
		default: 'polyglot'
	},
	'isyUsername': {
		type: String,
		default: process.env.ISY_USERNAME || 'admin'
	},
  'isyPassword': {
    type: String,
    default: encrypt.encryptText(process.env.ISY_PASSWORD) || encrypt.encryptText('admin')
  },
  'isyPort': {
    type: Number,
    default: process.env.ISY_PORT || 80
  },
  'isyHost': {
    type: String,
    default: process.env.ISY_HOST || '192.168.1.10'
  },
  'isyHttps': {
    type: Boolean,
    default: process.env.ISY_HTTPS || false
  },
  'isyVersion': {
    type: String,
    default: '0.0.0'
  },
  'mqttHost': {
    type: String,
    default: process.env.MQTT_HOST || '127.0.0.1'
  },
  'mqttPort': {
    type: Number,
    default: process.env.MQTT_PORT || 1883
  },
	'mqttWSPort': {
    type: Number,
    default: process.env.MQTT_WSPORT || 8083
  },
	'secret': {
		type: String,
		default: process.env.SECRET || 'udi-polyglot'
	},
	'ipAddress': {
		type: String,
		default: process.env.HOST_IP || ip.address()
	},
	'listenPort': {
    type: Number,
    default: process.env.HOST_PORT || 80
  }

})

SettingsSchema.statics = {
	sendUpdate ()  {
		cleanSettings = SettingsModel.cleanSettings()
		mqttc.publish('udi/polyglot/frontend/settings', {node: 'polyglot', settings: cleanSettings}, {retain: true})
	},

	updateSettings (newSettings, callback) {
		if (newSettings.hasOwnProperty('updateprofile')) {
			let query = { _id: newSettings.updateprofile._id }
			const options = { new: false, upsert: true }
			if (newSettings.updateprofile.hasOwnProperty('password')) {
				var newPass
				bcrypt.genSalt(2, (err, salt) => {
					bcrypt.hash(newSettings.updateprofile.password, salt, (err, hash) => {
						if(err) throw err
						newSettings.updateprofile.password = hash
						UserModel.findOneAndUpdate(query, newSettings.updateprofile, options, (err, doc) => {
							logger.info('Successfully updated profile for User: ' + doc.username)
						})
					})
				})
			} else {
				UserModel.findOneAndUpdate(query, newSettings.updateprofile, options, (err, doc) => {
					logger.info('Successfully updated profile for User: ' + doc.username)
				})
			}
		} else {
			settings = JSON.parse(JSON.stringify(newSettings.updatesettings))
			if (settings.name) { delete settings.name }
			if (settings._id) { delete settings._id }
			if (settings.isypassword) { settings.isypassword = encrypt.encryptText(settings.isypassword) }
			const query = { name: 'polyglot' }
			const options = { new: true, upsert: true }
			SettingsModel.findOneAndUpdate(query, settings, options, (err, doc) => {
				logger.info('Settings Saved Successfully.')
				config.settings = doc
				if (newSettings.hasOwnProperty('seq')) {
					let response = {
						node: 'polyglot',
						seq: newSettings.seq,
						response: {
							success: err ? false : true,
							msg: err ? err : ''
						}
					}
					mqttc.publish('udi/polyglot/frontend/settings', response)
				}
				this.sendUpdate()
				if (callback) callback(err, doc)
			})
		}
	},

	getSettings (callback) {
		const query = {name: 'polyglot'}
		return SettingsModel.findOne(query, callback)
	},

	resetToDefault (callback) {
		const newSettings = new SettingsModel()
		const query = { name: 'polyglot' }
		const options = { overwrite: true, new: true, upsert: true }
		var upsertData = newSettings.toObject()
		delete upsertData._id
		SettingsModel.findOneAndUpdate(query, upsertData, options, callback)
	},

	loadSettings(callback) {
		SettingsModel.getSettings((err, dbsettings) => {
			if (dbsettings) {
				config.settings = dbsettings
				logger.info('Settings: Retrieved config from database')
				SettingsModel.parseEnvUpdate(() => {
					if (callback) { callback() }
				})

			} else {
				logger.info('Settings: No config found in database, creating settings entries.')
				SettingsModel.resetToDefault(() => {
					SettingsModel.loadSettings(callback)
				})
			}

		})
	},

	cleanSettings() {
		// hack to deepcopy in node
		let cleanSettings = JSON.parse(JSON.stringify(config.settings))
		delete cleanSettings.isyPassword
		delete cleanSettings._id
		delete cleanSettings.name
		delete cleanSettings.secret
		return cleanSettings
	},

	parseEnvUpdate(callback) {
		try {
			let settings = config.dotenv.parsed
			if (settings.HOST_IP) { config.settings.ipAddress = settings.HOST_IP } else { config.settings.ipAddress = ip.address() }
			if (settings.HOST_PORT) { config.settings.listenPort = settings.HOST_PORT }
			if (settings.ISY_USERNAME) { config.settings.isyUsername = settings.ISY_USERNAME }
			if (settings.ISY_PASSWORD) { config.settings.isyPassword = encrypt.encryptText(settings.ISY_PASSWORD) }
			if (settings.ISY_HOST) { config.settings.isyHost = settings.ISY_HOST }
			if (settings.ISY_PORT) { config.settings.isyPort = settings.ISY_PORT }
			if (settings.ISY_HTTPS) { config.settings.isyHttps = settings.ISY_HTTPS }
			if (settings.MQTT_HOST) { config.settings.mqttHost = settings.MQTT_HOST }
			if (settings.MQTT_PORT) { config.settings.mqttPort = settings.MQTT_PORT }
			if (settings.MQTT_WSPORT) { config.settings.mqttWSPort = settings.MQTT_WSPORT }
			if (settings.SECRET) { config.settings.secret = settings.SECRET }
			logger.info('Settings: Retrieved config overrides from .env and updated database')
		} catch (e) {
			logger.error('Settings: ParseEnv Error ' + e)
		}

		config.settings.save()
		if (callback) { callback() }
	}

}

SettingsModel = mongoose.model('Setting', SettingsSchema)
module.exports = SettingsModel
