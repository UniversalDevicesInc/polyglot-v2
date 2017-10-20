const logger = require('../modules/logger')
const config = require('../config/config')
const os = require('os')
const fs = require('fs-extra')
const ns = require('../models/nodeserver')
const spawn = require('child_process').spawn

module.exports = {
  /*
   * Array of local NodeServer process objects. Corresponds to config.NodeServer[profileNum]
   * {in: process.stdin, out: process.stout, err: process.stderr, env: {}, args: {}}
   */
  nodeProcesses: new Array(11),

  spawnChild() {

  },

  runInstallProcess() {

  },

  runChildNodeServer() {

  },

}
