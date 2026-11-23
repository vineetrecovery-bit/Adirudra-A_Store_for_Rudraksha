// Where product photos and videos are kept. Website images (logo, hero background) are not
// stored here: they live with the code in frontend/assets/.
//   - local: the server's disk (<data folder>/uploads). Used now.
//   - r2:    Cloudflare R2. Used once it's linked (see r2.js) and R2_* settings are filled in.
import { createLocalMedia } from './local.js';
import { createR2Media, r2Configured } from './r2.js';

export function createMediaStore({ dataDir, r2 = {} }) {
  const local = createLocalMedia(dataDir);
  const useR2 = r2Configured(r2);
  const primary = useR2 ? createR2Media(r2) : local;
  const byName = { local, r2: useR2 ? primary : null };

  return {
    driver: primary.name,
    localDir: local.dir,
    put: (key, buf, opts) => primary.put(key, buf, opts),
    // Removes a media item's file from whichever storage it was saved in.
    async remove(item) {
      const store = item && item.key && byName[item.storage];
      if (store) await store.remove(item.key);
    }
  };
}
