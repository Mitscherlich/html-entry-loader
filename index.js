'use strict';

const loader = require('./lib');
const plugin = require('./lib/plugin');

module.exports = loader;

module.exports.pitch = loader.pitch;

module.exports.HtmlEntryPlugin = plugin;
