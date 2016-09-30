const Telegram = require('telegram-node-bot');
const req = require('tiny_request');
const moment = require('moment');
const config = require('./config');
const InputFile = require('telegram-node-bot/lib/api/InputFile');

let contentProvider = config.defaultContentProvider;
let contentProviderData = config.contentProviders[contentProvider];
const reqHeaders = {};
Object.keys(config.contentProviders).forEach(providerName => reqHeaders[providerName] = { 'User-Agent': 'Telegram Bot SDK' });

const formatDate = (timestamp, format = 'MMM DD, ddd') => {
	return moment(timestamp).format(format);
};

const auth = () => {
	req.get({
		url: contentProviderData.apiUrl + contentProviderData.anonymousAuthPath,
		query: contentProviderData.anonymousAuthQueryParams,
		headers: reqHeaders[contentProvider],
		json: true
	}, body => {
		if (body) {
			reqHeaders[contentProvider][config.sessionHeaderKey] = body.sessionId;
		}
	});
};

class Provider extends Telegram.TelegramBaseController {
	handle($) {
		$.runMenu({
			oneTimeKeyboard: true,
			message: 'Select content provider',
			'Orange Poland': () => {
				contentProvider = 'orange-poland';
				contentProviderData = config.contentProviders[contentProvider];
				auth();
				$.sendMessage('Content provider set to `Orange Poland`', { parse_mode: 'Markdown' });
			},
			'Orange Spain': () => {
				contentProvider = 'orange-spain';
				contentProviderData = config.contentProviders[contentProvider];
				auth();
				$.sendMessage('Content provider set to `Orange Spain`', { parse_mode: 'Markdown' });
			}
		});
	}
}

class List extends Telegram.TelegramBaseController {
	get query() {
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
		return `<b>${formatDate(schedule.start, 'hh:mm')}</b> ${schedule.title}`;
	}

	onSuccess($, results) {
		const channels = this.sliceFinishedPrograms(results).map(channel => {
			if (channel.schedules) {
				const schedulesInfo = channel.schedules
						.slice(0, this.maxProgramsCount)
						.map(this.formatScheduleInfo)
						.join('\n');
				const date = moment().add(this.offset, 'days');
				return '<code>' + channel.title + '</code> ' + formatDate(date.valueOf()) + '\n' + (schedulesInfo || "No program info");
			} else {
				return '<code>No schedules</code>';
			}
		}).join('\n\n');

		$.sendMessage(channels || 'No EPG found', { parse_mode: 'HTML' });
	}

	onError($, err) {
		console.log(err);
	}

	handle($) {
		req.get({
			url: contentProviderData.apiUrl + config.epgPath,
			query: this.query,
			headers: reqHeaders[contentProvider],
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

class Help extends Telegram.TelegramBaseController {
	getAvailableCommands($) {
		const { _firstName: senderName, _lastName: senderSurname } = $.message.from;
		return [
			`Hello, *${senderName} ${senderSurname}*! I'm EBbot and I'm ready to help you with NoriginMedia Hybrid Apps!`
		].concat(config.commandsList).join('\n');
	}

	handle($) {
		$.sendMessage(this.getAvailableCommands($), { parse_mode: 'Markdown' });
	}
}

class WrongCommand extends Help {
	handle($) {
		$.sendMessage('`Please, do not send me not registered commands!`\n\n', { parse_mode: 'Markdown' });
		super.handle($);
	}
}

class Find extends Telegram.TelegramBaseController {
	get query() {
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
			url: contentProviderData.apiUrl + config.searchPath,
			query: Object.assign(this.query, { for: query }),
			headers: reqHeaders[contentProvider],
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
		$.userSession.results = results
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

		$.sendMessage(message || 'No occurence found', { parse_mode: 'HTML' });
	}

	onError($, err) {
		console.log(err);
	}

	handle($) {
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

class Details extends Telegram.TelegramBaseController {
	handle($) {
		const vod = $.userSession.results[$.query.id];

		if (vod && vod.id) {
			req.get({
				url: contentProviderData.apiUrl + vod.id,
				headers: reqHeaders[contentProvider],
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
		const vod = results[0];
		const title = vod.title;
		const description = vod.description;
		const year = vod.metadata.releaseYear;
		const duration = vod.metadata.duration;
		const vodImgUrl = vod.images[config.coverImageKey];
		const yearAndDuration = year && duration ? ` (${year}, ${formatDate(duration, 'hh:mm:ss')})` : '';
		const vodData = `<b>${title}</b>${yearAndDuration}\n` + description;

		$.sendMessage(vodData || 'No occurence found', {parse_mode: 'HTML'});

		if (vodImgUrl) {
			let image = $.chatSession[vodImgUrl];
			if (!image) {
				image = $.chatSession[vodImgUrl] = new InputFile(null, null, vodImgUrl, null);
			}
			$.sendPhoto(image);
		}
	}

	onError($, err) {
		console.log(err);
	}
}

class Related extends Telegram.TelegramBaseController {
	handle($) {
		const vod = $.userSession.results[$.query.id];

		if (vod && vod.id) {
			if (vod.type === 'vod') {
				req.get({
					url: contentProviderData.apiUrl + vod.id + '/related',
					headers: reqHeaders[contentProvider],
					json: true
				}, (body, response, err) => {
					if (!err && response.statusCode === 200) {
						this.onSuccess($, body && body.length ? body : []);
					} else {
						this.onError($, err);
					}
				});
			} else {
				$.sendMessage('Program cannot have related content');
			}
		} else {
			$.sendMessage('There is no result for this VoD');
		}
	}

	onSuccess($, results) {
		const related = results
				.map(vod => `<b>${vod.title}</b>${vod.metadata.releaseYear ? ' (' + vod.metadata.releaseYear + ')' : ''}`)
				.join('\n');
		$.sendMessage('<code>' + $.userSession.results[$.query.id].title + '</code> recommendataions\n' + related || 'No related found', {parse_mode: 'HTML'});
	}

	onError($, err) {
		console.log(err);
	}
}

class TimeTable extends List {
	get query() {
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

	handle($) {
		const params = $.query[0];
		const spaceIndex = params.lastIndexOf(' ');
		this.id = params.substr(0, spaceIndex);
		this.offset = params.substr(spaceIndex + 1, params.length);
		super.handle($);
	}
}

auth();

setInterval(auth, 15 * 1000 * 60);

new Telegram.Telegram(config.botToken)
	.router
		.when('/start', new Help())
		.when(/\/e\s?(.*)/, new Epg())
		.when('/f', new Find())
		.when('/c', new Channels())
		.when('/l', new List())
		.when('/h', new Help())
		.when('/d :id', new Details())
		.when('/r :id', new Related())
		.when('/p', new Provider())
		.when(/\/w\s?(.*)/, new TimeTable())
		.otherwise(new WrongCommand());