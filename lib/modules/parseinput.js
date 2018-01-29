const logger = require('../modules/logger')
const config = require('../config/config')
const upgrade = require('./upgrade')

const NodeServerModel = require('../models/nodeserver')
const SettingsModel = require('../models/settings')
const UserModel = require('../models/user')


function publish(topic, message, options, callback) {
  message = JSON.stringify(message)
  config.mqttClient.publish(topic, message, options, callback)
}

const topics = {
  'udi/polyglot/frontend/settings': SettingsModel.updateSettings,
  'udi/polyglot/frontend/nodeservers': NodeServerModel.parseFrontend,
  'udi/polyglot/frontend/log': NodeServerModel.parseLog,
  'udi/polyglot/frontend/upgrade': upgrade.upgrade,
  'udi/polyglot/connections/': frontendConnections,
  'udi/polyglot/ns/': nsMessages,
  'notfound': notFound
}

function frontendConnections (message) {
  logger.info('MQTTC: Frontend Websockets interface ' + (message.connected ? 'Connected.' : 'Disconnected.'))
}

async function nsMessages (message) {
  await config.nodeServers[message.node].checkCommand(message)
}

function notFound (message) {
  logger.error(`ParseInput: Invalid input: ${message}`)
}


module.exports = {
  parse(topic, message) {
    let fn
    if (topic.startsWith('udi/polyglot/connections/')) {
      fn = topics['udi/polyglot/connections/']
    } else if (topic.startsWith('udi/polyglot/ns/')) {
      fn = topics['udi/polyglot/ns']
      logger.debug('MQTTC: Message: ' + topic + ": " + JSON.stringify(message))
    } else {
      fn = (topics[topic] || topics['notfound'])
    }
    if (message.node.toString().startsWith('polyglot_frontend-')) {
      fn(message)
    } else if (topic.split("/").slice(-1)[0] === message.node) {
      try {
        config.inQ[message.node].push(fn(message))
      } catch (e) { logger.error(`ParseInput CheckCommand Error: ${e}`) }
    } else {
      logger.debug('MQTTC: Did not match any parse filters. Ignoring. This usually means ' +
       'the node value is incorrect. Make sure it matches an active NodeServer and you are publishing to the correct topic. ' + message)
    }
  },

}
