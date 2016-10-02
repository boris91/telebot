const Telegram = require('telegram-node-bot');
const req = require('tiny_request');
const moment = require('moment');
const config = require('./config');
const InputFile = require('telegram-node-bot/lib/api/InputFile');

class Auth {
	static getHeaders($) {
		return Auth.headers[$.provider.name];
	}

	static run() {
		Auth.providers = config.contentProviders;
		Auth.headers = {};
		Object.keys(Auth.providers).forEach(providerName => {
			const providerHeaders = Auth.headers[providerName] = {};
			Object.assign(providerHeaders, config.defaultXhrHeaders);
		});
		Auth.sendSessionRequests();
		setInterval(Auth.sendSessionRequests.bind(Auth), 15 * 1000 * 60);
	}

	static sendSessionRequests() {
		Object.keys(Auth.providers).forEach(Auth.sendSessionRequest.bind(Auth));
	}

	static sendSessionRequest(providerName) {
		const provider = Auth.providers[providerName];
		const headers = Auth.headers[providerName];
		req.get({
			url: provider.apiUrl + provider.anonymousAuthPath,
			query: provider.anonymousAuthQueryParams,
			headers,
			json: true
		}, body => {
			if (body) {
				headers[config.sessionHeaderKey] = body.sessionId;
			}
		});
	}
}

class UserSession {
	static set(scope, key, value, callback = () => {}) {
		scope.setUserSession(key, { value }).then(callback);
	}

	static get(scope, key, callback) {
		scope.getUserSession(key).then(storeItem => callback(storeItem ? storeItem.value : storeItem));
	}
}

