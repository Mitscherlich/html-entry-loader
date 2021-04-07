import _ from 'lodash';
import { compile } from '../codegen/parser';
import { normalizeOptions } from '../utils';

import schema from '../options.json';

const lodashRequire = require.resolve('lodash');

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
  });

  for (const error of descriptor.errors) {
    loaderContext.emit(error instanceof Error ? error : new Error(error));
  }

  // The following part renders the template with lodash as a minimalistic loader
  const template = _.template(descriptor.html, {
    interpolate: /<%=([\s\S]+?)%>/g,
    variable: 'data',
    ...options,
  });

  // Use __non_webpack_require__ to enforce using the native nodejs require
  // during template execution
  return `var _ = __non_webpack_require__(${JSON.stringify(lodashRequire)});
// Execute the lodash template
module.exports = (${template.source})();`;
};
