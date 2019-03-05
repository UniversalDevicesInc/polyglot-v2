const mongoose = require('mongoose')

const logger = require('../modules/logger')
const config = require('../config/config')
const encrypt = require('../modules/encryption')

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
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  customData: {
    type: mongoose.Schema.Types.Mixed,
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
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  customParamsDoc: {
    type: String,
    default: ''
  },
  typedParams: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
  },
  typedCustomData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
  },
  nodes: [NodeSchema]
}, { usePushEach: true })

NodeServerSchema.statics = {}
NodeServerSchema.methods = {}
const NodeServerModel = mongoose.model('NodeServer', NodeServerSchema)
