import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs-extra';
import hash from 'hash-sum';
import findCacheDir from 'find-cache-dir';
import { transform } from './parser';

const TMP_DIR = tmpdir();

// Lazily instantiated when needed
let defaultCacheDirectory = null;

/**
 * Read the contents from the compressed file.
 *
 * @async
 * @param {string} filename
 * @param {boolean} compress
 */
async function read(filename) {
  const content = await fs.readFile(filename);
  return JSON.parse(content.toString());
}

/**
 * Write contents into a compressed file.
 *
 * @async
 * @param {string} filename
 * @param {boolean} compress
 * @param {string} result
 */
async function write(filename, result) {
  const content = JSON.stringify(result);
  return await fs.writeFile(filename, content);
}

function filename(source, identifier, options) {
  return `${hash({ source, options, identifier })}.json`;
}

async function handleCache(directory, params) {
  const { source, options = {}, cacheIdentifier, cacheDirectory } = params;

  const file = path.join(directory, filename(source, cacheIdentifier, options));

  try {
    // No errors mean that the file was previously cached
    // we just need to return it
    return await read(file);
  } catch {
    // Just ignore :)
  }

  const fallback = typeof cacheDirectory !== 'string' && directory !== TMP_DIR;

  // Make sure the directory exists.
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (err) {
    if (fallback) {
      return handleCache(TMP_DIR, params);
    }

    throw err;
  }

  // Otherwise just transform the file
  // return it to the user asap and write it in cache
  const result = await transform(source, options);

  try {
    await write(file, result);
  } catch (err) {
    if (fallback) {
      // Fallback to tmpdir if node_modules folder not writable
      return handleCache(TMP_DIR, params);
    }

    throw err;
  }

  return result;
}

export async function cache(params) {
  let directory;

  if (typeof params.cacheDirectory === 'string') {
    directory = params.cacheDirectory;
  } else {
    if (defaultCacheDirectory === null) {
      defaultCacheDirectory =
        findCacheDir({ name: 'html-entry-loader' }) || TMP_DIR;
    }

    directory = defaultCacheDirectory;
  }

  return await handleCache(directory, params);
}
