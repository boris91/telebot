const req = require('tiny_request');

const Auth = require('../auth');
const UserSession = require('../user-session');
const Base = require('./base');

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

module.exports = Related;