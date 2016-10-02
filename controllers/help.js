const config = require('../config');
const Base = require('./base');

class Help extends Base {
	getAvailableCommands($) {
		const { _firstName: senderName, _lastName: senderSurname } = $.message.from;
		return [
			`Hello, *${senderName} ${senderSurname}*! I'm EBbot and I'm ready to help you with NoriginMedia Hybrid Apps!`
		].concat(config.commandsList).join('\n');
	}

	processCmd($) {
		$.sendMessage(this.getAvailableCommands($), { parse_mode: 'Markdown' });
	}
}

module.exports = Help;