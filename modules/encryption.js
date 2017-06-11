// Nodejs encryption with CTR
const crypto = require('crypto');
const algorithm = 'aes-256-ctr';
const encoding = ',2YE6=#r(z5?Y4=a';

module.exports.encryptText = function(text) {
  var cipher = crypto.createCipher(algorithm, encoding)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

module.exports.decryptText = function(text) {
  var decipher = crypto.createDecipher(algorithm, encoding)
  var dec = decipher.update(text, 'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}
