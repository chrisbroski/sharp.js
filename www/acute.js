/*jslint browser: true */

function Acute(success, error, init, validate) {
    'use strict';

    if (!success) {
        success = function success() {
            // re-enable click trigger
        };
    }

    if (!error) {
        error = function error(err) {
            alert(err);
        };
    }

    if (!init) {
        init = function init() {
            // disable click trigger
            // show
        };
    }

    if (!validate) {
        validate = function validate() {
            return true;
        };
    }

    function getFormData(form) {
        var ii, len, formData = [];
        len = form.elements.length;
        for (ii = 0; ii < len; ii = ii + 1) {
            formData.push(form.elements[ii].name + '=' + form.elements[ii].value);
        }
        return formData.join('&');
    }

    function getEventTarget(e) {
        var targ;
        targ = e.target || e.srcElement;
        if (targ.nodeType === 3) { // defeat Safari bug
            targ = targ.parentNode;
        }
        return targ;
    }

    this.ajax = function ajax(el, options) {
        if (!el.tagName) {
            el = document.querySelector(el);
        }
        el.onsubmit = function (e) {
            e.preventDefault();
            var xhr = new XMLHttpRequest(),
                targ = getEventTarget(e),
                verb = 'GET',
                uri = '';

            if (targ.tagName.toLowerCase() === 'form') {
                if (targ.getAttribute('method')) {
                    verb = targ.getAttribute('method');
                }
                if (targ.getAttribute('action')) {
                    uri = targ.getAttribute('action');
                }
            }

            xhr.open(verb, uri, true);

            if (targ.tagName.toLowerCase() === 'form') {
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            }

            xhr.send(getFormData(el));
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    options.success.call(this, xhr);
                }
            };
        };
    };
}
