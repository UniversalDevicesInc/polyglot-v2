const logger = require('./logger')
const config = require('../config/config')

module.exports = {
  /**
   * MQTT Addsubscriptions to Polyglot topics and existing NodeServer topics.
   * @method
   */
  addSubscriptions() {
    config.mqttClient.subscribe('udi/polyglot/connections/#', (err, granted) => {
      if (err) {
        logger.error('Error: ' + err.toString())
        return
      }
      config.mqttConnected = true
      if (granted[0] && granted[0].hasOwnProperty('topic')) {
        logger.info('MQTTC: Subscribe Successful ' + granted[0]['topic'] + " QoS: " + granted[0]['qos'])
      }
      //this.publish('udi/polyglot/connections/polyglot', {node: config.mqttClientId, 'connected': true}, { retain: true })
    })
    config.mqttClient.subscribe('udi/polyglot/frontend/#')
    config.mqttClient.subscribe('udi/polyglot/frontend/settings')
    config.mqttClient.subscribe('udi/polyglot/frontend/nodeservers')
    config.mqttClient.subscribe('udi/polyglot/frontend/log')
    config.nodeServers.forEach((nodeServer) => {
      if (!(nodeServer.type === 'unmanaged')) this.addSubscription(nodeServer.profileNum)
    })
    },

  /**
   * MQTT Addsubscription to new NodeServer
   * @method
   * @param {number} profileNum - add new subscription to NodeServer with profileNum.
   */
  addSubscription(profileNum) {
    config.mqttClient.publish('udi/polyglot/ns/' + profileNum, null, {retain: true })
    config.mqttClient.publish('udi/polyglot/connections/' + profileNum, null, { retain: true })
    config.mqttClient.subscribe('udi/polyglot/ns/' + profileNum, (err, granted) => {
      if (err) { return logger.error('Error: ' + err.toString()) }
      if (granted[0]) {
        logger.info('MQTTC: Subscribe Successful ' + granted[0]['topic'] + " QoS: " + granted[0]['qos'])
      }
    })
    config.mqttClient.subscribe('udi/polyglot/profile/' + profileNum, (err, granted) => {
      if (err) { return logger.error('Error: ' + err.toString()) }
      if (granted[0] && granted[0].hasOwnProperty('topic')) {
        logger.info('MQTTC: Subscribe Successful ' + granted[0]['topic'] + " QoS: " + granted[0]['qos'])
      }
    })
  },

  delSubscription(profileNum) {
    config.mqttClient.publish('udi/polyglot/connections/' + profileNum, null, { retain: true })
    config.mqttClient.publish('udi/polyglot/ns/' + profileNum, null, {retain: true })
    config.mqttClient.unsubscribe('udi/polyglot/ns/' + profileNum, (err, granted) => {
      if (err) { return logger.error('Error: ' + err.toString()) }
      logger.info(`MQTTC: Unsubscribed Successfully from NodeServer ${profileNum} /ns`)
    })
    config.mqttClient.unsubscribe('udi/polyglot/profile/' + profileNum, (err, granted) => {
      if (err) { return logger.error('Error: ' + err.toString()) }
      logger.info(`MQTTC: Unsubscribed Successfully from NodeServer ${profileNum} /profile`)
    })
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

  nsResponse(message, success, msg, extra = null) {
    if (message.hasOwnProperty('seq')) {
      let response = {
        node: 'polyglot',
        seq: message.seq,
        response: {
          success: success,
          msg: msg
        }
      }
      if (extra) { response.response = Object.assign(response.response, extra) }
      if (response.response.success) {
        logger.debug(`NSResponse: Success: ${response.response.success} - ${response.response.msg}`)
      } else {
        logger.error(`NSResponse: Success: ${response.response.success} - ${response.response.msg}`)
      }
      this.publish('udi/polyglot/frontend/nodeservers', response)
    }
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
    config.mqttClient.publish(topic, message, options, callback)
  }

}
