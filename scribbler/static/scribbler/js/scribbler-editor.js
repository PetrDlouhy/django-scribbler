/*global require, module, window, document, localStorage, setInterval, clearInterval, setTimeout */

require('codemirror/mode/xml/xml');
require('codemirror/mode/javascript/javascript');
require('codemirror/mode/css/css');
require('codemirror/mode/htmlmixed/htmlmixed');
require('codemirror/addon/display/fullscreen');
require('./djangohint');

var dom = require('./scribbler-dom.js');
var CodeMirror = require('codemirror');

function gettext(text) {
    'use strict';
    if (typeof window.gettext === 'function') {
        return window.gettext(text);
    }
    return text;
}

function ScribbleEditor() {
    'use strict';
    var self = this;
    this.id = 'scribbleEditorContainer';
    this.el = dom.element('div');
    this.el.id = this.id;
    // was $.animate({height: ...}, 500): the stylesheet keeps the container
    // at height 0, so a transition on the inline height does the sliding
    this.el.style.transition = 'height 0.5s';
    this.visible = false;
    this.rendering = false;
    this.errorLine = null;
    this.controls = {};
    this.current = {};
    this.needsSave = false;
    this.needsDraft = false;
    this.scribbles = document.querySelectorAll('.scribble-wrapper.with-controls');
    this.editorOptions = {
        mode: "text/html",
        tabMode: "indent",
        lineNumbers: true,
        extraKeys: {
            "F11": function (cm) {
                cm.setOption("fullScreen", !cm.getOption("fullScreen"));
                if (document.querySelector('.CodeMirror-fullscreen')) {
                    self.el.classList.add("scribbleEditor-fullscreen");
                } else {
                    self.el.classList.remove("scribbleEditor-fullscreen");
                }
            },
            "Esc": function (cm) {
                if (cm.getOption("fullScreen")) {
                    cm.setOption("fullScreen", false);
                }
                dom.forEach(document.querySelectorAll('.scribbleEditor-fullscreen'), function (elem) {
                    elem.classList.remove("scribbleEditor-fullscreen");
                });
            },
            'Tab': 'autocomplete'
        }
    };
    CodeMirror.commands.autocomplete = function (editor) {
        CodeMirror.showHint(editor, CodeMirror.djangoHint);
    };
}

