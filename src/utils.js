import { win32, posix } from 'path';
import { HtmlSourceError } from './errors';

function isASCIIWhitespace(character) {
  return (
    // Horizontal tab
    character === '\u0009' ||
    // New line
    character === '\u000A' ||
    // Form feed
    character === '\u000C' ||
    // Carriage return
    character === '\u000D' ||
    // Space
    character === '\u0020'
  );
}

function isASCIIC0group(character) {
  // C0 and &nbsp;
  return /^[\u0001-\u0019\u00a0]/.test(character);
}

export function c0ControlCodesExclude(source) {
  let { value, startOffset } = source;

  if (!value) {
    throw new Error('Must be non-empty');
  }

  while (isASCIIC0group(value.substring(0, 1))) {
    startOffset += 1;
    value = value.substring(1, value.length);
  }

  while (isASCIIC0group(value.substring(value.length - 1, value.length))) {
    value = value.substring(0, value.length - 1);
  }

  if (!value) {
    throw new Error('Must be non-empty');
  }

  return { value, startOffset };
}

export function parseSrc(input) {
  if (!input) {
    throw new Error('Must be non-empty');
  }

  let startOffset = 0;
  let value = input;

  while (isASCIIWhitespace(value.substring(0, 1))) {
    startOffset += 1;
    value = value.substring(1, value.length);
  }

  while (isASCIIWhitespace(value.substring(value.length - 1, value.length))) {
    value = value.substring(0, value.length - 1);
  }

  if (!value) {
    throw new Error('Must be non-empty');
  }

  return { value, startOffset };
}

const WINDOWS_ABS_PATH_REGEXP = /^[a-zA-Z]:[\\/]|^\\\\/;

export function isUrlRequestable(url) {
  // Protocol-relative URLs
  if (/^\/\//.test(url)) {
    return false;
  }

  // `file:` protocol
  if (/^file:/i.test(url)) {
    return true;
  }

  // Absolute URLs
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !WINDOWS_ABS_PATH_REGEXP.test(url)) {
    return false;
  }

  // It's some kind of url for a template
  if (/^[{}[\]#*;,'§$%&(=?`´^°<>]/.test(url)) {
    return false;
  }

  return true;
}

const WINDOWS_PATH_SEPARATOR_REGEXP = /\\/g;
const RELATIVE_PATH_REGEXP = /^\.\.?[/\\]/;

const absoluteToRequest = (context, maybeAbsolutePath) => {
  if (maybeAbsolutePath[0] === '/') {
    if (
      maybeAbsolutePath.length > 1 &&
      maybeAbsolutePath[maybeAbsolutePath.length - 1] === '/'
    ) {
      // this 'path' is actually a regexp generated by dynamic requires.
      // Don't treat it as an absolute path.
      return maybeAbsolutePath;
    }

    const querySplitPos = maybeAbsolutePath.indexOf('?');

    let resource =
      querySplitPos === -1
        ? maybeAbsolutePath
        : maybeAbsolutePath.slice(0, querySplitPos);
    resource = posix.relative(context, resource);

    if (!resource.startsWith('../')) {
      resource = `./${resource}`;
    }

    return querySplitPos === -1
      ? resource
      : resource + maybeAbsolutePath.slice(querySplitPos);
  }

  if (WINDOWS_ABS_PATH_REGEXP.test(maybeAbsolutePath)) {
    const querySplitPos = maybeAbsolutePath.indexOf('?');
    let resource =
      querySplitPos === -1
        ? maybeAbsolutePath
        : maybeAbsolutePath.slice(0, querySplitPos);

    resource = win32.relative(context, resource);

    if (!WINDOWS_ABS_PATH_REGEXP.test(resource)) {
      resource = resource.replace(WINDOWS_PATH_SEPARATOR_REGEXP, '/');

      if (!resource.startsWith('../')) {
        resource = `./${resource}`;
      }
    }

    return querySplitPos === -1
      ? resource
      : resource + maybeAbsolutePath.slice(querySplitPos);
  }

  if (!RELATIVE_PATH_REGEXP.test(maybeAbsolutePath)) {
    return `./${maybeAbsolutePath.replace(WINDOWS_PATH_SEPARATOR_REGEXP, '/')}`;
  }

  // not an absolute path
  return maybeAbsolutePath;
};

