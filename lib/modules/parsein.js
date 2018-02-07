const mongoose = require('mongoose')
const logger = require('./logger')
const config = require('../config/config')
const Upgrade = require('./upgrade')

var Settings = mongoose.model('Settings')
var User = mongoose.model('User')
var NodeServer = mongoose.model('NodeServer')

module.exports = {
    /**
     * MQTT Parse incoming message from MQTT
     * @method
     * @param {string} topic - topic received on.
     * @param {object} message - Dictionary object of message. JSON parsed into object.
     */
    async parse(topic, message) {
      //var parse = false
      if (! message) { return }
      if (message.hasOwnProperty('node')) {
        if (message.node === 'polyglot') { return }
        if (topic === 'udi/polyglot/frontend/settings') {
          Settings.updateSettings(message)
          return
        } else if (topic === 'udi/polyglot/frontend/nodeservers') {
          NodeServer.parseFrontend(message)
          return
        } else if (topic === 'udi/polyglot/frontend/log') {
          NodeServer.parseLog(message)
          return
        } else if (topic === 'udi/polyglot/frontend/upgrade') {
          Upgrade.upgrade(message)
          return
        }
        //Noisy
        logger.debug('MQTTC: Message: ' + topic + ": " + JSON.stringify(message))
        try {
          if (topic.substring(0,25) === 'udi/polyglot/connections/') {
            if (message.node.toString().substring(0,18) === 'polyglot_frontend-') {
              logger.info('MQTTC: Frontend Websockets interface ' + (message.connected ? 'Connected.' : 'Disconnected.'))
            } else if ((config.nodeServers[message.node]) && (message.node === config.nodeServers[message.node].profileNum)) {
                try {
                  config.inQ[message.node].push(async () => {
                    await config.nodeServers[message.node].checkCommand(message)
                  })
                } catch (e) {
                  logger.error(`MQTT CheckCommand Error: ${e}`)
                }
            }
          } else if ((topic.substring(0,16) === 'udi/polyglot/ns/') && ((topic.split("/").slice(-1)[0] === message.node) || (message.node.toString().substring(0,18) === 'polyglot_frontend-'))) {
            if ((config.nodeServers[message.node]) && (message.node === config.nodeServers[message.node].profileNum)) {
              try {
                config.inQ[message.node].push(async () => {
                  await config.nodeServers[message.node].checkCommand(message)
                })
              } catch (e) {
                logger.error(`MQTT CheckCommand Error: ${e}`)
              }
            }
          } else {
            logger.debug('MQTTC: Did not match any parse filters. Ignoring. This usually means ' +
             'the node value is incorrect. Make sure it matches an active NodeServer and you are publishing to the correct topic. ' + message)
          }
        } catch (err) {
          logger.error('MQTT Parse Error: ' + err)
        }
      } else {
        logger.error('MQTT Packet Did not have node key: ' + message)
      }
    }
}
