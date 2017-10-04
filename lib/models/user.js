const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
//const config = require('../config/config')
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
		required: true
	},
	password: {
		type: String,
		required: true
	}
})

UserSchema.statics = {
	/**
	* MongoDB gets user from database by ID.
	* @method
	* @alias UserModel.sendUpdate
	* @memberof module:models/user
	* @param {string} id - ID to search for.
	* @param {findCallback} callback - Callback Passed into the Mongoose find method.
	*/
	getUserById (id, callback){
		UserModel.findById(id, callback)
	},

	/**
	* MongoDB gets user from database by Username.
	* @method
	* @alias UserModel.getUserByUsername
	* @memberof module:models/user
	* @param {string} username - Username to search for.
	* @param {findCallback} callback - Callback Passed into the Mongoose find method.
	*/
	getUserByUsername (username, callback){
		const query = {username: username}
		UserModel.findOne(query, callback)
	},

	/**
	* Adduser salts and hashes the password using bcrypt before saving it to the database.
	* <TODO> This has become problematic on older machines such as the Raspberry Pi 1.
	* It is extremely slow to do the comparison. Gotta find a better way. Maybe less salts.
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


UserModel = mongoose.model('User', UserSchema)

module.exports = UserModel

/**
@callback findCallback
@param {string} error - An Error if encountered
@param {Object} document - Document returned by Mongoose FindOne
*/

/**
@callback saveCallback
@param {string} error - An Error if encountered
@param {Object} document - Document returned if sucessfully saved by Mongoose save method
*/

/**
@callback compareCallback
@param {string} error - An Error if encountered
@param {boolean} isMatch - True/False is password hashed successfully with bcrypt.
*/
