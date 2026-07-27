export interface PageMeta {
  title: string;
  url: string;
  date: string; // ISO 8601
}

export interface CaptureSelectionRequest {
  type: 'CAPTURE_SELECTION';
}

export interface CaptureSelectionResponse {
  md: string;
  meta: PageMeta;
  /** The markup the conversion was given, when Settings.showHtmlView is on. */
  html?: string;
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
