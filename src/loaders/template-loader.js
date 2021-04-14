import { compile } from '../codegen/parser';
import { normalizeOptions, genExportCode } from '../utils';

import schema from '../options.json';

module.exports = async function (source) {
  const loaderContext = this;

  if (loaderContext.cacheable) {
    loaderContext.cacheable(true);
  }

  const rawOptions = loaderContext.getOptions(schema);
  const options = normalizeOptions(rawOptions);

  const { resourcePath, context } = loaderContext;

  const descriptor = await compile({
    source,
    resourcePath,
    context,
    ...options,
  });

  for (const error of descriptor.errors) {
    loaderContext.emitError(error instanceof Error ? error : new Error(error));
  }

  return genExportCode(descriptor);
};
