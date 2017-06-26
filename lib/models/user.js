const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
//const config = require('../config/config')
var logger = require('../modules/logger')

// User Schema
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
	getUserById (id, callback){
		UserModel.findById(id, callback)
	},

	getUserByUsername (username, callback){
		const query = {username: username}
		UserModel.findOne(query, callback)
	},

	addUser (newUser, callback){
		bcrypt.genSalt(10, (err, salt) => {
			bcrypt.hash(newUser.password, salt, (err, hash) => {
				if(err) throw err
				newUser.password = hash
				newUser.save(callback)
				logger.info(`User: Created new user ${newUser.username}`)
			})
		})
	},

	comparePassword (candidatePassword, hash, callback) {
		bcrypt.compare(candidatePassword, hash, (err, isMatch) => {
			if(err) throw err
			callback(null, isMatch)
		})
	}
}


UserModel = mongoose.model('User', UserSchema)

module.exports = UserModel
