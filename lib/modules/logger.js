/*
Instantiate the logger for all modules
*/
const os = require('os')
const fs = require('fs')
const config = require('../config/config')
/**
 * Logger Module
 * @module modules/logger
 * @version 2.0
 */

/**
 * Default log level is INFO. If .env parameter of NODE_ENV is set to to 'development' then we up the level to DEBUG
 */
var logLevel = 'info'
var logDir = config.polyDir + 'log/'
/**
  * Create logDir if it does not exist
  */
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir)
}
/**
 * Default log level is INFO. If .env parameter of NODE_ENV is set to to 'development' then we log to the console as well as the file.
 */
var transportArray = []
const { createLogger, format, transports } = require("winston")
require('winston-daily-rotate-file');
const { combine, timestamp, printf, splat, label, colorize } = format
//var Rotate = require('winston-logrotate').Rotate

const logFormat = printf(info => {
	return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`
})

var tsFormat = () => (new Date()).toLocaleString([], { hour12: false })

if (process.env.NODE_ENV === 'development') {
	logLevel = 'debug'
	transportArray.push(
		new transports.Console({
			level: logLevel,
			handleExceptions: true,
			format: combine(
				label({label: 'polyglot'}),
				timestamp({
					format: tsFormat
				}),
				splat(),
				colorize(),
				logFormat
			)
		}))
}

var rotateTransport = new transports.DailyRotateFile({
	dirname: logDir,
	filename: 'debug-%DATE%.log',
	datePattern: 'YYYY-MM-DD',
	level: logLevel,
	maxsize: "100m",
	maxFiles: 14,
	zippedArchive: true,
	handleExceptions: true,
	exitOnError: true,
	tailable: true,
	createSymlink: true,
	symlinkName: 'debug.log',
	format: combine(
		label({label: 'polyglot'}),
		timestamp({
			format: tsFormat
		}),
		splat(),
		logFormat
	)
})

transportArray.push(rotateTransport)

const logger = createLogger({
	transports: transportArray
})

 module.exports = logger
