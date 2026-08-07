// tests/helpers/image.ts
// Author: integration-tester
// Created: 2026-07-26
//
// Dependency-free image introspection for screenshot assertions.
// We decode only the header bytes we need, so the tests never pull in an
// image library and never depend on the server's own encoder metadata.

/** Detected container format of a screenshot buffer. */
export type ImageFormat = "png" | "jpeg" | "unknown";

/** Pixel dimensions decoded straight from an image header. */
export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True when the buffer starts with the 8-byte PNG signature. */
export function isPng(buf: Uint8Array): boolean {
  if (buf.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, i) => buf[i] === byte);
}

/** True when the buffer starts with the JPEG SOI marker (FF D8 FF). */
export function isJpeg(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 &&
    buf[2] === 0xff;
}

/** Classify a buffer by magic bytes alone — never by Content-Type. */
export function detectFormat(buf: Uint8Array): ImageFormat {
  if (isPng(buf)) return "png";
  if (isJpeg(buf)) return "jpeg";
  return "unknown";
}

/**
 * Read width/height from a PNG IHDR chunk.
 *
 * Layout: 8-byte signature, 4-byte chunk length, 4-byte "IHDR" type, then
 * width and height as big-endian uint32 at offsets 16 and 20.
 */
function readPngSize(buf: Uint8Array): ImageSize {
  if (buf.length < 24) {
    throw new Error(`PNG buffer too short to contain IHDR: ${buf.length} bytes`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

/**
 * Read width/height from the first JPEG Start-Of-Frame segment.
 *
 * We walk the marker chain rather than guessing an offset, because JPEGs
 * emitted by Chromium carry a variable number of APPn/DQT segments up front.
 */
function readJpegSize(buf: Uint8Array): ImageSize {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Start just past the SOI marker.
  let offset = 2;

  while (offset + 9 < buf.length) {
    // Markers are 0xFF followed by a non-0xFF, non-zero type byte. Fill bytes
    // (repeated 0xFF) are legal padding and must be skipped.
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    let marker = buf[offset + 1];
    while (marker === 0xff && offset + 2 < buf.length) {
      offset++;
      marker = buf[offset + 1];
    }
    // Standalone markers carry no length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const segmentLength = view.getUint16(offset + 2, false);

    // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 all carry dimensions.
    // 0xC4 (DHT), 0xC8 (JPG) and 0xCC (DAC) sit in the same range but do not.
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      // Within a SOF segment: length(2) precision(1) height(2) width(2).
      return {
        height: view.getUint16(offset + 5, false),
        width: view.getUint16(offset + 7, false),
      };
    }

    offset += 2 + segmentLength;
  }

  throw new Error("No JPEG Start-Of-Frame segment found; buffer is not a decodable JPEG");
}

/** Decode pixel dimensions from a PNG or JPEG buffer. */
export function getImageSize(buf: Uint8Array): ImageSize {
  const format = detectFormat(buf);
  if (format === "png") return readPngSize(buf);
  if (format === "jpeg") return readJpegSize(buf);
  throw new Error(
    `Unrecognised image format; first bytes were ${
      Array.from(buf.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join(" ")
    }`,
  );
}

/**
 * A screenshot of a real page is never a handful of bytes. Guards against the
 * server returning a truncated stream or an empty placeholder that still
 * happens to carry valid magic bytes.
 */
export const MIN_PLAUSIBLE_SCREENSHOT_BYTES = 1024;
