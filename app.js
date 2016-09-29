const Telegram = require('telegram-node-bot');
const Ctrl = Telegram.TelegramBaseController;
const tg = new Telegram.Telegram('252731600:AAHEfZxF0BA1_gyC4k3TfXd3AkaLcLHhOgs');
const req = require('tiny_request');
const InputFile = require('telegram-node-bot/lib/api/InputFile');

const macApiUrl = 'http://orangepl-test.noriginmedia.com/mac-api/proxy/';
const sessionHeaderKey = 'X-Aspiro-TV-Session';
const reqHeaders = {
	'Accept':'*/*',
	'Accept-Encoding':'gzip, deflate, sdch',
	'Accept-Language':'en-US,en;q=0.8,ru;q=0.6',
	'Cache-Control':'no-cache',
	'Origin':'http://localhost:3000',
	'Pragma':'no-cache',
	'Referer':'http://localhost:3000/browser/',
	'User-Agent':'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.116 Safari/537.36'
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
	}, body => reqHeaders[sessionHeaderKey] = body.sessionId);
};

class List extends Ctrl {
	get query() {
		return {
			limit: 9999,
			from: 'now',
			offset: '-13h',
			duration: '31h',
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
				channel.schedules = channel.schedules.filter(schedule => schedule.end > now);
				return channel;
			});
		} else {
			return channels;
		}
	}

	onSuccess($, results) {
		const channels = this.sliceFinishedPrograms(results).map(channel => {
			const schedulesInfo = channel.schedules
					.slice(0, this.maxProgramsCount)
					.map(schedule => {
						const startTime = new Date(schedule.start);
						let hours = startTime.getHours();
						hours = hours < 10 ? '0' + hours : hours;
						let mins = startTime.getMinutes();
						mins = mins < 10 ? '0' + mins : mins;
						return `*${hours}:${mins}* "${schedule.title}"`;
					}).join('\n');
			return '`' + channel.title + '`\n' + (schedulesInfo || "No program info");
		}).join('\n\n');

		$.sendMessage(channels || 'No EPG found', { parse_mode: 'Markdown' });
	}

	onError($, err) {
		$.sendMessage(err);
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
		const schedulesInfo = channel.schedules.map(schedule => {
			const startTime = new Date(schedule.start);
			let hours = startTime.getHours();
			hours = hours < 10 ? '0' + hours : hours;
			let mins = startTime.getMinutes();
			mins = mins < 10 ? '0' + mins : mins;
			return `*${hours}:${mins}* "${schedule.title}"`;
		}).join('\n');

		$.sendMessage(schedulesInfo || 'No program info', { parse_mode: "Markdown" });
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
			'`/w :channel :offset `- show related videos'
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
				.map((result, index) => '*' + index + '*' + ' "' + result.title + '"`(' + result.occurences + ')`')
				.join('\n');
		$.sendMessage(message || 'No occurence found', { parse_mode: 'Markdown' });
	}

	onError($, err) {
		$.sendMessage(err);
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
			$.sendMessage("The is no result for this VOD");
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

		let vodData = `*${title}*${yearAndDuration}\n` + description;
		$.sendMessage(vodData || 'No occurence found', {parse_mode: 'Markdown'});

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
		$.sendMessage(err);
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
			$.sendMessage('The is no result for this VoD');
		}
	}

	onSuccess($, results) {
		const related = results
				.map(vod => `*${vod.title}*${vod.metadata.releaseYear ? ' (' + vod.metadata.releaseYear + ')' : ''}`)
				.join('\n');
		$.sendMessage('`' + $.userSession.results[$.query.id].title + '` recommendataions\n' + related || 'No related found', {parse_mode: 'Markdown'});
	}

	onError($, err) {
		$.sendMessage(err);
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
		super.onSuccess($, results.filter(channel => channel.title == $.query.id));
	}

	handle($) {
		this.id = $.query.id;
		this.offset = $.query.offset;
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
	.when('/w :id :offset', new TimeTable())
	.otherwise(new Help());