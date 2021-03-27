import qs from 'querystring';
import hash from 'hash-sum';
import { getOptions, stringifyRequest } from 'loader-utils';
import { isAbsolute, relative } from 'path';
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

  const rawOptions = loaderContext.getOptions(schema);
  const options = normalizeOptions(rawOptions);

  const { resourcePath, context } = loaderContext;

  const descriptor = await compile({
    source,
    sources: options.sources,
    resourcePath,
    context,
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
  const { cacheDirectory, cacheIdentifier, type } = options;

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

  if (type === 'template') {
    const cacheLoader =
      cacheDirectory && cacheIdentifier
        ? [
            `${require.resolve('cache-loader')}?${qs.stringify({
              // For some reason, webpack fails to generate consistent hash if we
              // use absolute paths here, even though the path is only used in a
              // comment. For now we have to ensure cacheDirectory is a relative path.
              cacheDirectory: (isAbsolute(cacheDirectory)
                ? relative(process.cwd(), cacheDirectory)
                : cacheDirectory
              ).replace(/\\/g, '/'),
              cacheIdentifier: `${hash(cacheIdentifier)}-html-template`,
            })}`,
          ]
        : [];

    const preLoaders = loaders.filter(isPreLoader);
    const postLoaders = loaders.filter(isPostLoader);

    const request = genRequest([
      ...cacheLoader,
      ...postLoaders,
      `${templateLoaderPath}??html-entry-options`,
      ...preLoaders,
    ]);

    return `module.exports = require(${request});`;
  }
};
