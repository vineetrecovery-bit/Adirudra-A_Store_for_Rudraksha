// Image uploads for the site editor (hero image, logo, product photos).
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Identify the image by its bytes, not by the filename or Content-Type the browser sent.
function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'gif';
  return null; // SVG is deliberately not accepted: it can carry scripts.
}

export function uploadsDir(dataDir) {
  return path.join(dataDir, 'uploads');
}

export async function saveUpload(dataDir, buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { error: 'No image received.' };
  const ext = detectImage(buf);
  if (!ext) return { error: 'Please upload a JPG, PNG, WebP or GIF image.' };
  const dir = uploadsDir(dataDir);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await writeFile(path.join(dir, name), buf);
  return { url: `/uploads/${name}` };
}
