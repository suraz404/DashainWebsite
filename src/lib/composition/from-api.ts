import type { SignatureInput } from "./types";

/** Shape returned by GET /api/signatures and `SignatureService.listApprovedForPoster()`. */
export interface PosterSignatureDTO {
  id: string;
  width: number;
  height: number;
  createdAt: string;
}

export const signatureImageUrl = (id: string) => `/api/signatures/${id}`;

/** Maps API records to engine input. `createdAt` becomes the arrival `sequence`. */
export function toSignatureInput(d: PosterSignatureDTO): SignatureInput {
  return {
    id: d.id,
    src: signatureImageUrl(d.id),
    naturalWidth: d.width,
    naturalHeight: d.height,
    sequence: Date.parse(d.createdAt) || 0,
  };
}
