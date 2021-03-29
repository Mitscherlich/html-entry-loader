const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { VueLoaderPlugin } = require('vue-loader');
const { HtmlEntryPlugin } = require('html-entry-loader');

const r = (...paths) => path.resolve(__dirname, ...paths);

module.exports = {
  mode: 'development',
  entry: HtmlEntryPlugin.resolve(r('./**/*.html'), {
    context: r('.'),
  }),
  output: {
    filename: 'js/[name].[contenthash:8].js',
    path: r('./dist'),
    publicPath: '/',
  },
  devServer: {
    contentBase: r('./dist'),
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        use: ['vue-loader'],
      },
      {
        test: /\.html$/,
        use: ['html-entry-loader'],
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.less$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'less-loader'],
      },
      {
        test: /\.(jpe?g|png|bmp|gif|svg)/i,
        loader: 'url-loader',
        options: {
          name: 'images/[name].[contenthash:8].[ext]',
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': r('.'),
    },
  },
  resolveLoader: {
    alias: {
      'html-entry-loader': require.resolve('..'),
    },
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlEntryPlugin({
      context: r('.'),
      sources: {
        urlFilter: (url) => !/\/vendor\//.test(url),
      },
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash:8].css',
    }),
  ],
};
