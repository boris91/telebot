const Help = require('./help');

class Wrong extends Help {
	processCmd($) {
		$.sendMessage('`Please, do not send me not registered commands!`\n\n', { parse_mode: 'Markdown' });
		super.processCmd($);
	}
}

module.exports = Wrong;