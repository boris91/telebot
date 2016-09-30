module.exports = {
	botToken: '252731600:AAHEfZxF0BA1_gyC4k3TfXd3AkaLcLHhOgs',

	apiUrl: 'http://orangepl-test.noriginmedia.com/mac-api/proxy/',
	sessionHeaderKey: 'X-Aspiro-TV-Session',

	anonymousAuthQueryParams: {
		appId: 'opl.orange.pc',
		appVersion: '1.0'
	},

	searchQueryParams: {
		forFields: 'title,description,metadata.castSearch.actor,metadata.castSearch.director',
		resultFormat: 'forFieldsFormat'
	},

	anonymousAuthPath: 'orange-opl/anonymous',
	epgPath: 'epg',
	searchPath: 'search',

	commandsList: [
		'`/h                  `- show commands list',
		'`/l                  `- show current programs list',
		'`/c                  `- list of available channels',
		'`/e :channel         `- list of programs for specific channel',
		'`/f                  `- find video content',
		'`/d :index           `- show video details',
		'`/r :index           `- show related videos',
		'`/w :channel :offset `- show programs from day offset'
	]
};