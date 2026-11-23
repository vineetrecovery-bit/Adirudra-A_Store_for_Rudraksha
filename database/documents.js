// Settings documents: store settings, website content and its version history.
// They live in the `settings` table (MySQL) or as JSON files (JSON driver). The backend decides
// what goes in them (validation, defaults); this module only saves and loads.
export const SETTING_KEYS = { settings: 'store', site: 'site', siteHistory: 'site_history' };

export function createDocuments(db) {
  const doc = (key) => ({
    async read(fallback = undefined) { const v = await db.settings.get(key); return v === undefined ? fallback : v; },
    write: (value) => db.settings.set(key, value)
  });
  return { settings: doc(SETTING_KEYS.settings), site: doc(SETTING_KEYS.site), siteHistory: doc(SETTING_KEYS.siteHistory) };
}
