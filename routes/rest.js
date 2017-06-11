const express = require('express')
const router = express.Router()
const passport = require('passport')
const jwt = require('jsonwebtoken')
const logger = require('../modules/logger')
const isy = require('../modules/isy')

// Incoming from ISY

router.param('id', (req, res, next, id) => {
  next()
})

// <base>/install/<profileNumber>
// Not Implemented yet
router.get('/:id/install/:profileNum', (req, res, next) => {
  logger.debug(`REST: Received Install`)
  isy.restInstall(req, res)
  return res.json({success: true})
})

// <base>/nodes/<nodeAddress>/query[?requestId=<requestId>]
// <base>/nodes/<nodeAddress>/status[?requestId=<requestId>]
router.get('/:id/nodes/:nodeAddress/:command', (req, res, next) => {
  logger.debug(`REST: Query/Status recieved from ISY`)
  isy.restStatus(req, res)
  return res.json({success: true})
})

//<base>/add/nodes[?requestId=<requestId>]
router.get('/:id/add/nodes', (req, res, next) => {
  logger.debug(`${this.logPrefix} Add Nodes`)
  return res.json({success: true})
})

//<base>/nodes/<nodeAddress>/report/remove
//<base>/nodes/<nodeAddress>/report/rename?name=<nodeName>
//<base>/nodes/<nodeAddress>/report/enable
//<base>/nodes/<nodeAddress>/report/disable
//<base>/nodes/<nodeAddress>/report/add/<nodeDefId>?primary=<nodeAddress>&name=<nodeName>
router.get('/:id/nodes/:nodeAddress/report/:command/:nodeDefId?', (req, res, next) => {
  logger.debug(`${this.logPrefix} report`)
  isy.restReportRemove(req, res)
  return res.json({success: true})
})

//<base>/nodes/<nodeAddress>/cmd/<command>
//<base>/nodes/<nodeAddress>/cmd/<command>/<value>
//<base>/nodes/<nodeAddress>/cmd/<command>/<value>/<uom>
//[?<p1>.<uom1>=<val1>&<p2>...][requestId=<requestId>]
router.get('/:id/nodes/:nodeAddress/cmd/:command/:value?/:uom?', (req, res, next) => {
  logger.debug(`${this.logPrefix} Command`)
  isy.restCommand(req, res)
  return res.json({success: true})
})

router.get('*', (req, res, next) => {
  logger.debug(req.params, req.query)
  return res.json({success: true})
})

module.exports = router
