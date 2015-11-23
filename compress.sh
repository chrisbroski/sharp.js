#!/bin/bash
# Build all javascript files into one and minify
cat www/mustache.js www/md.js www/stache.js www/acute.js > www/sharp.js
cat www/mustache.js www/md.js www/stache.js www/acute.js > dist/sharp.js
java -jar ~/yuicompressor-2.4.8.jar dist/sharp.js -o dist/sharp.min.js
