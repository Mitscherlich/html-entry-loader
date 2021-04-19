import { parse, parseFragment, serialize } from 'parse5';
import { traverse, requestify, getFilter } from '../utils';
import { cache } from './cache';

const webpackIgnoreCommentRegexp = /webpackIgnore:(\s+)?(true|false)/;

function parseHTML(html, options) {
  if (/(<html[^>]*>)/i.test(html)) {
    return parse(html, options);
  }
  return parseFragment(html, options);
}

export function transform(html, { sources, context, resourcePath }) {
  const descriptor = {
    imports: [],
    replacements: [],
    sources: [],
    errors: [],
  };

  const urlFilter = getFilter(sources.urlFilter);
  const document = parseHTML(html, { sourceCodeLocationInfo: true });

  let needIgnore = false;

  traverse(document, (node, parent) => {
    const { tagName, attrs: attributes, sourceCodeLocation } = node;

    if (node.nodeName === '#comment') {
      const match = node.data.match(webpackIgnoreCommentRegexp);

      if (match) {
        needIgnore = match[2] === 'true';
      }

      return;
    }

    if (!tagName) {
      return;
    }

    if (needIgnore) {
      needIgnore = false;
      return;
    }

    attributes.forEach((attribute) => {
      let { name } = attribute;

      name = attribute.prefix ? `${attribute.prefix}:${name}` : name;

      const handlers = sources.list.get(tagName.toLowerCase());

      if (!handlers) {
        return;
      }

      const handler = handlers.get(name.toLowerCase());

      if (!handler) {
        return;
      }

      if (
        handler.filter &&
        !handler.filter(tagName, name, attributes, resourcePath)
      ) {
        return;
      }

      const attributeAndValue = html.slice(
        sourceCodeLocation.attrs[name].startOffset,
        sourceCodeLocation.attrs[name].endOffset
      );
      const isValueQuoted =
        attributeAndValue[attributeAndValue.length - 1] === '"' ||
        attributeAndValue[attributeAndValue.length - 1] === "'";
      const valueStartOffset =
        sourceCodeLocation.attrs[name].startOffset +
        attributeAndValue.indexOf(attribute.value);
      const valueEndOffset =
        sourceCodeLocation.attrs[name].endOffset - (isValueQuoted ? 1 : 0);
      const optionsForTypeFn = {
        tag: tagName,
        startTag: {
          startOffset: sourceCodeLocation.startTag.startOffset,
          endOffset: sourceCodeLocation.startTag.endOffset,
        },
        endTag: sourceCodeLocation.endTag
          ? {
              startOffset: sourceCodeLocation.endTag.startOffset,
              endOffset: sourceCodeLocation.endTag.endOffset,
            }
          : undefined,
        attributes,
        attribute: name,
        attributePrefix: attribute.prefix,
        attributeNamespace: attribute.namespace,
        attributeStartOffset: sourceCodeLocation.attrs[name].startOffset,
        attributeEndOffset: sourceCodeLocation.attrs[name].endOffset,
        value: attribute.value,
        isValueQuoted,
        valueEndOffset,
        valueStartOffset,
        html,
      };

      let result;

      try {
        result = handler.type(optionsForTypeFn);
      } catch (error) {
        descriptor.errors.push(error);
      }

      result = Array.isArray(result) ? result : [result];

      for (const source of result) {
        if (!source) {
          continue;
        }

        if (!urlFilter(source.name, source.value, resourcePath)) {
          continue;
        }

        descriptor.sources.push({ ...source, name, isValueQuoted });

        const childIndex = parent.childNodes.indexOf(node);
        if (childIndex >= 0) {
          parent.childNodes.splice(childIndex, 1);
        }
      }
    });
  });

  const imports = new Map();
  const replacements = new Map();

  let offset = 0;

  for (const source of descriptor.sources) {
    const {
      value,
      isValueQuoted,
      format,
      runtime,
      startOffset,
      endOffset,
    } = source;

    let request = value;

    let hash;
    const indexHash = request.lastIndexOf('#');

    if (indexHash >= 0) {
      hash = request.substring(indexHash);
      request = request.substring(0, indexHash);
    }

    request = requestify(context, request);

    let importName = imports.get(request);

    if (!importName) {
      importName = `___HTML_ENTRY_LOADER_IMPORT_${imports.size}___`;
      imports.set(request, importName);

      descriptor.imports.push({ format, importName, request });
    }

    const replacementKey = JSON.stringify({ request, isValueQuoted, hash });
    let replacementName = replacements.get(replacementKey);

    if (!replacementName) {
      replacementName = `___HTML_ENTRY_LOADER_REPLACEMENT_${replacements.size}___`;
      replacements.set(replacementKey, replacementName);

      descriptor.replacements.push({
        replacementName,
        importName,
        hash,
        isValueQuoted,
        runtime,
      });
    }

    html =
      html.slice(0, startOffset + offset) +
      replacementName +
      html.slice(endOffset + offset);

    offset += startOffset + replacementName.length - endOffset;
  }

  descriptor.html = serialize(document);

  return descriptor;
}

export async function compile({
  source,
  cacheDirectory,
  cacheIdentifier,
  ...options
}) {
  let result;
  if (cacheDirectory) {
    result = await cache({
      source,
      options,
      transform,
      cacheDirectory,
      cacheIdentifier,
    });
  } else {
    result = await transform(source, options);
  }

  return result;
}
