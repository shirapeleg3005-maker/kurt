'use strict';

/* ---------- storage ---------- */

const PREFIX = 'kurt:';

/** Reads a value from localStorage, falling back to `initial` when missing or unavailable. */
function load(key, initial) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  return initial;
}

/** Writes state[key] to localStorage. Keeps working in memory if storage is blocked or full. */
function persist(...keys) {
  for (const key of keys) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(state[key]));
    } catch (e) {
      /* quota exceeded or storage blocked */
    }
  }
}

/* ---------- state ---------- */

const TAGLINES = { book: 'מתכונים שעושים בית', search: 'לגלות טעמים', home: 'מהמטבח שלך' };
const MAX_RECENTS = 30;

const state = {
  // Persisted data
  recipes: load('recipes', JSON.parse(JSON.stringify(BASE_RECIPES))),
  saved: load('saved', []),
  recents: load('recents', []),
  pantry: load('pantry', []),
  basics: load('basics', true),

  // Navigation / UI state
  tab: 'book',
  bookTab: 'saved',
  recipeId: null,
  creating: false,
  confirmDelete: false,
  form: blankForm(),
  q: '',
  filters: noFilters(),
  scrollTop: false,

  // Per-screen state, reset whenever the screen changes
  filtersOpen: false,
  home: { draft: '', shown: false },
  rv: { tab: 'ings', serv: 2, checked: new Set() },
};
persist('recipes', 'saved', 'recents', 'pantry', 'basics');

const $app = document.getElementById('app');
const $header = document.getElementById('header');
const $main = document.getElementById('main');
const $nav = document.getElementById('nav');

const findRecipe = (id) => state.recipes.find((r) => r.id === id) || null;

function current() {
  const recipe = state.recipeId ? findRecipe(state.recipeId) : null;
  const inRecipe = !!recipe;
  const inCreate = state.creating && !inRecipe;
  return { recipe, inRecipe, inCreate, sub: inRecipe || inCreate };
}

/* ---------- html helpers ---------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const chip = (label, on, attrs) =>
  `<button type="button" class="chip${on ? ' on' : ''}" aria-pressed="${on}" ${attrs}>${esc(label)}</button>`;

/** A titled, horizontally scrolling row of chips. */
function chipRow(title, inner, inset, id) {
  const m = inset ? ` style="margin-inline:${inset}px"` : '';
  const p = inset ? ` style="padding-inline:${inset}px"` : '';
  return `<div>
    <div class="group-title"${m}>${esc(title)}</div>
    <div class="chip-row" id="${id}"${p}>${inner}</div>
  </div>`;
}

const pageTitle = (title, sub) => `<div><h1 class="h1">${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>`;

function recipeCard(r, note) {
  const img = r.img || r.hero;
  return `<button type="button" class="recipe-card" data-action="open" data-v="${esc(r.id)}">
    ${img ? `<img src="${esc(img)}" alt="" class="thumb" />` : `<span class="thumb thumb-empty">${icon('pot', 34, { sw: 1.6 })}</span>`}
    <span class="card-body">
      <span class="card-title">${esc(r.title)}</span>
      <span class="card-meta">${esc(cardMeta(r))}</span>
      ${note ? `<span class="card-note">${esc(note)}</span>` : ''}
    </span>
  </button>`;
}

function stepper(label, upAction, downAction, cls) {
  return `<div class="${cls}">
    <button type="button" class="icon-btn" aria-label="עוד מנה" data-action="${upAction}">${icon('plus', 16, { sw: 2.5 })}</button>
    <span class="stepper-label">${esc(label)}</span>
    <button type="button" class="icon-btn" aria-label="פחות מנה" data-action="${downAction}">${icon('minus', 16, { sw: 2.5 })}</button>
  </div>`;
}

/* ---------- header & nav ---------- */

function renderHeader(c) {
  const left = c.sub
    ? `<button type="button" class="brand-back" data-action="back">
        ${icon('arrowBack', 22)}
        <span class="brand brand-sm">קורט</span>
        ${c.inCreate ? '<span class="tagline">ביטול</span>' : ''}
      </button>`
    : `<div class="brand-row"><span class="brand">קורט</span><span class="tagline">${TAGLINES[state.tab]}</span></div>`;

  let right = '';
  if (c.inRecipe) {
    right += `<button type="button" class="round-btn" aria-label="עריכת המתכון" data-action="edit">${icon('pencil')}</button>`;
    right += `<button type="button" class="round-btn" aria-label="מחיקת המתכון" data-action="askDelete">${icon('trash')}</button>`;
  }
  const canBookmark = c.inRecipe && (!c.recipe.mine || !!c.recipe.author);
  if (canBookmark) {
    const on = state.saved.includes(c.recipe.id);
    right += `<button type="button" class="round-btn${on ? ' on' : ''}" aria-label="${on ? 'הסרה מהשמורים' : 'שמירת המתכון'}" aria-pressed="${on}" data-action="toggleSave">${icon('bookmark', 20, { fill: on ? '#1c1d21' : 'none' })}</button>`;
  }
  return left + `<div class="row gap-8">${right}</div>`;
}

const NAV = [
  ['book', 'ספר המתכונים', () => icon('book', 24)],
  ['search', 'חיפוש', () => icon('search', 24, { sw: 1.8 })],
  ['home', 'מה יש בבית?', () => icon('carrot', 24)],
];

