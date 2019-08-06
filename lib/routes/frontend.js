const express = require('express')
const router = express.Router()
const passport = require('passport')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const os = require('os')
const fs = require('fs')
const Archiver = require('archiver')

const logger = require('../modules/logger')
const config = require('../config/config')
const nodeserver = require('../modules/nodeserver')

const User = mongoose.model('User')
const Settings = mongoose.model('Settings')
const Node = mongoose.model('Node')
const NodeServer = mongoose.model('NodeServer')


/**
 * Frontend Interface Module
 * @module routes/frontend
 * @version 2.0
 */


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
  User.findOne({username: username}, (err, user) => {
    if (err) { return next(err) }
    if (!user) {
      return res.json({success: false, msg: 'User not found'})
    }
    user.comparePassword(password, user.password, (err, isMatch) => {
      if (err) { return next(err) }
      if (isMatch) {
        logger.info('Successful login by ' + user.username)
        const token = jwt.sign({data: user}, config.settings.secret, {
          expiresIn: 604800 // 1 week
        })
        cleanSettings = Settings.cleanSettings()
        Settings.sendUpdate()
        nodeserver.sendUpdate()
        res.json({
          success:true,
          token: 'JWT ' + token,
          user: {
            id: user.id,
            username: user.username
          },
          settings: cleanSettings
        })
      } else {
        res.json({success: false, msg: 'Wrong Password'})
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
  Authorization: JWT token
  Body: None
  Response: {"isyHost":"10.0.0.14","isyPort":"80","isyUsername":"admin","isyPassword":"admin","isyHttps":"false","mqttHost":"10.0.0.17","mqttPort":"1883"}
  * @name settings
  * @route {GET} /frontend/settings
  */
  router.get('/settings', passport.authenticate('jwt', {session: false}), (req, res, next) => {
    cleanSettings = Settings.cleanSettings()
    Settings.sendUpdate()
    return res.json(cleanSettings)
  })

  /*
  router.get('/nodeservers', passport.authenticate('jwt', {session: false}), (req, res, next) => {
    NodeServer.getAllNodeServers((err, docs) => {
      res.json(JSON.parse(JSON.stringify(docs)))
    })
  }) */
  // passport.authenticate('jwt', {session: false}),
  router.get('/log/:id', passport.authenticate('jwt', {session: false}), async (req, res, next) => {
    let logFile
    let response
    let ns
    if (req.params.id.toLowerCase() === 'polyglot') {
      logFile = config.polyDir + 'log/debug.log'
    }
    else {
      ns = await NodeServer.findOne({ profileNum: req.params.id }, null, { lean: true })
      if (ns && ns.type === 'local') logFile = `${ns.homeDir}${ns.logFile}`
      else response = `NS ${req.params.id} not found or its not local to Polyglot.`
    }
    if (logFile) {
      let tsFormat = () => (new Date()).toLocaleString()
      res.set({
        'access-control-expose-headers': 'content-disposition',
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment;filename=${ns ? ns.name : 'polyglot'}_${tsFormat()}.txt`
      })
      fs.createReadStream(logFile)
      .on('error', (err) => res.json({ error: err.stack }))
      .pipe(res)
    }
    else res.json({error: response})
  })

  // passport.authenticate('jwt', {session: false}),
  router.get('/log/package/:id', passport.authenticate('jwt', {session: false}), async (req, res, next) => {
    let ns = await NodeServer.findOne({ profileNum: req.params.id }, null, { lean: true })
    if (ns && ns.type === 'local') {
      let tsFormat = () => (new Date()).toLocaleString()
      res.set({
        'access-control-expose-headers': 'content-disposition',
        'content-type': 'application/zip',
        'content-disposition': `attachment;filename=${ns.name}_logs_${tsFormat()}.zip`
      })
      let zip = Archiver('zip')
      let polylogFile = config.polyDir + 'log/debug.log'
      let polylogFile2 = config.polyDir + 'log/debug.log.0'
      let nslogFile = `${ns.homeDir}${ns.logFile}`
      let nslogFile2 = `${ns.homeDir}${ns.logFile}.2`
      let nodes = await Node.find({ profileNum: req.params.id }, null, { lean: true })
      let settings = await Settings.findOne({ name: 'polyglot' }, null, { lean: true })
      zip.pipe(res)
      zip.file(polylogFile, { name: 'polyglot.log' })
      .file(polylogFile2, { name: `${ns.name}-1.log` })
      .file(nslogFile, { name: `${ns.name}.log` })
      .file(nslogFile2, { name: `${ns.name}-1.log` })
      .append(JSON.stringify(ns, null, 2), { name: `${ns.name}_db_json.txt` })
      .append(JSON.stringify(nodes, null, 2), { name: `${ns.name}_nodes_db_json.txt` })
      .append(JSON.stringify(settings, null, 2), { name: `polyglot_settings_db_json.txt` })
      .finalize()
    }
    else {
      response = `NS ${req.params.id} not found or its not local to Polyglot.`
      res.json({error: response})
    }
  })

module.exports = router
