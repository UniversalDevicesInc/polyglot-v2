const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

var logger = require('../modules/logger')

/**
 * User Model and Class.
 * @module models/user
 * @version 2.0
 */

/**
* MongoDB - UserSchema for creating a new User Database Object
* @class UserModel
* @param {string} username - Username of new User
* @param {string} password - Password of new User
*/
const UserSchema = mongoose.Schema({
  username: {
    type: String,
    default: 'admin',
    required: true
  },
  password: {
    type: String,
    default: '$2a$04$YITtr92Y0l4zYe2mVE4Jvey8Ao/9dK.vPu7Ww5yQVWd6bxXoFKVyC', // 'admin'
    required: true
  }
}, { usePushEach: true })

UserSchema.statics = {
  /**
  * Adduser salts and hashes the password using bcrypt before saving it to the database.
  * <TODO> This has become problematic on older machines such as the Raspberry Pi 1.
  * It is extremely slow to do the comparison. Gotta find a better way. Maybe less salts.
  * Update: Changed to 2 salts, seems to be better now.
  * @method
  * @alias UserModel.addUser
  * @memberof module:models/user
  * @param {Object} newUser - new instance of UserModel
  * @param {saveCallback} callback - Callback Passed into the Mongoose find method.
  */
  addUser (newUser, callback){
    bcrypt.genSalt(2, (err, salt) => {
      bcrypt.hash(newUser.password, salt, (err, hash) => {
        if(err) throw err
        newUser.password = hash
        newUser.save(callback)
        logger.info(`User: Created new user ${newUser.username}`)
      })
    })
  },

  async verifyDefaultUser () {
    let user = await this.findOne({}, null, null)
    if (!user) {
      const newUser = new this()
      await newUser.save()
      logger.info('Users: No users found in database. Added default user.')
    }
  }
}

UserSchema.methods = {
  /**
  * Compare salts and hashes with the password using bcrypt.
  * <TODO> This has become problematic on older machines such as the Raspberry Pi 1.
  * It is extremely slow to do the comparison. Gotta find a better way. Maybe less salts.
  * @method
  * @alias UserModel.addUser
  * @memberof module:models/user
  * @param {string} password - Password attempting to authenticate with.
  * @param {compareCallback} callback - Callback Passed into the Mongoose find method.
  */
  comparePassword (candidatePassword, hash, callback) {
    bcrypt.compare(candidatePassword, hash, (err, isMatch) => {
      if(err) throw err
      callback(null, isMatch)
    })
  }
}

mongoose.model('User', UserSchema)
