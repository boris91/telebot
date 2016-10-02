const Telegram = require('telegram-node-bot');

const config = require('./config');
const Auth = require('./auth');

class EBbot {
	static start() {
		const onAllAuthReqsSucceed = EBbot.registerRoutes.bind(EBbot);
		Auth.run(onAllAuthReqsSucceed);
	}

	static registerRoutes() {
		const telebot = new Telegram.Telegram(config.botToken, { workers: config.workersCount });
		const router = telebot.router;
		const routes = config.routes.right;

		//let logs = '-------------LOGS-------------\n';
		Object.keys(routes).forEach(command => {
			const ctrlPath = './controllers/' + routes[command];
			const Ctrl = require(ctrlPath);
			const textCommand = new Telegram.TextCommand('/' + command);
			//logs += ctrlPath + ': ' + (typeof Ctrl) + ' => /' + command + '\n';
			router.when(textCommand, new Ctrl());
		});

		const OtherwiseCtrl = require('./controllers/' + config.routes.wrong);
		//logs += './controllers/' + config.routes.wrong + ': ' + (typeof OtherwiseCtrl);
		//setTimeout(console.log.bind(console, logs), 3000);
		router.otherwise(new OtherwiseCtrl());
	}
}

module.exports = EBbot;