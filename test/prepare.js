var config = require('../lib/config');
var backend = require('../lib/backend');

var should = require('should'),
	models = require('ng-models')

if (!process.env.NG_TEST) {
	console.log("\nNot in TEST environment. Please export NG_TEST variable\n");
}

should(process.env.NG_TEST).be.ok;

it('clean the database', function(done) {
	// better solution required
	require('async').parallel([
		function (cb) {
			models.Analytic.remove(cb);
		},
		function (cb) {
			models.App.remove(cb);
		},
		function (cb) {
			models.AppDomain.remove(cb);
		},
		function (cb) {
			models.AppEnvironment.remove(cb);
		},
		function (cb) {
			models.AppEvent.remove(cb);
		},
		function (cb) {
			models.AppLog.remove(cb);
		},
		function (cb) {
			models.AppProcess.remove(cb);
		},
		function (cb) {
			models.EmailVerification.remove(cb);
		},
		function (cb) {
			models.ForgotNotification.remove(cb);
		},
		function (cb) {
			models.NetworkPerformanceRaw.remove(cb);
		},
		function (cb) {
			models.PaymentMethod.remove(cb);
		},
		function (cb) {
			models.PublicKey.remove(cb);
		},
		function (cb) {
			models.Server.remove(cb);
		},
		function (cb) {
			models.TFA.remove(cb);
		},
		function (cb) {
			models.Ticket.remove(cb);
		},
		function (cb) {
			models.Transaction.remove(cb);
		},
		function (cb) {
			models.Usage.remove(cb);
		},
		function (cb) {
			models.User.remove(cb);
		}
	], done)
})