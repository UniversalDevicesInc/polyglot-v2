const mongoose = require('mongoose') //.set('debug', true)
const bcrypt = require('bcryptjs')
const ip = require('ip')
const fs = require('fs')
const os = require('os')
const splitca = require('split-ca')

const logger = require('../modules/logger')
const config = require('../config/config')
const encrypt = require('../modules/encryption')
const mqttc = require('../modules/mqtt')
const findisy = require('../modules/findisy')
const isy = require('../modules/isy')

// Node Schema
const SettingsSchema = mongoose.Schema({
  name: {
    type: String,
    default: 'polyglot'
  },
  'isyUsername': {
    type: String,
    default: process.env.ISY_USERNAME || 'admin'
  },
  'isyPassword': {
    type: String,
    default: encrypt.encryptText('admin')
  },
  'isyPort': {
    type: Number,
    default: process.env.ISY_PORT || 80
  },
  'isyHost': {
    type: String,
    default: process.env.ISY_HOST || '192.168.1.10'
  },
  'isyHttps': {
    type: Boolean,
    default: process.env.ISY_HTTPS || false
  },
  'isyVersion': {
    type: String,
    default: '0.0.0'
  },
  'pgVersion': {
    type: String,
    default: '0.0.0'
  },
  'mqttHost': {
    type: String,
    default: process.env.MQTT_HOST || 'localhost'
  },
  'mqttPort': {
    type: Number,
    default: process.env.MQTT_PORT || 1883
  },
  'secret': {
    type: String,
    default: process.env.SECRET || encrypt.randomString(25)
  },
  'ipAddress': {
    type: String,
    default: process.env.HOST_IP || ip.address()
  },
  'bindIPAddress': {
    type: String,
    default: process.env.BIND_IP || '0.0.0.0'
  },
  'isyConnected': {
    type: Boolean,
    default: false
  },
  'isyFound': {
    type: Boolean,
    default: false
  },
  'listenPort': {
    type: Number,
    default: process.env.HOST_PORT || 3000
  },
  'useHttps': {
    type: Boolean,
    default: process.env.USE_HTTPS || true
  },
  'sslData': {
    type: Object,
    default: {}
  },
  'customSSL': {
    type: Boolean,
    default: false
  },
  'customSSLData': {
    type: Object,
    default: {}
  },
  'useBeta': {
    type: Boolean,
    default: false
  },
  'timeStarted': {
    type: String,
    default: null
  },
  'dbVersion': {
    type: Number,
    default: 1
  }
}, { usePushEach: true })

