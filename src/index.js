import { getOptions, stringifyRequest } from 'loader-utils';
import { compile } from './codegen/parser';
import {
  normalizeOptions,
  genImportCode,
  genModuleCode,
  genExportCode,
} from './utils';
import { NS } from './plugin';

import schema from './options.json';

let errorEmitted = false;

module.exports = async function (source) {
  const loaderContext = this;

  if (!errorEmitted && !loaderContext['thread-loader'] && !loaderContext[NS]) {
    loaderContext.emitError(
      'html-entry-loader was used without corresponding plugin. Make sure to include HtmlEntryPlugin in your webpack config.'
    );
    errorEmitted = true;
  }

  if (loaderContext.cacheable) {
    loaderContext.cacheable(true);
  }

  const rawOptions = loaderContext.getOptions(schema);
  const options = normalizeOptions(rawOptions);

  const { resourcePath, resourceQuery, context } = loaderContext;

  const descriptor = await compile({
    source,
    resourcePath,
    resourceQuery,
    context,
    ...options,
  });

  for (const error of descriptor.errors) {
    loaderContext.emitError(error instanceof Error ? error : new Error(error));
  }

  const importCode = genImportCode(descriptor, loaderContext);
  const moduleCode = genModuleCode(descriptor);
  const exportCode = genExportCode();

  return `${importCode}${moduleCode}${exportCode}`;
};

const isThisLoader = (l) => l.path !== require.resolve('html-entry-loader');
const isPreLoader = (l) => !l.pitchExecuted;
const isPostLoader = (l) => l.pitchExecuted;

const templateLoaderPath = require.resolve('./loaders/template-loader');

module.exports.pitch = function () {
  const options = getOptions(this);

  let loaders = this.loaders;

  // remove self
  loaders = loaders.filter(isThisLoader);

  const genRequest = (loaders) => {
    // Important: dedupe since both the original rule
    // and the cloned rule would match a source import request.
    // also make sure to dedupe based on loader path.
    // assumes you'd probably never want to apply the same loader on the same
    // file twice.
    const seen = new Map();
    const loaderStrings = [];

    loaders.forEach((loader) => {
      const identifier =
        typeof loader === 'string' ? loader : loader.path + loader.query;
      const request = typeof loader === 'string' ? loader : loader.request;
      if (!seen.has(identifier)) {
        seen.set(identifier, true);
        // loader.request contains both the resolved loader path and its options
        // query (e.g. ??ref-0)
        loaderStrings.push(request);
      }
    });

    return stringifyRequest(
      this,
      ['-', ...loaderStrings, this.resourcePath + this.resourceQuery].join('!')
    );
  };

  if (options.type === 'template') {
    const preLoaders = loaders.filter(isPreLoader);
    const postLoaders = loaders.filter(isPostLoader);

    const request = genRequest([
      ...postLoaders,
      `${templateLoaderPath}??html-entry-options`,
      ...preLoaders,
    ]);

    return `module.exports = require(${request});`;
  }
};
