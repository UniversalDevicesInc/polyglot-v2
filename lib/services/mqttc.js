const mqtt = require('mqtt')

const logger = require('../modules/logger')
const config = require('../config/config')
const parse = require('../modules/parsein')
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
        keepalive: 60,
        clean: true,
        clientId: config.mqttClientId,
        username: config.mqttClientId,
        password: config.settings.secret,
        reconnectPeriod: 5000,
        will: { retain: true },
        key: config.settings.sslData.clientprivate,
        cert: config.settings.sslData.clientcert,
        ca: config.settings.sslData.cert
      }
      var host = config.settings.mqttHost
      var port = config.settings.mqttPort
      options['will']['topic'] = 'udi/polyglot/connections/polyglot'
      options['will']['payload'] = new Buffer(JSON.stringify({node: config.mqttClientId, 'connected': false}))
      //options['rejectUnauthorized'] = false
      config.mqttClient = mqtt.connect('mqtts://'+ host + ':' + port, options)
      config.mqttClient.on('connect', () => {
        config.mqttConnected = true
        mqttc.addSubscriptions()
      })

      config.mqttClient.on('message', (topic, payload) => {
        if (payload == null || payload == '' ) return
        try {
          payload = JSON.parse(payload.toString())
        } catch (e) {
          logger.error(`MQTTC: Badly formatted JSON input received: ${payload} - ${e}`)
        }
        parse.parse(topic, payload)
      })

      config.mqttClient.on('reconnect', () => {
        config.mqttConnected = false
        logger.info('MQTT attempting reconnection to broker...')
      })

      config.mqttClient.on('error', (err) => {
        logger.error('MQTT recieved error: ' + err.toString())
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
      mqttc.publish('udi/polyglot/connections/polyglot', {node: config.mqttClientId, 'connected': false}, { retain: true })
      logger.info('MQTT Client Services Stopping Gracefully.')
      config.mqttClient.end(true, () => {
        config.mqttClient = null
      })
    }
  },

}
