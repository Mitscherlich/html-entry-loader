# html-entry-loader

[![npm][npm]][npm-url]
[![node][node]][node-url]
![npm](https://img.shields.io/npm/dw/html-entry-loader.svg)
[![deps][deps]][deps-url]

A webpack loader of using HTML file(s) as entry.

## Webpack Compatibility Notes

This repo is only compatible with `webpack@^5`.

## Usage

To use this loader, you'll need to install `html-entry-loader`:

```shell
# for npm
$ npm install --save-dev html-entry-loader
# for yarn
$ yarn add --dev html-entry-loader
```

Then add the loader and its bundled plugin into your `webpack` config. For example:

**webpack.config.js**

```js
const path = require('path');
const { HtmlEntryPlugin } = require('html-entry-loader');

module.exports = {
  // You can use plugin resolve helper to transform html files into webpack entry object.
  // And glob pattern is also supported.
  entry: HtmlEntryPlugin.resolve('./src/pages/**/*.html', {
    // The context option is used to find entry files and resolve entry name.
    // Absolute path is recommended. `process.cwd()` is used by default.
    context: path.resolve('./src'),
  }),
  output: {
    filename: 'js/[name].[contenthash:8].js',
    path: path.resolve('./dist'),
  },
  module: {
    rules: [
      // If you're using `vue-loader`, be careful `.html` rules must behind `.vue` rules
      // since `VueLoaderPlugin` may try to resolve its loader's use
      {
        test: /\.html$/,
        // You can chain `html-entry-loader` with other loaders.
        use: ['html-entry-loader', 'ejs-plain-loader'],
      },
    ],
  },
  plugins: [
    new HtmlEntryPlugin({
      filename: 'html/[name].html',
      context: path.resolve('./src'),
      sources: {
        urlFilter: (attribute, value) => {
          if (/example\.pdf$/.test(value)) {
            return false;
          }
          return true;
        },
      },
    }),
  ],
};
```

See [example/webpack.config.js](example/webpack.config.js) for more details.

## Options

|           Name            |         Type         |                        Default                        | Description                                                                                                                                                                                                                                                  |
| :-----------------------: | :------------------: | :---------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|      **`filename`**       | `{String\|Function}` |                    `'index.html'`                     | The file to write the HTML to. Defaults to `index.html`. You can specify a subdirectory here too (eg: `assets/admin.html`). The `[name]` placeholder will be replaced with the entry name. Can also be a function e.g. `(entryName) => entryName + '.html'`. |
|     **`publicPath`**      |  `{String\|'auto'}`  |                        `auto`                         | The publicPath used for script and link tags                                                                                                                                                                                                                 |
|       **`minify`**        | `{Boolean\|Object}`  | `true` if `mode` is `'production'`, otherwise `false` | Controls if and in what ways the output should be minified. See [minification](#minification) below for more details.                                                                                                                                        |
|        **`hash`**         |     `{Boolean}`      |                        `false`                        | If `true` then append a unique `webpack` compilation hash to all included scripts and CSS files. This is useful for cache busting                                                                                                                            |
|        **`cache`**        |     `{Boolean}`      |                        `true`                         | Emit the file only if it was changed                                                                                                                                                                                                                         |
|     **`showErrors`**      |     `{Boolean}`      |                        `true`                         | Errors details will be written into the HTML page                                                                                                                                                                                                            |
| **[`sources`](#sources)** | `{Boolean\|Object}`  |                        `true`                         | Enables/Disables sources handling                                                                                                                                                                                                                            |

### `sources`

Type: `Boolean|Object`
Default: `true`

Supported tags and attributes:

- the `src` attribute of the `script` tag
- the `href` attribute of the `link` tag when the `rel` attribute contains `stylesheet`, `icon`, `shortcut icon`, `mask-icon`, `apple-touch-icon`, `apple-touch-icon-precomposed`, `apple-touch-startup-image`, `manifest`, `prefetch`, `preload` or when the `itemprop` attribute is `image`, `logo`, `screenshot`, `thumbnailurl`, `contenturl`, `downloadurl`, `duringmedia`, `embedurl`, `installurl`, `layoutimage`

#### `Boolean`

The `true` value enables processing of all default elements and attributes, the `false` disable processing of all attributes.

#### `Object`

Allows you to specify which tags and attributes to process, filter them, filter urls and process sources starts with `/`.

For example:

**webpack.config.js**

```js
module.exports = {
  plugins: [
    new HtmlEntryPlugin({
      sources: {
        list: [
          // All default supported tags and attributes
          '...',
          {
            tag: 'script',
            attribute: 'src',
            type: 'src',
          },
        ],
        urlFilter: (attribute, value, resourcePath) => {
          // The `attribute` argument contains a name of the HTML attribute.
          // The `value` argument contains a value of the HTML attribute.
          // The `resourcePath` argument contains a path to the loaded HTML file.
          if (/example\.pdf$/.test(value)) {
            return false;
          }
          return true;
        },
      },
    }),
  ],
};
```

#### `list`

Type: `Array`
Default: [supported tags and attributes](#sources).

Allows to setup which tags and attributes to process and how, and the ability to filter some of them.

Using `...` syntax allows you to extend [default supported tags and attributes](#sources).

For example:

**webpack.config.js**

```js
module.exports = {
  plugins: [
    new HtmlEntryPlugin({
      sources: {
        list: [
          // All default supported tags and attributes
          '...',
          {
            // Tag name
            tag: 'link',
            // Attribute name
            attribute: 'href',
            // Type of processing, can only be `src`
            type: 'src',
            // Allow to filter some attributes
            filter: (tag, attribute, attributes, resourcePath) => {
              // The `tag` argument contains a name of the HTML tag.
              // The `attribute` argument contains a name of the HTML attribute.
              // The `attributes` argument contains all attributes of the tag.
              // The `resourcePath` argument contains a path to the loaded HTML file.

              if (/my-html\.html$/.test(resourcePath)) {
                return false;
              }

              if (!/stylesheet/i.test(attributes.rel)) {
                return false;
              }

              if (
                attributes.type &&
                attributes.type.trim().toLowerCase() !== 'text/css'
              ) {
                return false;
              }

              return true;
            },
          },
        ],
      },
    }),
  ],
};
```

If the tag name is not specified it will process all the tags.

> You can use your custom filter to specify html elements to be processed.

```js
module.exports = {
  plugins: [
    new HtmlEntryPlugin({
      sources: {
        list: [
          {
            // Attribute name
            attribute: 'src',
            // Type of processing, can be `src` or `scrset`
            type: 'src',
            // Allow to filter some attributes (optional)
            filter: (tag, attribute, attributes, resourcePath) => {
              // The `tag` argument contains a name of the HTML tag.
              // The `attribute` argument contains a name of the HTML attribute.
              // The `attributes` argument contains all attributes of the tag.
              // The `resourcePath` argument contains a path to the loaded HTML file.

              // choose all HTML tags except img tag
              return tag.toLowerCase() !== 'img';
            },
          },
        ],
      },
    }),
  ],
};
```

Filter can also be used to extend the supported elements and attributes.

For example, filter can help process meta tags that reference assets:

```js
module.exports = {
  plugins: [
    new HtmlEntryPlugin({
      sources: {
        list: [
          {
            tag: 'meta',
            attribute: 'content',
            type: 'src',
            filter: (tag, attribute, attributes, resourcePath) => {
              if (
                attributes.value === 'og:image' ||
                attributes.name === 'twitter:image'
              ) {
                return true;
              }

              return false;
            },
          },
        ],
      },
    }),
  ],
};
```

**Note:** source with a `tag` option takes precedence over source without.

Filter can be used to disable default sources.

For example:

```js
module.exports = {
  plugins: [
    new HtmlEntryPlugin({
      sources: {
        list: [
          '...',
          {
            tag: 'img',
            attribute: 'src',
            type: 'src',
            filter: () => false,
          },
        ],
      },
    }),
  ],
};
```

#### `urlFilter`

Type: `Function`
Default: `undefined`

Allow to filter urls. All filtered urls will not be resolved (left in the code as they were written).
All non requestable sources (for example `<img src="javascript:void(0)">`) do not handle by default.

```js
module.exports = {
  plugins: [
    new HtmlEntryPlugin({
      sources: {
        urlFilter: (attribute, value, resourcePath) => {
          // The `attribute` argument contains a name of the HTML attribute.
          // The `value` argument contains a value of the HTML attribute.
          // The `resourcePath` argument contains a path to the loaded HTML file.

          if (/example\.pdf$/.test(value)) {
            return false;
          }

          return true;
        },
      },
    }),
  ],
};
```

## Minification

If the `minify` option is set to `true` (the default when webpack's `mode` is `'production'`),
the generated HTML will be minified using [html-minifier-terser](https://github.com/DanielRuf/html-minifier-terser)
and the following options:

```js
{
  collapseWhitespace: true,
  keepClosingSlash: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true
}
```

To use custom [html-minifier options](https://github.com/DanielRuf/html-minifier-terser#options-quick-reference)
pass an object to `minify` instead. This object will not be merged with the defaults above.

To disable minification during production mode set the `minify` option to `false`.

## License

[MIT](LICENSE).

[npm]: https://img.shields.io/npm/v/html-entry-loader.svg
[npm-url]: https://npmjs.com/package/html-entry-loader
[node]: https://img.shields.io/node/v/html-entry-loader.svg
[node-url]: https://nodejs.org
[deps]: https://david-dm.org/Mitscherlich/html-entry-loader.svg
[deps-url]: https://david-dm.org/Mitscherlich/html-entry-loader