function renderNav() {
  return NAV.map(([id, label, ic]) => {
    const on = state.tab === id;
    return `<button type="button"${on ? ' class="on" aria-current="page"' : ''} data-action="goTab" data-v="${id}">${ic()}<span>${label}</span></button>`;
  }).join('');
}

/* ---------- book screen ---------- */

const BOOK_EMPTY = {
  saved: ['הטעמים שלך מתחילים כאן', 'עוד אין כאן מתכונים שמורים. אפשר להוסיף מתכון מהמטבח שלך או לגלות משהו טעים ולשמור לפעם הבאה.'],
  mine: ['המתכון הראשון שלך מחכה', 'מתכונים שיצרת יופיעו כאן.'],
  recent: ['עוד לא הצצת במתכונים', 'מתכונים שנפתחו יופיעו כאן, האחרון ראשון.'],
};

const BOOK_TABS = [
  ['saved', 'שמורים'],
  ['mine', 'המתכונים שלי'],
  ['recent', 'אחרונים'],
];

function bookScreen() {
  const s = state;
  const byId = new Map(s.recipes.map((r) => [r.id, r]));
  const list =
    s.bookTab === 'saved'
      ? s.saved.map((id) => byId.get(id)).filter(Boolean)
      : s.bookTab === 'mine'
        ? s.recipes.filter((r) => r.mine && !r.author)
        : s.recents.map((id) => byId.get(id)).filter(Boolean);
  const noteFor = (r) => (s.bookTab === 'saved' ? 'נשמר בספר שלך' : r.tip);
  const [emptyTitle, emptyText] = BOOK_EMPTY[s.bookTab];

  return `<div class="stack gap-18">
    ${pageTitle('מה מבשלים היום?', 'קצת השראה, הרבה טעם.')}

    <button type="button" class="cta-add" data-action="create">
      <span class="cta-add-icon">${icon('plus')}</span>
      <span>הוספת מתכון</span>
    </button>

    <div class="grid-3">
      ${BOOK_TABS.map(([id, label]) => chip(label, s.bookTab === id, `data-action="bookTab" data-v="${id}"`)).join('')}
    </div>

    ${
      list.length
        ? `<div class="stack gap-12">${list.map((r) => recipeCard(r, noteFor(r))).join('')}</div>`
        : `<div class="empty">
            <div class="empty-art">${icon('bookEmpty', 76)}</div>
            <h2 class="h2 empty-title">${emptyTitle}</h2>
            <div class="empty-text">${emptyText}</div>
            <button type="button" class="link-btn" data-action="goTab" data-v="search">
              ${icon('search')}
              <span>לגלות מתכונים חדשים</span>
            </button>
          </div>`
    }
  </div>`;
}

/* ---------- search screen ---------- */

const pickedFilters = () => {
  const f = state.filters;
  return [...f.style, ...f.ing, f.time, f.level, f.kind, f.meal].filter(Boolean);
};

function searchResults() {
  const f = state.filters;
  const maxT = maxMinutes(f.time);
  const query = state.q.trim();
  const hits = (r) => f.ing.filter((x) => r.needs.some((n) => looseMatch(n, x))).length;
  const found = state.recipes.filter((r) => {
    if (r.time && r.time > maxT) return false;
    if (f.level && r.level !== f.level) return false;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.meal && r.meal !== f.meal) return false;
    if (f.style.length && !f.style.includes(r.style)) return false;
    if (f.ing.length && hits(r) === 0) return false;
    if (query && !r.title.includes(query) && !r.needs.join(' ').includes(query)) return false;
    return true;
  });
  if (f.ing.length) found.sort((a, b) => hits(b) - hits(a));
  return found.map((r) => ({
    recipe: r,
    note: f.ing.length ? `יש ${hits(r)} מתוך ${r.needs.length} מצרכים` : r.tip,
  }));
}

const showCountLabel = (n) => (n === 1 ? 'הצגת מתכון אחד' : `הצגת ${n} מתכונים`);

function searchResultsHtml(results) {
  const picked = pickedFilters();
  const filtered = picked.length > 0 || !!state.q.trim();
  return `<div>
      <h2 class="h2">${filtered ? 'מה שמצאנו' : 'נראה לנו שתאהבו'}</h2>
      <div class="small-14">${picked.length ? esc(picked.join(' · ')) : 'כמה רעיונות להתחיל מהם.'}</div>
    </div>
    ${results.map(({ recipe, note }) => recipeCard(recipe, note)).join('')}
    ${results.length === 0 ? '<div class="dashed-note">לא מצאנו מתכון שמתאים לכל הבחירות. אפשר להסיר סינון או לאפס.</div>' : ''}`;
}

