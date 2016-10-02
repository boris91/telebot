const UserSession = require('../user-session');
const Base = require('./base');

class Provider extends Base {
	processCmd($) {
		$.runMenu({
			oneTimeKeyboard: true,
			message: 'Select content provider',
			'Orange Poland': UserSession.set.bind(UserSession, $, 'contentProvider', 'orange-poland',
				this.onSetContentProvider.bind(this, $, 'Orange Poland')),
			'Orange Spain': UserSession.set.bind(UserSession, $, 'contentProvider', 'orange-spain',
				this.onSetContentProvider.bind(this, $, 'Orange Spain'))
		});
	}

	onSetContentProvider($, name) {
		$.sendMessage('Content provider set to `' + name + '`', { parse_mode: 'Markdown' });
	}
}

module.exports = Provider;