ScribbleEditor.prototype = {
    constructor: ScribbleEditor,
    on: dom.Events.on,
    trigger: dom.Events.trigger,
    render: function () {
        'use strict';
        var self = this;
        if (this.scribbles.length > 0) {
            this.buildControls();
            document.body.appendChild(this.el);
            this.editor = new CodeMirror(document.getElementById(this.id), this.editorOptions);
            this.editor.on("change", function () {
                self.needsSave = true;
                self.controls.save.classList.remove('inactive');
                self.needsDraft = true;
                self.controls.draft.classList.remove('inactive');
                self.submitPreview();
            });
            this.editor.selector = this.id;
            // Bind editor to the scribbles
            dom.forEach(this.scribbles, function (elem) {
                // Bind event handlers for each scribble
                elem.addEventListener('click', function (e) {
                    // Allow click to follow links inside of scribble content
                    if (e.target.nodeName !== 'A') {
                        self.open(elem);
                    }
                });
            });
        }
    },
    buildControls: function () {
        'use strict';
        // Build control bar
        var footerControls = dom.element('div', 'controls');
        // Close button
        this.controls.close = dom.element('a', 'closed', gettext('Close'));
        this.controls.close.title = gettext('Close');
        this.controls.close.addEventListener('click', this.close.bind(this));
        // Save button
        this.controls.save = dom.element('a', 'save inactive', gettext('Save'));
        this.controls.save.title = gettext('Save');
        this.controls.save.addEventListener('click', this.submitSave.bind(this));
        this.controls.draft = dom.element('a', 'draft inactive', gettext('Save Draft'));
        this.controls.draft.title = gettext('Save as Draft');
        this.controls.draft.addEventListener('click', this.createDraft.bind(this));
        this.controls.discard = dom.element('a', 'discard inactive', gettext('Discard'));
        this.controls.discard.title = gettext('Discard Draft');
        this.controls.discard.addEventListener('click', this.deleteDraft.bind(this));
        // Error message
        this.controls.errors = dom.element('span', 'error-msg');
        // Status message
        this.controls.status = dom.element('span', 'status-msg');
        this.controls.status.style.transition = 'opacity 0.5s';
        // Fullscreen instructions
        this.controls.fullscreen = dom.element('div', 'fullscreen',
            gettext('Press ') + '<strong>' + gettext('F11') + '</strong>' +
            gettext(' to enter/exit Fullscreen edit'));
        footerControls.appendChild(this.controls.status);
        footerControls.appendChild(this.controls.errors);
        footerControls.appendChild(this.controls.close);
        footerControls.appendChild(this.controls.discard);
        footerControls.appendChild(this.controls.draft);
        footerControls.appendChild(this.controls.save);
        footerControls.appendChild(this.controls.fullscreen);
        this.el.appendChild(footerControls);
    },
    open: function (scribble) {
        'use strict';
        var self = this;
        if (this.visible) {
            this.close();
        }
        this.current.content = scribble.querySelector('.scribble-content.original');
        this.current.preview = scribble.querySelector('.scribble-content.preview');
        this.current.form = scribble.querySelector('.scribble-form');
        this.current.can_save = this.current.form.dataset.save;
        this.current.can_delete = this.current.form.dataset['delete'];
        dom.show(this.el);
        this.trigger('open');
        if (this.current.can_save) {
            dom.show(this.controls.save);
            this.editor.setOption('readOnly', false);
            this.editor.setValue(this.current.form.querySelector('[name$=content]').value);
            this.restoreDraft();
        } else {
            dom.hide(this.controls.save);
            this.editor.setOption('readOnly', true);
            this.editor.setValue(gettext('You do not have permission to edit this content.'));
        }
        this.el.style.height = '300px';
        setTimeout(function () { self.editor.focus(); }, 500);
        this.visible = true;
        // Start background draft saving
        var checkDraft = function () {
            if (self.needsDraft) {
                self.createDraft();
            }
        };
        this.backgroundDraft = setInterval(checkDraft, 3000);
    },
    close: function () {
        'use strict';
        if (this.current.preview) {
            dom.hide(this.current.preview);
        }
        if (this.current.content) {
            dom.show(this.current.content);
        }
        this.current = {};
        this.editor.setValue('');
        this.el.style.height = '0px';
        this.visible = false;
        if (this.backgroundDraft) {
            clearInterval(this.backgroundDraft);
        }
        this.el.classList.remove("scribbleEditor-fullscreen");
        dom.forEach(document.querySelectorAll('.CodeMirror.cm-s-default'), function (elem) {
            elem.classList.remove("CodeMirror-fullscreen");
            elem.style.height = "";
        });
        this.trigger('close');
    },
    submitPreview: function (force) {
        'use strict';
        var self = this;
        if (this.current.form && (force || (!this.rendering && !this.editor.getOption('readOnly')))) {
            this.rendering = true;
            // Submit the form and display the preview
            dom.post(
                this.current.form.getAttribute('action'),
                this.getFormData()
            ).then(function (response) {
                if (response.valid) {
                    CodeMirror.update_variables(response.variables);
                }
                self.renderPreview(response);
            }).catch(function (error) {
                var msg = 'Server response was "' + error.message + '"';
                self.setError(msg);
            }).then(function () {
                self.rendering = false;
            });
        }
    },
    renderPreview: function (response) {
        'use strict';
        if (this.visible) {
            if (this.errorLine !== null) {
                this.editor.removeLineClass(this.errorLine, "background", "activeline");
            }
            this.controls.errors.innerHTML = '';
            this.valid = response.valid;
            if (response.valid) {
                this.current.preview.innerHTML = response.html;
                dom.show(this.current.preview);
                dom.hide(this.current.content);
                this.controls.save.classList.remove('inactive');
            } else {
                this.setError(response.error.message, response.error.line - 1);
            }
        }
    },
    setError: function (msg, line) {
        'use strict';
        if (typeof line !== 'undefined' && line !== null) {
            this.errorLine = line;
            this.editor.addLineClass(this.errorLine, "background", "activeline");
        }
        this.controls.errors.innerHTML = '<strong>' + gettext('Error:') + '</strong> ' + msg;
        this.valid = false;
        this.controls.save.classList.add('inactive');
    },
    getFormData: function () {
        'use strict';
        var result = {},
            prefix = '',
            self = this;
        if (this.current.form) {
            prefix = this.current.form.dataset.prefix;
            dom.forEach(this.current.form.querySelectorAll('input, select, textarea'), function (input) {
                // jQuery's :input matched nameless elements too, only for
                // getFormData to crash on them -- skip them instead
                var name = input.getAttribute('name');
                var inputName;
                if (!name) {
                    return;
                }
                inputName = name.replace(prefix + '-', '');
                if (inputName === 'content') {
                    result[inputName] = self.editor.getValue();
                } else {
                    result[inputName] = input.value;
                }
            });
        }
        return result;
    },
    submitSave: function () {
        'use strict';
        var self = this;
        if (this.current.form && this.valid) {
            // Submit the form and change current content
            dom.post(
                this.current.form.dataset.save,
                this.getFormData()
            ).then(function (response) {
                self.renderSave(response);
            }).catch(function (error) {
                var msg = gettext('Server response was') + '"' + error.message + '"';
                self.setError(msg);
            });
        }
        this.el.classList.remove("scribbleEditor-fullscreen");
        dom.forEach(document.querySelectorAll('.CodeMirror.cm-s-default'), function (elem) {
            elem.classList.remove("CodeMirror-fullscreen");
            elem.style.height = "";
        });
    },
    renderSave: function (response) {
        'use strict';
        if (response.valid) {
            this.needsSave = false;
            this.controls.save.classList.add('inactive');
            this.current.form.dataset.save = response.url;
            this.current.content.innerHTML = this.current.preview.innerHTML;
            this.current.form.querySelector('[name$=content]').value = this.editor.getValue();
            this.deleteDraft();
            this.close();
        } else if (response.error) {
            this.setError(response.error.message);
        }
    },
    createDraft: function () {
        'use strict';
        var scribble = null,
            path = window.location.pathname,
            slug = '';
        if (this.current.form) {
            scribble = this.editor.getValue();
            slug = this.current.form.dataset.prefix;
            localStorage.setItem(path + slug, scribble);
            this.needsDraft = false;
            this.controls.draft.classList.add('inactive');
            this.controls.discard.classList.remove('inactive');
            this.setStatus(gettext('Draft saved...'));
        }
    },
    restoreDraft: function () {
        'use strict';
        var scribble = null,
            path = window.location.pathname,
            slug = '';
        if (this.current.form) {
            slug = this.current.form.dataset.prefix;
            scribble = localStorage.getItem(path + slug);
            if (scribble) {
                this.editor.setValue(scribble);
                this.submitPreview(true);
                this.needsDraft = false;
                this.controls.draft.classList.add('inactive');
                this.controls.discard.classList.remove('inactive');
                this.setStatus(gettext('Restored content from a draft...'));
            }
        }
    },
    deleteDraft: function () {
        'use strict';
        var path = window.location.pathname,
            slug = '';
        if (this.current.form) {
            this.editor.setValue(this.current.form.querySelector('[name$=content]').value);
            slug = this.current.form.dataset.prefix;
            localStorage.removeItem(path + slug);
            this.needsDraft = true;
            this.controls.draft.classList.remove('inactive');
            this.controls.discard.classList.add('inactive');
            this.setStatus(gettext('Restored original content...'));
        }
    },
    setStatus: function (msg) {
        'use strict';
        var status = this.controls.status;
        // Append status message
        status.style.opacity = '1';
        status.innerHTML = msg;
        // Callback to fade out the message
        setTimeout(function () {
            status.style.opacity = '0';
            setTimeout(function () {
                status.innerHTML = "";
            }, 500);
        }, 2000);
    },
    destroy: function () {
        'use strict';
        if (this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }
};

module.exports = ScribbleEditor;
