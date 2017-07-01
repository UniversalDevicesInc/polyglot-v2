/*
Instantiate the logger for all modules
*/
const os = require('os')

/**
 * Logger Module
 * @module modules/logger
 * @version 2.0
 */

/**
 * Default log level is INFO. If .env parameter of NODE_ENV is set to to 'development' then we up the level to DEBUG
 */
var logLevel = 'info'
/**
 * Default log level is INFO. If .env parameter of NODE_ENV is set to to 'development' then we log to the console as well as the file.
 */
var transports = []
var winston = require('winston')
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
	new (winston.transports.File)({
		filename: os.homedir() + '/.polyglot/log/debug.log',
		timestamp: tsFormat,
		level: logLevel,
		maxsize: 1000*1024,
		maxFiles: 10,
		handleExceptions: true,
		humanReadableUnhandledException: true,
		exitOnError: true,
		json: false
	})
)
var winston = new (winston.Logger)({ transports: transports })
module.exports = winston
