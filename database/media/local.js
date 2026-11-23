// Local media storage: files saved in <data folder>/uploads and served by the backend at /uploads/<key>.
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

export function createLocalMedia(dataDir) {
  const dir = path.join(dataDir, 'uploads');
  return {
    name: 'local',
    dir,
    // `key` must be a generated, safe file name (no slashes).
    async put(key, buf) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, key), buf);
      return { storage: 'local', key, url: `/uploads/${key}` };
    },
    async remove(key) {
      if (!/^[\w.-]+$/.test(key)) return;
      await unlink(path.join(dir, key)).catch((err) => { if (err.code !== 'ENOENT') throw err; });
    }
  };
}
