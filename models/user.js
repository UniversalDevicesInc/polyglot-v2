const mongoose = require('mongoose');
//const bcrypt = require('bcryptjs');
//const config = require('../config/config');
//var logger = require('../modules/logger');

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
});

module.exports = mongoose.model('User', UserSchema);
