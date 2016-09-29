const Telegram = require('telegram-node-bot');
const Ctrl = Telegram.TelegramBaseController;
const tg = new Telegram.Telegram('252731600:AAHEfZxF0BA1_gyC4k3TfXd3AkaLcLHhOgs');
const req = require('tiny_request');
const InputFile = require('telegram-node-bot/lib/api/InputFile');

const macApiUrl = 'http://orangepl-test.noriginmedia.com/mac-api/proxy/';
const reqHeaders = {
	'X-Aspiro-TV-Session': '03b31e6419a90bb807515f4188863609',
	'Accept':'*/*',
	'Accept-Encoding':'gzip, deflate, sdch',
	'Accept-Language':'en-US,en;q=0.8,ru;q=0.6',
	'Cache-Control':'no-cache',
	'Origin':'http://localhost:3000',
	'Pragma':'no-cache',
	'Referer':'http://localhost:3000/browser/',
	'User-Agent':'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.116 Safari/537.36'
};

class List extends Ctrl {
	get path() {
		return 'epg?limit=9999&from=now&offset=-13h&duration=31h&transform=epg';
	}

	onSuccess($, results) {
		const now = Date.now();
		const channels = results.map(channel => {
			const schedulesInfo = channel.schedules
					.filter(schedule => schedule.end > now)
					.slice(0, 3)
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
			url: macApiUrl + this.path,
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
				keyboard: results.map(channel => ['/e ' + channel.title]),
				one_time_keyboard: true
			})
		});
	}
}

class Epg extends List {
	onSuccess($, results) {
		const title = $.query[0];
		const channel = results.find(channel => channel.title === title);
		const schedulesInfo = channel.schedules.map(schedule => {
			const startTime = new Date(schedule.start);
			let hours = startTime.getHours();
			hours = hours < 10 ? '0' + hours : hours;
			let mins = startTime.getMinutes();
			mins = mins < 10 ? '0' + mins : mins;
			return `*${hours}:${mins}* "${schedule.title}"`;
		}).join('\n');

		$.sendMessage(schedulesInfo, { parse_mode: "Markdown" });
	}
}

class Help extends Ctrl {
	get availableCommands() {
		return '' +
			'`/h              `- show commands list\n' +
			'`/l              `- show current programs list\n' +
			'`/c              `- list of available channels\n' +
			'`/e :channelName `- list of programs for specific channel\n' +
			'`/s              `- search\n' +
			'`/d :vodId       `- show VoD details';
	}

	handle($) {
		$.sendMessage(this.availableCommands, { parse_mode: 'Markdown' });
	}
}

class Search extends Ctrl {
	get path() {
		return 'search?forFields=title,description,metadata.castSearch.actor,metadata.castSearch.director&resultFormat=forFieldsFormat&for=';
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
			url: macApiUrl + this.path + query,
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
			message: 'Select type of content',
			options: {
				one_time_keyboard: true,
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

tg.router
	.when('/start', new Help())
	.when(/\/e\s?(.*)/, new Epg())
	.when(/\/s\s?(.*)/, new Search())
	.when('/c', new Channels())
	.when('/l', new List())
	.when('/h', new Help())
	.when('/d :id', new Details())
	.otherwise(new Help());