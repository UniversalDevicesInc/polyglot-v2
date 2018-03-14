const mongoose = require('mongoose')

const logger = require('../modules/logger')
const config = require('../config/config')

//var Settings = mongoose.model('Settings')
//var User = mongoose.model('User')
var NodeServer = mongoose.model('NodeServer')
var Node = mongoose.model('Node')

function addNodePrefix(profileNum, nid) {
  return `n${('00' + profileNum).slice(-3)}_${nid}`.slice(0, 20)
}

async function wait(ms) {
  await new Promise(resolve => setTimeout(() => resolve(), ms));
}

async function migrateToV2() {
  let nodeservers = await NodeServer.find({type: {$ne: 'unmanaged'}})
  for (let ns of nodeservers) {
    logger.debug(`Migrating ${ns.name} to new database schema. Number of Nodes: ${ns.nodes.length}`)
    let controller = true
    for (let node of ns.nodes) {
      logger.debug(`Migrating ${node.name} to new schema`)
      let conversion = {
        address: addNodePrefix(ns.profileNum, node.address),
        added: node.added,
        enabled: node.enabled,
        name: node.name,
        controller: controller,
        nodedef: node.node_def_id,
        timeAdded: node.timeAdded,
        primary: addNodePrefix(ns.profileNum, node.primary),
        isprimary: node.isprimary,
        profileNum: ns.profileNum,
        drivers: {}
      }
      controller = false
      for (let driver of node.drivers) {
        conversion.drivers[driver.driver] = {
          value: driver.value !== null ? driver.value.toString() : null,
          uom: driver.uom
        }
      }
      try {
        let newNode = new Node(conversion)
        await newNode.save()
        logger.debug(`Converted node ${node.address}`)
      } catch (err) {
        if (err.code === 11000)
          logger.debug(`Node ${conversion.address} already converted. Skipping...`)
        else
          logger.error(`${err.stack}`)
      }
    }
    ns.nodes = []
    await ns.save()
  }
  config.settings.dbVersion = 2
  config.settings.save()
  //await wait(120000)
}

module.exports = {
  async check() {
    logger.debug('Checking for DB Maintenence needs...')
    if (!config.settings.toJSON().hasOwnProperty('dbVersion') || config.settings.dbVersion === 1) {
      logger.debug(`DB maintenence needed, please wait...`)
      await migrateToV2()
    } else {
      logger.debug(`DB Version Found: ${config.settings.dbVersion} no maintenence necessary.`)
    }
  }
}
