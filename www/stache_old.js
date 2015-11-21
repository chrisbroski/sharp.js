function mdToHtml(md) {
    var converter = new showdown.Converter();
    return converter.makeHtml(md);
}

function md(t) {return 'markdown';}

/* Start 'Stache code */
function Stache() {
    'use strict';

    function replaceHTML(el, template, data) {
        el.innerHTML = Mustache.render(template, data);
    }

    function appendEl(el, template, data, wrapperEl) {
        wrapperEl.innerHTML = Mustache.render(template, data);
        el.appendChild(wrapperEl);
    }

    function mustacheData(data) {
        var dataJSON = JSON.parse(data);
        dataJSON.forEach(function (d) {
            console.log(d);
            Object.keys(d).forEach(function (k) {
                console.log(k);
                console.log(k.slice(0, 2));
                if (k.slice(0, 3) === 'md_') {
                    //console.log('md found');
                    d[k] = mdToHtml(d[k]);
                }
            });
        });
        return dataJSON;
    }

    function getTemplate(el, templateURI, data, callback, extra) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', templateURI, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                callback.call(this, el, xhr.responseText, data, extra);
            }
        };
        xhr.send();
    }

    function getData(el, templateURI, dataURI, callback, extra) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', dataURI, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                getTemplate(el, templateURI, mustacheData(xhr.responseText), callback, extra);
            }
        };
        xhr.send();
    }

    this.rock = function (el, template, data) {
        getData(el, template, data, replaceHTML);
    };

    this.grow = function (el, template, data, childWrapper) {
        getData(el, template, data, appendEl, childWrapper);
    };
}
