const mongoose = require('mongoose')
const encrypt = require('../modules/encryption')
const logger = require('../modules/logger')
const config = require('../config/config')
const helpers = require('../modules/helpers')
const mqtt = require('../modules/mqttc')
const mqtts = require('../modules/mqtts')
const child = require('../modules/children')
const isy = require('../modules/isy')
const os = require('os')
const fs = require('fs-extra')
const path = require('path')
const async = require('async')
/**
 * NodeServer Model and Parent Class. AddNS uses 'new NodeServerModel' to reference the NodeServerSchema parent class to create a new MongoDB document via Mongoose
 * @module models/nodeserver
 * @version 2.0
 */

/**
 * MongoDB - Driver Child Schema
 * @class DriverSchema
 * @extends NodeSchema
 * @param {string} driver - Driver Name e.g. 'ST', 'RR', 'GV1', etc
 * @param {string} value - String representation of the value of the driver.
 * @param {number} uom - Integer of the UOM representing the value of the driver.
 */
const DriverSchema = mongoose.Schema({
		driver: {
			type: String,
			required: true
		},
		value: {
			type: String,
			default: null
		},
		uom: {
			type: Number,
			default: null
		}
}, { usePushEach: true })

/**
 * MongoDB - Nodes Child Schema
 * @class NodeSchema
 * @extends NodeServerModel
 * @param {string} address - Node address value e.g. 'lifxcontrol'
 * @param {boolean} added - Represents if the node is added and present in the ISY.
 * @param {boolean} enabled - Represents the enabled state of the node.
 * @param {string} name - Descriptive name of the node.
 * @param {string} node_def_id - Node Definition ID represented in the profile.zip for this node type.
 * @param {string} timeAdded - DateString in epoch of when the node was added to Polyglot
 * @param {string} primary - The node address of the nodes primary parent node. This could be itself in some cases.
 * @param {boolean} isprimary - Is this node a primary for other nodes.
 * @param {Object} drivers - Array of DriverSchema Objects
 */
const NodeSchema = mongoose.Schema({
		address: {
			type: String,
			required: true
		},
		added: {
			type: Boolean,
			default: false
		},
		enabled: {
			type: Boolean,
			default: true
		},
		name: {
			type: String,
			required: true
		},
		node_def_id: {
			type: String,
			default: null
		},
		timeAdded: {
			type: String,
			default: + new Date()
		},
		primary: {
			type: String,
			default: null
		},
		isprimary: {
			type: Boolean,
			default: false
		},
		drivers: [DriverSchema]
}, { usePushEach: true })

/**
 * MongoDB - NodeServer Parent Schema for creating a new NodeServer Database Object
 * @class NodeServerModel
 * @param {string} name - NodeServer name that is displayed in Polyglot. e.g. 'LiFX' or 'Nest'
 * @param {string} profileNum - ProfileNumber of the NodeServer. This must be a unique number
 between 1 - 10 that is not already defined in ISY.
 * @param {boolean} encryptPayload - Should we encrypt the payload using our .env secret? *[NOT IMPLEMENTED YET]*
 * @param {string} token - Encryption token taken from the .env file and saved to the DB *[NOT IMPLEMENTED YET]*
 * @param {string} timeAdded - DateString in epoch of when the NodeServer was added to Polyglot
 * @param {boolean} isConnected - Is Polyglot Connected to MQTT?
 * @param {string} logPrefix - Allows for custom logPrefixes to be defined per NodeServer if needed.
 * @param {Object} nodes - Array of NodeSchema Objects
 */
const NodeServerSchema = mongoose.Schema({
	name: {
		type: String,
		required: true
	},
	profileNum: {
		type: String,
		required: true,
		unique: true
	},
	encryptPayload: {
		type: Boolean,
		default: false
	},
	token: {
		type: String,
		default: encrypt.encryptText(encrypt.randomString(25))
	},
	isyPassword: {
		type: String,
		default: encrypt.randomAlphaOnlyString(10)
	},
	timeAdded: {
		type: String,
		default: + new Date()
	},
	isConnected: {
		type: Boolean,
		default: false
	},
	logPrefix: {
		type: String,
		default: null
	},
	customParams: {
		type: Object,
		default: {}
	},
	type: {
		type: String,
		default: 'local'
	},
	logFile: {
		type: String,
		default: 'logs/debug.log'
	},
	homeDir: {
		type: String,
		default: ''
	},
	serverType: {
		type: String,
		default: ''
	},
	executable: {
		type: String,
		default: ''
	},
	shortPoll: {
		type: Number,
		default: 10
	},
	longPoll: {
		type: Number,
		default: 30
	},
	nodes: [NodeSchema]
}, { usePushEach: true })

//NodeServerSchema.index({"nodes._id": 1}, { unique: true })
NodeServerSchema.index({profileNum: 1, "nodes.address": 1}, { unique: true, sparse: true })

