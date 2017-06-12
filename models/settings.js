/*
const mongoose = require('mongoose')
const encrypt = require('../modules/encryption')
const logger = require('../modules/logger')
const config = require('../config/config')
const mqtt = require('../modules/mqtt')

// Node Schema
const SettingsSchema = mongoose.Schema({
	name: {
		type: String,
		default: 'polyglot'
	},
	'isyusername': {
		type: String,
		default: 'admin'
	},
  'isypassword': {
    type: String,
    default: null
  },
  'isyport': {
    type: Number,
    default: 80
  },
  'isyaddress': {
    type: String,
    default: null
  },
  'isyhttps': {
    type: Boolean,
    default: false
  },
  'isyversion': {
    type: String,
    default: '0.0.0'
  },
  'mqttaddress': {
    type: String,
    default: '127.0.0.1'
  },
  'mqttport': {
    type: Number,
    default: 1883
  },
	'mqttwsport': {
    type: Number,
    default: 8083
  }
})

SettingsSchema.statics = {
	sendUpdate ()  {
		let cleanSettings = JSON.parse(JSON.stringify(config.settings))
		cleanSettings.isypassword = undefined
		cleanSettings._id = undefined
		cleanSettings.name = undefined
		mqtt.publish('udi/polyglot/frontend/settings', {node: 'polyglot', settings: cleanSettings}, {retain: true})
	},

	updateSettings (newSettings, callback){
		settings = JSON.parse(JSON.stringify(newSettings.updatesettings))
		if (settings.name) {delete settings.name}
		if (settings._id) {delete settings._id}
		if (settings.isypassword) { settings.isypassword = encrypt.encryptText(settings.isypassword) }
		const query = {name: 'polyglot'}
		const options = {new: true, upsert: true}
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
				mqtt.publish('udi/polyglot/frontend/settings', response)
			}
			this.sendUpdate()
			if (callback) callback(err, doc)
		})
	},

	getSettings (callback){
		const query = {name: 'polyglot'}
		return SettingsModel.findOne(query, callback)
	},

	resetToDefault (callback){
		const newSettings = new SettingsModel()
		const query = {name: 'polyglot'}
		const options = {overwrite: true, new: true, upsert: true}
		var upsertData = newSettings.toObject()
		delete upsertData._id
		SettingsModel.findOneAndUpdate(query, upsertData, options, callback)
	}

}

SettingsModel = mongoose.model('Setting', SettingsSchema)
module.exports = SettingsModel
*/
