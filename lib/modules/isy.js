const logger = require('./logger')
const config = require('../config/config')
require('http').globalAgent.maxSockets = 2
require('https').globalAgent.maxSockets = 2
const request = require('request')
const rp = require('request-promise-native')
const encrypt = require('./encryption')
const xmlparser = require('xml2json-light')
const querystring = require('querystring')
const mqtt = require('./mqttc')
const SettingsModel = require('../models/settings')

/**
 * ISY API Module for REST calls to the ISY Interfaces
 * @module modules/isy
 * @version 2.0
 */

module.exports = {
  /**
 * Automactially adds the ISY Node Prefix onto the address before querying the API.
 * @method
 * @param {number} profileNum - The NodeServer profileNum.
 * @param {string} nod - The NodeServer address id
 */
  addNodePrefix(profileNum, nid) {
    return `n${('00' + profileNum).slice(-3)}_${nid}`.slice(0, 20)
  },

  /**
   * Creates the API URL to query ISY
   * /rest/{api}/?{path_args}
   * @method
   * @param {string} api - The ISY API path to query
   * @param {object} path_args - Dictionary of path arguments appended to the URL.
   */
  makeApiUrl(api, path_args = null) {
    url = `${config.settings.isyHttps === true ? 'https://' : 'http://'}${config.settings.isyHost}:${config.settings.isyPort}/rest/${api}/`
    if (path_args) {
      url += '?' + querystring.stringify(path_args)
    }
    //url = encodeURI(url)
    return url
  },

  /**
   * Creates the Node URL to query ISY
   * /rest/ns/{profileNum}/{path}/?{path_args}
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} path - The ISY path to query
   * @param {object} path_args - Dictionary of path arguments appended to the URL.
   */
  makeNodeUrl(profileNum, path, path_args) {
    url = `${config.settings.isyHttps === true ? 'https://' : 'http://'}${config.settings.isyHost}:${config.settings.isyPort}/rest/ns/${profileNum}/${path.join('/')}`
    if (path_args) {
      url += '?' + querystring.stringify(path_args).trim()
    }
    //url = encodeURI(url)
    return url
  },

  /**
   * Performs the actual query to ISY
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} url - The URL created by makeNodeUrl or makeApiUrl
   * @param {number} seq - Sequence number to verify response on specific call
   * @param {boolean} getText - Get full response text from ISY and package it in the response. True/False
   * @param {function} callback - Simple (err, response) callback with the result success or fail.
   */
  async getIsy(profileNum, url, seq, getText) {
    return new Promise(async (resolve, reject) => {
      var options = {
        method: 'GET',
        "url": url,
        resolveWithFullResponse: true,
        simple: false,
        timeout: 1500
      }
      var hrstart = process.hrtime()
      try {
        await rp(options).auth(config.settings.isyUsername, encrypt.decryptText(config.settings.isyPassword)).then((res) => {
          var text=''
          //var xmlOptions = {object: true}
          logger.debug(`ISY: ${res.statusCode} - ${url}`)
          if (getText) {
            text = xmlparser.xml2json(res.body)
          }
          result = {
            isyresponse: text,
            statusCode: res.statusCode,
            seq: seq,
            elapsed: process.hrtime(hrstart)[1]/1000000 + 'ms',
            profileNum: profileNum
          }
          resolve(result)
        })
      } catch (err) {
        reject(err)
      }
    })
  },

  /**
   * Handles the Request from Polyglot calls TO the ISY and formats them appropriately based on type.
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} data - Data received for the type of query from MQTT.
   * @param {string} command - Command received to query to the ISY
   * @param {boolean} getText - Get full response text from ISY and package it in the response. True/False. Default is False
   * @param {function} callback - Simple (response) callback with the result success or fail.
   */
  async handleRequest(profileNum, data, command, gettext = false, callback){
    var url = (this[command] || this['notfound']).call(this, profileNum, data, command)
    if (url) {
      try {
        const result = await this.getIsy(profileNum, url, data.seq ? data.seq : false, gettext)
        if (callback) return callback(result)
      } catch (err) {
        logger.error(`ISY: ${err}`)
        if (callback) return callback(err)
      }
    } else {
      logger.error(`ISY: handleRequest - ${command} did not return a valid URL.`)
      if (callback) { return callback(`${command} did not return a valid URL.`) }
    }
  },

  async handleRequestP(profileNum, data, command, gettext = false) {
    return new Promise(async (resolve, reject) => {
      var url = (this[command] || this['notfound']).call(this, profileNum, data, command)
      if (url) {
        try {
          const result = await this.getIsy(profileNum, url, data.seq ? data.seq : false, gettext)
          resolve(result)
        } catch (err) {
          logger.error(`ISY: ${err}`)
          reject(err)
        }
      } else {
        logger.error(`ISY: handleRequest - ${command} did not return a valid URL.`)
        reject(`${command} did not return a valid URL.`)
      }
    })
  },

  /**
   * Handles the status calls to ISY
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} data - Data received for the type of query from MQTT.
   * @param {string} cmd - Command received to query to the ISY
   */
  status(profileNum, data, cmd) {
    var url=false
    if (data.address) {
      //var url = isy.makeApiUrl(this.profileNum, 'config', {'test': true})
      var address = this.addNodePrefix(profileNum, data.address)
      var path = ['nodes', address, 'report', 'status', data.driver, data.value, data.uom]
      url = this.makeNodeUrl(profileNum, path)
    } else { logger.error(`ISY: address not found in ${cmd} call.`) }
    return url
  },

  /**
   * Handles the command calls to ISY
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} data - Data received for the type of query from MQTT.
   * @param {string} cmd - Command received to query to the ISY
   */
  command(profileNum, data, cmd) {
    var url=false
    if (data.address) {
      var address = this.addNodePrefix(profileNum, data.address)
      var path = ['nodes', address, 'report', 'cmd', data.command]
      var checks = [data.value, data.uom]
      for (var index in checks) {
        if (checks[index] !== null) {
          path.push(checks[index])
        }
      }
      var url = this.makeNodeUrl(profileNum, path)
    } else { logger.error(`ISY: Error address not found in ${cmd} call.`) }
    return url
  },

  /**
   * Handles the addnode calls to ISY
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} data - Data received for the type of query from MQTT.
   * @param {string} cmd - Command received to query to the ISY
   */
  addnode(profileNum, data, cmd){
    var url=false
    if (data.address && data.primary && data.name && data.node_def_id) {
      var address = this.addNodePrefix(profileNum, data.address)
      var primary = this.addNodePrefix(profileNum, data.primary)
      var path = ['nodes', address, 'add', data.node_def_id]
      var queryargs = {
        'primary': primary,
        'name': data.name
      }
      var url = this.makeNodeUrl(profileNum, path, queryargs)
    } else { return logger.error(`ISY: Error address, primary, node_def_id, or name not found in ${cmd} call.`) }
    return url
  },

  /**
   * Handles the removenode calls to ISY
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} data - Data received for the type of query from MQTT.
   * @param {string} cmd - Command received to query to the ISY
   */
  removenode(profileNum, data, cmd){
    var url=false
    if (data.address) {
      var address = this.addNodePrefix(profileNum, data.address)
      var path = ['nodes', address, 'remove']
      var url = this.makeNodeUrl(profileNum, path)
    } else { logger.error(`ISY: Error address not found in ${cmd} call.`) }
    return url
  },

  /**
   * Handles the restcall calls to ISY
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} data - Data received for the type of query from MQTT.
   * @param {string} cmd - Command received to query to the ISY
   */
  restcall(profileNum, data, cmd) {
    var url=false
    if (data.api) {
      url = this.makeApiUrl(data.api, data.args)
    } else { return logger.error(`ISY: api not found in ${cmd} call.`) }
    return url
  },

  /**
   * Handles the request calls to ISY
   * @method
   * @param {number} profileNum - The NodeServer profileNum
   * @param {string} data - Data received for the type of query from MQTT.
   * @param {string} cmd - Command received to query to the ISY
   */
  request(profileNum, data, cmd){
    var url=false
    if (data.requestId) {
      var path = ['report', 'request', data.requestId, data.success ? 'success' : 'fail']
      var url = this.makeNodeUrl(profileNum, path)
    } else { logger.error(`ISY: Error request_id or success not found in ${cmd} call.`) }
    return url
  },

  /**
   * Handles the inital getVersion request to verify ISY connectivity
   * @method
   * @param {function} callback - Simple (err) callback if there is an error. Otherwise no parameters passed. We save the result in the config/config singleton.
   */
  async getVersion(callback) {
    var version = ''
    var data = {}
    data['api'] = 'config'
    var url = this.restcall(0, data, 'getVersion')
    try {
      const result = await this.getIsy(0, url, false, true)
      config.settings.isyVersion = result.isyresponse.configuration.app_version
      config.settings.isyConnected = true
      config.settings.save()
      logger.info(`ISY: Got Version ${config.settings.isyVersion}`)
      if (callback) return callback()
    } catch (err) {
      logger.error(`Get Version HTTP Error: ${err}`)
      config.settings.isyConnected = false
      config.settings.save()
      logger.error(`ISY: Failed to get version.`)
      if (callback) return callback(err)
    }
  },

  profileUpload(type, filename, data, profileNum, callback = function(){}) {
    let url = `${config.settings.isyHttps === true ? 'https://' : 'http://'}${config.settings.isyHost}:${config.settings.isyPort}/rest/ns/profile/${profileNum}/upload/${filename}`
    let options = {
      headers: {'content-type': 'application/xml'},
      url: url,
      body: data
    }
    request.post(options, (err, res, body) => {
      if (res && res.statusCode === 200) {
        logger.debug(`NS: Sucessfully uploaded ${filename} to ISY.`)
        callback()
      } else {
        logger.debug(`NS: Failed to upload ${filename} to ISY. Please upload profile.zip manually.`)
        callback('failed')
      }
    }).auth(config.settings.isyUsername, encrypt.decryptText(config.settings.isyPassword))
  },

  reboot() {
    let data = `<s:Envelope>
                  <s:Body>
                    <u:Reboot xmlns:u="urn:udi-com:service:X_Insteon_Lighting_Service:1">
                      <code></code>
                    </u:Reboot>
                  </s:Body>
                </s:Envelope>`
    let url = `${config.settings.isyHttps === true ? 'https://' : 'http://'}${config.settings.isyHost}:${config.settings.isyPort}/services`
    let options = {
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      url: url,
      body: data
    }
    request.post(options, (err, res, body) => {
      if (res.statusCode === 200) {
        logger.debug(`ISY: Reboot command sent to ISY sucessfully.`)
      } else {
        logger.debug(`ISY: Reboot command not sent to ISY sucessfully. Status Code: ${res.statusCode}`)
      }
    }).auth(config.settings.isyUsername, encrypt.decryptText(config.settings.isyPassword))
  },

  /**
   * Handles the incoming install command from ISY
   * Not Implemented from the ISY at the moment. (I can't get ISY to send me the command)
   * @method
   * @param {object} req - Express incoming request object.
   * Params at req.params
   * Query vars at req.query
   * @param {object} res - Express response object.
   */
  restInstall(req, res) {
    logger.debug('Got REST Install ', req.params, req.query)
  },

  /**
   * Handles the incoming status or query command from ISY and passes it along to the NodeServer
   * This handles the succesful response to ISY as well.
   * @method
   * @param {object} req - Express incoming request object.
   * Params at req.params
   * Query vars at req.query
   * @param {object} res - Express response object.
   */
  restStatus(req, res) {
    let message = {
      address: req.params.nodeAddress === "0" ? 'all' : req.params.nodeAddress.slice(5)
    }
    mqtt.makeResponse(req.params.id, req.params.command, message)
    if (req.query.requestId) {
      let data = {
        requestId: req.query.requestId,
        success: true
      }
      this.handleRequest(req.params.id, data, 'request')
    }
  },

  /**
   * Handles the addnodes command from ISY
   * Not implemented on the ISY side yet.
   * @method
   * @param {object} req - Express incoming request object.
   * Params at req.params
   * Query vars at req.query
   * @param {object} res - Express response object.
   */
  restAddNodes(req, res) {
    console.log(req.params, req.query)
  },

  /**
   * Handles the report command from ISY
   * Not implemented on the ISY side yet.
   * @method
   * @param {object} req - Express incoming request object.
   * Params at req.params
   * Query vars at req.query
   * @param {object} res - Express response object.
   */
  restReport(req, res) {
    console.log(req.params, req.query)
  },

  /**
   * Handles the 'command' command from ISY and passes it to the NodeServer to exectue a command. e.g. DON/DOF/etc.
   * @method
   * @param {object} req - Express incoming request object.
   * Params at req.params
   * Query vars at req.query
   * @param {object} res - Express response object.
   */
  restCommand(req, res) {
    if (!config.nodeServers[req.params.id].isConnected) {
      logger.info(`Recieved ${req.params.command} for ${req.params.nodeAddress} however NodeServer ${config.nodeServers[req.params.id].name} is not connected. Ignoring.`)
      return
    }
    logger.debug(`Sending ${req.params.command} to ${req.params.nodeAddress}`)
    command = {
      address: req.params.nodeAddress.slice(5),
      cmd: req.params.command,
      value: req.params.value || undefined,
      uom: req.params.uom || undefined,
      query: req.query || undefined
    }
    mqtt.makeResponse(req.params.id, 'command', command)
  }
}
