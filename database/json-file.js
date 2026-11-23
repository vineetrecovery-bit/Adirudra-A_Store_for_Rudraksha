// One JSON file on disk. Writes go through a single queue and are atomic
// (write to a temp file, then rename), so a crash never leaves a half-written file.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function createJsonFile(file) {
  let queue = Promise.resolve();

  return {
    path: file,

    // Returns the parsed contents, or `fallback` if the file doesn't exist yet.
    async read(fallback = undefined) {
      try {
        return JSON.parse(await readFile(file, 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        throw err;
      }
    },

    write(data) {
      const snapshot = JSON.stringify(data, null, 2) + '\n';
      queue = queue.then(async () => {
        await mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, snapshot);
        await rename(tmp, file);
      });
      return queue;
    }
  };
}