function searchScreen() {
  const f = state.filters;
  const open = state.filtersOpen;
  const picked = pickedFilters();
  const results = searchResults();

  const multi = (key, title, opts) =>
    chipRow(
      title,
      opts
        .map((label) =>
          label === ALL
            ? chip(label, f[key].length === 0, `data-action="filterAll" data-k="${key}"`)
            : chip(label, f[key].includes(label), `data-action="filterMulti" data-k="${key}" data-v="${esc(label)}"`),
        )
        .join(''),
      16,
      'f-' + key,
    );

  const single = (key, title, opts) =>
    chipRow(
      title,
      opts.map((label) => chip(label, f[key] === label, `data-action="filterSingle" data-k="${key}" data-v="${esc(label)}"`)).join(''),
      16,
      'f-' + key,
    );

  const ingOptions = [...f.ing.filter((x) => !FILTER_INGS.includes(x)), ...FILTER_INGS];

  return `<div class="stack gap-16">
    ${pageTitle('בדיוק לטעם שלך', 'ממטבח של פעם ועד משהו חדש לנסות.')}

    <label class="search-field">
      ${icon('search', 22)}
      <input type="search" id="q" value="${esc(state.q)}" placeholder="שם מתכון או מרכיב..." aria-label="חיפוש מתכון" />
    </label>

    <div class="panel filters">
      <button type="button" class="filters-toggle" aria-expanded="${open}" data-action="toggleFilters">
        ${icon('sliders')}
        <span class="filters-title">מה מתחשק לך?</span>
        <span class="small">${picked.length ? `${picked.length} נבחרו` : 'לא חובה'}</span>
        ${icon('chevron', 20, { style: open ? 'transform:rotate(180deg)' : '' })}
      </button>
      ${
        open
          ? `<div class="stack gap-14 filters-body">
              ${multi('style', 'סגנון', STYLES)}
              ${multi('ing', 'מרכיבים', ingOptions)}
              ${single('time', 'זמן הכנה', TIMES)}
              ${single('level', 'רמת קושי', LEVELS)}
              ${single('kind', 'סוג אוכל', KINDS)}
              ${single('meal', 'סוג ארוחה', MEALS)}
              <div class="row gap-8 filters-actions">
                <button type="button" class="btn btn-accent grow" id="filters-apply" data-action="closeFilters">${showCountLabel(results.length)}</button>
                <button type="button" class="btn btn-outline" data-action="resetFilters">איפוס</button>
              </div>
            </div>`
          : ''
      }
    </div>

    <div class="stack gap-12" id="search-results">${searchResultsHtml(results)}</div>
  </div>`;
}

/** Rotates the filters arrow smoothly after a re-render (the new arrow starts from the old angle). */
function animateChevron() {
  const svg = document.querySelector('.filters-toggle svg:last-child');
  if (!svg) return;
  const to = svg.style.transform;
  svg.style.transform = to ? '' : 'rotate(180deg)';
  svg.getBoundingClientRect(); // apply the starting angle before animating
  svg.style.transition = 'transform .2s';
  svg.style.transform = to;
}

/** Updates only the results while typing, so the search input keeps focus. */
function updateSearch() {
  const results = searchResults();
  document.getElementById('search-results').innerHTML = searchResultsHtml(results);
  const apply = document.getElementById('filters-apply');
  if (apply) apply.textContent = showCountLabel(results.length);
}

/* ---------- home screen ---------- */

function pantryMatches() {
  const hits = (r) => r.needs.filter((n) => state.pantry.some((x) => looseMatch(n, x))).length;
  return state.recipes
    .map((r) => ({ recipe: r, hits: hits(r) }))
    .filter((m) => m.hits > 0)
    .sort((a, b) => b.hits / b.recipe.needs.length - a.hits / a.recipe.needs.length);
}

function suggestHtml() {
  const d = state.home.draft.trim();
  const list = d ? COMMON_INGREDIENTS.filter((x) => x.startsWith(d) && !state.pantry.includes(x)).slice(0, 6) : [];
  if (!list.length) return '';
  return `<div class="suggest">${list
    .map((x) => `<button type="button" data-action="pantryAdd" data-v="${esc(x)}"><span>${esc(x)}</span>${icon('plus', 16)}</button>`)
    .join('')}</div>`;
}

const updateSuggest = () => (document.getElementById('suggest-wrap').innerHTML = suggestHtml());

