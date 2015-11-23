/*global define, Mustache, exports */

(function defineMustache(global, factory) {
    'use strict';

    if (typeof exports === 'object' && exports && typeof exports.nodeName !== 'string') {
        factory(exports); // CommonJS
    } else if (typeof define === 'function' && define.amd) {
        define(['exports'], factory); // AMD
    } else {
        global.Mustache = {};
        factory(Mustache); // script, wsh, asp
    }
}(this, function mustacheFactory(mustache) {
    'use strict';

    var objectToString = Object.prototype.toString,
        isArray,
        regExpTest,
        nonSpaceRe = /\S/,
        entityMap,
        whiteRe = /\s*/,
        spaceRe = /\s+/,
        equalsRe = /\s*=/,
        curlyRe = /\s*\}/,
        tagRe = /#|\^|\/|>|\{|&|=|!/,
        defaultWriter;

    isArray = Array.isArray || function isArrayPolyfill(object) {
        return objectToString.call(object) === '[object Array]';
    };

    function isFunction(object) {
        return typeof object === 'function';
    }

    /**
    * More correct typeof string handling array
    * which normally returns typeof 'object'
    */
    function typeStr(obj) {
        return isArray(obj) ? 'array' : typeof obj;
    }

    function escapeRegExp(string) {
        return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
    }

    /**
    * Null safe way of checking whether or not an object,
    * including its prototype, has a given property
    */
    function hasProperty(obj, propName) {
        if (!obj) {
            return false;
        }
        if (typeof obj !== 'object') {
            return false;
        }
        if (obj.hasOwnProperty(propName)) {
            return true;
        }
        return !!obj[propName];
    }

    function isNullish(obj) {
        return (obj === null || obj === undefined);
    }

    // Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
    // See https://github.com/janl/mustache.js/issues/189
    regExpTest = RegExp.prototype.test;
    function testRegExp(re, string) {
        return regExpTest.call(re, string);
    }

    function isWhitespace(string) {
        return !testRegExp(nonSpaceRe, string);
    }

    entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
    };

    /**
    * A simple string scanner that is used by the template parser to find
    * tokens in template strings.
    */
    function Scanner(string) {
        this.string = string;
        this.tail = string;
        this.pos = 0;
    }

    /**
    * Combines the values of consecutive text tokens in the given `tokens` array
    * to a single token.
    */
    function squashTokens(tokens) {
        var squashedTokens = [], token, lastToken, i, numTokens = tokens.length;

        for (i = 0; i < numTokens; i = i + 1) {
            token = tokens[i];

            if (token) {
                if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
                    lastToken[1] += token[1];
                    lastToken[3] = token[3];
                } else {
                    squashedTokens.push(token);
                    lastToken = token;
                }
            }
        }

        return squashedTokens;
    }

    /**
    * Forms the given array of `tokens` into a nested tree structure where
    * tokens that represent a section have two additional items: 1) an array of
    * all tokens that appear in that section and 2) the index in the original
    * template that represents the end of that section.
    */
    function nestTokens(tokens) {
        var nestedTokens = [],
            collector = nestedTokens,
            sections = [],
            token,
            section,
            i,
            numTokens = tokens.length;

        for (i = 0; i < numTokens; i = i + 1) {
            token = tokens[i];

            switch (token[0]) {
            case '#':
            case '^':
                collector.push(token);
                sections.push(token);
                collector = token[4] = [];
                break;
            case '/':
                section = sections.pop();
                section[5] = token[2];
                collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
                break;
            default:
                collector.push(token);
            }
        }

        return nestedTokens;
    }

    function escapeHtml(string) {
        return String(string).replace(/[&<>"'\/]/g, function fromEntityMap(s) {
            return entityMap[s];
        });
    }

    /**
    * Breaks up the given `template` string into a tree of tokens. If the `tags`
    * argument is given here it must be an array with two string values: the
    * opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
    * course, the default is to use mustaches (i.e. mustache.tags).
    *
    * A token is an array with at least 4 elements. The first element is the
    * mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
    * did not contain a symbol (i.e. {{myValue}}) this element is "name". For
    * all text that appears outside a symbol this element is "text".
    *
    * The second element of a token is its "value". For mustache tags this is
    * whatever else was inside the tag besides the opening symbol. For text tokens
    * this is the text itself.
    *
    * The third and fourth elements of the token are the start and end indices,
    * respectively, of the token in the original template.
    *
    * Tokens that are the root node of a subtree contain two more elements: 1) an
    * array of tokens in the subtree and 2) the index in the original template at
    * which the closing tag for that section begins.
    */
    function parseTemplate(template, tags) {
        var sections = [], // Stack to hold section tokens
            tokens = [], // Buffer to hold the tokens
            spaces = [], // Indices of whitespace tokens on the current line
            hasTag = false, // Is there a {{tag}} on the current line?
            nonSpace = false, // Is there a non-space char on the current line?
            openingTagRe,
            closingTagRe,
            closingCurlyRe,
            scanner,
            start,
            type,
            value,
            chr,
            token,
            openSection,
            i,
            valueLength;

        if (!template) {
            return [];
        }

        // Strips all whitespace tokens array for the current line
        // if there was a {{#tag}} on it and otherwise only space.
        function stripSpace() {
            if (hasTag && !nonSpace) {
                while (spaces.length) {
                    delete tokens[spaces.pop()];
                }
            } else {
                spaces = [];
            }

            hasTag = false;
            nonSpace = false;
        }

        function compileTags(tagsToCompile) {
            if (typeof tagsToCompile === 'string') {
                tagsToCompile = tagsToCompile.split(spaceRe, 2);
            }

            if (!isArray(tagsToCompile) || tagsToCompile.length !== 2) {
                throw new Error('Invalid tags: ' + tagsToCompile);
            }

            openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + '\\s*');
            closingTagRe = new RegExp('\\s*' + escapeRegExp(tagsToCompile[1]));
            closingCurlyRe = new RegExp('\\s*' + escapeRegExp('}' + tagsToCompile[1]));
        }

        compileTags(tags || mustache.tags);

        scanner = new Scanner(template);

        while (!scanner.eos()) {
            start = scanner.pos;

            // Match any text between tags.
            value = scanner.scanUntil(openingTagRe);

            valueLength = value.length;
            if (value) {
                for (i = 0; i < valueLength; i = i + 1) {
                    chr = value.charAt(i);

                    if (isWhitespace(chr)) {
                        spaces.push(tokens.length);
                    } else {
                        nonSpace = true;
                    }

                    tokens.push([ 'text', chr, start, start + 1 ]);
                    start += 1;

                    // Check for whitespace on the current line.
                    if (chr === '\n') {
                        stripSpace();
                    }
                }
            }

            // Match the opening tag.
            if (!scanner.scan(openingTagRe)) {
                break;
            }

            hasTag = true;

            // Get the tag type.
            type = scanner.scan(tagRe) || 'name';
            scanner.scan(whiteRe);

            // Get the tag value.
            if (type === '=') {
                value = scanner.scanUntil(equalsRe);
                scanner.scan(equalsRe);
                scanner.scanUntil(closingTagRe);
            } else if (type === '{') {
                value = scanner.scanUntil(closingCurlyRe);
                scanner.scan(curlyRe);
                scanner.scanUntil(closingTagRe);
                type = '&';
            } else {
                value = scanner.scanUntil(closingTagRe);
            }

            // Match the closing tag.
            if (!scanner.scan(closingTagRe)) {
                throw new Error('Unclosed tag at ' + scanner.pos);
            }

            token = [ type, value, start, scanner.pos ];
            tokens.push(token);

            if (type === '#' || type === '^') {
                sections.push(token);
            } else if (type === '/') {
                // Check section nesting.
                openSection = sections.pop();

                if (!openSection) {
                    throw new Error('Unopened section "' + value + '" at ' + start);
                }

                if (openSection[1] !== value) {
                    throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
                }
            } else if (type === 'name' || type === '{' || type === '&') {
                nonSpace = true;
            } else if (type === '=') {
                // Set the tags for the next time around.
                compileTags(value);
            }
        }

        // Make sure there are no open sections when we're done.
        openSection = sections.pop();

        if (openSection) {
            throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);
        }

        return nestTokens(squashTokens(tokens));
    }

    /**
    * Returns `true` if the tail is empty (end of string).
    */
    Scanner.prototype.eos = function eos() {
        return this.tail === '';
    };

    /**
    * Tries to match the given regular expression at the current position.
    * Returns the matched text if it can match, the empty string otherwise.
    */
    Scanner.prototype.scan = function scan(re) {
        var match = this.tail.match(re), string;

        if (!match || match.index !== 0) {
            return '';
        }

        string = match[0];

        this.tail = this.tail.substring(string.length);
        this.pos += string.length;

        return string;
    };

    /**
    * Skips all text until the given regular expression can be matched. Returns
    * the skipped string, which is the entire tail if no match can be made.
    */
    Scanner.prototype.scanUntil = function scanUntil(re) {
        var index = this.tail.search(re), match;

        switch (index) {
        case -1:
            match = this.tail;
            this.tail = '';
            break;
        case 0:
            match = '';
            break;
        default:
            match = this.tail.substring(0, index);
            this.tail = this.tail.substring(index);
        }

        this.pos += match.length;

        return match;
    };

    /**
    * Represents a rendering context by wrapping a view object and
    * maintaining a reference to the parent context.
    */
    function Context(view, parentContext) {
        this.view = view;
        this.cache = { '.': this.view };
        this.parent = parentContext;
    }

    /**
    * Creates a new context using the given view with this context
    * as the parent.
    */
    Context.prototype.push = function push(view) {
        return new Context(view, this);
    };

    /**
    * Returns the value of the given name in this context, traversing
    * up the context hierarchy if the value is absent in this context's view.
    */
    Context.prototype.lookup = function lookup(name) {
        var cache = this.cache, value, context, names, index, lookupHit;

        if (cache.hasOwnProperty(name)) {
            value = cache[name];
        } else {
            context = this;
            lookupHit = false;

            while (context) {
                if (name.indexOf('.') > 0) {
                    value = context.view;
                    names = name.split('.');
                    index = 0;

                    /**
                    * Using the dot notion path in `name`, we descend through the
                    * nested objects.
                    *
                    * To be certain that the lookup has been successful, we have to
                    * check if the last object in the path actually has the property
                    * we are looking for. We store the result in `lookupHit`.
                    *
                    * This is specially necessary for when the value has been set to
                    * `undefined` and we want to avoid looking up parent contexts.
                    **/

                    while (!isNullish(value) && index < names.length) {
                        if (index === names.length - 1) {
                            lookupHit = hasProperty(value, names[index]);
                        }

                        value = value[names[index]];
                        index = index + 1;
                    }
                } else {
                    value = context.view[name];
                    lookupHit = hasProperty(context.view, name);
                }

                if (lookupHit) {
                    break;
                }

                context = context.parent;
            }

            cache[name] = value;
        }

        if (isFunction(value)) {
            value = value.call(this.view);
        }

        return value;
    };

    /**
    * A Writer knows how to take a stream of tokens and render them to a
    * string, given a context. It also maintains a cache of templates to
    * avoid the need to parse the same template twice.
    */
    function Writer() {
        this.cache = {};
    }

    /**
    * Clears all cached templates in this writer.
    */
    Writer.prototype.clearCache = function clearCache() {
        this.cache = {};
    };

    /**
    * Parses and caches the given `template` and returns the array of tokens
    * that is generated from the parse.
    */
    Writer.prototype.parse = function parse(template, tags) {
        var cache = this.cache,
            tokens = cache[template];

        if (isNullish(tokens)) {
            tokens = cache[template] = parseTemplate(template, tags);
        }

        return tokens;
    };

    /**
    * High-level method that is used to render the given `template` with
    * the given `view`.
    *
    * The optional `partials` argument may be an object that contains the
    * names and templates of partials that are used in the template. It may
    * also be a function that is used to load partial templates on the fly
    * that takes a single argument: the name of the partial.
    */
    Writer.prototype.render = function render(template, view, partials) {
        var tokens = this.parse(template),
            context = (view instanceof Context) ? view : new Context(view);
        return this.renderTokens(tokens, context, partials, template);
    };

    /**
    * Low-level method that renders the given array of `tokens` using
    * the given `context` and `partials`.
    *
    * Note: The `originalTemplate` is only ever used to extract the portion
    * of the original template that was contained in a higher-order section.
    * If the template doesn't use higher-order sections, this argument may
    * be omitted.
    */
    Writer.prototype.renderTokens = function renderTokens(tokens, context, partials, originalTemplate) {
        var buffer = '', token, symbol, value, i, numTokens = tokens.length;

        for (i = 0; i < numTokens; i = i + 1) {
            value = undefined;
            token = tokens[i];
            symbol = token[0];

            if (symbol === '#') {
                value = this.renderSection(token, context, partials, originalTemplate);
            } else if (symbol === '^') {
                value = this.renderInverted(token, context, partials, originalTemplate);
            } else if (symbol === '>') {
                value = this.renderPartial(token, context, partials, originalTemplate);
            } else if (symbol === '&') {
                value = this.unescapedValue(token, context);
            } else if (symbol === 'name') {
                value = this.escapedValue(token, context);
            } else if (symbol === 'text') {
                value = this.rawValue(token);
            }

            if (value !== undefined) {
                buffer += value;
            }
        }

        return buffer;
    };

    Writer.prototype.renderSection = function renderSection(token, context, partials, originalTemplate) {
        var self = this,
            buffer = '',
            value = context.lookup(token[1]),
            j,
            valueLength;

        // This function is used to render an arbitrary template
        // in the current context by higher-order sections.
        function subRender(template) {
            return self.render(template, context, partials);
        }

        if (!value) {
            return;
        }

        if (isArray(value)) {
            valueLength = value.length;
            for (j = 0; j < valueLength; j = j + 1) {
                buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate);
            }
        } else if (typeof value === 'object' || typeof value === 'string' || typeof value === 'number') {
            buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate);
        } else if (isFunction(value)) {
            if (typeof originalTemplate !== 'string') {
                throw new Error('Cannot use higher-order sections without the original template');
            }

            // Extract the portion of the original template that the section contains.
            value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);

            if (!isNullish(value)) {
                buffer += value;
            }
        } else {
            buffer += this.renderTokens(token[4], context, partials, originalTemplate);
        }
        return buffer;
    };

    Writer.prototype.renderInverted = function renderInverted(token, context, partials, originalTemplate) {
        var value = context.lookup(token[1]);

        // Use JavaScript's definition of falsy. Include empty arrays.
        // See https://github.com/janl/mustache.js/issues/186
        if (!value || (isArray(value) && value.length === 0)) {
            return this.renderTokens(token[4], context, partials, originalTemplate);
        }
    };

    Writer.prototype.renderPartial = function renderPartial(token, context, partials) {
        if (!partials) {
            return;
        }

        var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
        if (!isNullish(value)) {
            return this.renderTokens(this.parse(value), context, partials, value);
        }
    };

    Writer.prototype.unescapedValue = function unescapedValue(token, context) {
        var value = context.lookup(token[1]);
        if (!isNullish(value)) {
            return value;
        }
    };

    Writer.prototype.escapedValue = function escapedValue(token, context) {
        var value = context.lookup(token[1]);
        if (!isNullish(value)) {
            return mustache.escape(value);
        }
    };

    Writer.prototype.rawValue = function rawValue(token) {
        return token[1];
    };

    mustache.name = 'mustache.js';
    mustache.version = '2.2.0';
    mustache.tags = [ '{{', '}}' ];

    // All high-level mustache.* functions use this writer.
    defaultWriter = new Writer();

    /**
    * Clears all cached templates in the default writer.
    */
    mustache.clearCache = function clearCache() {
        return defaultWriter.clearCache();
    };

    /**
    * Parses and caches the given template in the default writer and returns the
    * array of tokens it contains. Doing this ahead of time avoids the need to
    * parse templates on the fly as they are rendered.
    */
    mustache.parse = function parse(template, tags) {
        return defaultWriter.parse(template, tags);
    };

    /**
    * Renders the `template` with the given `view` and `partials` using the
    * default writer.
    */
    mustache.render = function render(template, view, partials) {
        if (typeof template !== 'string') {
            throw new TypeError('Invalid template! Template should be a "string" but "' + typeStr(template) + '" was given as the first argument for mustache#render(template, view, partials)');
        }

        return defaultWriter.render(template, view, partials);
    };

    // This is here for backwards compatibility with 0.4.x.,
    mustache.to_html = function to_html(template, view, partials, send) {
        var result = mustache.render(template, view, partials);

        if (isFunction(send)) {
            send(result);
        } else {
            return result;
        }
    };

    // Export the escaping function so that the user may override it.
    // See https://github.com/janl/mustache.js/issues/244
    mustache.escape = escapeHtml;

    // Export these mainly for testing, but also for advanced usage.
    mustache.Scanner = Scanner;
    mustache.Context = Context;
    mustache.Writer = Writer;
}));
/*jslint browser: true, regexp: true, continue: true */

