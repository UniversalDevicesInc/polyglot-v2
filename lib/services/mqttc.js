const mqtt = require('mqtt')

const logger = require('../modules/logger')
const config = require('../config/config')
const parse = require('../modules/parse/mqtt')
const mqttc = require('../modules/mqtt')

/**
 * MQTT Client Module
 * @module services/mqttc
 * @version 2.0
 */

module.exports = {
  /**
   * MQTT Start Service and Connect via .env MQTT_HOST and MQTT_PORT provided.
   * @method
   * @param {function} callback - Callback when connected or if already started.
   */
  start() {
    if (!config.mqttClient) {
      var options = {
        keepalive: 0,
        clean: true,
        clientId: config.mqttClientId,
        username: config.mqttClientId,
        password: config.settings.secret,
        reconnectPeriod: 5000,
        connectTimeout: 30 * 1000,
        //will: { retain: true },
      }
      var host = config.settings.mqttHost
      var port = config.settings.mqttPort
      if (config.settings.useHttps) {
        options.key = config.settings.sslData.clientprivate
        options.cert = config.settings.sslData.clientcert
        options.ca = config.settings.sslData.cert
        options.rejectUnauthorized = true
      }
      //options['will']['topic'] = 'udi/polyglot/connections/polyglot'
      //options['will']['payload'] = new Buffer(JSON.stringify({node: config.mqttClientId, 'connected': false}))
      let mqttConnectString = `${config.settings.useHttps ? 'mqtts://' : 'mqtt://'}${host}:${port}`
      config.mqttClient = mqtt.connect(mqttConnectString, options)

      config.mqttClient.on('connect', () => {
        config.mqttConnected = true
        mqttc.addSubscriptions()
      })

      config.mqttClient.on('message', function (topic, payload, packet) {
        //logger.debug(packet.toString())
        if (payload == null || payload == '' ) return
        try {
          payload = JSON.parse(payload.toString())
          if (!payload.node || payload.node === 'polyglot') return
          let temp = topic.replace(/^udi\/polyglot\//i, '').split('/')
          topicObject = {
            base: temp[0],
            subject: temp[1]
          }
        } catch (e) {
          logger.error(`MQTTC: Badly formatted JSON input received: ${payload} - ${e}`)
          return
        }
        parse.parse(topicObject, payload)
      })

      config.mqttClient.on('reconnect', () => {
        config.mqttConnected = false
        logger.info('MQTT attempting reconnection to broker...')
      })

      config.mqttClient.on('error', (err) => {
        logger.error('MQTT received error: ' + err.toString())
      })

      logger.info('MQTT Client Service: Started')
    }
  },

  /**
   * MQTT Stop Service
   * @method
   * @param {function} callback - Callback when service is and conneciton is clear.
   */
  async stop() {
    if(config.mqttClient) {
      mqttc.publish('udi/polyglot/connections/polyglot', {node: config.mqttClientId, connected: false}, { retain: true })
      logger.info('MQTT Client Services Stopping Gracefully.')
      config.mqttClient.end(true, () => {
        config.mqttClient = null
      })
    }
  },

}
