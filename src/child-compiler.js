// Import types
/** @typedef {import('webpack/lib/Compiler')} WebpackCompiler */
/** @typedef {import('webpack/lib/Compilation')} WebpackCompilation */
/** @typedef {import('webpack/lib/Chunk')} WebpackChunk */
/** @typedef {import('webpack/lib/FileSystemInfo').Snapshot} Snapshot */
/** @typedef {import('./child-compiler').ChildCompilationResultEntry} ChildCompilationResultEntry */
/** @typedef {import('./child-compiler').ChildCompilationResult} ChildCompilationResult */
/** @typedef {import('./child-compiler').FileDependencies} FileDependencies */
/** @typedef {import('./child-compiler').PersistentChildCompilation} PersistentChildCompilation */

import {
  createSnapshot,
  isSnapShotValid,
  watchFiles,
} from './file-watcher-api';

/**
 * This plugin is a singleton for performance reasons.
 * To keep track if a plugin does already exist for the compiler they are cached
 * in this map
 * @type {WeakMap<WebpackCompiler, PersistentChildCompilerSingletonPlugin>}}
 */
const compilerMap = new WeakMap();

export class CachedChildCompilation {
  /** @param {WebpackCompiler} compiler */
  constructor(compiler) {
    /**
     * @private
     * @type {WebpackCompiler}
     */
    this.compiler = compiler;
    // Create a singleton instance for the compiler
    // if there is none
    if (compilerMap.has(compiler)) {
      return;
    }
    const persistentChildCompilerSingletonPlugin = new PersistentChildCompilerSingletonPlugin();
    compilerMap.set(compiler, persistentChildCompilerSingletonPlugin);
    persistentChildCompilerSingletonPlugin.apply(compiler);
  }

  /**
   * apply is called by the webpack main compiler during the start phase
   * @param {string} entry
   */
  addEntry(entry) {
    const persistentChildCompilerSingletonPlugin = compilerMap.get(
      this.compiler
    );
    if (!persistentChildCompilerSingletonPlugin) {
      throw new Error(
        'PersistentChildCompilerSingletonPlugin instance not found.'
      );
    }
    persistentChildCompilerSingletonPlugin.addEntry(entry);
  }

  getCompilationResult() {
    const persistentChildCompilerSingletonPlugin = compilerMap.get(
      this.compiler
    );
    if (!persistentChildCompilerSingletonPlugin) {
      throw new Error(
        'PersistentChildCompilerSingletonPlugin instance not found.'
      );
    }
    return persistentChildCompilerSingletonPlugin.getLatestResult();
  }

  /**
   * Returns the result for the given entry
   * @param {string} entry
   * @returns {ChildCompilationResult}
   */
  getCompilationEntryResult(entry) {
    const latestResult = this.getCompilationResult();
    const compilationResult = latestResult.compilationResult;
    return 'error' in compilationResult
      ? {
          mainCompilationHash: latestResult.mainCompilationHash,
          error: compilationResult.error,
        }
      : {
          mainCompilationHash: latestResult.mainCompilationHash,
          compiledEntry: compilationResult.compiledEntries[entry],
        };
  }
}

class PersistentChildCompilerSingletonPlugin {
  constructor() {
    /**
     * @private
     * @type {PersistentChildCompilation}
     * the internal compilation state
     */
    this.compilation = {
      isCompiling: false,
      isVerifyingCache: false,
      entries: [],
      compiledEntries: [],
      mainCompilationHash: 'initial',
      compilationResult: {
        dependencies: {
          fileDependencies: [],
          contextDependencies: [],
          missingDependencies: [],
        },
        compiledEntries: {},
      },
    };
  }

