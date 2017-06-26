module.exports = {
  dbConnected: false,
  mqttConnected: false,
  isyVersion: '',
  nodeServers: new Array(11),
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