function CommentFormat() {
    'use strict';

    function countHash(txt, symb) {
        var len = txt.length, trim = 6;
        if (!txt) {
            return -1;
        }
        if (len < trim) {
            trim = len;
        }
        txt = txt.slice(0, trim);
        return (txt.match(new RegExp(symb, "g")) || []).length;
    }

    function htmlEscape(str) {
        return String(str)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
    }

    function replaceLink(mdLink) {
        var linkText, linkHref = '';
        linkText = mdLink.slice(1, mdLink.indexOf(']('));
        linkHref = mdLink.slice(mdLink.indexOf('](') + 2, -1);
        return '<a href="' + linkHref + '">' + linkText + '</a>';
    }

    function replaceBold(boldMatch) {
        return '<strong>' + boldMatch.slice(2, -2) + '</strong>';
    }

    function replaceItalic(italicMatch) {
        return '<em>' + italicMatch.slice(1, -1) + '</em>';
    }

    function replaceCode(codeMatch) {
        if (codeMatch.slice(0, 2) === '``') {
            return '<code>' + htmlEscape(codeMatch.slice(2, -2)) + '</code>';
        }
        return '<code>' + htmlEscape(codeMatch.slice(1, -1)) + '</code>';
    }

    function replaceInline(txt, reReplace, replacer) {
        var aMatch = txt.match(reReplace), ii, len;
        if (aMatch) {
            len = aMatch.length;
            for (ii = 0; ii < len; ii = ii + 1) {
                txt = txt.replace(aMatch[ii], replacer(aMatch[ii]));
            }
        }
        return txt;
    }

    function blockArray(mdText) {
        var aMd;
        mdText = mdText.replace(/\r\n/g, "\n"); // DOS to Unix
        mdText = mdText.replace(/\r/g, "\n"); // Mac to Unix
        mdText = mdText.replace(/[ ]{2}\n/gi, "<br>"); // replace "  \n" with "<br>"
        mdText = mdText.replace(/<!--[\s\S]*?-->/g, ""); // remove HTML comments
        aMd = mdText.split("\n");
        aMd.push('');
        return aMd;
    }

    this.convert = function convertFromMd(md) {
        var aMd = blockArray(md),
            htmlTmp = '',
            htmlNext = '',
            countTmp = 0,
            openTag = '',
            htmlTag = false,
            blockquote = [0, 0],
            htmlMd = [],
            ii,
            len;
        len = aMd.length;
        for (ii = 0; ii < len - 1; ii = ii + 1) {
            htmlTmp = aMd[ii];
            htmlNext = aMd[ii + 1];
            // block HTML
            if (htmlTmp.slice(0, 1) === '<') {
                htmlTag = true;
            }
            if (htmlTag && htmlTmp.slice(0, 2) === '</') {
                htmlTag = false;
                htmlMd.push(htmlTmp);
                continue;
            }
            if (htmlTag) {
                htmlMd.push(htmlTmp);
                continue;
            }

            // blockquote
            if (htmlTmp.slice(0, 1) === '>') {
                blockquote[1] = countHash(htmlTmp + ' ', '> ');
                htmlTmp = htmlTmp.slice(blockquote[1] * 2);
            } else {
                if (blockquote[0] > 0) {
                    blockquote[1] = 0;
                }
            }

            if (htmlTmp === '' || htmlTmp.slice(0, 1) === '=' || htmlTmp.slice(0, 1) === '-') {
                // close open tags
                if (openTag === 'pre') {
                    htmlTmp = '</code></pre>';
                    openTag = '';
                    htmlMd.push(htmlTmp);
                }
                if (openTag === 'ul') {
                    htmlTmp = '</ul>';
                    openTag = '';
                    htmlMd.push(htmlTmp);
                }
                if (openTag === 'ol') {
                    htmlTmp = '</ol>';
                    openTag = '';
                    htmlMd.push(htmlTmp);
                }
                continue;
            }
            // Block elements
            // h1
            /*if (htmlNext.slice(0, 1) === '=') {
                htmlTmp = '<h1>' + htmlTmp + '</h1>';
            }
            // h2
            if (htmlNext.slice(0, 1) === '-') {
                htmlTmp = '<h2>' + htmlTmp + '</h2>';
            }
            // h3 - h6
            if (htmlTmp.slice(0, 1) === '#') {
                countTmp = countHash(htmlTmp, '#');
                htmlTmp = '<h' + countTmp + '>' + htmlTmp.slice(countTmp) + '</h' + countTmp + '>';
            }*/
            // ul
            if (htmlTmp.slice(0, 2) === '* ' || htmlTmp.slice(0, 2) === '+ ') {
                countTmp = htmlTmp.slice(1).search(/^\s/) + 1;
                if (openTag === 'ul') {
                    htmlTmp = '<li>' + htmlTmp.slice(countTmp);
                } else {
                    openTag = 'ul';
                    htmlTmp = '<ul><li>' + htmlTmp.slice(countTmp);
                }
            }
            // ol
            if (/^\d+\. /.test(htmlTmp)) {
                countTmp = htmlTmp.search(/[^0-9\.\s]\w/);
                if (openTag === 'ol') {
                    htmlTmp = '<li>' + htmlTmp.slice(countTmp);
                } else {
                    openTag = 'ol';
                    htmlTmp = '<ol><li>' + htmlTmp.slice(countTmp);
                }
            }
            // pre
            if (htmlTmp.slice(0, 4) === '    ' || htmlTmp.slice(0, 4) === "\t") {
                // pre
                if (openTag === '') {
                    openTag = 'pre';
                    htmlTmp = '<pre><code>' + htmlEscape(htmlTmp.slice(4));
                } else {
                    htmlTmp = htmlTmp.slice(4);
                }
            } else {
                // p
                if (htmlNext.slice(0, 1) === '' && !openTag) {
                    htmlTmp = '<p>' + htmlTmp;
                }
            }
            // Inline elements
            if (openTag === 'pre') {
                htmlMd.push(htmlTmp);
                continue;
            }
            // image
            //htmlTmp = replaceInline(htmlTmp, /\!\[[^\]]+\]\([^\)]+\)/g, replaceImg);

            // links
            htmlTmp = replaceInline(htmlTmp, /\[[^\]]+\]\([^\)]+\)/g, replaceLink);

            // bold
            htmlTmp = replaceInline(htmlTmp, /\*\*[^\*]+\*\*/g, replaceBold);
            htmlTmp = replaceInline(htmlTmp, /\_\_[^\_]+\_\_/g, replaceBold);

            // italic
            htmlTmp = replaceInline(htmlTmp, /\*[^\*]+\*/g, replaceItalic);
            htmlTmp = replaceInline(htmlTmp, /\_[^\_]+\_/g, replaceItalic);

            // code
            htmlTmp = replaceInline(htmlTmp, /``.+``/g, replaceCode);
            htmlTmp = replaceInline(htmlTmp, /`[^`]+`/g, replaceCode);

            // blockquote wrap
            if (blockquote[1] !== blockquote[0]) {
                if (blockquote[1] > blockquote[0]) {
                    htmlTmp = '<blockquote>' + htmlTmp;
                } else {
                    htmlTmp = '</blockquote>' + htmlTmp;
                }
                blockquote[0] = blockquote[1];
            }
            htmlMd.push(htmlTmp);
        }
        return htmlMd.join("\n");
    };
}
/*global CommentFormat, Mustache */
/*jslint browser: true */

function Stache() {
    'use strict';

    function mdToHtml(md) {
        //var converter = new showdown.Converter();
        //return converter.makeHtml(md);
        var formatter = new CommentFormat();
        return formatter.convert(md);
    }

    function replaceHTML(el, template, data) {
        el.innerHTML = Mustache.render(template, data);
    }

    function appendEl(el, template, data, wrapperEl) {
        wrapperEl.innerHTML = Mustache.render(template, data);
        el.appendChild(wrapperEl);
    }

    function mustacheData(data, processor) {
        var dataJSON = JSON.parse(data);

        if (processor) {
            dataJSON = processor(dataJSON);
        }
        // Add markdown converion function
        dataJSON.sharp = {};
        dataJSON.sharp.commentFormat = function () {
            return function (text, render) {
                return mdToHtml(render(text));
            };
        };

        return dataJSON;
    }

    function getTemplate(el, templateURI, data, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', templateURI, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                callback.call(this, el, xhr.responseText, data);
            }
        };
        xhr.send();
    }

    function getData(el, templateURI, dataURI, callback, extra) {
        var xhr = new XMLHttpRequest(),
            processor;

        if (extra && extra.dataTransform) {
            processor = extra.dataTransform;
        }

        xhr.open('GET', dataURI, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                getTemplate(el, templateURI, mustacheData(xhr.responseText, processor), callback);
            }
        };
        xhr.send();
    }

    function isElement(o) {
        if (o.tagName) {
            return true;
        }
        return false;
    }

    this.rock = function (el, template, data, extra) {
        if (!isElement(el)) {
            el = document.querySelector(el);
        }
        getData(el, template, data, replaceHTML, extra);
    };

    this.grow = function (el, template, data, childWrapper) {
        getData(el, template, data, appendEl, childWrapper);
    };
}
function Acute(success, error, init, validate) {
    'use strict';

    if (!success) {
        success = function () {
            // default success
        };
    }

    if (!error) {
        function defaultError() {
            error = function (err) {
                console.log(err);
            };
        }
    }

    function isElement(o) {
        if (o.tagName) {
            return true;
        }
        return false;
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
        if (!isElement(el)) {
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
        }
    };
}
