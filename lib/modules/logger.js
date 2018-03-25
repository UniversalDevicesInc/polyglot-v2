/*
Instantiate the logger for all modules
*/
const os = require('os')
const fs = require('fs')
/**
 * Logger Module
 * @module modules/logger
 * @version 2.0
 */

/**
 * Default log level is INFO. If .env parameter of NODE_ENV is set to to 'development' then we up the level to DEBUG
 */
var logLevel = 'info'
var logDir = os.homedir() + '/.polyglot/log/'
/**
  * Create logDir if it does not exist
  */
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir)
}
/**
 * Default log level is INFO. If .env parameter of NODE_ENV is set to to 'development' then we log to the console as well as the file.
 */
var logTransports = []
const winston = require('winston')
const { combine, timestamp, label, printf, colorize } = winston.format

var tsFormat = () => (new Date()).toLocaleString()
const logFormat = printf((info) => `${tsFormat()} - ${info.level}: ${info.message}`)

if (process.env.NODE_ENV === 'development') {
  logTransports.push(
    new (winston.transports.Console)({
      format: combine(
        colorize(),
        logFormat
      ),
      handleExceptions: true,
      humanReadableUnhandledException: true,
      level: 'debug',
    }))
}

logTransports.push(new (winston.transports.File)({
  format: logFormat,
  filename: os.homedir() + '/.polyglot/log/debug.log',
  level: logLevel,
  maxsize: '1m',
  maxFiles: 5,
  json: false,
  handleExceptions: true,
  humanReadableUnhandledException: true,
  tailable: true
}))

var logger = winston.createLogger({ transports: logTransports, exitOnError: false })
module.exports = logger
