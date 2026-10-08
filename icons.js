/* SVG icons. Each entry: [default stroke width, inner markup]. */

const ICONS = {
  arrowBack: [2, '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'],
  pencil: [2, '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>'],
  trash: [2, '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>'],
  bookmark: [2, '<path d="M6 3h12v18l-6-4-6 4z"/>'],
  plus: [2, '<path d="M12 5v14M5 12h14"/>'],
  minus: [2, '<path d="M5 12h14"/>'],
  close: [2, '<path d="M6 6l12 12M18 6 6 18"/>'],
  search: [2, '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'],
  sliders: [2, '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'],
  chevron: [2, '<path d="m6 9 6 6 6-6"/>'],
  check: [2, '<path d="m5 12 5 5 9-10"/>'],
  sparkle: [1.8, '<path d="M11 4l1.8 5.2L18 11l-5.2 1.8L11 18l-1.8-5.2L4 11l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>'],
  photo: [1.8, '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 5-4 3 2 3-3 4 4"/>'],
  clock: [1.8, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  chefHat: [1.8, '<path d="M7 14a4 4 0 1 1 1.5-7.7 4 4 0 0 1 7 0A4 4 0 1 1 17 14v5H7z"/><path d="M7 17h10"/>'],
  leaf: [1.8, '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 14"/><path d="M5 19c3-5 6-8 10-10"/>'],
  pot: [1.8, '<path d="M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M3 11h18M10 7h4M12 7v4"/>'],
  spoon: [1.8, '<ellipse cx="12" cy="7" rx="3.5" ry="4.5"/><path d="M12 11.5V21"/>'],
  cutlery: [1.8, '<path d="M7 3v18M4 3v5a3 3 0 0 0 6 0V3"/><path d="M17 21v-7M17 14c-2 0-3-2-3-5s1.5-6 3-6z"/>'],
  book: [1.8, '<path d="M12 7v13c-2-1.4-5-2-9-2V5c4 0 7 .6 9 2z"/><path d="M12 7v13c2-1.4 5-2 9-2V5c-4 0-7 .6-9 2z"/>'],
  carrot: [1.8, '<path d="M4 20c-.5-5 3-10 8-12 2.5 1 4 2.5 4 5-2 5-7 7.5-12 7z"/><path d="M9 14l1.5 1.5M12 11l1.5 1.5"/><path d="M15 9l5-5M16 4l1 3 3 1"/>'],
  bookEmpty: [1.2, '<path d="M12 7v13c-2-1.4-5-2-9-2V5c4 0 7 .6 9 2z"/><path d="M12 7v13c2-1.4 5-2 9-2V5c-4 0-7 .6-9 2z"/><path d="M15 4v6l1.5-1.2L18 10V4.4" fill="#bb9bb0"/>'],
};

/** Returns an SVG string. opts: { sw: stroke width, fill, style } */
function icon(name, size = 20, opts = {}) {
  const [defaultSw, body] = ICONS[name];
  const sw = opts.sw ?? defaultSw;
  const fill = opts.fill ?? (name === 'bookEmpty' ? '#f1e3e4' : 'none');
  const style = opts.style ? ` style="${opts.style}"` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${style}>${body}</svg>`;
}
