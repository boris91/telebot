class UserSession {
	static set(scope, key, value, callback = () => {}) {
		scope.setUserSession(key, { value }).then(callback);
	}

	static get(scope, key, callback) {
		scope.getUserSession(key).then(storeItem => callback(storeItem ? storeItem.value : storeItem));
	}
}

module.exports = UserSession;