  /**
   * apply is called by the webpack main compiler during the start phase
   * @param {WebpackCompiler} compiler
   */
  apply(compiler) {
    /** @type {Promise<ChildCompilationResult>} */
    let childCompilationResultPromise = Promise.resolve({
      dependencies: {
        fileDependencies: [],
        contextDependencies: [],
        missingDependencies: [],
      },
      compiledEntries: {},
    });
    /**
     * The main compilation hash which will only be updated
     * if the childCompiler changes
     */
    let mainCompilationHashOfLastChildRecompile = '';
    /** @type {Snapshot|undefined} */
    let previousFileSystemSnapshot;
    let compilationStartTime = Date.now();

    compiler.hooks.make.tapAsync(
      'PersistentChildCompilerSingletonPlugin',
      (mainCompilation, callback) => {
        if (this.compilation.isCompiling || this.compilation.isVerifyingCache) {
          return callback(new Error('Child compilation has already started'));
        }

        // Update the time to the current compile start time
        compilationStartTime = Date.now();

        // The compilation starts - adding new templates is now not possible anymore
        this.compilation = {
          isCompiling: false,
          isVerifyingCache: true,
          previousEntries: this.compilation.compiledEntries,
          previousResult: this.compilation.compilationResult,
          entries: this.compilation.entries,
        };

        // Validate cache:
        const isCacheValidPromise = this.isCacheValid(
          previousFileSystemSnapshot,
          mainCompilation
        );

        let cachedResult = childCompilationResultPromise;
        childCompilationResultPromise = isCacheValidPromise.then(
          (isCacheValid) => {
            // Reuse cache
            if (isCacheValid) {
              return cachedResult;
            }
            // Start the compilation
            const compiledEntriesPromise = this.compileEntries(
              mainCompilation,
              this.compilation.entries
            );
            // Update snapshot as soon as we know the file dependencies
            // this might possibly cause bugs if files were changed in-between
            // compilation start and snapshot creation
            compiledEntriesPromise
              .then((childCompilationResult) => {
                return createSnapshot(
                  childCompilationResult.dependencies,
                  mainCompilation,
                  compilationStartTime
                );
              })
              .then((snapshot) => {
                previousFileSystemSnapshot = snapshot;
              });
            return compiledEntriesPromise;
          }
        );

        // Add files to compilation which needs to be watched:
        mainCompilation.hooks.optimizeTree.tapAsync(
          'PersistentChildCompilerSingletonPlugin',
          (chunks, modules, callback) => {
            const handleCompilationDonePromise = childCompilationResultPromise.then(
              (childCompilationResult) => {
                this.watchFiles(
                  mainCompilation,
                  childCompilationResult.dependencies
                );
              }
            );
            handleCompilationDonePromise.then(
              () => callback(null, chunks, modules),
              callback
            );
          }
        );

        // Store the final compilation once the main compilation hash is known
        mainCompilation.hooks.additionalAssets.tapAsync(
          'PersistentChildCompilerSingletonPlugin',
          (callback) => {
            const didRecompilePromise = Promise.all([
              childCompilationResultPromise,
              cachedResult,
            ]).then(([childCompilationResult, cachedResult]) => {
              // Update if childCompilation changed
              return cachedResult !== childCompilationResult;
            });

            const handleCompilationDonePromise = Promise.all([
              childCompilationResultPromise,
              didRecompilePromise,
            ]).then(([childCompilationResult, didRecompile]) => {
              // Update hash and snapshot if childCompilation changed
              if (didRecompile) {
                mainCompilationHashOfLastChildRecompile = mainCompilation.hash;
              }
              this.compilation = {
                isCompiling: false,
                isVerifyingCache: false,
                entries: this.compilation.entries,
                compiledEntries: this.compilation.entries,
                compilationResult: childCompilationResult,
                mainCompilationHash: mainCompilationHashOfLastChildRecompile,
              };
            });
            handleCompilationDonePromise.then(() => callback(null), callback);
          }
        );

        // Continue compilation:
        callback(null);
      }
    );
  }

  /**
   * Add a new entry to the next compile run
   * @param {string} entry
   */
  addEntry(entry) {
    if (this.compilation.isCompiling || this.compilation.isVerifyingCache) {
      throw new Error(
        "The child compiler has already started to compile. Please add entries before the main compiler 'make' phase has started or after the compilation is done."
      );
    }
    if (this.compilation.entries.indexOf(entry) === -1) {
      this.compilation.entries = [...this.compilation.entries, entry];
    }
  }

  getLatestResult() {
    if (this.compilation.isCompiling || this.compilation.isVerifyingCache) {
      throw new Error(
        "The child compiler is not done compiling. Please access the result after the compiler 'make' phase has started or after the compilation is done."
      );
    }
    return {
      mainCompilationHash: this.compilation.mainCompilationHash,
      compilationResult: this.compilation.compilationResult,
    };
  }