function homeScreen() {
  const { pantry, basics } = state;
  const { draft, shown } = state.home;
  const matches = shown ? pantryMatches() : [];

  return `<div class="stack gap-20">
    ${pageTitle('יש מצרכים. יש ארוחה.', 'מכניסים מה שיש בבית, ומגלים מה אפשר להכין.')}

    <div class="panel panel-pad stack gap-14">
      <div class="row between baseline">
        <h2 class="h2">מה יש במטבח?</h2>
        <span class="small">${pantry.length} מצרכים</span>
      </div>
      <div>
        <div class="pantry-input">
          <input type="text" id="pantry-draft" value="${esc(draft)}" placeholder="הוספת מצרך, למשל קישוא" aria-label="הוספת מצרך" autocomplete="off" />
          <button type="button" class="icon-btn" aria-label="הוספה" data-action="pantryAddDraft">${icon('plus', 24)}</button>
        </div>
        <div id="suggest-wrap">${suggestHtml()}</div>
      </div>
      ${
        pantry.length
          ? `<div class="wrap gap-8">${pantry
              .map(
                (p) =>
                  `<button type="button" class="pantry-chip" aria-label="הסרת ${esc(p)}" data-action="pantryRemove" data-v="${esc(p)}"><span>${esc(p)}</span>${icon('close', 14, { sw: 2.5 })}</button>`,
              )
              .join('')}</div>`
          : ''
      }
      <label class="check-row">
        <input type="checkbox" id="basics"${basics ? ' checked' : ''} />
        <span>יש לי גם שמן, מלח ותבלינים בסיסיים</span>
      </label>
      <button type="button" class="btn btn-dark btn-lg" data-action="find">
        <span>מציאת מתכונים מהמצרכים שלי</span>
        ${icon('search')}
      </button>
    </div>

    ${
      shown
        ? `<div id="home-results" class="stack gap-12 scroll-target">
            <div>
              <h2 class="h2">מתכונים שמתאימים למצרכים שלך</h2>
              <div class="small-14">${
                matches.length
                  ? 'לפי מה שיש לך במטבח, מהמתאים ביותר.'
                  : 'עוד אין מתכון שמתאים למצרכים האלה. אפשר להוסיף מצרכים או ליצור מתכון משלך.'
              }</div>
            </div>
            ${matches
              .map(({ recipe, hits }) =>
                recipeCard(recipe, hits >= recipe.needs.length ? 'כל המצרכים כבר אצלך' : `יש ${hits} מתוך ${recipe.needs.length} מצרכים`),
              )
              .join('')}
          </div>`
        : ''
    }

    <div class="invent stack gap-10">
      <div class="row between center">
        <h2 class="h2">בא לך להמציא משהו?</h2>
        ${icon('sparkle', 26)}
      </div>
      <div class="body-15">כותבים מתכון חדש מהמצרכים שלך, עם כמויות ושלבי הכנה, והוא נשמר בספר המתכונים.</div>
      <button type="button" class="btn btn-dark" data-action="createFromPantry">
        <span>יצירת מתכון אישי</span>
        ${icon('plus')}
      </button>
    </div>
  </div>`;
}

function addPantry(v) {
  const name = v.trim();
  if (!name) return;
  if (!state.pantry.includes(name)) {
    state.pantry = [...state.pantry, name];
    persist('pantry');
  }
  state.home.draft = '';
}

/* ---------- create / edit screen ---------- */

/** Missing required fields, in the order shown to the user. */
function missingFields(fm) {
  const missing = [];
  if (!fm.title.trim()) missing.push('שם למתכון');
  if (fm.owner === 'other' && !fm.author.trim()) missing.push('של מי המתכון');
  if (!fm.ings.some((i) => i.name.trim())) missing.push('מצרך אחד לפחות');
  if (!fm.steps.some((x) => x.d.trim() || x.t.trim())) missing.push('שלב הכנה אחד לפחות');
  return missing;
}

