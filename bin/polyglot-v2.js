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

const db = require('../lib/modules/db')
const web = require('../lib/modules/web')
const mqtts = require('../lib/modules/mqtts')
const mqttc = require('../lib/modules/mqttc')
//const helpers = require('../lib/modules/helpers')
const shutdown = require('../lib/modules/shutdown')
const NodeServerModel = require('../lib/models/nodeserver')
const SettingsModel = require('../lib/models/settings')
const UserModel = require('../lib/models/user')

logger.info('Starting Polyglot....')
var shuttingDown = false

/* Initial Startup */
async function main() {
  try {
    await db.startService()
  } catch (err) {
    logger.error(`MongoDB startup error shutting down: ${err} `)
    process.exit(1)
  }
  await SettingsModel.loadSettings()
  await UserModel.verifyDefaultUser()
  await mqtts.startService()
  web.startService()
  mqttc.startService()
  SettingsModel.sendUpdate()
  NodeServerModel.loadNodeServers()
}

function gracefulShutdown() {
  if (!shuttingDown) {
    shuttingDown = true
    logger.info('Caught SIGTERM/SIGINT Shutting down.')
    shutdown.now()
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
  gracefulShutdown()
})

main()
