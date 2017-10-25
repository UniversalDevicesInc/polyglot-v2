// Nodejs encryption with CTR
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';
const encoding = ',2YE6=#r(z5?Y4=a';

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
  var cipher = crypto.createCipher(algorithm, encoding)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

/**
 * decryptText
 * @param {string} text - Text to decrypt
 * @returns {string} Decrypted Text
 */

module.exports.decryptText = function(text) {
  var decipher = crypto.createDecipher(algorithm, encoding)
  var dec = decipher.update(text, 'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}
