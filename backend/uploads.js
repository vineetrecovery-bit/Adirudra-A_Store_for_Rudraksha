// Product photo and video uploads. The file is checked here; saving it is the media store's job
// (database/media: the server's disk now, Cloudflare R2 once linked).
import crypto from 'node:crypto';
import { config } from './config.js';

// Identify the file by its bytes, not by the filename or Content-Type the browser sent.
export function detectMedia(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image', ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image', ext: 'png', mime: 'image/png' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { type: 'image', ext: 'webp', mime: 'image/webp' };
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return { type: 'image', ext: 'gif', mime: 'image/gif' };
  // MP4 / MOV: an "ftyp" box right at the start.
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    return brand === 'qt  ' ? { type: 'video', ext: 'mov', mime: 'video/quicktime' } : { type: 'video', ext: 'mp4', mime: 'video/mp4' };
  }
  if (buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return { type: 'video', ext: 'webm', mime: 'video/webm' };
  return null; // SVG is deliberately not accepted: it can carry scripts.
}

/** Checks and saves one uploaded file. Returns { item } (a product media item) or { error }. */
export async function saveProductMedia(media, buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { error: 'No file received.' };
  const kind = detectMedia(buf);
  if (!kind) return { error: 'Please upload a JPG, PNG, WebP or GIF photo, or an MP4, MOV or WebM video.' };
  const max = kind.type === 'video' ? config.media.maxVideoBytes : config.media.maxImageBytes;
  if (buf.length > max) return { error: `That ${kind.type === 'video' ? 'video' : 'photo'} is too large (max ${Math.round(max / 1024 / 1024)} MB).` };

  const id = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  const saved = await media.put(`${id}.${kind.ext}`, buf, { contentType: kind.mime });
  return { item: { id, type: kind.type, url: saved.url, storage: saved.storage, key: saved.key, mime: kind.mime, size: buf.length } };
}
