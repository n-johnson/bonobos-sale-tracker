/*
 * RateLimiter.js - Express RateLimiter
 * Author: Nathan Johnson
 * Date: July 31, 2014
 * License: MIT License
 */

var redis = require("redis"),
    client = redis.createClient(),
    RateLimiter = require('ratelimiter');

var LimitMiddleware = function(req, res, next) {
    var ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.connection.remoteAddress;
    var limit = new RateLimiter({
        'id': ip,
        'db': client,
        'duration': 60000, // Max 20 requests per 1 minute
        'max': 20
    });

    limit.get(function(err, limit) {
        if (err)
            return next(err);

        console.log('remaining %s/%s %s', limit.remaining, limit.total, ip);

        if (limit.remaining) //NOT throttled
            return next();

        var delta = (limit.reset * 1000) - Date.now() | 0;
        var after = limit.reset - (Date.now() / 1000) | 0;
        res.set('Retry-After', after);
        res.status(400).json({
            limit: true
        });
    });
};

module.exports = LimitMiddleware;