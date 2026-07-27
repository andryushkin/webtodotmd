export interface PageMeta {
  title: string;
  url: string;
  date: string; // ISO 8601
}

export interface CaptureSelectionRequest {
  type: 'CAPTURE_SELECTION';
  /**
   * The shallowest heading level the panel already holds for this page, so a
   * second press is shifted by what the first was shifted by. Absent on the
   * first press, and whenever the panel is empty or the page has changed.
   */
  headingBase?: number;
}

export interface CaptureSelectionResponse {
  md: string;
  meta: PageMeta;
  /** The markup the conversion was given, when Settings.showHtmlView is on. */
  html?: string;
  /**
   * The shallowest heading level in what was just captured, before any shift.
   * The panel keeps the smallest it has seen and sends it back as
   * `headingBase`; absent where the capture holds no heading.
   */
  topLevel?: number;
}

export interface CaptureErrorResponse {
  error: 'NO_SELECTION' | 'CONVERSION_ERROR';
}

export interface CaptureAndCopyRequest {
  type: 'CAPTURE_AND_COPY';
}

export interface OpenAndCaptureRequest {
  type: 'OPEN_AND_CAPTURE';
}

export interface ToggleHighlighterRequest {
  type: 'TOGGLE_HIGHLIGHTER';
  active: boolean;
  color?: string;
}

export interface CaptureHighlightsRequest {
  type: 'CAPTURE_HIGHLIGHTS';
  /** As `CaptureSelectionRequest.headingBase`. */
  headingBase?: number;
}

export interface ClearHighlightsRequest {
  type: 'CLEAR_HIGHLIGHTS';
}

export interface HighlightCountMessage {
  type: 'HIGHLIGHT_COUNT';
  count: number;
}

export interface GetHighlighterStateRequest {
  type: 'GET_HIGHLIGHTER_STATE';
}

export interface HighlighterStateResponse {
  active: boolean;
  count: number;
}

export type RequestMessage =
  | CaptureSelectionRequest
  | CaptureAndCopyRequest
  | OpenAndCaptureRequest
  | ToggleHighlighterRequest
  | CaptureHighlightsRequest
  | ClearHighlightsRequest
  | GetHighlighterStateRequest;

export type ResponseMessage = CaptureSelectionResponse | CaptureErrorResponse;
