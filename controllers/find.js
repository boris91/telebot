const req = require('tiny_request');

const Base = require('./base');

const config = require('../config');
const Auth = require('../auth');
const UserSession = require('../user-session');

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

module.exports = Find;