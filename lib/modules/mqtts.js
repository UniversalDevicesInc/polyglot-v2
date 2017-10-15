const logger = require('./logger')
const mosca = require('mosca')
const config = require('../config/config')
const os = require('os')
const util = require('util')

/**
 * MQTT Server Module
 * @module modules/mqtts
 * @version 2.0
 */

 module.exports = {
   /** MQTT Server var */
   Server: null,
   clientDisconnectCallbacks: {},

   /**
    * MQTT Server Start Service.
    * @method
    * @param {function} callback - Callback when connected or if already started.
    */
   startService(callback) {
      if (this.Client) { if (callback) return callback() }
      var ascoltatore = {
          type: 'mongo',
          url: 'mongodb://localhost:27017/mqtt',
          pubsubCollection: 'ascoltatori',
          mongo: {}
      }
      const sslDir = os.homedir() + '/.polyglot/ssl/'
      var mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/'
      var moscaSetting = {
          //port: config.settings.mqttPort,
          //host: "10.0.0.75", // specify an host to bind to a single interface
          persistence: {
              factory: mosca.persistence.Mongo,
              url: mongoURI + 'mqtt'
            },
          http: {
            port: config.settings.mqttWSPort,
            bundle: true,
            static: './'
          },
          /*
          secure: {
            port: config.settings.mqttPort,
            keyPath: sslDir + 'polyglot.key',
            certPath: sslDir + 'polyglot.crt'
          },
          allowNonSecure: true,
          */
          backend: ascoltatore
      }


      var authenticate = function (client, username, password, callback) {
          // Keeping Authentication off for now
          // TODO: Implement authentication to MQTT Server
          // if (username == "test" && password.toString() == "test")
          callback(null, true)
          // else
          //    callback(null, false)
      }

      var authorizePublish = function (client, topic, payload, callback) {
          callback(null, true)
      }

      var authorizeSubscribe = function (client, topic, callback) {
          callback(null, true)
      }

      this.Server = new mosca.Server(moscaSetting)

      this.Server.on('ready', () => {
        this.Server.authenticate = authenticate
        this.Server.authorizePublish = authorizePublish
        this.Server.authorizeSubscribe = authorizeSubscribe
        logger.info('Mosca MQTT Broker Service: Started')
        if (callback) { callback(null) }
      })

      this.Server.on("error", function (err) {
          logger.error(err)
      })

      this.Server.on('clientConnected', (client) => {
          logger.info('MQTTS: Client Connected:', client.id)
          this.clientDisconnectCallbacks[client.id] = []
      })

      this.Server.on('clientDisconnected', (client) => {
          logger.info('MQTTS: Client Disconnected:', client.id)
          if (this.clientDisconnectCallbacks.hasOwnProperty(client.id)) {
            while (this.clientDisconnectCallbacks[client.id].length > 0) {
                (this.clientDisconnectCallbacks[client.id].shift())()
              }
            delete this.clientDisconnectCallbacks[client.id]
          }
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

      server.on('clientDisconnecting', function (client) {
          //logger.debug('clientDisconnecting := ', client.id)
      })
      */
  },

   /**
    * MQTT Server Stop Service
    * @method
    * @param {function} callback - Callback when service is and conneciton is clear.
    */
   stopService(callback) {
     if(this.Server){
         logger.info('Mosca MQTT Broker Service: Stopping')
         this.Server.close(() => {
           this.Server = null
           if (callback) { callback() }
         })
     } else {
         if(callback) { callback() }
     }
   },
 }
