export type SignatureExportErrorCode =
  | "INVALID_OPTIONS" // a limit/option is not a sane integer or contradicts another
  | "INVALID_INPUT" // not a usable canvas, or pixel buffer doesn't match its dimensions
  | "INVALID_CANVAS_SIZE" // width/height is 0, negative, fractional or NaN
  | "INPUT_TOO_LARGE" // canvas exceeds maxInput* limits
  | "EMPTY_SIGNATURE" // fewer than minVisiblePixels visible pixels
  | "OUTPUT_TOO_LARGE" // cropped+padded image exceeds maxOutput* limits
  | "OUTPUT_TOO_HEAVY" // encoded PNG exceeds maxOutputBytes
  | "ENCODE_FAILED" // browser produced no blob, or not a PNG
  | "UNSUPPORTED_ENVIRONMENT"; // no DOM canvas available (e.g. called on the server)

/** One error class with a stable `code`, so UI can branch on `code` instead of parsing messages. */
export class SignatureExportError extends Error {
  readonly code: SignatureExportErrorCode;
  constructor(code: SignatureExportErrorCode, message: string) {
    super(message);
    this.name = "SignatureExportError";
    this.code = code;
  }
}
