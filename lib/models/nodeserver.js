const mongoose = require('mongoose')
const os = require('os')
const fs = require('fs-extra')
const path = require('path')
const async = require('async')
const queue = require('queue')

const logger = require('../modules/logger')
const config = require('../config/config')
const encrypt = require('../modules/encryption')
const mqtt = require('../modules/mqtt')
const child = require('../modules/children')
const isy = require('../modules/isy')


/**
 * NodeServer Model and Parent Class. AddNS uses 'new NodeServerModel' to reference the NodeServerSchema parent class to create a new MongoDB document via Mongoose
 * @module models/nodeserver
 * @version 2.0
 */

/**
 * MongoDB - Driver Child Schema
 * @class DriverSchema
 * @extends NodeSchema
 * @param {string} driver - Driver Name e.g. 'ST', 'RR', 'GV1', etc
 * @param {string} value - String representation of the value of the driver.
 * @param {number} uom - Integer of the UOM representing the value of the driver.
 */
const DriverSchema = mongoose.Schema({
  driver: {
    type: String,
    required: true
  },
  value: {
    type: String,
    default: null
  },
  uom: {
    type: Number,
    default: null
  }
}, { usePushEach: true })

/**
 * MongoDB - Nodes Child Schema
 * @class NodeSchema
 * @extends NodeServerModel
 * @param {string} address - Node address value e.g. 'lifxcontrol'
 * @param {boolean} added - Represents if the node is added and present in the ISY.
 * @param {boolean} enabled - Represents the enabled state of the node.
 * @param {string} name - Descriptive name of the node.
 * @param {string} node_def_id - Node Definition ID represented in the profile.zip for this node type.
 * @param {string} timeAdded - DateString in epoch of when the node was added to Polyglot
 * @param {string} primary - The node address of the nodes primary parent node. This could be itself in some cases.
 * @param {boolean} isprimary - Is this node a primary for other nodes.
 * @param {Object} drivers - Array of DriverSchema Objects
 */
const NodeSchema = mongoose.Schema({
  address: {
    type: String,
    required: true
  },
  added: {
    type: Boolean,
    default: false
  },
  enabled: {
    type: Boolean,
    default: true
  },
  name: {
    type: String,
    required: true
  },
  node_def_id: {
    type: String,
    default: null
  },
  timeAdded: {
    type: String,
    default: + new Date()
  },
  primary: {
    type: String,
    default: null
  },
  isprimary: {
    type: Boolean,
    default: false
  },
  drivers: [DriverSchema]
}, { usePushEach: true })

/**
 * MongoDB - NodeServer Parent Schema for creating a new NodeServer Database Object
 * @class NodeServerModel
 * @param {string} name - NodeServer name that is displayed in Polyglot. e.g. 'LiFX' or 'Nest'
 * @param {string} profileNum - ProfileNumber of the NodeServer. This must be a unique number
 between 1 - 10 that is not already defined in ISY.
 * @param {boolean} encryptPayload - Should we encrypt the payload using our .env secret? *[NOT IMPLEMENTED YET]*
 * @param {string} token - Encryption token taken from the .env file and saved to the DB *[NOT IMPLEMENTED YET]*
 * @param {string} timeAdded - DateString in epoch of when the NodeServer was added to Polyglot
 * @param {boolean} isConnected - Is Polyglot Connected to MQTT?
 * @param {string} logPrefix - Allows for custom logPrefixes to be defined per NodeServer if needed.
 * @param {Object} nodes - Array of NodeSchema Objects
 */
const NodeServerSchema = mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  profileNum: {
    type: String,
    required: true,
    unique: true
  },
  encryptPayload: {
    type: Boolean,
    default: false
  },
  token: {
    type: String,
    default: encrypt.encryptText(encrypt.randomString(25))
  },
  isyPassword: {
    type: String,
    default: encrypt.randomAlphaOnlyString(10)
  },
  timeAdded: {
    type: String,
    default: + new Date()
  },
  isConnected: {
    type: Boolean,
    default: false
  },
  logPrefix: {
    type: String,
    default: null
  },
  customParams: {
    type: Object,
    default: {}
  },
  customData: {
    type: Object,
    default: {}
  },
  type: {
    type: String,
    default: 'local'
  },
  logFile: {
    type: String,
    default: 'logs/debug.log'
  },
  homeDir: {
    type: String,
    default: ''
  },
  serverType: {
    type: String,
    default: ''
  },
  executable: {
    type: String,
    default: ''
  },
  shortPoll: {
    type: Number,
    default: 10
  },
  longPoll: {
    type: Number,
    default: 30
  },
  notices: {
    type: Array,
    default: []
  },
  nodes: [NodeSchema]
}, { usePushEach: true })

