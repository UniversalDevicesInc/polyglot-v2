const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cors = require('cors')
//const forceSSL = require('express-force-ssl')
const fs = require('fs')
const http = require('http')
const https = require('https')
const config = require('../config/config')
const passport = require('passport')
const compression = require('compression')
const logger = require('./logger')
const helpers = require('./helpers')


/**
 * REST Web Interface Module
 * @module modules/web
 * @version 2.0
 */

module.exports = {
  Server: null,

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
      const port = process.env.HOST_PORT
      // Compression to gzip
      app.use(compression())
      // CORS Middleware
      app.use(cors())
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

      // Import SSL keys
      /*
      const ssl_options = {
        key: fs.readFileSync('./ssl/polyglot.key'),
        cert: fs.readFileSync('./ssl/polyglot.crt')
      }
      */

      // ForceSSL on every page.
      // app.use(forceSSL)

      // Create Server Object
      //const secureServer = https.createServer(ssl_options, app)
      this.Server = http.createServer(app)
      //const io = socketio(this.Server, {namespace: 'frontend'})
      //require('../sockets/frontend')(io)
      //require('../sockets/nodeserver').startService(io)

      // Start Server
      this.Server.listen(port, '0.0.0.0', () => {
        logger.info('Secure Server started on port ' + port)
      })

    }
  },

  /**
	 * Express Stop Web API Service and add routes. This is run on shutdown.
	 * @method
   * @param {function} callback - Callback when complete.
	 */
  stopService(callback) {
    logger.info('Stopping Web Service.')
    if (this.Server) {
      this.Server.close(() => {
        this.Server = null
        if(callback) { return callback() }
      })
    } else {
      if(callback) { return callback() }
    }
  }
}
