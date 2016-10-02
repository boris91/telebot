const Telegram = require('telegram-node-bot');

const config = require('../config');
const Auth = require('../auth');
const UserSession = require('../user-session');

class Base extends Telegram.TelegramBaseController {
	constructor(cmdTxtPattern, otherwiseCtrl) {
		super();
		this._cmdTxtPattern = cmdTxtPattern;
		this._otherwiseCtrl = otherwiseCtrl;
		this._processing = false;
		this._queue = [];
	}

	processCmd($) {
		//TODO: implement for each controller inherited from Base
		throw 'Not implemented';
	}

	extendScope($, props) {
		const text = $.message.text;
		const isCmd = text.indexOf('/') === 0;
		const spaceIndex = text.indexOf(' ');
		const hasQuery = isCmd && spaceIndex !== -1;
		Object.assign($,
			props,
			{
				query: [
					(hasQuery ? text.slice(spaceIndex + 1) : text).trim()
				]
			});
	}

	handle($) {
		const exactCmd = !this._cmdTxtPattern || $.message.text.split(' ')[0] === this._cmdTxtPattern;
		if (exactCmd) {
			if (this._processing) {
				this._queue.push($);
			} else {
				this._processing = true;
				UserSession.get($, 'contentProvider', this.onGetContentProvider.bind(this, $));
			}
		} else if (this._otherwiseCtrl){
			this._otherwiseCtrl.handle($);
		}
	}

	onGetContentProvider($, providerName) {
		if (providerName) {
			const provider = Auth.providers[providerName];
			this.extendScope($, { provider });
			this.processCmd($, provider);
			this._processing = false;
			while(this._queue.length !== 0) {
				this.processCmd(this._queue.shift(), provider);
			}
		} else {
			providerName = config.defaultContentProvider;
			UserSession.set($, 'contentProvider', providerName, this.onGetContentProvider.bind(this, $, providerName));
		}
	}
}

module.exports = Base;