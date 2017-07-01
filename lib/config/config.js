/**
 * Config data pulled from the .env file
 * and some globally accessible internal variables
 * @module config/config
 * @version 2.0
 */
module.exports = {
  /**
  * MongoDB is connected True/False
  * @type {boolean}
  */
  dbConnected: false,
  /**
  * MQTT is connected True/False
  * @type {boolean}
  */
  mqttConnected: false,
  /**
  * ISY Version returned from successful test of ISY credentials
  * @type {string}
  */
  isyVersion: '',
  /**
  * Array of NodeServerModel objects kept in resident memory as reflection of their database models.
  * This allows for direct calling of NodeServerModel objects via nodeServers[profileNum]. The Array index
  * correlates to the NodeServer profileNum for ease of use. e.g. LiFX nodeserver with the profileNum of 8
  * can be called via nodeServers[8].save() to save the NodeServer changes to the db for example.
  * @type {Array}
  */
  nodeServers: new Array(11),
  /**
  * Settings Loaded from the ~/.polyglot/.env file using the dotenv NodeJS module. You SHOULD NEVER MODIFY THIS IN THE SOURCE. Just use the .env
  *   isyHost = '192.168.1.10'
  *   isyPort = '80'
  *   isyUsername = 'admin'
  *   isyPassword = 'password'
  *   isyHttps = true/false (This isn't tested yet)
  *   mqttHost = '192.168.1.12' (This CANNOT be 'localhost' or '127.0.0.1' as it is passed to the frontend for websocket connections. IT MUST BE THE HOST IP)
  *   mqttPort = '1883' (Default is 1883)
  *   mqttWSPort = '8083' (Default is 8083)
  * @type {Object}
  */
  settings: {
    isyHost: process.env.ISY_HOST,
    isyPort: process.env.ISY_PORT,
    isyUsername: process.env.ISY_USERNAME,
    isyPassword: process.env.ISY_PASSWORD,
    isyHttps: process.env.ISY_HTTPS,
    mqttHost: process.env.MQTT_HOST,
    mqttPort: process.env.MQTT_PORT,
    mqttWSPort: process.env.MQTT_WSPORT
  }
}
