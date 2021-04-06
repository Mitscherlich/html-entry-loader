// Import typings
/** @typedef {import('webpack/lib/Compiler')} WebpackCompiler */
/** @typedef {import('webpack/lib/Compilation')} WebpackCompilation */
/** @typedef {import('./plugin').Options} HtmlEntryPluginOptions */
/** @typedef {import('./plugin').ProcessedOptions} ProcessedHtmlEntryPluginOptions */
/** @typedef {import('./plugin').ResolveOptions} HtmlEntryPluginResolveOption */

import glob from 'glob';
import qs from 'querystring';
import url from 'url';
import path from 'path';
import { deprecate } from 'util';
import { createContext, Script } from 'vm';
import { isPlainObject, isArray, uniq } from 'lodash';
import { minify } from 'html-minifier-terser';
import BasicEffectRulePlugin from 'webpack/lib/rules/BasicEffectRulePlugin';
import BasicMatcherRulePlugin from 'webpack/lib/rules/BasicMatcherRulePlugin';
import DescriptionDataMatcherRulePlugin from 'webpack/lib/rules/DescriptionDataMatcherRulePlugin';
import RuleSetCompiler from 'webpack/lib/rules/RuleSetCompiler';
import UseEffectRulePlugin from 'webpack/lib/rules/UseEffectRulePlugin';
import { getCompilationHooks } from 'webpack/lib/NormalModule';
import { CachedChildCompilation } from './child-compiler';
import { PrettyError } from './errors';
import { getHtmlEntryPluginHooks } from './hooks';
import {
  createHtmlTagObject,
  htmlTagObjectToString,
  HtmlTagArray,
} from './html-tag';
import { isProductionLike } from './utils';
import { version } from '../package.json';

const NS = 'html-entry-loader';

const ruleSetCompiler = new RuleSetCompiler([
  new BasicMatcherRulePlugin('test', 'resource'),
  new BasicMatcherRulePlugin('mimetype'),
  new BasicMatcherRulePlugin('dependency'),
  new BasicMatcherRulePlugin('include', 'resource'),
  new BasicMatcherRulePlugin('exclude', 'resource', true),
  new BasicMatcherRulePlugin('conditions'),
  new BasicMatcherRulePlugin('resource'),
  new BasicMatcherRulePlugin('resourceQuery'),
  new BasicMatcherRulePlugin('resourceFragment'),
  new BasicMatcherRulePlugin('realResource'),
  new BasicMatcherRulePlugin('issuer'),
  new BasicMatcherRulePlugin('compiler'),
  new DescriptionDataMatcherRulePlugin(),
  new BasicEffectRulePlugin('type'),
  new BasicEffectRulePlugin('sideEffects'),
  new BasicEffectRulePlugin('parser'),
  new BasicEffectRulePlugin('resolve'),
  new BasicEffectRulePlugin('generator'),
  new UseEffectRulePlugin(),
]);

class HtmlEntryPlugin {
  /** @param {HtmlEntryPluginOptions} options */
  constructor(options = {}) {
    this.userOptions = options;
    this.version = version;
  }