NodeServerSchema.statics = {
	/**
	* Sends an update to the frontend topic on detection of a change in NodeServer properties or
	sub properties like driver updates or state changes.
	* @method
	* @alias NodeServerModel.sendUpdate
	* @memberof module:models/nodeserver
	* @returns {object} response - MQTT Message sent to the frontends. e.g.:
	{"nodeservers":[{"name":"LiFX","profileNum":"8","nodes":[{"address":"lifx_1234","name":"LIFX_Lamp","_id":"59338d1c2930bf7cc92842d1","drivers": [{"driver":"ST","_id":"59338624cd92117adb9349ca","uom":20,"value":"123.3"},{"driver":"GV5","_id":"59338624cd92117adb9349c9","uom":23,"value":"10"}], "isprimary":true,"primary":"lifx_1234","timeAdded":"1496550684087","node_def_id":"lifxcolor","enabled":true,"added":true},{"address":"lifx_1235", "name":"Z_Strip","_id":"59339445c67c877e13e4d941","drivers": [{"driver":"ST","_id":"59339445c67c877e13e4d943","uom":56,"value":"593.3"}, {"driver":"GV1","_id":"59339445c67c877e13e4d942","uom":20,"value":"10"}],"isprimary":false,"primary":"lifx_1234","timeAdded":"1496552508813", "node_def_id":"lifxcolor","enabled":true,"added":true}],"token":null,"encryptPayload":false,"timeAdded":"1496545371618","isConnected":true}]}
	*/
	sendUpdate()  {
		let ns = config.nodeServers.filter(ns => { if (ns) return ns } )
		mqtt.publish('udi/polyglot/frontend/nodeservers', {node: 'polyglot', nodeservers: ns}, {retain: true})
	},

	/**
	* Frontend called method to add a new NodeServer
	* @method
	* @alias NodeServerModel.addns
	* @memberof module:models/nodeserver
	* @param {string} name - Name of NodeServer being added
	* @param {number} profileNum - Profile Number of NodeServer being added
	* @param {addnsCallback} callback - Callback with response JSON
	* @returns {object} response -
	AddNS:
	{"addns":{"name":"Test123","profileNum":"10"},"seq":53407}
	Success:
	{"seq":53407,"response":{"success":true,"msg":"Installed into ISY sucessfully. Reboot the ISY and upload the profile.zip","nodeserver":{"name":"Test123","profileNum":"10"}}}
	Fail:
	{"seq":53408,"response":{"success":false,"msg":"NodeServer with that Profile Number already exists."}}
	*/
	addns(data, callback) {
		let nsData = {
			name: data.name,
			profileNum: data.profileNum,
			logPrefix: `${data.name}(${data.profileNum}):`,
			type: data.type,
		}
		if (data.type === 'local') {
			let nsDir = `${os.homedir()}/.polyglot/nodeservers/${data.path}/`
			nsData['homeDir'] = nsDir
			if (fs.existsSync(nsDir + 'server.json') && fs.existsSync(nsDir + 'profile.zip')) {
				logger.debug('NS: Add Nodeserver, found server.json and profile.zip... proceeding.')
				let server = require(nsDir + 'server.json')
				if (server.hasOwnProperty('shortPoll')) { nsData['shortPoll'] = server.shortPoll }
				if (server.hasOwnProperty('longPoll')) { nsData['longPoll'] = server.longPoll }
				if (server.hasOwnProperty('type')) { nsData['serverType'] = server.type }
				if (server.hasOwnProperty('executable')) { nsData['executable'] = server.executable }
			} else {
				if (callback) { return callback(`${data.name}(${data.profileNum}): local NodeServer server.json or profile.zip not found.`) } else return
			}
		}
		let newNodeServer = new NodeServerModel(nsData)
		const query = {profileNum: newNodeServer.profileNum}
		NodeServerModel.findOne(query, (err, node) => {
			if (err) { if (callback) { return callback(`${data.name}(${data.profileNum}): ${err}`) } else return }
			if (node) {
				if (callback) { return callback(`${data.name}(${data.profileNum}): NodeServer with that Profile Number already exists.`) } else return
			} else {
				newNodeServer.installNodeServer((err, message) => {
					if (err) {
						logger.error(`${newNodeServer.logPrefix} Unable to register ${newNodeServer.name} with ISY. Reason: ${err}`)
						newNodeServer.remove()
						if (callback) { return callback(`${data.name}(${data.profileNum}): ${err}`) } else return
					} else {
						newNodeServer.save((err, node) => {
							if (err) { if (callback) { return callback(`${data.name}(${data.profileNum}): ${err}`) } else return }
							if (!node) {
								if (callback) { return callback(`${data.name}(${data.profileNum}): Failed to save NodeServer to database.`) } else return
							} else {
								logger.info('Registered new ' + data.type + ' NodeServer: ' + node.name + '(' + node.profileNum + ')')
								config.nodeServers[node.profileNum] = newNodeServer
								NodeServerModel.sendUpdate()
								if (newNodeServer.type === 'local') {
									mqtt.addSubscription(node.profileNum)
									logger.info(`Waiting 90 seconds for the ISY to reboot before starting ${node.name} for the first time.`)
									config.installedNSTypes.push(node.name)
									setTimeout(() => {
										child.runChildNodeServer(node)
									}, 90000)
								}
								if (callback) return callback(null, message, {
									nodeserver: {
										name: node.name,
										profileNum: node.profileNum
									}
								})
							}
						})
					}
				})
			}
		})
	},

	/**
	* Parse incoming log request messages
	* @method
	* @alias NodeServerModel.parseLog
	* @memberof module:models/nodeserver
	* @param {Object} message - Incoming JSON parsed object from the frontend. Only commands accepted are 'addns' and 'delns' currently
	*/
	parseLog(message) {
		if (message.hasOwnProperty('node')) {
			if (message.hasOwnProperty('start')) {
				if (config.clientTails.hasOwnProperty(message.node)) {
					config.clientTails[message.node].unwatch()
					delete config.clientTails[message.node]
				}
				if (message.start === 'polyglot') {
					const logFile = os.homedir() + '/.polyglot/log/debug.log'
					this.readLogAndSend(message.node, 'polyglot', logFile)
					//var disconnectWrapper = helpers.wrapFunction(this.removeLog, this, [message.node, config.clientTails[message.node]])
					//mqtts.clientDisconnectCallbacks[message.node].push(disconnectWrapper)
				} else if ((config.nodeServers[message.start]) && config.nodeServers[message.start].profileNum === message.start) {
					if (config.nodeServers[message.start].type === 'local') {
						const logFile = config.nodeServers[message.start].homeDir + 'logs/debug.log'
						this.readLogAndSend(message.node, config.nodeServers[message.start].name, logFile)
					}
				}
			} else if (message.hasOwnProperty('stop')) {
				logger.debug('NS: Stopping log dump for client: ' + message.node)
				if (config.clientTails.hasOwnProperty(message.node)) {
					config.clientTails[message.node].unwatch()
				}
				delete config.clientTails[message.node]
			}
		} else {
			logger.error('NS: Received malformed log request.')
		}
	},

	/**
	* Read Log File and send to frontend client.
	* @method
	* @alias NodeServerModel.readLogAndSend
	* @memberof module:models/nodeserver
	* @param {String} node - Node Name of frontend client.
	* @param {String} name - Common Name of Node Server eg. LiFX
	* @param {String} logFile - Exact path to logfile
	*/
	readLogAndSend(node, name, logFile) {
		var topic = 'udi/polyglot/frontend/log/' + node
		logger.debug('NS: Starting log dump of ' + name + ' log file to frontend client: ' + node)
		//This works 1000 times faster to stream it than bulk read it first
		if (fs.existsSync(logFile)) {
			var rs = fs.createReadStream(logFile)
			rs.on('data', (chunk) => {
				var logPacket = {
					node: 'polyglot',
					log: chunk.toString('utf8')
				}
				mqtt.publish(topic, logPacket)
			})
			rs.on('end', () => {
				Tail = require('tail').Tail
				config.clientTails[node] = new Tail(logFile)
				config.clientTails[node].on('line', (data) => {
					var logPacket = {
						node: 'polyglot',
						log: data
					}
					mqtt.publish(topic, logPacket)
				})
			})
		}
	},

	/**
	* Read Log File and send to frontend client.
	* @method
	* @alias NodeServerModel.removeLog
	* @memberof module:models/nodeserver
	* @param {String} clientId - Client ID of frontend client.
	* @param {Object} tail - The tail instance of the logfile.
	*/
	removeLog(clientId, tail) {
		logger.debug('NS: Terminating log tail for frontend client: ' + clientId)
		tail.unwatch()
	},

	/**
	* Parse incoming Frontend messages
	* @method
	* @alias NodeServerModel.parseFrontend
	* @memberof module:models/nodeserver
	* @param {Object} message - Incoming JSON parsed object from the frontend. Only commands accepted are 'addns' and 'delns' currently
	*/
	parseFrontend(message) {
		if (message.hasOwnProperty('addns')) {
			if (message.addns.hasOwnProperty('name') && message.addns.hasOwnProperty('profileNum')) {
				NodeServerModel.addns(message.addns, (err, result, extra = {}) => {
					mqtt.nsResponse(message, err ? false : true, err ? err : result, extra)
					if (!err) NodeServerModel.sendUpdate()
				})
			} else { logger.error('MQTT: Received Add NodeServer command. name or profileNum was missing.') }
		} else if (message.hasOwnProperty('delns')) {
			if (message.delns.hasOwnProperty('profileNum')) {
				if (config.nodeServers[message.delns.profileNum]) {
					config.nodeServers[message.delns.profileNum].deleteNodeServer((err, result) => {
						mqtt.nsResponse(message, err ? false : true, err ? err : result)
						if (!err) NodeServerModel.sendUpdate()
					})
				} else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.delns.profileNum} does not exist.`) }
			} else { logger.error('MQTT: Received Delete NodeServer command. profileNum was missing.') }
		} else if (message.hasOwnProperty('customparams')) {
			if (message.customparams.hasOwnProperty('profileNum')) {
				if (config.nodeServers[message.customparams.profileNum]) {
					config.nodeServers[message.customparams.profileNum].customparams(message.customparams, 'customparams', (err, result) => {
						mqtt.nsResponse(message, err ? false : true, err ? err : result)
						if (!err) NodeServerModel.sendUpdate()
					})
				} else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.customparams.profileNum} does not exist.`)	}
			} else { logger.error('MQTT: Received CustomParams for NodeServer command. profileNum was missing.') }
	  } else if (message.hasOwnProperty('polls')) {
			if (message.polls.hasOwnProperty('profileNum')) {
				if (config.nodeServers[message.polls.profileNum]) {
					config.nodeServers[message.polls.profileNum].polls(message.polls, 'polls', (err, result) => {
						mqtt.nsResponse(message, err ? false : true, err ? err : result)
						if (!err) NodeServerModel.sendUpdate()
					})
				} else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.polls.profileNum} does not exist.`)	}
			} else { logger.error('MQTT: Received polls for NodeServer command. profileNum was missing.') }
	  } else if (message.hasOwnProperty('nodetypes')) {
				NodeServerModel.getInstalledNodeTypes()
		} else if (message.hasOwnProperty('installns')) {
			child.cloneRepo(message, (err, result) => {
				if (err) {
					return mqtt.nsResponse(message, false, err)
				} else {
					logger.info(`NS: Successfully cloned ${message.installns.name} into NodeServer directory.`)
					child.runInstallProcess(message.installns.name)
					NodeServerModel.getInstalledNodeTypes()
					return mqtt.nsResponse(message, true, result)
				}
			})
		} else if (message.hasOwnProperty('uninstallns')) {
			NodeServerModel.deleteNSFolder(message, (err, result) => {
				if (err) { return mqtt.nsResponse(message, false, err) }
				else { return mqtt.nsResponse(message, true, result) }
			})
		} else if (message.hasOwnProperty('updatens')) {
			child.pullRepo(message, (err, result) => {
				if (err) {
					return mqtt.nsResponse(message, false, err)
				} else {
					logger.info(`NS: Successfully updated ${message.updatens.name} via git.`)
					child.runInstallProcess(message.updatens.name)
					NodeServerModel.getInstalledNodeTypes()
					return mqtt.nsResponse(message, true, result)
				}
			})
		}
	},

	deleteNSFolder(message, callback) {
		let found = false
    config.nodeServers.forEach((ns) => {
      if (ns.name === message.uninstallns.name) {
				found = true
        return callback(`DeleteNS Folder: ${message.uninstallns.name} is still active. Please delete it from the Dashboard first before uninstalling it here.`)
      }
    })
		if (!found) {
			if (message.uninstallns.hasOwnProperty('name') && (!(message.uninstallns.name.includes('..')))) {
				let nsPath = `${os.homedir()}/.polyglot/nodeservers/${message.uninstallns.name}/`
				try {
					fs.removeSync(nsPath)
					NodeServerModel.getInstalledNodeTypes()
					return callback(null, `DeleteNS Folder: Successfully deleted ${message.uninstallns.name} folder.`)
				} catch (e) {
					return callback(`DeleteNS Folder: Error deleting ${message.uninstallns.name} folder: ${e.toString()}`)
				}
			} else {
				  return callback('DeleteNS Folder: name or url property not found in package')
			}
		}
	},

	getInstalledNodeTypes() {
		var nsDir = os.homedir() + '/.polyglot/nodeservers/'
		let nsTypes = {}
		nsTypes.notInUse = []
		nsTypes.installed = []
		if (fs.existsSync(nsDir)) {
			var nsDirs = fs.readdirSync(nsDir).filter(f => fs.statSync(path.join(nsDir, f)).isDirectory())
			nsDirs.forEach((nodeType) => {
				try {
					let server = require(nsDir + nodeType + '/server')
					if (server.hasOwnProperty('type') && server.hasOwnProperty('executable')) {
						nsTypes.installed.push(nodeType)
						if (!(config.installedNSTypes.includes(nodeType))) {
							server['_folder'] = nodeType
							nsTypes.notInUse.push(server)
						}
					}
				} catch (e) {
					logger.error('NS: Error getting server.json required fields. name and executable are required. - ' + e)
				}
			})
			let response = {
				node: 'polyglot',
				nodetypes: nsTypes
			}
			mqtt.publish('udi/polyglot/frontend/nodeservers', response)
		}
		return nsTypes
	},

	/**
	* Get all NodeServers from MongoDB
	* @method
	* @alias NodeServerModel.getAllNodeServers
	* @memberof module:models/nodeserver
	* @param {findArrayCallback} callback - Callback Passed into the Mongoose find method.
	* @returns {findArrayCallback}
	*/
	getAllNodeServers(callback) {
		return NodeServerModel.find({}, null, {sort: {'profileNum': 1}}, callback)
	},

	/**
	* Get NodeServer from MongoDB by Name
	* @method
	* @alias NodeServerModel.getNodeByName
	* @memberof module:models/nodeserver
	* @param {string} name - Name of Node requested from MongoDB
	* @param {findCallback} callback - Callback Passed into the Mongoose find method.
	* @returns {findCallback}
	*/
	getNodeByName(name, callback) {
		let query = {name: name}
		return NodeServerModel.findOne(query, callback)
	},

	/**
	* Get NodeServer from MongoDB by profileNum
	* @method
	* @alias NodeServerModel.getNodeByProfileNum
	* @memberof module:models/nodeserver
	* @param {number} number - profileNum of Node requested from MongoDB
	* @param {findCallback} callback - Callback Passed into the Mongoose find method.
	* @returns {findCallback}
	*/
	getNodeByProfileNum(num, callback) {
		const query = {profileNum: num}
		return NodeServerModel.findOne(query, callback)
	},

	/**
	* Load all NodeServers from MongoDB on Polyglot Start-up
	* @method
	* @alias NodeServerModel.loadNodeServers
	* @memberof module:models/nodeserver
	* @param {errOnlyCallback} callback - Callback returned when complete
	*/
	loadNodeServers(callback) {
		NodeServerModel.getAllNodeServers((err, nodes) => {
			if(nodes) {
				var i = 0
				nodes.forEach((ns) => {
					if ((ns.get('profileNum')) && (ns.get('name')) && (ns.get('type'))) {
						logger.debug(`NodeServer ${ns.name} [${ns.profileNum}] added to running config.`)
						config.nodeServers[ns.profileNum] = ns
						if (ns.type != 'unmanaged') {
							ns.getNodesFromISY()
						}
						if (ns.type === 'local') {
							config.installedNSTypes.push(ns.name)
							child.runChildNodeServer(ns)
						}
						i++
					}
				})
				logger.debug('MongoDB: ' + i + ' NodeServer(s) retrieved from database')
			} else {
				logger.debug('MongoDB: No NodeServers found in database')
			}
			NodeServerModel.sendUpdate()
			NodeServerModel.verifyNonManagedNodeServers()
			NodeServerModel.pollNonManagedServers()
			if (callback) { return callback(err) }
		})
	},

	/**
	* Check all the existing slots in the ISY for NodeServers.
	* @method
	* @alias NodeServerModel.checkExistingNodeServers
	* @memberof module:models/nodeserver
	* @param {Function} callback - Callback with an Object of NodeServers currently installed in ISY. { 1: 'LiFX', 5: 'Nest' }
	*/
	checkExistingNodeServers(callback) {
		let foundNS = {}
		isy.handleRequest('0', {api: 'profiles/ns/0/connection'}, 'restcall', true, (results) => {
			if (!results) { return callback(null, {}) }
			try {
				let i = 0
				if (results.isyresponse.hasOwnProperty('connections') && results.statusCode === 200) {
					if (Array.isArray(results.isyresponse.connections.connection)) {
						results.isyresponse.connections.connection.forEach((nodeServer) => {
							foundNS[nodeServer.profile] = nodeServer.name
							i++
						})
					} else {
						foundNS[results.isyresponse.connections.connection.profile] = results.isyresponse.connections.connection.name
						i++
					}
					config.nodeServers.forEach((nodeServer) => {
						if (nodeServer.type === 'unmanaged' ) {
							if (!(foundNS.hasOwnProperty(nodeServer.profileNum)))  {
								logger.info(`NS: ${nodeServer.name} Unmanaged NodeServer no longer found in the ISY. Removing from Polyglot`)
								nodeServer.remove((err) => {
									delete config.nodeServers[nodeServer.profileNum]
									NodeServerModel.sendUpdate()
								})
							}
						}
					})
					return callback(null, foundNS)
				} else {
					return callback(`ISY returned status code: ${results.statusCode}`)
				}
			} catch (e) { return callback(e.message) }
		})
	},

	/**
	* Check all the existing slots in the ISY for NodeServers and add or remove them from our running database on Polyglot.
	* @method
	* @alias NodeServerModel.verifyNonManagedNodeServers
	* @memberof module:models/nodeserver
	*/
	verifyNonManagedNodeServers() {
		if (!config.settings.isyConnected) { return }
		NodeServerModel.checkExistingNodeServers((err, isyNodeServers) => {
			if (err) { return logger.error(`vNMN: ${err}`) }
			Object.keys(isyNodeServers).forEach((key) => {
				const query = {profileNum: key}
				NodeServerModel.findOne(query, (err, node) => {
					if (!(node)) {
						let newNodeServer = new NodeServerModel({
							name: isyNodeServers[key],
							profileNum: key,
							logPrefix: `${isyNodeServers[key]}(${key}):`,
							type: 'unmanaged'
						})
						newNodeServer.save((err, node) => {
							if (err) { return logger.error(`nNS: ${err} ${node}`) }
							logger.info('NS: Registered new unmanaged NodeServer: ' + node.name + '(' + node.profileNum + ')')
							config.nodeServers[node.profileNum] = newNodeServer
							NodeServerModel.sendUpdate()
						})
					}
				})
			})
		})
	},

	/**
	* Started on Initial DB load on program init. This polls the NodeServer list on ISY every 60 seconds and syncs.
	* @method
	* @alias NodeServerModel.verifyNonManagedNodeServers
	* @memberof module:models/nodeserver
	*/
	pollNonManagedServers() {
		setInterval(NodeServerModel.verifyNonManagedNodeServers, 5 * 60000)
	}

}

NodeServerSchema.methods = {
	print () {
		return config.nodeServers[this.profileNum]
	},

	/**
	* Instance Method for NodeServer to return a JSON object of itself.
	* @function toJSON
	* @alias NodeServerModel.toJSON
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @returns {Object} nodeserver - Returns JSON parsed Object representation of the NodeServer
	*/
	toJSON() {
		let {name, profileNum, nodes, longPoll, shortPoll, executable, serverType, homeDir, token, timeAdded, isConnected, customParams, type, logDir} = this
		return JSON.parse(JSON.stringify({name, profileNum, nodes, longPoll, shortPoll, executable, serverType, homeDir, token, timeAdded, isConnected, customParams, type, logDir}))
	},

	/**
	* Instance Method for NodeServer to check input from MQTT and execute function if successful.
	* Valid Commands: ['status', 'addnode','removenode', 'restcall', 'request', 'config', 'connected', 'command']
	* @function checkCommand
	* @alias NodeServerModel.checkCommand
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	*/
	checkCommand(data){
		//if (this.isConnected) {
		let validCommands = ['status', 'addnode','removenode', 'restcall', 'request', 'config', 'connected', 'command', 'customparams', 'installprofile', 'stop', 'start', 'restart']
			for (var prop in data) {
				if (prop === 'node') { continue }
				if (validCommands.indexOf(prop) < 0) {
					logger.error(`${this.logPrefix} ${prop} not in valid commands list`)
					continue
				}
				logger.info(`${this.logPrefix} Processing command: ${prop}`)
				if (data.hasOwnProperty(prop)) {
					(this[prop] || this['notfound']).call(this, data[prop], prop)
				}
				else {
					logger.debug(`${this.logPrefix} Property not found in input: ${data}`)
				}
			}
		//} else {
		//	logger.error(`${this.logPrefix} is not connected. Make sure you send connected: true as the first message.`)
		//}
	},

	/**
	* Instance Method for NodeServer to handle 'status'
	* @function status
	* @alias NodeServerModel.status
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {object} data - JSON parsed from incoming command message e.g.
	{"address": "lifx_1234", "driver": "GV6", "value": 50.2, "uom": 20}
	* @param {string} command - The command received: 'status'
	* @returns {object} response -
	ONLY if an error occurs will a MQTT response message will be sent back to the NodeServer:
  {"result":{"isyresponse":"","statusCode":404,"seq":false,"elapsed":"9.735427ms","profileNum":"8","status":{"success":false,"reason":"lifx_1234 or GV18 does not exist","address":"lifx_1234"}}}
	*/
	status(data, command) {
		// Profile#, incoming json, command "status", full response text (t/f)
		isy.handleRequest(this.profileNum, data, command, false, (result) => {
			if (! result) { return }
			if (result.statusCode === 404) {
				let reason = `${data.address} or ${data.driver} does not exist`
				this.sendResult(command, result, false, reason, {address: data.address})
				logger.error(`${this.logPrefix} ${reason}`)
			} else if (result.statusCode === 200){
				let success = false
				let node = this.nodes.find(n => n.address === data.address)
				if (node) {
					let driver = node.drivers.find(d => d.driver === data.driver)
					if (driver) {
							driver.uom = data.uom
							driver.value = data.value
							success = true
							this.save(() => {
								let reason = `${data.address} ${data.driver} set sucessfully to ${data.value}`
								//this.sendResult(command, result, true, reason, {address: data.address})
								logger.info(`${this.logPrefix} ${reason}`)
								NodeServerModel.sendUpdate()
							})
					}
				}
				if (!success) {
					let reason = `${data.address} driver ${data.driver} does not exist in the Polyglot database.`
					this.sendResult(command, result, false, reason, {address: data.address})
					logger.error(`${this.logPrefix} ${reason}`)
				}
			}
		})
	},

	/**
	* Instance Method for NodeServer to handle 'command'
	* @function command
	* @alias NodeServerModel.command
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {object} data - JSON parsed from incoming message e.g.
	{"address": "lifx_1234", "command": "DON", "value": 50.2, "uom": 20}
	* @param {string} command - The command received: 'command'
	* @returns {object} response -
	Success: {"result":{"isyresponse":{"RestResponse":{"succeeded":"true","status":"200","reason":{"code":"0"}}},"statusCode":200,"seq":false,"elapsed":"19.073624ms","profileNum":"8","command":{"success":true,"reason":"lifx_1234 DON sent sucessfully with 50.2","address":"lifx_1234"}}}
	Fail: {"result":{"isyresponse":{"RestResponse":{"succeeded":"false","status":"400","reason":{"code":"2101"}}},"statusCode":400,"seq":false,"elapsed":"10.852264ms","profileNum":"8","command":{"success":false,"reason":"lifx_123 or asdf does not exist or is incorrect","address":"lifx_123"}}}
	*/
	command(data, command) {
		isy.handleRequest(this.profileNum, data, command, true, (result) => {
			if (! result ) { return }
			if (result.statusCode === 404 || result.statusCode === 400) {
				let reason = `${data.address} or ${data.command} does not exist or is incorrect`
				this.sendResult(command, result, false, reason, {address: data.address})
				logger.error(`${this.logPrefix} ${reason}`)
			} else if (result.statusCode === 200){
				let reason = `${data.address} ${data.command} sent sucessfully with ${data.value}`
				this.sendResult(command, result, true, reason, {address: data.address})
				logger.info(`${this.logPrefix} ${reason}`)
				NodeServerModel.sendUpdate()
			}
		})
	},

	/**
	* Instance Method for NodeServer to handle 'restcall'
	* @function restcall
	* @alias NodeServerModel.restcall
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {object} data - JSON parsed from incoming message e.g.
	{"api":"nodes/n001_d073d51327cc","seq":10068,"timeout":null}
	* @param {string} command - The command received: 'restcall'
	* @returns {object} response -
	Success: {"result":{"isyresponse":{"nodeInfo":{"node":{"flag":"0","nodeDefId":"lifxcolor","address":"n001_d073d51327cc","name":"LIFX Lamp","family":{"instance":"1","$t":"10"},"parent":{"type":"1","$t":"n001_lifxcontrol"},"type":"1.1.0.0","enabled":"true","deviceClass":"0","wattage":"0","dcPeriod":"0","startDelay":"0","endDelay":"0","pnode":"n001_lifxcontrol","ELK_ID":"A07"},"properties":{}}},"statusCode":200,"seq":10068,"elapsed":"29.861932ms","profileNum":"8","restcall":{"success":true,"reason":"nodes/n001_d073d51327cc executed sucessfully","api":"nodes/n001_d073d51327cc"}}}
	Fail: {"result":{"isyresponse":{"RestResponse":{"succeeded":"false","status":"404"}},"statusCode":404,"seq":10068,"elapsed":"15.433125ms","profileNum":"8","restcall":{"success":false,"reason":"ISY Returned 404 for nodes/n001_d073d51327c","api":"nodes/n001_d073d51327c"}}}
	*/
	restcall(data, command) {
		isy.handleRequest(this.profileNum, data, command, true, (result) => {
			if (! result ) { return }
			if (result.statusCode === 404) {
				let reason = `ISY Returned 404 for ${data.api}`
				this.sendResult(command, result, false, reason, {api: data.api})
				logger.error(`${this.logPrefix} ${reason}`)
			} else if (result.statusCode === 200){
				let reason = `${data.api} executed sucessfully`
				this.sendResult(command, result, true, reason, {api: data.api})
				logger.info(`${this.logPrefix} ${reason}`)
			}
		})
	},

	/**
	* Instance Method for NodeServer to handle 'addnode'
	* @function addnode
	* @alias NodeServerModel.addnode
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {object} data - JSON parsed from incoming message e.g.
	{"nodes": [{"address": "lifx_1236","name": "LIFX_Lamp2","node_def_id": "lifxcolor","primary": "lifx_1234","drivers": [{"driver": "ST","value": "123.3","uom": 20},{"driver": "GV5","value": "10","uom": 23}]}], "seq": 1000}
	* @param {string} command - The command received: 'addnode'
	* @returns {object} response -
	Success: {"result":{"isyresponse":"","statusCode":200,"seq":1000,"elapsed":"100.425214ms","profileNum":"8","addnode":{"success":true,"reason":"node lifx_1236 added successfully.","address":"lifx_1236"}}}
	Fail: {"result":{"isyresponse":"","statusCode":200,"seq":false,"elapsed":"25.251796ms","profileNum":"8","addnode":{"success":false,"reason":"lifx_1235 already exists on ISY","address":"lifx_1235"}}}
	*/
	addnode(data, command) {
		if (!Array.isArray(data.nodes)) return logger.error(`${this.logPrefix} - nodes must be an array.`)
		let primaryNodes = []
		for (i in data.nodes) {
			if (data.nodes[i].address === data.nodes[i].primary) {
				primaryNodes.push(data.nodes.splice(i, 1)[0])
			}
		}
		async.each(primaryNodes, (node, callback) => {
			this.doNodeAdd(node, command, data, (err) => {
				if (err) { callback(err) }
				else { callback() }
			})
		}, (err) => {
			if (err) {return logger.error(`${this.logPrefix} Error adding primary node: ${err}`)}
			async.each(data.nodes, (node, callback) => {
				this.doNodeAdd(node, command, data, (err) => {
					if (err) { callback(err) }
					else { callback()	}
				})
			}, (err) => {
				if (err) {
					logger.error(`${this.logPrefix}: ${err}`)
				}
				else {
					logger.info(`${this.logPrefix} completed adding node(s).`)
					NodeServerModel.sendUpdate()
					this.config()
				}
			})
		})
	},

	doNodeAdd(node, command, data, callback) {
			if (!Array.isArray(node.drivers)) {
				let reason = `${node.address} drivers must be an array.`
				this.sendResult(command, results, false, reason, {address: node.address})
				return callback(reason)
			}
      let newNode = {
        address: node.address,
        name: node.name,
        node_def_id: node.node_def_id,
        primary: node.primary,
        drivers: node.drivers,
				isprimary: false,
				added: false,
        seq: data.seq ? data.seq : false
      }
      let primaryFound = false
      if (node.address === node.primary) {
        newNode.isprimary = true
        primaryFound = true
      } else {
				for (i in this.nodes) {
					if (this.nodes[i].address === newNode.address) {
						this.nodes[i].remove()
					} else {
						if (this.nodes[i].address === newNode.primary) {
							if (!(this.nodes[i].primary === this.nodes[i].address)) {
								let reason = `${newNode.primary} is not a primary. Only single layer nesting allowed.`
								this.sendResult(command, {profileNum: this.profileNum}, false, reason, {address: newNode.address})
								return callback(reason)
							} else {
								this.nodes[i].isprimary = true
								primaryFound = true
							}
						}
					}
				}
			}
			NodeServerModel.findOne({profileNum: this.profileNum, 'nodes.address': newNode.primary}, (err, doc) => {
				if (err) { return callback(err) }
				if (doc) {
					primaryFound = true
				}
				if (!primaryFound) {
					let reason = `Primary node ${newNode.primary} was not found in nodes.`
					this.sendResult(command, {}, false, reason, {address: newNode.address})
					return callback(reason)
				} else {
					isy.handleRequest(this.profileNum, newNode, command, true, (result) => {
		        if (result.statusCode == 400) {
		          logger.debug(`ISY 400 Add Response: ${newNode.address} Reason: ${result.isyresponse.RestResponse.reason.code}`)
            	newNode.added = true
		          if (result.isyresponse.RestResponse.reason.code === '5004') {
								foundnode = this.nodes.find(n => n.address === newNode.address)
								if (foundnode) {
									foundnode.remove(() => {
										this.save()
									})
								} else {
		            	logger.debug(`${newNode.address} already exists in ISY adding to database.`)
								}
		          } else {
		            let reason = `${newNode.address} was not added sucessfully. ISY returned Reason: ${result.isyresponse.RestResponse.reason.code}`
		            this.sendResult(command, {profileNum: this.profileNum}, false, reason, {address: newNode.address})
		            logger.error(`${this.logPrefix} ${reason}`)
		            return callback(reason)
		          }
		        } else if (result.statusCode == 200) {
		            newNode.added = true
		        }
						if (newNode.added === true) {
							this.nodes.push(newNode)
							let reason = `AddNode: ${newNode.address} saved/updated in database successfully.`
							this.sendResult(command, result, true, reason, {address: newNode.address})
							logger.info(`${this.logPrefix} ${reason}`)
							return callback()
						} else {
							callback()
						}
		    	})
				}
			})
	},

	/**
	* Instance Method for NodeServer to handle 'removenode'
	* @function removenode
	* @alias NodeServerModel.removenode
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {object} data - JSON parsed from incoming message e.g.
	{"node": "1", "removenode": {"address": "lifx_1234", "seq": 1004}}
	* @param {string} command - The command received: 'removenode'
	* @returns {object} response -
	Success: {"result":{"isyresponse":{"RestResponse":{"succeeded":"true","status":"200","reason":{"code":"0"}}},"statusCode":200,"seq":1004,"elapsed":"99.309321ms","profileNum":"8","removenode":{"success":true,"reason":"lifx_1235 removed successfully"}}}
	Fail: {"result":{"isyresponse":{"RestResponse":{"succeeded":"false","status":"403","reason":{"code":"5106"}}},"statusCode":403,"seq":1004,"elapsed":"17.747168ms","profileNum":"8","removenode":{"success":false,"reason":"Could not remove lifx_1234. It is the primary for another node."}}}
	*/
	removenode(data, command, callback = null) {
		isy.handleRequest(this.profileNum, data, command, true, (result) => {
			if (! result ) { if (callback) { return callback() } else { return } }
			let success = false
			let reason = null
			let message = null
			if (result.statusCode === 200) {
				let node = this.nodes.find(n => n.address === data.address)
				if (node) {
					node.remove((err) => {
						if (err) {
							logger.error(`${this.logPrefix} dberror on removenode: ${err}`)
							if (callback) { return callback(err) } else { return }
						} else {
							success = true
							message = `${data.address} removed successfully`
							this.save(() => {
								logger.info(`${this.logPrefix} node ${message}`)
								NodeServerModel.sendUpdate()
							})
							this.sendResult(command, result, success, message)
							if (callback) { return callback() } else { return }
						}
					})
				} else {
					if (callback) { return callback(`NS: Node not found.`) } else { return }
				}
			} else if (result.statusCode === 403) {
				if (result.isyresponse.RestResponse.reason.code === "5106") {
					reason = `Could not remove ${data.address}. It is the primary for another node.`
					logger.error(`${this.logPrefix} ${reason}`)
					this.sendResult(command, result, success, reason)
					if (callback) { return callback() } else { return }
				} else if (result.isyresponse.RestResponse.reason.code === "5003") {
					reason = `Could not remove ${data.address}. It doesn't exist in ISY. Will remove from DB if it exists.`
					logger.info(`${this.logPrefix} ${reason}`)
					let node = this.nodes.find(n => n.address === data.address)
					if (node) {
						node.remove((err) => {
							if (err) {
								logger.error(`${this.logPrefix} dberror on removenode`)
								if (callback) { return callback(err) } else { return }
							} else {
								success = true
								message = `${data.address} removed successfully`
								this.save(() => {
									logger.info(`${this.logPrefix} node ${message}`)
									NodeServerModel.sendUpdate()
								})
								this.sendResult(command, result, success, message)
								if (callback) { return callback() } else { return }
							}
						})
					} else {
						if (callback) { return callback(`NS: Node not found.`) } else { return }
					}
				} else {
					reason = `Could not remove ${data.address}. ISY sent 403.`
					logger.error(`${this.logPrefix} ${reason}`)
					this.sendResult(command, result, success, reason)
					if (callback) { return callback() } else { return }
				}
			} else {
				if (callback) { return callback() } else { return }
			}
		})
	},

	/**
	* Instance Method to Query for Nodes for this NodeServer from ISY
	* This happens at Polyglot Startup to Sync the ISY and Polyglot Database
	* @function getNodesFromISY
	* @alias NodeServerModel.getNodesFromISY
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {errOnlyCallback} callback - Callback when complete with only parameter being an error if there was one.
	*/
	getNodesFromISY(callback) {
		isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection'}, 'restcall', true, (results) => {
			if (!results) { if (callback) { return callback('No ISY Response') } else return }
			try {
				if (results.isyresponse.connections.connection && results.statusCode === 200) {
					if (this.profileNum === results.isyresponse.connections.connection.profile) {
						logger.info(`${this.logPrefix} - NodeServer found on ISY with the name ${results.isyresponse.connections.connection.name}. Checking for Nodes...`)
						async.each(this.nodes, (node, asyncCb) => {
							if (!node.isprimary) { return asyncCb() }
								isy.handleRequest(this.profileNum, {api: 'nodes/' + isy.addNodePrefix(this.profileNum, node.address)}, 'restcall', true, (results) => {
									if (results.statusCode === 404) {
										logger.info(`${this.logPrefix} ${node.address} doesn't exist in ISY. Adding...`)
										this.doNodeAdd(node, 'addnode', {seq: false}, (err) => {
											if (err) { return asyncCb(err)
											} else { return asyncCb()	}
										})
									} else {
										logger.info(`${this.logPrefix} ${node.address} already exists in ISY. Skipping...`)
										return asyncCb()
									}
								})
						}, (err) => {
							if (err) {
								logger.error(`${this.logPrefix} Error adding node: ${err}`)
								if (callback) callback(err)
							} else {
								async.each(this.nodes, (node, asyncCb) => {
									if (node.isprimary) { return asyncCb() }
										isy.handleRequest(this.profileNum, {api: 'nodes/' + isy.addNodePrefix(this.profileNum, node.address)}, 'restcall', true, (results) => {
											if (results.statusCode === 404) {
												logger.info(`${this.logPrefix} ${node.address} doesn't exist in ISY. Adding...`)
												this.doNodeAdd(node, 'addnode', {seq: false}, (err) => {
													if (err) { return asyncCb(err)
													} else { return asyncCb()	}
												})
											} else {
												logger.info(`${this.logPrefix} ${node.address} already exists in ISY. Skipping...`)
												return asyncCb()
											}
										})
								}, (err) => {
									if (err) {
										logger.error(`${this.logPrefix} Error adding node: ${err}`)
										if (callback) callback(err)
									} else {
										logger.info(`${this.logPrefix} Completed ReSync with ISY.`)
										if (callback) callback()
									}
								})
							}
						})
					}
				}
			} catch (err) {
				if (callback) return callback(err)
				else return err
			}
		})
	},

	/**
	* Instance Method to install this NodeServer to ISY automatically. This kicks off immediately after
	NodeServer is added to Polyglot via the frontend.
	* @function installNodeServer
	* @alias NodeServerModel.installNodeServer
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {responseCallback} callback - (err, response) Callback when complete with error if present, or response if no error.
	*/
	installNodeServer(callback) {
		logger.info(`${this.logPrefix} Attempting to install ${this.name} NodeServer into ISY.`)
		isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection'}, 'restcall', true, (results) => {
			if (!results.isyresponse.connections.connection && results.statusCode === 200) {
				let args = {
					ip: config.settings.ipAddress,
					baseurl: '/ns/' + this.profileNum,
					name: this.name,
					nsuser: 'polyglot',
					nspwd: this.isyPassword,
					isyusernum: 0,
					port: config.settings.listenPort,
					timeout: 0,
					ssl: true,
					enabled: true
				}
				isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection/set/network', args: args}, 'restcall', true, (results) => {
					if (results.statusCode !== 200) {
						let message = `Failed to install NodeServer. ISY responded with other than 200.`
						callback(message)
					} else {
						this.installprofile({'reboot': true}, null, (err) => {
							if (err) {
								callback(err)
							} else {
								let message = `Installed into ISY sucessfully. Profile.zip installed.`
								logger.info(`${this.logPrefix} ${message}`)
								callback(null, message)
							}
						})
					}
				})
			} else if (results.isyresponse.connections.connection && results.statusCode === 200){
				let message = 'That Profile already exists on the ISY.'
				logger.error(`${this.logPrefix} ${message}`)
				callback(message)
			} else {
				let message = 'ISY sent a bad status code or did not respond. Check your settings.'
				logger.error(`${this.logPrefix} ${message}`)
				callback(message)
			}
		})
	},

	installprofile (data, command, cb = function(){}) {
		if (this.type !== 'local') { if (cb) return cb(`${this.name} is not installed. Updating code from Github but ignoring profile update request.`)}
		const JSZip = require('jszip')
		var profile = `${this.homeDir}profile.zip`
		var importTypes = ['nodedef', 'editor', 'nls']
		fs.readFile(profile, (err, filedata) => {
		  if (err) return logger.debug(err)
		  JSZip.loadAsync(filedata).then((zip) => {
				importTypes.forEach((type) => {
					zip.folder(type).forEach((path, file) => {
						file.async('text').then((data) => {
							isy.profileUpload(type, `${type}/${path}`, data, this.profileNum, (err) => {
								if (err === 'failed') {
									isy.profileUpload(type, `${type}/${path}`, data, this.profileNum, () => { })
								}
							})
		        })
					})
				})
				if (data && data.hasOwnProperty('reboot')) {
					if (data.reboot === true) {
						setTimeout(() => {
							isy.reboot()
						}, 10000)
					}
				}
				if (cb) { return cb(err) } else { return }
			})
		})
	},

	/**
	* Instance Method to delete this NodeServer from ISY automatically. This kicks off immediately after
	NodeServer is deleted via the frontend.
	* @function deleteNodeServer
	* @alias NodeServerModel.deleteNodeServer
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {responseCallback} callback - (err, response) Callback when complete with error if present, or response if no error.
	*/
	deleteNodeServer(callback) {
		logger.info(`${this.logPrefix} attempting to delete NodeServer ${this.name}`)
		mqtt.makeResponse(this.profileNum, 'delete', {})
		logger.info(`${this.logPrefix} deleting ${this.name}'s nodes from ISY.`)
		if (this.type === 'local') {
			//fs.unlinkSync(`${this.homeDir}.installed`)
			var index = config.installedNSTypes.indexOf(this.name)
			if (index > -1) { config.installedNSTypes.splice(index, 1) }
		}
		async.each(this.nodes, (node, callback) => {
			if (node){
				if (node.isprimary) return callback()
				this.removenode(node, 'removenode', (err, result) => {
					if (err) return callback(err)
					else {
						callback()
					}
				})
			} else {
				callback()
			}
		}, (err) => {
			if (err) return callback(err)
			else {
				async.each(this.nodes, (node, callback) => {
					if (node){
						this.removenode(node, 'removenode', (err, result) => {
							if (err) return callback(err)
							else {
								callback()
							}
						})
					} else {
						callback()
					}
				}, (err) => {
					if (err) return callback(err)
					isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection/remove'}, 'restcall', true, (result) => {
						if (! result ) { return }
						if (result.statusCode === 200) {
							let message = `${this.logPrefix} `
							this.remove((err) => {
								if (err) return callback(err)
								message += 'Succesfully removed NodeServer. Rebooting ISY now.'
								mqtt.delSubscription(this.profileNum)
								if (this.type === 'local') {
									setTimeout(() => {
										child.stopChildNodeServer(config.nodeServers[this.profileNum])
										delete config.nodeServers[this.profileNum]
										NodeServerModel.sendUpdate()
									}, 5000)
								}
								isy.reboot()
								logger.info(`${message}`)
								callback(null, message)
							})
						} else {
							let message = `ISY returned something other than 200, this usually means the NodeServer is out of range. Deleting from DB... `
							this.remove((err) => {
								if (err) return callback(err)
								message += 'Success'
								logger.info(`${this.logPrefix} ${message}`)
								callback(null, message)
							})
						}
					})
				})
			}
		})
	},

	/**
	* Instance Method to Send a result message to the NodeServer via MQTT
	* @function sendResult
	* @alias NodeServerModel.sendResult
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {string} command - Command NodeServer is sending a result for.
	* @param {Object} result - The result object data.
	* @param {boolean} success - True/false
	* @param {string} reason - Sucess reason
	* @param {Object} extra - Extra Parameters to send to the NodeServer if needed.
	*/
	sendResult(command, result, success, reason, extra = null) {
		result[command] = {
			success: success,
			reason: reason
		}
		if (extra) { result[command] = Object.assign(result[command], extra) }
		mqtt.makeResponse(this.profileNum, 'result', result)
	},

	/**
	 * Sends the shortPoll/longPoll message to the NS
	**/
	sendPoll(type) {
		mqtt.makeResponse(this.profileNum, type, {})
	},

	/**
	* Instance Method to handle 'request' from NodeServer
	* @function request
	* @alias NodeServerModel.request
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {Object} data -
	{"node": "8", "request": {"requestId": "3949", "success": true}}
	* @param {string} command - This command 'request'.
	* @returns {Object} result -
	Responds only on failure.
	Fail:
	{"result":{"isyresponse":"","statusCode":404,"seq":false,"elapsed":"8.202375ms","profileNum":"8","request":{"success":false,"reason":"ISY Returned 404 for request ID: 22","id":"22"}}}
	*/
	request(data, command) {
		isy.handleRequest(this.profileNum, data, command, false, (result) => {
			if (! result ) { return }
			if (result.statusCode === 404 || result.statusCode === 400) {
				let reason = `ISY Returned 404 for request ID: ${data.requestId}`
				this.sendResult(command, result, false, reason, {id: data.requestId})
				logger.error(`${this.logPrefix} ${reason}`)
			} else if (result.statusCode === 200){
				let reason = `${data.requestId} reported sucessfully as ${data.success}`
				this.sendResult(command, result, true, reason, {id: data.requestId})
				logger.info(`${this.logPrefix} ${reason}`)
			}
		})
	},

	/**
	* Instance Method to handle 'config' from NodeServer
	* @function config
	* @alias NodeServerModel.config
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {Object} data -
	{"node": "1", "config": null, "seq": 1000}
	* @param {string} command - This command 'config'.
	* @returns {Object} response -
	Returns existing NodeServer configuration:
	{"config":{"name":"LiFX","profileNum":"8","nodes":[{"address":"lifx_1234","name":"LIFX_Lamp2","drivers":[{"driver":"ST","uom":20,"value":"123.3"},{"driver":"GV5","uom":23,"value":"10"}],"isprimary":true,"primary":"lifx_1234","timeAdded":"1496550684087","node_def_id":"lifxcolor","enabled":true,"added":true},{"address":"lifx_1235","name":"TouchMe","drivers":[{"driver":"ST","uom":56,"value":"593.3"},{"driver":"GV1","uom":20,"value":"10"}],"isprimary":false,"primary":"lifx_1234","timeAdded":"1496552508813","node_def_id":"lifxcolor","enabled":true,"added":true}],"token":null,"encryptPayload":false,"timeAdded":"1496545371618","isConnected":false}}
	*/
	config(data = null, command = null) {
		// Hack to deepcopy this.nodes
		var parseConfig = this.toJSON()
		parseConfig.isyVersion = config.settings.isyVersion
		parseConfig._id = undefined
		parseConfig.nodes.forEach((node) => {
			if (node !== null) {
				node._id = undefined
				node.drivers.forEach((driver) => {
					if (driver !== null) {
						driver._id = undefined
					} else (logger.error(node))
				})
			}
		})
		mqtt.makeResponse(this.profileNum, 'config', parseConfig)
	},

	/**
	* Instance Method to handle 'connected' from NodeServer
	* @function connected
	* @alias NodeServerModel.connected
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {Object} data -
	{"node": "1", "connected": true} or
	{"node": "1", "connected": false}
	* @param {string} command - This command 'connected'.
	*/
	connected(data, command) {
		this.isConnected = data
		this.save(() => {
			if (this.isConnected) {
				child.stopPolls(this)
				child.startPolls(this)
				let primary = this.nodes.find(n => n.isprimary === true)
				if (primary) {
					let data = {
						address: primary.address,
						driver: 'ST',
						value: '1',
						uom: '2'
					}
					this.status(data, 'status')
				}
			} else {
				child.stopPolls(this)
				let primary = this.nodes.find(n => n.isprimary === true)
				if (primary) {
					let data = {
						address: primary.address,
						driver: 'ST',
						value: '0',
						uom: '2'
					}
					this.status(data, 'status')
				}
			}
			logger.info(`${this.logPrefix} NodeServer ${(data ? 'Connected.' : 'Disconnected.')}`)
			this.config(data, command)
			NodeServerModel.sendUpdate()
		})
	},

	/**
	* Instance Method for NodeServer to handle 'customparams'
	* @function customparams
	* @alias NodeServerModel.customparams
	* @memberof module:models/nodeserver~NodeServerModel
	* @instance
	* @param {object} data - JSON parsed from incoming message e.g.
	{"nodes": [{"address": "lifx_1236","name": "LIFX_Lamp2","node_def_id": "lifxcolor","primary": "lifx_1234","drivers": [{"driver": "ST","value": "123.3","uom": 20},{"driver": "GV5","value": "10","uom": 23}]}], "seq": 1000}
	* @param {string} command - The command received: 'addnode'
	* @returns {object} response -
	Success: {"result":{"isyresponse":"","statusCode":200,"seq":1000,"elapsed":"100.425214ms","profileNum":"8","addnode":{"success":true,"reason":"node lifx_1236 added successfully.","address":"lifx_1236"}}}
	Fail: {"result":{"isyresponse":"","statusCode":200,"seq":false,"elapsed":"25.251796ms","profileNum":"8","addnode":{"success":false,"reason":"lifx_1235 already exists on ISY","address":"lifx_1235"}}}
	*/
	customparams(data, command, callback) {
		logger.info(`NS: Recieved updated Custom Parameters for ${this.name}. Updating database.`)
		delete data.profileNum
		//logger.debug(data)
		this.customParams = data
		this.save()
		if (callback) { return callback(null, 'Custom Parameters saved to database sucessfully.') }
	},

	polls(data, command, callback) {
		if (data.hasOwnProperty('shortPoll') && data.hasOwnProperty('longPoll')) {
      this.shortPoll = data.shortPoll
      this.longPoll = data.longPoll
      child.stopPolls(this)
      child.startPolls(this)
  		logger.info(`NS: Recieved updated Poll Parameters for ${this.name}. Short: ${this.shortPoll} Long: ${this.longPoll}`)
  		this.save()
  		if (callback) { return callback(null, 'Poll Parameters saved to database sucessfully.') }
    } else {
      if (callback) { return callback(null, 'shortPoll or longPoll missing from update message. Nothing Changed.') }
    }
	},

	start(data, command) {
		if (!(child.nodeProcesses[this.profileNum])) {
			child.runChildNodeServer(config.nodeServers[this.profileNum])
		} else {
			return
		}
  },

	stop(data, command) {
		if (child.nodeProcesses[this.profileNum]) {
			child.stopChildNodeServer(config.nodeServers[this.profileNum])
		} else {
			return
		}
	},

	restart(data, command) {
		if (child.nodeProcesses[this.profileNum]) {
			child.stopChildNodeServer(config.nodeServers[this.profileNum])
		}
		setTimeout(() => {
			child.runChildNodeServer(config.nodeServers[this.profileNum])
		}, 3000)
	},

	notfound(data, command) {
		logger.info(`${this.logPrefix} command not found: ${command}`)
	}

}
NodeServerModel = mongoose.model('NodeServer', NodeServerSchema)
module.exports = NodeServerModel

/**
@callback addnsCallback
@param {string} error - An Error if returned
@param {Object} response - {"seq":53407,"response":{"success":true,"msg":"Installed into ISY sucessfully. Reboot the ISY and upload the profile.zip","nodeserver":{"name":"Test123","profileNum":"10"}}}
*/

/**
@callback findArrayCallback
@param {string} error - An Error if encountered
@param {Object} documents - Array of documents returned by Mongoose Find
*/

/**
@callback findCallback
@param {string} error - An Error if encountered
@param {Object} document - Document returned by Mongoose FindOne
*/

/**
@callback errOnlyCallback
@param {string} error - An Error if encountered
*/

/**
@callback responseCallback
@param {string} error - An Error if encountered
@param {Object} response - Object response returned to callback if no error occurred.
*/
