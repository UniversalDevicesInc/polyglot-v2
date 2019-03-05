const mongoose = require('mongoose')

const logger = require('../modules/logger')
const config = require('../config/config')


/**
 * Node Model and class.
 * @module models/nodeserver
 * @version 2.0
 */

/**
 * MongoDB - Nodes Child Schema
 * @class NodeSchema
 * @extends NodeServerModel
 * @param {string} address - Node address value e.g. 'lifxcontrol'
 * @param {boolean} added - Represents if the node is added and present in the ISY.
 * @param {boolean} enabled - Represents the enabled state of the node.
 * @param {string} name - Descriptive name of the node.
 * @param {string} nodedef - Node Definition ID represented in the profile for this node type.
 * @param {string} timeadded - DateString in epoch of when the node was added to Polyglot
 * @param {string} primary - The node address of the nodes primary parent node. This could be itself in some cases.
 * @param {boolean} isprimary - Is this node a primary for other nodes.
 * @param {Object} drivers - Drivers Object {ST: {value: <#>, uom: <#>}}
 */
const NewNodeSchema = mongoose.Schema({
  address: {
    type: String,
    required: true,
    unique: true
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
  nodedef: {
    type: String,
    default: null,
    required: true
  },
  timeAdded: {
    type: String,
    default: + new Date()
  },
  primary: {
    type: String,
    default: null,
    required: true
  },
  isprimary: {
    type: Boolean,
    default: false
  },
  drivers: {
    type: Object,
    default: {}
  },
  profileNum: {
    type: String,
    default: null
  },
  controller: {
    type: String,
    default: null
  },
  hint: {
    type: [ Number ],
    required: true,
    default: [ 0, 0, 0, 0 ]
  }
}, { usePushEach: true })


NewNodeSchema.statics = {
  async wait(ms) {
    await new Promise(resolve => setTimeout(() => resolve(), ms));
  },

  addressRight(address) {
    return address.substring(address.indexOf('_')+1)
  },


}

NewNodeSchema.methods = {}

const NodeModel = mongoose.model('Node', NewNodeSchema)
