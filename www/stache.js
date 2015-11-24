/*global Mustache */
/*jslint browser: true */

function Stache() {
    'use strict';

    // cache mustache templates retrieved via Ajax
    var templates = {};

    function replaceHTML(el, template, data) {
        el.innerHTML = Mustache.render(template, data);
    }

    function appendEl(el, template, data, wrapperEl) {
        wrapperEl.innerHTML = Mustache.render(template, data);
        el.appendChild(wrapperEl);
    }

    function getFunctionName(f) {
        return (/^function\s+([\w\$]+)\s*\(/).exec(f.toString())[1];
    }

    function mustacheData(data, processor, formatters) {
        var dataJSON = JSON.parse(data);

        if (processor) {
            dataJSON = processor(dataJSON);
        }

        if (formatters) {
            formatters.forEach(function (formatter) {
                dataJSON[getFunctionName(formatter)] = function () {
                    return function (text, render) {
                        return formatter.call(this, render(text));
                    };
                };
            });
        }

        return dataJSON;
    }

    function getTemplate(el, templateURI, data, callback) {
        var xhr;

        // If we already got this mustache template, get it from cache
        if (templates[templateURI]) {
            callback.call(this, el, templates[templateURI], data);
        } else {
            xhr = new XMLHttpRequest();
            xhr.open('GET', templateURI, true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    templates[templateURI] = xhr.responseText;
                    callback.call(this, el, xhr.responseText, data);
                }
            };
            xhr.send();
        }
    }

    function getData(el, templateURI, dataURI, callback, extra) {
        /*
        possible extra data values
        .processor: a function to manipulate data returned from the dataURI
        .formatters: an array of functions that the mustache template may call
        .datatype: content type of requested data
        */
        var xhr = new XMLHttpRequest(),
            processor,
            formatters,
            datatype = 'application/json';

        if (extra && extra.dataTransform) {
            processor = extra.dataTransform;
        }
        if (extra && extra.formatters) {
            formatters = extra.formatters;
        }
        if (extra && extra.datatype) {
            datatype = extra.datatype;
        }

        xhr.open('GET', dataURI, true);
        xhr.setRequestHeader("Content-Type", datatype);
        xhr.onreadystatechange = function () {
            var data;
            if (xhr.readyState === 4) {
                data = mustacheData(xhr.responseText, processor, formatters);
                getTemplate(el, templateURI, data, callback);
            }
        };
        xhr.send();
    }

    this.rock = function (el, dataURI, template, extra) {
        var xhr;
        if (!el.tagName) {
            el = document.querySelector(el);
        }
        if (template) {
            getData(el, template, dataURI, replaceHTML, extra);
        } else {
            xhr = new XMLHttpRequest();
            xhr.open('GET', dataURI, true);
            xhr.setRequestHeader("Content-Type", "text/pht");
            xhr.onreadystatechange = function () {
                var data;
                if (xhr.readyState === 4) {
                    el.innerHTML = xhr.responseText;
                }
            };
            xhr.send();
        }
    };

    this.grow = function (el, template, data, childWrapper) {
        getData(el, template, data, appendEl, childWrapper);
    };
}
