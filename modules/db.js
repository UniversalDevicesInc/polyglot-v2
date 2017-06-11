const mongoose = require('mongoose')
const config = require('../config/config')
const SettingsModel = require('../models/settings')
const NodeServerModel = require('../models/nodeserver')
const UserModel = require('../models/user')
const isy = require('../modules/isy')
const bcrypt = require('bcryptjs');
const logger = require('./logger')
const mqtt = require('./mqtt')

mongoose.Promise = global.Promise,

module.exports = {
	Server: null,

	startService(callback) {
		if (!this.Server) {
			// Connect to database
			opts = {
				server: {
					reconnectTries: Number.MAX_VALUE,
					reconnectInterval: 5000
				}
			}
			this.Server = mongoose.connect(config.database, opts)
				// On Connection
				this.Server.connection.on('connected', () => {
					logger.info('MongoDB: Connected')
					config.dbConnected = true
					this.getSettings((err, data) => {
							logger.debug('MongoDB: Config received from database')
							config.settings = data
							isy.getVersion(() => {
								config.settings.save()
							})
							this.loadNodeServers(()=> {
								if (callback) { return callback()}
							})
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
	},

	getAllNodeServers(callback) {
		return NodeServerModel.find({}, null, {sort: {'profileNum': 1}}, callback)
	},

	getNodeByName(name, callback) {
		let query = {name: name}
		return NodeServerModel.findOne(query, callback)
	},

	getNodeByProfileNum(num, callback) {
		const query = {profileNum: num}
		return NodeServerModel.findOne(query, callback)
	},

	/*
	module.exports.getNodeByUrl = function(url, callback) {
		const query = {baseUrl: url}
		NodeServerModel.findOne(query, callback)
	} */

	addNodeServer(newNodeServer, callback) {
			//logger.debug(this)
			return NodeServerModel.save(callback)
	},

	updateNodeServer(nodeServer, callback) {
		if (nodeServer._id) {delete nodeServer._id}
		const query = {profileNum: nodeServer.profileNum}
		const options = {new: true}
		return NodeServerModel.findOneAndUpdate(query, nodeServer, options, callback)
	},

	loadNodeServers(callback) {
		this.getAllNodeServers((err, nodes) => {
			if(nodes) {
				nodes.forEach((nodeServer) => {
					if(config.nodeServers.filter((ns) => { return ns.profileNum === nodeServer.profileNum })) {
						logger.debug(`NodeServer ${nodeServer.name} [${nodeServer.profileNum}] added to running config.`)
						config.nodeServers[nodeServer.profileNum] = nodeServer
					}
				})
				logger.debug('MongoDB: NodeServers retrieved from database')
			} else {
				logger.debug('MongoDB: No NodeServers found in database')
			}
			if(callback) { return callback(err) }
		})
	},

	getSettings (callback){
		const query = {name: 'polyglot'}
		return SettingsModel.findOne(query, callback)
	},

	updateSettings (newSettings, callback){
		logger.debug(newSettings)
		if (newSettings.name) {delete newSettings.name}
		if (newSettings._id) {delete newSettings._id}
		if (newSettings.isypassword) { newSettings.isypassword = encrypt.encryptText(newSettings.isypassword) }
		const query = {name: 'polyglot'}
		const options = {new: true, upsert: true}
		return SettingsModel.findOneAndUpdate(query, newSettings, options, callback)
	},

	resetToDefault (newSettings, callback){
		const query = {name: 'polyglot'}
		const options = {overwrite: true, new: true, upsert: true}
		var upsertData = newSettings.toObject()
		delete upsertData._id
		SettingsModel.findOneAndUpdate(query, upsertData, options, callback)
	},

	getUserById (id, callback){
		UserModel.findById(id, callback);
	},

	getUserByUsername (username, callback){
		const query = {username: username}
		UserModel.findOne(query, callback);
	},

	addUser (newUser, callback){
		bcrypt.genSalt(10, (err, salt) => {
			bcrypt.hash(newUser.password, salt, (err, hash) => {
				if(err) throw err;
				newUser.password = hash;
				newUser.save(callback);
			});
		});
	},

	comparePassword (candidatePassword, hash, callback) {
		bcrypt.compare(candidatePassword, hash, (err, isMatch) => {
			if(err) throw err;
			callback(null, isMatch);
		});
	}


}
