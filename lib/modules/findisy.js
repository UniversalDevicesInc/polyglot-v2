const logger = require('./logger')

wait = function (ms) { return new Promise(r => setTimeout(r, ms)) }

getBroadcast = function () {
  var ifaces = require('os').networkInterfaces()
  const ip = require('ip')
  var bCast = null
  Object.keys(ifaces).forEach((ifname) => {
    var alias = 0;
    ifaces[ifname].forEach(function (iface) {
      if (ip.address() == iface.address) {
        bCast = ip.subnet(iface.address, iface.netmask).broadcastAddress
      }
    })
  })
  return bCast
}

longToByteArray = function(/*long*/long) {
    // we want to represent the input as a 8-bytes array
    var byteArray = Buffer.alloc(4);
    byteArray[0] = ((long & 0xff000000)>>24)
    byteArray[1] = ((long & 0x00ff0000)>>16)
    byteArray[2] = ((long & 0x0000ff00)>>8)
    byteArray[3] = ((long & 0x000000ff))
    return byteArray;
}

getPacket = function() {
  var rec = Buffer.alloc(24)
  var i = 0
  dwIdKey.forEach((val, k) => {
    rec[i++] = dwIdKey[k]
  })
  rec[i++] = bNetBurnerPktType[0]
  rec[i++] = bAction[0]
  rec[i++] = bExtra1[0]
  rec[i++] = bExtra2[0]
  Random_Record_Num.forEach((val, k) => {
    rec[i++] = Random_Record_Num[k]
  })
  dwThisAddr.forEach((val, k) => {
    rec[i++] = dwThisAddr[k]
  })
  dwThisLen.forEach((val, k) => {
    rec[i++] = dwThisLen[k]
  })
  endLen.forEach((val, k) => {
    rec[i++] = endLen[k]
  })
  return(rec)
}

var isyVal = '4e455442'
var dwIdKey = longToByteArray(0x4255524e)
var bNetBurnerPktType = Buffer.alloc(1, 'R')
var bAction = Buffer.alloc(1)
var bExtra1 = Buffer.alloc(1)
var bExtra2 = Buffer.alloc(1)
var Random_Record_Num = longToByteArray(Math.floor(Math.random() * 9000000000))
var dwThisAddr = longToByteArray(Math.floor(Math.random() * 9000000000))
var dwThisLen = Buffer.alloc(4)
var endLen = Buffer.alloc(4)
var bData = Buffer.alloc(4)
var extra = ''
var PORT = 20034
var isyFound = false
var isyPort = '80'
var isyAddress = '192.168.1.10'

module.exports = {
  async find() {
    var message = getPacket()
    var client = require('dgram').createSocket('udp4')
    var _Socket = false
    client.on('listening', () => {
        client.setBroadcast(true)
        _Socket = true
    })

    client.on('message', function (message, rinfo) {
        if (message.readIntBE(0, 4).toString(16) == isyVal) {
          var i = 152
          while (i <= message.length) {
            let char = message.slice(i, i + 1)
            extra += char.toString('utf8')
            i++
          }
          var index = extra.indexOf('//')
          if (index > -1) {
            let address = extra.slice(index + 2, extra.indexOf('/desc'))
            var portIndex = address.indexOf(':')
            if (portIndex > -1) {
              isyAddress = address.slice(0, portIndex)
              isyPort = address.slice(portIndex + 1)
            } else {
              isyAddress = address
            }
          }
          isyFound = true
          client.close()
        }
    })

    var p = new Promise(function (resolve, reject) {
      client.on('close', function () {
        _Socket = false
        resolve([isyFound, isyAddress, isyPort])
      })
    })


    client.send(message, 0, message.length, PORT, getBroadcast())
    // Wait 1000ms for ISY response.
    wait(1000).then(() => {
      if (_Socket) {
        client.close()
      }
    })
    return p
  }
}
