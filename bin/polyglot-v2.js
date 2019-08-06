#!/usr/bin/env node

/**
 * Polyglot Version 2
 * Documentation at https://github.com/Einstein42/udi-polyglotv2
 * Written by James Milne(milne.james@gmail.com)
 */
'use strict'
const os = require('os')
const fs = require('fs')
const argv = require('minimist')(process.argv.slice(2))
/**
* All Polyglot config is loaded via the file ~/.polyglot/.env
* This allows for easy access to configuration for multiple co-resident nodeservers if necessary
* All nodeservers use this same file to get their base config parameters.
*/
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
/**
  * Create ~/.polyglot if it does not exist
  */
let customDir = false
let polyDir = os.homedir() + '/.polyglot/'
if (argv.hasOwnProperty('w')) {
  customDir = true
  polyDir = argv.w
} else if (argv.hasOwnProperty('workDir')) {
  customDir = true
  polyDir = argv.workDir
}
if (!polyDir.endsWith('/')) {
  polyDir += '/'
}
if (customDir) {
  console.log(`Using Custom work directory: ${polyDir}`)
}

if (!fs.existsSync(polyDir)) {
  if (customDir) {
    console.log(`ERROR: ${polyDir} does not exist. Exiting.`)
    process.kill(process.pid, "SIGINT")
  } else {
    fs.mkdirSync(polyDir)
  }
}
let pidFile = polyDir + 'polyglot.pid'
if (argv.hasOwnProperty('p')) {
  pidFile = argv.p
} else if (argv.hasOwnProperty('pidFile')) {
  pidFile = argv.pidFile
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
config.polyDir = polyDir
config.pidFile = pidFile
config.dotenv = require('dotenv').config({path: polyDir + '.env'})
const logger = require('../lib/modules/logger')
createPid(config.pidFile)

/* Import Models */
const mongoose = require('mongoose')
require('../lib/models/settings')
require('../lib/models/user')
require('../lib/models/node')
require('../lib/models/nodeserver')
var Settings = mongoose.model('Settings')
var User = mongoose.model('User')
var NodeServer = mongoose.model('NodeServer')

const db = require('../lib/services/db')
const dbmaint = require('../lib/modules/dbmaint')
const nodeserver = require('../lib/modules/nodeserver')
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
  await dbmaint.check()
  await mqtts.start()
  web.start()
  mqttc.start()
  await User.verifyDefaultUser()
  Settings.sendUpdate()
  nodeserver.loadNodeServers()
}

/* Shutdown */
async function shutdown() {
  config.shutdown = true
  await killChildren()
  //await saveNodeServers()
  await mqttc.stop()
  await web.stop()
  await mqtts.stop()
  await db.stop()
  await removePid()
  process.exit(0)
}

/* Create Pid file */
async function createPid(pidFile, force = true) {
  try {
    const pid = new Buffer(process.pid + '\n')
    const fd = fs.openSync(pidFile, force ? 'w' : 'wx')
    let offset = 0
  
    while (offset < pid.length) {
        offset += fs.writeSync(fd, pid, offset, pid.length - offset)
    }
    fs.closeSync(fd)
    logger.debug(`Created PID file: ${pidFile}`)
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'EACCES') {
      logger.error(`PID file already exists or is un-writable: ${pidFile} Exiting...`)
      process.kill(process.pid, "SIGINT")
    } else {
      logger.error(err)
    }
  }
}

/* Remove Pid file */
async function removePid() {
  try {
    fs.unlinkSync(config.pidFile)
    logger.debug(`Removed PID file: ${config.pidFile}`)
  } catch (err) {
    logger.error(`PID file not removed: ${config.pidFile}`)
  }
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
  for (let ns in config.nodeServers) {
    if (ns) {
      if (config.nodeServers[ns].type === 'local') {
        await nodeserver.stop(ns)
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
      process.exit(0)
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
