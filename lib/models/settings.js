const mongoose = require('mongoose') //.set('debug', true)
const encrypt = require('../modules/encryption')
const bcrypt = require('bcryptjs')
const logger = require('../modules/logger')
const config = require('../config/config')
const mqttc = require('../modules/mqttc')
const findisy = require('../modules/findisy')
const isy = require('../modules/isy')
const ns = require('./nodeserver')
const ip = require('ip')
const fs = require('fs')
const os = require('os')

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
    default: encrypt.encryptText('admin')
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
	'pgVersion': {
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
	'secret': {
		type: String,
		default: process.env.SECRET || encrypt.randomString(25)
	},
	'ipAddress': {
		type: String,
		default: process.env.HOST_IP || ip.address()
	},
	'isyConnected': {
		type: Boolean,
		default: false
	},
	'isyFound': {
		type: Boolean,
		default: false
	},
	'listenPort': {
    type: Number,
    default: process.env.HOST_PORT || 3000
  },
	'useHttps': {
		type: Boolean,
		default: process.env.USEHTTPS || true
	},
	'sslData': {
		type: Object,
		default: {}
	}
})

SettingsSchema.statics = {
	sendUpdate ()  {
		cleanSettings = SettingsModel.cleanSettings()
		mqttc.publish('udi/polyglot/frontend/settings', {node: 'polyglot', settings: cleanSettings}, {retain: true})
	},

	updateSettings (newSettings, callback) {
		if (newSettings.hasOwnProperty('updateprofile')) {
			const options = { new: true, upsert: true }
			const query = {_id: new mongoose.Types.ObjectId(newSettings.updateprofile._id)}
			delete newSettings.updateprofile._id
			if (newSettings.updateprofile.hasOwnProperty('password')) {
				var newPass
				bcrypt.genSalt(2, (err, salt) => {
					bcrypt.hash(newSettings.updateprofile.password, salt, (err, hash) => {
						if(err) throw err
						newSettings.updateprofile.password = hash
						UserModel.findOneAndUpdate(query, newSettings.updateprofile, options, (err, doc) => {
							if (err) { return logger.error('Failed to update profile: ' + err)}
							logger.info('Successfully updated profile for User: ' + doc.username)
						})
					})
				})
			} else {
				UserModel.findByIdAndUpdate(new mongoose.Types.ObjectId(newSettings.updateprofile._id), newSettings.updateprofile, options, (err, doc) => {
					logger.info('Successfully updated profile for User: ' + doc.username)
				})
			}
		} else {
			settings = JSON.parse(JSON.stringify(newSettings.updatesettings))
			if (settings.name) { delete settings.name }
			if (settings._id) { delete settings._id }
			if (settings.isyPassword) {
				settings.isyPassword = encrypt.encryptText(settings.isyPassword)
			}
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
					isy.getVersion((error) => {
						if (! error ) {
							this.sendUpdate()
							NodeServerModel.verifyNonManagedNodeServers()
						}
					})
				}
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
		logger.info(`Auto Discovering ISY on local network.....`)
		findisy.find((isyFound, isyAddress, isyPort) => {
			newSettings.isyHost = isyAddress
			newSettings.isyPort = isyPort
			newSettings.isyFound = true
			logger.info(`${(isyFound ? 'ISY discovered at address' : 'No ISY responded on local network. Using default config of')}: ${isyAddress}:${isyPort}`)
			const query = { name: 'polyglot' }
			const options = { overwrite: true, new: true, upsert: true }
			var upsertData = newSettings.toObject()
			delete upsertData._id
			SettingsModel.findOneAndUpdate(query, upsertData, options, callback)
		})
	},

	loadSettings(callback) {
		SettingsModel.getSettings((err, dbsettings) => {
			if (dbsettings) {
				config.settings = dbsettings
				config.settings.pgVersion = require('../../package.json').version
				logger.info('Settings: Polyglot Version ' + config.settings.pgVersion)
				logger.info('Settings: Retrieved config from database')
				SettingsModel.parseEnvUpdate(() => {
					if (config.settings.useHttps === true) {
						this.getSSLData((err) => {
							if (err) {
								logger.error('Failed to get SSL Key or Cert. Falling back to HTTP')
								config.settings.useHttps = false
							}
							if (callback) { callback() }
						})
					} else {
						if (callback) { callback() }
					}
				})
			} else {
				logger.info('Settings: No config found in database, creating settings entries.')
				SettingsModel.resetToDefault(() => {
					SettingsModel.loadSettings(callback)
				})
			}
		})
	},

	getSSLData(callback) {
		const sslDir = os.homedir() + '/.polyglot/ssl/'
		process.umask(0o177)
		if (Object.keys(config.settings.sslData).length !== 0 && config.settings.sslData.constructor === Object) {
			logger.debug('TLS: Found Keys and Certificate data in database. Exporting to ' + sslDir.toString())
			fs.writeFileSync(sslDir + 'polyglot_private.key', config.settings.sslData.private)
			fs.writeFileSync(sslDir + 'polyglot_public.key', config.settings.sslData.public)
			fs.writeFileSync(sslDir + 'polyglot.crt', config.settings.sslData.cert)
			fs.writeFileSync(sslDir + 'client_private.key', config.settings.sslData.clientprivate)
			fs.writeFileSync(sslDir + 'client_public.key', config.settings.sslData.clientpublic)
			fs.writeFileSync(sslDir + 'client.crt', config.settings.sslData.clientcert)
		} else {
			logger.info('SSL: No HTTPS Certificate or Key found. Generating...')
			var selfsigned = require('selfsigned')
			var attrs = [
				{ name: 'commonName', value: os.hostname()},
				{ name: 'countryName', value: 'US'},
				{ shortName: 'ST', value: 'California'},
				{ name: 'localityName', value: 'Los Angeles'},
				{ name: 'organizationName', value: 'Universal Devices'},
				{ shortName: 'OU', value: 'polyglot'}
			]
			var opts = {
				keySize: 2048,
				algorithm: 'sha256',
				days: 365 * 10,
				clientCertificate: true,
				clientCertificateCN: 'polyglot_client'
			}
			opts.extensions = [{
				name: 'subjectAltName',
				altNames: [{
					type: 2,
					value: os.hostname()
				}, {
					type: 2,
					value: 'polyglot.local'
				}, {
					type: 2,
					value: 'raspberrypi.local'
				}, {
					type: 2,
					value: 'polyglot'
				}, {
					type: 7,
					value: ip.toBuffer(config.settings.ipAddress)
				}, {
					type: 7,
					value: ip.toBuffer('127.0.0.1')
				}]
			}]
			var pems = selfsigned.generate(attrs, opts)
			config.settings.sslData = pems
			fs.writeFileSync(sslDir + 'polyglot_private.key', pems.private)
			fs.writeFileSync(sslDir + 'polyglot_public.key', pems.public)
			fs.writeFileSync(sslDir + 'polyglot.crt', pems.cert)
			fs.writeFileSync(sslDir + 'client_private.key', pems.clientprivate)
			fs.writeFileSync(sslDir + 'client_public.key', pems.clientpublic)
			fs.writeFileSync(sslDir + 'client.crt', pems.clientcert)
			logger.info('SSL: Certificate Generation completed successfully.')
			config.settings.save()
		}
		process.umask(0o022)
		if (callback) { callback() }
	},

	cleanSettings() {
		// hack to deepcopy in node
		let cleanSettings = JSON.parse(JSON.stringify(config.settings))
		delete cleanSettings.isyPassword
		delete cleanSettings._id
		delete cleanSettings.name
		delete cleanSettings.sslData
		return cleanSettings
	},

	parseEnvUpdate(callback) {
		try {
			let settings = config.dotenv.parsed || {}
			if (settings.hasOwnProperty('HOST_IP')) { config.settings.ipAddress = settings.HOST_IP } else { config.settings.ipAddress = ip.address() }
			if (settings.hasOwnProperty('HOST_PORT')) { config.settings.listenPort = settings.HOST_PORT }
			if (settings.hasOwnProperty('ISY_USERNAME')) { config.settings.isyUsername = settings.ISY_USERNAME }
			if (settings.hasOwnProperty('ISY_PASSWORD')) { config.settings.isyPassword = encrypt.encryptText(settings.ISY_PASSWORD) }
			if (settings.hasOwnProperty('ISY_HOST')) { config.settings.isyHost = settings.ISY_HOST }
			if (settings.hasOwnProperty('ISY_PORT')) { config.settings.isyPort = settings.ISY_PORT }
			if (settings.hasOwnProperty('ISY_HTTPS')) { config.settings.isyHttps = settings.ISY_HTTPS }
			if (settings.hasOwnProperty('MQTT_HOST')) { config.settings.mqttHost = settings.MQTT_HOST }
			if (settings.hasOwnProperty('MQTT_PORT')) { config.settings.mqttPort = settings.MQTT_PORT }
			if (settings.USEHTTPS) { config.settings.useHttps = settings.USEHTTPS }
			logger.info('Settings: Retrieved config overrides from .env and updated database')
		} catch (e) {
			logger.error('Settings: ParseEnv Error ' + e)
		}

		config.settings.save()
		if (callback) { callback() }
	},
}

SettingsModel = mongoose.model('Setting', SettingsSchema)
module.exports = SettingsModel