/** Reads an image file and scales it down so it fits comfortably in localStorage. */
function readImage(file, maxSide = 1200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = reader.result;
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function saveAreaHtml() {
  const fm = state.form;
  const missing = missingFields(fm);
  const canSave = missing.length === 0;
  const msg = canSave
    ? fm.owner === 'other'
      ? 'המתכון יהיה זמין בחיפוש, ואפשר יהיה לשמור אותו.'
      : 'המתכון יופיע ב״המתכונים שלי״ בספר המתכונים.'
    : `חסר עדיין: ${missing.join(', ')}.`;
  return `<button type="button" class="btn btn-dark btn-lg"${canSave ? '' : ' disabled'} data-action="saveRecipe">
      <span>${fm.editId ? 'שמירת השינויים' : 'יצירת מתכון'}</span>
      ${icon('check', 20, { sw: 2.2 })}
    </button>
    <div class="small center-text">${msg}</div>`;
}

const updateSaveArea = () => (document.getElementById('save-area').innerHTML = saveAreaHtml());

function createScreen() {
  const fm = state.form;
  const field = (key) => `id="fm-${key}" data-field="${key}"`;

  const single = (key, title, opts) =>
    chipRow(
      title,
      opts.map((label) => chip(label, fm[key] === label, `data-action="formSingle" data-k="${key}" data-v="${esc(label)}"`)).join(''),
      18,
      'c-' + key,
    );

  const toolOptions = [...fm.tools.filter((x) => !TOOLS.includes(x)), ...TOOLS];

  return `<div class="stack gap-18">
    ${pageTitle(fm.editId ? 'עריכת מתכון' : 'מתכון חדש', 'מהמטבח שלך, לספר שלך.')}

    <div class="panel panel-pad stack gap-12">
      <label class="field">
        <span>שם המתכון</span>
        <input type="text" class="input" placeholder="למשל, מרק עדשים של סבתא" ${field('title')} value="${esc(fm.title)}" />
      </label>
      <div class="field">
        <span>של מי המתכון?</span>
        <div class="grid-2">
          ${chip('שלי', fm.owner === 'me', 'data-action="owner" data-v="me"')}
          ${chip('של מישהו אחר', fm.owner === 'other', 'data-action="owner" data-v="other"')}
        </div>
      </div>
      ${
        fm.owner === 'other'
          ? `<label class="field">
              <span>שם בעל/ת המתכון</span>
              <input type="text" class="input" placeholder="למשל, סבתא רחל" ${field('author')} value="${esc(fm.author)}" />
            </label>`
          : ''
      }
      <label class="field">
        <span>כמה מילים על המנה</span>
        <textarea class="input textarea roomy" rows="2" placeholder="מה מיוחד בה, מתי מכינים אותה" ${field('desc')}>${esc(fm.desc)}</textarea>
      </label>
      <label class="photo-pick">
        ${icon('photo', 22)}
        <span>${fm.img ? 'התמונה נוספה · החלפה' : 'הוספת תמונה (לא חובה)'}</span>
        <input type="file" id="photo" accept="image/*" />
      </label>
    </div>

    <div class="panel panel-pad-y stack gap-14">
      <div class="grid-2 gap-12 px-18">
        <label class="field">
          <span>זמן הכנה (דקות)</span>
          <input type="number" min="1" inputmode="numeric" class="input" placeholder="25" ${field('time')} value="${esc(fm.time)}" />
        </label>
        <div class="field">
          <span>מנות</span>
          ${stepper(fm.serv, 'formServUp', 'formServDown', 'stepper-box')}
        </div>
      </div>
      ${single('style', 'סגנון', STYLES.slice(1))}
      ${single('kind', 'סוג אוכל', KINDS)}
      ${single('level', 'רמת קושי', LEVELS)}
      ${single('meal', 'סוג ארוחה', MEALS)}
    </div>

    <div class="panel panel-pad stack gap-10">
      <h2 class="h2">מה צריך?</h2>
      <div class="small-14">מרכיב וכמות בכל שורה.</div>
      ${fm.ings
        .map(
          (row, i) => `<div class="row gap-6 center">
            <input type="text" class="input tight grow" id="ing-name-${i}" data-ing="${i}" data-f="name" value="${esc(row.name)}" placeholder="מרכיב" aria-label="מרכיב" />
            <input type="text" class="input amount" id="ing-amount-${i}" data-ing="${i}" data-f="amount" value="${esc(row.amount)}" placeholder="כמות" aria-label="כמות" />
            <button type="button" class="icon-btn" aria-label="הסרת מרכיב" data-action="ingRemove" data-v="${i}">${icon('close', 16, { sw: 2.2 })}</button>
          </div>`,
        )
        .join('')}
      <button type="button" class="add-row" data-action="ingAdd">
        ${icon('plus', 16, { sw: 2.5 })}
        <span>עוד מרכיב</span>
      </button>
    </div>

    <div class="panel panel-pad stack gap-10">
      <h2 class="h2">הכלים שלנו</h2>
      <div class="inline-input">
        <input type="text" placeholder="למשל, סיר גדול" aria-label="הוספת כלי" ${field('toolDraft')} value="${esc(fm.toolDraft)}" />
        <button type="button" class="icon-btn" aria-label="הוספת כלי" data-action="toolAdd">${icon('plus', 22)}</button>
      </div>
      <div class="chip-row" id="c-tools">
        ${toolOptions.map((x) => chip(x, fm.tools.includes(x), `data-action="toolToggle" data-v="${esc(x)}"`)).join('')}
      </div>
    </div>

    <div class="panel panel-pad stack gap-12">
      <h2 class="h2">ככה מכינים</h2>
      ${fm.steps
        .map(
          (st, i) => `<div class="row gap-10">
            <span class="step-num step-num-form">${i + 1}</span>
            <div class="grow stack gap-6">
              <input type="text" class="input tight bold" id="step-t-${i}" data-step="${i}" data-f="t" value="${esc(st.t)}" placeholder="כותרת השלב" aria-label="כותרת השלב" />
              <textarea class="input textarea" rows="3" id="step-d-${i}" data-step="${i}" data-f="d" placeholder="מה עושים בשלב הזה" aria-label="הוראות השלב">${esc(st.d)}</textarea>
            </div>
            <button type="button" class="icon-btn" aria-label="הסרת שלב" data-action="stepRemove" data-v="${i}">${icon('close', 16, { sw: 2.2 })}</button>
          </div>`,
        )
        .join('')}
      <button type="button" class="add-row" data-action="stepAdd">
        ${icon('plus', 16, { sw: 2.5 })}
        <span>עוד שלב</span>
      </button>
    </div>

    <div class="panel panel-white panel-pad">
      <label class="field field-strong">
        <span>הקורט שעושה את ההבדל</span>
        <textarea class="input textarea" rows="2" placeholder="טיפ קטן שכדאי לזכור (לא חובה)" ${field('tip')}>${esc(fm.tip)}</textarea>
      </label>
    </div>

    <div class="stack gap-8" id="save-area">${saveAreaHtml()}</div>
  </div>`;
}

/* ---------- recipe screen ---------- */

const RECIPE_TABS = [
  ['ings', 'מצרכים'],
  ['tools', 'כלים'],
  ['steps', 'הוראות הכנה'],
];

function scaledAmount(i, k) {
  if (i.q) {
    const n = i.q * k;
    return `${formatQty(n)} ${n <= 1 ? i.u1 : i.u2}`;
  }
  const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(i.amount || '');
  return m ? `${formatQty(parseFloat(m[1]) * k)} ${m[2]}`.trim() : i.amount || '';
}

function recipeScreen(r) {
  const { tab, serv, checked } = state.rv;
  const img = r.hero || r.img;
  const badge = badgeFor(r);
  const k = serv / (r.serv || 2);
  const counts = { ings: r.ings.length, tools: r.tools.length, steps: r.steps.length + (r.note ? 1 : 0) };
  const toolIcon = (t) => (t.icon === 'pot' ? icon('pot', 26) : t.icon === 'spoon' ? icon('spoon', 26) : icon('cutlery', 26));

  return `<div class="stack gap-16">
    ${
      state.confirmDelete
        ? `<div role="alertdialog" aria-label="מחיקת מתכון" class="confirm">
            <div>
              <div class="confirm-title">למחוק את המתכון?</div>
              <div class="small-14">אי אפשר לשחזר מתכון שנמחק.</div>
            </div>
            <div class="row gap-8">
              <button type="button" class="btn btn-dark grow" data-action="doDelete">מחיקה</button>
              <button type="button" class="btn btn-soft grow" data-action="cancelDelete">ביטול</button>
            </div>
          </div>`
        : ''
    }

    ${
      img
        ? `<div class="hero">
            <img src="${esc(img)}" alt="" />
            ${badge ? `<span class="badge badge-float">${esc(badge)}</span>` : ''}
          </div>`
        : badge
          ? `<span class="badge badge-pill">${esc(badge)}</span>`
          : ''
    }

    <div>
      ${r.author ? `<div class="by">מתכון של ${esc(r.author)}</div>` : ''}
      <h1 class="h1">${esc(r.title)}</h1>
      ${r.desc ? `<div class="body-15 mt-6">${esc(r.desc)}</div>` : ''}
    </div>

    <div class="facts">
      <div>${icon('clock', 22)}<span>${r.time ? `${r.time} דקות` : '—'}</span></div>
      <div>${icon('chefHat', 22)}<span>${esc(r.level || '—')}</span></div>
      <div>${icon('leaf', 22)}<span>${esc(r.kind || '—')}</span></div>
    </div>

    <div class="rtabs" role="tablist">
      ${RECIPE_TABS.map(
        ([id, label]) =>
          `<button type="button" role="tab" aria-selected="${tab === id}"${tab === id ? ' class="on"' : ''} data-action="rTab" data-v="${id}">${label}</button>`,
      ).join('')}
    </div>

    ${counts[tab] === 0 ? '<div class="dashed-note">עוד לא הוזן כאן כלום.</div>' : ''}

    ${
      tab === 'ings' && counts.ings > 0
        ? `<div class="stack gap-10">
            <div class="row between center">
              <h2 class="h2">מה צריך?</h2>
              ${stepper(serv === 1 ? 'מנה 1' : `${serv} מנות`, 'rServUp', 'rServDown', 'stepper-pill')}
            </div>
            <div class="small-14">מסמנים את מה שכבר מוכן על השיש.</div>
            <div class="ing-list">
              ${r.ings
                .map(
                  (i, idx) => `<label>
                    <input type="checkbox" data-check="${idx}"${checked.has(idx) ? ' checked' : ''} />
                    <span class="grow">${esc(i.name)}</span>
                    <span class="small">${esc(scaledAmount(i, k))}</span>
                  </label>`,
                )
                .join('')}
            </div>
          </div>`
        : ''
    }

    ${
      tab === 'tools' && counts.tools > 0
        ? `<div>
            <h2 class="h2 mb-12">הכלים שלנו</h2>
            <div class="tools-grid">
              ${r.tools.map((t) => `<div class="tool">${toolIcon(t)}<span>${esc(t.label)}</span></div>`).join('')}
            </div>
          </div>`
        : ''
    }

    ${
      tab === 'steps' && counts.steps > 0
        ? `<div class="stack gap-18">
            <h2 class="h2">ככה מכינים</h2>
            ${r.steps
              .map(
                (st, i) => `<div class="row gap-12">
                  <span class="step-num">${i + 1}</span>
                  <div>
                    <div class="step-title">${esc(st.t)}</div>
                    <div class="step-text">${esc(st.d)}</div>
                  </div>
                </div>`,
              )
              .join('')}
            ${
              r.note
                ? `<div class="tip">
                    ${icon('sparkle', 24)}
                    <div>
                      <div class="tip-title">הקורט שעושה את ההבדל</div>
                      <div class="tip-text">${esc(r.note)}</div>
                    </div>
                  </div>`
                : ''
            }
          </div>`
        : ''
    }
  </div>`;
}

/* ---------- app actions ---------- */

function pushRecent(id) {
  state.recents = [id, ...state.recents.filter((x) => x !== id)].slice(0, MAX_RECENTS);
  persist('recents');
}

function openRecipe(id) {
  state.recipeId = id;
  state.creating = false;
  state.confirmDelete = false;
  pushRecent(id);
}

function goTab(t) {
  state.tab = t;
  state.recipeId = null;
  state.creating = false;
}

function startCreate(names = []) {
  state.form = blankForm(names);
  state.recipeId = null;
  state.creating = true;
}

function startEdit() {
  const recipe = current().recipe;
  if (!recipe) return;
  const b = blankForm();
  state.form = {
    ...b,
    editId: recipe.id,
    owner: recipe.author ? 'other' : 'me',
    author: recipe.author || '',
    title: recipe.title,
    desc: recipe.desc || '',
    img: recipe.hero || recipe.img || '',
    time: recipe.time ? String(recipe.time) : '',
    serv: recipe.serv,
    style: recipe.style,
    kind: recipe.kind,
    level: recipe.level,
    meal: recipe.meal,
    tip: recipe.note,
    ings: recipe.ings.length
      ? recipe.ings.map((i) => ({ name: i.name, amount: i.q ? `${i.q} ${i.q <= 1 ? i.u1 : i.u2}` : i.amount || '' }))
      : b.ings,
    tools: recipe.tools.map((t) => t.label),
    steps: recipe.steps.length ? recipe.steps.map((x) => ({ t: x.t, d: x.d })) : b.steps,
  };
  state.confirmDelete = false;
  state.recipeId = null;
  state.creating = true;
}

function saveRecipe() {
  const fm = state.form;
  if (missingFields(fm).length) return;
  const id = fm.editId || `m${Date.now()}`;
  const ings = fm.ings
    .filter((i) => i.name.trim())
    .map((i) => ({ name: i.name.trim(), amount: i.amount.trim() }));
  const rec = {
    id,
    mine: true,
    author: fm.owner === 'other' ? fm.author.trim() : '',
    title: fm.title.trim(),
    desc: fm.desc.trim(),
    img: fm.img,
    hero: fm.img,
    badge: '',
    time: parseInt(fm.time, 10) || 0,
    serv: fm.serv,
    style: fm.style,
    kind: fm.kind,
    level: fm.level,
    meal: fm.meal,
    tip: fm.desc.trim(),
    needs: ings.map((i) => i.name),
    ings,
    tools: fm.tools.map((label) => ({ label, icon: 'knife' })),
    steps: fm.steps.filter((x) => x.t.trim() || x.d.trim()),
    note: fm.tip.trim(),
  };

  if (fm.editId) {
    const orig = findRecipe(id);
    if (orig) {
      rec.mine = !!orig.mine;
      rec.badge = orig.badge || '';
      rec.tip = orig.mine ? rec.desc : orig.tip || rec.desc;
      rec.tools = rec.tools.map((t) => {
        const o = orig.tools.find((x) => x.label === t.label);
        return { ...t, icon: o ? o.icon : t.icon };
      });
    }
    state.recipes = state.recipes.map((x) => (x.id === id ? rec : x));
    state.recipeId = id;
  } else if (rec.author) {
    state.recipes = [rec, ...state.recipes];
    state.recipeId = id;
    pushRecent(id);
  } else {
    state.recipes = [rec, ...state.recipes];
    state.recipeId = null;
    state.tab = 'book';
    state.bookTab = 'mine';
  }
  persist('recipes');
  state.creating = false;
  state.form = blankForm();
}

function deleteRecipe() {
  const recipe = current().recipe;
  if (!recipe) return;
  const id = recipe.id;
  const not = (x) => x !== id;
  state.recipes = state.recipes.filter((x) => x.id !== id);
  state.recents = state.recents.filter(not);
  state.saved = state.saved.filter(not);
  persist('recipes', 'recents', 'saved');
  state.confirmDelete = false;
  state.recipeId = null;
  state.tab = 'book';
  state.bookTab = 'mine';
}

function toggleSave() {
  const recipe = current().recipe;
  if (!recipe) return;
  const isSaved = state.saved.includes(recipe.id);
  state.saved = isSaved ? state.saved.filter((x) => x !== recipe.id) : [recipe.id, ...state.saved];
  persist('saved');
}

function addTool() {
  const fm = state.form;
  const v = fm.toolDraft.trim();
  if (!v) return;
  fm.toolDraft = '';
  if (!fm.tools.includes(v)) fm.tools = [...fm.tools, v];
}

/** Click handlers, keyed by data-action. Each receives (data-k, data-v) and may return a function to run after rendering. */
const actions = {
  // shell
  back() {
    state.recipeId = null;
    state.creating = false;
    state.confirmDelete = false;
  },
  goTab: (_, v) => goTab(v),
  open: (_, v) => openRecipe(v),
  edit: startEdit,
  askDelete() {
    state.confirmDelete = true;
    state.scrollTop = true;
  },
  doDelete: deleteRecipe,
  cancelDelete: () => (state.confirmDelete = false),
  toggleSave,

  // book
  bookTab: (_, v) => (state.bookTab = v),
  create: () => startCreate(),

  // search
  toggleFilters() {
    state.filtersOpen = !state.filtersOpen;
    return animateChevron;
  },
  closeFilters: () => (state.filtersOpen = false),
  resetFilters: () => (state.filters = noFilters()),
  filterAll: (k) => (state.filters = { ...state.filters, [k]: [] }),
  filterMulti(k, v) {
    const cur = state.filters[k];
    state.filters = { ...state.filters, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
  },
  filterSingle: (k, v) => (state.filters = { ...state.filters, [k]: state.filters[k] === v ? '' : v }),

  // home
  pantryAdd: (_, v) => addPantry(v),
  pantryAddDraft: () => addPantry(state.home.draft),
  pantryRemove(_, v) {
    state.pantry = state.pantry.filter((x) => x !== v);
    persist('pantry');
  },
  find() {
    state.home.shown = true;
    setTimeout(() => {
      const el = document.getElementById('home-results');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  },
  createFromPantry: () => startCreate(state.pantry),

  // create / edit
  owner: (_, v) => (state.form.owner = v),
  formSingle: (k, v) => (state.form[k] = state.form[k] === v ? '' : v),
  formServUp: () => (state.form.serv = Math.min(12, state.form.serv + 1)),
  formServDown: () => (state.form.serv = Math.max(1, state.form.serv - 1)),
  ingAdd: () => (state.form.ings = [...state.form.ings, { name: '', amount: '' }]),
  ingRemove: (_, v) => (state.form.ings = state.form.ings.filter((_, i) => i !== +v)),
  stepAdd: () => (state.form.steps = [...state.form.steps, { t: '', d: '' }]),
  stepRemove: (_, v) => (state.form.steps = state.form.steps.filter((_, i) => i !== +v)),
  toolAdd: addTool,
  toolToggle(_, v) {
    const t = state.form.tools;
    state.form.tools = t.includes(v) ? t.filter((y) => y !== v) : [...t, v];
  },
  saveRecipe,

  // recipe view
  rTab: (_, v) => (state.rv.tab = v),
  rServUp: () => (state.rv.serv = Math.min(12, state.rv.serv + 1)),
  rServDown: () => (state.rv.serv = Math.max(1, state.rv.serv - 1)),
};

/* ---------- render ---------- */

let lastScreen = null;

function render() {
  const c = current();
  const screen = c.recipe ? 'r:' + c.recipe.id : c.inCreate ? 'create' : state.tab;
  const changed = screen !== lastScreen;
  lastScreen = screen;

  // A new screen starts with fresh local state, like a remounted component.
  if (changed) {
    state.filtersOpen = false;
    state.home = { draft: '', shown: false };
    if (c.recipe) state.rv = { tab: 'ings', serv: c.recipe.serv || 2, checked: new Set() };
  }

  // Remember focus and horizontal chip scroll so re-rendering doesn't jump.
  const active = document.activeElement;
  const focusId = active && active.id && $app.contains(active) ? active.id : null;
  let selStart = null;
  let selEnd = null;
  try {
    selStart = active.selectionStart;
    selEnd = active.selectionEnd;
  } catch (e) {
    /* not a text input */
  }
  const scrolls = {};
  $main.querySelectorAll('.chip-row[id]').forEach((el) => (scrolls[el.id] = el.scrollLeft));

  $header.innerHTML = renderHeader(c);
  $main.innerHTML = c.recipe
    ? recipeScreen(c.recipe)
    : c.inCreate
      ? createScreen()
      : state.tab === 'book'
        ? bookScreen()
        : state.tab === 'search'
          ? searchScreen()
          : homeScreen();
  $nav.innerHTML = renderNav();

  if (changed || state.scrollTop) {
    $main.scrollTop = 0;
    state.scrollTop = false;
  } else {
    for (const id in scrolls) {
      const el = document.getElementById(id);
      if (el) el.scrollLeft = scrolls[id];
    }
  }

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (selStart !== null) {
        try {
          el.setSelectionRange(selStart, selEnd);
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
}

/* ---------- events ---------- */

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  const after = fn(el.dataset.k, el.dataset.v);
  render();
  if (typeof after === 'function') after();
});

// Typing updates state and only the parts of the page that depend on it, so inputs keep focus.
$app.addEventListener('input', (e) => {
  const t = e.target;
  const d = t.dataset;
  if (t.id === 'q') {
    state.q = t.value;
    updateSearch();
  } else if (t.id === 'pantry-draft') {
    state.home.draft = t.value;
    updateSuggest();
  } else if (d.field) {
    state.form[d.field] = t.value;
    updateSaveArea();
  } else if (d.ing !== undefined) {
    state.form.ings[+d.ing][d.f] = t.value;
    updateSaveArea();
  } else if (d.step !== undefined) {
    state.form.steps[+d.step][d.f] = t.value;
    updateSaveArea();
  }
});

$app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'basics') {
    state.basics = t.checked;
    persist('basics');
  } else if (t.dataset.check !== undefined) {
    const i = +t.dataset.check;
    const checked = state.rv.checked;
    if (checked.has(i)) checked.delete(i);
    else checked.add(i);
    render();
  } else if (t.id === 'photo') {
    const file = t.files && t.files[0];
    if (!file) return;
    state.form.img = await readImage(file);
    render();
  }
});

$app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'pantry-draft') {
    addPantry(state.home.draft);
    render();
  } else if (e.target.id === 'fm-toolDraft') {
    addTool();
    render();
  }
});

// With a mouse, the vertical wheel scrolls chip rows sideways (on phones they are swiped).
$app.addEventListener(
  'wheel',
  (e) => {
    const row = e.target.closest('.chip-row');
    if (!row || e.deltaX !== 0 || row.scrollWidth <= row.clientWidth) return;
    // In RTL, scrollLeft goes from 0 (start, right edge) down to a negative value (end, left edge).
    const max = row.scrollWidth - row.clientWidth;
    const pos = Math.abs(row.scrollLeft);
    if ((e.deltaY > 0 && pos >= max - 1) || (e.deltaY < 0 && pos <= 0)) return; // at the edge: let the page scroll
    e.preventDefault();
    row.scrollLeft -= e.deltaY;
  },
  { passive: false },
);

render();

// On computers the app keeps the design's 390×844 size; shrink it evenly to fit smaller windows.
function fitToWindow() {
  const zoom = Math.min(1, (window.innerHeight - 48) / 844, (window.innerWidth - 48) / 390);
  document.documentElement.style.setProperty('--app-zoom', String(Math.max(zoom, 0.3)));
}
fitToWindow();
window.addEventListener('resize', fitToWindow);

// Offline support for the installed app. Service workers need http(s), so skip when opened as a file.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* app still works online */
  });
}
