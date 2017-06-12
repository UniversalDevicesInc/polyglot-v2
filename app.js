'use strict'
const dotenv = require('dotenv')
dotenv.load()
const logger = require('./modules/logger')
const config = require('./config/config')
const db = require('./modules/db')
const web = require('./modules/web')
const mqtt = require('./modules/mqtt')
const helpers = require('./modules/helpers')

logger.info('Starting Polyglot version 2.0')

// Clustering support
const CONCURRENCY = process.env.WEB_CONCURRENCY || 1

function main() {
  db.startService(() => {
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
