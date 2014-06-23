var redis = require('redis')
	, config = require('./config')
	, bugsnag = require('bugsnag')
	, async = require('async')
	, spawn = require('child_process').spawn
	, fs = require('fs')
	, models = require('ng-models')
	, worker = require('./worker')
	, stringDecoder = new (require('string_decoder').StringDecoder)('utf-8')
	, mongoose = require('mongoose');

var subscriber = redis.createClient(config.credentials.redis_port, config.credentials.redis_host);
var client = redis.createClient(config.credentials.redis_port, config.credentials.redis_host);

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
		case 'git_hook':
			return git_hook(msg);
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
						type: 'create'
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

function send_git_response (data, message, terminate) {
	if (typeof terminate === 'undefined') terminate = false;

	client.publish(data.channel, JSON.stringify({
		message: message,
		exit: terminate == true
	}))
}

function git_hook (msg) {
	// {
	// 	channel: channel,
	// 	user: process.env.GL_USER,
	// 	repo: process.env.GL_REPO,
	// 	repo_base: process.env.GL_REPO_BASE_ABS
	// }

	var rsa_key_id = msg.user.split('_')[0];
	try {
		mongoose.Types.ObjectId(rsa_key_id);
	} catch (e) {
		console.log("Invalid Key.", msg);

		return send_git_response(msg, "Invalid SSH Key!", true);
	}

	models.RSAKey.findOne({
		_id: rsa_key_id,
		deleted: false
	}, function(err, rsaKey) {
		if (err) throw err;

		if (!rsaKey) {
			console.log("Key Not Found", msg, rsaKey);

			return send_git_response(msg, "SSH Key Not Found", true);
		}

		models.User.findOne({
			_id: rsaKey.user,
			disabled: false
		}).exec(function (err, user) {
			if (err) throw err;

			if (!user) {
				console.log("Unknown user. ", msg);
				return send_git_response(msg, "Unknown User..", true);
			}

			var repo = msg.repo.replace(user.username+'/', '');

			models.App.findOne({
				user: user._id,
				nameUrl: repo,
				deleted: false
			}).exec(function (err, app) {
				if (err) throw err;
				
				if (!app) {
					console.log("--> App does not exist", msg);

					app = new models.App({
						name: repo,
						nameLowercase: repo.toLowerCase(),
						nameUrl: repo.replace(/\W+/g, '-').trim().toLowerCase(),
						user: user._id,
						script: "index.js",
						branch: 'master'
					})
					app.location = 'git@nodegear.io:'+msg.repo+'.git';

					send_git_response(msg, "Creating NodeGear App based on Repository name");

					var domain = new models.AppDomain({
						app: app._id,
						user: user._id,
						is_subdomain: true,
						domain: app.nameUrl
					});
					domain.save(function(err) {
						if (err) throw err;
					});

					send_git_response(msg, "Creating NodeGear App Domain: "+app.nameUrl+"."+user.username+".ngapp.io");

					console.log(app);
					
					app.save(function(err) {
						if (err) throw err;
					})
				}

				send_git_response(msg, "Name: "+app.name);
				send_git_response(msg, "URL: https://nodegear.io/app/"+app.nameUrl);
				send_git_response(msg, "Repository: "+app.location);
				send_git_response(msg, "");

				models.AppProcess.find({
					app: app._id,
					deleted: false
				}).populate('server').exec(function (err, processes) {
					if (err) throw err;

					if (processes.length == 0) {
						// Start a new process
						models.Server.findOne({
						}, function(err, server) {
							if (err) throw err;

							if (!server) {
								// Cannot create process without a server..
								console.log("Cannot find a suitable server", app);
								send_git_response(msg, "Could find a suitable server for new process.", true);
								return;
							}

							var proc = new models.AppProcess({
								server: server._id,
								name: 'Git',
								app: app._id
							});

							proc.save(function(err) {
								if (err) throw err;

								console.log("Booting new git process");
								send_git_response(msg, "Booting new NodeGear App Process on Server "+server.name);

								send_git_response(msg, "", true);

								client.publish('server_'+server.identifier, JSON.stringify({
									action: 'start',
									id: proc._id
								}));
							})
						})

						return;
					}

					for (var i = 0; i < processes.length; i++) {
						// Restart the process
						send_git_response(msg, "Restarting Process ["+(i+1)+"/"+processes.length+"]: "+processes[i].name);
						client.publish('server_'+processes[i].server.identifier, JSON.stringify({
							id: processes[i]._id,
							action: 'restart'
						}))
					}

					send_git_response(msg, "", true);
				});
			})
		})
	})
}