  /**
   * Verify that the cache is still valid
   * @private
   * @param {Snapshot | undefined} snapshot
   * @param {WebpackCompilation} mainCompilation
   * @returns {Promise<boolean>}
   */
  isCacheValid(snapshot, mainCompilation) {
    if (!this.compilation.isVerifyingCache) {
      return Promise.reject(
        new Error(
          'Cache validation can only be done right before the compilation starts'
        )
      );
    }
    // If there are no entries we don't need a new child compilation
    if (this.compilation.entries.length === 0) {
      return Promise.resolve(true);
    }
    // If there are new entries the cache is invalid
    if (this.compilation.entries !== this.compilation.previousEntries) {
      return Promise.resolve(false);
    }
    // Mark the cache as invalid if there is no snapshot
    if (!snapshot) {
      return Promise.resolve(false);
    }
    return isSnapShotValid(snapshot, mainCompilation);
  }

  /**
   * Start to compile all templates
   *
   * @private
   * @param {WebpackCompilation} mainCompilation
   * @param {string[]} entries
   * @returns {Promise<ChildCompilationResult>}
   */
  compileEntries(mainCompilation, entries) {
    const compiler = new HtmlEntryChildCompiler(entries);
    return compiler.compileTemplates(mainCompilation).then(
      (result) => {
        return {
          // The compiled sources to render the content
          compiledEntries: result,
          // The file dependencies to find out if a
          // recompilation is required
          dependencies: compiler.fileDependencies,
          // The main compilation hash can be used to find out
          // if this compilation was done during the current compilation
          mainCompilationHash: mainCompilation.hash,
        };
      },
      (error) => ({
        // The compiled sources to render the content
        error,
        // The file dependencies to find out if a
        // recompilation is required
        dependencies: compiler.fileDependencies,
        // The main compilation hash can be used to find out
        // if this compilation was done during the current compilation
        mainCompilationHash: mainCompilation.hash,
      })
    );
  }

  /**
   * @private
   * @param {WebpackCompilation} mainCompilation
   * @param {FileDependencies} files
   */
  watchFiles(mainCompilation, files) {
    watchFiles(mainCompilation, files);
  }
}

let instanceId = 0;

/**
 * This compiler uses webpack to compile a template with a child compiler.
 *
 * [TEMPLATE] -> [JAVASCRIPT]
 *
 * The HtmlEntryChildCompiler is a helper to allow reusing one childCompiler
 * for multiple HtmlEntryPlugin instances to improve the compilation performance.
 */
export class HtmlEntryChildCompiler {
  /**
   * @param {string[]} templates
   */
  constructor(templates) {
    // Id for this ChildCompiler
    this.id = instanceId++;
    /**
     * @type {string[]} templateIds
     * The template array will allow us to keep track which input generated which output
     */
    this.templates = templates;
    /**
     * @type {Promise<{[templatePath: string]: { content: string, hash: string, entry: WebpackChunk }}>}
     */
    this.compilationPromise;
    /**
     * @type {number}
     */
    this.compilationStartedTimestamp;
    /**
     * @type {number}
     */
    this.compilationEndedTimestamp;
    /**
     * All file dependencies of the child compiler
     * @type {FileDependencies}
     */
    this.fileDependencies = {
      fileDependencies: [],
      contextDependencies: [],
      missingDependencies: [],
    };
  }

  /**
   * Returns true if the childCompiler is currently compiling
   * @returns {boolean}
   */
  isCompiling() {
    return !this.didCompile() && this.compilationStartedTimestamp !== undefined;
  }

  /**
   * Returns true if the childCompiler is done compiling
   */
  didCompile() {
    return this.compilationEndedTimestamp !== undefined;
  }

