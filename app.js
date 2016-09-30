const Telegram = require('telegram-node-bot');
const Ctrl = Telegram.TelegramBaseController;
const tg = new Telegram.Telegram('252731600:AAHEfZxF0BA1_gyC4k3TfXd3AkaLcLHhOgs');
const req = require('tiny_request');
const InputFile = require('telegram-node-bot/lib/api/InputFile');

const macApiUrl = 'http://orangepl-test.noriginmedia.com/mac-api/proxy/';
const sessionHeaderKey = 'X-Aspiro-TV-Session';
const reqHeaders = {
	'User-Agent': 'Telegram Bot SDK'
};

const auth = () => {
	req.get({
		url: macApiUrl + 'orange-opl/anonymous',
		query: {
			appId: 'opl.orange.pc',
			appVersion: '1.0'
		},
		headers: reqHeaders,
		json: true
	}, body => {
		if (body) {
			reqHeaders[sessionHeaderKey] = body.sessionId;
		}
	});
};

class List extends Ctrl {
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
		const startTime = new Date(schedule.start);
		let hours = startTime.getHours();
		hours = hours < 10 ? '0' + hours : hours;
		let mins = startTime.getMinutes();
		mins = mins < 10 ? '0' + mins : mins;
		return `<b>${hours}:${mins}</b> ${schedule.title}`;
	}

	onSuccess($, results) {
		const channels = this.sliceFinishedPrograms(results).map(channel => {
			if (channel.schedules) {
				const schedulesInfo = channel.schedules
						.slice(0, this.maxProgramsCount)
						.map(this.formatScheduleInfo)
						.join('\n');
				return '<code>' + channel.title + '</code>\n' + (schedulesInfo || "No program info");
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
			url: macApiUrl + 'epg',
			query: this.query,
			headers: reqHeaders,
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
		const schedulesInfo = channel.schedules
				.map(this.formatScheduleInfo)
				.join('\n');

		$.sendMessage('<code>' + channel.title + '</code>\n' + (schedulesInfo || 'No program info'), { parse_mode: "HTML" });
	}
}

class Help extends Ctrl {
	getAvailableCommands($) {
		const { _firstName: senderName, _lastName: senderSurname } = $.message.from;
		return [
			`Hello, *${senderName} ${senderSurname}*! I'm EBbot and I'm ready to help you with NoriginMedia Hybrid Apps!`,
			'`/h                  `- show commands list',
			'`/l                  `- show current programs list',
			'`/c                  `- list of available channels',
			'`/e :channel         `- list of programs for specific channel',
			'`/f                  `- find video content',
			'`/d :index           `- show video details',
			'`/r :index           `- show related videos',
			'`/w :channel :offset `- show programs from day offset'
		].join('\n');
	}

	handle($) {
		$.sendMessage(this.getAvailableCommands($), { parse_mode: 'Markdown' });
	}
}

class Find extends Ctrl {
	get query() {
		return {
			forFields: 'title,description,metadata.castSearch.actor,metadata.castSearch.director',
			resultFormat: 'forFieldsFormat'
		};
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
			url: macApiUrl + 'search',
			query: Object.assign(this.query, { for: query }),
			headers: reqHeaders,
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
		$.userSession.results = [];
		const message = results
				.filter(result => result.type === this.filter)
				.map(result => {
					$.userSession.results.push(result);
					return result;
				})
				.map((result, index) => '<b>' + index + '</b>' + ' "' + result.title + '"<code>(' + result.occurences + ')</code>')
				.join('\n');
		$.sendMessage(message || 'No occurence found', { parse_mode: 'HTML' });
	}

	onError($, err) {
		console.log(err);
	}

	handle($) {
		$.runMenu({
			oneTimeKeyboard: true,
			message: 'Select type of content',
			options: {
				parse_mode: 'Markdown'
			},
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

class Details extends Ctrl {
	handle($) {
		const vod = $.userSession.results[$.query.id];

		if (vod && vod.id) {
			req.get({
				url: macApiUrl + vod.id,
				headers: reqHeaders,
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
		let duration = parseInt(vod.metadata.duration / 60);
		const durHours = parseInt(duration / 60);
		let durMins = duration % 60;
		durMins = durMins < 10 ? '0' + durMins : durMins;
		const year = vod.metadata.releaseYear;
		const yearAndDuration = year && duration ? ` (${year}, ${durHours}:${durMins})` : '';

		let vodData = `<b>${title}</b>${yearAndDuration}\n` + description;
		$.sendMessage(vodData || 'No occurence found', {parse_mode: 'HTML'});

		const vodImgUrl = vod.images["APP_SLSHOW_3"];
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

class Related extends Ctrl {
	handle($) {
		const vod = $.userSession.results[$.query.id];

		if (vod && vod.id) {
			if (vod.type === 'vod') {
				req.get({
					url: macApiUrl + vod.id + '/related',
					headers: reqHeaders,
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
		const leftUntilMidnight = this.offset > 0 ? (24 - new Date().getHours()) : -(new Date().getHours());
		const offset = (24 * this.offset + leftUntilMidnight);
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

tg.router
	.when('/start', new Help())
	.when(/\/e\s?(.*)/, new Epg())
	.when('/f', new Find())
	.when('/c', new Channels())
	.when('/l', new List())
	.when('/h', new Help())
	.when('/d :id', new Details())
	.when('/r :id', new Related())
	.when(/\/w\s?(.*)/, new TimeTable())
	.otherwise(new Help());