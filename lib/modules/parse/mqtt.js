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
        await config.nodeServers[message.node].checkCommand(message)
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

    /*
    if (topic === 'udi/polyglot/frontend/settings') {
      settings.updateSettings(message)
      return
    } else if (topic === 'udi/polyglot/frontend/nodeservers') {
      frontend.nodeservers(message)
      return
    } else if (topic === 'udi/polyglot/frontend/log') {
      frontend.log(message)
      return
    } else if (topic === 'udi/polyglot/frontend/upgrade') {
      upgrade.upgrade(message)
      return
    }
    //Noisy
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
      }
    } catch (err) {
      logger.error('MQTT Parse Error: ' + err)
    } */
  }
}
