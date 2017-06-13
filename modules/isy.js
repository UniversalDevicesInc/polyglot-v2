const logger = require('./logger')
const config = require('../config/config')
require('http').globalAgent.maxSockets = Infinity
const request = require('request')
const encrypt = require('./encryption')
const xmlparser = require('xml2json-light')
const querystring = require('querystring')
const mqtt = require('./mqtt')

module.exports = {

    addNodePrefix(profileNum, nid) {
      return `n${('00' + profileNum).slice(-3)}_${nid}`.slice(0, 20)
    },

    makeApiUrl(api, path_args = null) {
      url = `${process.env.ISY_HTTPS === 'true' ? 'https://' : 'http://'}${process.env.ISY_HOST}:${process.env.ISY_PORT}/rest/${api}/`
      if (path_args) {
        url += '?' + querystring.stringify(path_args)
      }
      //url = encodeURI(url)
      return url
    },

    makeNodeUrl(profileNum, path, path_args) {
      url = `${process.env.ISY_HTTPS === 'true' ? 'https://' : 'http://'}${process.env.ISY_HOST}:${process.env.ISY_PORT}/rest/ns/${profileNum}/${path.join('/')}`
      if (path_args) {
        url += '?' + querystring.stringify(path_args).trim()
      }
      //url = encodeURI(url)
      return url
    },

    getIsy(profileNum, url, seq, getText, callback){
      var options = {
        "url": url,
      }
      var hrstart = process.hrtime()
      request.get(options, (err, res, body) => {
        if (err) return callback(err)
        var text=''
        //var xmlOptions = {object: true}
        logger.debug(`ISY: ${res.statusCode} - ${url}`)
        if (getText) {
          console.log()
          text = xmlparser.xml2json(body)
        }
        result = {
          isyresponse: text,
          statusCode: res.statusCode,
          seq: seq,
          elapsed: process.hrtime(hrstart)[1]/1000000 + 'ms',
          profileNum: profileNum
        }
        return callback(null, result)
      }).auth(process.env.ISY_USERNAME, process.env.ISY_PASSWORD)
      // Find a way to encrypt the password easily for users.
      //.auth(process.env.ISY_USERNAME, encrypt.decryptText(process.env.ISY_PASSWORD))
    },

    handleRequest(profileNum, data, command, gettext = false, callback){
      var url = (this[command] || this['notfound']).call(this, profileNum, data, command)
      if (url){
        this.getIsy(profileNum, url, data.seq ? data.seq : false, gettext, (err, result)=> {
          if (err) logger.error(`ISY: ${err}`)
          if (callback) return callback(result)
        })
      } else {
        logger.error(`ISY: handleRequest - ${command} did not return a valid URL.`)
        if (callback) { return callback() }
      }
    },

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

    command(profileNum, data, cmd){
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
      } else { logger.error(`ISY: Error address, primary, node_def_id, or name not found in ${cmd} call.`) }
      return url
    },

    removenode(profileNum, data, cmd){
      var url=false
      if (data.address) {
        var address = this.addNodePrefix(profileNum, data.address)
        var path = ['nodes', address, 'remove']
        var url = this.makeNodeUrl(profileNum, path)
      } else { logger.error(`ISY: Error address not found in ${cmd} call.`) }
      return url
    },

    restcall(profileNum, data, cmd) {
      var url=false
      if (data.api) {
        url = this.makeApiUrl(data.api, data.args)
      } else { logger.error(`ISY: api not found in ${cmd} call.`) }
      return url
    },

    request(profileNum, data, cmd){
      var url=false
      if (data.requestId) {
        var path = ['report', 'request', data.requestId, data.success ? 'success' : 'fail']
        var url = this.makeNodeUrl(profileNum, path)
      } else { logger.error(`ISY: Error request_id or success not found in ${cmd} call.`) }
      return url
    },

    getVersion(callback) {
      var version = ''
      var data = {}
      data['api'] = 'config'
      var url = this.restcall(0, data, 'getVersion')
      this.getIsy(0, url, false, true, (err, result) => {
        try {
          config.isyVersion = result.isyresponse.configuration.app_version
          logger.info(`ISY: Got Version ${config.isyVersion}`)
        } catch (e) {
          logger.error(`ISY: Failed to get version. Error: ${e}`)
          if (callback) return callback(e)
        }
        if (callback) return callback()
      })
    },

    restInstall(req, res) {
      logger.debug('Got REST Install ', req.params, req.query)
    },

    restStatus(req, res) {
      let message = {
        address: req.params.nodeAddress === "0" ? all : req.params.nodeAddress
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

    restAddNodes(req, res) {
      console.log(req.params, req.query)
    },

    restReport(req, res) {
      console.log(req.params, req.query)
    },

    restCommand(req, res) {
      console.log(req.params, req.query)
    }
}
