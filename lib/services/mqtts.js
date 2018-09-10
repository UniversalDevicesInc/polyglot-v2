//const mosca = require('mosca')
const Aedes = require('aedes')
//const aedespersist = require('aedes-persistence-mongodb')
//const aedesmq = require('mqemitter-mongodb')
//const aedeslogging = require('aedes-logging')
const os = require('os')
const fs = require('fs')

const logger = require('../modules/logger')
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
  async start() {
    if (!config.mqttServer) {
      var connectedClients = []
      var mongoURI
      if (process.env.USEDOCKER) {
        mongoURI = 'mongodb://mongo:27017/'
      } else {
        mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/'
      }

      const sslDir = config.polyDir + 'ssl/'

      //var persist = aedespersist({url: mongoURI + 'mqtt'})
      //var mq = aedesmq({url: mongoURI + 'mqtt'})
      var options = {
        rejectUnauthorized: false,
        key: fs.readFileSync(sslDir + 'polyglot_private.key'),
        cert: fs.readFileSync(sslDir + 'polyglot.crt')
      }
      config.aedes = Aedes({
        //mq: mq,
        //persistence: persist,
        heartbeatInterval: 5000,
        connectTimeout: 10 * 10000
      })

      config.aedes.on('client', (client) => {
          logger.info('MQTTS: Client Connected:', client.id)
          config.mqttConnectedClients[client.id] = {}
          config.mqttClientDisconnectCallbacks[client.id] = []
      })

      config.aedes.on('clientDisconnect', (client) => {
        logger.info('MQTTS: Client Disconnected:', client.id)
        if (config.mqttConnectedClients.hasOwnProperty(client.id)) {
          delete config.mqttConnectedClients[client.id]
        }
        if (config.clientTails.hasOwnProperty(client.id)) {
          config.clientTails[client.id].unwatch()
          delete config.clientTails[client.id]
        }
        if (config.mqttClientDisconnectCallbacks.hasOwnProperty(client.id)) {
          while (config.mqttClientDisconnectCallbacks[client.id].length > 0) {
              (config.mqttClientDisconnectCallbacks[client.id].shift())()
            }
          delete config.mqttClientDisconnectCallbacks[client.id]
        }
      })

      config.aedes.on('clientError', (client, err) => {
        logger.error(`MQTTS: clientError: ${client.id} ${err.message}`)
      })

      config.aedes.on('connectionError', (client, err) => {
        logger.error(`MQTTS: connectionError: ${client.id} ${err.message}`)
      })

      config.aedes.on('keepaliveTimeout', (client) => {
        logger.error(`MQTTS: keepaliveTimeout: ${client.id}`)
      })


      config.aedes.authenticate = function (client, username, password, callback) {
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

      config.aedes.authorizePublish = function (client, packet, callback) {
          callback(null)
      }

      config.aedes.authorizeSubscribe = function (client, sub, callback) {
          callback(null, sub)
      }

      if (config.settings.useHttps)
        config.mqttServer = require('tls').createServer(options, config.aedes.handle)
      else
        config.mqttServer = require('net').createServer(config.aedes.handle)

      /*
      aedeslogging({
        instance: config.aedes,
        servers: [config.mqttServer]
      }) */

      var p = new Promise(function (resolve, reject) {
        //config.mqttServer = new mosca.Server(moscaSetting)

        config.mqttServer.listen(config.settings.mqttPort, () => {
          logger.info(`Aedes MQTT Broker Service: Started on port ${config.settings.mqttPort}`)
          resolve()
        })
      })
      return p
    }
  },

   /**
    * MQTT Server Stop Service
    * @method
    * @param {function} callback - Callback when service is and conneciton is clear.
    */
  async stop() {
    if (config.mqttServer) {
       logger.info('Aedes MQTT Broker Service: Stopping')
       config.mqttServer.close()
       config.mqttServer = null
    }
  },
 }
