const request = require('request')
const progress = require('request-progress')
const os = require('os')
const fs = require('fs-extra')
const childProcess = require('child_process')
const decompress = require('decompress')
const decompressTargz = require('decompress-targz')

const logger = require('./logger')
const config = require('../config/config')
const mqttc = require('./mqtt')
const helpers = require('./helpers')

/**
 * Upgrade Polyglot Module
 * @module modules/upgrade
 * @version 2.0
 */

filePath = function () {
  return config.settings.useBeta ? 'https://s3.amazonaws.com/polyglotv2/binaries/beta/' : 'https://s3.amazonaws.com/polyglotv2/binaries/'
}

function spawn(name, command, args, opts) {
  let p = new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, opts)
    child.on('error', (data) => { logger.error(`Upgrade.spawn: ${data}`) })
    child.stdout.on('data', (data) => { logger.debug(`Upgrade: ${name} ${command}: ${data}` )})
    child.stderr.on('data', (data) => { logger.debug(`Upgrade: ${name} ${command}: ${data}`) })
    child.on('close', (code) => {
      if (code !== 0) reject('Upgrade Non-zero exit code: ' + code)
      logger.debug(`Upgrade: ${name} ${command} exited with cause code: ${code}`)
      resolve()
    })
  })
  return p
}

var _inProgress = false
//var _filePath = filepath
var _fileName = {
  x86_64: 'polyglot-v2-linux-x64.tar.gz',
  armv6l: 'polyglot-v2-linux-armv6.tar.gz',
  armv7l: 'polyglot-v2-linux-armv7.tar.gz',
  darwin: 'polyglot-v2-osx-x64.tar.gz'
}
var _upgradeTopic = 'udi/polyglot/frontend/upgrade'
var _stopUpgrade = false

function startUpgrade() {
 if (_inProgress) {
   logger.error('Upgrade: Frontend requested upgrade, however one is already in progress. Disallowing.')
   let response = {node: 'polyglot', start: { success: false, msg: 'Upgrade already in progress.'}}
   mqttc.publish(_upgradeTopic, response)
 } else {
   if (__dirname.split('/')[1] === 'snapshot') {
     _inProgress = true
     logger.info('Upgrade: Frontend requested upgrade. Proceeding.')
     let response = {node: 'polyglot', start: { success: true, msg: 'Upgrade starting.'}}
     mqttc.publish(_upgradeTopic, response)
     getSystem()
     upgradeInterfaces()
   } else {
     let msg = 'You aren\'t running the binary Use git pull instead.'
     logger.info(`Upgrade: Frontend requested upgrade. ${msg}`)
     let response = {node: 'polyglot', start: { success: false, msg: msg}}
     mqttc.publish(_upgradeTopic, response)
   }
 }
}

function stopUpgrade() {
 let msg = ''
 let response = ''
 if (_inProgress) {
   _stopUpgrade = true
   msg = 'Attempting to stop upgrade by request.'
   response = {node: 'polyglot', stop: { success: true, msg: msg}}
 } else {
   msg = 'Can not stop upgrade. No upgrade in progress.'
   response = {node: 'polyglot', stop: { success: false, msg: msg}}
 }
 logger.info(`Upgrade: ${msg}`)
 mqttc.publish(_upgradeTopic, response)
}

async function upgradeInterfaces() {
  let runCmd = `wget -qO - https://raw.githubusercontent.com/UniversalDevicesInc/polyglot-v2/master/scripts/upgrade_interfaces.sh | bash -e`
  let opts = {
    cwd: os.homedir(),
    shell: '/bin/sh'
  }
  try {
    await spawn('Interfaces', runCmd, [], opts)
  } catch (err) {
    logger.error(`upgradeInterfaces: ${err.stack}`)
  }
}

function getSystem() {
 let platform = os.platform()
 let arch = null
 if (platform === 'darwin') {
   return download('darwin')
 } else if (platform === 'linux') {
   let value = childProcess.execSync('/usr/bin/env arch').toString()
   value = value.slice(0, value.length -1)
   return download(value)
 } else {
   let msg = `Platform not recognized - ${platform}`
   let response = {node: 'polyglot', start: { success: false, msg: msg}}
   logger.error(`Upgrade: ${msg}`)
   mqttc.publish(_upgradeTopic, response)
   _inProgress = false
 }
}

function download(arch) {
 if (arch) {
   if (_fileName.hasOwnProperty(arch)) {
     try {
       if (fs.existsSync(_fileName[arch])) fs.removeSync(_fileName[arch])
       progress(request(filePath() + _fileName[arch]), {
         throttle: 500,
         //delay: 500
       })
       .on('progress', (state) => {
         mqttc.publish(_upgradeTopic, {node: 'polyglot', progress: state})
         logger.debug(`Upgrade Progress: ${JSON.stringify(state)}`)
       })
       .on('error', (err) => {
         let msg = `Error: ${arch}`
         logger.error(`Upgrade: ${msg}`)
         let response = {node: 'polyglot', error: { msg: msg }}
         mqttc.publish(_upgradeTopic, response)
         _inProgress = false
         _stopUpgrade = false
       })
       .on('end', () => {
         _inProgress = false
         if (!_stopUpgrade) {
           logger.info(`Upgrade: Download complete. Starting Install..`)
           if (fs.existsSync(_fileName[arch])) extract(_fileName[arch])
         } else {
           _stopUpgrade = false
           logger.info('Stopped upgrade on users request.')
           if (fs.existsSync(_fileName[arch])) fs.removeSync(_fileName[arch])
         }
       })
       .pipe(fs.createWriteStream('./' + _fileName[arch]))
     } catch (err) {
       let msg = `Upgrade: ${err.message}`
       logger.error(msg)
       let response = {node: 'polyglot', error: { msg: msg }}
       mqttc.publish(_upgradeTopic, response)
     }
   } else {
     let msg = `No file for system type: ${arch}`
     logger.error(`Upgrade ${msg}`)
     let response = {node: 'polyglot', error: { msg: msg }}
     mqttc.publish(_upgradeTopic, response)
   }
 } else {
   logger.error(`Upgrade: Failed to get system type.`)
 }
}

function extract(file) {
 let base = file.split('.')[0]
 try {
   if (fs.existsSync(base + '.old')) fs.removeSync(base + '.old')
   if (fs.existsSync(base)) fs.moveSync(base, base + '.old')
 } catch (err) {
   logger.error(`Upgrade: Move error - ${err.message}`)
 }
 try {
   decompress(file, '.', {
     plugins: [
       decompressTargz()
     ]
   }).then(() => {
     fs.removeSync(file)
     logger.info(`Upgrade: ${file} extracted.`)
     let msg = 'Upgrade Complete. Shutting Down in 5 seconds. SystemCTL or LaunchD should restart Polyglot automatically. If not, restart it manually. Logging you out. Wait for this message to disappear before attempting to log back in.'
     logger.info(msg)
     let response = {node: 'polyglot', complete: { msg: msg }}
     mqttc.publish(_upgradeTopic, response)
     setTimeout(() => {
       process.kill(process.pid, "SIGINT")
     }, 5000)
   })
 } catch (err) {
   let msg = `Upgrade: Extract error - ${err.message}`
   logger.error(msg)
   throw new Error(msg)
 }
}

module.exports = {

  upgrade(message) {
   if (message.hasOwnProperty('start')) {
     startUpgrade()
   } else if (message.hasOwnProperty('stop')) {
     stopUpgrade()
   }
 },
  upgradeInterfaces: upgradeInterfaces
}
