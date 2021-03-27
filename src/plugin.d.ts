import { Compiler, Compilation, EntryObject } from 'webpack';
import { Options as HtmlMinifierOptions } from 'html-minifier-terser';
import { Hooks as HtmlEntryPluginHooks } from './hooks';
import { HtmlTagObject as HtmlTag } from './html-tag';

declare class HtmlEntryPlugin {
  constructor(options?: HtmlEntryPlugin.Options);

  apply(compiler: Compiler): void;

  /** Current HtmlEntryPlugin version */
  version: string;

  static resolve(options: HtmlEntryPlugin.ResolveOptions): Promise<EntryObject>;
  static resolve(
    pattern: string,
    options?: HtmlEntryPlugin.ResolveOptions
  ): Promise<EntryObject>;

  static getHooks(compilation: Compilation): HtmlEntryPlugin.Hooks;

  /**
   * Static helper to create a tag object to be get injected into the dom
   */
  static createHtmlTagObject(
    tagName: string,
    attributes?: { [attributeName: string]: string | boolean },
    innerHTML?: string
  ): HtmlEntryPlugin.HtmlTagObject;

  static readonly version: string;
}

declare interface HtmlEntryPluginResolveOptions {
  entry: string | string[];
  context: string;
}

declare namespace HtmlEntryPlugin {
  type MinifyOptions = HtmlMinifierOptions;

  interface SourceOptions {
    list?: Array<{ tag: string; attribute: string; type: 'src' | 'srcset' }>;
    urlFilter?: (
      attribute: string,
      value: string,
      resourcePath: string
    ) => boolean;
  }

  interface ProcessedOptions {
    /**
     * The context to resolve html entry files.
     * @default {compiler.context}
     */
    context: string;
    /**
     * Emit the file only if it was changed.
     * @default true
     */
    cache: boolean;
    /**
     * The cache directory for cache-loader
     */
    cacheDirectory: string;
    /**
     * The cache identifier for cache-loader
     */
    cacheIdentifier: string;
    /**
     * The file to write the HTML to.
     * Supports subdirectories eg: `html/[name].html`
     * [name] will be replaced by the entry name
     * Supports a function to generate the name
     *
     * @default '[name].html'
     */
    filename: string | ((entryName: string) => string);
    /**
     * By default the public path is set to `auto` - that way the HtmlEntryPlugin will try
     * to set the publicPath according to the current filename and the webpack publicPath setting
     */
    publicPath: string | 'auto';
    /**
     * If `true` then append a unique `webpack` compilation hash to all included scripts and CSS files.
     * This is useful for cache busting
     */
    hash: boolean;
    /**
     * Inject all assets into the template.
     */
    inject:
      | false // Don't inject scripts
      | true // Inject scripts into body
      | 'body' // Inject scripts into body
      | 'head'; // Inject scripts into head
    /**
     * Set up script loading
     * blocking will result in <script src="..."></script>
     * defer will result in <script defer src="..."></script>
     *
     * @default 'defer'
     */
    scriptLoading: 'blocking' | 'defer';
    /**
     * HTML Minification options accepts the following values:
     * - Set to `false` to disable minification
     * - Set to `'auto'` to enable minification only for production mode
     * - Set to custom minification according to
     * {@link https://github.com/kangax/html-minifier#options-quick-reference}
     */
    minify: 'auto' | boolean | MinifyOptions;
    /**
     * Render errors into the HTML page
     */
    showErrors: boolean;
    /**
     * HTML attributes options to specific which source should be bundled or exclude.
     */
    sources: SourceOptions;
  }

  type Options = Partial<ProcessedOptions>;

  type ResolveOptions = Partial<HtmlEntryPluginResolveOptions>;

  type Hooks = HtmlEntryPluginHooks;

  type HtmlTagObject = HtmlTag;
}

export = HtmlEntryPlugin;