const contextify = (context, request) =>
  request
    .split('!')
    .map((r) => absoluteToRequest(context, r))
    .join('!');

const MODULE_REQUEST_REGEXP = /^[^?]*~/;

export function requestify(context, request) {
  const isWindowsAbsolutePath = WINDOWS_ABS_PATH_REGEXP.test(request);
  const newRequest = isWindowsAbsolutePath
    ? decodeURI(request).replace(/[\t\n\r]/g, '')
    : decodeURI(request)
        .replace(/[\t\n\r]/g, '')
        .replace(/\\/g, '/');

  if (isWindowsAbsolutePath || newRequest[0] === '/') {
    return newRequest;
  }

  if (/^file:/i.test(newRequest)) {
    return newRequest;
  }

  // A `~` makes the url an module
  if (MODULE_REQUEST_REGEXP.test(newRequest)) {
    return newRequest.replace(MODULE_REQUEST_REGEXP, '');
  }

  // every other url is threaded like a relative url
  return contextify(context, newRequest);
}

/**
 * Check if webpack is running in production mode
 * @see https://github.com/webpack/webpack/blob/3366421f1784c449f415cda5930a8e445086f688/lib/WebpackOptionsDefaulter.js#L12-L14
 *
 * @param {{ mode?: string }} options
 * @return {boolean}
 */
export const isProductionLike = (options) => {
  return options.mode === 'production' || !options.mode;
};

function getAttributeValue(attributes, name) {
  const [result] = attributes.filter((i) => i.name.toLowerCase() === name);
  return typeof result === 'undefined' ? result : result.value;
}

function srcType(options) {
  let source;

  try {
    source = parseSrc(options.value);
  } catch (error) {
    throw new HtmlSourceError(
      `Bad value for attribute "${options.attribute}" on element "${options.tag}": ${error.message}`,
      options.attributeStartOffset,
      options.attributeEndOffset,
      options.html
    );
  }

  source = c0ControlCodesExclude(source);

  if (!isUrlRequestable(source.value)) {
    return [];
  }

  const startOffset = options.valueStartOffset + source.startOffset;
  const endOffset = startOffset + source.value.length;

  return [{ value: source.value, startOffset, endOffset }];
}

function linkHrefFilter(tag, attribute, attributes) {
  let rel = getAttributeValue(attributes, 'rel');

  if (!rel) {
    return false;
  }

  rel = rel.trim();

  if (!rel) {
    return false;
  }

  rel = rel.toLowerCase();

  const usedRels = rel.split(' ').filter((value) => value);
  const allowedRels = [
    'stylesheet',
    'icon',
    'mask-icon',
    'apple-touch-icon',
    'apple-touch-icon-precomposed',
    'apple-touch-startup-image',
    'manifest',
    'prefetch',
    'preload',
  ];

  return allowedRels.filter((value) => usedRels.includes(value)).length > 0;
}

function scriptSrcFilter(tag, attribute, attributes) {
  let type = getAttributeValue(attributes, 'type');

  if (!type) {
    return true;
  }

  type = type.trim();

  if (!type) {
    return false;
  }

  if (
    type !== 'module' &&
    type !== 'text/javascript' &&
    type !== 'application/javascript'
  ) {
    return false;
  }

  return true;
}

const defaultSourceList = new Map([
  [
    'link',
    new Map([
      [
        'href',
        {
          type: srcType,
          filter: linkHrefFilter,
        },
      ],
    ]),
  ],
  [
    'script',
    new Map([
      [
        'src',
        {
          type: srcType,
          filter: scriptSrcFilter,
        },
      ],
    ]),
  ],
]);

