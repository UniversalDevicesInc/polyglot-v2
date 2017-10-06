const logger = require('./logger')
const mqtt = require('mqtt')
const config = require('../config/config')

/**
 * MQTT Module
 * @module modules/mqtt
 * @version 2.0
 */

module.exports = {
		/** MQTT Client var */
		Client: null,
		/** MQTT clientId var */
		clientId: null,

		/**
		 * MQTT Start Service and Connect via .env MQTT_HOST and MQTT_PORT provided.
		 * @method
		 * @param {function} callback - Callback when connected or if already started.
		 */
		startService(callback) {
			if (this.Client) { if (callback) return callback() }
			this.clientId = 'polyglot'
			var options = {
				keepalive: 60,
				clean: true,
				clientId: this.clientId,
				reconnectPeriod: 5000,
				will: { retain: true }
			}
			if(!process.env.MQTT_HOST || !process.env.MQTT_PORT) {
				logger.error('MQTT Address or Port not set... Check your Settings.')
				return
			}

			options['will']['topic'] = 'udi/polyglot/connections/polyglot'
			options['will']['payload'] = new Buffer(JSON.stringify({node: this.clientId, 'connected': false}))
			this.Client = mqtt.connect('mqtt://'+ process.env.MQTT_HOST + ':' + process.env.MQTT_PORT, options)

			this.Client.on('connect', () => {
				this.addSubscriptions()
			})

			this.Client.on('message', (topic, payload) => {
				try {
					payload = JSON.parse(payload.toString())
				} catch (e) {
					logger.error('MQTT: Badly formatted JSON input received. ' + e)
					return
				}
				this.parse(topic, payload)
			})

			this.Client.on('reconnect', () => {
				config.mqttConnected = false
				logger.info('MQTT attempting reconnection to broker...')
			})

			this.Client.on('error', (err) => {
				logger.error('MQTT recieved error: ' + err.toString())
			})

      logger.info('MQTT Services Started.')
			if (callback) callback()
		},

		/**
		 * MQTT Addsubscriptions to Polyglot topics and existing NodeServer topics.
		 * @method
		 */
		addSubscriptions() {
			this.Client.subscribe('udi/polyglot/connections/#', (err, granted) => {
				if (err) {
					logger.error('Error: ' + err.toString())
					return
				}
				config.mqttConnected = true
				logger.info('MQTT: Subscribe Successful ' + granted[0]['topic'] + " QoS: " + granted[0]['qos'])
				this.publish('udi/polyglot/connections/polyglot', {node: this.clientId, 'connected': true}, { retain: true })
			})
			this.Client.subscribe('udi/polyglot/frontend/settings')
			this.Client.subscribe('udi/polyglot/frontend/nodeservers')
			config.nodeServers.forEach((nodeServer) => {
				this.Client.subscribe('udi/polyglot/ns/' + nodeServer.profileNum, (err, granted) => {
					if (err) {
						logger.error('Error: ' + err.toString())
						return
					}
					logger.info('MQTT: Subscribe Successful ' + granted[0]['topic'] + " QoS: " + granted[0]['qos'])
				})
			})
		},

		/**
		 * MQTT Addsubscription to new NodeServer
		 * @method
		 * @param {number} profileNum - add new subscription to NodeServer with profileNum.
		 */
		addSubscription(profileNum) {
			this.Client.subscribe('udi/polyglot/ns/' + profileNum, (err, granted) => {
				if (err) {
					logger.error('Error: ' + err.toString())
					return
				}
				logger.info('MQTT: Subscribe Successful ' + granted[0]['topic'] + " QoS: " + granted[0]['qos'])
			})
		},

		delSubscription(profileNum) {
			this.Client.unsubscribe('udi/polyglot/ns/' + profileNum, (err, granted) => {
				if (err) {
					logger.error('Error: ' + err.toString())
					return
				}
				logger.info(`MQTT: Unsubscribed Successfully from NodeServer ${profileNum}`)
			})
		},

		/**
		 * MQTT Stop Service
		 * @method
		 * @param {function} callback - Callback when service is and conneciton is clear.
		 */
		stopService(callback) {
			if(this.Client){
					this.publish('udi/polyglot/connections/polyglot', {node: this.clientId, 'connected': false}, { retain: true })
					logger.info('MQTT Services Stopping Gracefully.')
					this.Client.end(true, () => {
						this.Client = null
						if(callback) { callback() }
					})
			} else {
					if(callback) { callback() }
			}
		},

		/**
		 * MQTT Make Response
		 * @method
		 * @param {string} topic - topic to publish to. Should be either 'connections' or the profileNum of the NodeServer
		 * @param {string} command - Command to send, e.g 'status', etc.
		 * @param {object} message - Dictionary object of message to send. JSON format.
		 */
		makeResponse(topic, command, message) {
			if (topic === 'connections' || topic === 'udi/polyglot/connections/polyglot') {
				topic = 'udi/polyglot/connections/polyglot'
			} else {
				topic = 'udi/polyglot/ns/' + topic
			}
      try {
        var response = {'node': 'polyglot'}
        response[command] = message
      } catch (e) {
         var response = {
          'node': 'polyglot',
          'data': {
            'error': e
          }
        }
      }
			this.publish(topic, response)
    },

		/**
		 * MQTT Once MakeResponse is complete, publish the message to MQTT
		 * @method
		 * @param {string} topic - topic to publish to. Should be either 'connections' or the profileNum of the NodeServer
		 * @param {object} message - Dictionary object of message to send. JSON format.
		 * @param {object} options - Typically used for {retain: True/False} to retain the last message. [Optional]
		 * @param {function} callback - Callback when publish is complete. [Optional]
		 */
		publish(topic, message, options, callback) {
			message = JSON.stringify(message)
			this.Client.publish(topic, message, options, callback)
		},

		/**
		 * MQTT Parse incoming message from MQTT
		 * @method
		 * @param {string} topic - topic received on.
		 * @param {object} message - Dictionary object of message. JSON parsed into object.
		 */
		parse(topic, message) {
			var parse = false
			if (message.node === 'polyglot') { return }
			if (topic === 'udi/polyglot/frontend/settings') {
				require('../models/settings').updateSettings(message)
				return
			}
			if (topic === 'udi/polyglot/frontend/nodeservers') {
				require('../models/nodeserver').parseFrontend(message)
				return
			}
			logger.debug('MQTT Message: ' + topic + ": " + JSON.stringify(message))
			try {
				if (topic.substring(0,25) === 'udi/polyglot/connections/') {
					if (message.node.toString().substring(0,18) === 'polyglot_frontend-') {
						logger.info('MQTT: Frontend Websockets interface ' + (message.connected ? ' Connected.' : ' Disconnected.'))
					} else if (message.node === config.nodeServers[message.node].profileNum) {
							try {
								config.nodeServers[message.node].checkCommand(message)
							} catch (e) {
								logger.error(`MQTT CheckCommand Error: ${e}`)
							}
					}
				} else if ((topic.substring(0,16) === 'udi/polyglot/ns/') && (topic.slice(-1) === message.node)) {
					if (message.node === config.nodeServers[message.node].profileNum) {
						try {
							config.nodeServers[message.node].checkCommand(message)
						} catch (e) {
							logger.error(`MQTT CheckCommand Error: ${e}`)
						}
					}
				} else {
					logger.debug('MQTT: Did not match any parse filters. Ignoring. This usually means ' +
					 'the node value is incorrect. Make sure it matches an active NodeServer and you are publishing to the correct topic. ' + message)
				}
			} catch (err) {
				logger.error('MQTT Parse Error: ' + err)
			}

		}
}