SettingsSchema.statics = {
  sendUpdate ()  {
    cleanSettings = SettingsModel.cleanSettings()
    mqttc.publish('udi/polyglot/frontend/settings', {node: 'polyglot', settings: cleanSettings}, {retain: true})
  },

  async updateSettings (newSettings) {
    if (newSettings.hasOwnProperty('updateprofile')) {
      const options = { new: true, upsert: true }
      const query = {_id: new mongoose.Types.ObjectId(newSettings.updateprofile._id)}
      delete newSettings.updateprofile._id
      if (newSettings.updateprofile.hasOwnProperty('password')) {
        var newPass
        bcrypt.genSalt(2, (err, salt) => {
          bcrypt.hash(newSettings.updateprofile.password, salt, (err, hash) => {
            if(err) throw err
            newSettings.updateprofile.password = hash
            mongoose.model('User').findOneAndUpdate(query, newSettings.updateprofile, options, (err, doc) => {
              if (err) { return logger.error('Failed to update profile: ' + err)}
              logger.info('Successfully updated profile for User: ' + doc.username)
            })
          })
        })
      } else {
        mongoose.model('User').findByIdAndUpdate(new mongoose.Types.ObjectId(newSettings.updateprofile._id), newSettings.updateprofile, options, (err, doc) => {
          logger.info('Successfully updated profile for User: ' + doc.username)
        })
      }
    } else {
      settings = JSON.parse(JSON.stringify(newSettings.updatesettings))
      if (settings.name) { delete settings.name }
      if (settings._id) { delete settings._id }
      if (settings.isyPassword) {
        settings.isyPassword = encrypt.encryptText(settings.isyPassword)
      }
      const query = { name: 'polyglot' }
      const options = { new: true, upsert: true }
      let doc = await SettingsModel.findOneAndUpdate(query, settings, options)
      logger.info('Settings Saved Successfully.')
      config.settings = doc
      if (newSettings.hasOwnProperty('seq')) {
        let response = {
          node: 'polyglot',
          seq: newSettings.seq,
          response: {
            success: true,
            msg: ''
          }
        }
        mqttc.publish('udi/polyglot/frontend/settings', response)
        require('../modules/nodeserver').verifyNonManagedNodeServers()
        await isy.getVersion()
        SettingsModel.sendUpdate()
      }
    }
  },

  async resetToDefault () {
    const newSettings = new SettingsModel()
    let settings = config.dotenv.parsed || {}
    if (settings.hasOwnProperty('ISY_HOST')) {
      newSettings.isyHost = settings.ISY_HOST
      if (settings.hasOwnProperty('ISY_PORT')) { newSettings.isyPort = settings.ISY_PORT }
      if (settings.hasOwnProperty('ISY_HTTPS')) { newSettings.isyHttps = settings.ISY_HTTPS }
      logger.info(`ISY Host Override found. Skipping auto-discovery. ${newSettings.isyHttps ? 'https://' : 'http://'}${newSettings.isyHost}:${newSettings.isyPort}`)
      const query = { name: 'polyglot' }
      const options = { overwrite: true, new: true, upsert: true }
      var upsertData = newSettings.toObject()
      delete upsertData._id
      await SettingsModel.findOneAndUpdate(query, upsertData, options)
      await SettingsModel.loadSettings()
    } else {
      logger.info(`Auto Discovering ISY on local network.....`)
      try {
        [isyFound, isyAddress, isyPort] = await findisy.find()
        newSettings.isyHost = isyAddress
        newSettings.isyPort = isyPort
        newSettings.isyFound = true
        logger.info(`${(isyFound ? 'ISY discovered at address' : 'No ISY responded on local network. Using default config of')}: ${isyAddress}:${isyPort}`)
      } catch (err) {
        logger.error(err)
      }
      const query = { name: 'polyglot' }
      const options = { overwrite: true, new: true, upsert: true }
      var upsertData = newSettings.toObject()
      delete upsertData._id
      await SettingsModel.findOneAndUpdate(query, upsertData, options)
      await SettingsModel.loadSettings()
    }
  },

  async loadSettings() {
    let dbsettings = await SettingsModel.findOne({name: 'polyglot'})
    if (dbsettings) {
      config.settings = dbsettings
      config.settings.timeStarted = + new Date
      let packageSettings = require('../../package.json')
      config.settings.pgVersion = packageSettings.version
      logger.info('Settings: Polyglot Version ' + config.settings.pgVersion)
      logger.info('Settings: Retrieved config from database')
      await SettingsModel.parseEnvUpdate()
      if (config.settings.useHttps === true) {
        try {
          await SettingsModel.getSSLData()
        } catch (e) {
          logger.error('Failed to get SSL Key or Cert. Falling back to HTTP')
          config.settings.useHttps = false
        }
      }
      await config.settings.save()
    } else {
      logger.info('Settings: No config found in database, creating settings entries.')
      await SettingsModel.resetToDefault()
    }
  },

  async getSSLData() {
    const sslDir = config.polyDir + 'ssl/'
    process.umask(0o177)
    if (Object.keys(config.settings.sslData).length !== 0 && config.settings.sslData.constructor === Object) {
      logger.debug('TLS: Found Keys and Certificate data in database. Exporting to ' + sslDir.toString())
      fs.writeFileSync(sslDir + 'polyglot_private.key', config.settings.sslData.private)
      fs.writeFileSync(sslDir + 'polyglot_public.key', config.settings.sslData.public)
      fs.writeFileSync(sslDir + 'polyglot.crt', config.settings.sslData.cert)
      fs.writeFileSync(sslDir + 'client_private.key', config.settings.sslData.clientprivate)
      fs.writeFileSync(sslDir + 'client_public.key', config.settings.sslData.clientpublic)
      fs.writeFileSync(sslDir + 'client.crt', config.settings.sslData.clientcert)
    } else {
      logger.info('SSL: No HTTPS Certificate or Key found. Generating...')
      var selfsigned = require('selfsigned')
      var attrs = [
        { name: 'commonName', value: os.hostname()},
        { name: 'countryName', value: 'US'},
        { shortName: 'ST', value: 'California'},
        { name: 'localityName', value: 'Los Angeles'},
        { name: 'organizationName', value: 'Universal Devices'},
        { shortName: 'OU', value: 'polyglot'}
      ]
      var opts = {
        keySize: 2048,
        algorithm: 'sha256',
        days: 365 * 10,
        clientCertificate: true,
        clientCertificateCN: 'polyglot_client'
      }
      opts.extensions = [{
        name: 'subjectAltName',
        altNames: [{
          type: 2,
          value: os.hostname()
        }, {
          type: 2,
          value: 'polyglot.local'
        }, {
          type: 2,
          value: 'raspberrypi.local'
        }, {
          type: 2,
          value: 'polyglot'
        }, {
          type: 2,
          value: 'localhost'
        } , {
          type: 7,
          ip: config.settings.ipAddress
        }, {
          type: 7,
          ip: '127.0.0.1'
        } ]
      }]
      var pems = await selfsigned.generate(attrs, opts)
      config.settings.sslData = pems
      fs.writeFileSync(sslDir + 'polyglot_private.key', pems.private)
      fs.writeFileSync(sslDir + 'polyglot_public.key', pems.public)
      fs.writeFileSync(sslDir + 'polyglot.crt', pems.cert)
      fs.writeFileSync(sslDir + 'client_private.key', pems.clientprivate)
      fs.writeFileSync(sslDir + 'client_public.key', pems.clientpublic)
      fs.writeFileSync(sslDir + 'client.crt', pems.clientcert)
      logger.info('SSL: Certificate Generation completed successfully.')
    }
    process.umask(0o022)
    if (config.settings.customSSL) {
      await SettingsModel.readCustomSSL(sslDir)
    }
  },

  async readCustomSSL(sslDir) {
    let customSSLData = JSON.parse(JSON.stringify(config.settings.customSSLData))
    if (Object.keys(customSSLData).length === 0) {
      customSSLData = {key: '', cert: '', ca: []}
    }
    try {
      customSSLData.key = encrypt.encryptText(fs.readFileSync(sslDir + 'custom/custom.key', 'utf8'))
      logger.debug(`Custom SSL Key file found. Importing to database and encrypting.`)
    } catch (e) {
      if (customSSLData.key === '') {
        logger.error(`Custom SSL Key file could not be read and doesn't exist in the database. Falling back to self-signed.`)
        config.settings.customSSL = false
      } else {
        logger.debug(`Custom SSL Key file could not be read but data exists in database. Using.`)
      }
    }
    if (config.settings.customSSL) {
      try {
        customSSLData.cert = fs.readFileSync(sslDir + 'custom/custom.crt', 'utf8')
        logger.debug(`Custom SSL Cert file found. Importing to database.`)
      } catch (e) {
        if (customSSLData.cert === '') {
          logger.error(`Custom SSL Cert file could not be read and doesn't exist in the database. Falling back to self-signed.`)
          config.settings.customSSL = false
        } else {
          logger.debug(`Custom SSL Cert file could not be read but data exists in database. Using.`)
        }
      }
    }
    if (config.settings.customSSL) {
      try {
        customSSLData.ca = splitca(sslDir + 'custom/custom.ca', '\n', 'utf8')
        logger.debug(`Custom SSL CA Chain file found. Importing to database.`)
      } catch (e) {
        if (customSSLData.ca.length === 0) {
          logger.error(`Custom SSL CA file could not be read and doesn't exist in the database. Falling back to self-signed.`)
          config.settings.customSSL = false
        } else {
          logger.debug(`Custom SSL CA file could not be read but data exists in database. Using.`)
        }
      }
    }
    config.settings.customSSLData = customSSLData
    if (config.settings.customSSL) {
      logger.debug(`Custom SSL Certificates enabled`)
    }
  },

  cleanSettings() {
    // hack to deepcopy in node
    let cleanSettings = JSON.parse(JSON.stringify(config.settings))
    delete cleanSettings.isyPassword
    delete cleanSettings._id
    delete cleanSettings.name
    delete cleanSettings.sslData
    delete cleanSettings.customSSLData
    delete cleanSettings.customSSL
    return cleanSettings
  },

  async parseEnvUpdate() {
    try {
      let settings = config.dotenv.parsed || {}
      config.settings.customSSL = false
      if (settings.hasOwnProperty('HOST_IP')) { config.settings.ipAddress = settings.HOST_IP } else { config.settings.ipAddress = ip.address() }
      if (settings.hasOwnProperty('BIND_IP')) { config.settings.bindIPAddress = settings.BIND_IP } else { config.settings.bindIPAddress = '0.0.0.0' }
      if (settings.hasOwnProperty('HOST_PORT')) { config.settings.listenPort = settings.HOST_PORT }
      if (settings.hasOwnProperty('ISY_USERNAME')) { config.settings.isyUsername = settings.ISY_USERNAME }
      if (settings.hasOwnProperty('ISY_PASSWORD')) { config.settings.isyPassword = encrypt.encryptText(settings.ISY_PASSWORD) }
      if (settings.hasOwnProperty('ISY_HOST')) { config.settings.isyHost = settings.ISY_HOST }
      if (settings.hasOwnProperty('ISY_PORT')) { config.settings.isyPort = settings.ISY_PORT }
      if (settings.hasOwnProperty('ISY_HTTPS')) { config.settings.isyHttps = settings.ISY_HTTPS }
      if (settings.hasOwnProperty('MQTT_HOST')) { config.settings.mqttHost = settings.MQTT_HOST }
      if (settings.hasOwnProperty('MQTT_PORT')) { config.settings.mqttPort = settings.MQTT_PORT }
      if (settings.hasOwnProperty('CUSTOM_SSL')) { config.settings.customSSL = settings.CUSTOM_SSL }
      if (settings.hasOwnProperty('USE_HTTPS')) { config.settings.useHttps = settings.USE_HTTPS } else { config.settings.useHttps = true }
      if (settings.hasOwnProperty('USE_BETA')) { config.settings.useBeta = settings.USE_BETA }
      logger.info('Settings: Retrieved config overrides from .env and updated database')
    } catch (e) {
      logger.error('Settings: ParseEnv Error ' + e)
    }
  }
}

const SettingsModel = mongoose.model('Settings', SettingsSchema)