NodeServerSchema.statics = {

  async wait(ms) {
    await new Promise(resolve => setTimeout(() => resolve(), ms));
  },

  /**
  * Sends an update to the frontend topic on detection of a change in NodeServer properties or
  sub properties like driver updates or state changes.
  * @method
  * @alias NodeServerModel.sendUpdate
  * @memberof module:models/nodeserver
  * @returns {object} response - MQTT Message sent to the frontends. e.g.:
  {"nodeservers":[{"name":"LiFX","profileNum":"8","nodes":[{"address":"lifx_1234","name":"LIFX_Lamp","_id":"59338d1c2930bf7cc92842d1","drivers": [{"driver":"ST","_id":"59338624cd92117adb9349ca","uom":20,"value":"123.3"},{"driver":"GV5","_id":"59338624cd92117adb9349c9","uom":23,"value":"10"}], "isprimary":true,"primary":"lifx_1234","timeAdded":"1496550684087","node_def_id":"lifxcolor","enabled":true,"added":true},{"address":"lifx_1235", "name":"Z_Strip","_id":"59339445c67c877e13e4d941","drivers": [{"driver":"ST","_id":"59339445c67c877e13e4d943","uom":56,"value":"593.3"}, {"driver":"GV1","_id":"59339445c67c877e13e4d942","uom":20,"value":"10"}],"isprimary":false,"primary":"lifx_1234","timeAdded":"1496552508813", "node_def_id":"lifxcolor","enabled":true,"added":true}],"token":null,"encryptPayload":false,"timeAdded":"1496545371618","isConnected":true}]}
  */
  async sendUpdate()  {
    let ns = await this.find({}, null, {sort: {'profileNum': 1}})
    mqtt.publish('udi/polyglot/frontend/nodeservers', {node: 'polyglot', nodeservers: ns}, {retain: true})
  },

  /**
  * Frontend called method to add a new NodeServer
  * @method
  * @alias NodeServerModel.addns
  * @memberof module:models/nodeserver
  * @param {string} name - Name of NodeServer being added
  * @param {number} profileNum - Profile Number of NodeServer being added
  * @param {addnsCallback} callback - Callback with response JSON
  * @returns {object} response -
  AddNS:
  {"addns":{"name":"Test123","profileNum":"10"},"seq":53407}
  Success:
  {"seq":53407,"response":{"success":true,"msg":"Installed into ISY sucessfully. Reboot the ISY and upload the profile.zip","nodeserver":{"name":"Test123","profileNum":"10"}}}
  Fail:
  {"seq":53408,"response":{"success":false,"msg":"NodeServer with that Profile Number already exists."}}
  */
  addns(data, callback) {
    let nsData = {
      name: data.name,
      profileNum: data.profileNum,
      logPrefix: `${data.name}(${data.profileNum}):`,
      type: data.type,
    }
    if (data.type === 'local') {
      let nsDir = `${os.homedir()}/.polyglot/nodeservers/${data.path}/`
      nsData['homeDir'] = nsDir
      if (fs.existsSync(nsDir + 'server.json') && fs.existsSync(nsDir + 'profile.zip')) {
        logger.debug('NS: Add Nodeserver, found server.json and profile.zip... proceeding.')
        let server = JSON.parse(fs.readFileSync(nsDir + 'server.json', 'utf8'))
        if (server.hasOwnProperty('shortPoll')) { nsData['shortPoll'] = server.shortPoll }
        if (server.hasOwnProperty('longPoll')) { nsData['longPoll'] = server.longPoll }
        if (server.hasOwnProperty('type')) { nsData['serverType'] = server.type }
        if (server.hasOwnProperty('executable')) { nsData['executable'] = server.executable }
      } else {
        if (callback) { return callback(`${data.name}(${data.profileNum}): local NodeServer server.json or profile.zip not found.`) } else return
      }
    }
    let newNodeServer = new this(nsData)
    const query = {profileNum: newNodeServer.profileNum}
    this.findOne(query, (err, node) => {
      if (err) { if (callback) { return callback(`${data.name}(${data.profileNum}): ${err}`) } else return }
      if (node) {
        if (callback) { return callback(`${data.name}(${data.profileNum}): NodeServer with that Profile Number already exists.`) } else return
      } else {
        newNodeServer.installNodeServer((err, message) => {
          if (err) {
            logger.error(`${newNodeServer.logPrefix} Unable to register ${newNodeServer.name} with ISY. Reason: ${err}`)
            newNodeServer.remove()
            if (callback) { return callback(`${data.name}(${data.profileNum}): ${err}`) } else return
          } else {
            newNodeServer.save((err, node) => {
              if (err) { if (callback) { return callback(`${data.name}(${data.profileNum}): ${err}`) } else return }
              if (!node) {
                if (callback) { return callback(`${data.name}(${data.profileNum}): Failed to save NodeServer to database.`) } else return
              } else {
                logger.info('Registered new ' + node.type + ' NodeServer: ' + node.name + '(' + node.profileNum + ')')
                config.nodeServers[node.profileNum] = node
                this.sendUpdate()
                mqtt.addSubscription(node.profileNum)
                if (node.type === 'local') {
                  logger.info(`Waiting 10 seconds before starting ${node.name} for the first time.`)
                  config.installedNSTypes.push(node.name)
                  node.createQueues()
                  setTimeout(() => {
                    child.runChildNodeServer(node)
                  }, 10000)
                }
                if (callback) return callback(null, message, {
                  nodeserver: {
                    name: node.name,
                    profileNum: node.profileNum
                  }
                })
              }
            })
          }
        })
      }
    })
  },

  /**
  * Parse incoming log request messages
  * @method
  * @alias NodeServerModel.parseLog
  * @memberof module:models/nodeserver
  * @param {Object} message - Incoming JSON parsed object from the frontend. Only commands accepted are 'addns' and 'delns' currently
  */
  parseLog(message) {
    if (message.hasOwnProperty('node')) {
      if (message.hasOwnProperty('start')) {
        if (config.clientTails.hasOwnProperty(message.node)) {
          config.clientTails[message.node].unwatch()
          delete config.clientTails[message.node]
        }
        if (message.start === 'polyglot') {
          const logFile = os.homedir() + '/.polyglot/log/debug.log'
          this.readLogAndSend(message.node, 'polyglot', logFile)
        } else if ((config.nodeServers[message.start]) && config.nodeServers[message.start].profileNum === message.start) {
          if (config.nodeServers[message.start].type === 'local') {
            const logFile = config.nodeServers[message.start].homeDir + 'logs/debug.log'
            this.readLogAndSend(message.node, config.nodeServers[message.start].name, logFile)
          }
        }
      } else if (message.hasOwnProperty('stop')) {
        logger.debug('NS: Stopping log dump for client: ' + message.node)
        if (config.clientTails.hasOwnProperty(message.node)) {
          config.clientTails[message.node].unwatch()
        }
        delete config.clientTails[message.node]
      }
    } else {
      logger.error('NS: Received malformed log request.')
    }
  },

  /**
  * Read Log File and send to frontend client.
  * @method
  * @alias NodeServerModel.readLogAndSend
  * @memberof module:models/nodeserver
  * @param {String} node - Node Name of frontend client.
  * @param {String} name - Common Name of Node Server eg. LiFX
  * @param {String} logFile - Exact path to logfile
  */
  readLogAndSend(node, name, logFile) {
    var topic = 'udi/polyglot/frontend/log/' + node
    logger.debug('NS: Starting log dump of ' + name + ' log file to frontend client: ' + node)
    //This works 1000 times faster to stream it than bulk read it first
    if (fs.existsSync(logFile)) {
      var rs = fs.createReadStream(logFile)
      rs.on('data', (chunk) => {
        var logPacket = {
          node: 'polyglot',
          log: chunk.toString('utf8')
        }
        mqtt.publish(topic, logPacket)
      })
      rs.on('end', () => {
        Tail = require('tail').Tail
        config.clientTails[node] = new Tail(logFile)
        config.clientTails[node].on('line', (data) => {
          var logPacket = {
            node: 'polyglot',
            log: data
          }
          try {
            mqtt.publish(topic, logPacket)
          } catch (e) {
            logger.error(`readLogAndSend Error: ${e}`)
          }
        })
        config.clientTails[node].on('error', (err) => {
          logger.error(`readLogAndSend Error: ${err}`);
        })
      })
    }
  },

  /**
  * Read Log File and send to frontend client.
  * @method
  * @alias NodeServerModel.removeLog
  * @memberof module:models/nodeserver
  * @param {String} clientId - Client ID of frontend client.
  * @param {Object} tail - The tail instance of the logfile.
  */
  removeLog(clientId, tail) {
    logger.debug('NS: Terminating log tail for frontend client: ' + clientId)
    tail.unwatch()
  },

  /**
  * Parse incoming Frontend messages
  * @method
  * @alias NodeServerModel.parseFrontend
  * @memberof module:models/nodeserver
  * @param {Object} message - Incoming JSON parsed object from the frontend. Only commands accepted are 'addns' and 'delns' currently
  */
  async parseFrontend(message) {
    if (message.hasOwnProperty('addns')) {
      if (message.addns.hasOwnProperty('name') && message.addns.hasOwnProperty('profileNum')) {
        this.addns(message.addns, (err, result, extra = {}) => {
          mqtt.nsResponse(message, err ? false : true, err ? err : result, extra)
          if (!err) this.sendUpdate()
        })
      } else { logger.error('MQTT: Received Add NodeServer command. name or profileNum was missing.') }
    } else if (message.hasOwnProperty('delns')) {
      if (message.delns.hasOwnProperty('profileNum')) {
        if (config.nodeServers[message.delns.profileNum]) {
          let result, error
          try {
            result = await config.nodeServers[message.delns.profileNum].deleteNodeServer()
            this.sendUpdate()
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
            if (!err) this.sendUpdate()
          })
        } else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.customparams.profileNum} does not exist.`)  }
      } else { logger.error('MQTT: Received CustomParams for NodeServer command. profileNum was missing.') }
    } else if (message.hasOwnProperty('polls')) {
      if (message.polls.hasOwnProperty('profileNum')) {
        if (config.nodeServers[message.polls.profileNum]) {
          config.nodeServers[message.polls.profileNum].polls(message.polls, 'polls', (err, result) => {
            mqtt.nsResponse(message, err ? false : true, err ? err : result)
            if (!err) this.sendUpdate()
          })
        } else { mqtt.nsResponse(message, false, `NodeServer with the profile number: ${message.polls.profileNum} does not exist.`)  }
      } else { logger.error('MQTT: Received polls for NodeServer command. profileNum was missing.') }
    } else if (message.hasOwnProperty('nodetypes')) {
        this.getInstalledNodeTypes()
    } else if (message.hasOwnProperty('installns')) {
      child.cloneRepo(message, (err, result) => {
        if (err) {
          return mqtt.nsResponse(message, false, err)
        } else {
          logger.info(`NS: Successfully cloned ${message.installns.name} into NodeServer directory.`)
          child.runInstallProcess(message.installns.name)
          this.getInstalledNodeTypes()
          return mqtt.nsResponse(message, true, result)
        }
      })
    } else if (message.hasOwnProperty('uninstallns')) {
      this.deleteNSFolder(message, (err, result) => {
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
          this.getInstalledNodeTypes()
          return mqtt.nsResponse(message, true, result)
        }
      })
    } else if (message.hasOwnProperty('rebootISY')) {
      logger.info('NS: Received request to reboot ISY. Rebooting now.')
      isy.reboot()
    } else if (message.hasOwnProperty('removenode')) {
      logger.info(`NS: Received request to remove node: (${config.nodeServers[message.removenode.profileNum].name}) ${message.removenode.address} Proceeding...`)
      try {
        let result = await config.nodeServers[message.removenode.profileNum].removenode(message.removenode, 'removenode', true)
        return mqtt.nsResponse(message, true, result)
      } catch (err) {
        logger.error(`${config.nodeServers[message.removenode.profileNum].logPrefix} removenode catch: ${err}`)
        return mqtt.nsResponse(message, false, err.message)
      }
    }
  },

  deleteNSFolder(message, callback) {
    if (!message.uninstallns.hasOwnProperty('name'))
      return callback(`DeleteNS Folder: name is required.`)
    if (config.nodeServers.findIndex(ns => ns && ns.name === message.uninstallns.name) > -1)
      return callback(`DeleteNS Folder: ${message.uninstallns.name} is still active. Please delete it from the Dashboard first before uninstalling it here.`)
    if (message.uninstallns.name.includes('..'))
      return callback(`DeleteNS Folder: cannot have .. in name. Don't be that guy.`)
    try {
      let nsPath = `${os.homedir()}/.polyglot/nodeservers/${message.uninstallns.name}/`
      fs.removeSync(nsPath)
      this.getInstalledNodeTypes()
      return callback(null, `DeleteNS Folder: Successfully deleted ${message.uninstallns.name} folder.`)
    } catch (e) {
      return callback(`DeleteNS Folder: Error deleting ${message.uninstallns.name} folder: ${e.toString()}`)
    }
  },

  getInstalledNodeTypes() {
    var nsDir = os.homedir() + '/.polyglot/nodeservers/'
    let nsTypes = {}
    nsTypes.notInUse = []
    nsTypes.installed = []
    if (fs.existsSync(nsDir)) {
      var nsDirs = fs.readdirSync(nsDir).filter(f => fs.statSync(path.join(nsDir, f)).isDirectory())
      nsDirs.forEach((nodeType) => {
        try {
          let server = JSON.parse(fs.readFileSync(nsDir + nodeType + '/server.json', 'utf8'))
          if (server.hasOwnProperty('type') && server.hasOwnProperty('executable') && server.hasOwnProperty('credits') && server.credits[0].hasOwnProperty('version')) {
            nsTypes.installed.push(server)
            if (!(config.installedNSTypes.includes(nodeType))) {
              server['_folder'] = nodeType
              nsTypes.notInUse.push(server)
            }
          }
        } catch (e) {
          logger.error('NS: Error getting server.json required fields. name and executable are required. - ' + e)
        }
      })
      let response = {
        node: 'polyglot',
        nodetypes: nsTypes
      }
      mqtt.publish('udi/polyglot/frontend/nodeservers', response)
    }
    return nsTypes
  },

  /**
  * Get all NodeServers from MongoDB
  * @method
  * @alias NodeServerModel.getAllNodeServers
  * @memberof module:models/nodeserver
  * @param {findArrayCallback} callback - Callback Passed into the Mongoose find method.
  * @returns {findArrayCallback}
  */
  getAllNodeServers(callback) {
    return NodeServerModel.find({}, null, {sort: {'profileNum': 1}}, callback)
  },

  /**
  * Load all NodeServers from MongoDB on Polyglot Start-up
  * @method
  * @alias NodeServerModel.loadNodeServers
  * @memberof module:models/nodeserver
  * @param {errOnlyCallback} callback - Callback returned when complete
  */
  async loadNodeServers() {
    try {
      let nodes = await this.find({})
      if (nodes) {
        let i
        for (i = 0; i < nodes.length; i++) {
          let ns = nodes[i]
          if ((ns.get('profileNum')) && (ns.get('name')) && (ns.get('type'))) {
            logger.debug(`NodeServer ${ns.name} [${ns.profileNum}] added to running config.`)
            config.nodeServers[ns.profileNum] = ns
            if (ns.type != 'unmanaged') {
              if (!ns.notices) { ns.notices = [] }
              ns.createQueues()
              ns.wipeDuplicateNodes()
            }
            if (ns.type === 'local') {
              config.installedNSTypes.push(ns.name)
              child.runChildNodeServer(ns)
            }
          }
        }
        logger.debug('MongoDB: ' + i + ' NodeServer(s) retrieved from database')
      } else {
        logger.debug('MongoDB: No NodeServers found in database')
      }
      await this.verifyNonManagedNodeServers()
      this.pollNonManagedServers()
      this.sendUpdate()
      isy.getVersion()
    } catch (err) {
      logger.error(`loadNodeServers: Error: ${err}`)
    }
  },

  /**
  * Check all the existing slots in the ISY for NodeServers.
  * @method
  * @alias NodeServerModel.checkExistingNodeServers
  * @memberof module:models/nodeserver
  * @param {Function} callback - Callback with an Object of NodeServers currently installed in ISY. { 1: 'LiFX', 5: 'Nest' }
  */
  async checkExistingNodeServers() {
    let foundNS = {}
    try {
      let results = await isy.handleRequestP('0', {api: 'profiles/ns/0/connection'}, 'restcall', true)
      if (results) {
        let i = 0
        if (results.isyresponse.hasOwnProperty('connections') && results.statusCode === 200) {
          if (Array.isArray(results.isyresponse.connections.connection)) {
            results.isyresponse.connections.connection.forEach((nodeServer) => {
              foundNS[nodeServer.profile] = nodeServer.name
              i++
            })
          } else {
            foundNS[results.isyresponse.connections.connection.profile] = results.isyresponse.connections.connection.name
            i++
          }
          for (j = 0; j < config.nodeServers.length; j++) {
            let nodeServer = config.nodeServers[j]
            if (nodeServer && nodeServer.type === 'unmanaged' ) {
              if (!(foundNS.hasOwnProperty(nodeServer.profileNum)))  {
                logger.info(`NS: ${nodeServer.name} Unmanaged NodeServer no longer found in the ISY. Removing from Polyglot`)
                await nodeServer.remove()
                delete config.nodeServers[nodeServer.profileNum]
                NodeServerModel.sendUpdate()
              }}}
        } else {
          logger.error(`ISY returned status code: ${results.statusCode}`)
        }}
    } catch (err) {
      logger.error(`NS checkExistingNodeServers Error: ${err}`)
    }
    return foundNS
  },

  /**
  * Check all the existing slots in the ISY for NodeServers and add or remove them from our running database on Polyglot.
  * @method
  * @alias NodeServerModel.verifyNonManagedNodeServers
  * @memberof module:models/nodeserver
  */
  async verifyNonManagedNodeServers() {
    try {
      if (!config.settings.isyConnected) { return }
      let isyNodeServers = await NodeServerModel.checkExistingNodeServers()
      for (let i = 0; i < Object.keys(isyNodeServers).length; i++) {
        key = Object.keys(isyNodeServers)[i]
        if (!key) { continue }
        let node = await NodeServerModel.findOne({ profileNum: key })
        if (!node) {
          let newNodeServer = new NodeServerModel({
            name: isyNodeServers[key],
            profileNum: key,
            logPrefix: `${isyNodeServers[key]}(${key}):`,
            type: 'unmanaged'
          })
          await newNodeServer.save()
          logger.info('NS: Registered new unmanaged NodeServer: ' + newNodeServer.name + '(' + newNodeServer.profileNum + ')')
          config.nodeServers[newNodeServer.profileNum] = newNodeServer
          NodeServerModel.sendUpdate()
        }
      }
    } catch (err) {
      logger.error(`nNS: ${err}`)
    }
  },

  /**
  * Started on Initial DB load on program init. This polls the NodeServer list on ISY every 60 seconds and syncs.
  * @method
  * @alias NodeServerModel.verifyNonManagedNodeServers
  * @memberof module:models/nodeserver
  */
  pollNonManagedServers() {
    setInterval(this.verifyNonManagedNodeServers, 5 * 60000)
  }

}

