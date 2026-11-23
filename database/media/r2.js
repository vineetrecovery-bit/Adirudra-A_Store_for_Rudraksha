// Cloudflare R2 media storage for product photos and videos. NOT LINKED YET.
//
// To link R2:
//   1. In Cloudflare: create a bucket, turn on public access (or connect a custom domain),
//      and create an R2 API token with "Object Read & Write" on that bucket.
//   2. Set in .env / Hostinger:
//        R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//        R2_PUBLIC_URL   (e.g. https://media.adirudra.com or https://pub-xxxx.r2.dev)
//   3. Implement put() and remove() below with an S3 client pointed at
//        https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com  (region "auto").
// Nothing else changes: the backend only calls put() and remove(), and products store
// the returned { storage: 'r2', key, url }.

export function r2Configured(r2) {
  return Boolean(r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucket && r2.publicUrl);
}

export function createR2Media(r2) {
  const notLinked = () => { throw new Error('Cloudflare R2 is not linked yet. See database/media/r2.js.'); };
  return {
    name: 'r2',
    publicUrl: r2.publicUrl.replace(/\/+$/, ''),
    // Should upload `buf` as object `key` with the given content type, then return:
    //   { storage: 'r2', key, url: `${publicUrl}/${key}` }
    async put(/* key, buf, { contentType } */) { notLinked(); },
    async remove(/* key */) { notLinked(); }
  };
}
