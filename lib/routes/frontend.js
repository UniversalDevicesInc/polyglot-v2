const express = require('express')
const router = express.Router()
const passport = require('passport')
const jwt = require('jsonwebtoken')
const UserModel = require('../models/user')
const SettingsModel = require('../models/settings')
const NodeServerModel = require('../models/nodeserver')
//const db = require('../modules/db')
const config = require('../config/config')
const helpers = require('../modules/helpers')
const logger = require('../modules/logger')
const mqtt = require('../modules/mqtt')

/**
 * Frontend Interface Module
 * @module routes/frontend
 * @version 2.0
 */

// Register route (unused currently)
/*
router.post('/register', (req, res, next) => {
	let newUser = new UserModel({
		username: req.body.username,
		password: req.body.password
	})

	UserModel.addUser(newUser, (err, user) => {
		if(err) {
			res.json({success: false, msg: 'Failed to register user' + err})
		} else {
			res.json({success: true, msg: 'User registered'})
		}
	})
}) */


/**
 Headers: Content-Type: application/json
 Body: {"username": "admin", "password": "admin"}
 Response: {"success": true, "token": "JWT TOKEN", "user": {"username": "e42"}}
 * @name authenticate
 * @route {POST} /frontend/authenticate
 */
router.post('/authenticate', (req, res, next) => {
	const username = req.body.username
	const password = req.body.password

	UserModel.getUserByUsername(username, (err, user) => {
	  if (err) { return next(err) }
		if (!user) {
			return res.json({success: false, msg: 'User not found'})
		}
		UserModel.comparePassword(password, user.password, (err, isMatch) => {
			if (err) { return next(err) }
			if (isMatch) {
				logger.info('Successful login by ' + user.username)
				const token = jwt.sign({data: user}, process.env.SECRET, {
					expiresIn: 604800 // 1 week
				})
				res.json({
					success:true,
					token: 'JWT ' + token,
					user: {
						id: user.id,
						username: user.username
					}
				})
			} else {
				return res.json({success: false, msg: 'Wrong Password'})
			}
		})
	})
})

/**
 Headers: Content-Type: application/json
 Authorization: JWT token
 Body: None
 Response: {"user": {"username": "e42", "password": "$2a$10$fvKDD9EGoRrLUbfE7ypw9.DRPGmwbPoR.Zz7WecsKX4bb2UCZiZ22",}}
 * @name profile
 * @route {GET} /frontend/profile
 */
router.get('/profile', passport.authenticate('jwt', {session: false}), (req, res, next) => {
	res.json({
		user: req.user
	})
})

/**
 Headers: Content-Type: application/json
 Authorization: JWT Token
 Body: {"name": "Test123", "profileNum": 5}
 Response: {"success": true,"msg": "Installed into ISY sucessfully. Reboot the ISY and upload the profile.zip", "nodeserver": {"name": "Test123", "profileNum": "5"}}
 * @name addns
 * @route {POST} /frontend/addns
 */
router.post('/addns', passport.authenticate('jwt', {session: false}), (req, res, next) => {
	NodeServerModel.addns(req.body.name, req.body.profileNum, (err, response) => {
		if (err) return next(err)
		else res.json(response)
	})
})

/**
 Headers: Content-Type: application/json
 Authorization: JWT Token
 Body: {"profileNum": 5}
 Response: {"success":true,"msg":"Test123(5): Succesfully removed NodeServer. You must reboot the ISY."}
 * @name delns
 * @route {POST} /frontend/delns
 */
router.post('/delns', passport.authenticate('jwt', {session: false}), (req, res, next) => {
		let profileNum = req.body.profileNum
		let currentNS = config.nodeServers[profileNum]
		if (currentNS) {
			currentNS.deleteNodeServer((err, message) => {
				if (err) {
					logger.error(`DeleteNodeServer: ${err}`)
					res.json({success: false, msg: err})
				} else {
					mqtt.delSubscription(profileNum)
					NodeServerModel.sendUpdate()
					return res.json({success: true, msg: message})
				}
			})
			} else {
				let message = `NodeServer with Profile Number ${profileNum} does not exist.`
				logger.error(`${message}`)
				return res.json({success: false, msg: message})
			}
	})

// Settings routes
/*
	router.post('/settings', passport.authenticate('jwt', {session: false}), (req, res, next) => {
		let newSettings = {updatesettings: req.body}
		SettingsModel.updateSettings(newSettings, (err, settings) => {
			if (err) { return next(err) }
			settings._id = undefined
			settings.name = undefined
			config.settings = settings
			if (settings) {
				logger.debug('Settings updated.')
				helpers.restartServices()
				return res.json({success: true, msg: ''})
			} else {
				return res.json({success: false, msg: 'Unable to save settings.'})
			}
		})
	})

	router.get('/settings/reset', passport.authenticate('jwt', {session: false}), (req, res, next) => {
		SettingsModel.resetToDefault(newSettings, (err, settings) => {
			if (err) { return next(err) }
			if (settings) {
				helpers.restartServices()
				settings = JSON.parse(JSON.stringify(settings))
				delete settings._id
				return res.json(settings)
			}
		})
	})
*/

/**
 Headers: Content-Type: application/json
 Authorization: JWT token
 Body: None
 Response: {"isyHost":"10.0.0.14","isyPort":"80","isyUsername":"admin","isyPassword":"admin","isyHttps":"false","mqttHost":"10.0.0.17","mqttPort":"1883","mqttWSPort":"8083"}
 * @name settings
 * @route {GET} /frontend/settings
 */
	router.get('/settings', passport.authenticate('jwt', {session: false}), (req, res, next) => {
		cleanSettings = JSON.parse(JSON.stringify(config.settings))
		cleanSettings.isypassword = undefined
		return res.json(cleanSettings)
	})

	router.get('/nodeservers', passport.authenticate('jwt', {session: false}), (req, res, next) => {
		NodeServerModel.getAllNodeServers((err, docs) => {
			res.json(JSON.parse(JSON.stringify(docs)))
		})

	})

module.exports = router