  /** @param {WebpackCompiler} compiler */
  apply(compiler) {
    compiler.hooks.initialize.tap('HtmlEntryPlugin', () => {
      const userOptions = this.userOptions;

      // Default options
      /** @type {ProcessedHtmlEntryPluginOptions} */
      const defaultOptions = {
        templateParameters: templateParametersGenerator,
        filename: '[name].html',
        publicPath: 'auto',
        context: compiler.context,
        hash: false,
        inject: userOptions.scriptLoading === 'blocking' ? 'body' : 'head',
        scriptLoading: 'blocking',
        minify: 'auto',
        cache: true,
        showErrors: true,
        meta: {},
        base: false,
      };

      /** @type {ProcessedHtmlEntryPluginOptions} */
      const options = Object.assign(defaultOptions, userOptions);

      // entryName to fileName conversion function
      const userOptionFilename = options.filename;
      const filenameFunction =
        typeof userOptionFilename === 'function'
          ? userOptionFilename
          : // Replace '[name]' with entry name
            (entryName) => userOptionFilename.replace(/\[name\]/g, entryName);

      // Output filenames for the given entry names
      const entryNames = Object.keys(compiler.options.entry);
      const outputFilenames = new Map(
        (entryNames.length ? entryNames : ['index']).map((entryName) => [
          entryName,
          filenameFunction(entryName),
        ])
      );

      const entryOptions = Array.from(outputFilenames.entries()).map(
        ([entryName, filename]) => ({
          ...options,
          template: `${entryName}.html`,
          chunks: [entryName],
          filename,
        })
      );

      // Hook all options into the webpack compiler
      entryOptions.forEach((instanceOptions) => {
        hookIntoCompiler(compiler, instanceOptions, this);
      });
    });

    // add NS marker so that the loader can detect and report missing plugin
    compiler.hooks.compilation.tap(
      'HtmlEntryPlugin',
      /** @param {WebpackCompilation} */
      (compilation) => {
        const { loader: normalModuleLoader } = getCompilationHooks(compilation);
        normalModuleLoader.tap('HtmlEntryPlugin', (loaderContext) => {
          loaderContext[NS] = true;
        });
      }
    );

    const rules = compiler.options.module.rules;
    let rawHtmlRules;
    let htmlRules = [];

    for (const rawRule of rules) {
      // skip the `include` check when locating the html rule
      const clonedRawRule = Object.assign({}, rawRule);
      delete clonedRawRule.include;

      const ruleSet = ruleSetCompiler.compile([
        {
          rules: [clonedRawRule],
        },
      ]);
      htmlRules = ruleSet.exec({
        resource: 'foo.html',
      });

      if (htmlRules.length > 0) {
        rawHtmlRules = rawRule;
        break;
      }
    }

    if (!htmlRules.length) {
      throw new Error(
        '[HtmlEntryPlugin Error] No matching rule for .vue files found.\n' +
          'Make sure there is at least one root-level rule that matches .html files.'
      );
    }

    // get the normalized "use" for html files
    const htmlUse = htmlRules
      .filter((rule) => rule.type === 'use')
      .map((rule) => rule.value);

    // get html-entry-loader options
    const htmlEntryLoaderUseIndex = htmlUse.findIndex((u) => {
      return /^html-entry-loader/.test(u.loader);
    });

    if (htmlEntryLoaderUseIndex < 0) {
      throw new Error(
        `[HtmlEntryPlugin Error] No matching use for html-entry-loader is found.\n` +
          `Make sure the rule matching .html files include html-entry-loader in its use.`
      );
    }

    // make sure html-entry-loader options has a known ident so that we can share
    // options by reference in the template-loader by using a ref query like
    // template-loader??html-entry-options
    const htmlEntryLoaderUse = htmlUse[htmlEntryLoaderUseIndex];
    htmlEntryLoaderUse.ident = 'html-entry-options';
    htmlEntryLoaderUse.options = Object.assign(
      htmlEntryLoaderUse.options || {},
      {
        sources: this.userOptions.sources,
        cacheDirectory: this.userOptions.cacheDirectory,
        cacheIdentifier: this.userOptions.cacheIdentifier,
      }
    );

    // fix conflict with config.loader and config.options when using config.use
    delete rawHtmlRules.loader;
    delete rawHtmlRules.options;
    rawHtmlRules.use = htmlUse;
  }

  /**
   * Once webpack is done with compiling the template into a NodeJS code this function
   * evaluates it to generate the html result
   *
   * The evaluateCompilationResult is only a class function to allow spying during testing.
   * Please change that in a further refactoring
   *
   * @param {string} source
   * @param {string} templateFilename
   * @returns {Promise<string | (() => string | Promise<string>)>}
   */
  evaluateCompilationResult(source, publicPath, templateFilename) {
    if (!source) {
      return Promise.reject(
        new Error("The child compilation didn't provide a result")
      );
    }
    // The LibraryTemplatePlugin stores the template result in a local variable.
    // By adding it to the end the value gets extracted during evaluation
    if (source.indexOf('HTML_ENTRY_PLUGIN_RESULT') >= 0) {
      source += ';\nHTML_ENTRY_PLUGIN_RESULT';
    }
    const templateWithoutLoaders = templateFilename
      .replace(/^.+!/, '')
      .replace(/\?.+$/, '');
    const vmContext = createContext({
      ...global,
      HTML_ENTRY_PLUGIN: true,
      require,
      htmlEntryPluginPublicPath: publicPath,
      URL: url.URL,
      __filename: templateWithoutLoaders,
    });
    const vmScript = new Script(source, {
      filename: templateWithoutLoaders,
    });
    // Evaluate code and cast to string
    let newSource;
    try {
      newSource = vmScript.runInContext(vmContext);
    } catch (e) {
      return Promise.reject(e);
    }
    if (
      typeof newSource === 'object' &&
      newSource.__esModule &&
      newSource.default
    ) {
      newSource = newSource.default;
    }
    return typeof newSource === 'string' || typeof newSource === 'function'
      ? Promise.resolve(newSource)
      : Promise.reject(
          new Error(
            `The loader "${templateWithoutLoaders}" didn't return html.`
          )
        );
  }
}

/**
 * connect the HtmlEntryPlugin to the webpack compiler lifecycle hooks
 *
 * @param {WebpackCompiler} compiler
 * @param {ProcessedHtmlEntryPluginOptions} options
 * @param {HtmlEntryPlugin} plugin
 */
