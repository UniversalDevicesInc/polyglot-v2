#!/usr/bin/env node

/**
 * Polyglot Version 2
 * Documentation at <todo>
 * Written by James Milne(milne.james@gmail.com)
 */
'use strict'
const os = require('os')
/**
* All Polyglot config is loaded via the file ~/.polyglot/.env
* This allows for easy access to configuration for multiple co-resident nodeservers if necessary
* All nodeservers use this same file to get their base config parameters.
*/
const dotenv = require('dotenv').config({path: os.homedir() + '/.polyglot/.env'})
const logger = require('../lib/modules/logger')
const config = require('../lib/config/config')
const db = require('../lib/modules/db')
const web = require('../lib/modules/web')
const mqtt = require('../lib/modules/mqtt')
const helpers = require('../lib/modules/helpers')

logger.info('Starting Polyglot version 2.0')

/* Clustering support */
const CONCURRENCY = process.env.WEB_CONCURRENCY || 1

/* Initial Startup */
function main() {
  db.startService((err) => {
    if (err === 'shutdown') { return helpers.shutdown() }
    web.startService()
    mqtt.startService()
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
