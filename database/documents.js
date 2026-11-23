// Single-document stores: store settings, website content and its version history.
// The backend decides what goes in them (validation, defaults); this module only saves and loads.
import path from 'node:path';
import { createJsonFile } from './json-file.js';

export function createDocuments(dataDir) {
  return {
    settings: createJsonFile(path.join(dataDir, 'settings.json')),
    site: createJsonFile(path.join(dataDir, 'site.json')),
    siteHistory: createJsonFile(path.join(dataDir, 'site-history.json'))
  };
}
