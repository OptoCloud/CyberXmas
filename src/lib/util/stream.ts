// Read untrusted bodies without buffering more than a fixed number of bytes.

export class TooLargeError extends Error {
  constructor(limit: number) {
    super(`Body exceeds ${limit} bytes`);
    this.name = 'TooLargeError';
  }
}

export async function readBoundedText(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new TooLargeError(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readBoundedText(stream, maxBytes));
}
