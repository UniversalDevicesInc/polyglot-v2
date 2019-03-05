const mongoose = require('mongoose')
const os = require('os')
const fs = require('fs-extra')
const path = require('path')
const isEqual = require('lodash.isequal')

const logger = require('./logger')
const config = require('../config/config')
const helpers = require('./helpers')
const encrypt = require('./encryption')
const mqtt = require('./mqtt')
const child = require('./children')
const isy = require('./isy')

var NodeServer = mongoose.model('NodeServer')
var Node = mongoose.model('Node')

//var that = this

function addNodePrefix(profileNum, nid) {
  // Don't add prefix if it has already been added.
  prefix = 'n' + ('00' + profileNum).slice(-3)
  if (nid.startsWith(prefix)) {
    return nid
  }
  return `n${('00' + profileNum).slice(-3)}_${nid}`.slice(0, 20)
}

function addressRight(address) {
  return address.substring(address.indexOf('_')+1)
}

const VALID_COMMANDS = [
  'addnode',
  'addnotice',
  'command',
  'change',
  'config',
  'connected',
  'customdata',
  'customparams',
  'customparamsdoc',
  'installprofile',
  'removenode',
  'removenotice',
  'request',
  'restart',
  'restcall',
  'start',
  'status',
  'stop',
  'typedcustomdata',
  'typedparams'
];

const VALID_TAGS = [
  'name',
  'longPoll',
  'shortPoll',
  'executable',
  'serverType',
  'homeDir',
  'token',
  'timeAdded',
  'timeStarted',
  'currentVersion',
  'isConnected',
  'customParams',
  'customData',
  'type',
  'logDir',
  'notices',
  'customParamsDoc',
  'typedParams',
  'typedCustomData'
];


