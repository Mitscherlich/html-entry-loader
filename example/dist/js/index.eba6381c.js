/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./example/main.js":
/*!*************************!*\
  !*** ./example/main.js ***!
  \*************************/
/***/ (() => {

eval("\n\n//# sourceURL=webpack://html-entry-loader/./example/main.js?");

/***/ }),

/***/ "./example/index.html":
/*!****************************!*\
  !*** ./example/index.html ***!
  \****************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("// Imports\nvar ___HEL_GET_SOURCE_FROM_IMPORT___ = __webpack_require__(/*! ../lib/runtime/getUrl.js */ \"./lib/runtime/getUrl.js\");\nvar ___HTML_ENTRY_LOADER_IMPORT_0___ = __webpack_require__(/*! ../node_modules/normalize.css */ \"./node_modules/normalize.css/normalize.css\");\nvar ___HTML_ENTRY_LOADER_IMPORT_1___ = __webpack_require__(/*! ./style.less */ \"./example/style.less\");\nvar ___HTML_ENTRY_LOADER_IMPORT_2___ = __webpack_require__(/*! ./main.js */ \"./example/main.js\");\n// Module\nvar ___HTML_LOADER_REPLACEMENT_0___ = ___HEL_GET_SOURCE_FROM_IMPORT___(___HTML_ENTRY_LOADER_IMPORT_0___);\nvar ___HTML_LOADER_REPLACEMENT_1___ = ___HEL_GET_SOURCE_FROM_IMPORT___(___HTML_ENTRY_LOADER_IMPORT_1___);\nvar ___HTML_LOADER_REPLACEMENT_2___ = ___HEL_GET_SOURCE_FROM_IMPORT___(___HTML_ENTRY_LOADER_IMPORT_2___);\nvar code = \"<html lang=\\\"en\\\"><head>\\n    <meta charset=\\\"UTF-8\\\">\\n    <meta http-equiv=\\\"X-UA-Compatible\\\" content=\\\"IE=edge\\\">\\n    <meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1.0\\\">\\n    <title>HtmlEntry Loader demo</title>\\n    <!-- import normal.css from node_modules -->\\n    \\n    \\n  </head>\\n  <body>\\n    <div id=\\\"app\\\">\\n      <iframe src=\\\"/html/pages/about.html\\\" frameborder=\\\"0\\\"></iframe>\\n    </div>\\n    \\n  \\n\\n</body></html>\";\n// Exports\nmodule.exports = code;\n\n//# sourceURL=webpack://html-entry-loader/./example/index.html?");

/***/ }),

/***/ "./lib/runtime/getUrl.js":
/*!*******************************!*\
  !*** ./lib/runtime/getUrl.js ***!
  \*******************************/
/***/ ((module) => {

"use strict";
eval("\n\nmodule.exports = (url, options) => {\n  if (!options) {\n    options = {};\n  }\n\n  if (!url) {\n    return url;\n  }\n\n  url = String(url.__esModule ? url.default : url);\n\n  if (options.hash) {\n    url += options.hash;\n  }\n\n  if (options.maybeNeedQuotes && /[\\t\\n\\f\\r \"'=<>`]/.test(url)) {\n    return `\"${url}\"`;\n  }\n\n  return url;\n};\n\n//# sourceURL=webpack://html-entry-loader/./lib/runtime/getUrl.js?");

/***/ }),

/***/ "./example/style.less":
/*!****************************!*\
  !*** ./example/style.less ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n// extracted by mini-css-extract-plugin\n\n\n//# sourceURL=webpack://html-entry-loader/./example/style.less?");

/***/ }),

/***/ "./node_modules/normalize.css/normalize.css":
/*!**************************************************!*\
  !*** ./node_modules/normalize.css/normalize.css ***!
  \**************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n// extracted by mini-css-extract-plugin\n\n\n//# sourceURL=webpack://html-entry-loader/./node_modules/normalize.css/normalize.css?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./example/index.html");
/******/ 	
/******/ })()
;