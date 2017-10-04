const JwtStrategy = require('passport-jwt').Strategy
const ExtractJwt = require('passport-jwt').ExtractJwt
const UserModel = require('../models/user')
const config = require('../config/config')

/**
 * The passport module to wrap all authenticated functions
 * that require the token to be accessed.
 * @module config/passport
 * @version 2.0
 */

 /**
  * Function to create the JWT Strategy for Passport.
  * @method
  * @param {module} passport - The Passport module is passed in to create a new JwtToken Strategy for authentication via header tokens.
  */
module.exports = function(passport){
	let opts = {}
	opts.jwtFromRequest = ExtractJwt.fromAuthHeaderWithScheme('jwt')
	opts.secretOrKey = process.env.SECRET
	passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
		UserModel.getUserById(jwt_payload.data._id, (err, user) => {
			if (err) {
				return done(err, false)
			}
			if (user) {
				return done(null, user)
			} else {
				return done(null, false)
			}
		})
	}))
}
