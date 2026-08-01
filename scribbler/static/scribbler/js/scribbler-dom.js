/*global module, window */

// Small DOM helpers shared by the editor and the menu, replacing the jQuery
// calls the views were built on.

function show(element) {
    'use strict';
    element.style.display = '';
}

function hide(element) {
    'use strict';
    element.style.display = 'none';
}

function element(tagName, className, html) {
    'use strict';
    var node = window.document.createElement(tagName);
    if (className) {
        node.className = className;
    }
    if (html) {
        node.innerHTML = html;
    }
    return node;
}

function forEach(list, callback) {
    'use strict';
    Array.prototype.forEach.call(list, callback);
}

// Mixin replacing the two pieces of Backbone.Events the views used:
// on(name, callback, context) and trigger(name).
var Events = {
    on: function (name, callback, context) {
        'use strict';
        if (!this._events) {
            this._events = {};
        }
        if (!this._events[name]) {
            this._events[name] = [];
        }
        this._events[name].push({callback: callback, context: context});
    },
    trigger: function (name) {
        'use strict';
        var self = this;
        forEach(this._events && this._events[name] || [], function (handler) {
            handler.callback.call(handler.context || self);
        });
    }
};

// POST with a form-encoded body -- what $.post sent, and what the scribbler
// views read from request.POST. Resolves with the parsed JSON response.
function post(url, data) {
    'use strict';
    var body = new window.URLSearchParams();
    Object.keys(data).forEach(function (key) {
        body.append(key, data[key]);
    });
    return window.fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        credentials: 'same-origin',
        body: body.toString()
    }).then(function (response) {
        if (!response.ok) {
            throw new Error(response.statusText || ('HTTP ' + response.status));
        }
        return response.json();
    });
}

module.exports = {
    show: show,
    hide: hide,
    element: element,
    forEach: forEach,
    Events: Events,
    post: post
};
