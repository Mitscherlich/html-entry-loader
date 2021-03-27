/** @typedef {import('webpack/lib/Compilation')} WebpackCompilation */
/** @typedef {import('webpack/lib/FileSystemInfo').Snapshot} Snapshot */

/**
 * @param {{ fileDependencies: string[], contextDependencies: string[], missingDependencies: string[] }} fileDependencies
 * @param {WebpackCompilation} mainCompilation
 * @param {number} startTime
 */
export function createSnapshot(fileDependencies, mainCompilation, startTime) {
  return new Promise((resolve, reject) => {
    mainCompilation.fileSystemInfo.createSnapshot(
      startTime,
      fileDependencies.fileDependencies,
      fileDependencies.contextDependencies,
      fileDependencies.missingDependencies,
      null,
      (err, snapshot) => {
        if (err) {
          return reject(err);
        }
        resolve(snapshot);
      }
    );
  });
}

/**
 * Returns true if the files inside this snapshot
 * have not been changed
 *
 * @param {Snapshot} snapshot
 * @param {WebpackCompilation} mainCompilation
 * @returns {Promise<boolean>}
 */
export function isSnapShotValid(snapshot, mainCompilation) {
  return new Promise((resolve, reject) => {
    mainCompilation.fileSystemInfo.checkSnapshotValid(
      snapshot,
      (err, isValid) => {
        if (err) {
          reject(err);
        }
        resolve(isValid);
      }
    );
  });
}

/**
 * Ensure that the files keep watched for changes
 * and will trigger a recompile
 *
 * @param {WebpackCompilation} mainCompilation
 * @param {{fileDependencies: string[], contextDependencies: string[], missingDependencies: string[]}} fileDependencies
 */
export function watchFiles(mainCompilation, fileDependencies) {
  Object.keys(fileDependencies).forEach((decencyTypes) => {
    fileDependencies[decencyTypes].forEach((fileDependency) => {
      mainCompilation[decencyTypes].add(fileDependency);
    });
  });
}
