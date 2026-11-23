// Entry point kept at the project root so hosts (Hostinger, `npm start`) find it.
// The server itself lives in backend/server.js. No top-level await: Hostinger's
// LiteSpeed runner loads this file with require().
import './backend/server.js';
