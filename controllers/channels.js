const List = require('./list');

class Channels extends List {
	onSuccess($, results) {
		$.sendMessage('Select channel', {
			reply_markup: JSON.stringify({
				keyboard: this.sliceFinishedPrograms(results).map(channel => ['/e ' + channel.title]),
				one_time_keyboard: true
			})
		});
	}
}

module.exports = Channels;