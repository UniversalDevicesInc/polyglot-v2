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
var transports = []
var winston = require('winston')
require('winston-logrotate')
var tsFormat = () => (new Date()).toLocaleString()
if (process.env.NODE_ENV === 'development') {
		logLevel = 'debug'
		transports.push(
			new (winston.transports.Console)({
					timestamp: tsFormat,
					level: logLevel,
					colorize: true,
					handleExceptions: true,
					humanReadableUnhandledException: true
				}))
}
transports.push(
	new (winston.transports.Rotate)({
		file: os.homedir() + '/.polyglot/log/debug.log',
		timestamp: tsFormat,
		level: logLevel,
		size: '10m',
		keep: 5,
		handleExceptions: true,
		humanReadableUnhandledException: true,
		exitOnError: true,
		json: false
	})
)
var winston = new (winston.Logger)({ transports: transports })
module.exports = winston
