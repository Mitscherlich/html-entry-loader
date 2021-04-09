import { compile } from '../codegen/parser';
import { normalizeOptions } from '../utils';

import schema from '../options.json';

module.exports = async function (source) {
  const loaderContext = this;

  const rawOptions = loaderContext.getOptions(schema);
  const options = normalizeOptions(rawOptions);

  const { resourcePath, context } = loaderContext;

  const descriptor = await compile({
    source,
    sources: options.sources,
    resourcePath,
    context,
    hash: options.cacheIdentifier,
  });

  for (const error of descriptor.errors) {
    loaderContext.emit(error instanceof Error ? error : new Error(error));
  }

  return `module.exports = ${JSON.stringify(descriptor.html)}`;
};
