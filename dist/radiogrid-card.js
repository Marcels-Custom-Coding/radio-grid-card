/**
 * Radio Grid Card for Music Assistant
 * Zwei Lovelace-Karten, kein Build-Step, kein Backend:
 *
 *   custom:radiogrid-card         – Anzeige/Player (pro Raum eine Karte)
 *   custom:radiogrid-config-card  – Verwaltung: Sender suchen, anlegen, Karten zuordnen
 *
 * Der Sender-Pool liegt zentral im Frontend-User-Storage von Home Assistant
 * (frontend/get_user_data / set_user_data) – alle Karten lesen daraus.
 */

const RADIOGRID_VERSION = '2.1.0';
console.info(
  `%c RADIOGRID-CARD %c v${RADIOGRID_VERSION} `,
  'color:#fff;background:#ff1adf;font-weight:700;border-radius:3px 0 0 3px',
  'color:#fff;background:#00a9c4;border-radius:0 3px 3px 0'
);

const ALL = 'Alle';
const STORE_KEY = 'radiogrid';
const STORE_EVT = 'radiogrid-store-changed';
const RB_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
];

const emptyStore = () => ({ version: 1, cards: [], stations: [] });
const uid = () => Math.random().toString(36).slice(2, 10);
const slug = s => String(s || '').toLowerCase().trim()
  .replace(/[äöüß]/g, m => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[m]))
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'karte';

