// Website settings: theme (colours, fonts, rounding) and editable content.
// Stored in data/site.json; edited from Admin > Website. Every save is validated
// against DEFAULTS (same shape, same types) so the storefront can always render it.
import { readFile, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';

export const HEADING_FONTS = ['Cormorant Garamond', 'Playfair Display', 'EB Garamond', 'Lora', 'Cinzel', 'Marcellus', 'DM Serif Display', 'Libre Baskerville'];
export const BODY_FONTS = ['Inter', 'DM Sans', 'Lato', 'Mulish', 'Nunito Sans', 'Poppins', 'Source Sans 3', 'Work Sans'];
export const TRUST_ICONS = ['shield', 'truck', 'return', 'card', 'star', 'leaf', 'gift', 'phone'];
export const SECTION_IDS = ['trust', 'categories', 'featured', 'authenticity', 'faq'];

export const DEFAULTS = {
  theme: {
    colors: {
      paper: '#f8f5ef', surface: '#fffdf9', ink: '#241b15', muted: '#6f6258', line: '#e4d9cc',
      walnut: '#2d211a', bronze: '#80552a', gold: '#d5ad7c', dark: '#20150f', onPrimary: '#ffffff'
    },
    fonts: { heading: 'Cormorant Garamond', body: 'Inter' },
    radius: 0
  },
  brand: { name: 'ADIRUDRA', logo: 'assets/logo.svg' },
  announcement: { enabled: false, text: 'Free shipping on orders over {freeShippingOver} · Every bead lab certified', link: 'shop.html' },
  nav: { home: 'Home', shop: 'Shop all', malas: 'Malas', bracelets: 'Bracelets', authenticity: 'Authenticity', searchPlaceholder: 'Search by mukhi, origin, mala, bracelet…' },
  seo: {
    title: 'Adirudra — Authentic Rudraksha Store',
    description: 'Shop authentic, lab-certified Rudraksha beads, malas, bracelets and pendants from Nepal and Indonesia.'
  },
  hero: {
    eyebrow: 'Certified · Energised · Shipped across India',
    title: 'Sacred beads, honestly sourced.',
    lead: 'Authentic Rudraksha from the Himalayan slopes of Nepal and the islands of Indonesia — each one lab-tested and delivered with its certificate.',
    primaryLabel: 'Shop the collection', primaryLink: 'shop.html',
    secondaryLabel: 'How we verify every bead', secondaryLink: '#authenticity',
    image: 'assets/hero-rudraksha.jpg'
  },
  sections: SECTION_IDS.map((id) => ({ id, enabled: true })),
  trust: {
    items: [
      { icon: 'shield', title: 'Lab certified', text: 'Certificate with every bead' },
      { icon: 'truck', title: 'Free shipping', text: 'On orders over {freeShippingOver}' },
      { icon: 'return', title: '7-day returns', text: "If it isn't right, send it back" },
      { icon: 'card', title: 'Secure payment', text: 'UPI, cards & cash on delivery' }
    ]
  },
  categories: {
    kicker: 'Shop by form', title: 'Find your bead',
    intro: 'Wear it loose, strung as a mala for japa, or set in a pendant or bracelet for everyday wear.',
    labels: { looseBead: 'Loose beads', mala: 'Malas', bracelet: 'Bracelets', pendant: 'Pendants' }
  },
  featured: {
    kicker: 'The collection', title: 'Featured & rare',
    intro: "Hand-picked beads from this season's sourcing, including our rarest pieces.",
    linkLabel: 'View all products →', link: 'shop.html', count: 6
  },
  authenticity: {
    kicker: 'Our promise', title: 'Every bead, verified before it reaches you.',
    text: 'Counterfeit and treated beads are common. We source directly, test every piece and give each one a verification number you can check with us at any time.',
    linkLabel: 'Shop certified beads →', link: 'shop.html',
    steps: [
      { title: 'Direct sourcing', text: 'Collected from trusted growers in Nepal and Indonesia, never from bulk resellers.' },
      { title: 'Lab testing', text: 'X-ray and density tests confirm natural mukhis with no carving, filling or joins.' },
      { title: 'Certificate & ID', text: 'Each bead ships with a certificate and a unique verification number.' },
      { title: 'Energised & packed', text: 'Purified and energised with Vedic rituals, then sealed in protective packaging.' }
    ]
  },
  faq: {
    kicker: 'Good to know', title: 'Shipping & returns',
    items: [
      { q: 'How long does delivery take?', a: 'Orders ship within 1–2 working days and arrive in 3–7 days across India.' },
      { q: 'What is the return policy?', a: 'Unworn items can be returned within 7 days of delivery for a full refund.' },
      { q: 'Is cash on delivery available?', a: 'Yes, on all orders, with a small handling fee of {codFee}.' }
    ]
  },
  footer: {
    shopTitle: 'Shop', helpTitle: 'Help', contactTitle: 'Contact',
    cartLabel: 'Your cart', authenticityLabel: 'Authenticity', faqLabel: 'Shipping & returns', whatsappLabel: 'WhatsApp us',
    about: 'Authentic, lab-certified Rudraksha from Nepal and Indonesia. Every bead is inspected, energised and shipped with its certificate.',
    copyright: 'Adirudra. All rights reserved.',
    note: 'Prices include GST'
  },
  // Text on the other storefront pages. {freeShippingOver}, {shippingFee} and {codFee} are replaced
  // with the amounts from Admin > Settings; order texts also accept {name}, {email}, {phone}, {total}.
  pages: {
    shop: {
      title: 'The collection', intro: 'Authentic Rudraksha beads, malas, bracelets and pendants — every piece certified.',
      searchPlaceholder: 'Mukhi, origin, keyword…', emptyTitle: 'No products match', emptyText: 'Try removing a filter or searching for something else.'
    },
    product: {
      relatedKicker: 'You may also like', relatedTitle: 'Related pieces', taxNote: 'Inclusive of all taxes',
      certified: 'Lab certificate included', inspected: 'Inspected for authenticity', shipping: 'Ships in 1–2 working days', returns: '7-day easy returns',
      askLabel: 'Ask about this bead on WhatsApp', notFoundTitle: 'Product not found', notFoundText: 'It may have sold out or the link is incorrect.'
    },
    cart: {
      title: 'Your cart', emptyTitle: 'Your cart is empty', emptyText: 'Explore certified Rudraksha beads, malas and bracelets.', emptyButton: 'Start shopping',
      summaryTitle: 'Order summary', checkoutButton: 'Proceed to checkout', freeShippingNote: 'Your order ships free.'
    },
    checkout: {
      title: 'Checkout', contactHeading: 'Contact', addressHeading: 'Delivery address', paymentHeading: 'Payment',
      onlineTitle: 'UPI / Cards / Netbanking', onlineText: 'Pay securely online with Razorpay: UPI, cards, netbanking or wallets.',
      onlineTextNoGateway: "We'll send a secure payment link to your phone and email once the order is placed.",
      codTitle: 'Cash on delivery', codText: 'Pay when your order arrives. {codFee} handling fee.',
      whatsappTitle: 'Confirm on WhatsApp', whatsappText: 'Send your order to us on WhatsApp and pay however you prefer.',
      summaryTitle: 'Your order'
    },
    order: {
      thanks: 'Thank you, {name}', placedTitle: 'Your order is placed.', reservedTitle: 'Your order is reserved.', cancelledTitle: 'This order was cancelled.',
      paidText: "Payment received — thank you. We'll email {email} when it ships.",
      codText: 'Your order is confirmed. Please keep {total} ready when it arrives.',
      whatsappText: "Send us the WhatsApp message we opened and we'll confirm payment and delivery with you there.",
      payNowText: "Your payment hasn't gone through yet. Complete it below to confirm your order.",
      payLinkText: "We'll send a secure payment link to {phone} and {email} shortly. Your order ships once payment is received.",
      cancelledText: 'If you have questions, contact us with your order number.',
      notFoundTitle: 'Order not found', notFoundText: 'Use the link from your order confirmation, or contact us with your order number.'
    },
    notFound: {
      kicker: '404', title: 'This page has wandered off.', text: 'The link may be broken or the page may have moved.',
      primaryLabel: 'Browse the shop', secondaryLabel: 'Back to home'
    }
  }
};

// ---------- Validation ----------
const LIST_LIMITS = { 'trust.items': [1, 6], 'authenticity.steps': [1, 6], 'faq.items': [0, 12] };
const LONG_TEXT = /^(lead|text|intro|about|description|a)$|Text(NoGateway)?$/;
const NUMBERS = { 'theme.radius': [0, 24], 'featured.count': [3, 12] };

const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
// Links: site pages, anchors, https URLs, mailto/tel. Never javascript: or data:.
const isLink = (v) => v === '' || /^(#[\w-]*|[\w-]+\.html([?#][^\s"'<>]*)?|\/[^\s"'<>]*|https:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s-]+)$/i.test(v);
const isImage = (v) => /^(assets\/[\w./-]+|\/uploads\/[\w.-]+|https:\/\/[^\s"'<>]+)$/i.test(v) && !v.includes('..');

class SiteError extends Error {
  constructor(field, message) { super(message); this.field = field; this.status = 400; }
}

function clean(def, input, keyPath) {
  const key = keyPath.split('.').pop();

  if (Array.isArray(def)) {
    if (keyPath === 'sections') {
      if (!Array.isArray(input)) throw new SiteError(keyPath, 'Sections must be a list.');
      const ids = input.map((s) => s && s.id);
      if (ids.length !== SECTION_IDS.length || SECTION_IDS.some((id) => !ids.includes(id))) throw new SiteError(keyPath, 'Sections list is incomplete.');
      return input.map((s) => ({ id: s.id, enabled: Boolean(s.enabled) }));
    }
    const [min, max] = LIST_LIMITS[keyPath] || [0, 20];
    if (!Array.isArray(input)) throw new SiteError(keyPath, 'Expected a list.');
    if (input.length < min || input.length > max) throw new SiteError(keyPath, `Add between ${min} and ${max} items.`);
    return input.map((item, i) => clean(def[0], item, `${keyPath}.${i}`));
  }

  if (def && typeof def === 'object') {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const k of Object.keys(def)) {
      const childPath = keyPath ? `${keyPath}.${k}` : k;
      // Items inside lists are validated against the template item, so use its path pattern for rules.
      out[k] = src[k] === undefined ? structuredClone(def[k]) : clean(def[k], src[k], childPath);
    }
    return out;
  }

  const rulePath = keyPath.replace(/\.\d+\./g, '.');
  if (typeof def === 'boolean') return Boolean(input);
  if (typeof def === 'number') {
    const [min, max] = NUMBERS[rulePath] || [0, 100];
    const n = Math.round(Number(input));
    if (!Number.isFinite(n) || n < min || n > max) throw new SiteError(keyPath, `Must be between ${min} and ${max}.`);
    return n;
  }
  // Strings
  if (typeof input !== 'string') throw new SiteError(keyPath, 'Expected text.');
  const v = input.trim();
  if (rulePath.startsWith('theme.colors.')) { if (!isColor(v)) throw new SiteError(keyPath, 'Use a colour like #2d211a.'); return v.toLowerCase(); }
  if (rulePath === 'theme.fonts.heading') { if (!HEADING_FONTS.includes(v)) throw new SiteError(keyPath, 'Choose a font from the list.'); return v; }
  if (rulePath === 'theme.fonts.body') { if (!BODY_FONTS.includes(v)) throw new SiteError(keyPath, 'Choose a font from the list.'); return v; }
  if (key === 'icon') { if (!TRUST_ICONS.includes(v)) throw new SiteError(keyPath, 'Choose an icon from the list.'); return v; }
  if (/link$/i.test(key)) { if (!isLink(v)) throw new SiteError(keyPath, 'Use a page (shop.html), an anchor (#faq) or an https:// link.'); return v; }
  if (key === 'image' || key === 'logo') { if (!isImage(v)) throw new SiteError(keyPath, 'Upload an image or use an https:// image link.'); return v; }
  const max = LONG_TEXT.test(key) ? 600 : 140;
  if (v.length > max) throw new SiteError(keyPath, `Keep this under ${max} characters.`);
  return v;
}

export function validateSite(input) {
  try {
    return { value: clean(DEFAULTS, input, '') };
  } catch (err) {
    if (err instanceof SiteError) return { error: err.message, field: err.field };
    throw err;
  }
}

// ---------- Theme CSS + font link, injected into every storefront page ----------
const cssVar = { paper: '--paper', surface: '--surface', ink: '--ink', muted: '--muted', line: '--line', walnut: '--walnut', bronze: '--bronze', gold: '--gold', dark: '--dark', onPrimary: '--on-primary' };

export function themeCss(theme) {
  const vars = Object.entries(theme.colors).map(([k, v]) => `${cssVar[k]}:${v}`);
  vars.push(`--serif:'${theme.fonts.heading}',Georgia,serif`, `--sans:'${theme.fonts.body}',Arial,sans-serif`, `--radius:${theme.radius}px`);
  return `:root{${vars.join(';')}}`;
}

export function fontsUrl(theme) {
  const fam = (name, weights) => `family=${name.replace(/ /g, '+')}:wght@${weights}`;
  const families = theme.fonts.heading === theme.fonts.body
    ? [fam(theme.fonts.heading, '400;500;600')]
    : [fam(theme.fonts.heading, '400;500;600'), fam(theme.fonts.body, '400;500;600')];
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

// ---------- Storage with version history ----------
export function createSiteStore(dataDir) {
  const file = path.join(dataDir, 'site.json');
  const historyFile = path.join(dataDir, 'site-history.json');
  let site = structuredClone(DEFAULTS);
  let history = []; // [{ id, savedAt, site }], newest first, max 15
  let queue = Promise.resolve();

  const writeAtomic = (target, data) => {
    queue = queue.then(async () => {
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
      await rename(tmp, target);
    });
    return queue;
  };

  async function load() {
    try {
      await access(file);
      const stored = JSON.parse(await readFile(file, 'utf8'));
      // Re-validate so new default fields are filled in after upgrades.
      const v = validateSite(stored);
      site = v.value || structuredClone(DEFAULTS);
      if (v.error) console.warn(`site.json: ${v.error} (${v.field}); using defaults for the store look.`);
    } catch { site = structuredClone(DEFAULTS); }
    try { history = JSON.parse(await readFile(historyFile, 'utf8')); } catch { history = []; }
  }

  async function save(next, label = 'Saved') {
    history.unshift({ id: Date.now().toString(36), savedAt: new Date().toISOString(), label, site });
    history = history.slice(0, 15);
    site = next;
    await writeAtomic(historyFile, history);
    await writeAtomic(file, site);
    return site;
  }

  return {
    load,
    get: () => site,
    save,
    history: () => history.map(({ id, savedAt, label }) => ({ id, savedAt, label })),
    async restore(id) {
      const entry = history.find((h) => h.id === id);
      if (!entry) return null;
      const v = validateSite(entry.site);
      return save(v.value || structuredClone(DEFAULTS), 'Before restore');
    },
    reset: () => save(structuredClone(DEFAULTS), 'Before reset to defaults')
  };
}
