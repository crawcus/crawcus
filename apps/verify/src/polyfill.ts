// @crawcus/verifier reads the global Node `Buffer` for base64; give the browser one.
import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
