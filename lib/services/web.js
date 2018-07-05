const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cors = require('cors')
//const fs = require('fs')
//const os = require('os')
const http = require('http')
const https = require('https')
//const url = require('url')
const passport = require('passport')
const compression = require('compression')
var ws = require('websocket-stream')

const logger = require('../modules/logger')
const config = require('../config/config')
const encrypt = require('../modules/encryption')

/**
 * REST Web Interface Module
 * @module modules/web
 * @version 2.0
 */

module.exports = {
  /**
	 * Express Start Web API Service and add routes.
	 * @method
	 */
  async start() {
    if (!config.webServer) {
      const app = express()
      const frontend = require('../routes/frontend')
      const rest = require('../routes/rest')
      // Port Number
      const port = config.settings.listenPort || 3000
      const ipAddress = config.settings.bindIPAddress
      // Compression to gzip
      app.use(compression())
      // CORS Middleware
      app.use(cors())
      app.options('*', cors())
      //app.use(logger.debug)
      // Set Static Folder
      const staticFolder = path.join(__dirname, '../../public/')
      app.use(express.static(staticFolder))
      // Body Parser Middleware
      app.use(bodyParser.json())
      // Passport Middleware
      app.use(passport.initialize())
      app.use(passport.session())
      require('../config/passport')(passport)
      // /Users Routes
      app.use('/frontend/', frontend)
      app.use('/ns/', rest)
      // Error Handling
      app.use(function(err, req, res, next) {
        res.status(err.status || 500)
        res.json({'error': {
          message: err.message,
          error: err
        }})
      })
      // Index Route
      app.get('*', (req, res) => {
        res.sendFile(staticFolder + 'index.html')
      })

      try {
        if (config.settings.useHttps) {
          // Get SSL Keys from settings
          var ssl_options = {}
          if (config.settings.customSSL) {
            ssl_options = {
              key: encrypt.decryptText(config.settings.customSSLData.key),
              cert: config.settings.customSSLData.cert,
              ca: config.settings.customSSLData.ca,
              rejectUnauthorized: true,
              requestCert: false
            }
          } else {
            ssl_options = {
              key: config.settings.sslData['private'],
              cert: config.settings.sslData['cert'],
              rejectUnauthorized: false,
              requestCert: false
            }
          }

          // ForceSSL on every page.
          //app.use(forceSSL)
          config.webServer = https.createServer(ssl_options, app)
          //config.webServer = http.createServer(app)
        } else {
          config.webServer = http.createServer(app)
        }
        ws.createServer({ server: config.webServer }, config.aedes.handle)

        //config.mqttServer.attachHttpServer(config.webServer)

        // Start Server
        config.webServer.listen(port, ipAddress, () => {
          logger.info(`${config.settings.useHttps ? 'HTTPS' : 'HTTP'} Interface Service: Started - Address: ${ipAddress} Port: ${config.webServer.address().port}`)
          config.settings.listenPort = config.webServer.address().port
          config.settings.save()
        })
          .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              logger.info('HTTP Server: Port ' + port + ' in use. Finding open port.')
              config.webServer.listen()
              config.settings.listenPort = config.webServer.address().port
            }
          })
      } catch (e) {
        logger.debug(`Web Error: ${e}`)
      }
    }
  },

  /**
	 * Express Stop Web API Service and add routes. This is run on shutdown.
	 * @method
   * @param {function} callback - Callback when complete.
	 */
  async stop() {
    logger.info('HTTP Interface Service: Stopping')
    if (config.webServer) {
      await config.webServer.close()
      config.webServer = null
    }
  }
}
