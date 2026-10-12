/**
 * Where signature PNG bytes live. The database only stores the `key`.
 * To move to S3/R2 later, implement this interface; nothing else in the app changes.
 */
export interface StorageAdapter {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
}
