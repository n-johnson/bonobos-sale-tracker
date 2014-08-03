/*
 * app.js - main app
 * Author: Nathan Johnson
 * Date: July 31, 2014
 * License: MIT License
 */

var Bonobos = require('./lib/Bonobos')(),
    express = require('express'),
    app = express();

//Express Middleware
var compress = require('compression')(),
    LimitMiddleware = require('./lib/RateLimiter');

app.use(compress); //GZIP compression. sales.json: 499 KB -> 41.7 KB

app.get('/', LimitMiddleware, function(req, res) {
    return res.status(200).json({
        success: 1
    });
});

app.get('/unlisted.json', LimitMiddleware, function(req, res) {
    if (Bonobos.unlistedSales) { //Data already processed, return immediatley
        return res.status(200).json(Bonobos.unlistedSales);
    } else {
        console.log('Data not loaded for some reason, trying to force load it');
        Bonobos.forceLoadUnlisted(function(err, unlisted) {
            if (err)
                return res.status(500).send(json({
                    error: "Server error, try again later."
                }));
            return res.status(200).json(unlisted);
        });
    }
});

app.get('/sales.json', LimitMiddleware, function(req, res) {
    if (Bonobos.completeSalesList) { //Data already processed, return immediatley
        res.status(200).json(Bonobos.completeSalesList);
    } else {
        console.log('Data not loaded yet, trying to force load it.');
        Bonobos.forceLoadUnlisted(function(err, unlisted) {
            if (err)
                return res.status(500).send(json({
                    error: "Server error, try again later."
                }));
            return res.status(200).json(Bonobos.completeSalesList);
        });
    }
});

Bonobos.start(); //Load data from bonobos if it isn't already loaded.

app.listen(4000, function() {
    console.log('Express server listening on port 4000');
});