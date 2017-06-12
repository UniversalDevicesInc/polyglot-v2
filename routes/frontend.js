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


// Authenticate Route
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
				const token = jwt.sign(user, process.env.SECRET, {
					expiresIn: 604800 // 1 week
				})
				res.json({
					success:true,
					token: 'JWT ' + token,
					user: {
						id: user._id,
						username: user.username
					}
				})
			} else {
				return res.json({success: false, msg: 'Wrong Password'})
			}
		})
	})
})

// Profile Route
router.get('/profile', passport.authenticate('jwt', {session: false}), (req, res, next) => {
	res.json({
		user: req.user
	})
})

// Add NodeServer route
router.post('/addns', passport.authenticate('jwt', {session: false}), (req, res, next) => {
	NodeServerModel.addns(req.body.name, req.body.profileNum, (err, response) => {
		if (err) return next(err)
		else res.json(response)
	})
})

	// Delete NodeServer route
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

	router.get('/settings', passport.authenticate('jwt', {session: false}), (req, res, next) => {
		cleanSettings = JSON.parse(JSON.stringify(config.settings))
		cleanSettings.isypassword = undefined
		cleanSettings._id = undefined
		cleanSettings.name = undefined
		return res.json(cleanSettings)
	}) */

	router.get('/nodeservers', passport.authenticate('jwt', {session: false}), (req, res, next) => {
		NodeServerModel.getAllNodeServers((err, docs) => {
			res.json(JSON.parse(JSON.stringify(docs)))
		})

	})

module.exports = router
