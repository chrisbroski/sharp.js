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
