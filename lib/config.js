try {
	var credentials = './credentials.json';
	var credentials = require(credentials)
} catch (e) {
	if (process.env.NODE_ENV == 'production') {
		console.log("\nNo credentials.json File!\n")
		process.exit(1);
	}

	credentials = {
		"redis_port": 6379,
		"redis_host": "redis",
		"redis_key": "",
		"bugsnag_key": "",
		"db": "mongodb://10.0.3.2:2017/nodegear"
	}

	credentials.db_options = {
		"auto_reconnect": true,
		"native_parser": true,
		"server": {
			"auto_reconnect": true
		}
	}
}

exports.credentials = credentials;

exports.metrics = new (require('lynx'))(credentials.statsd_ip, credentials.statsd_port);

exports.version = require('../package.json').version;
exports.production = process.env.NODE_ENV == "production";

exports.path = __dirname;