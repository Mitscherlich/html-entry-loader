import { Compilation as WebpackCompilation } from 'webpack';
import { AsyncSeriesWaterfallHook } from 'tapable';
import { HtmlTagObject } from './html-tag';
import HtmlEntryPlugin from './plugin';

export interface Hooks {
  alterAssetTags: AsyncSeriesWaterfallHook<{
    assetTags: {
      scripts: HtmlTagObject[];
      styles: HtmlTagObject[];
      meta: HtmlTagObject[];
    };
    publicPath: string;
    outputName: string;
    plugin: HtmlWebpackPlugin;
  }>;

  alterAssetTagGroups: AsyncSeriesWaterfallHook<{
    headTags: HtmlTagObject[];
    bodyTags: HtmlTagObject[];
    outputName: string;
    publicPath: string;
    plugin: HtmlEntryPlugin;
  }>;

  afterTemplateExecution: AsyncSeriesWaterfallHook<{
    html: string;
    headTags: HtmlTagObject[];
    bodyTags: HtmlTagObject[];
    outputName: string;
    plugin: HtmlEntryPlugin;
  }>;

  beforeAssetTagGeneration: AsyncSeriesWaterfallHook<{
    assets: {
      publicPath: string;
      js: Array<string>;
      css: Array<string>;
      favicon?: string;
      manifest?: string;
    };
    outputName: string;
    plugin: HtmlEntryPlugin;
  }>;

  beforeEmit: AsyncSeriesWaterfallHook<{
    html: string;
    outputName: string;
    plugin: HtmlEntryPlugin;
  }>;

  afterEmit: AsyncSeriesWaterfallHook<{
    outputName: string;
    plugin: HtmlEntryPlugin;
  }>;
}

export function getHtmlEntryPluginHooks(compilation: WebpackCompilation): Hooks;
