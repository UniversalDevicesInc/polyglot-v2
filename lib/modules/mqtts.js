const mosca = require('mosca')
const os = require('os')

const logger = require('./logger')
const config = require('../config/config')

/**
 * MQTT Server Module
 * @module modules/mqtts
 * @version 2.0
 */

module.exports = {
  /** MQTT Server var */
  /**
  * MQTT Server Start Service.
  * @method
  * @param {function} callback - Callback when connected or if already started.
  */
  async startService() {
    if (!config.mqttServer) {
      var connectedClients = []
      var mongoURI
      if (process.env.USEDOCKER) {
        mongoURI = 'mongodb://mongo:27017/'
      } else {
        mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/'
      }
      var ascoltatore = {
          type: 'mongo',
          url: mongoURI + 'mqtt',
          pubsubCollection: 'ascoltatori',
          mongo: {}
      }
      const sslDir = os.homedir() + '/.polyglot/ssl/'
      var moscaSetting = {
          //port: config.settings.mqttPort,
          //host: "10.0.0.75", // specify an host to bind to a single interface
          persistence: {
              factory: mosca.persistence.Mongo,
              url: mongoURI + 'mqtt'
            },

          secure: {
            port: config.settings.mqttPort,
            keyPath: sslDir + 'polyglot_private.key',
            certPath: sslDir + 'polyglot.crt'
          },
          allowNonSecure: false,
          backend: ascoltatore
      }

      var authenticate = function (client, username, password, callback) {
          // TODO: Implement authentication to MQTT Server
          if (connectedClients.indexOf(client.id) > -1) {
            logger.error('Client already connected. Disallowing multiple connections from the same client.')
            callback(null, false)
          } else {
            if (client.id == 'polyglot' || client.id.substring(0, 18) === 'polyglot_frontend-') {
              if (username && password) {
                if (password.toString() === config.settings.secret) {
                  logger.info(`MQTTS: ${client.id} authenticated successfully.`)
                  callback(null, true)
                } else {
                  logger.error(`MQTTS: ${client.id} authentication failed. Someone is messing with something....`)
                  callback(null, true)
                }
              } else {
                logger.error('Polyglot or Frontend didn\'t provide authentication credentials. Disallowing access.')
                callback(null, false)
              }
            } else {
              callback(null, true)
            }
          }
      }

      var authorizePublish = function (client, topic, payload, callback) {
          callback(null, true)
      }

      var authorizeSubscribe = function (client, topic, callback) {
          callback(null, true)
      }

      var p = new Promise(function (resolve, reject) {
        config.mqttServer = new mosca.Server(moscaSetting)

        config.mqttServer.on('ready', () => {
          config.mqttServer.authenticate = authenticate
          config.mqttServer.authorizePublish = authorizePublish
          config.mqttServer.authorizeSubscribe = authorizeSubscribe
          logger.info('Mosca MQTT Broker Service: Started')
          resolve()
        })

        config.mqttServer.on('error', function (err) {
            logger.error(`Mosca MQTT Error: ${err}`)
        })

        config.mqttServer.on('clientConnected', (client) => {
            logger.info('MQTTS: Client Connected:', client.id)
            connectedClients.push(client.id)
            config.mqttClientDisconnectCallbacks[client.id] = []
        })

        config.mqttServer.on('clientDisconnected', (client) => {
            logger.info('MQTTS: Client Disconnected:', client.id)
            var index = connectedClients.indexOf(client.id)
            if (index > -1) {
              connectedClients.splice(index, 1)
            }
            if (config.mqttClientDisconnectCallbacks.hasOwnProperty(client.id)) {
              while (config.mqttClientDisconnectCallbacks[client.id].length > 0) {
                  (config.mqttClientDisconnectCallbacks[client.id].shift())()
                }
              delete config.mqttClientDisconnectCallbacks[client.id]
            }
          })

        config.mqttServer.on('clientDisconnecting', function (client) {
            logger.debug('clientDisconnecting := ', client.id)
        })

        /*
        server.on('published', function (packet, client) {
            //logger.debug("Published :=", packet)
        })

        server.on('subscribed', function (topic, client) {
            //logger.debug("Subscribed :=", client.packet)
        })

        server.on('unsubscribed', function (topic, client) {
            //logger.debug('unsubscribed := ', topic)
        })
        */
      })
      return p
    }
  },

   /**
    * MQTT Server Stop Service
    * @method
    * @param {function} callback - Callback when service is and conneciton is clear.
    */
  async stopService() {
    if (config.mqttServer) {
       logger.info('Mosca MQTT Broker Service: Stopping')
       config.mqttServer.close()
       config.mqttServer = null
    }
  },
 }
