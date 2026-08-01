/*
 * django-scribbler
 * Source: https://github.com/caktus/django-scribbler
 * Docs: http://django-scribbler.readthedocs.org/
 *
 * Copyright 2012-2016, Caktus Consulting Group, LLC
 * BSD License
 *
*/

/*global require */
var ScribbleMenu = require('./scribbler-menu.js');
var ScribbleEditor = require('./scribbler-editor.js');

function init() {
    'use strict';
    var editor = new ScribbleEditor(),
        menu = new ScribbleMenu();
    editor.on("open", menu.close, menu);
    editor.render();
    menu.render();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
