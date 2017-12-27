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
const config = require('../lib/config/config')
config.dotenv = require('dotenv').config({path: polyDir + '.env'})
const logger = require('../lib/modules/logger')
const db = require('../lib/modules/db')
const web = require('../lib/modules/web')
const mqtts = require('../lib/modules/mqtts')
const mqttc = require('../lib/modules/mqttc')
const helpers = require('../lib/modules/helpers')
const ns = require('../lib/models/nodeserver')

logger.info('Starting Polyglot....')

/* Initial Startup */
function main() {
  db.startService((err) => {
    if (err === 'shutdown') { return helpers.shutdown() }
    mqtts.startService((err) => {
      if (err) { return helpers.shutdown() }
      web.startService()
      mqttc.startService()
			ns.loadNodeServers()
    })
  })
}

/* Catch SIGINT/SIGTERM and exit gracefully */
process.once('SIGINT', function () {
  logger.info('Caught SIGINT Shutting down.')
  helpers.shutdown(() => {
    process.exit(0)
  })
})

process.once('SIGTERM', function () {
  logger.info('Caught SIGTERM Shutting down.')
  helpers.shutdown(() => {
    process.exit(0)
  })
})

process.once('exit', (code) => {
  logger.info('Polyglot shutdown complete with code: ' + code)
})

main()
