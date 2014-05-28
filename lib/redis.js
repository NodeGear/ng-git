var redis = require('redis')
	, config = require('./config')
	, bugsnag = require('bugsnag')
	, async = require('async')
	, spawn = require('child_process').spawn
	, fs = require('fs')
	, models = require('ng-models')
	, worker = require('./worker')
	, stringDecoder = new (require('string_decoder').StringDecoder)('utf-8');

var subscriber = redis.createClient();
var client = redis.createClient();

if (config.production) {
	subscriber.auth(config.credentials.redis_key);
	client.auth(config.credentials.redis_key);
}

subscriber.subscribe('git');

subscriber.on("message", function (channel, message) {
	var msg = null;
	
	try {
		msg = JSON.parse(message);
	} catch (e) {
		console.log("Failed parsing", message, e);
		bugsnag.notifyException(e);
	}
	
	console.log(msg);
	
	switch(msg.action) {
		case 'createRSAKey':
			return createKey(msg);
		case 'installRSAKey':
			return installKey(msg);
		case 'deleteRSAKey':
			return deleteKey(msg);
	}
});

function deleteKey (msg) {
	var key_id = msg.key_id;

	models.RSAKey.findOne({
		_id: key_id,
		deleted: false
	}, function(err, key) {
		if (err) throw err;

		if (!key) {
			console.log("Null key. WTF!?");
			return;
		}

		key.deleted = true;
		key.save();

		worker.queue.push({
			key: key,
			type: 'delete'
		}, function(err) {
			console.log("is done deleting :)");
		});
	})
}

function createKey (msg) {
	var key_id = msg.key_id;

	models.RSAKey.findOne({
		_id: key_id,
		deleted: false
	}, function(err, key) {
		if (err) throw err;

		console.log(key);

		if (!key) {
			console.log("Null key. WTF!?");
			return;
		}
		
		var key_file = '/tmp/ng_key_'+key_id+''+(new Date(key.created).getTime());

		var create = spawn('ssh-keygen', ['-t', 'rsa', '-C', 'nodegear', '-q', '-f', key_file, '-N', '']);
		create.on('close', function(code) {
			if (code != 0) {
				console.log("Failed ssh keygen", code);
				client.publish('git:install', key_id+'|Creation Failed')
				return;
			}

			// Read the files and delete them
			async.parallel([
				function(done) {
					fs.readFile(key_file, {
						encoding: 'utf8'
					}, function(err, data) {
						if (err) throw err;

						key.private_key = data;

						done(null);
					});
				},
				function(done) {
					fs.readFile(key_file+'.pub', {
						encoding: 'utf8'
					}, function(err, data) {
						if (err) throw err;

						key.public_key = data;

						done(null);
					});
				}
			], function() {
				key.installing = false;
				key.installed = true;
				key.markModified('installed');
				key.markModified('installing');

				key.save(function(err) {
					if (err) throw err;

					worker.queue.push({
						key: key,
						type: 'update'
					}, function(err) {
						console.log("is done creating key :)");
						client.publish('git:install', key_id+'|Installation Finished')
					});
				});
			});
		})
	});
}

function installKey (msg) {
	var key_id = msg.key_id;

	models.RSAKey.findOne({
		_id: key_id,
		deleted: false
	}, function(err, key) {
		if (err) throw err;
		
		if (!key) {
			console.log("Null key. WTF!?");
			return;
		}

		if (key.installing) {
			console.log("Key", key_id, "Already installing!")
			return;
		}

		key.installing = true;
		key.installed = false;
		key.save();

		validateKey(key.public_key, function(valid) {
			if (!valid) {
				key.installing = false;
				key.installed = false;
				key.save();

				console.log("Invalid!")

				client.publish('git:install', key_id+'|Verification Failed')
				return;
			}

			key.installed = true;
			key.installing = false;
			key.markModified('installed');
			key.markModified('installing');

			key.save(function(err) {
				// Add to the queue
				worker.queue.push({
					key: key,
					type: 'create'
				}, function(err) {
					client.publish('git:install', key_id+'|Installation Finished')
				});
			});
		});
	})
}

function validateKey (pub_key, cb) {
	var tmp_name = '/tmp/ng_pub_validity_'+Date.now()+'.pub';
	fs.writeFile(tmp_name, pub_key, function(err) {
		if (err) throw err;

		var valid = spawn("ssh-keygen", ['-lf', tmp_name]);
		valid.on('close', function(code) {
			fs.unlink(tmp_name, function(err) {
				if (err) throw err;
			});

			cb(code === 0);
		});
	});
}