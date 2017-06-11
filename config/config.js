module.exports = {
  dbConnected: false,
  mqttConnected: false,
  settings: null,
  nodeServers: new Array(11),
  frontends: [],
  isyversion: '',
  database: 'mongodb://db:27017/polyglot',
  secret: 'udi-polyglot',
  polyglotIP: require('os').networkInterfaces().eth0[0].address,
  polyglotPort: null,
}
