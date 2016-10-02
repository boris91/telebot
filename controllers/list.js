const req = require('tiny_request');
const moment = require('moment');

const config = require('../config');
const Auth = require('../auth');
const Base = require('./base');

class List extends Base {
	get reqQuery() {
		return {
			limit: 9999,
			from: 'now',
			offset: -(new Date().getHours()) + 'h',
			duration: '24h',
			transform: 'epg'
		};
	}

	get maxProgramsCount() {
		return 3;
	}

	get ignoreFinishedPrograms() {
		return true;
	}

	sliceFinishedPrograms(channels) {
		if (this.ignoreFinishedPrograms) {
			const now = Date.now();
			return channels.map(channel => {
				channel.schedules = channel.schedules ? channel.schedules.filter(schedule => schedule.end > now) : [];
				return channel;
			});
		} else {
			return channels;
		}
	}

	formatScheduleInfo(schedule) {
		return `<b>${moment(schedule.start).format('hh:mm')}</b> ${schedule.title}`;
	}

	onSuccess($, results) {
		const channels = this.sliceFinishedPrograms(results).map(channel => {
			if (channel.schedules) {
				const schedulesInfo = channel.schedules
					.slice(0, this.maxProgramsCount)
					.map(this.formatScheduleInfo)
					.join('\n');
				const date = moment().add(this.offset, 'days').format('MMM DD, ddd');
				return '<code>' + channel.title + '</code> ' + date + '\n' + (schedulesInfo || "No program info");
			} else {
				return '<code>No schedules</code>';
			}
		}).join('\n\n');

		$.sendMessage(channels || 'No EPG found', { parse_mode: 'HTML' });
	}

	onError($, err) {
		console.log(err);
	}

	processCmd($) {
		req.get({
			url: $.provider.apiUrl + config.epgPath,
			query: this.reqQuery,
			headers: Auth.getHeaders($),
			json: true
		}, (body, response, err) => {
			if (!err && response.statusCode === 200) {
				this.onSuccess($, body && body.length ? body : []);
			} else {
				this.onError($, err);
			}
		});
	}
}

module.exports = List;