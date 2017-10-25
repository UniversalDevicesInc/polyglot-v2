const express = require('express')
const router = express.Router()
const passport = require('passport')
const jwt = require('jsonwebtoken')
const config = require('../config/config')
const logger = require('../modules/logger')
const fs = require('fs')
const url = require('url')
const os = require('os')

router.ws('/echo', (ws, req) => {
  ws.on('connction', (ws, req) => {
    //const location = url.parse(req.url, true)
    logger.debug('hi')
    //logger.debug('~~~~~~~~~~~' + JSON.stringify(ws.upgradeReq.session.passport.user))
  })
})

router.ws('/udi/polyglot/log', (ws, req) => {
  ws.on('connection', (ws1, req1) => {
    const logFile = os.homedir() + '/.polyglot/log/debug.log'
    const location = url.parse(req1.url, true)
    if (location.path === '/udi/polyglot/frontend/log') {
      logger.debug('WS: Bulk dump of polyglot log file to frontend.')
      //This works 1000 times faster to stream it than bulk read it first
      var rs = fs.createReadStream(logFile)
      rs.on('data', (chunk) => {
        ws.send(chunk.toString('utf8'))
      })
      rs.on('end', () => {
        Tail = require('tail').Tail
        tail = new Tail(logFile)
        tail.on('line', (data) => {
          if (ws.readyState === 1) {
            ws.send(data)
          } else {
            tail.unwatch()
            ws.terminate()
          }
        })
      })
    }
  })
  ws.on('message', (message) => {
  })
})

module.exports = router
