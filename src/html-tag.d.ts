export interface HtmlTagObject {
  /**
   * Attributes of the html tag
   * E.g. `{'disabled': true, 'value': 'demo'}`
   */
  attributes: {
    [attributeName: string]: string | boolean | null | undefined;
  };
  /**
   * The tag name e.g. `'div'`
   */
  tagName: string;
  /**
   * The inner HTML
   */
  innerHTML?: string;
  /**
   * Whether this html must not contain innerHTML
   * @see https://www.w3.org/TR/html5/syntax.html#void-elements
   */
  voidTag: boolean;
  /**
   * Meta information about the tag
   * E.g. `{'plugin': 'HtmlEntryPlugin'}`
   */
  meta: {
    plugin?: string;
    [metaAttributeName: string]: any;
  };
}

export function createHtmlTagObject(
  tagName: string,
  attributes?: { [attributeName: string]: string | boolean },
  innerHTML?: string,
  meta?: { [content: string]: string | boolean }
): HtmlTagObject;
