/*jslint node: true, nomen: true */

var fs = require('fs'),
    express = require('express'),
    bodyParser = require('body-parser'),
    mustache = require('Mustache'),
    app = express(),
    commentData = __dirname + '/comments.json',
    templates = {};

app.use('/', express.static(__dirname + '/www'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

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

app.get('/api/comment(/)?(:id)?', function (req, res) {
    'use strict';
    fs.readFile(commentData, function (err, data) {
        var commentTemplate = templates.comments;

        if (err) {
            console.error(err);
            process.exit(1);
        }

        data = JSON.parse(data);
        if (req.params.id) {
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
        }

        res.setHeader('Cache-Control', 'max-age=0,no-cache,no-store,post-check=0,pre-check=0');

        if (req.headers['content-type'] === 'application/json') {
            res.json(data);
        } else if (req.headers['content-type'] === 'text/pht') {
            res.setHeader('content-type', 'text/pht');
            res.end(mustache.render(templates.partialComment, data), 'utf-8');
        } else {
            res.setHeader('content-type', 'text/html');
            res.end(mustache.render(commentTemplate, data), 'utf-8');
        }
    });
});

function validate(req, res) {
    'use strict';

    // Author is required
    if (!req.body.author) {
        res.statusCode = 400;
        res.setHeader('content-type', 'text/plain');
        res.end('Author name is required', 'utf-8');
        return false;
    }

    // body text is required
    if (!req.body.text) {
        res.statusCode = 400;
        res.setHeader('content-type', 'text/plain');
        res.end('Comment message is required', 'utf-8');
        return false;
    }
    return true;
}

app.post('/api/comment', function (req, res) {
    'use strict';
    fs.readFile(commentData, function (err, data) {
        var comments, newComment;
        if (err) {
            console.error(err);
            process.exit(1);
        }
        comments = JSON.parse(data);
        if (!validate(req, res)) {
            return;
        }

        newComment = {
            id: Date.now(),
            author: req.body.author,
            text: req.body.text,
        };

        comments.push(newComment);
        fs.writeFile(commentData, JSON.stringify(comments, null, 4), function (err) {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            res.setHeader('Cache-Control', 'no-cache');
            res.json(comments);
        });
    });
});

loadFiles();

app.listen(51000, function () {
    'use strict';
    console.log('Server started: http://localhost:51000/');
});
