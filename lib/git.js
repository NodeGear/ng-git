var mongoose = require('mongoose')
	, util = require('util')
	, events = require('events')
	, config = require('./config')
	, bugsnag = require('bugsnag')
	, redis = require("redis")
	, client = redis.createClient(config.credentials.redis_port, config.credentials.redis_host)
	, models = require('ng-models').init(mongoose, config, {
		redis: client
	})
	, utils = require('./utils')

mongoose.connect(config.credentials.db, config.credentials.db_options);

if (config.credentials.redis_key.length > 0) {
	client.auth(config.credentials.redis_key)
}

bugsnag.register(config.credentials.bugsnag_key);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Mongodb Connection Error:'));
db.once('open', function callback () {
	console.log("Mongodb connection established")
});

var subscriber = redis.createClient(config.credentials.redis_port, config.credentials.redis_host);

if (config.credentials.redis_key.length > 0) {
	subscriber.auth(config.credentials.redis_key);
}

subscriber.subscribe('git');
subscriber.on('message', function (channel, message) {
	var msg = null;
	
	try {
		msg = JSON.parse(message);
	} catch (e) {
		console.log("Failed parsing", message, e);
		return bugsnag.notify(e);
	}

	config.metrics.increment('git.requests.'+msg.action);

	// Find the key
	models.RSAKey.findOne({
		deleted: false,
		_id: mongoose.Types.ObjectId(msg.key_id)
	}, function (err, key) {
		if (err) {
			return bugsnag.notify(err);
		}

		if (!key || key.installing == true) {
			return client.publish("git:install", msg.key_id+"|Already Installing")
		}

		key.installing = true;
		key.markModified('installing');

		key.save(function (err) {
			if (err) {
				bugsnag.notify(err);
			}
			
			switch (msg.action) {
				case 'createSystemKey':
					return utils.createSystemKey(key);
				case 'verifyKey':
					return utils.verifyKey(key);
			}
		});
	});
});