module.exports = {

  toJSON(profileNum) {
    let result = {};
    const ns = config.nodeServers[profileNum];
    for (const key of VALID_TAGS) {
      result[key] = ns[key];
    }

    return result;
  },

  async sendUpdate()  {
    let nodeservers = await NodeServer.find({}, null, {sort: {'profileNum': 1}, lean: true})
    for (let ns of nodeservers) {
      ns.nodes = await Node.find({ profileNum: ns.profileNum }, null, { lean: true})
    }
    mqtt.publish('udi/polyglot/frontend/nodeservers', {node: 'polyglot', nodeservers: nodeservers}, {retain: true})
  },

  async loadNodeServers() {
    try {
      let nodeservers = await NodeServer.find({}, null, {sort: {'profileNum': 1}, lean: true })
      if (!nodeservers) return logger.debug('MongoDB: No NodeServers found in database')
      for (let ns of nodeservers) {
        logger.debug(`NodeServer ${ns.name} [${ns.profileNum}] added to running config.`)
        config.nodeServers[ns.profileNum] = ns
        if (ns.type === 'local') {
          config.nodes[ns.profileNum] = {}
          config.installedNSTypes.push(ns.name)
          await this.getNodesFromISY(ns)
          this.start(ns.profileNum)
        }
      }
      //this.verifyNonManagedNodeServers()
      this.pollNonManagedServers()
      //this.sendUpdate()
      isy.getVersion()
      logger.debug(`MongoDB: ${nodeservers.length} NodeServer(s) retrieved from database`)
    } catch (err) {
      logger.error(`loadNodeServers: ${err.stack}`)
    }
  },

  async getNodesFromISY(ns) {
    try {
      let results = await isy.handleRequestP(ns.profileNum, {api: 'profiles/ns/' + ns.profileNum + '/connection'}, 'restcall', true)
      if (!results) return logger.error(`getNodesFromISY: No results received from ISY.`)
      if (results.isyresponse.connections.connection && results.statusCode === 200) {
        logger.info(`${ns.logPrefix} - NodeServer found on ISY with the name ${results.isyresponse.connections.connection.name}. Checking for Nodes...`)
        let nodes = await Node.find({profileNum: ns.profileNum}, null, {lean: true})
        logger.info(`${ns.logPrefix} Found ${nodes.length} nodes, Performing ReSync with ISY`)
        for (let node of nodes) {
          try {
            config.nodes[ns.profileNum][node.address] = node
            let result = await isy.handleRequestP(ns.profileNum, {api: `nodes/${node.address}`}, 'restcall', true)
            if (result.statusCode === 404) {
              logger.info(`${ns.logPrefix} ${node.address} doesn't exist in ISY. Adding...`)
              await this.newNodeAdd(node, 'addnode', {seq: false})
            } else {
              logger.info(`${ns.logPrefix} ${node.address} already exists in ISY. Skipping...`)
            }
          } catch (err) {
            logger.error(`${ns.logPrefix} NS getNodesFromISY-primary Error: ${err.stack}`)
          }
        }
      }
      logger.info(`${ns.logPrefix} Completed ReSync with ISY.`)
    } catch (err) {
      logger.error(`${ns.logPrefix} NS getNodesFromISY ${err.stack}`)
    }
  },

  async checkCommand(data) {
    for (var prop in data) {
      if (prop === 'node') { continue }
      if (VALID_COMMANDS.indexOf(prop) < 0) {
        logger.error(`${config.nodeServers[data.node].logPrefix} ${prop} not in valid commands list`)
        continue
      }
      logger.info(`${config.nodeServers[data.node].logPrefix} Processing command: ${prop}`)
      if (data.hasOwnProperty(prop)) {
        (this[prop] || this['notfound']).call(this, data.node, data[prop], prop)
      } else {
        logger.debug(`${this.logPrefix} Property not found in input: ${data}`)
      }
    }
  },

  async sendControllerState(profileNum, state) {
    if (!config.shutdown) {
      let controller = await Node.findOne({profileNum: profileNum, controller: { $in: [ true, "true" ]}}, null, { lean: true })
      //logger.debug(JSON.stringify(controller))
      if (!controller) {
        if (config.nodes[profileNum] && Object.keys(config.nodes[profileNum]).length > 0)
          controller = Object.keys(config.nodes[profileNum])[0]
      }
      if (controller && controller.address && !config.deleting[profileNum]) {
        let update = {
          address: addressRight(controller.address),
          driver: 'ST',
          value: state ? '1' : '0',
          uom: 2
        }
        await this.status(profileNum, update, 'status')
      }
    }
  },

  async connected(profileNum, data, command) {
    await NodeServer.findOneAndUpdate({profileNum: profileNum}, {isConnected: data}, {lean: true, new: true})
    if (data) {
      child.startPolls(config.nodeServers[profileNum])
      this.config(profileNum)
      this.sendControllerState(profileNum, true)
    } else {
      child.stopPolls(profileNum)
      this.sendControllerState(profileNum, false)
    }
    if (config.nodeServers[profileNum])
      logger.info(`${config.nodeServers[profileNum].logPrefix} NodeServer ${(data ? 'Connected.' : 'Disconnected.')}`)
    this.sendUpdate()
  },

  async status(profileNum, data, command) {
    try {
      data.address = addNodePrefix(profileNum, data.address)
      let result = await isy.handleRequestP(profileNum, data, command, false)
      if (result && result.statusCode === 404) {
        let reason = `${data.address} or ${data.driver} does not exist - ISY returned ${result.statusCode}`
        this.sendResult(profileNum, command, result, false, reason, {address: data.address})
        logger.error(`${config.nodeServers[profileNum].logPrefix} ${reason}`)
      } else if (result && result.statusCode === 200) {
        let update = {}
        update[`drivers.${data.driver}.value`] = data.value.toString()
        update[`drivers.${data.driver}.uom`] = data.uom
        config.nodes[profileNum][data.address] = await Node.findOneAndUpdate({address: data.address}, update, {lean: true, new: true})
        let reason = `${data.address} ${data.driver} set sucessfully to ${data.value} : UOM ${data.uom}`
        logger.info(`${config.nodeServers[profileNum].logPrefix} ${reason}`)
        this.sendUpdate()
      }
    } catch (err) {
      logger.error(`${config.nodeServers[profileNum].logPrefix} NS Status Error: ${err.stack}`)
    }
  },

  async addnode(profileNum, data, command) {
    let ns = config.nodeServers[profileNum];
    try {
      if (!Array.isArray(data.nodes)) {
        return logger.error(`${ns.logPrefix} nodes must be an array.`);
      }
      for (let node of data.nodes) {
        if (node.hint === undefined) {
          node.hint = [ 0, 0, 0, 0 ];
        }
        if (await this.updateNode(node, command, data, profileNum)) {
          return;
        } else {
          if (node.address !== node.primary) {
            await helpers.wait(500);
          }
          await this.doNodeAdd(node, command, data, profileNum);
        }
      }
      this.sendUpdate()
      this.config(profileNum)
      logger.info(`${ns.logPrefix} completed adding node(s).`)
    } catch (err) {
      logger.error(`${ns.logPrefix} Error adding node: ${err.stack}`)
    }
  },

  async doNodeAdd(node, command, data, profileNum) {
    let ns = config.nodeServers[profileNum]
    let reason
    if (!Array.isArray(node.drivers)) {
      reason = `${node.address} drivers must be an array.`
      this.sendResult(profileNum, command, {}, false, reason, {address: node.address})
      throw new Error(reason)
    }
    let address = addNodePrefix(profileNum, node.address)
    let newNode = {
      address: address,
      name: node.name,
      profileNum: profileNum,
      nodedef: node.node_def_id,
      primary: addNodePrefix(profileNum, node.primary),
      isprimary: node.address === node.primary ? true : false,
      hint: node.hint,
      added: true,
      drivers: {},
      controller: "false",
      seq: data.seq ? data.seq : false
    }
    for (let driver of node.drivers) {
      newNode.drivers[driver.driver] = {
        value: driver.value !== null ? driver.value.toString() : null,
        uom: driver.uom
      }
    }
    try {
      if (newNode.isprimary) {
        let existingNodes = await Node.count({ profileNum: profileNum })
        if (!existingNodes || existingNodes === 0)
          newNode.controller = "true"
      } else {
        let primary = await Node.find({ address: newNode.primary })
        if (!primary) {
          reason = `Primary node ${newNode.primary} was not found in nodes.`
          this.sendResult(profileNum, command, {}, false, reason, {address: node.address})
          throw new Error(reason)
        }
      }
      config.nodes[profileNum][address] = await Node.findOneAndUpdate({ address: address }, newNode, { upsert: true, setDefaultsOnInsert: true, new: true })
      let result = await isy.handleRequestP(profileNum, newNode, command, true)
      if (result && result.statusCode == 400) {
        logger.debug(`ISY 400 Add Response: ${newNode.address} Reason: ${result.isyresponse.RestResponse.reason.code}`)
        if (result.isyresponse.RestResponse.reason.code === '5004') {
          reason = `${newNode.address} already exists in ISY. Updated in Polyglot.`
          logger.debug(reason)
          this.sendResult(profileNum, command, {profileNum: profileNum}, true, reason, {address: node.address})
        } else {
          reason = `${newNode.address} was not added sucessfully. ISY returned Reason: ${result.isyresponse.RestResponse.reason.code}`
          this.sendResult(profileNum, command, {profileNum: profileNum}, false, reason, {address: node.address})
          logger.error(`${ns.logPrefix} ${reason}`)
          throw new Error(reason)
        }
      } else if (result && result.statusCode == 200) {
          await isy.handleRequestP(profileNum, newNode, 'setHint', true)
          reason = `AddNode: ${newNode.address} added to database successfully.`
          logger.debug(reason)
          this.sendResult(profileNum, command, {profileNum: profileNum}, true, reason, {address: node.address})
          if (newNode.controller === "true")
            await this.sendControllerState(profileNum, true)
          if (!newNode.isprimary)
            isy.groupNode(newNode.address, newNode.primary)
          this.updateAllNodeDrivers(profileNum, newNode.address)
      }
    } catch (err) {
      Node.findOneAndRemove({address: address})
      logger.error(`addNode: failure, node removed :: ${err.stack}`)
    }
  },

  async updateNode(node, command, data, profileNum) {
    let ns = config.nodeServers[profileNum]
    let address = addNodePrefix(profileNum, node.address)
    let existing = await Node.findOne({address: address}, null, {lean: true})
    if (!existing) return false
    delete existing._id
    let changes = false
    let driverChanges = false
    let reason
    let newDrivers = {}
    try {
      if (node.node_def_id !== existing.nodedef) {
        changes = true
        existing.nodedef = node.node_def_id
        logger.debug(`${ns.logPrefix} updateNode detected nodeDef change. Updating on ISY.`)
        await this.change(profileNum, {address: node.address, nodedef: node.node_def_id}, 'change')
      } else if (existing.profileNum == null) {
        logger.debug(`${ns.logPrefix} updateNode detected missing profile.`)
        return false
      }
      if (!Array.isArray(node.drivers)) throw new Error(`${node.address} drivers must be an array.`)
      for (let driver of node.drivers) {
        newDrivers[driver.driver] = {
          value: driver.value !== null ? driver.value.toString() : null,
          uom: parseInt(driver.uom, 10)
        }
      }
      if (!isEqual(newDrivers, existing.drivers)) {
        changes = true
        driverChanges = true
        existing.drivers = newDrivers
        logger.debug(`${ns.logPrefix} updateNode detected driver changes. Updating...`)
      }

      if (!isEqual(node.hint, existing.hint)) {
        changes = true
        existing.hint = node.hint
        logger.debug(`${ns.logPrefix} updateNode detected hint change. Updating...`)
        await isy.handleRequestP(profileNum, existing, 'setHint', true)
      }

      if (changes) {
        reason = `${address} updated sucessfully.`
        config.nodes[profileNum][address] = await Node.findOneAndUpdate({ address: address }, existing, { new: true })
        if (driverChanges) this.updateAllNodeDrivers(profileNum, address)
      } else {
        reason = `No updates needed for ${address} skipping...`
      }
      logger.info(`${ns.logPrefix} ${reason}`)
      this.sendResult(profileNum, command, {profileNum: profileNum}, true, reason, {address: node.address})
      return true
    } catch (err) {
      logger.error(err.stack)
      this.sendResult(profileNum, command, {}, false, err.message, {address: node.address})
    }
  },

  async updateAllNodeDrivers(profileNum, address) {
    logger.debug(`Synching all drivers for ${address} to ISY...`)
    let node = await Node.findOne({ address: address }, null, { lean: true })
    if (!node) return
    for (let driver in node.drivers) {
      if (node.controller === 'true' && driver.address === 'ST') continue
      let update = {
        address: address,
        driver: driver,
        value: node.drivers[driver].value,
        uom: node.drivers[driver].uom
      }
      isy.handleRequestP(profileNum, update, 'status')
    }
  },

  async newNodeAdd(node, command, data, profileNum) {
    let ns = config.nodeServers[profileNum]
    let newNode = {
      address: node.address,
      name: node.name,
      profileNum: profileNum,
      nodedef: node.node_def_id,
      primary: node.primary,
      isprimary: node.address === node.primary ? true : false,
      added: true,
      drivers: node.drivers,
      controller: "false",
      seq: data.seq ? data.seq : false
    }
    try {
      if (newNode.isprimary) {
        let existingNodes = await Node.count({ profileNum: profileNum })
        if (!existingNodes || existingNodes === 0)
          newNode.controller = "true"
      } else {
        let primary = await Node.find({ address: newNode.primary })
        if (!primary) {
          let reason = `Primary node ${newNode.primary} was not found in nodes.`
          this.sendResult(profileNum, command, {}, false, reason, {address: newNode.address})
          throw new Error(reason)
        }
      }
      if (!config.nodes[profileNum]) {
        config.nodes[profileNum] = {}
      }
      config.nodes[profileNum][node.address] = await Node.findOneAndUpdate({ address: node.address }, newNode, { upsert: true, setDefaultsOnInsert: true, new: true })
      let result = await isy.handleRequestP(profileNum, newNode, command, true)
      if (result && result.statusCode == 400) {
        logger.debug(`ISY 400 Add Response: ${newNode.address} Reason: ${result.isyresponse.RestResponse.reason.code}`)
        if (result.isyresponse.RestResponse.reason.code === '5004') {
          logger.debug(`${newNode.address} already exists in ISY.`)
        } else {
          let reason = `${newNode.address} was not added sucessfully. ISY returned Reason: ${result.isyresponse.RestResponse.reason.code}`
          this.sendResult(profileNum, command, {profileNum: profileNum}, false, reason, {address: newNode.address})
          logger.error(`${ns.logPrefix} ${reason}`)
          throw new Error(reason)
        }
      } else if (result && result.statusCode == 200) {
          reason = `AddNode: ${newNode.address} added to database successfully.`
          this.updateAllNodeDrivers(profileNum, newNode.address)
      }
    } catch (err) {
      Node.findOneAndRemove({address: node.address})
      logger.error(`addNode: failure, node removed :: ${err.stack}`)
    }
  },

  async removenode(profileNum, data, command, frontend) {
    let ns = config.nodeServers[data.profileNum]
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    try {
      result.message = `${data.address} removed successfully`
      data.address = addNodePrefix(profileNum, data.address)
      let results = await isy.handleRequestP(profileNum, data, command, true)
      if (results) {
        if (results.statusCode === 200) {
          let node = await Node.findOneAndRemove({address: data.address})
          if (!node) throw new Error(`Node not found.`)
        } else if (results.statusCode === 403) {
          if (results.isyresponse.RestResponse.reason.code === "5106") {
            throw new Error(`Could not remove ${data.address}. It is the primary for another node.`)
          } else if (results.isyresponse.RestResponse.reason.code === "5003") {
            logger.debug(`Could not remove ${data.address}. It doesn't exist in ISY. Will remove from DB if it exists.`)
            let node = await Node.findOneAndRemove({address: data.address})
            if (!node) throw new Error(`Node not found.`)
          } else { throw new Error(`Could not remove ${data.address}. ISY sent 403.`) }
        } else { throw new Error(`ISY sent invalid result code.`) }
      } else { throw new Error(`ISY did not respond`) }
      result.success = true
      logger.info(`${ns.logPrefix} removenode: ${result.message}`)
      if (!frontend) { this.sendResult(profileNum, command, results, result.success, result.message) }
      this.sendUpdate()
      this.config(data.profileNum)
      return result
    } catch (err) {
      if (!frontend) { this.sendResult(profileNum, command, {}, result.success, err.message) }
      //if (err.stack) logger.error(err.stack)
      result.message = err.message
      logger.error(`removenode: ${err.stack}`)
      return result
    }
  },

  async command(profileNum, data, command) {
    try {
      let address = addNodePrefix(profileNum, data.address)
      let result = await isy.handleRequestP(profileNum, data, command, true)
      if (! result ) { return }
      if (result.statusCode === 404 || result.statusCode === 400) {
        let reason = `${address} or ${data.command} does not exist or is incorrect`
        this.sendResult(profileNum, command, result, false, reason, {address: data.address})
        logger.error(`${config.nodeServers[profileNum].logPrefix} ${reason}`)
      } else if (result.statusCode === 200) {
        let reason = `${address} :: ${data.command} sent sucessfully`
        if (data.value)
          reason += ` with value: ${data.value}`
        this.sendResult(profileNum, command, result, true, reason, {address: data.address})
        logger.info(`${config.nodeServers[profileNum].logPrefix} ${reason}`)
        this.sendUpdate()
      }
    } catch (err) {
      logger.error(`${config.nodeServers[profileNum].logPrefix} NS Command Error: ${err}`)
    }
  },

  async config(profileNum, data = null, command = null) {
    const ns = await NodeServer.findOne({profileNum: profileNum}, null, {lean: true})
    if (ns) {
      config.nodeServers[profileNum] = ns
      var parseConfig = this.toJSON(profileNum)
      parseConfig.isyVersion = config.settings.isyVersion
      delete parseConfig._id
      delete parseConfig.token
      const nodes = await Node.find({profileNum: profileNum}, null, {lean: true})
      parseConfig.newNodes = nodes
      //deepcopy hack
      let oldNodes = JSON.parse(JSON.stringify(nodes))
      for (let node of oldNodes) {
        let oldDrivers = []
        node.address = addressRight(node.address)
        node.primary = addressRight(node.primary)
        node.node_def_id = node.nodedef
        for (let driver in node.drivers) {
          oldDrivers.push({driver: driver, value: node.drivers[driver].value, uom: node.drivers[driver].uom})
        }
        node.drivers = oldDrivers
      }
      parseConfig.nodes = oldNodes
      mqtt.makeResponse(profileNum, 'config', parseConfig)
    }
  },

  async start(profileNum, data = null, command = null) {
    if (!config.nodeProcesses[profileNum]) {
      child.runChildNodeServer(config.nodeServers[profileNum])
    } else {
      logger.info(`${config.nodeServers[profileNum].logPrefix}: Already started. Ignoring start command.`)
    }
  },

  async stop(profileNum, data = null, command = null) {
    if (config.nodeProcesses[profileNum]) {
      mqtt.makeResponse(profileNum, 'stop', {})
      await helpers.wait(1000)
      await child.stopChildNodeServer(config.nodeServers[profileNum])
    } else {
      logger.info(`${config.nodeServers[profileNum].logPrefix}: Not running. Ignoring stop command.`)
    }
  },

  async request(profileNum, data, command) {
    let ns = config.nodeServers[profileNum]
    const result = await isy.handleRequestP(profileNum, data, command)
    if (! result ) { return }
    if (result.statusCode === 404 || result.statusCode === 400) {
      let reason = `ISY Returned ${result.statusCode} for request ID: ${data.requestId}`
      this.sendResult(profileNum, command, result, false, reason, {id: data.requestId})
      logger.error(`${ns.logPrefix} ${reason}`)
    } else if (result.statusCode === 200){
      let reason = `${data.requestId} reported sucessfully as ${data.success}`
      this.sendResult(profileNum, command, result, true, reason, {id: data.requestId})
      logger.info(`${ns.logPrefix} ${reason}`)
    }
    this.sendUpdate()
  },

  async restcall(profileNum, data, command) {
    try {
      let ns = config.nodeServers[profileNum]
      let result = await isy.handleRequestP(profileNum, data, command, true)
      if (! result ) { return }
      if (result.statusCode === 404) {
        let reason = `ISY Returned 404 for ${data.api}`
        this.sendResult(profileNum, command, result, false, reason, {api: data.api})
        logger.error(`${ns.logPrefix} ${reason}`)
      } else if (result.statusCode === 200){
        let reason = `${data.api} executed sucessfully`
        this.sendResult(profileNum, command, result, true, reason, {api: data.api})
        logger.info(`${ns.logPrefix} ${reason}`)
      }
      this.sendUpdate()
    } catch (err) {
      logger.error(`${ns.logPrefix} NS RestCall Error: ${err}`)
    }
  },

  async change(profileNum, data, command) {
    try {
      let ns = config.nodeServers[profileNum]
      let result = await isy.handleRequestP(profileNum, data, command, true)
      if (! result ) { return }
      if (result.statusCode !== 200) {
        let reason = `ISY Returned ${result.statusCode} for change of ${data.address}`
        this.sendResult(profileNum, command, result, false, reason, {data: data})
        logger.error(`${ns.logPrefix} ${reason}`)
      } else if (result.statusCode === 200) {
        let updated = await Node.findOneAndUpdate({address: addNodePrefix(profileNum, data.address)}, {nodedef: data.nodedef}, {lean: true, new: true})
        logger.debug(JSON.stringify(updated))
        let reason = `Change of ${data.address} to ${data.nodedef} executed sucessfully`
        this.sendResult(profileNum, command, result, true, reason, {data: data})
        logger.info(`${ns.logPrefix} ${reason}`)
        this.sendUpdate()
      }
    } catch (err) {
      logger.error(`NS RestCall Error: ${err.stack}`)
    }
  },

  async restart(profileNum, data, command) {
    this.stop(profileNum)
    setTimeout(() => {
      this.start(profileNum)
    }, 3000)
  },

  async installprofile (profileNum, data, command) {
    try {
      let ns = config.nodeServers[profileNum]
      if (ns.type !== 'local') throw new Error(`${ns.name} is not installed. Updating code from Github but ignoring profile update request.`)
      let profileFolder = `${ns.homeDir}profile/`
      if (!fs.existsSync(profileFolder)) throw new Error(`${ns.name} profile folder does not exist. Aborting.`)
      var importTypes = ['nodedef', 'editor', 'nls']
      for (let type of importTypes) {
        let pathFolder = `${profileFolder}${type}`
        if (!fs.existsSync(pathFolder)) logger.error(`${ns.name} profile folder ${type} doesn't exist. Skipping.`)
        let extension = '.txt'
        if (type === 'nodedef' || type === 'editor') extension = '.xml'
        let files = fs.readdirSync(pathFolder)
        for (let file of files) {
          if (path.extname(file.toLowerCase()) === extension) {
            let fileData = fs.readFileSync(`${pathFolder}/${file}`)
            await isy.profileUpload(type, `${type}/${file}`, fileData, profileNum)
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

  convertNotices(ns) {
    // if the value is array (from previous version), convert it
    if (Array.isArray(ns.notices)) {
      let notices = {}
      for (let k in ns.notices) {
        notices[k] = ns.notices[k]
      }
      ns.notices = notices
    }
  },

  getMaxNoticeKey(ns) {
    let maxKey = -1;
    for (let k in ns.notices) {
      if (parseInt(k) > maxKey) {
        maxKey = parseInt(k);
      }
    }

    return maxKey;
  },

  async addnotice(profileNum, data, command) {
    let ns = config.nodeServers[profileNum]
    try {
      this.convertNotices(ns);

      if (typeof data === 'string') {
        ns.notices[this.getMaxNoticeKey(ns) + 1] = data;
      } else if (data.key == null) {
        ns.notices[this.getMaxNoticeKey(ns) + 1] = data.value;
      } else {
        ns.notices[data.key] = data.value;
      }

      let nsObject = await NodeServer.findOne({ profileNum: profileNum }).exec()
      nsObject.notices = ns.notices
      nsObject.markModified('notices');
      await nsObject.save();
      logger.info(`NS addnotice: ${ns.name} added notice sucessfully: ${JSON.stringify(data)}`)
      this.sendUpdate()
      this.config(profileNum)
    } catch (err) {
      logger.error(`NS addnotice error: ${err}`)
    }
  },

  async removenotice(profileNum, data, command) {
    let ns = config.nodeServers[profileNum]
    try {
      this.convertNotices(ns);
      if (typeof data === 'string') {
        for (let key in ns.notices) {
          if (ns.notices[key] === data) {
            delete ns.notices[key];
            break;
          }
        }
      } else {
        delete ns.notices[data.key];
      }

      let nsObject = await NodeServer.findOne({ profileNum: profileNum }).exec()
      nsObject.notices = ns.notices
      nsObject.markModified('notices');
      await nsObject.save();
      logger.info(`NS removenotice: ${ns.name} removed notice sucessfully.`)
      this.sendUpdate()
      this.config(profileNum)
    } catch (err) {
      logger.error(`NS removenotice error: ${err}`)
    }
  },

  async customparams(profileNum, data, command) {
    delete data.profileNum
    return this.saveData(profileNum, {customParams: data})
  },

  async customdata(profileNum, data, command) {
    return this.saveData(profileNum, {customData: data})
  },

  async polls(data, command) {
    let ns = config.nodeServers[data.profileNum]
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    let update = {}
    if (data.hasOwnProperty('shortPoll')) update.shortPoll = data.shortPoll
    if (data.hasOwnProperty('longPoll')) update.longPoll = data.longPoll
    await NodeServer.findOneAndUpdate({profileNum: data.profileNum}, update).exec()
    this.config(data.profileNum)
    child.stopPolls(profileNum)
    child.startPolls(ns)
    logger.info(`NS: Received updated Poll Parameters for ${ns.name}. Short: ${data.shortPoll} Long: ${data.longPoll}`)
    result.success = true
    result.message = 'Poll Parameters saved to database sucessfully.'
    return result
  },

  async customparamsdoc(profileNum, data, command) {
    return this.saveData(profileNum, {customParamsDoc: data})
  },

  async typedparams(profileNum, data, command) {
    return this.saveData(profileNum, {typedParams: data})
  },

  async typedcustomdata(profileNum, data, command) {
    delete data.profileNum
    return this.saveData(profileNum, {typedCustomData: data})
  },

  async saveData(profileNum, data, info = '') {
    let result = { success: false }
    const key = Object.keys(data)[0];
    try {
      let ns = config.nodeServers[profileNum]
      logger.info(`NS: Received updated ${key} for ${ns.name}. Updating database.`)
      await NodeServer.findOneAndUpdate({profileNum: ns.profileNum}, data).exec()
      logger.info(`NS ${key}: ${ns.name} saved sucessfully${info}`)
      this.sendUpdate()
      this.config(profileNum)
      result.success = true;
      result.message = `${key} saved to database sucessfully.`;
    } catch (err) {
      result.message = err.message
      logger.error(`${this.logPrefix} ${key}: ${err}`)
    }

    return result;
  },

  notfound(profileNum, data, command) {
    logger.info(`${config.nodeServers[profileNum].logPrefix} command not found: ${command}`)
  },

  sendResult(profileNum, command, result, success, reason, extra = null) {
    result[command] = {
      success: success,
      reason: reason
    }
    if (extra) { result[command] = Object.assign(result[command], extra) }
    mqtt.makeResponse(profileNum, 'result', result)
  },

 /* ======================================================================= */

  async addns(data) {
    try {
      //let newNodeServer
      let result = {
        message: null,
        success: false,
        extra: {},
      }
      let nsData = {
        name: data.name,
        profileNum: data.profileNum,
        logPrefix: `${data.name}(${data.profileNum}):`,
        type: data.type
      }
      if (data.type === 'local') {
        let nsDir = `${config.polyDir}nodeservers/${data.path}/`
        nsData['homeDir'] = nsDir
        if (fs.existsSync(nsDir + 'server.json') && fs.existsSync(nsDir + 'profile')) {
          logger.debug(`NS: Add Nodeserver ${data.name}, found server.json and profile folder... proceeding.`)
          let server = JSON.parse(fs.readFileSync(nsDir + 'server.json', 'utf8'))
          if (server.hasOwnProperty('shortPoll')) { nsData['shortPoll'] = server.shortPoll }
          if (server.hasOwnProperty('longPoll')) { nsData['longPoll'] = server.longPoll }
          if (server.hasOwnProperty('type')) { nsData['serverType'] = server.type }
          if (server.hasOwnProperty('executable')) { nsData['executable'] = server.executable }
        } else {
          throw new Error(`${data.name}(${data.profileNum}): local NodeServer server.json or profile.zip not found.`)
        }
      }
      let node = await NodeServer.findOne({ profileNum: data.profileNum })
      if (node) {
       throw new Error(`${data.name}(${data.profileNum}): NodeServer with that Profile Number already exists.`)
      }
      let newNodeServer = await NodeServer.findOneAndUpdate({ profileNum: data.profileNum }, nsData, { upsert: true, setDefaultsOnInsert: true, new: true, lean: true })
      config.nodeServers[newNodeServer.profileNum] = newNodeServer
      result.message = await this.installNodeServer(newNodeServer.profileNum)
      logger.info('Registered new ' + newNodeServer.type + ' NodeServer: ' + newNodeServer.name + '(' + newNodeServer.profileNum + ')')
      this.sendUpdate()
      if (newNodeServer.type === 'local') {
        logger.info(`Waiting 10 seconds before starting ${newNodeServer.name} for the first time.`)
        config.installedNSTypes.push(newNodeServer.name)
        //newNodeServer.createQueues()
        setTimeout(() => {
          child.runChildNodeServer(config.nodeServers[newNodeServer.profileNum])
        }, 10000)
      }
      result.extra = {
       nodeserver: {
         name: newNodeServer.name,
         profileNum: newNodeServer.profileNum
       }
      }
      config.nodes[newNodeServer.profileNum] = {}
      result.success = true
      return result
    } catch (err) {
      logger.error(err.stack)
      if (newNodeServer) {
       newNodeServer.remove()
       if (config.nodeServers[newNodeServer.profileNum]) config.nodeServers[newNodeServer.profileNum] = null
      }
      result.message = err.message
      logger.error(`addNodeServer ${result.message}`)
      return result
    }
  },

  async installNodeServer(profileNum) {
    let ns = config.nodeServers[profileNum]
    logger.info(`${ns.logPrefix} Attempting to install ${ns.name} NodeServer into ISY.`)
    let res1 = await isy.handleRequestP(ns.profileNum, {api: 'profiles/ns/' + ns.profileNum + '/connection'}, 'restcall', true)
    if (!res1.isyresponse.connections.connection && res1.statusCode === 200) {
      let args = {
        ip: config.settings.ipAddress,
        baseurl: '/ns/' + ns.profileNum,
        name: ns.name,
        nsuser: 'polyglot',
        nspwd: ns.isyPassword,
        isyusernum: 0,
        port: config.settings.listenPort,
        timeout: 0,
        ssl: true,
        enabled: true
      }
      let res2 = await isy.handleRequestP(ns.profileNum, {api: 'profiles/ns/' + ns.profileNum + '/connection/set/network', args: args}, 'restcall', true)
      if (res2.statusCode !== 200) throw new Error (`Failed to install NodeServer. ISY responded with other than 200.`)
      await this.installprofile(profileNum, {'reboot': false}, null)
      let message = `Installed into ISY sucessfully. Profile uploaded, restart Admin console.`
      logger.info(`${ns.logPrefix} ${message}`)
      return message
    } else if (res1.isyresponse.connections.connection && res1.statusCode === 200) {
      throw new Error(`That Profile already exists on the ISY.`)
    } else throw new Error(`ISY sent a bad status code or did not respond. Check your settings.`)
  },

  async delns(data, command) {
    let result = {
      message: null,
      success: false,
      extra: {},
    }
    let ns = config.nodeServers[data.profileNum]
    logger.info(`${ns.logPrefix} got delete NS command. Deleting...`)
    try {
      config.deleting[data.profileNum] = true
      logger.info(`${ns.logPrefix} Attempting to delete NodeServer ${ns.name}`)
      mqtt.makeResponse(ns.profileNum, 'delete', {})
      logger.info(`${ns.logPrefix} deleting ${ns.name}'s nodes from ISY.`)
      if (ns.type === 'local') {
        var index = config.installedNSTypes.indexOf(ns.name)
        if (index > -1) { config.installedNSTypes.splice(index, 1) }
      }
      let nodes1 = await Node.find({profileNum: data.profileNum, isprimary: false })
      for (let node of nodes1) {
        try {
          await this.removenode(data.profileNum, node, 'removenode', false)
        } catch (err) {
          logger.info(`${ns.logPrefix} Failure deleting node ${node.address}`)
        }
      }
      let nodes2 = await Node.find({profileNum: data.profileNum, isprimary: true })
      for (let node of nodes2) {
        try {
          await this.removenode(data.profileNum, node, 'removenode', false)
        } catch (err) {
          logger.info(`${ns.logPrefix} Failure deleting node ${node.address}`)
        }
      }
      let results = await isy.handleRequestP(ns.profileNum, {api: 'profiles/ns/' + ns.profileNum + '/connection/remove'}, 'restcall', true)
      if (results.statusCode === 200) {
        NodeServer.findOneAndRemove({ profileNum: ns.profileNum }).exec()
        result.message = 'Succesfully removed NodeServer. Restart the admin console.'
        mqtt.delSubscription(ns.profileNum)
        if (ns.type === 'local') {
          await helpers.wait(5000)
          await child.stopChildNodeServer(config.nodeServers[ns.profileNum])
          delete config.nodeServers[ns.profileNum]
        }
      } else {
        result.message = `ISY returned something other than 200, this usually means the NodeServer is out of range. Deleting from DB... `
        NodeServer.findOneAndRemove({ profileNum: ns.profileNum }).exec()
        result.message += 'Success'
      }
      logger.info(`delns: ${result.message}`)
      result.success = true
      delete config.deleting[data.profileNum]
      return result
    } catch (err) {
        delete config.deleting[data.profileNum]
        result.message = err.message
        logger.error(`delns: delns: ${err.stack}`)
        return result
    }
  },

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

  removeLog(clientId, tail) {
   logger.debug('NS: Terminating log tail for frontend client: ' + clientId)
   tail.unwatch()
   delete config.clientTails[message.node]
  },

  async deleteNSFolder(message) {
   let result = {
     message: null,
     success: false,
     extra: {},
   }
   let ns = await NodeServer.findOne({name: message.name}, null, { lean: true })
   if (ns)
     throw new Error(`DeleteNS Folder: ${message.name} is still active. Please delete it from the Dashboard first before uninstalling it here.`)
   if (message.name.includes('..'))
     throw new Error(`DeleteNS Folder: cannot have .. in name. Don't be that guy.`)
   try {
     let nsPath = `${config.polyDir}nodeservers/${message.name}/`
     fs.removeSync(nsPath)
     this.getInstalledNodeTypes()
     result.message = `DeleteNS Folder: Successfully deleted ${message.name} folder.`
     result.success = true
     return result
   } catch (err) {
     result.message = `DeleteNS Folder: Error deleting ${message.name} folder: ${err.message}`
     logger.error(`${message.name} delns Error: ${err}`)
     return result
   }
  },

  getInstalledNodeTypes(message = null) {
   var nsDir = config.polyDir + 'nodeservers/'
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

  async verifyNonManagedNodeServers() {
   try {
     if (!config.settings.isyConnected) { return }
     let isyNodeServers = await this.checkExistingNodeServers()
     for (let key in isyNodeServers) {
       let node = await NodeServer.findOne({ profileNum: key }, null, { lean: true })
       if (!node) {
         let newNodeServer = new NodeServer({
           name: isyNodeServers[key],
           profileNum: key,
           logPrefix: `${isyNodeServers[key]}(${key}):`,
           type: 'unmanaged'
         })
         let lean = await newNodeServer.save()
         logger.info('NS: Registered new unmanaged NodeServer: ' + newNodeServer.name + '(' + newNodeServer.profileNum + ')')
         config.nodeServers[newNodeServer.profileNum] = lean.toJSON()
         this.sendUpdate()
       }
     }
   } catch (err) {
     logger.error(`nNS: ${err}`)
   }
  },

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
          } else if (results.isyresponse.connections.connection !== undefined) {
            foundNS[results.isyresponse.connections.connection.profile] = results.isyresponse.connections.connection.name
            i++
          }
          for (let nodeServer of Object.values(config.nodeServers)) {
            if (nodeServer && nodeServer.type === 'unmanaged' ) {
              if (!(foundNS.hasOwnProperty(nodeServer.profileNum)))  {
                logger.info(`NS: ${nodeServer.name} Unmanaged NodeServer no longer found in the ISY. Removing from Polyglot`)
                await NodeServer.findOneAndRemove({profileNum: nodeServer.profileNum})
                delete config.nodeServers[nodeServer.profileNum]
                this.sendUpdate()
              }}}
        } else {
          logger.error(`ISY returned status code: ${results.statusCode}`)
        }}
    } catch (err) {
      logger.error(`NS checkExistingNodeServers Error: ${err}`)
    }
    return foundNS
  },

  pollNonManagedServers() {
    setInterval(this.verifyNonManagedNodeServers.bind(this), 5 * 60000)
  },
}
