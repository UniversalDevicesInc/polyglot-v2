/**
 * Config data pulled from the .env file
 * and some globally accessible internal variables
 * @module config/config
 * @version 2.0
 */
//const queue = require('queue')

module.exports = {
  /**
  * System internal reference variables. Do not touch.
  * @type {Object}
  */
  dotenv: {},
  dbConnected: false,
  mqttConnected: false,
  mqttServer: null,
  mqttClientDisconnectCallbacks: {},
  mqttClient: null,
  mqttClientId: 'polyglot',
  mqttConnectedClients: {},
  webServer: null,
  dbServer: null,
  shutdown: false,
  httpsAgent: null,
  httpAgent: null,
  polyDir: null,
  pidFile: null,
  /**
  * Array of NodeServerModel objects kept in resident memory as reflection of their database models.
  * This allows for direct calling of NodeServerModel objects via nodeServers[profileNum]. The Array index
  * correlates to the NodeServer profileNum for ease of use. e.g. LiFX nodeserver with the profileNum of 8
  * can be called via nodeServers[8].save() to save the NodeServer changes to the db for example.
  * @type {Array}
  */
  nodeServers: {},
  nodes: {},
  nodeProcesses: new Array(25),
  shortPolls: new Array(25),
  longPolls: new Array(25),
  aedes: null,
  deleting: new Array(25),
  /**
  * Settings Loaded from the ~/.polyglot/.env file using the dotenv NodeJS module. You SHOULD NEVER MODIFY THIS IN THE SOURCE. Just use the .env
  *   isyHost = '192.168.1.10'
  *   isyPort = '80'
  *   isyUsername = 'admin'
  *   isyPassword = 'password'
  *   isyHttps = true/false (Works as of 2.0.28)
  *   mqttHost = '192.168.1.12' (This CANNOT be 'localhost' or '127.0.0.1' as it is passed to the frontend for websocket connections. IT MUST BE THE HOST IP)
  *   mqttPort = '1883' (Default is 1883)
  * @type {Object}
  */
  settings: {},
  /**
  * SSL Key and Cert Data, read at startup from ~/.polylot/ssl/ using the files polyglot.crt and polyglot.key
  */
  clientTails: {},
  installedNSTypes: []
}
