const express = require('express')
const router = express.Router()
const passport = require('passport')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
// const os = require('os')
const fs = require('fs')
const Archiver = require('archiver')
const unzipper = require('unzipper')
const rp = require('request-promise-native')

const logger = require('../modules/logger')
const encrypt = require('../modules/encryption')
const config = require('../config/config')
const nodeserver = require('../modules/nodeserver')
const child = require('../modules/children')
const helpers = require('../modules/helpers')
const isy = require('../modules/isy')

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
 Authorization: None
 Body: None
 Response: {"isPolisy": true}
 * @name profile
 * @route {GET} /frontend/ispolisy
 */
router.get('/ispolisy', (req, res, next) => {
  res.json({
    isPolisy: config.settings.isPolisy || false
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
    let tsFormat = () => (new Date()).toLocaleString().replace(/, /g, '_').replace(/\//g, '-').replace(/ /g, '_').replace(/:/g, '')
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
    let tsFormat = () => (new Date()).toLocaleString().replace(/, /g, '_').replace(/\//g, '-').replace(/ /g, '_').replace(/:/g, '')
    res.set({
      'access-control-expose-headers': 'content-disposition',
      'content-type': 'application/zip',
      'content-disposition': `attachment;filename=${ns.name}_logs_${tsFormat()}.zip`
    })
    let zip = Archiver('zip')
    let polylogFile = config.polyDir + 'log/debug.log'
    let nslogFile = `${ns.homeDir}${ns.logFile}`
    let nslogFile2 = `${ns.homeDir}${ns.logFile}.2`
    let nodes = await Node.find({ profileNum: req.params.id }, null, { lean: true })
    let settings = await Settings.findOne({ name: 'polyglot' }, null, { lean: true })
    zip.pipe(res)

    zip.append(fs.createReadStream(polylogFile), { name: 'polyglot.log' })
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
//process.kill(process.pid, "SIGINT")
router.get('/backup', passport.authenticate('jwt', {session: false}), async (req, res, next) => {
  try {
    logger.info(`Creating backup...`)
    let tsFormat = () => (new Date()).toLocaleString().replace(/, /g, '_').replace(/\//g, '-').replace(/ /g, '_').replace(/:/g, '')
    let filename = `polyglot-backup-${tsFormat()}.zip`
    res.set({
      'access-control-expose-headers': 'content-disposition',
      'content-type': 'application/zip',
      'content-disposition': `attachment;filename=${filename}`
    })
    let master = { nodes: {} }
    let persistFolders = []
    let zip = Archiver('zip', { zlib: { level: 9 }})
    zip.pipe(res)
    master.nodeServers = await NodeServer.find({type: 'local'}, null, { lean: true })
    for (let ns of master.nodeServers) {
      master.nodes[ns.profileNum] = await Node.find({profileNum: ns.profileNum}, null, { lean: true })
      if (ns && ns.hasOwnProperty('homeDir')) {
        if (fs.existsSync(ns.homeDir + 'server.json')) {
          let server = JSON.parse(fs.readFileSync(ns.homeDir + 'server.json', 'utf8'))
          if (server.hasOwnProperty('persist_folder')) {
            zip.directory(ns.homeDir + server.persist_folder, `${ns.name}/${server.persist_folder}`)
          } else {
            logger.debug(`No persist_folder found in server.json for ${ns.name}`)
          }
        } else {
          logger.debug(`No server.json found for ${ns.name}`)
        }
      }
    }
    let encrypted = encrypt.encryptText(JSON.stringify(master))
    logger.info(`Created backup: ${filename}`)
    zip.append(encrypted, { name: 'backup.bin' })
    .finalize()
    //res.end(encrypted)
  } catch (err) {
    res.json({error: `${err.message}`})
  }
})

router.post('/restore', passport.authenticate('jwt', {session: false}), async (req, res, next) => {
  try {
    logger.info(`RESTORE: Processing restore request. File Name: ${req.files.file.name}`)
    const directory = await unzipper.Open.buffer(req.files.file.data)
    const backupFile = directory.files.find(d => d.path === 'backup.bin')
    const decrypted = JSON.parse(encrypt.decryptText((await backupFile.buffer()).toString()))
    logger.info(`RESTORE: Backup decrypted, processing NodeServers for Restore...`)
    const options = {
      method: 'GET',
      url: 'https://pgcstore.isy.io/v1/list?all',
      resolveWithFullResponse: true,
      simple: false,
      timeout: 5000,
      gzip: true
    }
    let storeRes = await rp(options)
    if (storeRes.statusCode !== 200) { throw new Error('Could not get nodeservers from pgcstore')}
    const storeNodeServers = JSON.parse(storeRes.body)
    if (decrypted.nodeServers && decrypted.nodeServers.length > 0) {
      for (let ns of decrypted.nodeServers) {
        try {
          delete ns._id
          delete ns.__v
          ns.homeDir = `${config.polyDir}/nodeservers/${ns.name}/`
          logger.info(`RESTORE: Attempting restore of ${ns.name} in slot ${ns.profileNum}`)
          if (config.nodeServers[ns.profileNum]) {
            logger.info(`RESTORE: NodeServer already provisioned in slot ${ns.profileNum}: ${config.nodeServers[ns.profileNum].name} overwriting.`)
            if (config.nodeProcesses[ns.profileNum]) {
              logger.info(`RESTORE: ${config.nodeServers[ns.profileNum].name} still running. Shutting down.`)
              await child.stopChildNodeServer(config.nodeServers[ns.profileNum])
            }
          }
          logger.info(`RESTORE: Restoring NodeServer ${ns.name} in slot ${ns.profileNum}`)
          let result = await NodeServer.findOneAndUpdate({profileNum: ns.profileNum}, ns, { upsert: true, new: true })
          if (result && result.name === ns.name) {
            logger.info(`RESTORE: NodeServer (${ns.profileNum}) - ${ns.name} complete. Processing nodes...`)
            let deleted = await Node.deleteMany({ profileNum: ns.profileNum })
            if (deleted.deletedCount > 0) { logger.info(`RESTORE: Found existing nodes. Removed all before restore.`) }
            for (let node of decrypted.nodes[ns.profileNum]) {
              delete node._id
              delete node.__v
              let result = await Node.findOneAndUpdate({ address: node.address }, node, { upsert: true, new: true })
              logger.info(`RESTORE: Restored Node: ${ns.name} :: ${node.name} (${node.address})`)
            }
            logger.info(`RESTORE: Nodes Restored verifying ${ns.name} installation on ISY...`)
            await nodeserver.restoreNodeServer(ns)
            logger.info(`RESTORE: ${ns.name} ISY Restored verifing ${ns.name} code installation...`)
            let nsPath = `${config.polyDir}nodeservers/${ns.name}`
            let cloneOpts = { name: ns.name, updateProfile: true, url: false }
            if (fs.existsSync(nsPath)) {
              await child.pullRepo(cloneOpts)
            } else {
              for (let storens of storeNodeServers) {
                if (storens.name === ns.name) {
                  cloneOpts.url = storens.url
                  break
                }
              }
              if (cloneOpts.url) {
                await child.cloneRepo(cloneOpts)
              } else {
                logger.error(`NodeServer ${ns.name} not found in the store. Can't reinstall.`)
              }
            }
          } else {
            logger.error(`Failed to update nodeserver. ${JSON.stringify(result)}`)
          }
        } catch (err) {
          logger.error(`Failed to update nodeserver. ${err.stack}`)
        }
      }
      logger.info(`RESTORE: Completed Database restore... Starting persistent file extraction.`)
      await directory.extract({ path: `${config.polyDir}nodeservers/`, concurrency: 5 })
      fs.unlinkSync(`${config.polyDir}nodeservers/backup.bin`)
      logger.info(`RESTORE: Completed persistent file extraction.`)
    }
    res.json({success: true})
    logger.info(`RESTORE: Restore has been completed. Shutting down Polyglot in 5 seconds.`)
    await helpers.wait(5000)
    process.kill(process.pid, "SIGINT")
  } catch (err) {
    res.json({error: `${err.message}`})
  }
})

module.exports = router
