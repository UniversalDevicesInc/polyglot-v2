const logger = require('../modules/logger')
const config = require('../config/config')
const db = require('../modules/db')
const mqttc = require('../modules/mqttc')
const mqtts = require('../modules/mqtts')
const web = require('../modules/web')
const child = require('../modules/children')

async function saveNodeServers() {
  await Promise.all(config.nodeServers.map((ns) => {
    if (ns.type !== 'unmanaged') {
      logger.debug(`Saving NodeServer ${ns.name} to database.`)
      ns.save()
    }
  }))
}

async function killChildren() {
  for (let i = 0; i < config.nodeServers.length; i++) {
    if (config.nodeServers[i]) {
      if (config.nodeServers[i].type === 'local') {
        await config.nodeServers[i].stop()
      }
    }
  }
  logger.debug(`All NodeServers stopped.`)
}

module.exports = {
  async now() {
    await killChildren()
    await saveNodeServers()
    await mqttc.stopService()
    await mqtts.stopService()
    await db.stopService()
    process.exit(0)
  },
}