async function storeLoad(hass) {
  try {
    const r = await hass.callWS({ type: 'frontend/get_user_data', key: STORE_KEY });
    const v = r && r.value;
    if (v && Array.isArray(v.stations)) return { ...emptyStore(), ...v };
  } catch (e) { console.warn('[radiogrid] Store konnte nicht geladen werden', e); }
  return emptyStore();
}
async function storeSave(hass, data) {
  await hass.callWS({ type: 'frontend/set_user_data', key: STORE_KEY, value: data });
  window.dispatchEvent(new CustomEvent(STORE_EVT, { detail: data }));
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const stationUrl = s => (s && (s.url || s.stream || s.media_id)) || '';

/* ══════════════════════════════════════════════════════════════
   ANZEIGE-KARTE
   ══════════════════════════════════════════════════════════════ */
class RadioGridCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._filter = ALL;
    this._built = false;
    this._dragging = false;
    this._store = emptyStore();
    this._onStore = e => { this._store = e.detail; this._renderFilters(); this._renderGrid(); };
  }

  static getConfigElement() { return document.createElement('radiogrid-card-editor'); }
  static getStubConfig() { return { entity: '', card_id: '', title: '' }; }
  getCardSize() { return 8; }

  connectedCallback() { window.addEventListener(STORE_EVT, this._onStore); }
  disconnectedCallback() { window.removeEventListener(STORE_EVT, this._onStore); }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error('Bitte einen Music-Assistant-Player angeben (entity: media_player.…)');
    }
    this._config = { title: '', card_id: '', ...config };
    this._filter = ALL;
    this._built = false;
    this.shadowRoot.innerHTML = '';
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._built) this._build();
    if (first) this._load();
    this._update();
  }

  async _load() {
    this._store = await storeLoad(this._hass);
    this._renderFilters();
    this._renderGrid();
  }

  // Inline-Liste (Alt-Config) hat Vorrang, sonst zentraler Pool nach Karten-Zuordnung.
  get _stations() {
    if (Array.isArray(this._config.stations) && this._config.stations.length) return this._config.stations;
    const all = this._store.stations || [];
    const id = this._config.card_id;
    if (!id) return all;
    return all.filter(s => s.cards && s.cards[id] === true);
  }
  get _state() { return this._hass && this._hass.states[this._config.entity]; }

  _categories() { return [ALL, ...new Set(this._stations.map(s => s.category || 'Sonstiges'))]; }
  _visible() {
    return this._filter === ALL ? this._stations
      : this._stations.filter(s => (s.category || 'Sonstiges') === this._filter);
  }
  _warn(msg) {
    const w = this.shadowRoot.getElementById('warn');
    if (w) { w.style.display = ''; w.textContent = msg; }
  }
  _call(domain, service, data) {
    return this._hass.callService(domain, service, { entity_id: this._config.entity, ...data });
  }

  _play(station) {
    const url = stationUrl(station);
    if (!url) { this._warn(`Sender "${station.name || '?'}" hat keine Stream-URL.`); return; }
    this._current = station;
    this._call('music_assistant', 'play_media', { media_id: url, media_type: 'radio', enqueue: 'replace' });
  }
  _toggle() {
    const st = this._state; if (!st) return;
    this._call('media_player', st.state === 'playing' ? 'media_pause' : 'media_play');
  }
  _stop() { this._call('media_player', 'media_stop'); }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 12px; overflow: hidden; }
        .head { font-size: 1.05rem; font-weight: 600; margin: 0 4px 10px; }
        .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .chip { border: 1px solid var(--divider-color); background: var(--card-background-color);
          color: var(--secondary-text-color); font: inherit; font-size: .78rem; font-weight: 600;
          padding: 6px 13px; border-radius: 99px; cursor: pointer; }
        .chip.on { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
        .tile { background: var(--secondary-background-color); border: 1px solid var(--divider-color);
          border-radius: 10px; padding: 8px 5px 7px; cursor: pointer; text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .tile:active { transform: scale(.97); }
        .tile.on { border-color: var(--primary-color); box-shadow: 0 0 0 2px var(--primary-color); }
        .logo { width: 48px; height: 48px; border-radius: 8px; overflow: hidden; background: var(--card-background-color);
          display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
        .logo img { width: 100%; height: 100%; object-fit: contain; padding: 3px; box-sizing: border-box; }
        .tname { font-size: .72rem; font-weight: 600; line-height: 1.1;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .tcat { font-size: .58rem; color: var(--secondary-text-color); text-transform: uppercase; }
        .empty { color: var(--secondary-text-color); text-align: center; padding: 24px 8px; font-size: .88rem; }
        .bar { display: flex; align-items: center; gap: 12px; margin-top: 14px;
          border-top: 1px solid var(--divider-color); padding-top: 12px; }
        .cover { width: 62px; height: 62px; border-radius: 10px; overflow: hidden; flex-shrink: 0;
          background: var(--secondary-background-color); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; }
        .cover img { width: 100%; height: 100%; object-fit: cover; }
        .meta { flex: 1; min-width: 0; }
        .mname { font-weight: 700; font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .msong { font-size: .8rem; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ctrls { display: flex; gap: 4px; flex-shrink: 0; }
        .cbtn { border: none; background: none; color: var(--primary-text-color); width: 42px; height: 42px;
          border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .cbtn.main { background: var(--primary-color); color: #fff; width: 48px; height: 48px; }
        .vol { position: relative; height: 34px; margin: 6px 2px 0; cursor: pointer; touch-action: none; }
        .vtrack { position: absolute; left: 0; right: 0; top: 50%; margin-top: -4px; height: 8px;
          border-radius: 4px; background: var(--secondary-background-color); }
        .vfill { position: absolute; left: 0; top: 50%; margin-top: -4px; height: 8px; border-radius: 4px;
          background: var(--primary-color); width: 0%; }
        .vknob { position: absolute; top: 50%; width: 24px; height: 24px; margin-top: -12px;
          transform: translateX(-50%); border-radius: 50%; background: var(--card-background-color);
          border: 3px solid var(--primary-color); box-shadow: 0 1px 4px rgba(0,0,0,.3); left: 0%; }
        .warn { color: var(--error-color); font-size: .85rem; padding: 8px 4px; }
      </style>
      <ha-card>
        ${this._config.title ? `<div class="head">${esc(this._config.title)}</div>` : ''}
        <div class="filters" id="filters"></div>
        <div class="grid" id="grid"></div>
        <div class="bar">
          <div class="cover" id="cover">📻</div>
          <div class="meta"><div class="mname" id="mname">–</div><div class="msong" id="msong"></div></div>
          <div class="ctrls">
            <button class="cbtn main" id="btn-play" aria-label="Play/Pause"></button>
            <button class="cbtn" id="btn-stop" aria-label="Stop">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
            </button>
          </div>
        </div>
        <div class="vol" id="vol"><div class="vtrack"></div><div class="vfill" id="vfill"></div><div class="vknob" id="vknob"></div></div>
        <div class="warn" id="warn" style="display:none"></div>
      </ha-card>`;

    const $ = id => this.shadowRoot.getElementById(id);
    $('btn-play').addEventListener('click', () => this._toggle());
    $('btn-stop').addEventListener('click', () => this._stop());

    const vol = $('vol');
    const pos = e => {
      const r = vol.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    vol.addEventListener('pointerdown', e => { this._dragging = true; vol.setPointerCapture(e.pointerId); this._vol(pos(e)); });
    vol.addEventListener('pointermove', e => { if (this._dragging) this._vol(pos(e)); });
    vol.addEventListener('pointerup', e => { if (this._dragging) { this._dragging = false; this._vol(pos(e), true); } });
    vol.addEventListener('pointercancel', () => { this._dragging = false; });

    this._renderFilters();
    this._renderGrid();
  }

  _vol(v, commit) {
    this._volUI(v);
    clearTimeout(this._volT);
    this._volT = setTimeout(() => this._call('media_player', 'volume_set', { volume_level: v }), commit ? 0 : 120);
  }
  _volUI(v) {
    const p = (v * 100) + '%';
    this.shadowRoot.getElementById('vfill').style.width = p;
    this.shadowRoot.getElementById('vknob').style.left = p;
  }

  _renderFilters() {
    const el = this.shadowRoot.getElementById('filters');
    if (!el) return;
    const cats = this._categories();
    el.innerHTML = '';
    if (cats.length <= 2) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    cats.forEach(c => {
      const b = document.createElement('button');
      b.className = 'chip' + (c === this._filter ? ' on' : '');
      b.textContent = c;
      b.addEventListener('click', () => { this._filter = c; this._renderFilters(); this._renderGrid(); });
      el.appendChild(b);
    });
  }

  _renderGrid() {
    const el = this.shadowRoot.getElementById('grid');
    if (!el) return;
    const list = this._visible();
    el.innerHTML = '';
    if (!list.length) {
      el.innerHTML = `<div class="empty">${this._config.card_id
        ? `Dieser Karte („${esc(this._config.card_id)}") sind noch keine Sender zugeordnet.<br>Das machst du in der <b>RadioGrid-Verwaltung</b>.`
        : 'Noch keine Sender. Lege sie in der <b>RadioGrid-Verwaltung</b> an.'}</div>`;
      return;
    }
    const playing = (this._state && this._state.attributes.media_content_id) || '';
    list.forEach(s => {
      const u = stationUrl(s);
      const t = document.createElement('div');
      t.className = 'tile' + (u && playing.includes(u) ? ' on' : '');
      t.innerHTML = `
        <div class="logo">${s.logo ? `<img src="${esc(s.logo)}" onerror="this.replaceWith('📻')">` : '📻'}</div>
        <div class="tname">${esc(s.name)}</div>
        ${s.category ? `<div class="tcat">${esc(s.category)}</div>` : ''}`;
      t.addEventListener('click', () => this._play(s));
      el.appendChild(t);
    });
  }

  _update() {
    const $ = id => this.shadowRoot.getElementById(id);
    const st = this._state;
    const warn = $('warn');
    if (!warn) return;
    if (!st) { warn.style.display = ''; warn.textContent = `Entity "${this._config.entity}" nicht gefunden.`; return; }
    warn.style.display = 'none';

    const a = st.attributes || {};
    const playing = st.state === 'playing' || st.state === 'buffering';
    $('btn-play').innerHTML = playing
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>';

    const song = [a.media_artist, a.media_title].filter(Boolean).join(' – ');
    $('mname').textContent = (this._current && this._current.name) || a.media_title || a.friendly_name || '–';
    $('msong').textContent = song || (playing ? '● Live' : st.state);

    const pic = a.entity_picture || (this._current && this._current.logo) || '';
    const cover = $('cover');
    if (pic && cover.dataset.src !== pic) {
      cover.dataset.src = pic;
      cover.innerHTML = `<img src="${esc(pic)}" onerror="this.replaceWith('📻')">`;
    } else if (!pic && cover.dataset.src) { cover.dataset.src = ''; cover.innerHTML = '📻'; }

    if (!this._dragging && typeof a.volume_level === 'number') this._volUI(a.volume_level);

    const pUrl = a.media_content_id || '';
    if (pUrl !== this._lastPlayingUrl) { this._lastPlayingUrl = pUrl; this._renderGrid(); }
  }
}
customElements.define('radiogrid-card', RadioGridCard);

/* ── Editor der Anzeige-Karte ───────────────────────────────── */
// <ha-entity-picker> ist Teil des HA-Frontends, aber nicht immer schon registriert.
// Über loadCardHelpers() den Entities-Karten-Editor anstoßen – der zieht den Picker mit.
let _pickerPromise = null;
function ensureEntityPicker() {
  if (customElements.get('ha-entity-picker')) return Promise.resolve(true);
  if (!_pickerPromise) {
    _pickerPromise = (async () => {
      try {
        const helpers = await window.loadCardHelpers();
        const card = await helpers.createCardElement({ type: 'entities', entities: [] });
        if (card && card.constructor && card.constructor.getConfigElement) {
          await card.constructor.getConfigElement();
        }
      } catch (e) { console.warn('[radiogrid] ha-entity-picker nicht ladbar', e); }
      return !!customElements.get('ha-entity-picker');
    })();
  }
  return _pickerPromise;
}

class RadioGridCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { title: '', card_id: '', ...config };
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      storeLoad(hass).then(s => { this._store = s; this._render(); });
      ensureEntityPicker().then(ok => { this._picker = ok; this._built = false; this._render(); });
    }
    if (this._entityEl) this._entityEl.hass = hass;
  }
  _emit(cfg) {
    this._config = cfg;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
  }

  _render() {
    if (!this._config) return;
    if (!this._built) this._build();
    this._sync();
  }

  _build() {
    this._built = true;
    this.innerHTML = `
      <style>
        .rg { display: flex; flex-direction: column; gap: 14px; padding: 4px; }
        .rg .lbl { font-size: .8rem; color: var(--secondary-text-color); display: block; margin-bottom: 4px; }
        .rg input, .rg select { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 6px;
          border: 1px solid var(--divider-color); background: var(--card-background-color);
          color: var(--primary-text-color); font: inherit; font-size: .9rem; }
        .rg .hint { font-size: .75rem; color: var(--secondary-text-color); margin-top: 4px; }
      </style>
      <div class="rg">
        <div>
          <div id="eslot"></div>
          <div class="hint">Player oder Sync-Gruppe von Music Assistant.</div>
        </div>
        <div>
          <span class="lbl">Karte</span>
          <select id="c"></select>
          <div class="hint" id="chint"></div>
        </div>
        <div>
          <span class="lbl">Titel (optional)</span>
          <input id="t">
        </div>
      </div>`;

    const slot = this.querySelector('#eslot');
    if (this._picker) {
      const p = document.createElement('ha-entity-picker');
      p.hass = this._hass;
      p.label = 'Music-Assistant-Player';
      p.includeDomains = ['media_player'];
      p.allowCustomEntity = true;
      p.addEventListener('value-changed', e => {
        e.stopPropagation();
        this._emit({ ...this._config, entity: e.detail.value || '' });
      });
      this._entityEl = p;
      slot.appendChild(p);
    } else {
      slot.innerHTML = `<span class="lbl">Music-Assistant-Player</span>
        <input id="e" placeholder="media_player.kuche_sonos">`;
      this._entityEl = this.querySelector('#e');
      this._entityEl.addEventListener('change', e =>
        this._emit({ ...this._config, entity: e.target.value.trim() }));
    }

    this.querySelector('#c').addEventListener('change', e => this._emit({ ...this._config, card_id: e.target.value }));
    this.querySelector('#t').addEventListener('change', e => this._emit({ ...this._config, title: e.target.value }));
  }

  // Werte setzen, ohne den Picker neu zu bauen (sonst springt der Fokus).
  _sync() {
    const cards = (this._store && this._store.cards) || [];
    if (this._entityEl) this._entityEl.value = this._config.entity || '';

    const sel = this.querySelector('#c');
    if (sel) {
      sel.innerHTML = `<option value="">– alle Sender –</option>` +
        cards.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      sel.value = this._config.card_id || '';
    }
    const hint = this.querySelector('#chint');
    if (hint) hint.innerHTML = cards.length
      ? 'Zeigt die Sender, die dieser Karte in der Verwaltung zugeordnet sind.'
      : 'Noch keine Karten angelegt – das machst du in der <b>RadioGrid-Verwaltung</b>.';

    const t = this.querySelector('#t');
    if (t) t.value = this._config.title || '';
  }
}
customElements.define('radiogrid-card-editor', RadioGridCardEditor);

/* ══════════════════════════════════════════════════════════════
   VERWALTUNGS-KARTE (Mainview)
   ══════════════════════════════════════════════════════════════ */
class RadioGridConfigCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._store = emptyStore();
    this._results = [];
    this._editing = null;
    this._built = false;
  }
  static getStubConfig() { return {}; }
  setConfig(config) { this._config = config || {}; }
  getCardSize() { return 12; }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._built) this._build();
    if (first) storeLoad(hass).then(s => { this._store = s; this._renderAll(); });
  }

  async _save() {
    try { await storeSave(this._hass, this._store); }
    catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
    this._renderAll();
  }

  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 14px; }
        h3 { margin: 0 0 8px; font-size: .95rem; }
        .sec { margin-bottom: 20px; }
        .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        input, select { padding: 8px 10px; border-radius: 6px; border: 1px solid var(--divider-color);
          background: var(--card-background-color); color: var(--primary-text-color); font: inherit; font-size: .88rem; }
        input { flex: 1; min-width: 120px; }
        button { font: inherit; font-size: .82rem; font-weight: 600; padding: 8px 13px; border-radius: 6px;
          border: 1px solid var(--divider-color); background: var(--card-background-color);
          color: var(--primary-text-color); cursor: pointer; }
        button.p { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
        button.d { color: var(--error-color); }
        .cards { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .cpill { display: flex; align-items: center; gap: 6px; background: var(--secondary-background-color);
          border: 1px solid var(--divider-color); border-radius: 99px; padding: 5px 6px 5px 12px; font-size: .82rem; }
        .cpill code { opacity: .6; font-size: .72rem; }
        .cpill button { border: none; background: none; padding: 2px 4px; color: var(--error-color); }
        .item { display: flex; gap: 10px; align-items: center; padding: 8px; border: 1px solid var(--divider-color);
          border-radius: 8px; margin-bottom: 6px; }
        .ico { width: 34px; height: 34px; border-radius: 6px; background: var(--secondary-background-color);
          display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .ico img { width: 100%; height: 100%; object-fit: contain; }
        .info { flex: 1; min-width: 0; }
        .nm { font-size: .88rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sb { font-size: .72rem; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .assign { display: flex; flex-wrap: wrap; gap: 8px; }
        .assign label { display: flex; align-items: center; gap: 4px; font-size: .75rem; }
        .edit { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; margin-bottom: 8px;
          border: 1px solid var(--primary-color); border-radius: 8px; }
        .edit .full { grid-column: 1 / -1; }
        .hint { font-size: .75rem; color: var(--secondary-text-color); }
        .msg { font-size: .82rem; color: var(--secondary-text-color); padding: 10px 2px; }
      </style>
      <ha-card>
        <div class="sec">
          <h3>Karten</h3>
          <div class="cards" id="cards"></div>
          <div class="row">
            <input id="new-card" placeholder="Neue Karte, z.B. Küche">
            <button class="p" id="add-card">＋ Karte</button>
          </div>
          <div class="hint">Der Name ist nur hier sichtbar. In der Anzeige-Karte wählst du ihn dann aus.</div>
        </div>

        <div class="sec">
          <h3>Sender suchen</h3>
          <div class="row">
            <input id="q" placeholder="z.B. Radio BOB, SomaFM, lofi…">
            <button class="p" id="search">Suchen</button>
            <button id="manual">＋ manuell</button>
          </div>
          <div id="results"></div>
        </div>

        <div class="sec">
          <h3>Sender <span id="count" class="hint"></span></h3>
          <div id="edit"></div>
          <div id="pool"></div>
        </div>
      </ha-card>`;

    const $ = id => this.shadowRoot.getElementById(id);
    $('add-card').addEventListener('click', () => this._addCard());
    $('new-card').addEventListener('keydown', e => { if (e.key === 'Enter') this._addCard(); });
    $('search').addEventListener('click', () => this._search());
    $('q').addEventListener('keydown', e => { if (e.key === 'Enter') this._search(); });
    $('manual').addEventListener('click', () => { this._editing = { id: uid(), name: '', url: '', logo: '', category: '', cards: {} }; this._renderEdit(); });
  }

  _addCard() {
    const inp = this.shadowRoot.getElementById('new-card');
    const name = inp.value.trim();
    if (!name) return;
    let id = slug(name), n = 1;
    while (this._store.cards.some(c => c.id === id)) id = slug(name) + '-' + (++n);
    this._store.cards.push({ id, name });
    inp.value = '';
    this._save();
  }
  _delCard(id) {
    const c = this._store.cards.find(x => x.id === id);
    if (!confirm(`Karte „${c ? c.name : id}" entfernen?\nDie Zuordnung der Sender geht verloren.`)) return;
    this._store.cards = this._store.cards.filter(x => x.id !== id);
    this._store.stations.forEach(s => { if (s.cards) delete s.cards[id]; });
    this._save();
  }

  async _search() {
    const q = this.shadowRoot.getElementById('q').value.trim();
    const box = this.shadowRoot.getElementById('results');
    if (q.length < 2) { box.innerHTML = '<div class="msg">Bitte mindestens 2 Zeichen.</div>'; return; }
    box.innerHTML = '<div class="msg">Suche läuft…</div>';
    const path = `/json/stations/byname/${encodeURIComponent(q)}?limit=30&hidebroken=true&order=clickcount&reverse=true`;
    for (const srv of RB_SERVERS) {
      try {
        const res = await fetch(srv + path, { headers: { 'User-Agent': 'RadioGridCard/2.0' } });
        if (!res.ok) continue;
        const list = await res.json();
        this._results = (Array.isArray(list) ? list : [])
          .filter(x => (x.url_resolved || x.url || '').startsWith('http'))
          .map(x => ({
            name: x.name || '', url: x.url_resolved || x.url, logo: x.favicon || '',
            category: (x.tags || '').split(',')[0].trim(),
            meta: [x.country, x.codec, x.bitrate ? x.bitrate + 'k' : ''].filter(Boolean).join(' · '),
          }));
        this._renderResults();
        return;
      } catch (e) { /* nächster Server */ }
    }
    box.innerHTML = '<div class="msg">Suche fehlgeschlagen (Radio-Browser nicht erreichbar).</div>';
  }

  _renderResults() {
    const box = this.shadowRoot.getElementById('results');
    if (!this._results.length) { box.innerHTML = '<div class="msg">Keine Treffer.</div>'; return; }
    box.innerHTML = '';
    this._results.forEach(r => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `
        <div class="ico">${r.logo ? `<img src="${esc(r.logo)}" onerror="this.replaceWith('📻')">` : '📻'}</div>
        <div class="info"><div class="nm">${esc(r.name)}</div><div class="sb">${esc(r.meta)}</div></div>
        <button class="p">＋</button>`;
      el.querySelector('button').addEventListener('click', () => {
        this._editing = { id: uid(), name: r.name, url: r.url, logo: r.logo, category: r.category || 'Sonstiges', cards: {} };
        this._renderEdit();
        this.shadowRoot.getElementById('edit').scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      box.appendChild(el);
    });
  }

  _renderEdit() {
    const box = this.shadowRoot.getElementById('edit');
    const s = this._editing;
    if (!s) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="edit">
        <input id="f-name" placeholder="Name" value="${esc(s.name)}">
        <input id="f-cat" placeholder="Kategorie" value="${esc(s.category)}">
        <input class="full" id="f-url" placeholder="Stream-URL (http…)" value="${esc(s.url)}">
        <input class="full" id="f-logo" placeholder="Logo-URL (optional)" value="${esc(s.logo)}">
        <div class="full assign" id="f-cards"></div>
        <div class="full row" style="justify-content:flex-end">
          <button id="f-cancel">Abbrechen</button>
          <button class="p" id="f-ok">Speichern</button>
        </div>
      </div>`;
    const ca = box.querySelector('#f-cards');
    ca.innerHTML = this._store.cards.length
      ? this._store.cards.map(c => `<label><input type="checkbox" data-c="${esc(c.id)}" ${s.cards && s.cards[c.id] ? 'checked' : ''}>${esc(c.name)}</label>`).join('')
      : '<span class="hint">Noch keine Karten angelegt.</span>';
    box.querySelector('#f-cancel').addEventListener('click', () => { this._editing = null; this._renderEdit(); });
    box.querySelector('#f-ok').addEventListener('click', () => {
      const g = id => box.querySelector(id).value.trim();
      const name = g('#f-name'), url = g('#f-url');
      if (!name) return alert('Name fehlt.');
      if (!/^https?:\/\//i.test(url)) return alert('Stream-URL muss mit http:// oder https:// beginnen.');
      const cards = {};
      ca.querySelectorAll('input[type=checkbox]').forEach(cb => { cards[cb.dataset.c] = cb.checked; });
      const rec = { id: s.id, name, url, logo: g('#f-logo'), category: g('#f-cat') || 'Sonstiges', cards };
      const i = this._store.stations.findIndex(x => x.id === s.id);
      if (i >= 0) this._store.stations[i] = rec; else this._store.stations.push(rec);
      this._editing = null;
      this._save();
    });
  }

  _renderPool() {
    const box = this.shadowRoot.getElementById('pool');
    const cnt = this.shadowRoot.getElementById('count');
    const list = this._store.stations || [];
    cnt.textContent = list.length ? `(${list.length})` : '';
    if (!list.length) { box.innerHTML = '<div class="msg">Noch keine Sender – oben suchen oder manuell anlegen.</div>'; return; }
    box.innerHTML = '';
    list.forEach(s => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `
        <div class="ico">${s.logo ? `<img src="${esc(s.logo)}" onerror="this.replaceWith('📻')">` : '📻'}</div>
        <div class="info">
          <div class="nm">${esc(s.name)}</div>
          <div class="sb">${esc(s.category || '')}</div>
          <div class="assign"></div>
        </div>
        <button data-a="edit">✏️</button>
        <button class="d" data-a="del">🗑</button>`;
      const as = el.querySelector('.assign');
      as.innerHTML = this._store.cards.length
        ? this._store.cards.map(c => `<label><input type="checkbox" data-c="${esc(c.id)}" ${s.cards && s.cards[c.id] ? 'checked' : ''}>${esc(c.name)}</label>`).join('')
        : '<span class="hint">– keine Karten –</span>';
      as.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
        s.cards = s.cards || {};
        s.cards[cb.dataset.c] = cb.checked;
        this._save();
      }));
      el.querySelector('[data-a=edit]').addEventListener('click', () => { this._editing = { ...s, cards: { ...(s.cards || {}) } }; this._renderEdit(); });
      el.querySelector('[data-a=del]').addEventListener('click', () => {
        if (!confirm(`„${s.name}" löschen?`)) return;
        this._store.stations = this._store.stations.filter(x => x.id !== s.id);
        this._save();
      });
      box.appendChild(el);
    });
  }

  _renderCards() {
    const box = this.shadowRoot.getElementById('cards');
    if (!this._store.cards.length) { box.innerHTML = '<span class="hint">Noch keine Karte angelegt.</span>'; return; }
    box.innerHTML = '';
    this._store.cards.forEach(c => {
      const p = document.createElement('span');
      p.className = 'cpill';
      p.innerHTML = `${esc(c.name)} <code>${esc(c.id)}</code> <button title="Entfernen">✕</button>`;
      p.querySelector('button').addEventListener('click', () => this._delCard(c.id));
      box.appendChild(p);
    });
  }

  _renderAll() { this._renderCards(); this._renderEdit(); this._renderPool(); }
}
customElements.define('radiogrid-config-card', RadioGridConfigCard);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: 'radiogrid-card',
    name: 'Radio Grid Card',
    description: 'Web-Radio-Kacheln mit Player für Music Assistant',
    preview: false,
    documentationURL: 'https://github.com/Marcels-Custom-Coding/radio-grid-card',
  },
  {
    type: 'radiogrid-config-card',
    name: 'Radio Grid – Verwaltung',
    description: 'Sender suchen, anlegen und Karten zuordnen',
    preview: false,
    documentationURL: 'https://github.com/Marcels-Custom-Coding/radio-grid-card',
  }
);
