var config = require('../lib/config');
var backend = require('../lib/backend');
var ProcessManager;

var should = require('should'),
	models = require('ng-models')

if (!process.env.NG_TEST) {
	console.log("\nNot in TEST environment. Please export NG_TEST variable\n");
}

should(process.env.NG_TEST).be.ok;

it('should wait for server to be ready', function(done) {
	function test () {
		if (backend.ready) {
			done(null);

			ProcessManager = require('../lib/ProcessManager');

			return;
		}
		
		setTimeout(test, 50);
	}

	test();
});

describe('will test app stuff', function() {
	var user, app, app_domain, app_process, app_env;

	before(function() {
		user = new models.User({
			username: "matejkramny",
			usernameLowercase: "matejkramny",
			name: "Matej Kramny",
			email: "matej@matej.me",
			email_verified: true,
			admin: true
		})
		user.save();

		app = new models.App({
			name: "Test Application",
			nameUrl: "test-application",
			user: user._id,
			location: "/Users/matejkramny/ng_bare_test/",
			script: "test.js"
		})
		app.save();

		app_domain = new models.AppDomain({
			app: app._id,
			domain: "matej.local",
			tld: "local",
			is_subdomain: false
		});
		app_domain.save();

		app_process = new models.AppProcess({
			app: app._id,
			running: false,
			server: backend.server._id
		});
		app_process.save();

		app_env = new models.AppEnvironment({
			app: app._id,
			name: "test",
			value: "value"
		});
		app_env.save();

	});

	it('will manage process', function(done) {
		ProcessManager.manageProcess(app_process);
		
		ProcessManager.get_processes().should.be.instanceOf(Array).and.have.lengthOf(1);
		done(null);
	});

	it('will start process', function(done) {
		this.timeout(0);
		var process = ProcessManager.getProcess(app_process);

		process.start(function() {
			setTimeout(done, 200);
		});
	})

	it('should verify process is running', function(done) {
		var process = ProcessManager.getProcess(app_process);

		process.getProcess(function(app_proc) {
			app_proc.running.should.be.true;
			
			done(null);
		})
	})

	it('should stop process', function(done) {
		this.timeout(0);

		var proc = ProcessManager.getProcess(app_process);

		var ret = proc.stop();
		should(ret).be.true;

		setTimeout(done, 1000);
	})
})