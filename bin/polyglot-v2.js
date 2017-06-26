#!/usr/bin/env node

'use strict'
const os = require('os')
const dotenv = require('dotenv').config({path: os.homedir() + '/.polyglot/.env'})
//dotenv.load()
const logger = require('../lib/modules/logger')
const config = require('../lib/config/config')
const db = require('../lib/modules/db')
const web = require('../lib/modules/web')
const mqtt = require('../lib/modules/mqtt')
const helpers = require('../lib/modules/helpers')

logger.info('Starting Polyglot version 2.0')

// Clustering support
const CONCURRENCY = process.env.WEB_CONCURRENCY || 1

function main() {
  db.startService((err) => {
    if (err === 'shutdown') { return helpers.shutdown() }
    web.startService()
    mqtt.startService()
  })
}

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
