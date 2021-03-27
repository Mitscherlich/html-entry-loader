/** @typedef {import('webpack/lib/Compilation')} WebpackCompilation */
/** @typedef {import('./hooks').Hooks} HtmlEntryPluginHooks */
/** @typedef {import('./plugin')} HtmlEntryPlugin */

import { AsyncSeriesWaterfallHook } from 'tapable';

// For the TypeScript definition, see the Hooks type in hooks.d.ts

/**
 * @type {WeakMap<WebpackCompilation, HtmlEntryPluginHooks>}}
 */
const htmlEntryPluginHooksMap = new WeakMap();

/**
 * Returns all public hooks of the html webpack plugin for the given compilation
 *
 * @param {WebpackCompilation} compilation
 * @returns {HtmlEntryPluginHooks}
 */
export function getHtmlEntryPluginHooks(compilation) {
  let hooks = htmlEntryPluginHooksMap.get(compilation);
  // Setup the hooks only once
  if (hooks === undefined) {
    hooks = createHtmlEntryPluginHooks();
    htmlEntryPluginHooksMap.set(compilation, hooks);
  }
  return hooks;
}

/**
 * Add hooks to the webpack compilation object to allow foreign plugins to
 * extend the HtmlEntryPlugin
 *
 * @returns {HtmlEntryPluginHooks}
 */
function createHtmlEntryPluginHooks() {
  return {
    beforeAssetTagGeneration: new AsyncSeriesWaterfallHook(['pluginArgs']),
    alterAssetTags: new AsyncSeriesWaterfallHook(['pluginArgs']),
    alterAssetTagGroups: new AsyncSeriesWaterfallHook(['pluginArgs']),
    afterTemplateExecution: new AsyncSeriesWaterfallHook(['pluginArgs']),
    beforeEmit: new AsyncSeriesWaterfallHook(['pluginArgs']),
    afterEmit: new AsyncSeriesWaterfallHook(['pluginArgs']),
  };
}