NodeServerSchema.methods = {
  print () {
    return config.nodeServers[this.profileNum]
  },

  /**
  * Instance Method for NodeServer to return a JSON object of itself.
  * @function toJSON
  * @alias NodeServerModel.toJSON
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @returns {Object} nodeserver - Returns JSON parsed Object representation of the NodeServer
  */
  toJSON() {
    let {name, profileNum, nodes, longPoll, shortPoll, executable, serverType, homeDir, token, timeAdded, isConnected, customParams, customData, type, logDir, notices} = this
    return JSON.parse(JSON.stringify({name, profileNum, nodes, longPoll, shortPoll, executable, serverType, homeDir, token, timeAdded, isConnected, customParams, customData, notices, type, logDir}))
  },

  createQueues() {
    var options = {
      autostart: true,
      concurrency: 2
    }
    config.inQ[this.profileNum] = queue(options)
  },

  /**
  * Instance Method for NodeServer to check input from MQTT and execute function if successful.
  * Valid Commands: ['status', 'addnode','removenode', 'restcall', 'request', 'config', 'connected', 'command']
  * @function checkCommand
  * @alias NodeServerModel.checkCommand
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  */
  async checkCommand(data) {
    let validCommands = ['status', 'addnode','removenode', 'restcall', 'request', 'config', 'connected', 'command', 'customparams', 'installprofile', 'stop', 'start', 'restart', 'customdata', 'addnotice', 'removenotice']
    for (var prop in data) {
      if (prop === 'node') { continue }
      if (validCommands.indexOf(prop) < 0) {
        logger.error(`${this.logPrefix} ${prop} not in valid commands list`)
        continue
      }
      logger.info(`${this.logPrefix} Processing command: ${prop}`)
      if (data.hasOwnProperty(prop)) {
        await (this[prop] || this['notfound']).call(this, data[prop], prop)
        break
      } else {
        logger.debug(`${this.logPrefix} Property not found in input: ${data}`)
      }
    }
  },

  wipeDuplicateNodes() {
    let real = []
    for (i in this.nodes) {
      if (this.nodes[i].address !== null && this.nodes[i].address !== undefined) {
        if (real.includes(this.nodes[i].address)) {
          this.nodes.splice(i, 1)
        } else {
          real.push(this.nodes[i].address)
        }
      }
    }
    logger.debug(`${this.logPrefix} total number of nodes: ${real.length} ${JSON.stringify(real)}`)
  },

  /**
  * Instance Method for NodeServer to handle 'status'
  * @function status
  * @alias NodeServerModel.status
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {object} data - JSON parsed from incoming command message e.g.
  {"address": "lifx_1234", "driver": "GV6", "value": 50.2, "uom": 20}
  * @param {string} command - The command received: 'status'
  * @returns {object} response -
  ONLY if an error occurs will a MQTT response message will be sent back to the NodeServer:
  {"result":{"isyresponse":"","statusCode":404,"seq":false,"elapsed":"9.735427ms","profileNum":"8","status":{"success":false,"reason":"lifx_1234 or GV18 does not exist","address":"lifx_1234"}}}
  */
  async status(data, command) {
    try {
      let result = await isy.handleRequestP(this.profileNum, data, command, false)
      if (result && result.statusCode === 404) {
        let reason = `${data.address} or ${data.driver} does not exist - ISY returned ${result.statusCode}`
        this.sendResult(command, result, false, reason, {address: data.address})
        logger.error(`${this.logPrefix} ${reason}`)
      } else if (result && result.statusCode === 200) {
        let success = false
        let ns = await NodeServerModel.findOne({profileNum: this.profileNum, 'nodes.address': data.address}).exec()
        let node = ns.nodes.findIndex(n => n.address === data.address)
        if (node > -1) {
          let driver = ns.nodes[node].drivers.findIndex(d => d.driver === data.driver)
          if (driver > -1) {
              ns.nodes[node].drivers[driver].value = data.value
              ns.nodes[node].drivers[driver].uom = data.uom
              ns.markModified(ns.nodes[node].drivers[driver])
              success = true
              await ns.save()
              let reason = `${data.address} ${data.driver} set sucessfully to ${data.value}`
              //this.sendResult(command, result, true, reason, {address: data.address})
              logger.info(`${this.logPrefix} ${reason}`)
              NodeServerModel.sendUpdate()
              this.config()
          }
        }
        if (!success) {
          let reason = `${data.address} driver ${data.driver} does not exist in the Polyglot database.`
          this.sendResult(command, result, false, reason, {address: data.address})
          logger.error(`${this.logPrefix} ${reason}`)
        }
      }
    } catch (err) {
      logger.error(`${this.logPrefix} NS Status Error: ${err}`)
    }
  },

  /**
  * Instance Method for NodeServer to handle 'command'
  * @function command
  * @alias NodeServerModel.command
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {object} data - JSON parsed from incoming message e.g.
  {"address": "lifx_1234", "command": "DON", "value": 50.2, "uom": 20}
  * @param {string} command - The command received: 'command'
  * @returns {object} response -
  Success: {"result":{"isyresponse":{"RestResponse":{"succeeded":"true","status":"200","reason":{"code":"0"}}},"statusCode":200,"seq":false,"elapsed":"19.073624ms","profileNum":"8","command":{"success":true,"reason":"lifx_1234 DON sent sucessfully with 50.2","address":"lifx_1234"}}}
  Fail: {"result":{"isyresponse":{"RestResponse":{"succeeded":"false","status":"400","reason":{"code":"2101"}}},"statusCode":400,"seq":false,"elapsed":"10.852264ms","profileNum":"8","command":{"success":false,"reason":"lifx_123 or asdf does not exist or is incorrect","address":"lifx_123"}}}
  */
  async command(data, command) {
    try {
      let result = await isy.handleRequestP(this.profileNum, data, command, true)
      if (! result ) { return }
      if (result.statusCode === 404 || result.statusCode === 400) {
        let reason = `${data.address} or ${data.command} does not exist or is incorrect`
        this.sendResult(command, result, false, reason, {address: data.address})
        logger.error(`${this.logPrefix} ${reason}`)
      } else if (result.statusCode === 200){
        let reason = `${data.address} ${data.command} sent sucessfully with ${data.value}`
        this.sendResult(command, result, true, reason, {address: data.address})
        logger.info(`${this.logPrefix} ${reason}`)
        NodeServerModel.sendUpdate()
      }
    } catch (err) {
      logger.error(`${this.logPrefix} NS Command Error: ${err}`)
    }
  },

  /**
  * Instance Method for NodeServer to handle 'restcall'
  * @function restcall
  * @alias NodeServerModel.restcall
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {object} data - JSON parsed from incoming message e.g.
  {"api":"nodes/n001_d073d51327cc","seq":10068,"timeout":null}
  * @param {string} command - The command received: 'restcall'
  * @returns {object} response -
  Success: {"result":{"isyresponse":{"nodeInfo":{"node":{"flag":"0","nodeDefId":"lifxcolor","address":"n001_d073d51327cc","name":"LIFX Lamp","family":{"instance":"1","$t":"10"},"parent":{"type":"1","$t":"n001_lifxcontrol"},"type":"1.1.0.0","enabled":"true","deviceClass":"0","wattage":"0","dcPeriod":"0","startDelay":"0","endDelay":"0","pnode":"n001_lifxcontrol","ELK_ID":"A07"},"properties":{}}},"statusCode":200,"seq":10068,"elapsed":"29.861932ms","profileNum":"8","restcall":{"success":true,"reason":"nodes/n001_d073d51327cc executed sucessfully","api":"nodes/n001_d073d51327cc"}}}
  Fail: {"result":{"isyresponse":{"RestResponse":{"succeeded":"false","status":"404"}},"statusCode":404,"seq":10068,"elapsed":"15.433125ms","profileNum":"8","restcall":{"success":false,"reason":"ISY Returned 404 for nodes/n001_d073d51327c","api":"nodes/n001_d073d51327c"}}}
  */
  async restcall(data, command) {
    try {
      let result = await isy.handleRequestP(this.profileNum, data, command, true)
      if (! result ) { return }
      if (result.statusCode === 404) {
        let reason = `ISY Returned 404 for ${data.api}`
        this.sendResult(command, result, false, reason, {api: data.api})
        logger.error(`${this.logPrefix} ${reason}`)
      } else if (result.statusCode === 200){
        let reason = `${data.api} executed sucessfully`
        this.sendResult(command, result, true, reason, {api: data.api})
        logger.info(`${this.logPrefix} ${reason}`)
      }
    } catch (err) {
      logger.error(`${this.logPrefix} NS RestCall Error: ${err}`)
    }
  },

  async addnotice(data, command) {
    try {
      this.notices.push(data)
      await this.save()
      logger.info(`NS addnotice: ${this.name} added notice sucessfully: ${data}`)
      NodeServerModel.sendUpdate()
      this.config()
    } catch (err) {
      logger.error(`NS removenotice error: ${err}`)
    }
  },

  async removenotice(data, command) {
    try {
      this.notices.splice(parseInt(data), 1)
      await this.save()
      logger.info(`NS removenotice: ${this.name} removed notice sucessfully.`)
      NodeServerModel.sendUpdate()
      this.config()
    } catch (err) {
      logger.error(`NS removenotice error: ${err}`)
    }
  },

  /**
  * Instance Method for NodeServer to handle 'addnode'
  * @function addnode
  * @alias NodeServerModel.addnode
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {object} data - JSON parsed from incoming message e.g.
  {"nodes": [{"address": "lifx_1236","name": "LIFX_Lamp2","node_def_id": "lifxcolor","primary": "lifx_1234","drivers": [{"driver": "ST","value": "123.3","uom": 20},{"driver": "GV5","value": "10","uom": 23}]}], "seq": 1000}
  * @param {string} command - The command received: 'addnode'
  * @returns {object} response -
  Success: {"result":{"isyresponse":"","statusCode":200,"seq":1000,"elapsed":"100.425214ms","profileNum":"8","addnode":{"success":true,"reason":"node lifx_1236 added successfully.","address":"lifx_1236"}}}
  Fail: {"result":{"isyresponse":"","statusCode":200,"seq":false,"elapsed":"25.251796ms","profileNum":"8","addnode":{"success":false,"reason":"lifx_1235 already exists on ISY","address":"lifx_1235"}}}
  */
  async addnode(data, command) {
    if (!Array.isArray(data.nodes)) return logger.error(`${this.logPrefix} - nodes must be an array.`)
    let primaryNodes = []
    for (i in data.nodes) {
      if (data.nodes[i].address === data.nodes[i].primary) {
        primaryNodes.push(data.nodes.splice(i, 1)[0])
      }
    }
    try {
      await Promise.all(primaryNodes.map(node => this.doNodeAdd(node, command, data)))
      await Promise.all(data.nodes.map(node => this.doNodeAdd(node, command, data)))
      NodeServerModel.sendUpdate()
      this.config()
      logger.info(`${this.logPrefix} completed adding node(s).`)
    } catch (err) {
      logger.error(`${this.logPrefix} Error adding node: ${err.message}`)
    }
  },

  async doNodeAdd(node, command, data) {
    if (!Array.isArray(node.drivers)) {
      let reason = `${node.address} drivers must be an array.`
      this.sendResult(command, results, false, reason, {address: node.address})
      throw new Error(reason)
    }
    let newNode = {
      address: node.address,
      name: node.name,
      node_def_id: node.node_def_id,
      primary: node.primary,
      drivers: node.drivers,
      isprimary: false,
      added: false,
      controller: false,
      seq: data.seq ? data.seq : false
    }

    let primaryFound = false
    if (newNode.address === newNode.primary) {
      newNode.isprimary = true
      primaryFound = true
    } else {
      const doc = await NodeServerModel.findOne({profileNum: this.profileNum, 'nodes.address': newNode.primary}).exec()
      if (doc) {
        primaryFound = true
      }
      for (i in this.nodes) {
        if (this.nodes[i].address === newNode.primary) {
          if (!(this.nodes[i].primary === this.nodes[i].address)) {
            let reason = `${newNode.primary} is not a primary. Only single layer nesting allowed.`
            this.sendResult(command, {profileNum: this.profileNum}, false, reason, {address: newNode.address})
            throw new Error(result)
          } else {
            this.nodes[i].isprimary = true
            primaryFound = true
          }
        }
      }
    }
    if (!primaryFound) {
      let reason = `Primary node ${newNode.primary} was not found in nodes.`
      this.sendResult(command, {}, false, reason, {address: newNode.address})
      throw new Error(reason)
    } else {
      let result
      try {
        result = await isy.handleRequestP(this.profileNum, newNode, command, true)
      } catch (err) {
        logger.error(`${this.logPrefix} NS doNOdeAdd Error: ${err}`)
      }
      if (result && result.statusCode == 400) {
        logger.debug(`ISY 400 Add Response: ${newNode.address} Reason: ${result.isyresponse.RestResponse.reason.code}`)
        if (result.isyresponse.RestResponse.reason.code === '5004') {
          newNode.added = true
          logger.debug(`${newNode.address} already exists in ISY.`)
        } else {
          let reason = `${newNode.address} was not added sucessfully. ISY returned Reason: ${result.isyresponse.RestResponse.reason.code}`
          this.sendResult(command, {profileNum: this.profileNum}, false, reason, {address: newNode.address})
          logger.error(`${this.logPrefix} ${reason}`)
          throw new Error(reason)
        }
      } else if (result && result.statusCode == 200) {
          newNode.added = true
      }
      if (newNode.added === true) {
        let reason
        const raw = await NodeServerModel.updateOne({profileNum: this.profileNum, 'nodes.address': newNode.address}, { $set: { 'nodes.$': newNode }})
        if (raw.nModified === 0) {
          await NodeServerModel.update({profileNum: this.profileNum, 'nodes.address': { $ne: newNode.address}}, { $push: { nodes: newNode }})
          reason = `AddNode: ${newNode.address} added to database successfully.`
        } else {
          reason = `AddNode: ${newNode.address} updated in database successfully.`
        }
        this.sendResult(command, result, true, reason, {address: newNode.address})
        logger.info(`${this.logPrefix} ${reason}`)
      }
    }
  },

  /**
  * Instance Method for NodeServer to handle 'removenode'
  * @function removenode
  * @alias NodeServerModel.removenode
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {object} data - JSON parsed from incoming message e.g.
  {"node": "1", "removenode": {"address": "lifx_1234", "seq": 1004}}
  * @param {string} command - The command received: 'removenode'
  * @returns {object} response -
  Success: {"result":{"isyresponse":{"RestResponse":{"succeeded":"true","status":"200","reason":{"code":"0"}}},"statusCode":200,"seq":1004,"elapsed":"99.309321ms","profileNum":"8","removenode":{"success":true,"reason":"lifx_1235 removed successfully"}}}
  Fail: {"result":{"isyresponse":{"RestResponse":{"succeeded":"false","status":"403","reason":{"code":"5106"}}},"statusCode":403,"seq":1004,"elapsed":"17.747168ms","profileNum":"8","removenode":{"success":false,"reason":"Could not remove lifx_1234. It is the primary for another node."}}}
  */
  async removenode(data, command, frontend) {
    try {
      let success = false
      let reason = null
      let message = `${data.address} removed successfully`
      let result = await isy.handleRequestP(this.profileNum, data, command, true)
      if (result) {
        if (result.statusCode === 200) {
          let node = this.nodes.find(n => n.address === data.address)
          if (node) {
              await node.remove()
              success = true
              await this.save()
          } else { reason = `Node not found.` }
        } else if (result.statusCode === 403) {
          if (result.isyresponse.RestResponse.reason.code === "5106") {
            reason = `Could not remove ${data.address}. It is the primary for another node.`
          } else if (result.isyresponse.RestResponse.reason.code === "5003") {
            reason = `Could not remove ${data.address}. It doesn't exist in ISY. Will remove from DB if it exists.`
            let node = this.nodes.find(n => n.address === data.address)
            if (node) {
              await node.remove()
              success = true
              this.save()
            } else { reason = `Node not found.` }
          } else { reason = `Could not remove ${data.address}. ISY sent 403.` }
        } else { reason = `ISY sent invalid result code.` }
      } else { reason = `ISY did not respond` }
      if (success) {
        logger.info(`${this.logPrefix} node ${message}`)
        if (!frontend) { this.sendResult(command, result, success, message) }
        NodeServerModel.sendUpdate()
        this.config()
        return message
      } else {
        if (!frontend) { this.sendResult(command, result, success, reason) }
      }
    } catch (err) {
      logger.error(`${this.logPrefix} ${reason}`)
      throw err
    }
  },

  /**
  * Instance Method to Query for Nodes for this NodeServer from ISY
  * This happens at Polyglot Startup to Sync the ISY and Polyglot Database
  * @function getNodesFromISY
  * @alias NodeServerModel.getNodesFromISY
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {errOnlyCallback} callback - Callback when complete with only parameter being an error if there was one.
  */
  async getNodesFromISY() {
    try {
        let results = await isy.handleRequestP(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection'}, 'restcall', true)
        if (!results) {
          logger.error(`getNodesFromISY: No results received from ISY.`)
          return
        }
        if (results.isyresponse.connections.connection && results.statusCode === 200) {
          if (this.profileNum === results.isyresponse.connections.connection.profile) {
            logger.info(`${this.logPrefix} - NodeServer found on ISY with the name ${results.isyresponse.connections.connection.name}. Checking for Nodes...`)
            for (let i = 0; i < this.nodes.length; i++) {
              let node = this.nodes[i]
              if (node.isprimary) {
                try {
                  let result = await isy.handleRequestP(this.profileNum, {api: 'nodes/' + isy.addNodePrefix(this.profileNum, node.address)}, 'restcall', true)
                  if (result.statusCode === 404) {
                    logger.info(`${this.logPrefix} ${node.address} doesn't exist in ISY. Adding...`)
                    await this.doNodeAdd(node, 'addnode', {seq: false})
                  } else {
                    logger.info(`${this.logPrefix} ${node.address} already exists in ISY. Skipping...`)
                  }
                } catch (err) {
                  logger.error(`${this.logPrefix} NS getNodesFromISY-primary Error: ${err}`)
                }
              }
            }
            for (let i = 0; i < this.nodes.length; i++) {
              let node = this.nodes[i]
              if (!node.isprimary) {
                try {
                  let result = await isy.handleRequestP(this.profileNum, {api: 'nodes/' + isy.addNodePrefix(this.profileNum, node.address)}, 'restcall', true)
                  if (result.statusCode === 404) {
                    logger.info(`${this.logPrefix} ${node.address} doesn't exist in ISY. Adding...`)
                    await this.doNodeAdd(node, 'addnode', {seq: false})
                  } else {
                    logger.info(`${this.logPrefix} ${node.address} already exists in ISY. Skipping...`)
                  }
                } catch (err) {
                  logger.error(`${this.logPrefix} NS getNodesFromISY-primary Error: ${err}`)
                }
              }
            }}}
            logger.info(`${this.logPrefix} Completed ReSync with ISY.`)
    } catch (err) {
      logger.error(`${this.logPrefix} NS getNodesFromISY Error: ${err}`)
    }
  },

  /**
  * Instance Method to install this NodeServer to ISY automatically. This kicks off immediately after
  NodeServer is added to Polyglot via the frontend.
  * @function installNodeServer
  * @alias NodeServerModel.installNodeServer
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {responseCallback} callback - (err, response) Callback when complete with error if present, or response if no error.
  */
  installNodeServer(callback) {
    logger.info(`${this.logPrefix} Attempting to install ${this.name} NodeServer into ISY.`)
    isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection'}, 'restcall', true, (results) => {
      if (!results.isyresponse.connections.connection && results.statusCode === 200) {
        let args = {
          ip: config.settings.ipAddress,
          baseurl: '/ns/' + this.profileNum,
          name: this.name,
          nsuser: 'polyglot',
          nspwd: this.isyPassword,
          isyusernum: 0,
          port: config.settings.listenPort,
          timeout: 0,
          ssl: true,
          enabled: true
        }
        isy.handleRequest(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection/set/network', args: args}, 'restcall', true, (results) => {
          if (results.statusCode !== 200) {
            let message = `Failed to install NodeServer. ISY responded with other than 200.`
            callback(message)
          } else {
            this.installprofile({'reboot': false}, null, (err) => {
              if (err) {
                callback(err)
              } else {
                let message = `Installed into ISY sucessfully. Profile.zip installed.`
                logger.info(`${this.logPrefix} ${message}`)
                callback(null, message)
              }
            })
          }
        })
      } else if (results.isyresponse.connections.connection && results.statusCode === 200){
        let message = 'That Profile already exists on the ISY.'
        logger.error(`${this.logPrefix} ${message}`)
        callback(message)
      } else {
        let message = 'ISY sent a bad status code or did not respond. Check your settings.'
        logger.error(`${this.logPrefix} ${message}`)
        callback(message)
      }
    })
  },

  installprofile (data, command, cb = function(){}) {
    if (this.type !== 'local') { if (cb) return cb(`${this.name} is not installed. Updating code from Github but ignoring profile update request.`)}
    const JSZip = require('jszip')
    var profile = `${this.homeDir}profile.zip`
    var importTypes = ['nodedef', 'editor', 'nls']
    fs.readFile(profile, (err, filedata) => {
      if (err) return logger.debug(err)
      JSZip.loadAsync(filedata).then((zip) => {
        importTypes.forEach((type) => {
          zip.folder(type).forEach((path, file) => {
            file.async('text').then(async (data) => {
              try {
                await isy.profileUpload(type, `${type}/${path}`, data, this.profileNum)
              } catch (err) {
                logger.debug(`installprofile: Failed to install ${type}/${path}.`)
              }
            })
          })
        })
        if (data && data.hasOwnProperty('reboot')) {
          if (data.reboot === true) {
            setTimeout(() => {
              isy.reboot()
            }, 10000)
          }
        }
        if (cb) { return cb(err) } else { return }
      })
    })
  },

  /**
  * Instance Method to delete this NodeServer from ISY automatically. This kicks off immediately after
  NodeServer is deleted via the frontend.
  * @function deleteNodeServer
  * @alias NodeServerModel.deleteNodeServer
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {responseCallback} callback - (err, response) Callback when complete with error if present, or response if no error.
  */
  async deleteNodeServer() {
    try {
      let message = `${this.logPrefix} `
      logger.info(`${this.logPrefix} attempting to delete NodeServer ${this.name}`)
      mqtt.makeResponse(this.profileNum, 'delete', {})
      logger.info(`${this.logPrefix} deleting ${this.name}'s nodes from ISY.`)
      if (this.type === 'local') {
        var index = config.installedNSTypes.indexOf(this.name)
        if (index > -1) { config.installedNSTypes.splice(index, 1) }
      }
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        let node = this.nodes[i]
        if (!node.isprimary) {
          try {
            await this.removenode(node, 'removenode', false)
          } catch (err) { }
        }
      }
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        let node = this.nodes[i]
          try {
            await this.removenode(node, 'removenode', false)
          } catch (err) { }
      }
      let result = await isy.handleRequestP(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection/remove'}, 'restcall', true)
      if (result.statusCode === 200) {
        await this.remove()
        message += 'Succesfully removed NodeServer. Restart the admin console.'
        mqtt.delSubscription(this.profileNum)
        if (this.type === 'local') {
          await NodeServerModel.wait(5000)
          await child.stopChildNodeServer(config.nodeServers[this.profileNum])
          delete config.nodeServers[this.profileNum]
          NodeServerModel.sendUpdate()
        }
      } else {
        message += `ISY returned something other than 200, this usually means the NodeServer is out of range. Deleting from DB... `
        await this.remove()
        message += 'Success'
      }
      logger.info(`${this.logPrefix} ${message}`)
      return message
    } catch (err) {
        logger.error(`${this.logPrefix} NS deleteNodeServer Error: ${err}`)
        throw err
    }
  },

  /**
  * Instance Method to Send a result message to the NodeServer via MQTT
  * @function sendResult
  * @alias NodeServerModel.sendResult
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {string} command - Command NodeServer is sending a result for.
  * @param {Object} result - The result object data.
  * @param {boolean} success - True/false
  * @param {string} reason - Sucess reason
  * @param {Object} extra - Extra Parameters to send to the NodeServer if needed.
  */
  sendResult(command, result, success, reason, extra = null) {
    result[command] = {
      success: success,
      reason: reason
    }
    if (extra) { result[command] = Object.assign(result[command], extra) }
    mqtt.makeResponse(this.profileNum, 'result', result)
  },

  /**
   * Sends the shortPoll/longPoll message to the NS
  **/
  sendPoll(type) {
    mqtt.makeResponse(this.profileNum, type, {})
  },

  /**
  * Instance Method to handle 'request' from NodeServer
  * @function request
  * @alias NodeServerModel.request
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {Object} data -
  {"node": "8", "request": {"requestId": "3949", "success": true}}
  * @param {string} command - This command 'request'.
  * @returns {Object} result -
  Responds only on failure.
  Fail:
  {"result":{"isyresponse":"","statusCode":404,"seq":false,"elapsed":"8.202375ms","profileNum":"8","request":{"success":false,"reason":"ISY Returned 404 for request ID: 22","id":"22"}}}
  */
  request(data, command) {
    isy.handleRequest(this.profileNum, data, command, false, (result) => {
      if (! result ) { return }
      if (result.statusCode === 404 || result.statusCode === 400) {
        let reason = `ISY Returned 404 for request ID: ${data.requestId}`
        this.sendResult(command, result, false, reason, {id: data.requestId})
        logger.error(`${this.logPrefix} ${reason}`)
      } else if (result.statusCode === 200){
        let reason = `${data.requestId} reported sucessfully as ${data.success}`
        this.sendResult(command, result, true, reason, {id: data.requestId})
        logger.info(`${this.logPrefix} ${reason}`)
      }
    })
  },

  /**
  * Instance Method to handle 'config' from NodeServer
  * @function config
  * @alias NodeServerModel.config
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {Object} data -
  {"node": "1", "config": null, "seq": 1000}
  * @param {string} command - This command 'config'.
  * @returns {Object} response -
  Returns existing NodeServer configuration:
  {"config":{"name":"LiFX","profileNum":"8","nodes":[{"address":"lifx_1234","name":"LIFX_Lamp2","drivers":[{"driver":"ST","uom":20,"value":"123.3"},{"driver":"GV5","uom":23,"value":"10"}],"isprimary":true,"primary":"lifx_1234","timeAdded":"1496550684087","node_def_id":"lifxcolor","enabled":true,"added":true},{"address":"lifx_1235","name":"TouchMe","drivers":[{"driver":"ST","uom":56,"value":"593.3"},{"driver":"GV1","uom":20,"value":"10"}],"isprimary":false,"primary":"lifx_1234","timeAdded":"1496552508813","node_def_id":"lifxcolor","enabled":true,"added":true}],"token":null,"encryptPayload":false,"timeAdded":"1496545371618","isConnected":false}}
  */
  async config(data = null, command = null) {
    // Hack to deepcopy this.nodes
    const doc = await NodeServerModel.findOne({profileNum: this.profileNum}).exec()
    config.nodeServers[this.profileNum] = doc
    var parseConfig = doc.toJSON()
    parseConfig.isyVersion = config.settings.isyVersion
    parseConfig._id = undefined
    parseConfig.nodes.forEach((node) => {
      if (node !== null) {
        node._id = undefined
        node.drivers.forEach((driver) => {
          if (driver !== null) {
            driver._id = undefined
          } else (logger.error(node))
        })
      }
    })
    mqtt.makeResponse(this.profileNum, 'config', parseConfig)
  },

  /**
  * Instance Method to handle 'connected' from NodeServer
  * @function connected
  * @alias NodeServerModel.connected
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {Object} data -
  {"node": "1", "connected": true} or
  {"node": "1", "connected": false}
  * @param {string} command - This command 'connected'.
  */
  async connected(data, command) {
      this.isConnected = data
      await this.save()
      let primary = this.nodes[0]
      if (primary && primary.added && primary.isprimary) {
        if (data) {
          child.startPolls(this)
          this.config()
        } else {
          child.stopPolls(this)
          let update = {
            address: primary.address,
            driver: 'ST',
            value: '0',
            uom: '2'
          }
          this.status(update, 'status')
        }
      } else {
        child.startPolls(this)
        this.config()
      }
      logger.info(`${this.logPrefix} NodeServer ${(data ? 'Connected.' : 'Disconnected.')}`)
      NodeServerModel.sendUpdate()
  },

  /**
  * Instance Method for NodeServer to handle 'customparams'
  * @function customparams
  * @alias NodeServerModel.customparams
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {object} data - JSON parsed from incoming message e.g.
  {"nodes": [{"address": "lifx_1236","name": "LIFX_Lamp2","node_def_id": "lifxcolor","primary": "lifx_1234","drivers": [{"driver": "ST","value": "123.3","uom": 20},{"driver": "GV5","value": "10","uom": 23}]}], "seq": 1000}
  * @param {string} command - The command received: 'addnode'
  * @returns {object} response -
  Success: {"result":{"isyresponse":"","statusCode":200,"seq":1000,"elapsed":"100.425214ms","profileNum":"8","addnode":{"success":true,"reason":"node lifx_1236 added successfully.","address":"lifx_1236"}}}
  Fail: {"result":{"isyresponse":"","statusCode":200,"seq":false,"elapsed":"25.251796ms","profileNum":"8","addnode":{"success":false,"reason":"lifx_1235 already exists on ISY","address":"lifx_1235"}}}
  */
  async customparams(data, command, callback) {
    logger.info(`NS: Recieved updated Custom Parameters for ${this.name}. Updating database.`)
    delete data.profileNum
    this.customParams = data
    await this.save()
    NodeServerModel.sendUpdate()
    this.config()
    if (callback) { return callback(null, 'Custom Parameters saved to database sucessfully.') }
  },

  async customdata(data, command) {
    logger.info(`NS: Recieved updated Custom Data for ${this.name}. Updating database.`)
    delete data.profileNum
    this.customData = data
    await this.save()
    this.config()
  },

  async polls(data, command, callback) {
    if (data.hasOwnProperty('shortPoll') && data.hasOwnProperty('longPoll')) {
      this.shortPoll = data.shortPoll
      this.longPoll = data.longPoll
      child.stopPolls(this)
      child.startPolls(this)
      logger.info(`NS: Recieved updated Poll Parameters for ${this.name}. Short: ${this.shortPoll} Long: ${this.longPoll}`)
      this.save()
      if (callback) { return callback(null, 'Poll Parameters saved to database sucessfully.') }
    } else {
      if (callback) { return callback(null, 'shortPoll or longPoll missing from update message. Nothing Changed.') }
    }
  },

  async start(data, command) {
    if (!child.nodeProcesses[this.profileNum]) {
      child.runChildNodeServer(config.nodeServers[this.profileNum])
    } else {
      logger.info(`${this.logPrefix}: Already started. Ignoring start command.`)
    }
  },

  async stop(data = null, command = null) {
    if (child.nodeProcesses[this.profileNum]) {
      mqtt.makeResponse(this.profileNum, 'stop', {})
      await wait(1000)
      await child.stopChildNodeServer(config.nodeServers[this.profileNum])
    } else {
      logger.info(`${this.logPrefix}: Not running. Ignoring stop command.`)
    }
  },

  async restart(data, command) {
    this.stop()
    setTimeout(() => {
      this.start()
    }, 3000)
  },

  notfound(data, command) {
    logger.info(`${this.logPrefix} command not found: ${command}`)
  }

}
const NodeServerModel = mongoose.model('NodeServer', NodeServerSchema)
