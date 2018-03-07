#!/usr/bin/env node

/**
 * Polyglot Version 2
 * Documentation at https://github.com/Einstein42/udi-polyglotv2
 * Written by James Milne(milne.james@gmail.com)
 */
'use strict'
const os = require('os')
const fs = require('fs')
/**
* All Polyglot config is loaded via the file ~/.polyglot/.env
* This allows for easy access to configuration for multiple co-resident nodeservers if necessary
* All nodeservers use this same file to get their base config parameters.
*/
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
/**
  * Create ~/.polyglot if it does not exist
  */
const polyDir = os.homedir() + '/.polyglot/'
if (!fs.existsSync(polyDir)) {
  fs.mkdirSync(polyDir)
}

/**
  * Create ~/.polyglot/nodeservers if it does not exist
  */
if (!fs.existsSync(polyDir + 'nodeservers')) {
  fs.mkdirSync(polyDir + 'nodeservers')
}

/**
  * Create ~/.polyglot/ssl if it does not exist
  */
if (!fs.existsSync(polyDir + 'ssl')) {
  fs.mkdirSync(polyDir + 'ssl')
}
if (!fs.existsSync(polyDir + 'ssl/custom')) {
  fs.mkdirSync(polyDir + 'ssl/custom')
}

const config = require('../lib/config/config')
config.dotenv = require('dotenv').config({path: polyDir + '.env'})
const logger = require('../lib/modules/logger')

/* Import Models */
const mongoose = require('mongoose')
require('../lib/models/settings')
require('../lib/models/user')
require('../lib/models/nodeserver')
var Settings = mongoose.model('Settings')
var User = mongoose.model('User')
var NodeServer = mongoose.model('NodeServer')

const db = require('../lib/services/db')
const mqtts = require('../lib/services/mqtts')
const web = require('../lib/services/web')
const mqttc = require('../lib/services/mqttc')

logger.info('Starting Polyglot....')
var shuttingDown = false

/* Initial Startup */
async function start() {
  try {
    await db.start()
  } catch (err) {
    logger.error(`MongoDB startup error shutting down: ${err} `)
    process.exit(1)
  }
  await Settings.loadSettings()
  await mqtts.start()
  web.start()
  mqttc.start()
  await User.verifyDefaultUser()
  Settings.sendUpdate()
  NodeServer.loadNodeServers()
}

/* Shutdown */
async function shutdown() {
  config.shutdown = true
  await killChildren()
  await saveNodeServers()
  await mqttc.stop()
  await web.stop()
  await mqtts.stop()
  await db.stop()
  process.exit(0)
}

/* Save NodeServers */
async function saveNodeServers() {
  await Promise.all(config.nodeServers.map((ns) => {
    if (ns.type !== 'unmanaged') {
      logger.debug(`Saving NodeServer ${ns.name} to database.`)
      ns.save()
    }
  }))
}

/* Kill all Children */
async function killChildren() {
  for (let i = 0; i < config.nodeServers.length; i++) {
    if (config.nodeServers[i]) {
      if (config.nodeServers[i].type === 'local') {
        await config.nodeServers[i].stop()
      }
    }
  }
  logger.debug(`All NodeServers stopped.`)
}

/* Gracefully shutdown when SIGTERM/SIGINT is caught */
function gracefulShutdown() {
  if (!shuttingDown) {
    shuttingDown = true
    logger.info('Caught SIGTERM/SIGINT Shutting down.')
    shutdown()
    // If processes fail to shut down, force exit after 3 seconds
    setTimeout(function() {
      process.exit()
    },3*1000)
  }
}

/* Catch SIGINT/SIGTERM and exit gracefully */
process.on('SIGINT', gracefulShutdown)

process.on('SIGTERM', gracefulShutdown)

process.once('exit', (code) => {
  logger.info('Polyglot shutdown complete with code: ' + code)
})

process.on('uncaughtException', (err) => {
  logger.error(`uncaughtException REPORT THIS!: ${err.stack}`)
  gracefulShutdown()
})

process.on('unhandledRejection', (err) => {
  logger.error(`unhandledRejection REPORT THIS!: ${err.stack}`)
  //gracefulShutdown()
})

start()