function normalizeSourcesList(sources) {
  if (typeof sources === 'undefined') {
    return defaultSourceList;
  }

  const result = new Map();

  for (const source of sources) {
    if (source === '...') {
      for (const [tag, attributes] of defaultSourceList.entries()) {
        let newAttributes;

        const existingAttributes = result.get(tag);

        if (existingAttributes) {
          newAttributes = new Map([...existingAttributes, ...attributes]);
        } else {
          newAttributes = new Map(attributes);
        }

        result.set(tag, newAttributes);
      }

      continue;
    }

    let { tag = '*', attribute = '*' } = source;

    tag = tag.toLowerCase();
    attribute = attribute.toLowerCase();

    if (!result.has(tag)) {
      result.set(tag, new Map());
    }

    let typeFn;

    switch (source.type) {
      case 'src':
        typeFn = srcType;
        break;
      case 'srcset':
        typeFn = srcsetType;
        break;
    }

    result.get(tag).set(attribute, {
      type: typeFn,
      filter: source.filter,
    });
  }

  return result;
}

function getSourcesOptions(rawOptions) {
  if (typeof rawOptions.sources === 'undefined') {
    return { list: normalizeSourcesList() };
  }

  if (typeof rawOptions.sources === 'boolean') {
    return rawOptions.sources === true
      ? { list: normalizeSourcesList() }
      : false;
  }

  const sources = normalizeSourcesList(rawOptions.sources.list);

  return { list: sources, urlFilter: rawOptions.sources.urlFilter };
}

export function normalizeOptions(rawOptions) {
  return {
    sources: getSourcesOptions(rawOptions),
  };
}

export function getFilter(filter) {
  return (attribute, value, resourcePath) => {
    if (typeof filter === 'function') {
      return filter(attribute, value, resourcePath);
    }

    return true;
  };
}

const GET_SOURCE_FROM_IMPORT_NAME = '___HEL_GET_SOURCE_FROM_IMPORT___';

export function genImportCode({ imports }, loaderContext) {
  if (imports.length === 0) {
    return '';
  }

  const fileURLToHelper = contextify(
    loaderContext.context,
    require.resolve('./runtime/getUrl.js')
  );

  let code = `var ${GET_SOURCE_FROM_IMPORT_NAME} = require("${fileURLToHelper}");\n`;

  for (const item of imports) {
    const { format, importName, request } = item;

    switch (format) {
      case 'import':
        code += `var ${importName} = require(${JSON.stringify(request)});\n`;
        break;
      case 'url':
      default:
        code += `var ${importName} = require(${JSON.stringify(request)});\n`;
    }
  }

  return `// Imports\n${code}`;
}

export function genModuleCode({ html, replacements }) {
  let code = JSON.stringify(html)
    // Invalid in JavaScript but valid HTML
    .replace(/[\u2028\u2029]/g, (str) =>
      str === '\u2029' ? '\\u2029' : '\\u2028'
    );

  let replacersCode = '';

  for (const item of replacements) {
    const { runtime, importName, replacementName, isValueQuoted, hash } = item;

    if (typeof runtime === 'undefined' || runtime === true) {
      const getUrlOptions = []
        .concat(hash ? [`hash: ${JSON.stringify(hash)}`] : [])
        .concat(isValueQuoted ? [] : 'maybeNeedQuotes: true');
      const preparedOptions =
        getUrlOptions.length > 0 ? `, { ${getUrlOptions.join(', ')} }` : '';

      replacersCode += `var ${replacementName} = ${GET_SOURCE_FROM_IMPORT_NAME}(${importName}${preparedOptions});\n`;

      code = code.replace(
        new RegExp(replacementName, 'g'),
        () => `" + ${replacementName} + "`
      );
    } else {
      code = code.replace(
        new RegExp(replacementName, 'g'),
        () => `" + ${importName} + "`
      );
    }
  }

  return `// Module\n${replacersCode}var code = ${code};\n`;
}

export function genExportCode() {
  return `// Exports\nmodule.exports = code;`;
}

export function traverse(root, callback) {
  (function visit(node, parent) {
    let res;

    if (callback) {
      res = callback(node, parent);
    }

    let { childNodes } = node;

    // in case a <template> tag is in the middle of the HTML: https://github.com/JPeer264/node-rcs-core/issues/58
    if (node.content && Array.isArray(node.content.childNodes)) {
      ({ childNodes } = node.content);
    }

    if (res !== false && Array.isArray(childNodes) && childNodes.length >= 0) {
      childNodes.forEach((child) => {
        visit(child, node);
      });
    }
  })(root, null);
}
