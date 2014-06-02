var mongoose = require('mongoose')
	, util = require('util')
	, events = require('events')
	, config = require('./config')
	, bugsnag = require('bugsnag')
	, redis = require("redis")
	, client = redis.createClient()
	, models = require('ng-models').init(mongoose, config, {
		redis: client
	})
	, redis_listener = require('./redis')

mongoose.connect(config.credentials.db, config.credentials.db_options);

if (config.production) {
	client.auth(config.credentials.redis_key)
}

var opts = {};
if (process.env.NG_TEST) {
	opts.autoNotifyUncaught = false;
	opts.onUncaughtError = function (err) {}
}

bugsnag.register(config.credentials.bugsnag_key, opts);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});
