/** 
 * Turn arbitrary Buffers into a stream of properly-aligned Base64 strings,
 * padding only on flush().
 */
class Base64Encoder {
  private leftover = Buffer.alloc(0);

  /**
   * Take the next raw chunk, and return **only** the bytes
   * that form complete 3-byte groups encoded to Base64.
   * Any 1–2 trailing bytes are held over.
   */
  encode(chunk: Buffer): string {
    const buf = Buffer.concat([this.leftover, chunk]);
    const completeLen = buf.length - (buf.length % 3);
    // bytes[0..completeLen) → Base64, remainder held
    const toEncode = buf.slice(0, completeLen);
    this.leftover = buf.slice(completeLen);
    return toEncode.toString('base64');
  }

  /**
   * Emit the final leftover bytes (1–2 bytes), Base64-padded with '='.
   */
  flush(): string {
    const b64 = this.leftover.toString('base64');
    this.leftover = Buffer.alloc(0);
    return b64;
  }
}

export { Base64Encoder };
