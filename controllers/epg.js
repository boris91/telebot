const List = require('./list');

class Epg extends List {
	onSuccess($, results) {
		const title = $.query[0];
		const channel = this.sliceFinishedPrograms(results).find(channel => channel.title === title);
		const schedulesInfo = channel && channel.schedules &&
			channel.schedules.map(this.formatScheduleInfo).join('\n');

		$.sendMessage((channel ? '<code>' + channel.title + '</code>\n' : '') + (schedulesInfo || 'No program info'), { parse_mode: "HTML" });
	}
}

module.exports = Epg;