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
const helpers = require('../lib/modules/helpers')
const NodeServerModel = require('../lib/models/nodeserver')
const SettingsModel = require('../lib/models/settings')
const UserModel = require('../lib/models/user')

logger.info('Starting Polyglot....')

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

/* Catch SIGINT/SIGTERM and exit gracefully */
process.once('SIGINT', () => {
  logger.info('Caught SIGINT Shutting down.')
  helpers.shutdown()
})

process.once('SIGTERM', () => {
  logger.info('Caught SIGTERM Shutting down.')
  helpers.shutdown()
})

process.once('exit', (code) => {
  logger.info('Polyglot shutdown complete with code: ' + code)
})

/*
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Promise Rejection: ${err}`)
  process.exit(1)
}) */

main()
