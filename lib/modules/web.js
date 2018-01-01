const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cors = require('cors')
const fs = require('fs')
const os = require('os')
const http = require('http')
const https = require('https')
//const WebSocket = require('ws')
const url = require('url')
const config = require('../config/config')
const passport = require('passport')
const compression = require('compression')
const logger = require('./logger')
const helpers = require('./helpers')
const encrypt = require('./encryption')
const mqtts = require('./mqtts')

/**
 * REST Web Interface Module
 * @module modules/web
 * @version 2.0
 */

module.exports = {
  Server: null,
  wsServer: null,
  logWS: [],

  /**
	 * Express Start Web API Service and add routes.
	 * @method
	 */
  startService() {
    if (!this.Server) {
      const app = express()
      const frontend = require('../routes/frontend')
      const rest = require('../routes/rest')
      // Port Number
      const port = config.settings.listenPort || 3000
      // Compression to gzip
      app.use(compression())
      // CORS Middleware
      app.use(cors())
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
          this.Server = https.createServer(ssl_options, app)
          //this.Server = http.createServer(app)
        } else {
          this.Server = http.createServer(app)
        }

        mqtts.Server.attachHttpServer(this.Server)

        // Start Server
        this.Server.listen(port, () => {
          logger.info('HTTP Interface Service: Started - Port: ' + this.Server.address().port)
          config.settings.listenPort = this.Server.address().port
          config.settings.save()
        })
          .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              logger.info('HTTP Server: Port ' + port + ' in use. Finding open port.')
              this.Server.listen()
              config.settings.listenPort = this.Server.address().port
            }
          })
      } catch (e) {
        logger.debug(e)
      }

    }
  },

  /**
	 * Express Stop Web API Service and add routes. This is run on shutdown.
	 * @method
   * @param {function} callback - Callback when complete.
	 */
  stopService(callback) {
    logger.info('HTTP Interface Service: Stopping')
    if (this.Server) {
      if (this.wsServer) {
        this.wsServer.close()
      }
      this.Server.close(() => {
        this.Server = null
        if(callback) { return callback() }
      })
    } else {
      if(callback) { return callback() }
    }
  }
}
