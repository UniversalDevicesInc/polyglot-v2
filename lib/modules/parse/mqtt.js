const mongoose = require('mongoose')
const logger = require('../logger')
const config = require('../../config/config')
const upgrade = require('../upgrade')
const frontend = require('./frontend')

var Settings = mongoose.model('Settings')
var User = mongoose.model('User')
var NodeServer = mongoose.model('NodeServer')



async function nsCommand (message) {
  logger.debug(`MQTTP: nsCommand Message: ${JSON.stringify(message)}`)
  if (config.nodeServers[message.node] &&
    ((message.node === config.nodeServers[message.node].profileNum) ||
    (message.node.toString().substring(0,18) === 'polyglot_frontend-'))) {
    try {
      config.inQ[message.node].push(async () => {
        config.nodeServers[message.node].checkCommand(message)
      })
    } catch (e) {
      logger.error(`MQTTP: CheckCommand Error: ${e}`)
    }
  } else {
    logger.error(`MQTTP: Packet Did not have node key or it didn\'t match an installed nodeserver: ${JSON.stringify(message)}`)
  }
}

function notfound (message) {
  logger.debug('MQTTP: Did not match any parse filters. Ignoring. This usually means ' +
   'the node value is incorrect. Make sure it matches an active NodeServer and you are publishing to the correct topic. ' + message)
}

var topics = {
  frontend: {
    settings: Settings.updateSettings,
    nodeservers: frontend.nodeservers,
    log: frontend.log,
    upgrade: upgrade.upgrade,
    ns: (message) => logger.debug(`MQTTP: Frontend topic not found.`)
  },
  connections: {
    frontend: frontend.connection,
    ns: nsCommand
  },
  ns: {
    ns: nsCommand
  }
}

const checkTopic = (topic) => {
  return topics[topic.base][topic.subject] || topics[topic.base]['ns'] || notfound
}

module.exports = {
  /**
   * MQTT Parse incoming message from MQTT
   * @method
   * @param {string} topic - topic received on.
   * @param {object} message - Dictionary object of message. JSON parsed into object.
   */
  async parse(topic, message) {
    // lookup object literal for frontend
    return checkTopic(topic)(message)

  }
}
