// Uploaded files (product photos, hero image, logo), saved in <data folder>/uploads
// and served by the backend at /uploads/<name>.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function uploadsDir(dataDir) {
  return path.join(dataDir, 'uploads');
}

// `name` must already be a safe, generated file name (no slashes).
export async function saveFile(dataDir, name, buf) {
  const dir = uploadsDir(dataDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return `/uploads/${name}`;
}
