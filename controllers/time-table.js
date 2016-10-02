const moment = require('moment');

const List = require('./list');

class TimeTable extends List {
	get reqQuery() {
		const offset = moment().add(this.offset, 'days').startOf('day').diff(moment(), 'hours');
		return {
			limit: 9999,
			from: 'now',
			offset: offset + 'h',
			duration: '24h',
			transform: 'epg'
		};
	}

	get maxProgramsCount() {
		return undefined;
	}

	get ignoreFinishedPrograms() {
		return false;
	}

	onSuccess($, results) {
		super.onSuccess($, results.filter(channel => channel.title == this.id));
	}

	processCmd($) {
		const params = $.query[0];
		const spaceIndex = params.lastIndexOf(' ');
		this.id = params.substr(0, spaceIndex);
		this.offset = params.substr(spaceIndex + 1, params.length);
		super.processCmd($);
	}
}

module.exports = TimeTable;