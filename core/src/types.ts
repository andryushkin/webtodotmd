export type DOMAdapterFn = (html: string) => Document;

export interface Rule {
  name: string;
  filter: string | string[] | ((el: Element) => boolean);
  replacement: (el: Element, childContent: string, options: MarkItDownOptions) => string;
}

export interface MarkItDownOptions {
  baseUrl?: string;
  math?: boolean;
  footnotes?: boolean;
  complexTableFallback?: 'html' | 'text' | 'skip';
  rules?: Rule[];
  domAdapter?: DOMAdapterFn;
  headingOffset?: number; // Phase 8: сдвиг уровней заголовков для selectionToMarkdown
}
