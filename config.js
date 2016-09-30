module.exports = {
	botToken: '252731600:AAHEfZxF0BA1_gyC4k3TfXd3AkaLcLHhOgs',

	defaultContentProvider: 'orange-poland',

	contentProviders: {
		'orange-poland': {
			apiUrl: 'http://orangepl-test.noriginmedia.com/mac-api/proxy/',
			anonymousAuthPath: 'orange-opl/anonymous',
			anonymousAuthQueryParams: {
				appId: 'opl.orange.pc',
				appVersion: '1.0'
			}
		},
		'orange-spain': {
			apiUrl: 'http://orange-test.noriginmedia.com/mac-api/proxy/',
			anonymousAuthPath: 'orange-es/anonymous',
			anonymousAuthQueryParams: {
				appId: 'es.orange.pc',
				appVersion: '3.3'
			}
		}
	},

	sessionHeaderKey: 'X-Aspiro-TV-Session',

	searchQueryParams: {
		forFields: 'title,description,metadata.castSearch.actor,metadata.castSearch.director',
		resultFormat: 'forFieldsFormat'
	},

	epgPath: 'epg',
	searchPath: 'search',

	commandsList: [
		'`/h                  `- show commands list',
		'`/p                  `- select content provider',
		'`/l                  `- show current programs list',
		'`/c                  `- list of available channels',
		'`/e :channel         `- list of programs for specific channel',
		'`/f                  `- find video content',
		'`/d :index           `- show video details',
		'`/r :index           `- show related videos',
		'`/w :channel :offset `- show programs from day offset'
	],

	coverImageKey: 'APP_SLSHOW_3'
};