function hookIntoCompiler(compiler, options, plugin) {
  const webpack = compiler.webpack;
  // Instance variables to keep caching information
  // for multiple builds
  let assetJson;
  /**
   * store the previous generated asset to emit them even if the content did not change
   * to support watch mode for third party plugins like the clean-webpack-plugin or the compression plugin
   * @type {Array<{html: string, name: string}>}
   */
  let previousEmittedAssets = [];

  options.template = getFullTemplatePath(options.template, options.context);

  // Inject child compiler plugin
  const childCompilerPlugin = new CachedChildCompilation(compiler);
  childCompilerPlugin.addEntry(options.template);

  // convert absolute filename into relative so that webpack can
  // generate it at correct location
  const filename = options.filename;
  if (path.resolve(filename) === path.normalize(filename)) {
    /** @type {string} - Once initialized the path is always a string */
    const outputPath = compiler.options.output.path;
    options.filename = path.normalize(outputPath, filename);
  }

  const isProductionLikeMode = isProductionLike(compiler.options);

  const useMinify = options.minify;
  if (useMinify === true || (useMinify === 'auto' && isProductionLikeMode)) {
    /** @type {import('html-minifier-terser').Options} */
    options.minify = {
      // https://www.npmjs.com/package/html-minifier-terser#options-quick-reference
      collapseWhitespace: true,
      keepClosingSlash: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
    };
  }

  compiler.hooks.thisCompilation.tap(
    'HtmlEntryPlugin',
    /**
     * Hook into the webpack compilation
     * @param {WebpackCompilation} compilation
     */
    (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: 'HtmlEntryPlugin',
          // Generate the html after minification and dev tooling is done
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE,
        },
        /**
         * Hook into the process assets hook
         * @param {WebpackCompilation} compilationAssets
         * @param {(err?: Error) => void} callback
         */
        (_compilationAssets, callback) => {
          // Get all entry point names for this html file
          const entryNames = Array.from(compilation.entrypoints.keys());
          const filteredEntryNames = filterChunks(entryNames, options.chunks);

          const templateResult = childCompilerPlugin.getCompilationEntryResult(
            options.template
          );

          if ('error' in templateResult) {
            compilation.errors.push(
              new PrettyError(templateResult.error, compiler.context).toString()
            );
          }

          // If the child compilation was not executed during a previous main compile run
          // it is a cached result
          const isCompilationCached =
            templateResult.mainCompilationHash !== compilation.hash;

          // The public path used inside the html file
          const htmlPublicPath = getPublicPath(
            compilation,
            options.filename,
            options.publicPath
          );

          // Generated file paths from the entry point names
          const assets = getHtmlEntryPluginAssets(
            compilation,
            filteredEntryNames,
            htmlPublicPath
          );

          // If the template and the assets did not change we don't have to emit the html
          const newAssetJson = JSON.stringify(getAssetFiles(assets));
          if (
            isCompilationCached &&
            options.cache &&
            assetJson === newAssetJson
          ) {
            previousEmittedAssets.forEach(({ name, html }) => {
              compilation.emitAsset(
                name,
                new webpack.sources.RawSource(html, false)
              );
            });
            return callback();
          } else {
            previousEmittedAssets = [];
            assetJson = newAssetJson;
          }

          // The HtmlEntryPlugin uses a object representation for the html-tags which will be injected
          // to allow altering them more easily
          // Just before they are converted a third-party-plugin author might change the order and content
          const assetsPromise = getHtmlEntryPluginHooks(
            compilation
          ).beforeAssetTagGeneration.promise({
            assets,
            outputName: options.filename,
            plugin,
          });

          // Turn the js and css paths into grouped HtmlTagObjects
          const assetTagGroupsPromise = assetsPromise
            // And allow third-party-plugin authors to reorder and change the assetTags before they are grouped
            .then(({ assets }) =>
              getHtmlEntryPluginHooks(compilation).alterAssetTags.promise({
                assetTags: {
                  scripts: generatedScriptTags(assets.js),
                  styles: generateStyleTags(assets.css),
                  meta: [
                    ...generateBaseTag(options.base),
                    ...generatedMetaTags(options.meta),
                    ...generateFaviconTags(assets.favicon),
                  ],
                },
                outputName: options.filename,
                publicPath: htmlPublicPath,
                plugin,
              })
            )
            .then(({ assetTags }) => {
              // Inject scripts to body unless it set explicitly to head
              const scriptTarget =
                options.inject === 'head' ||
                (options.inject !== 'body' &&
                  options.scriptLoading !== 'blocking')
                  ? 'head'
                  : 'body';
              // Group assets to `head` and `body` tag arrays
              const assetGroups = generateAssetGroups(assetTags, scriptTarget);
              // Allow third-party-plugin authors to reorder and change the assetTags once they are grouped
              return getHtmlEntryPluginHooks(
                compilation
              ).alterAssetTagGroups.promise({
                headTags: assetGroups.headTags,
                bodyTags: assetGroups.bodyTags,
                outputName: options.filename,
                publicPath: htmlPublicPath,
                plugin,
              });
            });

          // Turn the compiled template into a nodejs function or into a nodejs string
          const templateEvaluationPromise = Promise.resolve().then(() => {
            if ('error' in templateResult) {
              return options.showErrors
                ? new PrettyError(
                    templateResult.error,
                    compiler.context
                  ).toHtml()
                : 'ERROR';
            }
            // Once everything is compiled evaluate the html factory
            // and replace it with its content
            return 'compiledEntry' in templateResult
              ? plugin.evaluateCompilationResult(
                  templateResult.compiledEntry.content,
                  htmlPublicPath,
                  options.template
                )
              : Promise.reject(
                  new Error('Child compilation contained no compiledEntry')
                );
          });
          // Execute the template
          const templateExecutionPromise = Promise.all([
            assetsPromise,
            assetTagGroupsPromise,
            templateEvaluationPromise,
          ]).then(([assetsHookResult, assetTags, compilationResult]) =>
            typeof compilationResult !== 'function'
              ? compilationResult
              : executeTemplate(
                  compilationResult,
                  assetsHookResult.assets,
                  {
                    headTags: assetTags.headTags,
                    bodyTags: assetTags.bodyTags,
                  },
                  compilation
                )
          );

          const injectedHtmlPromise = Promise.all([
            assetTagGroupsPromise,
            templateExecutionPromise,
          ])
            // Allow plugins to change the html before assets are injected
            .then(([assetTags, html]) => {
              const pluginArgs = {
                html,
                headTags: assetTags.headTags,
                bodyTags: assetTags.bodyTags,
                plugin,
                outputName: options.filename,
              };
              return getHtmlEntryPluginHooks(
                compilation
              ).afterTemplateExecution.promise(pluginArgs);
            })
            .then(({ html, headTags, bodyTags }) => {
              return postProcessHtml(html, assets, { headTags, bodyTags });
            });

          const emitHtmlPromise = injectedHtmlPromise
            // Allow plugins to change the html after assets are injected
            .then((html) => {
              const pluginArgs = {
                html,
                plugin,
                outputName: options.filename,
              };
              return getHtmlEntryPluginHooks(compilation)
                .beforeEmit.promise(pluginArgs)
                .then(({ html }) => html);
            })
            .catch((err) => {
              // In case anything went wrong the promise is resolved
              // with the error message and an error is logged
              compilation.errors.push(
                new PrettyError(err, compiler.context).toString()
              );
              return options.showErrors
                ? new PrettyError(err, compiler.context).toHtml()
                : 'ERROR';
            })
            .then((html) => {
              const filename = options.filename.replace(
                /\[templatehash([^\]]*)\]/g,
                deprecate(
                  (_match, options) => `[contenthash${options}]`,
                  '[templatehash] is now [contenthash]'
                )
              );
              const replacedFilename = replacePlaceholdersInFilename(
                filename,
                html,
                compilation
              );
              // Add the evaluated html code to the webpack assets
              compilation.emitAsset(
                replacedFilename.path,
                new webpack.sources.RawSource(html, false),
                replacedFilename.info
              );
              previousEmittedAssets.push({ name: replacedFilename.path, html });
              return replacedFilename.path;
            })
            .then((finalOutputName) =>
              getHtmlEntryPluginHooks(compilation)
                .afterEmit.promise({
                  outputName: finalOutputName,
                  plugin,
                })
                .catch((err) => {
                  console.error(err);
                  return null;
                })
                .then(() => null)
            );

          // Once all files are added to the webpack compilation
          // let the webpack compiler continue
          emitHtmlPromise.then(() => {
            callback();
          });
        }
      );
    }
  );

  /**
   * Generate the template parameters for the template function
   * @param {WebpackCompilation} compilation
   * @param {{
   *   publicPath: string,
   *   js: Array<string>,
   *   css: Array<string>,
   *   manifest?: string,
   *   favicon?: string
   * }} assets
   * @param {{
   *   headTags: HtmlTagObject[],
   *   bodyTags: HtmlTagObject[]
   * }} assetTags
   * @returns {Promise<{[key: any]: any}>}
   */
  function getTemplateParameters(compilation, assets, assetTags) {
    const templateParameters = options.templateParameters;
    if (templateParameters === false) {
      return Promise.resolve({});
    }
    if (
      typeof templateParameters !== 'function' &&
      typeof templateParameters !== 'object'
    ) {
      throw new Error(
        'templateParameters has to be either a function or an object'
      );
    }
    const templateParameterFunction =
      typeof templateParameters === 'function'
        ? // A custom function can overwrite the entire template parameter preparation
          templateParameters
        : // If the template parameters is an object merge it with the default values
          (compilation, assets, assetTags, options) =>
            Object.assign(
              {},
              templateParametersGenerator(
                compilation,
                assets,
                assetTags,
                options
              ),
              templateParameters
            );
    const preparedAssetTags = {
      headTags: prepareAssetTagGroupForRendering(assetTags.headTags),
      bodyTags: prepareAssetTagGroupForRendering(assetTags.bodyTags),
    };
    return Promise.resolve().then(() =>
      templateParameterFunction(compilation, assets, preparedAssetTags, options)
    );
  }

  /**
   * This function renders the actual html by executing the template function
   *
   * @param {(templateParameters) => string | Promise<string>} templateFunction
   * @param {{
   *   publicPath: string,
   *   js: Array<string>,
   *   css: Array<string>,
   *   manifest?: string,
   *   favicon?: string
   * }} assets
   * @param {{
   *   headTags: HtmlTagObject[],
   *   bodyTags: HtmlTagObject[]
   * }} assetTags
   * @param {WebpackCompilation} compilation
   *
   * @returns {Promise<string>}
   */
  function executeTemplate(templateFunction, assets, assetTags, compilation) {
    // Template processing
    const templateParamsPromise = getTemplateParameters(
      compilation,
      assets,
      assetTags
    );
    return templateParamsPromise.then((templateParams) => {
      try {
        // If html is a promise return the promise
        // If html is a string turn it into a promise
        return templateFunction(templateParams);
      } catch (e) {
        compilation.errors.push(new Error('Template execution failed: ' + e));
        return Promise.reject(e);
      }
    });
  }

  /**
   * Html Post processing
   *
   * @param {any} html
   * The input html
   * @param {any} assets
   * @param {{
   *   headTags: HtmlTagObject[],
   *   bodyTags: HtmlTagObject[]
   * }} assetTags
   * The asset tags to inject
   *
   * @returns {Promise<string>}
   */
  function postProcessHtml(html, assets, assetTags) {
    if (typeof html !== 'string') {
      return Promise.reject(
        new Error(
          `Expected html to be a string but got ${JSON.stringify(html)}`
        )
      );
    }
    const htmlAfterInjection = options.inject
      ? injectAssetsIntoHtml(html, assets, assetTags)
      : html;
    const htmlAfterMinification = minifyHtml(htmlAfterInjection);
    return Promise.resolve(htmlAfterMinification);
  }

  /**
   * Return all chunks from the compilation result which match the exclude and include filters
   * @param {any} chunks
   * @param {string[] | 'all'} includedChunks
   */
  function filterChunks(chunks, includedChunks) {
    return chunks.filter((chunkName) => {
      // Skip if the chunks should be filtered and the given chunk was not added explicity
      if (
        Array.isArray(includedChunks) &&
        includedChunks.indexOf(chunkName) === -1
      ) {
        return false;
      }
      // Add otherwise
      return true;
    });
  }

  /**
   * Replace [contenthash] in filename
   *
   * @see https://survivejs.com/webpack/optimizing/adding-hashes-to-filenames/
   *
   * @param {string} filename
   * @param {string|Buffer} fileContent
   * @param {WebpackCompilation} compilation
   * @returns {{ path: string, info: {} }}
   */
  function replacePlaceholdersInFilename(filename, fileContent, compilation) {
    if (/\[\\*([\w:]+)\\*\]/i.test(filename) === false) {
      return { path: filename, info: {} };
    }
    const hash = compiler.webpack.util.createHash(
      compilation.outputOptions.hashFunction
    );
    hash.update(fileContent);
    if (compilation.outputOptions.hashSalt) {
      hash.update(compilation.outputOptions.hashSalt);
    }
    const contentHash = hash
      .digest(compilation.outputOptions.hashDigest)
      .slice(0, compilation.outputOptions.hashDigestLength);
    return compilation.getPathWithInfo(filename, {
      contentHash,
      chunk: {
        hash: contentHash,
        contentHash,
      },
    });
  }

  /**
   * Generate the relative or absolute base url to reference images, css, and javascript files
   * from within the html file - the publicPath
   *
   * @param {WebpackCompilation} compilation
   * @param {string} childCompilationOutputName
   * @param {string | 'auto'} customPublicPath
   * @returns {string}
   */
  function getPublicPath(
    compilation,
    childCompilationOutputName,
    customPublicPath
  ) {
    const compilationHash = compilation.hash;

    /**
     * @type {string} the configured public path to the asset root
     * if a path publicPath is set in the current webpack config use it otherwise
     * fallback to a relative path
     */
    const webpackPublicPath = compilation.getAssetPath(
      compilation.outputOptions.publicPath,
      { hash: compilationHash }
    );

    // Webpack 5 introduced "auto" as default value
    const isPublicPathDefined = webpackPublicPath !== 'auto';

    let publicPath =
      // If the HtmlEntryPlugin options contain a custom public path uset it
      customPublicPath !== 'auto'
        ? customPublicPath
        : isPublicPathDefined
        ? // If a hard coded public path exists use it
          webpackPublicPath
        : // If no public path was set get a relative url path
          path
            .normalize(
              path.resolve(
                compilation.options.output.path,
                dirname(childCompilationOutputName)
              ),
              compilation.options.output.path
            )
            .split(path.sep)
            .join('/');

    if (publicPath.length && publicPath.substr(-1, 1) !== '/') {
      publicPath += '/';
    }

    return publicPath;
  }

  /**
   * Helper to return a sorted unique array of all asset files out of the
   * asset object
   */
  function getAssetFiles(assets) {
    const files = uniq(
      Object.keys(assets)
        .filter((assetType) => assetType !== 'chunks' && assets[assetType])
        .reduce((files, assetType) => files.concat(assets[assetType]), [])
    );
    files.sort();
    return files;
  }

  /**
   * This extracts the asset information of a webpack compilation
   * for all given entry names
   * @param {WebpackCompilation} compilation
   * @param {string[]} entryNames
   * @param {string | 'auto'} publicPath
   * @returns {{
   *   publicPath: string,
   *   js: Array<string>,
   *   css: Array<string>,
   *   manifest?: string,
   *   favicon?: string
   * }}
   */
  function getHtmlEntryPluginAssets(compilation, entryNames, publicPath) {
    const compilationHash = compilation.hash;
    /**
     * @type {{
     *    publicPath: string,
     *    js: Array<string>,
     *    css: Array<string>,
     *    manifest?: string,
     *    favicon?: string
     *  }}
     */
    const assets = {
      // The public path
      publicPath,
      // Will contain all js and mjs files
      js: [],
      // Will contain all css files
      css: [],
      // Will contain the html5 appcache manifest files if it exists
      manifest: Object.keys(compilation.assets).find(
        (assetFile) => path.extname(assetFile) === '.appcache'
      ),
      // Favicon
      favicon: undefined,
    };

    // Append a hash for cache busting
    if (options.hash && assets.manifest) {
      assets.manifest = appendHash(assets.manifest, compilationHash);
    }

    // Extract paths to .js, .mjs and .css files from the current compilation
    const entryPointPublicPathMap = {};
    const extensionRegexp = /\.(css|js|mjs)(\?|$)/;
    for (let i = 0; i < entryNames.length; i++) {
      const entryName = entryNames[i];
      // entryPointUnfilteredFiles - also includes hot module update files
      const entryPointUnfilteredFiles = compilation.entrypoints
        .get(entryName)
        .getFiles();

      const entryPointFiles = entryPointUnfilteredFiles.filter((chunkFile) => {
        // compilation.getAsset was introduced in webpack 4.4.0
        // once the support pre webpack 4.4.0 is dropped please
        // remove the following guard:
        const asset = compilation.getAsset && compilation.getAsset(chunkFile);
        if (!asset) {
          return true;
        }
        // Prevent hot-module files from being included:
        const assetMetaInformation = asset.info || {};
        return !(
          assetMetaInformation.hotModuleReplacement ||
          assetMetaInformation.development
        );
      });

      // Prepend the publicPath and append the hash depending on the
      // webpack.output.publicPath and hashOptions
      // E.g. bundle.js -> /bundle.js?hash
      const entryPointPublicPaths = entryPointFiles.map((chunkFile) => {
        const entryPointPublicPath = publicPath + urlEncodePath(chunkFile);
        return options.hash
          ? appendHash(entryPointPublicPath, compilationHash)
          : entryPointPublicPath;
      });

      entryPointPublicPaths.forEach((entryPointPublicPath) => {
        const extMatch = extensionRegexp.exec(entryPointPublicPath);
        // Skip if the public path is not a .css, .mjs or .js file
        if (!extMatch) {
          return;
        }
        // Skip if this file is already known
        // (e.g. because of common chunk optimizations)
        if (entryPointPublicPathMap[entryPointPublicPath]) {
          return;
        }
        entryPointPublicPathMap[entryPointPublicPath] = true;
        // ext will contain .js or .css, because .mjs recognizes as .js
        const ext = extMatch[1] === 'mjs' ? 'js' : extMatch[1];
        assets[ext].push(entryPointPublicPath);
      });
    }
    return assets;
  }

  /**
   * Generate all tags script for the given file paths
   * @param {Array<string>} jsAssets
   * @returns {Array<HtmlTagObject>}
   */
  function generatedScriptTags(jsAssets) {
    return jsAssets.map((scriptAsset) => ({
      tagName: 'script',
      voidTag: false,
      meta: { plugin: 'HtmlEntryPlugin' },
      attributes: { src: scriptAsset },
    }));
  }

  /**
   * Generate all style tags for the given file paths
   * @param {Array<string>} cssAssets
   * @returns {Array<HtmlTagObject>}
   */
  function generateStyleTags(cssAssets) {
    return cssAssets.map((styleAsset) => ({
      tagName: 'link',
      voidTag: true,
      meta: { plugin: 'HtmlEntryPlugin' },
      attributes: {
        href: styleAsset,
        rel: 'stylesheet',
      },
    }));
  }

  /**
   * Generate an optional base tag
   * @param { false
   *        | string
   *        | {[attributeName: string]: string} // attributes e.g. { href:"http://example.com/page.html" target:"_blank" }
   *        } baseOption
   * @returns {Array<HtmlTagObject>}
   */
  function generateBaseTag(baseOption) {
    if (baseOption === false) {
      return [];
    } else {
      return [
        {
          tagName: 'base',
          voidTag: true,
          meta: { plugin: 'HtmlEntryPlugin' },
          attributes:
            typeof baseOption === 'string' ? { href: baseOption } : baseOption,
        },
      ];
    }
  }

  /**
   * Generate all meta tags for the given meta configuration
   * @param {
   *  {
   *    [name: string]:
   *      false // disabled
   *      | string // name content pair e.g. {viewport: 'width=device-width, initial-scale=1, shrink-to-fit=no'}`
   *      | {[attributeName: string]: string|boolean} // custom properties e.g. { name:"viewport" content:"width=500, initial-scale=1" }
   *  } | false
   * } metaOptions
   * @returns {Array<HtmlTagObject>}
   */
  function generatedMetaTags(metaOptions) {
    if (metaOptions === false) {
      return [];
    }
    // Make tags self-closing in case of xhtml
    // Turn { "viewport" : "width=500, initial-scale=1" } into
    // [{ name:"viewport" content:"width=500, initial-scale=1" }]
    const metaTagAttributeObjects = Object.keys(metaOptions)
      .map((metaName) => {
        const metaTagContent = metaOptions[metaName];
        return typeof metaTagContent === 'string'
          ? {
              name: metaName,
              content: metaTagContent,
            }
          : metaTagContent;
      })
      .filter((attribute) => attribute !== false);
    // Turn [{ name:"viewport" content:"width=500, initial-scale=1" }] into
    // the HtmlEntryPlugin tag structure
    return metaTagAttributeObjects.map((metaTagAttributes) => {
      if (metaTagAttributes === false) {
        throw new Error('Invalid meta tag');
      }
      return {
        tagName: 'meta',
        voidTag: true,
        meta: { plugin: 'HtmlEntryPlugin' },
        attributes: metaTagAttributes,
      };
    });
  }

  /**
   * Generate a favicon tag for the given file path
   * @param {string| undefined} faviconPath
   * @returns {Array<HtmlTagObject>}
   */
  function generateFaviconTags(faviconPath) {
    if (!faviconPath) {
      return [];
    }
    return [
      {
        tagName: 'link',
        voidTag: true,
        meta: { plugin: 'HtmlEntryPlugin' },
        attributes: {
          rel: 'icon',
          href: faviconPath,
        },
      },
    ];
  }

  /**
   * Group assets to head and bottom tags
   *
   * @param {{
   *   scripts: Array<HtmlTagObject>;
   *   styles: Array<HtmlTagObject>;
   *   meta: Array<HtmlTagObject>;
   * }} assetTags
   * @param {"body" | "head"} scriptTarget
   * @returns {{
   *   headTags: Array<HtmlTagObject>;
   *   bodyTags: Array<HtmlTagObject>;
   * }}
   */
  function generateAssetGroups(assetTags, scriptTarget) {
    /** @type {{ headTags: Array<HtmlTagObject>; bodyTags: Array<HtmlTagObject>; }} */
    return {
      headTags: [...assetTags.meta, ...assetTags.styles],
      bodyTags: [...assetTags.scripts],
    };
  }

  /**
   * Add toString methods for easier rendering
   * inside the template
   *
   * @param {Array<HtmlTagObject>} assetTagGroup
   * @returns {Array<HtmlTagObject>}
   */
  function prepareAssetTagGroupForRendering(assetTagGroup) {
    const xhtml = options.xhtml;
    return HtmlTagArray.from(
      assetTagGroup.map((assetTag) => {
        const copiedAssetTag = Object.assign({}, assetTag);
        copiedAssetTag.toString = function () {
          return htmlTagObjectToString(this, xhtml);
        };
        return copiedAssetTag;
      })
    );
  }

  /**
   * Injects the assets into the given html string
   *
   * @param {string} html
   * The input html
   * @param {any} assets
   * @param {{
   *   headTags: HtmlTagObject[],
   *   bodyTags: HtmlTagObject[]
   * }} assetTags
   * The asset tags to inject
   *
   * @returns {string}
   */
  function injectAssetsIntoHtml(html, assets, assetTags) {
    const htmlRegExp = /(<html[^>]*>)/i;
    const headRegExp = /(<\/head\s*>)/i;
    const bodyRegExp = /(<\/body\s*>)/i;
    const body = assetTags.bodyTags.map((assetTagObject) =>
      htmlTagObjectToString(assetTagObject, options.xhtml)
    );
    const head = assetTags.headTags.map((assetTagObject) =>
      htmlTagObjectToString(assetTagObject, options.xhtml)
    );

    if (body.length) {
      if (bodyRegExp.test(html)) {
        // Append assets to body element
        html = html.replace(bodyRegExp, (match) => body.join('') + match);
      } else {
        // Append scripts to the end of the file if no <body> element exists:
        html += body.join('');
      }
    }

    if (head.length) {
      // Create a head tag if none exists
      if (!headRegExp.test(html)) {
        if (!htmlRegExp.test(html)) {
          html = `<head></head>${html}`;
        } else {
          html = html.replace(htmlRegExp, (match) => `${match}<head></head>`);
        }
      }

      // Append assets to head element
      html = html.replace(headRegExp, (match) => head.join('') + match);
    }

    // Inject manifest into the opening html tag
    if (assets.manifest) {
      html = html.replace(/(<html[^>]*)(>)/i, (match, start, end) => {
        // Append the manifest only if no manifest was specified
        if (/\smanifest\s*=/.test(match)) {
          return match;
        }
        return `${start} manifest="${assets.manifest}"${end}`;
      });
    }
    return html;
  }

  /**
   * Appends a cache busting hash to the query string of the url
   * E.g. http://localhost:8080/ -> http://localhost:8080/?50c9096ba6183fd728eeb065a26ec175
   * @param {string} url
   * @param {string} hash
   */
  function appendHash(url, hash) {
    if (!url) {
      return url;
    }
    return url + (url.indexOf('?') === -1 ? '?' : '&') + hash;
  }

  /**
   * Encode each path component using `encodeURIComponent` as files can contain characters
   * which needs special encoding in URLs like `+ `.
   *
   * Valid filesystem characters which need to be encoded for urls:
   *
   * `#` pound, `%` percent, `&` ampersand, `{` left curly bracket, `}` right curly bracket,
   * `\` back slash, `<` left angle bracket, `>` right angle bracket, `*` asterisk, `?` question mark,
   * ` ` blank spaces, `$` dollar sign, `!` exclamation point, `'` single quotes, `"` double quotes,
   * `:` colon, `@` at sign, `+` plus sign, \` backtick, `|` pipe, `=` equal sign
   *
   * However the query string must not be encoded:
   *
   *  fo:demonstration-path/very fancy+name.js?path=/home?value=abc&value=def#zzz
   *    ^             ^    ^    ^     ^    ^  ^    ^^    ^     ^   ^     ^   ^
   *    |             |    |    |     |    |  |    ||    |     |   |     |   |
   *    encoded       |    |    encoded    |  |    ||    |     |   |     |   |
   *                 ignored              ignored  ignored     ignored   ignored
   *
   * @param {string} filePath
   */
  function urlEncodePath(filePath) {
    // People use the filepath in quite unexpected ways.
    // Try to extract the first querystring of the url:
    //
    // some+path/demo.html?value=abc?def
    //
    const queryStringStart = filePath.indexOf('?');
    const urlPath =
      queryStringStart === -1 ? filePath : filePath.substr(0, queryStringStart);
    const queryString = filePath.substr(urlPath.length);
    // Encode all parts except '/' which are not part of the querystring:
    const encodedUrlPath = urlPath.split('/').map(encodeURIComponent).join('/');
    return encodedUrlPath + queryString;
  }

  /**
   * Helper to return the absolute template path with a fallback loader
   * @param {string} template The path to the template e.g. './index.html'
   * @param {string} context The webpack base resolution path for relative paths e.g. process.cwd()
   */
  function getFullTemplatePath(template, context) {
    // If the template doesn't use a loader use the template loader
    if (template.indexOf('!') === -1) {
      template = `${require.resolve('html-entry-loader')}?${qs.stringify({
        type: 'template',
        cacheDirectory: options.cacheDirectory,
        cacheIdentifier: options.cacheIdentifier,
      })}!${path.resolve(context, template)}`;
    }
    // Resolve template path
    return template.replace(
      /([!])([^/\\][^!?]+|[^/\\!?])($|\?[^!?\n]+$)/,
      (_, prefix, filepath, postfix) => {
        return `${prefix}${path.resolve(filepath)}${postfix}`;
      }
    );
  }

  /**
   * Minify the given string using html-minifier-terser
   *
   * As this is a breaking change to HtmlEntryPlugin 3.x
   * provide an extended error message to explain how to get back
   * to the old behaviour
   *
   * @param {string} html
   */
  function minifyHtml(html) {
    if (typeof options.minify !== 'object') {
      return html;
    }
    try {
      return minify(html, options.minify);
    } catch (e) {
      const isParseError = String(e.message).indexOf('Parse Error') === 0;
      if (isParseError) {
        e.message =
          'HtmlEntryPlugin could not minify the generated output.\n' +
          'In production mode the html minification is enabled by default.\n' +
          'If you are not generating a valid html output please disable it manually.\n' +
          'You can do so by adding the following setting to your HtmlEntryPlugin config:\n|\n|' +
          '    minify: false\n|\n' +
          'See https://github.com/Mitscherlich/html-entry-loader#options for details.\n\n' +
          'For parser dedicated bugs please create an issue here:\n' +
          'https://danielruf.github.io/html-minifier-terser/' +
          '\n' +
          e.message;
      }
      throw e;
    }
  }
}

