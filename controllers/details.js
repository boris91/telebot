const req = require('tiny_request');
const moment = require('moment');
const InputFile = require('telegram-node-bot/lib/api/InputFile');

const config = require('../config');
const Auth = require('../auth');
const UserSession = require('../user-session');
const Base = require('./base');

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

module.exports = Details;