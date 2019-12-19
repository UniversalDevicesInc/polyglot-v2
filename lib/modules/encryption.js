// Nodejs encryption with CTR
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';
const key = 'b2df428b9929d3ace7c598bbf4e496b2'
const encoding = ',2YE6=#r(z5?Y4=a';
const inputEncoding = 'utf8'
const outputEncoding = 'hex'

/**
 * The encryption module to encrypt communications between NodeServers and Polyglot
 * this is tested,  however it is not enabled as of release 2.0
 * @module modules/encryption
 * @version 2.0
 */

/**
 * encryptText
 * @param {string} text - Text to encrypt
 * @returns {string} Encrypted Text
 */
module.exports.encryptText = function(text) {
  const iv = Buffer.from(crypto.randomBytes(16))
  var cipher = crypto.createCipheriv(algorithm, key, iv)
  var crypted = cipher.update(text, inputEncoding, outputEncoding)
  crypted += cipher.final(outputEncoding)
  return `${iv.toString(outputEncoding)}:${crypted.toString()}`
}

/**
 * decryptText
 * @param {string} text - Text to decrypt
 * @returns {string} Decrypted Text
 */

module.exports.decryptText = function(text) {
  const textParts = text.split(':')
  let decipher
  let dec
  if (textParts.length >= 2) {
    const iv = Buffer.from(textParts.shift(), outputEncoding)
    const encryptedText = Buffer.from(textParts.join(':'), outputEncoding)
    decipher = crypto.createDecipheriv(algorithm, key, iv)
    dec = decipher.update(encryptedText, outputEncoding, inputEncoding)
  } else {
    decipher = crypto.createDecipher(algorithm, encoding)
    dec = decipher.update(text, outputEncoding, inputEncoding)
  }
  dec += decipher.final(inputEncoding)
  return dec.toString()
}

module.exports.randomString = function(length) {
    let text = ''
    const possible = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz*&-%/!?*+=()'
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

module.exports.randomAlphaOnlyString = function(length) {
    let text = ''
    const possible = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz'
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}