class Base extends Telegram.TelegramBaseController {
	constructor() {
		super();
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
		if (this._processing) {
			this._queue.push($);
		} else {
			this._processing = true;
			UserSession.get($, 'contentProvider', this.onGetContentProvider.bind(this, $));
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

class Provider extends Base {
	processCmd($) {
		$.runMenu({
			oneTimeKeyboard: true,
			message: 'Select content provider',
			'Orange Poland': UserSession.set.bind(UserSession, $, 'contentProvider', 'orange-poland',
					this.onSetContentProvider.bind(this, $, 'Orange Poland')),
			'Orange Spain': UserSession.set.bind(UserSession, $, 'contentProvider', 'orange-spain',
					this.onSetContentProvider.bind(this, $, 'Orange Spain'))
		});
	}

	onSetContentProvider($, name) {
		$.sendMessage('Content provider set to `' + name + '`', { parse_mode: 'Markdown' });
	}
}

class List extends Base {
	get reqQuery() {
		return {
			limit: 9999,
			from: 'now',
			offset: -(new Date().getHours()) + 'h',
			duration: '24h',
			transform: 'epg'
		};
	}

	get maxProgramsCount() {
		return 3;
	}

	get ignoreFinishedPrograms() {
		return true;
	}

	sliceFinishedPrograms(channels) {
		if (this.ignoreFinishedPrograms) {
			const now = Date.now();
			return channels.map(channel => {
				channel.schedules = channel.schedules ? channel.schedules.filter(schedule => schedule.end > now) : [];
				return channel;
			});
		} else {
			return channels;
		}
	}

	formatScheduleInfo(schedule) {
		return `<b>${moment(schedule.start).format('hh:mm')}</b> ${schedule.title}`;
	}

	onSuccess($, results) {
		const channels = this.sliceFinishedPrograms(results).map(channel => {
			if (channel.schedules) {
				const schedulesInfo = channel.schedules
						.slice(0, this.maxProgramsCount)
						.map(this.formatScheduleInfo)
						.join('\n');
				const date = moment().add(this.offset, 'days').format('MMM DD, ddd');
				return '<code>' + channel.title + '</code> ' + date + '\n' + (schedulesInfo || "No program info");
			} else {
				return '<code>No schedules</code>';
			}
		}).join('\n\n');

		$.sendMessage(channels || 'No EPG found', { parse_mode: 'HTML' });
	}

	onError($, err) {
		console.log(err);
	}

	processCmd($) {
		req.get({
			url: $.provider.apiUrl + config.epgPath,
			query: this.reqQuery,
			headers: Auth.getHeaders($),
			json: true
		}, (body, response, err) => {
			if (!err && response.statusCode === 200) {
				this.onSuccess($, body && body.length ? body : []);
			} else {
				this.onError($, err);
			}
		});
	}
}

class Channels extends List {
	onSuccess($, results) {
		$.sendMessage('Select channel', {
			reply_markup: JSON.stringify({
				keyboard: this.sliceFinishedPrograms(results).map(channel => ['/e ' + channel.title]),
				one_time_keyboard: true
			})
		});
	}
}

class Epg extends List {
	onSuccess($, results) {
		const title = $.query[0];
		const channel = this.sliceFinishedPrograms(results).find(channel => channel.title === title);
		const schedulesInfo = channel && channel.schedules &&
				channel.schedules.map(this.formatScheduleInfo).join('\n');

		$.sendMessage((channel ? '<code>' + channel.title + '</code>\n' : '') + (schedulesInfo || 'No program info'), { parse_mode: "HTML" });
	}
}

class Help extends Base {
	getAvailableCommands($) {
		const { _firstName: senderName, _lastName: senderSurname } = $.message.from;
		return [
			`Hello, *${senderName} ${senderSurname}*! I'm EBbot and I'm ready to help you with NoriginMedia Hybrid Apps!`
		].concat(config.commandsList).join('\n');
	}

	processCmd($) {
		$.sendMessage(this.getAvailableCommands($), { parse_mode: 'Markdown' });
	}
}

class WrongCommand extends Help {
	processCmd($) {
		$.sendMessage('`Please, do not send me not registered commands!`\n\n', { parse_mode: 'Markdown' });
		super.handle($);
	}
}

class Find extends Base {
	get reqQuery() {
		return config.searchQueryParams;
	}

	set filter(type) {
		this._filter = type;
	}

	get filter() {
		return this._filter;
	}

	get form() {
		return {
			query: {
				q: 'Send me search query',
				validator: (msg, cb) => cb(true, msg.text)
			}
		};
	}

	onSubmit($, { query }) {
		req.get({
			url: $.provider.apiUrl + config.searchPath,
			query: Object.assign(this.reqQuery, { for: query }),
			headers: Auth.getHeaders($),
			json: true
		}, (body, response, err) => {
			if (!err && response.statusCode === 200) {
				this.onSuccess($, body && body.length ? body[0].results : []);
			} else {
				this.onError($, err);
			}
		});
	}

	onSuccess($, results) {
		let message = '';
		const searchResults = results
				.filter(result => result.type === this.filter)
				.map((result, index) => {
					const info = '<b>' + index + '</b> ' + result.title + ' <code>(' + result.occurences + ')</code>\n';
					if (message.length + info.length > 2048) {
						$.sendMessage(message, { parse_mode: 'HTML' });
						message = '';
					}
					message += info;
					return result;
				});
		UserSession.set($, 'searchResults', searchResults,
				() => $.sendMessage(message || 'No occurence found', { parse_mode: 'HTML' }));
	}

	onError($, err) {
		console.log(err);
	}

	processCmd($) {
		$.runMenu({
			oneTimeKeyboard: true,
			message: 'Select type of content',
			vod: () => {
				this.filter = 'vod';
				$.runForm(this.form, this.onSubmit.bind(this, $));
			},
			program: () => {
				this.filter = 'program';
				$.runForm(this.form, this.onSubmit.bind(this, $));
			}
		});
	}
}

class Details extends Base {
	processCmd($) {
		UserSession.get($, 'searchResults', this.onGetSearchResults.bind(this, $));
	}

	onGetSearchResults($, searchResults) {
		const index = $.query[0];
		const vod = searchResults && searchResults[index];

		if (vod && vod.id) {
			req.get({
				url: $.provider.apiUrl + vod.id,
				headers: Auth.getHeaders($),
				json: true
			}, (body, response, err) => {
				if (!err && response.statusCode === 200) {
					this.onSuccess($, body && body.length ? body : []);
				} else {
					this.onError($, err);
				}
			});
		} else {
			$.sendMessage("There are no details for picked content");
		}
	}

	onSuccess($, results) {
		const vod = results && results[0];
		if (vod) {
			const title = vod.title;
			const description = vod.description;
			const year = vod.metadata.releaseYear;
			const duration = vod.metadata.duration;
			const vodImgUrl = vod.images[config.coverImageKey];
			const yearAndDuration = year && duration ? ` (${year}, ${moment(duration).format('hh:mm:ss')})` : '';
			const vodData = `<b>${title}</b>${yearAndDuration}\n` + description;

			$.sendMessage(vodData || 'No occurence found', {parse_mode: 'HTML'});

			if (vodImgUrl) {
				$.sendPhoto(InputFile.byUrl(vodImgUrl));
			}
		} else {
			$.sendMessage("There are no details for picked content");
		}
	}

	onError($, err) {
		console.log(err);
	}
}

class Related extends Base {
	processCmd($) {
		UserSession.get($, 'searchResults', this.onGetSearchResults.bind(this, $));
	}

	onGetSearchResults($, searchResults) {
		const index = $.query[0];
		const vod = searchResults && searchResults[index];

		if (vod && vod.id) {
			if (vod.type === 'vod') {
				req.get({
					url: $.provider.apiUrl + vod.id + '/related',
					headers: Auth.getHeaders($),
					json: true
				}, (body, response, err) => {
					if (!err && response.statusCode === 200) {
						this.onSuccess($, body && body.length ? body : []);
					} else {
						this.onError($, err);
					}
				});
			} else {
				$.sendMessage('Program cannot have recommendations');
			}
		} else {
			$.sendMessage("There are no recommendations for picked content");
		}
	}

	onSuccess($, results) {
		UserSession.get($, 'searchResults', this.onGetSearchResultsAfterSuccess.bind(this, $, results));
	}

	onGetSearchResultsAfterSuccess($, results, searchResults) {
		const index = $.query[0];
		const vod = searchResults && searchResults[index];
		if (vod) {
			const related = results
					.map(relVod => `<b>${relVod.title}</b>${relVod.metadata.releaseYear ? ' (' + relVod.metadata.releaseYear + ')' : ''}`)
					.join('\n');
			$.sendMessage('<code>' + vod.title + '</code> recommendataions\n' + related || 'No related found', { parse_mode: 'HTML' });
		} else {
			$.sendMessage('There is no result for this VoD', { parse_mode: 'HTML' });
		}
	}

	onError($, err) {
		console.log(err);
	}
}

class TimeTable extends List {
	get reqQuery() {
		const offset = moment().add(this.offset, 'days').startOf('day').diff(moment(), 'hours');
		return {
			limit: 9999,
			from: 'now',
			offset: offset + 'h',
			duration: '24h',
			transform: 'epg'
		};
	}

	get maxProgramsCount() {
		return undefined;
	}

	get ignoreFinishedPrograms() {
		return false;
	}

	onSuccess($, results) {
		super.onSuccess($, results.filter(channel => channel.title == this.id));
	}

	processCmd($) {
		const params = $.query[0];
		const spaceIndex = params.lastIndexOf(' ');
		this.id = params.substr(0, spaceIndex);
		this.offset = params.substr(spaceIndex + 1, params.length);
		super.processCmd($);
	}
}

Auth.run();

new Telegram.Telegram(config.botToken, { workers: 1 })
	.router
		.when(new Telegram.TextCommand('/start'), new Help())
		.when(new Telegram.TextCommand('/e'), new Epg())
		.when(new Telegram.TextCommand('/f'), new Find())
		.when(new Telegram.TextCommand('/c'), new Channels())
		.when(new Telegram.TextCommand('/l'), new List())
		.when(new Telegram.TextCommand('/h'), new Help())
		.when(new Telegram.TextCommand('/d'), new Details())
		.when(new Telegram.TextCommand('/r'), new Related())
		.when(new Telegram.TextCommand('/p'), new Provider())
		.when(new Telegram.TextCommand('/w'), new TimeTable())
		.otherwise(new WrongCommand());