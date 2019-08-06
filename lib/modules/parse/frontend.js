const mongoose = require('mongoose')
const os = require('os')
const logger = require('../logger')
const config = require('../../config/config')
const mqtt = require('../mqtt')
const isy = require('../isy')
const child = require('../children')
const NodeServer = require('../nodeserver')

var Settings = mongoose.model('Settings')
var User = mongoose.model('User')
//var NodeServer = mongoose.model('NodeServer')

const apiSwitch = {
  addns: {
    props: ['name', 'profileNum'],
    func: NodeServer.addns,
    type: null
  },
  delns: {
    props: ['profileNum'],
    func: NodeServer.delns,
    type: null
  },
  customparams: {
    props: ['profileNum'],
    func: NodeServer.customparams,
    type: 'nsmethod'
  },
  typedcustomdata: {
    props: ['profileNum'],
    func: NodeServer.typedcustomdata,
    type: 'nsmethod'
  },
  polls: {
    props: ['profileNum'],
    func: NodeServer.polls,
    type: null
  },
  nodetypes: {
    props: [],
    func: NodeServer.getInstalledNodeTypes,
    type: null
  },
  installns: {
    props: ['name', 'url'],
    func: child.cloneRepo,
    type: null,
    post: NodeServer.getInstalledNodeTypes
  },
  uninstallns: {
    props: ['name'],
    func: NodeServer.deleteNSFolder,
    type: null
  },
  updatens: {
    props: ['name'],
    func: child.pullRepo,
    type: null,
    post: NodeServer.getInstalledNodeTypes
  },
  rebootISY: {
    props: [],
    func: isy.reboot,
    type: null
  },
  restartPolyglot: {
    props: [],
    func: shutdown,
    type: null
  },
  removenode: {
    props: ['profileNum'],
    func: NodeServer.removenode,
    type: 'nsmethod'
  }
}

const verifyProps = (message, props) => {
  let confirm = {
    valid: true,
    missing: null
  }
  for (let prop of props) {
    if (!message.hasOwnProperty(prop)) {
      confirm.valid = false
      confirm.missing = prop
      break
    }
  }
  return confirm
}

function shutdown() {
  result = {
    success: true,
    message: 'Shutting down Polyglot'
  }
  process.kill(process.pid, "SIGINT")
  return result
}

const checkCommand = (command) => apiSwitch[command] || null

const connection = (message) => {
  if (message.node.toString().startsWith('polyglot_frontend-')) {
    logger.info(`MQTTP: Frontend Websockets interface ${message.connected ? 'Connected.' : 'Disconnected.'} `)
  }
}

const log = (message) => {
  if (message.hasOwnProperty('start')) {
    if (config.clientTails.hasOwnProperty(message.node)) {
      config.clientTails[message.node].unwatch()
      delete config.clientTails[message.node]
    }
    if (message.start === 'polyglot') {
      const logFile = config.polyDir + 'log/debug.log'
      NodeServer.readLogAndSend(message.node, 'polyglot', logFile)
    } else if ((config.nodeServers[message.start]) && config.nodeServers[message.start].profileNum === message.start) {
      if (config.nodeServers[message.start].type === 'local') {
        const logFile = config.nodeServers[message.start].homeDir + 'logs/debug.log'
        NodeServer.readLogAndSend(message.node, config.nodeServers[message.start].name, logFile)
      }
    }
  } else if (message.hasOwnProperty('stop')) {
    logger.debug('NS: Stopping log dump for client: ' + message.node)
    if (config.clientTails.hasOwnProperty(message.node)) {
      config.clientTails[message.node].unwatch()
    }
    delete config.clientTails[message.node]
  }
}

async function nodeservers(message) {
  logger.debug(JSON.stringify(message))
  for (let key in message) {
    if (['node', 'seq'].includes(key)) continue
    //logger.debug(JSON.stringify(key))
    try {
      let command = checkCommand(key)
      if (!command) continue //return logger.error(`FrontendP: ${key} not in API`)
      let props = verifyProps(message[key], apiSwitch[key].props)
      if (!props.valid) return logger.error(`FrontendP: ${key} NodeServer command was missing ${props.missing} ${JSON.stringify(message)}`)
      let result
      if (command.type === 'nsmethod') {
        let profileNum = message[key].profileNum
        result = await command.func.call(NodeServer, profileNum, message[key], key, true)
      } else {
        result = await command.func.call(NodeServer, message[key], key, true)
      }
      if (apiSwitch[key].hasOwnProperty('post')) apiSwitch[key].post()
      //logger.debug(`${JSON.stringify(result)}`)
      mqtt.nsResponse(message, result.success, result.message, result.extra)
      NodeServer.sendUpdate()
    } catch (err) {
      logger.error(`FrontendP: ${key} NodeServer error ${err.stack}`)
    }
  }
}

module.exports = {
  /**
  * Parse incoming Frontend messages
  * @method
  * @alias NodeServerModel.parseFrontend
  * @memberof module:models/nodeserver
  * @param {Object} message - Incoming JSON parsed object from the frontend. Only commands accepted are 'addns' and 'delns' currently
  */
  connection,
  log,
  nodeservers
}