  /**
   * This function will start the template compilation
   * once it is started no more templates can be added
   *
   * @param {import('webpack').Compilation} mainCompilation
   * @returns {Promise<{[templatePath: string]: { content: string, hash: string, entry: WebpackChunk }}>}
   */
  compileTemplates(mainCompilation) {
    const webpack = mainCompilation.compiler.webpack;
    const Compilation = webpack.Compilation;

    const NodeTemplatePlugin = webpack.node.NodeTemplatePlugin;
    const NodeTargetPlugin = webpack.node.NodeTargetPlugin;
    const LoaderTargetPlugin = webpack.LoaderTargetPlugin;
    const EntryPlugin = webpack.EntryPlugin;

    // To prevent multiple compilations for the same template
    // the compilation is cached in a promise.
    // If it already exists return
    if (this.compilationPromise) {
      return this.compilationPromise;
    }

    const outputOptions = {
      filename: '__child-[name]',
      publicPath: '',
      library: {
        type: 'var',
        name: 'HTML_ENTRY_PLUGIN_RESULT',
      },
      scriptType: /** @type {'text/javascript'} */ ('text/javascript'),
      iife: true,
    };
    const compilerName = 'HtmlEntryCompiler';
    // Create an additional child compiler which takes the template
    // and turns it into an Node.JS html factory.
    // This allows us to use loaders during the compilation
    const childCompiler = mainCompilation.createChildCompiler(
      compilerName,
      outputOptions,
      [
        // Compile the template to nodejs javascript
        new NodeTargetPlugin(),
        new NodeTemplatePlugin(),
        new LoaderTargetPlugin('node'),
        new webpack.library.EnableLibraryPlugin('var'),
      ]
    );
    // The file path context which webpack uses to resolve all relative files to
    childCompiler.context = mainCompilation.compiler.context;

    // Generate output file names
    const temporaryTemplateNames = this.templates.map(
      (template, index) => `__child-HtmlEntryPlugin_${index}-${this.id}`
    );

    // Add all templates
    this.templates.forEach((template, index) => {
      new EntryPlugin(
        childCompiler.context,
        'data:text/javascript,__webpack_public_path__ = __webpack_base_uri__ = htmlEntryPluginPublicPath;',
        `HtmlEntryPlugin_${index}-${this.id}`
      ).apply(childCompiler);
      new EntryPlugin(
        childCompiler.context,
        template,
        `HtmlEntryPlugin_${index}-${this.id}`
      ).apply(childCompiler);
    });

    // The templates are compiled and executed by NodeJS - similar to server side rendering
    // Unfortunately this causes issues as some loaders require an absolute URL to support ES Modules
    // The following config enables relative URL support for the child compiler
    childCompiler.options.module = { ...childCompiler.options.module };
    childCompiler.options.module.parser = {
      ...childCompiler.options.module.parser,
    };
    childCompiler.options.module.parser.javascript = {
      ...childCompiler.options.module.parser.javascript,
      url: 'relative',
    };

    this.compilationStartedTimestamp = Date.now();
    this.compilationPromise = new Promise((resolve, reject) => {
      const extractedAssets = [];
      childCompiler.hooks.thisCompilation.tap(
        'HtmlEntryPlugin',
        (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: 'HtmlEntryPlugin',
              stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
            },
            (assets) => {
              temporaryTemplateNames.forEach((temporaryTemplateName) => {
                if (assets[temporaryTemplateName]) {
                  extractedAssets.push(assets[temporaryTemplateName]);
                  compilation.deleteAsset(temporaryTemplateName);
                }
              });
            }
          );
        }
      );

      childCompiler.runAsChild((err, entries, childCompilation) => {
        // Extract templates
        const compiledTemplates = entries
          ? extractedAssets.map((asset) => asset.source())
          : [];
        // Extract file dependencies
        if (entries && childCompilation) {
          this.fileDependencies = {
            fileDependencies: Array.from(childCompilation.fileDependencies),
            contextDependencies: Array.from(
              childCompilation.contextDependencies
            ),
            missingDependencies: Array.from(
              childCompilation.missingDependencies
            ),
          };
        }
        // Reject the promise if the childCompilation contains error
        if (
          childCompilation &&
          childCompilation.errors &&
          childCompilation.errors.length
        ) {
          const errorDetails = childCompilation.errors
            .map((error) => {
              let message = error.message;
              if (error.stack) {
                message += '\n' + error.stack;
              }
              return message;
            })
            .join('\n');
          reject(new Error(`Child compilation failed:\n${errorDetails}`));
          return;
        }
        // Reject if the error object contains errors
        if (err) {
          reject(err);
          return;
        }
        if (!childCompilation || !entries) {
          reject(new Error('Empty child compilation'));
          return;
        }
        /**
         * @type {{[templatePath: string]: { content: string, hash: string, entry: WebpackChunk }}}
         */
        const result = {};
        compiledTemplates.forEach((templateSource, entryIndex) => {
          // The compiledTemplates are generated from the entries added in
          // the addTemplate function.
          // Therefore the array index of this.templates should be the as entryIndex.
          result[this.templates[entryIndex]] = {
            content: templateSource,
            hash: childCompilation.hash || 'XXXX',
            entry: entries[entryIndex],
          };
        });
        this.compilationEndedTimestamp = Date.now();
        resolve(result);
      });
    });

    return this.compilationPromise;
  }
}