/**
 * The default for options.templateParameter
 * Generate the template parameters
 *
 * Generate the template parameters for the template function
 * @param {WebpackCompilation} compilation
 * @param {{
 *   publicPath: string,
 *   js: Array<string>,
 *   css: Array<string>,
 *   manifest?: string,
 *   favicon?: string
 * }} assets
 * @param {{
 *   headTags: HtmlTagObject[],
 *   bodyTags: HtmlTagObject[]
 * }} assetTags
 * @param {ProcessedHtmlWebpackOptions} options
 * @returns {TemplateParameter}
 */
function templateParametersGenerator(compilation, assets, assetTags, options) {
  return {
    compilation,
    webpackConfig: compilation.options,
    htmlEntryPlugin: {
      tags: assetTags,
      files: assets,
      options,
    },
  };
}

HtmlEntryPlugin.NS = NS;
HtmlEntryPlugin.version = version;

/**
 * A static helper to get the hooks for this plugin
 *
 * Usage: HtmlEntryPlugin.getHooks(compilation).HOOK_NAME.tapAsync('YourPluginName', () => { ... });
 */
HtmlEntryPlugin.getHooks = getHtmlEntryPluginHooks;
HtmlEntryPlugin.createHtmlTagObject = createHtmlTagObject;

/**
 * @param {string | string[]} pattern
 * @param {HtmlEntryPluginResolveOption} options
 */
HtmlEntryPlugin.resolve = (pattern, options) => {
  if (isPlainObject(pattern) && options === undefined) {
    options = pattern;
    pattern = options.entry;
  }

  let { context } = options;
  if (!path.isAbsolute(context)) {
    context = path.resolve(context);
  }

  if (isArray(pattern)) {
    pattern = pattern.join(',');
  }

  return glob.sync(pattern).reduce((entryMap, filename) => {
    const fullpath = filename;
    let { dir: dirname, name: entryName } = path.parse(filename);
    if (path.isAbsolute(filename)) {
      dirname = path.relative(context, dirname);
    }

    if (process.platform === 'win32') {
      dirname = dirname.replace(/\/\//g, '/');
    }

    entryName = dirname ? `${dirname}/${entryName}` : entryName;

    if (entryName.startsWith('/')) {
      entryName = entryName.slice(1);
    }

    return (entryMap[entryName] = fullpath), entryMap;
  }, {});
};

module.exports = HtmlEntryPlugin;
