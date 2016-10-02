const req = require('tiny_request');
const config = require('./config');

class Auth {
	static getHeaders($) {
		return Auth.headers[$.provider.name];
	}

	static run(onAllReqsSucceedFirstTime) {
		Auth.providers = config.contentProviders;
		Auth.providersCount = Object.keys(Auth.providers).length;
		Auth.readyProvidersCount = 0;
		Auth.headers = {};
		Object.keys(Auth.providers).forEach(providerName => {
			const providerHeaders = Auth.headers[providerName] = {};
			Object.assign(providerHeaders, config.defaultXhrHeaders);
		});
		Auth.sendSessionRequests(onAllReqsSucceedFirstTime);
		setInterval(Auth.sendSessionRequests.bind(Auth), 15 * 1000 * 60);
	}

	static sendSessionRequests(onReqsSucceed = () => {}) {
		Object.keys(Auth.providers).forEach(Auth.sendSessionRequest.bind(Auth, onReqsSucceed));
	}

	static sendSessionRequest(onReqsSucceed, providerName) {
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
				if (++Auth.readyProvidersCount === Auth.providersCount) {
					onReqsSucceed();
				}
			}
		});
	}
}

module.exports = Auth;