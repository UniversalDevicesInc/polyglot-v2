const logger = require('./logger')
const config = require('../config/config')

module.exports = {
  /**
   * MQTT Addsubscriptions to Polyglot topics and existing NodeServer topics.
   * @method
   */
  addSubscriptions() {
    let subscriptions = [
      'udi/polyglot/connections/#',
      'udi/polyglot/frontend/#',
      'udi/polyglot/frontend/settings',
      'udi/polyglot/frontend/nodeservers',
      'udi/polyglot/frontend/log',
      'udi/polyglot/ns/#',
      'ud/polyglot/profile/#'
    ]
    config.mqttClient.subscribe(subscriptions, (err, granted) => {
      granted.forEach((grant) => {
        logger.debug(`MQTTC: Subscribed to ${grant.topic} QoS ${grant.qos}`)
      })
    })
    config.mqttClient.publish('udi/polyglot/connections/polyglot', JSON.stringify({node: config.mqttClientId, connected: true}), { retain: true })
  },

  /**
   * MQTT Addsubscription to new NodeServer
   * @method
   * @param {number} profileNum - add new subscription to NodeServer with profileNum.
   */
  addSubscription(profileNum) {
    // TODO: remove this after a release or two
    config.mqttClient.publish('udi/polyglot/connections/frontend', null, { retain: true })
    let subscriptions = [`udi/polyglot/ns/${profileNum}`, `udi/polyglot/profile/${profileNum}`]
    config.mqttClient.subscribe(subscriptions, (err, granted) => {
      granted.forEach((grant) => {
        logger.debug(`MQTTC: Subscribed to ${grant.topic} QoS ${grant.qos}`)
      })
    })
  },

  delSubscription(profileNum) {
    config.mqttClient.publish('udi/polyglot/connections/' + profileNum, null, { retain: true })
    config.mqttClient.publish('udi/polyglot/ns/' + profileNum, null, {retain: true })
    //let subscriptions = [`udi/polyglot/ns/${profileNum}`, `udi/polyglot/profile/'${profileNum}`]
    //config.mqttClient.unsubscribe(subscriptions, (err) => {})
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
