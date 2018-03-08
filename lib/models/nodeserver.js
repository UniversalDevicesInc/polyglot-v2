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
    default: Date.now()
  },
  isConnected: {
    type: Boolean,
    default: false
  },
  mqttClientID: {
    type: String,
    default: null
  },
  timeStarted: {
    type: String,
    default: null
  },
  currentVersion: {
    type: String,
    default: null
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
  async addns(data) {
    try {
      let newNodeServer
      let result = {
        message: null,
        success: false,
        extra: {},
      }
      let nsData = {
        name: data.name,
        profileNum: data.profileNum,
        logPrefix: `${data.name}(${data.profileNum}):`,
        type: data.type,
      }
      if (data.type === 'local') {
        let nsDir = `${os.homedir()}/.polyglot/nodeservers/${data.path}/`
        nsData['homeDir'] = nsDir
        if (fs.existsSync(nsDir + 'server.json') && fs.existsSync(nsDir + 'profile')) {
          logger.debug('NS: Add Nodeserver, found server.json and profile folder... proceeding.')
          let server = JSON.parse(fs.readFileSync(nsDir + 'server.json', 'utf8'))
          if (server.hasOwnProperty('shortPoll')) { nsData['shortPoll'] = server.shortPoll }
          if (server.hasOwnProperty('longPoll')) { nsData['longPoll'] = server.longPoll }
          if (server.hasOwnProperty('type')) { nsData['serverType'] = server.type }
          if (server.hasOwnProperty('executable')) { nsData['executable'] = server.executable }
        } else {
          throw new Error(`${data.name}(${data.profileNum}): local NodeServer server.json or profile.zip not found.`)
        }
      }
      newNodeServer = new NodeServerModel(nsData)
      const query = { profileNum: newNodeServer.profileNum }
      let node = await NodeServerModel.findOne(query)
      if (node) {
        throw new Error(`${data.name}(${data.profileNum}): NodeServer with that Profile Number already exists.`)
      }
      result.message = await newNodeServer.installNodeServer()
      await newNodeServer.save()
      logger.info('Registered new ' + newNodeServer.type + ' NodeServer: ' + newNodeServer.name + '(' + newNodeServer.profileNum + ')')
      config.nodeServers[newNodeServer.profileNum] = newNodeServer
      NodeServerModel.sendUpdate()
      mqtt.addSubscription(newNodeServer.profileNum)
      if (newNodeServer.type === 'local') {
        logger.info(`Waiting 10 seconds before starting ${newNodeServer.name} for the first time.`)
        config.installedNSTypes.push(newNodeServer.name)
        newNodeServer.createQueues()
        setTimeout(() => {
          child.runChildNodeServer(newNodeServer)
        }, 10000)
      }
      result.extra = {
        nodeserver: {
          name: newNodeServer.name,
          profileNum: newNodeServer.profileNum
        }
      }
      result.success = true
      return result
    } catch (err) {
      if (newNodeServer) {
        newNodeServer.remove()
        if (config.nodeServers[newNodeServer.profileNum]) config.nodeServers[newNodeServer.profileNum] = null
      }
      result.message = err.message
      logger.error(`addNodeServer ${result.message}`)
      return result
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
          config.clientTails[node].unwatch()
          delete config.clientTails[node]
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
    delete config.clientTails[message.node]
  },

  deleteNSFolder(message) {
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    if (config.nodeServers.findIndex(ns => ns && ns.name === message.name) > -1)
      throw new Error(`DeleteNS Folder: ${message.name} is still active. Please delete it from the Dashboard first before uninstalling it here.`)
    if (message.name.includes('..'))
      throw new Error(`DeleteNS Folder: cannot have .. in name. Don't be that guy.`)
    try {
      let nsPath = `${os.homedir()}/.polyglot/nodeservers/${message.name}/`
      fs.removeSync(nsPath)
      NodeServerModel.getInstalledNodeTypes()
      result.message = `DeleteNS Folder: Successfully deleted ${message.name} folder.`
      result.success = true
      return result
    } catch (err) {
      result.message = `DeleteNS Folder: Error deleting ${message.name} folder: ${err.message}`
      logger.error(`${this.logPrefix} delns Error: ${err}`)
      return result
    }
  },

  getInstalledNodeTypes(message = null) {
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
        let i = 0
        for (let ns of nodes) {
          //let ns = nodes[i]
          if ((ns.get('profileNum')) && (ns.get('name')) && (ns.get('type'))) {
            logger.debug(`NodeServer ${ns.name} [${ns.profileNum}] added to running config.`)
            i++
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
          for (let nodeServer of config.nodeServers) {
            //let nodeServer = config.nodeServers[j]
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
      for (let key in isyNodeServers) {
        //key = Object.keys(isyNodeServers)[i]
        //if (!key) { continue }
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
    let {name, profileNum, nodes, longPoll, shortPoll, executable, serverType, homeDir, token, timeAdded, timeStarted, currentVersion, isConnected, customParams, customData, type, logDir, notices} = this
    return JSON.parse(JSON.stringify({name, profileNum, nodes, longPoll, shortPoll, executable, serverType, homeDir, token, timeAdded, timeStarted, currentVersion, isConnected, customParams, customData, notices, type, logDir}))
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
        if (prop === 'addnode') {
          config.addQ.unshift(async () => {
            await (this[prop] || this['notfound']).call(this, data[prop], prop)
          })
        }
        else {
          config.addQ.unshift(async () => {
            (this[prop] || this['notfound']).call(this, data[prop], prop)
          })
        }
        break
      } else {
        logger.debug(`${this.logPrefix} Property not found in input: ${data}`)
      }
    }
  },

  wipeDuplicateNodes() {
    let real = []
    for (let node of this.nodes) {
      if (node.address !== null && node.address !== undefined) {
        if (real.includes(node.address)) {
          this.nodes.splice(i, 1)
        } else {
          real.push(node.address)
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
        if (!ns) return
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
      logger.error(`${this.logPrefix} NS Status Error: ${err.stack}`)
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
      } else if (result.statusCode === 200) {
        let reason = `${data.address} :: ${data.command} sent sucessfully`
        if (data.value)
          reason += ` with value: ${data.value}`
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
    try {
      if (!Array.isArray(data.nodes)) return logger.error(`${this.logPrefix} - nodes must be an array.`)
      let primaryNodes = []
      for (i in data.nodes) {
        if (data.nodes[i].address === data.nodes[i].primary) {
          primaryNodes.push(data.nodes.splice(i, 1)[0])
        }
      }
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
      for (let node of this.nodes) {
        if (node.address === newNode.primary) {
          if (!(node.primary === node.address)) {
            let reason = `${newNode.primary} is not a primary. Only single layer nesting allowed.`
            this.sendResult(command, {profileNum: this.profileNum}, false, reason, {address: newNode.address})
            throw new Error(result)
          } else {
            node.isprimary = true
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
        logger.error(`${this.logPrefix} NS doNodeAdd Error: ${err}`)
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
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    try {
      result.message = `${data.address} removed successfully`
      let results = await isy.handleRequestP(this.profileNum, data, command, true)
      if (results) {
        if (results.statusCode === 200) {
          let node = this.nodes.find(n => n.address === data.address)
          if (node) {
              await node.remove()
              result.success = true
              await this.save()
          } else { throw new Error(`Node not found.`) }
        } else if (results.statusCode === 403) {
          if (results.isyresponse.RestResponse.reason.code === "5106") {
            throw new Error(`Could not remove ${data.address}. It is the primary for another node.`)
          } else if (results.isyresponse.RestResponse.reason.code === "5003") {
            logger.debug(`Could not remove ${data.address}. It doesn't exist in ISY. Will remove from DB if it exists.`)
            let node = this.nodes.find(n => n.address === data.address)
            if (node) {
              await node.remove()
              result.success = true
              this.save()
            } else { throw new Error(`Node not found.`) }
          } else { throw new Error(`Could not remove ${data.address}. ISY sent 403.`) }
        } else { throw new Error(`ISY sent invalid result code.`) }
      } else { throw new Error(`ISY did not respond`) }
      if (result.success) {
        logger.info(`${this.logPrefix} removenode: ${result.message}`)
        if (!frontend) { this.sendResult(command, results, result.success, result.message) }
        NodeServerModel.sendUpdate()
        this.config()
      }
      return result
    } catch (err) {
      if (!frontend) { this.sendResult(command, {}, result.success, err.message) }
      //if (err.stack) logger.error(err.stack)
      result.message = err.message
      logger.error(`${this.logPrefix} removenode: ${err.message}`)
      return result
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
            for (let node of this.nodes) {
              //let node = this.nodes[i]
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
            for (let node of this.nodes) {
              //let node = this.nodes[i]
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
  async installNodeServer() {
    logger.info(`${this.logPrefix} Attempting to install ${this.name} NodeServer into ISY.`)
    let res1 = await isy.handleRequestP(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection'}, 'restcall', true)
    if (!res1.isyresponse.connections.connection && res1.statusCode === 200) {
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
      let res2 = await isy.handleRequestP(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection/set/network', args: args}, 'restcall', true)
      if (res2.statusCode !== 200) throw new Error (`Failed to install NodeServer. ISY responded with other than 200.`)
      await this.installprofile({'reboot': false}, null)
      let message = `Installed into ISY sucessfully. Profile uploaded, restart Admin console.`
      logger.info(`${this.logPrefix} ${message}`)
      return message
    } else if (res1.isyresponse.connections.connection && res1.statusCode === 200) {
      throw new Error(`That Profile already exists on the ISY.`)
    } else throw new Error(`ISY sent a bad status code or did not respond. Check your settings.`)
  },

  async installprofile (data, command) {
    try {
      if (this.type !== 'local') throw new Error(`${this.name} is not installed. Updating code from Github but ignoring profile update request.`)
      let profileFolder = `${this.homeDir}profile/`
      if (!fs.existsSync(profileFolder)) throw new Error(`${this.name} profile folder does not exist. Aborting.`)
      var importTypes = ['nodedef', 'editor', 'nls']
      for (let type of importTypes) {
        let pathFolder = `${profileFolder}${type}`
        if (!fs.existsSync(pathFolder)) logger.error(`${this.name} profile folder ${type} doesn't exist. Skipping.`)
        let extension = '.txt'
        if (type === 'nodedef' || type === 'editor') extension = '.xml'
        let files = fs.readdirSync(pathFolder)
        for (let file of files) {
          if (path.extname(file.toLowerCase()) === extension) {
            let fileData = fs.readFileSync(`${pathFolder}/${file}`)
            await isy.profileUpload(type, `${type}/${file}`, fileData, this.profileNum)
          }
        }
      }
      if (data && data.hasOwnProperty('reboot')) {
        if (data.reboot === true) {
          setTimeout(() => {
            isy.reboot()
          }, 10000)
        }
      }
    } catch (err) {
      throw new Error(`installProfile error ${err.message}`)
    }
  },

  /**
  * Instance Method to delete this NodeServer from ISY automatically. This kicks off immediately after
  NodeServer is deleted via the frontend.
  * @function delns
  * @alias NodeServerModel.delns
  * @memberof module:models/nodeserver~NodeServerModel
  * @instance
  * @param {responseCallback} callback - (err, response) Callback when complete with error if present, or response if no error.
  */
  async delns(data, command) {
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    try {
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
      let results = await isy.handleRequestP(this.profileNum, {api: 'profiles/ns/' + this.profileNum + '/connection/remove'}, 'restcall', true)
      if (results.statusCode === 200) {
        await this.remove()
        result.message = 'Succesfully removed NodeServer. Restart the admin console.'
        mqtt.delSubscription(this.profileNum)
        if (this.type === 'local') {
          await NodeServerModel.wait(5000)
          await child.stopChildNodeServer(config.nodeServers[this.profileNum])
          delete config.nodeServers[this.profileNum]

        }
      } else {
        result.message = `ISY returned something other than 200, this usually means the NodeServer is out of range. Deleting from DB... `
        await this.remove()
        result.message += 'Success'
      }
      logger.info(`${this.logPrefix} ${result.message}`)
      result.success = true
      return result
    } catch (err) {
        result.message = err.message
        logger.error(`${this.logPrefix} delns: ${err}`)
        return result
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
  async request(data, command) {
    const result = await isy.handleRequestP(this.profileNum, data, command)
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
    if (doc) {
      config.nodeServers[this.profileNum] = doc
      var parseConfig = doc.toJSON()
      parseConfig.isyVersion = config.settings.isyVersion
      parseConfig._id = undefined
      for (let node of parseConfig.nodes) {
        node._id = undefined
        for (let driver of node.drivers) {
          driver._id = undefined
        }
      }
      mqtt.makeResponse(this.profileNum, 'config', parseConfig)
    }
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
          if (!this.deleting || !config.shutdown) {
            let update = {
              address: primary.address,
              driver: 'ST',
              value: '0',
              uom: '2'
            }
            this.status(update, 'status')
          }
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
  async customparams(data, command) {
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    try {
      logger.info(`NS: Recieved updated Custom Parameters for ${this.name}. Updating database.`)
      delete data.profileNum
      this.customParams = data
      await this.save()
      this.config()
      result.success = true
      result.message = 'Custom Parameters saved to database sucessfully.'
      return result
    } catch (err) {
      result.message = err.message
      logger.error(`${this.logPrefix} customparams: ${err}`)
      return result
    }
    //if (callback) { return callback(null, 'Custom Parameters saved to database sucessfully.') }
  },

  async customdata(data, command) {
    logger.info(`NS: Recieved updated Custom Data for ${this.name}. Updating database.`)
    delete data.profileNum
    this.customData = data
    await this.save()
    this.config()
  },

  async polls(data, command, callback) {
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    if (data.hasOwnProperty('shortPoll')) this.shortPoll = data.shortPoll
    if (data.hasOwnProperty('longPoll')) this.longPoll = data.longPoll
    child.stopPolls(this)
    child.startPolls(this)
    logger.info(`NS: Recieved updated Poll Parameters for ${this.name}. Short: ${this.shortPoll} Long: ${this.longPoll}`)
    await this.save()
    result.success = true
    result.message = 'Poll Parameters saved to database sucessfully.'
    return result
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
