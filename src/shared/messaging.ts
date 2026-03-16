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
}

export interface CaptureErrorResponse {
  error: 'NO_SELECTION' | 'CONVERSION_ERROR';
}

export interface CaptureAndCopyRequest {
  type: 'CAPTURE_AND_COPY';
}

export type RequestMessage = CaptureSelectionRequest | CaptureAndCopyRequest;
export type ResponseMessage = CaptureSelectionResponse | CaptureErrorResponse;
