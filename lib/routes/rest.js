const express = require('express')
const router = express.Router()
const passport = require('passport')
const jwt = require('jsonwebtoken')

const logger = require('../modules/logger')
const config = require('../config/config')
const isy = require('../modules/isy')

/**
 * REST API Interface Module
 * @module routes/rest
 * @version 2.0
 */

// Incoming from ISY
router.param('id', (req, res, next, id) => {
  next()
})

/**
* Not Implemented yet
* @name install
* @route {GET} rest/id/install/profileNum
*/
router.get('/:id/install/:profileNum', (req, res, next) => {
  logger.debug(`REST: Received Install`)
  isy.restInstall(req, res)
  return res.json({success: true})
})

/**
* base/nodes/nodeAddress/query[?requestId=requestId]
* base/nodes/nodeAddress/status[?requestId=requestId]
* nodeAddress of 0 means query all nodes
* @name status
* @route {GET} rest/id/nodes/nodeAddress/command
*/
router.get('/:id/nodes/:nodeAddress/:command', (req, res, next) => {
  logger.debug(`REST: ${req.params.command} received from ISY`)
  isy.restStatus(req, res)
  return res.json({success: true})
})

/**
* base/add/nodes[?requestId=requestId]
* @name addnodes
* @route {GET} rest/id/add/nodes
*/
router.get('/:id/add/nodes', (req, res, next) => {
  logger.debug(`REST: Add Nodes`)
  return res.json({success: true})
})

//<base>/nodes/<nodeAddress>/report/remove
//<base>/nodes/<nodeAddress>/report/rename?name=<nodeName>
//<base>/nodes/<nodeAddress>/report/enable
//<base>/nodes/<nodeAddress>/report/disable
//<base>/nodes/<nodeAddress>/report/add/<nodeDefId>?primary=<nodeAddress>&name=<nodeName>
/**
* base/id//nodes/report/command/nodeDefId/[?requestId=requestId]
* @name report
* @route {GET} base/id//nodes/report/command/nodeDefId/[?requestId=requestId]
*/
router.get('/:id/nodes/:nodeAddress/report/:command/:nodeDefId?', (req, res, next) => {
  logger.debug(`REST: report`)
  isy.restReport(req, res)
  return res.json({success: true})
})

//<base>/nodes/<nodeAddress>/cmd/<command>
//<base>/nodes/<nodeAddress>/cmd/<command>/<value>
//<base>/nodes/<nodeAddress>/cmd/<command>/<value>/<uom>
//[?<p1>.<uom1>=<val1>&<p2>...][requestId=<requestId>]
/**
* rest/id/nodeAddress/cmd/command/value/uom
* @name command
* @route {GET} rest/id/nodeAddress/cmd/command/value/uom
*/
router.get('/:id/nodes/:nodeAddress/cmd/:command/:value?/:uom?', (req, res, next) => {
  logger.debug(`REST: ${req.params.command} Command received from ISY for ${req.params.nodeAddress}`)
  isy.restCommand(req, res)
  if (req.query.requestId) {
    let data = {
      requestId: req.query.requestId,
      success: true
    }
    isy.handleRequestP(req.params.id, data, 'request')
  }
  return res.json({success: true})
})

router.get('*', (req, res, next) => {
  logger.debug('REST: hit the catch all... should not happen.')
  logger.debug(req.params, req.query)
  return res.json({success: true})
})

module.exports = router
