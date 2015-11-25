/*jslint node: true */

var http = require('http'),
    fs = require('fs'),
    mustache = require('Mustache'),
    qs = require('querystring'),
    commentData = 'comments.json',
    templates = {},
    server;

function loadFiles() {
    'use strict';
    console.log('Loading mustache templates...');

    /*jslint stupid: true */
    templates.comments = fs.readFileSync('comments.html.mustache', 'utf-8');
    templates.comment = fs.readFileSync('comment.html.mustache', 'utf-8');
    templates.partialComment = fs.readFileSync('comment.pht.mustache', 'utf-8');

    // if data file doesn't exist, create it
    if (!fs.existsSync(commentData)) {
        fs.writeFileSync(commentData, "[\n]", 'utf-8');
    }
    /*jslint stupid: false */
}

function validate(res, body) {
    'use strict';

    // Author is required
    if (!body.author) {
        res.statusCode = 400;
        res.setHeader('content-type', 'text/plain');
        res.end('Author name is required', 'utf-8');
        return false;
    }

    // body text is required
    if (!body.text) {
        res.statusCode = 400;
        res.setHeader('content-type', 'text/plain');
        res.end('Comment message is required', 'utf-8');
        return false;
    }
    return true;
}

function get(req, res) {
    'use strict';
    fs.readFile(commentData, function (err, data) {
        var commentTemplate = templates.comments;

        if (err) {
            console.error(err);
            process.exit(1);
        }

        data = JSON.parse(data);
        /*if (req.params.id) {
            data = data.filter(function (c) {
                if (c.id === parseInt(req.params.id, 10)) {
                    return true;
                }
                return false;
            });

            if (data.length < 1) {
                res.statusCode = 404;
                res.setHeader('content-type', 'text/plain');
                res.end('Comment #' + req.params.id + ' not found', 'utf-8');
                return;
            }
            commentTemplate = templates.comment;
        }*/

        res.setHeader('Cache-Control', 'max-age=0,no-cache,no-store,post-check=0,pre-check=0');

        if (req.headers['content-type'] === 'application/json') {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(data));
        } else if (req.headers['content-type'] === 'text/pht') {
            res.setHeader('content-type', 'text/pht');
            res.end(mustache.render(templates.partialComment, data), 'utf-8');
        } else {
            res.setHeader('content-type', 'text/html');
            res.end(mustache.render(commentTemplate, data), 'utf-8');
        }
    });
}

function post(res, body) {
    'use strict';
    fs.readFile(commentData, function (err, data) {
        var comments, newComment;
        if (err) {
            console.error(err);
            process.exit(1);
        }
        comments = JSON.parse(data);
        if (!validate(res, body)) {
            return;
        }

        newComment = {
            id: Date.now(),
            author: body.author,
            text: body.text,
        };

        comments.push(newComment);
        fs.writeFile(commentData, JSON.stringify(comments, null, 4), function (err) {
            if (err) {
                console.error(err);
                process.exit(1);
            }

            res.writeHead(201, {'content-type': 'text/plain'});
            res.end('Comment #' + newComment.id + ' added', 'utf-8');
        });
    });
}

function routeMethods(req, res, body) {
    'use strict';
    var method = req.method.toUpperCase(), reqBody;

    if (method === 'POST') {
        // if content-type is multipart form data, parse it
        reqBody = qs.parse(body);
        if (reqBody.method) {
            method = reqBody.method;
        }
    }

    if (req.method === 'GET') {
        get(req, res);
    } else if (req.method === 'POST') {
        post(res, reqBody);
    } else {
        res.writeHead(405, {'Content-Type': 'text/plain'});
        res.end('Method not allowed');
    }
}

function main(req, res) {
    'use strict';
    var body = [];

    req.on('error', function (err) {
        console.error(err);
    }).on('data', function (chunk) {
        body.push(chunk);
    }).on('end', function () {
        body = Buffer.concat(body).toString();

        res.on('error', function (err) {
            console.error(err);
        });

        routeMethods(req, res, body);
    });
}

loadFiles();

server = http.createServer(main).listen(51001, function () {
    'use strict';
    console.log('Server running on port 51001');
});
