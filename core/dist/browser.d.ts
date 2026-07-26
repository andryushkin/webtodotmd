type DOMAdapterFn = (html: string) => Document;
interface Rule {
    name: string;
    filter: string | string[] | ((el: Element) => boolean);
    replacement: (el: Element, childContent: string, options: MarkItDownOptions) => string;
}
interface MarkItDownOptions {
    baseUrl?: string;
    math?: boolean;
    footnotes?: boolean;
    complexTableFallback?: 'html' | 'text' | 'skip';
    rules?: Rule[];
    domAdapter?: DOMAdapterFn;
    headingOffset?: number;
}

declare function toMarkdown(input: string | Node, options?: MarkItDownOptions): string;
declare function selectionToMarkdown(selection: Selection, options?: MarkItDownOptions): string;

export { type DOMAdapterFn, type MarkItDownOptions, type Rule, selectionToMarkdown, toMarkdown };
