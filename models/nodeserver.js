const mongoose = require('mongoose')
//const randomstring = require('randomstring')
const logger = require('../modules/logger')
const config = require('../config/config')
const mqtt = require('../modules/mqtt')
const isy = require('../modules/isy')
const async = require('async')


// Driver Child Schema
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
})

// Nodes Child Schema
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
		time_added: {
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
})

// NodeServer Parent Schema
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
		default: null
	},
	time_added: {
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
	nodes: [NodeSchema]
})

NodeServerSchema.statics = {
	sendUpdate()  {
		let ns = config.nodeServers.filter((ns) => { if (ns) return ns })
		mqtt.publish('udi/polyglot/frontend/nodeservers', {node: 'polyglot', nodeservers: ns}, {retain: true})
	},

	addns(name, profileNum, callback) {
		let newNodeServer = new NodeServerModel({
			name: name,
			profileNum: profileNum,
			logPrefix: `${name}(${profileNum}):`
		})

		const query = {profileNum: newNodeServer.profileNum}
		NodeServerModel.findOne(query, (err, node) => {
			if (err) { if (callback) return callback(err) }
			if (node) {
				if (callback) return callback(null, {success: false, msg: 'NodeServer with that Profile Number already exists.'})
			} else {
				newNodeServer.installNodeServer((err, message) => {
					if (err) {
						logger.error(`${newNodeServer.logPrefix} Unable to register ${newNodeServer.name} with ISY. Reason: ${err}`)
						newNodeServer.remove()
						if (callback) return callback(null, {success: false, msg: err})
					} else {
						newNodeServer.save((err, node) => {
							if (err) { if (callback) return callback(err) }
							if (!node) {
								if (callback) return callback(null, {success: false, msg: 'Failed to register NodeServer'})
							} else {
								logger.info('Registered new NodeServer: ' + node.name + '(' + node.profileNum + ')')
								config.nodeServers[node.profileNum] = newNodeServer
								mqtt.addSubscription(node.profileNum)
								NodeServerModel.sendUpdate()
								if (callback) return callback(null, {
									success:true,
									msg: message,
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

	parseFrontend(message) {
		if (message.hasOwnProperty('addns')) {
			if (message.addns.hasOwnProperty('name') && message.addns.hasOwnProperty('profileNum')) {
				NodeServerModel.addns(message.addns.name, message.addns.profileNum, (err, result) => {
					if (err) return logger.debug(error)
					if (message.hasOwnProperty('seq')) {
						let response = {
							node: 'polyglot',
							seq: message.seq,
							response: result
						}
						mqtt.publish('udi/polyglot/frontend/nodeservers', response)
						NodeServerModel.sendUpdate()
					}
				})
			} else {
				logger.error('MQTT: Received Add NodeServer command. name or profileNum was missing.')
			}
		} else if (message.hasOwnProperty('delns')) {
			if (message.delns.hasOwnProperty('profileNum')) {
				if (config.nodeServers[message.delns.profileNum]) {
					config.nodeServers[message.delns.profileNum].deleteNodeServer((err, result) => {
						if (message.hasOwnProperty('seq')) {
							let response = {
								node: 'polyglot',
								seq: message.seq,
								response: {
									success: err ? false: true,
									msg: err ? err : result
								}
							}
							mqtt.publish('udi/polyglot/frontend/nodeservers', response)
							NodeServerModel.sendUpdate()
						}
					})
				} else {
					let response = {
						node: 'polyglot',
						seq: message.seq,
						response: {
							success: false,
							msg: `NodeServer with the profile number: ${message.delns.profileNum} does not exist.`
						}
					}
					mqtt.publish('udi/polyglot/frontend/nodeservers', response)
				}
			} else {
				logger.error('MQTT: Received Delete NodeServer command. profileNum was missing.')
			}
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

	loadNodeServers(callback) {
		NodeServerModel.getAllNodeServers((err, nodes) => {
			if(nodes) {
				nodes.forEach((nodeServer) => {
					if(config.nodeServers.filter((ns) => { return ns.profileNum === nodeServer.profileNum })) {
						logger.debug(`NodeServer ${nodeServer.name} [${nodeServer.profileNum}] added to running config.`)
						config.nodeServers[nodeServer.profileNum] = nodeServer
						nodeServer.getNodesFromISY()
					}
				})
				logger.debug('MongoDB: NodeServers retrieved from database')
			} else {
				logger.debug('MongoDB: No NodeServers found in database')
			}
			if(callback) { return callback(err) }
		})
	},

}

NodeServerSchema.methods = {
	print () {
		return config.nodeServers[this.profileNum]
	},

	toJSON() {
		let {name, profileNum, nodes, token, encryptPayload, time_added, isConnected} = this
		return JSON.parse(JSON.stringify({name, profileNum, nodes, token, encryptPayload, time_added, isConnected}))
	},

	checkCommand(data){
		//if (this.isConnected) {
		let validCommands = ['status', 'addnode','removenode', 'restcall', 'request', 'config', 'connected', 'command']
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

	status(data, command) {
		// Profile#, incoming json, command "status", full response text (t/f)
		isy.handleRequest(this.profileNum, data, command, false, (result) => {
			if (result.statusCode === 404) {
				let reason = `${data.address} or ${data.driver} does not exist`
				this.sendResult(command, result, false, reason, {address: data.address})
				logger.error(`${this.logPrefix} ${reason}`)
			} else if (result.statusCode === 200){
				let success = false
				for (var node in this.nodes) {
					if (this.nodes[node].address === data.address) {
						for (var driver in this.nodes[node].drivers) {
							if (this.nodes[node].drivers[driver].driver === data.driver) {
								this.nodes[node].drivers[driver].uom = data.uom
								this.nodes[node].drivers[driver].value = data.value
								success = true
								this.save(() => {
									let reason = `${data.address} ${data.driver} set sucessfully to ${data.value}`
									this.sendResult(command, result, true, reason, {address: data.address})
									logger.info(`${this.logPrefix} ${reason}`)
									NodeServerModel.sendUpdate()
								})
							}
						}
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

	command(data, command) {
		isy.handleRequest(this.profileNum, data, command, true, (result) => {
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

	restcall(data, command) {
		isy.handleRequest(this.profileNum, data, command, true, (result) => {
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

	addnode(data, command) {
		if (!Array.isArray(data.nodes)) return logger.error(`${this.logPrefix} - nodes must be an array.`)
		let primaryNodes = []
		for (i in data.nodes) {
			if (data.nodes[i].address === data.nodes[i].primary) {
				primaryNodes.push(data.nodes.splice(i, 1)[0])
			}
		}
		async.each(primaryNodes, (node, callback) => {
			this.doNodeAdd(node, command, (err) => {
				if (err) { callback(err)
				} else { callback()	}
			})
		}, (err) => {
			if (err) {logger.error(`${this.logPrefix} Error adding primary node: ${err}`)}
			async.each(data.nodes, (node, callback) => {
				this.doNodeAdd(node, command, (err) => {
					if (err) { callback(err)
					} else { callback()	}
				})
			}, (err) => {
				if (err) {
					logger.error(`${this.logPrefix}: ${err}`)
				}
				else {
					logger.info(`${this.logPrefix} completed adding node(s).`)
					NodeServerModel.sendUpdate()
				}
			})
		})
	},

	doNodeAdd(node, command, finishcb){
			if (!Array.isArray(node.drivers)) {
				let reason = `${node.address} drivers must be an array.`
				this.sendResult(command, results, false, reason, {address: node.address})
				return finishcb(reason)
			}
			async.waterfall([
				function (callback){
					NodeServerModel.count({profileNum: this.profileNum, 'nodes.address': node.address}, (err, result) => {
						if (err) { return callback(err) }
						else { return callback(null, result) } })
				}.bind(this),
				function (result, callback) {
					isy.handleRequest(this.profileNum, {api: 'nodes/' + isy.addNodePrefix(this.profileNum, node.address)}, 'restcall', false, (results) => {
						if (results.statusCode !== 404) {
							let reason = `${node.address} already exists on ISY`
							this.sendResult(command, results, false, reason, {address: node.address})
							return callback(reason)
						}
						if (result) {
							logger.info(`${this.logPrefix} ${node.address} already exists in ${this.name} but does not exist on the ISY. Removing local copy and overwriting.`)
							for (i in this.nodes) {
								if (this.nodes[i].address === node.address) {
									this.nodes[i].remove(this.save((err) => {
										if (err) return callback(err)
										return callback()
									}))
								}
							}
						} else {
							return callback()
						}
					})
				}.bind(this),
				function(callback) {
					let newNode = {
						address: node.address,
						name: node.name,
						node_def_id: node.node_def_id,
						primary: node.primary,
						drivers: node.drivers
					}
					let primaryFound = false
					if (node.address === node.primary) {
						newNode.isprimary = true
						primaryFound = true
					}
					for (i in this.nodes) {
						if (this.nodes[i].address === node.primary) {
							if (!(this.nodes[i].primary === this.nodes[i].address)) {
								let reason = `${node.primary} is not a primary. Only single layer nesting allowed.`
								this.sendResult(command, {profileNum: this.profileNum}, false, reason, {address: node.address})
								return callback(reason)
							} else {
								this.nodes[i].isprimary = true
								primaryFound = true
							}
						}
					}
					if (!primaryFound) {
						let reason = `Primary node ${node.primary} was not found in nodes.`
						this.sendResult(command, {}, false, reason, {address: node.address})
						return callback(reason)
					}
					isy.handleRequest(this.profileNum, newNode, command, false, (result) => {
						if (result.statusCode == 400) {
							let reason = `${newNode.address} already exists.`
							this.sendResult(command, result, false, reason, {address: node.address})
							return callback(reason)
						} else if (result.statusCode == 200) {
								newNode.added = true
								this.nodes.push(newNode)
								this.save((err) => {
									if (err) return callback(err)
									let reason = `node ${newNode.address} added successfully.`
									this.sendResult(command, result, true, reason, {address: newNode.address})
									logger.info(`${this.logPrefix} ${reason}`)
									return callback()
								})
							} else {
								return callback()
							}
						})
				}.bind(this)
			], (err) => {
				if (err) { return finishcb(err) }
				else { return finishcb()}
			})
	},

	removenode(data, command, callback = null) {
		isy.handleRequest(this.profileNum, data, command, true, (result) => {
			let success = false
			let reason = null
			let message = null
			if (result.statusCode === 200) {
				for (i in this.nodes) {
					if (this.nodes[i].address === data.address) {
						this.nodes[i].remove((err) => {
							if (err) {
								if (callback) return callback(err)
								else return logger.error(`${this.logPrefix} dberror on removenode`)
							} else {
								success = true
								message = `${data.address} removed successfully`
								this.save(() => {
									logger.info(`${this.logPrefix} node ${message}`)
									NodeServerModel.sendUpdate()
								})
								this.sendResult(command, result, success, message)
							}
						})
					}
				}
			} else if (result.statusCode === 403) {
				if (result.isyresponse.RestResponse.reason.code === "5106") {
					reason = `Could not remove ${data.address}. It is the primary for another node.`
					logger.error(`${this.logPrefix} ${reason}`)
					this.sendResult(command, result, success, reason)
				} else if (result.isyresponse.RestResponse.reason.code === "5003") {
					reason = `Could not remove ${data.address}. It doesn't exist in ISY. Will remove from DB if it exists.`
					logger.info(`${this.logPrefix} ${reason}`)
					for (i in this.nodes) {
						if (this.nodes[i].address === data.address) {
							this.nodes[i].remove((err) => {
								if (err) {
									if (callback) return callback(err)
									else return logger.error(`${this.logPrefix} dberror on removenode`)
								} else {
									success = true
									message = `${data.address} removed successfully`
									this.save(() => {
										logger.info(`${this.logPrefix} node ${message}`)
										NodeServerModel.sendUpdate()
									})
									this.sendResult(command, result, success, message)
								}
							})
						}
					}
				} else {
					reason = `Could not remove ${data.address}. ISY sent 403.`
					logger.error(`${this.logPrefix} ${reason}`)
					this.sendResult(command, result, success, reason)
				}
			}
			if (callback) return callback()
		})
	},

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
										this.doNodeAdd(node, 'addnode', (err) => {
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
												this.doNodeAdd(node, 'addnode', (err) => {
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

	installNodeServer(callback) {
		logger.info(`${this.logPrefix} Attempting to install ${this.name} NodeServer into ISY.`)
		isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection'}, 'restcall', true, (results) => {
			if (!results.isyresponse.connections.connection && results.statusCode === 200){
				let args = {
					ip: process.env.HOST_IP,
					baseurl: '/ns/' + this.profileNum,
					name: this.name,
					nsuser: 'polyglot',
					nspwd: 'gTmZznSGe9Es6FTJ',
					isyusernum: 0,
					port: process.env.HOST_PORT,
					timeout: 0,
					ssl: process.env.USE_HTTPS,
					enabled: true
				}
				isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection/set/network', args: args}, 'restcall', true, (results) => {
					if (results.statusCode !== 200) {
						let message = `Failed to install NodeServer. ISY responded with other than 200.`
						callback(message)
					} else {
						let message = `Installed into ISY sucessfully. Reboot the ISY and upload the profile.zip`
						logger.info(`${this.logPrefix} ${message}`)
						callback(null, message)
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

	deleteNodeServer(callback) {
		logger.info(`${this.logPrefix} attempting to delete NodeServer ${this.name}`)
		logger.info(`${this.logPrefix} deleting ${this.name}'s nodes from ISY.`)
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
						if (result.statusCode === 200) {
							let message = `${this.logPrefix} `
							this.remove((err) => {
								if (err) return callback(err)
								message += 'Succesfully removed NodeServer. You must reboot the ISY.'
								delete config.nodeServers[this.profileNum]
								logger.info(`${message}`)
								callback(null, message)
							})
						} else {
							let message = `${this.logPrefix} ISY returned something other than 200, this usually means the NodeServer is out of range. Deleting from DB... `
							this.remove((err) => {
								if (err) return callback(err)
								message += 'Success'
								logger.info(`${message}`)
								callback(null, message)
							})
						}
					})
				})
			}
		})
	},

	sendResult(command, result, success, reason, extra = null) {
		result[command] = {
			success: success,
			reason: reason
		}
		if (extra) { result[command] = Object.assign(result[command], extra) }
		mqtt.makeResponse(this.profileNum, 'result', result)
	},

	request(data, command) {
		isy.handleRequest(this.profileNum, data, command, false, (result) => {
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

	config(data, command) {
		// Hack to deepcopy this.nodes
		var parseConfig = this.toJSON()
		parseConfig._id = undefined
		parseConfig.nodes.forEach((node) => {
			node._id = undefined
			node.drivers.forEach((driver) => {
				driver._id = undefined
			})
		})
		mqtt.makeResponse(this.profileNum, 'manifest', parseConfig)
	},

	connected(data, command) {
		this.isConnected = data
		this.save(() => {
			logger.info(`${this.logPrefix} NodeServer ${(data ? 'Connected.' : 'Disconnected.')}`)
			NodeServerModel.sendUpdate()
		})
	},

	notfound(data, command) {
		logger.info(`${this.logPrefix} command not found: ${command}`)
	},

}
NodeServerModel = mongoose.model('NodeServer', NodeServerSchema)
module.exports = NodeServerModel
