const mongoose = require('mongoose')
const os = require('os')
const logger = require('../logger')
const config = require('../../config/config')
const mqtt = require('../mqtt')
const isy = require('../isy')
const child = require('../children')

var Settings = mongoose.model('Settings')
var User = mongoose.model('User')
var NodeServer = mongoose.model('NodeServer')

const apiSwitch = {
  addns: {
    props: ['name', 'profileNum'],
    func: NodeServer.addns,
    type: null
  },
  delns: {
    props: ['profileNum'],
    func: 'delns',
    type: 'nsmethod'
  },
  customparams: {
    props: ['profileNum'],
    func: 'customparams',
    type: 'nsmethod'
  },
  polls: {
    props: ['profileNum'],
    func: 'polls',
    type: 'nsmethod'
  },
  nodetypes: {
    props: [],
    func: NodeServer.getInstalledNodeTypes,
    type: null
  },
  installns: {
    props: ['name', 'url'],
    func: child.cloneRepo,
    type: null
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
  removenode: {
    props: ['profileNum'],
    func: 'removenode',
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
      const logFile = os.homedir() + '/.polyglot/log/debug.log'
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
  for (let key in message) {
    if (['node', 'seq'].includes(key)) continue
    logger.debug(JSON.stringify(key))
    try {
      let command = checkCommand(key)
      if (!command) continue //return logger.error(`FrontendP: ${key} not in API`)
      let props = verifyProps(message[key], apiSwitch[key].props)
      if (!props.valid) return logger.error(`FrontendP: ${key} NodeServer command was missing ${props.missing} ${JSON.stringify(message)}`)
      let result
      if (command.type === 'nsmethod') {
        result = await config.nodeServers[message[key].profileNum][command.func](message[key], key, true)
      } else {
        result = await command.func(message[key])
      }
      if (apiSwitch[key].hasOwnProperty('post')) apiSwitch[key].post()
      logger.debug(`1111 ${JSON.stringify(result)}`)
      mqtt.nsResponse(message, result.success, result.message, result.extra)
      NodeServer.sendUpdate()
    } catch (err) {
      logger.error(`FrontendP: ${key} NodeServer error ${err.message}`)
    }
  }
  /*
  if (message.hasOwnProperty('addns')) {
    if (message.addns.hasOwnProperty('name') && message.addns.hasOwnProperty('profileNum')) {
      NodeServer.addns(message.addns, (err, result, extra = {}) => {
        mqtt.nsResponse(message, err ? false : true, err ? err : result, extra)
        if (!err) NodeServer.sendUpdate()
      })
    } else {  }
  } else if (message.hasOwnProperty('delns')) {
    if (message.delns.hasOwnProperty('profileNum')) {
      if (config.nodeServers[message.delns.profileNum]) {
        let result, error
        try {
          result = await config.nodeServers[message.delns.profileNum].deleteNodeServer()
          NodeServer.sendUpdate()
        } catch (err) {
          error = true
          result = err.message
        }
        mqtt.nsResponse(message, error ? false : true, result)
      } else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.delns.profileNum} does not exist.`) }
    } else { logger.error('MQTT: Received Delete NodeServer command. profileNum was missing.') }
  } else if (message.hasOwnProperty('customparams')) {
    if (message.customparams.hasOwnProperty('profileNum')) {
      if (config.nodeServers[message.customparams.profileNum]) {
        config.nodeServers[message.customparams.profileNum].customparams(message.customparams, 'customparams', (err, result) => {
          mqtt.nsResponse(message, err ? false : true, err ? err : result)
          if (!err) NodeServer.sendUpdate()
        })
      } else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.customparams.profileNum} does not exist.`)  }
    } else { logger.error('MQTT: Received CustomParams for NodeServer command. profileNum was missing.') }
  } else if (message.hasOwnProperty('polls')) {
    if (message.polls.hasOwnProperty('profileNum')) {
      if (config.nodeServers[message.polls.profileNum]) {
        config.nodeServers[message.polls.profileNum].polls(message.polls, 'polls', (err, result) => {
          mqtt.nsResponse(message, err ? false : true, err ? err : result)
          if (!err) NodeServer.sendUpdate()
        })
      } else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.polls.profileNum} does not exist.`)  }
    } else { logger.error('MQTT: Received polls for NodeServer command. profileNum was missing.') }
  } else if (message.hasOwnProperty('nodetypes')) {
      NodeServer.getInstalledNodeTypes()
  } else if (message.hasOwnProperty('installns')) {
    child.cloneRepo(message, (err, result) => {
      if (err) {
        return mqtt.nsResponse(message, false, err)
      } else {
        logger.info(`NS: Successfully cloned ${message.installns.name} into NodeServer directory.`)
        child.runInstallProcess(message.installns.name)
        NodeServer.getInstalledNodeTypes()
        return mqtt.nsResponse(message, true, result)
      }
    })
  } else if (message.hasOwnProperty('uninstallns')) {
    NodeServer.deleteNSFolder(message, (err, result) => {
      if (err) { return mqtt.nsResponse(message, false, err) }
      else { return mqtt.nsResponse(message, true, result) }
    })
  } else if (message.hasOwnProperty('updatens')) {
    child.pullRepo(message, (err, result) => {
      if (err) {
        return mqtt.nsResponse(message, false, err)
      } else {
        logger.info(`NS: Successfully updated ${message.updatens.name} via git.`)
        child.runInstallProcess(message.updatens.name)
        NodeServer.getInstalledNodeTypes()
        return mqtt.nsResponse(message, true, result)
      }
    })
  } else  if (message.hasOwnProperty('rebootISY')) {
    logger.info('NS: Received request to reboot ISY. Rebooting now.')
    isy.reboot()
  } else  if (message.hasOwnProperty('removenode')) {
    logger.info(`NS: Received request to remove node: (${config.nodeServers[message.removenode.profileNum].name}) ${message.removenode.address} Proceeding...`)
    try {
      let result = await config.nodeServers[message.removenode.profileNum].removenode(message.removenode, 'removenode', true)
      return mqtt.nsResponse(message, true, result)
    } catch (err) {
      logger.error(`${config.nodeServers[message.removenode.profileNum].logPrefix} removenode catch: ${err}`)
      return mqtt.nsResponse(message, false, err.message)
    }
  } */
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
