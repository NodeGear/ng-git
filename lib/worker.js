var async = require('async')
	, fs = require('fs')
	, spawn = require('child_process').spawn
	, models = require('ng-models')
	, config = require('./config')
	, path = require('path')

exports.queue = async.queue(worker, 1);

var gitolite = config.credentials.gitolite;

function worker (affected_key, callback) {
	var path = gitolite+'keydir/'+affected_key.key._id+'_'+(new Date(affected_key.key.created).getTime())+'.pub';

	if (affected_key.type == 'create') {
		fs.writeFile(path, affected_key.key.public_key, function(err) {
			if (err) throw err;

			update_gitolite(callback);
		});
	} else if (affected_key.type == 'delete') {
		fs.exists(path, function(exists) {
			if (!exists) {
				console.log("Key does not exist..")
				return callback(null);
			}

			fs.unlink(path, function(err) {
				if (err) throw err;

				update_gitolite(callback);
			})
		})
	} else if (affected_key.type == 'update') {
		// Just updating gitolite..
		update_gitolite(callback);
	}
}

function update_gitolite (callback) {
	var base = "repo gitolite-admin\n\
    RW+ = matej root\n\
\n";
	
	models.User.find({
		email_verified: true,
		disabled: false
	}).lean().select('_id').exec(function(err, users) {
		if (err) throw err;

		async.map(users, function(user, cb) {
			models.RSAKey.find({
				user: user._id,
				installed: true,
				installing: false,
				deleted: false
			})
			.select('created user public_key installed installing')
			.lean()
			.populate({
				path: 'user',
				select: 'username',
				options: {
					lean: true
				}
			})
			.exec(cb);
		}, function(err, users) {
			if (err) throw err;

			for (var u = 0; u < users.length; u++) {
				var keys = users[u];

				if (keys.length > 0) {
					var first = keys[0];
					base += "repo "+first.user.username+"/..*\n\
	C = ";

					for (var i = 0; i < keys.length; i++) {
						var key = keys[i];
						if (!key.user.username) {
							console.log("Undefined username for "+key.user)
							continue;
						}
						
						base += " " + key._id + '_' + (new Date(key.created).getTime());
					}

					base += "\n\
	RW+ = CREATOR\n\
	option hook.post-receive = nodegear\n";
				}
			}

			console.log(base);
			fs.writeFile(gitolite+'conf/gitolite.conf', base, function(err) {
				if (err) throw err;

				// Update git..
				var git_update = spawn(path.join(config.path, '/scripts/updateGitolite.sh'), [gitolite]);
				git_update.stdout.on('data', function(chunk) {
					console.log(chunk.toString('utf8'));
				});
				git_update.stderr.on('data', function(chunk) {
					console.log(chunk.toString('utf8'));
				});

				git_update.on('close', function(code) {
					console.log(code);
					if (code != 0) {
						// Update failed
						console.log("Git update failed")
						callback();

						return;
					}

					callback();
				});
			});
		});
	});
}