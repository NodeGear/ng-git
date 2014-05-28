// Warning: Export NG_TEST to enable test mode.

try {
	var credentials = './credentials.json';
	if (process.env.NG_TEST) {
		credentials = './credentials-test.json';

		console.log("-- TEST MODE --")
	}

	var credentials = require(credentials)
} catch (e) {
	console.log("\nNo credentials.json File!\n")
	process.exit(1);
}

exports.credentials = credentials;

exports.version = require('../package.json').version;
exports.production = process.env.NODE_ENV == "production";

exports.path = __dirname;