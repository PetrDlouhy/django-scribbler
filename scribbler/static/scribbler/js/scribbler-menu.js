/*global require, module, window, document */

var dom = require('./scribbler-dom.js');

function gettext(text) {
    'use strict';
    if (typeof window.gettext === 'function') {
        return window.gettext(text);
    }
    return text;
}

function ScribbleMenu() {
    'use strict';
    this.el = dom.element('div');
    this.el.id = 'scribbleMenuContainer';
    // was $.animate({top: ...}): slide the menu with a transition instead
    this.el.style.transition = 'top 0.2s';
    this.visible = false;
    this.controls = {};
    this.scribbles = document.querySelectorAll('.scribble-wrapper.with-controls');
}

ScribbleMenu.prototype = {
    constructor: ScribbleMenu,
    render: function () {
        'use strict';
        if (this.scribbles.length > 0) {
            this.buildControls();
            this.el.style.top = '-1000px';
            document.body.appendChild(this.el);
            this.close();
        }
    },
    buildControls: function () {
        'use strict';
        // Build control bar
        this.menuControls = dom.element('div', 'control-panel');
        // Open/Close button
        this.controls.tab = dom.element('a', 'tab',
            '<span class="hot-dog"></span><span class="hot-dog"></span><span class="hot-dog"></span>');
        this.controls.tab.title = gettext('Toggle Menu');
        this.controls.tab.addEventListener('click', this.toggle.bind(this));
        // Reveal button
        this.controls.reveal = dom.element('a', 'reveal', gettext('Show all scribbles'));
        this.controls.reveal.title = gettext('Show all scribbles');
        this.controls.reveal.addEventListener('click', this.highlight.bind(this));
        this.menuControls.appendChild(this.controls.reveal);
        this.el.appendChild(this.menuControls);
        this.el.appendChild(this.controls.tab);
    },
    open: function () {
        'use strict';
        this.el.style.top = '0px';
        this.visible = true;
    },
    close: function () {
        'use strict';
        var height = this.menuControls.offsetHeight;
        this.el.style.top = (-1 * (5 + height)) + 'px';
        this.visible = false;
        dom.forEach(this.scribbles, function (elem) {
            elem.classList.remove('highlight');
        });
    },
    toggle: function () {
        'use strict';
        if (this.visible) {
            this.close();
        } else {
            this.open();
        }
    },
    highlight: function () {
        'use strict';
        dom.forEach(this.scribbles, function (elem) {
            elem.classList.add('highlight');
        });
    },
    destroy: function () {
        'use strict';
        if (this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }
};

module.exports = ScribbleMenu;
