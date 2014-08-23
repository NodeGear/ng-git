var redis = require('redis')
	, config = require('./config')
	, bugsnag = require('bugsnag')
	, async = require('async')
	, spawn = require('child_process').spawn
	, fs = require('fs')
	, models = require('ng-models')
	, mongoose = require('mongoose');

var client = redis.createClient(config.credentials.redis_port, config.credentials.redis_host);
if (config.production) {
	client.auth(config.credentials.redis_key);
}

exports.createSystemKey = function (key) {
	var key_file = '/tmp/ng_key_'+key._id+'-'+(new Date(key.created).getTime());

	var create = spawn('ssh-keygen', ['-t', 'rsa', '-C', 'nodegear', '-q', '-f', key_file, '-N', '']);
	create.on('close', function(code) {
		if (code != 0) {
			saveKey(key, false);

			bugsnag.notify(new Error("ssh-keygen ended with non-0 return code: "+code));
			client.publish('git:install', key_id+'|Creation Failed')
			return;
		}

		// Read the files and delete them
		async.parallel([
			function(done) {
				fs.readFile(key_file, {
					encoding: 'utf8'
				}, function(err, data) {
					if (err) {
						return done(err);
					}

					key.private_key = data;
					fs.unlink(key_file, done);
				});
			},
			function(done) {
				fs.readFile(key_file+'.pub', {
					encoding: 'utf8'
				}, function(err, data) {
					if (err) {
						return done(err);
					}

					key.public_key = data;
					fs.unlink(key_file+'.pub', done);
				});
			}
		], function(err) {
			if (err) {
				saveKey(key, false);

				client.publish('git:install', key._id+'|Installation Error')
				return bugsnag.notify(err);
			}

			saveKey(key, true, function () {
				client.publish('git:install', key._id+'|Installation Finished')
			});
		});
	})
}

exports.verifyKey = function (key) {
	var tmp_name = '/tmp/ng_pub_validity_'+Date.now()+'.pub';
	fs.writeFile(tmp_name, key.public_key, function(err) {
		if (err) {
			saveKey(key, false);

			bugsnag.notify(err);
			client.publish('git:install', key._id+'|Verification Failed');

			return;
		}

		var valid = spawn("ssh-keygen", ['-lf', tmp_name]);
		valid.on('close', function(code) {
			fs.unlink(tmp_name, function(err) {
				if (err) bugsnag.notify(err);
			});

			valid = code === 0;

			if (!valid) {
				saveKey(key, false);

				client.publish('git:install', key._id+'|Verification Failed')
				return;
			}

			saveKey(key, true, function () {
				client.publish('git:install', key._id+'|Installation Finished')
			});
		});
	});
}

function saveKey (key, success, cb) {
	key.installing = false;
	key.installed = success == true;
	key.markModified('installed');
	key.markModified('installing');

	key.save(function (err) {
		if (err) {
			bugsnag.notify(err);
			return;
		}

		if (typeof cb != 'undefined') {
			cb();
		}
	})
}