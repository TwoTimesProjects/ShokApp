// ===== State =====
let state = {
  folderPath: null,
  shortcuts: [],
  // Steam
  steamCreds:   { apiKey: '', steamId: '' },
  steamGames:   [],    // installed Steam games not matched to any shortcut
  steamPlaytime:{},    // scId → minutes (from Steam API)
  steamAppIds:  {},    // scId → appid (for matched shortcuts + steam entries)
  // Session tracking (process watcher)
  sessionTime:    {},  // scId → total seconds tracked
  activeSessions: {},  // scId → session start timestamp
  // Shared
  iconCache: {},
  favorites: new Set(),
  categories: {},
  recentlyPlayed: [],
  playCounts: {},
  firstPlayed: {},
  lastPlayedTime: {},
  currentView: 'all',
  searchQuery: '',
  sortOrder: 'name-az',
  customArt: {},
  gridSize: 160,
  hiddenItems: new Set(),
  showHidden: false,
  selectedId: null,
  notes: {},
  contextCatId: null,
  addToCatTargetId: null,
};

// All items = folder shortcuts + standalone Steam games (deduped)
function getAllItems() {
  if (state.steamGames.length === 0) return [...state.shortcuts];
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const shortcutAppIds = new Set(
    state.shortcuts
      .filter(sc => state.steamAppIds[sc.id] !== undefined)
      .map(sc => state.steamAppIds[sc.id])
  );
  const shortcutNorms = new Set(state.shortcuts.map(sc => norm(sc.name)));
  const uniqueSteam = state.steamGames.filter(g =>
    !shortcutAppIds.has(g.steamAppId) &&
    !(norm(g.name).length >= 3 && shortcutNorms.has(norm(g.name)))
  );
  return [...state.shortcuts, ...uniqueSteam];
}
function findItem(id)  { return getAllItems().find(s => s.id === id); }

// ===== DOM refs =====
const $ = id => document.getElementById(id);
const els = {
  folderName:          $('folder-name'),
  btnOpenFolder:       $('btn-open-folder'),
  btnChangeFolder:     $('btn-change-folder'),
  btnRescan:           $('btn-rescan'),
  categoriesList:      $('categories-list'),
  navItems:            document.querySelectorAll('.nav-item[data-view]'),
  btnAddItemsToCat:    $('btn-add-items-to-cat'),
  btnShowHidden:       $('btn-show-hidden'),
  sortSelect:          $('sort-select'),
  gridSizeSlider:      $('grid-size-slider'),
  viewTitle:           $('view-title'),
  searchInput:         $('search-input'),
  searchClear:         $('search-clear'),
  emptyState:          $('empty-state'),
  shortcutsGrid:       $('shortcuts-grid'),
  mostPlayedStrip:     $('most-played-strip'),
  mostPlayedCards:     $('most-played-cards'),
  recentStrip:         $('recent-strip'),
  recentCards:         $('recent-cards'),
  modalOverlay:        $('modal-overlay'),
  modalCategory:       $('modal-category'),
  categoryNameInput:   $('category-name-input'),
  btnCancelCategory:   $('btn-cancel-category'),
  btnConfirmCategory:  $('btn-confirm-category'),
  modalAddToCat:       $('modal-add-to-cat'),
  addToCatName:        $('add-to-cat-name'),
  addToCatList:        $('add-to-cat-list'),
  btnCloseAddToCat:    $('btn-close-add-to-cat'),
  modalTheme:          $('modal-theme'),
  themePresets:        $('theme-presets'),
  btnResetTheme:       $('btn-reset-theme'),
  btnCloseTheme:       $('btn-close-theme'),
  modalRenameCat:      $('modal-rename-cat'),
  renameCatInput:      $('rename-cat-input'),
  btnCancelRenameCat:  $('btn-cancel-rename-cat'),
  btnConfirmRenameCat: $('btn-confirm-rename-cat'),
  contextMenu:         $('context-menu'),
  ctxRename:           $('ctx-rename'),
  ctxAddItems:         $('ctx-add-items'),
  ctxDelete:           $('ctx-delete'),
  detailPanel:         $('detail-panel'),
  detailClose:         $('detail-close'),
  detailCoverImg:      $('detail-cover-img'),
  detailCoverFallback: $('detail-cover-fallback'),
  btnSetArt:           $('btn-set-art'),
  btnRemoveArt:        $('btn-remove-art'),
  detailName:          $('detail-name'),
  detailTarget:        $('detail-target'),
  detailPlays:         $('detail-plays'),
  detailSteamTime:     $('detail-steam-time'),
  detailRowSteam:      $('detail-row-steam'),
  detailSessionTime:   $('detail-session-time'),
  detailRowSession:    $('detail-row-session'),
  detailFirstPlayed:   $('detail-first-played'),
  detailLastPlayed:    $('detail-last-played'),
  detailCats:          $('detail-cats'),
  detailNotes:         $('detail-notes'),
  detailBtnHide:       $('detail-btn-hide'),
  detailBtnLaunch:     $('detail-btn-launch'),
  modalProgramScanner:      $('modal-program-scanner'),
  programScannerStatus:     $('program-scanner-status'),
  programSearch:            $('program-search'),
  programList:              $('program-list'),
  programSelectedCount:     $('program-selected-count'),
  btnSelectAllPrograms:     $('btn-select-all-programs'),
  btnCancelProgramScanner:  $('btn-cancel-program-scanner'),
  btnAddSelectedPrograms:   $('btn-add-selected-programs'),
  modalSettings:       $('modal-settings'),
  modalStats:          $('modal-stats'),
  btnCloseStats:       $('btn-close-stats'),
  statCpuRing:         $('stat-cpu-ring'),
  statCpuPct:          $('stat-cpu-pct'),
  statCpuTemp:         $('stat-cpu-temp'),
  statCpuDetail:       $('stat-cpu-detail'),
  statCpuName:         $('stat-cpu-name'),
  statRamRing:         $('stat-ram-ring'),
  statRamPct:          $('stat-ram-pct'),
  statRamDetail:       $('stat-ram-detail'),
  statGpuRing:         $('stat-gpu-ring'),
  statGpuPct:          $('stat-gpu-pct'),
  statGpuTemp:         $('stat-gpu-temp'),
  statGpuDetail:       $('stat-gpu-detail'),
  statGpuName:         $('stat-gpu-name'),
  steamApiKey:         $('steam-api-key'),
  steamIdVal:          $('steam-id-val'),
  steamSyncStatus:     $('steam-sync-status'),
  btnSteamSync:        $('btn-steam-sync'),
  btnCloseSettings:    $('btn-close-settings'),
  modalWebShortcut:    $('modal-web-shortcut'),
  webShortcutName:     $('web-shortcut-name'),
  webShortcutUrl:      $('web-shortcut-url'),
  webShortcutError:    $('web-shortcut-error'),
};

const toastEl = document.createElement('div');
toastEl.id = 'toast';
document.body.appendChild(toastEl);

// ===== Themes =====
const THEMES = [
  { name: 'Deep Space',    vars: { '--bg-primary':'#12121f', '--bg-sidebar':'#1a1a2e', '--bg-card':'#1e1e35', '--accent':'#7b5ea7', '--text-primary':'#e8e8f0', '--text-dim':'#8888aa' } },
  { name: 'Midnight Blue', vars: { '--bg-primary':'#0d1117', '--bg-sidebar':'#161b22', '--bg-card':'#1c2333', '--accent':'#1f6feb', '--text-primary':'#c9d1d9', '--text-dim':'#8b949e' } },
  { name: 'Forest',        vars: { '--bg-primary':'#0d130d', '--bg-sidebar':'#111a11', '--bg-card':'#162016', '--accent':'#3fb950', '--text-primary':'#d2e8d2', '--text-dim':'#7a9a7a' } },
  { name: 'Crimson',       vars: { '--bg-primary':'#180a0a', '--bg-sidebar':'#231010', '--bg-card':'#2a1212', '--accent':'#c0392b', '--text-primary':'#f0d8d8', '--text-dim':'#9a7070' } },
  { name: 'Amber',         vars: { '--bg-primary':'#13100a', '--bg-sidebar':'#1c1710', '--bg-card':'#231d13', '--accent':'#e6a817', '--text-primary':'#f0e8d0', '--text-dim':'#9a8860' } },
  { name: 'Light Mode',    vars: { '--bg-primary':'#f5f5f5', '--bg-sidebar':'#ebebeb', '--bg-card':'#ffffff', '--accent':'#6c4ab6', '--text-primary':'#1a1a2e', '--text-dim':'#555570' } },
];
const ROOT_VARS = ['--bg-primary','--bg-sidebar','--bg-card','--accent','--text-primary','--text-dim'];

function applyDerivedVars() {
  const root = document.documentElement;
  const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
  root.style.setProperty('--accent-glow',   hexToRgba(accent, 0.35));
  root.style.setProperty('--accent-hover',  lighten(accent, 25));
  root.style.setProperty('--bg-card-hover', lighten(getComputedStyle(root).getPropertyValue('--bg-card').trim(), 10));
  root.style.setProperty('--bg-topbar',     darken(getComputedStyle(root).getPropertyValue('--bg-primary').trim(), 5));
  root.style.setProperty('--border',        hexToRgba(getComputedStyle(root).getPropertyValue('--text-primary').trim(), 0.07));
  root.style.setProperty('--text-muted',    hexToRgba(getComputedStyle(root).getPropertyValue('--text-dim').trim(), 0.7));
  root.style.setProperty('--scrollbar',     lighten(getComputedStyle(root).getPropertyValue('--bg-sidebar').trim(), 12));
  root.style.setProperty('--recent-bg',     lighten(getComputedStyle(root).getPropertyValue('--bg-primary').trim(), 5));
}
function applyThemeVars(vars) {
  for (const [k,v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  applyDerivedVars();
}
function hexToRgba(hex, alpha) {
  hex = hex.replace('#','');
  if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  return `rgba(${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)},${alpha})`;
}
function lighten(hex,amt) { return adjustBrightness(hex, amt); }
function darken(hex,amt)  { return adjustBrightness(hex,-amt); }
function adjustBrightness(hex,amt) {
  hex=(hex||'#888888').replace('#','');
  if(hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const r=Math.min(255,Math.max(0,parseInt(hex.slice(0,2),16)+amt));
  const g=Math.min(255,Math.max(0,parseInt(hex.slice(2,4),16)+amt));
  const b=Math.min(255,Math.max(0,parseInt(hex.slice(4,6),16)+amt));
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function rgbToHex(rgb) {
  const m=rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if(!m) return '#888888';
  return '#'+[m[1],m[2],m[3]].map(v=>parseInt(v).toString(16).padStart(2,'0')).join('');
}

// ===== Auto-updater =====
(function initUpdater() {
  const banner  = document.getElementById('update-banner');
  const msg     = document.getElementById('update-message');
  const installBtn = document.getElementById('update-install-btn');
  const dismissBtn = document.getElementById('update-dismiss-btn');

  window.api.onUpdateAvailable((version) => {
    msg.textContent = `Update v${version} is downloading in the background…`;
    installBtn.classList.add('hidden');
    banner.classList.remove('hidden');
  });

  window.api.onUpdateDownloaded(() => {
    msg.textContent = 'Update downloaded and ready to install.';
    installBtn.classList.remove('hidden');
    banner.classList.remove('hidden');
  });

  installBtn.addEventListener('click', () => window.api.installUpdate());
  dismissBtn.addEventListener('click', () => banner.classList.add('hidden'));
})();

// ===== License =====
async function initLicense() {
  const storedKey   = localStorage.getItem('licenseKey');
  const storedEmail = localStorage.getItem('licenseEmail');
  if (!storedKey || !storedEmail) return;

  // Trust the saved activation immediately so Pro stays unlocked across
  // restarts even if the network is slow/offline — don't make the user
  // wait on (or lose Pro to) a server round-trip just to reopen the app.
  window.isPro = true;

  try {
    const result = await window.api.validateLicense(storedKey, storedEmail);
    // Only revoke on an explicit server rejection, not on a network/timeout error.
    if (result && result.valid === false && !result.error) {
      window.isPro = false;
      localStorage.removeItem('licenseKey');
      localStorage.removeItem('licenseEmail');
    }
  } catch {
    // Network error — keep trusting the cached activation.
  }
}

function setLicenseStatus(msg, type) {
  const el = document.getElementById('license-status');
  if (!el) return;
  el.textContent = msg;
  el.className = type || '';
}

document.getElementById('license-activate-btn').addEventListener('click', async () => {
  const email = document.getElementById('license-email-input').value.trim();
  const key   = document.getElementById('license-key-input').value.trim();

  if (!email) { setLicenseStatus('Please enter your email address.', 'error'); return; }
  if (!key)   { setLicenseStatus('Please enter your license key.', 'error'); return; }

  const btn = document.getElementById('license-activate-btn');
  btn.disabled = true;
  btn.textContent = 'Activating...';
  setLicenseStatus('', '');

  try {
    const result = await window.api.activateLicense(key, email);
    if (result && result.activated) {
      localStorage.setItem('licenseKey', key);
      localStorage.setItem('licenseEmail', email);
      window.isPro = true;
      setLicenseStatus('Activated! Welcome to Shok Pro.', 'success');
      setTimeout(() => {
        document.getElementById('license-overlay').classList.remove('visible');
      }, 1000);
    } else {
      setLicenseStatus(result?.error || 'Invalid email or license key. Please check and try again.', 'error');
    }
  } catch (e) {
    setLicenseStatus('Could not connect to the license server. Check your internet connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Activate';
  }
});

function showProGate(featureName) {
  // Reuse the modal overlay for a quick pro message
  const overlay = document.getElementById('modal-overlay');
  // Create a temporary message div if not already showing a modal
  const existing = document.getElementById('pro-gate-msg');
  if (existing) existing.remove();
  const msg = document.createElement('div');
  msg.id = 'pro-gate-msg';
  msg.className = 'modal pro-locked-msg';
  msg.style.cssText = 'display:flex;flex-direction:column;gap:16px;align-items:center;';
  msg.innerHTML = `
    <div style="font-size:1.5rem">🔒</div>
    <h3 style="margin:0">${featureName} is a Pro Feature</h3>
    <p style="margin:0;color:var(--text-dim)">Get a license key to unlock this and all other Pro features.</p>
    <div style="display:flex;gap:12px">
      <button class="btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden');document.getElementById('pro-gate-msg').remove()">Close</button>
      <button class="btn-primary" onclick="document.getElementById('license-overlay').classList.add('visible');document.getElementById('modal-overlay').classList.add('hidden');document.getElementById('pro-gate-msg').remove()">Enter License Key</button>
    </div>
  `;
  overlay.classList.remove('hidden');
  overlay.appendChild(msg);
}

// ===== Init =====
async function init() {
  // License check
  window.isPro = false;
  initLicense();

  await loadPersistedState();
  await loadSavedThemes();
  setupThemeModal();
  setupEventListeners();
  renderSidebar();
  renderView();
  applyDerivedVars();
}

async function loadPersistedState() {
  state.favorites      = new Set(await window.api.storeGet('favorites') || []);
  state.recentlyPlayed = await window.api.storeGet('recentlyPlayed') || [];
  state.playCounts     = await window.api.storeGet('playCounts') || {};
  state.firstPlayed    = await window.api.storeGet('firstPlayed') || {};
  state.lastPlayedTime = await window.api.storeGet('lastPlayedTime') || {};
  state.sortOrder      = await window.api.storeGet('sortOrder') || 'name-az';
  state.customArt      = await window.api.storeGet('customArt') || {};
  state.gridSize       = await window.api.storeGet('gridSize') || 160;
  state.hiddenItems    = new Set(await window.api.storeGet('hiddenItems') || []);
  state.notes          = await window.api.storeGet('notes') || {};
  state.steamCreds     = await window.api.storeGet('steamCreds') || { apiKey: '', steamId: '' };
  state.steamGames     = await window.api.storeGet('steamGames') || [];
  state.steamPlaytime  = await window.api.storeGet('steamPlaytime') || {};
  state.steamAppIds    = await window.api.storeGet('steamAppIds') || {};
  state.sessionTime    = await window.api.storeGet('sessionTime') || {};

  const cats = await window.api.storeGet('categories') || {};
  state.categories = {};
  for (const [id, cat] of Object.entries(cats)) {
    state.categories[id] = { name: cat.name, items: new Set(cat.items || []) };
  }

  const savedTheme = await window.api.storeGet('theme');
  if (savedTheme) applyThemeVars(savedTheme);

  applyGridSize(state.gridSize);
  els.gridSizeSlider.value = state.gridSize;
  els.sortSelect.value     = state.sortOrder;

  state.folderPath = await window.api.storeGet('folderPath') || null;
  if (state.folderPath) {
    updateFolderDisplay();
    await scanFolder(false);
  }

  // Load icons for persisted Steam games and kick off auto-sync
  if (state.steamGames.length > 0) {
    loadSteamIcons(state.steamGames.filter(g => !state.iconCache[g.id] && g.imgIconUrl));
  }
  if (state.steamCreds.apiKey && state.steamCreds.steamId) {
    syncSteam(); // background, no await
  }

  // Register exe map with watcher and start listening
  registerGameExes();
  window.api.onProcessSnapshot(handleProcessSnapshot);
}

async function saveState() {
  await window.api.storeSet('folderPath', state.folderPath);
  await window.api.storeSet('favorites', [...state.favorites]);
  await window.api.storeSet('recentlyPlayed', state.recentlyPlayed);
  await window.api.storeSet('playCounts', state.playCounts);
  await window.api.storeSet('firstPlayed', state.firstPlayed);
  await window.api.storeSet('lastPlayedTime', state.lastPlayedTime);
  await window.api.storeSet('sortOrder', state.sortOrder);
  await window.api.storeSet('hiddenItems', [...state.hiddenItems]);
  await window.api.storeSet('steamCreds', state.steamCreds);
  await window.api.storeSet('steamGames', state.steamGames);
  await window.api.storeSet('steamPlaytime', state.steamPlaytime);
  await window.api.storeSet('steamAppIds', state.steamAppIds);
  await window.api.storeSet('sessionTime', state.sessionTime);
  const catsPlain = {};
  for (const [id, cat] of Object.entries(state.categories)) {
    catsPlain[id] = { name: cat.name, items: [...cat.items] };
  }
  await window.api.storeSet('categories', catsPlain);
}

// ===== Event Listeners =====
function setupEventListeners() {
  $('btn-minimize').addEventListener('click', () => window.api.minimize());
  $('btn-maximize').addEventListener('click', () => window.api.maximize());
  $('btn-close').addEventListener('click', () => window.api.close());

  window.api.onBeforeQuit(async () => {
    await flushActiveSessions();
    window.api.notifyQuitReady();
  });

  els.btnOpenFolder.addEventListener('click', () => { if (state.folderPath) window.api.openFolder(state.folderPath); });
  els.btnChangeFolder.addEventListener('click', changeFolder);
  els.btnRescan.addEventListener('click', () => { if (state.folderPath) scanFolder(true); });
  $('btn-find-programs').addEventListener('click', () => {
    if (!window.isPro) { showProGate('Find Programs'); return; }
    openProgramScanner();
  });
  $('btn-web-shortcut').addEventListener('click', openWebShortcutModal);
  $('btn-cancel-web-shortcut').addEventListener('click', closeModals);
  $('btn-confirm-web-shortcut').addEventListener('click', confirmWebShortcut);
  els.webShortcutUrl.addEventListener('keydown', e => { if (e.key === 'Enter') confirmWebShortcut(); });
  els.btnCancelProgramScanner.addEventListener('click', closeModals);
  els.btnAddSelectedPrograms.addEventListener('click', addSelectedPrograms);
  els.btnSelectAllPrograms.addEventListener('click', toggleSelectAllPrograms);
  els.programSearch.addEventListener('input', () => { programSearchQuery = els.programSearch.value; renderProgramList(); });

  els.btnAddItemsToCat.addEventListener('click', () => {
    const catId = state.currentView.startsWith('cat-') ? state.currentView.slice(4) : null;
    if (catId) openAddItemsModal(catId);
  });

  els.btnShowHidden.addEventListener('click', () => {
    state.showHidden = !state.showHidden;
    els.btnShowHidden.classList.toggle('active', state.showHidden);
    updateShowHiddenBtn();
    renderView();
  });

  els.sortSelect.addEventListener('change', e => {
    state.sortOrder = e.target.value;
    window.api.storeSet('sortOrder', state.sortOrder);
    renderView();
  });

  let gridSaveTimer;
  els.gridSizeSlider.addEventListener('input', e => {
    const size = parseInt(e.target.value);
    state.gridSize = size;
    applyGridSize(size);
    clearTimeout(gridSaveTimer);
    gridSaveTimer = setTimeout(() => window.api.storeSet('gridSize', size), 300);
  });

  els.navItems.forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));

  els.searchInput.addEventListener('input', e => { state.searchQuery = e.target.value.toLowerCase(); renderView(); });
  els.searchClear.addEventListener('click', () => { els.searchInput.value = ''; state.searchQuery = ''; renderView(); });

  $('btn-add-category').addEventListener('click', openAddCategoryModal);
  els.btnCancelCategory.addEventListener('click', closeModals);
  els.btnConfirmCategory.addEventListener('click', confirmAddCategory);
  els.categoryNameInput.addEventListener('keydown', e => { if (e.key==='Enter') confirmAddCategory(); });
  els.btnCloseAddToCat.addEventListener('click', closeModals);

  $('btn-theme').addEventListener('click', () => { openThemeModal(); });
  els.btnCloseTheme.addEventListener('click', closeModals);
  els.btnResetTheme.addEventListener('click', resetTheme);

  $('btn-stats').addEventListener('click', () => {
    if (!window.isPro) { showProGate('System Stats'); return; }
    openStatsModal();
  });
  els.btnCloseStats.addEventListener('click', closeStatsModal);

  $('btn-settings').addEventListener('click', () => {
    if (!window.isPro) { showProGate('Steam Integration'); return; }
    openSettingsModal();
  });
  els.btnCloseSettings.addEventListener('click', closeSettingsModal);
  els.btnSteamSync.addEventListener('click', syncSteam);
  $('btn-steam-help').addEventListener('click', () => {
    $('steam-help-text').classList.toggle('hidden');
  });

  els.btnCancelRenameCat.addEventListener('click', closeModals);
  els.btnConfirmRenameCat.addEventListener('click', confirmRenameCategory);
  els.renameCatInput.addEventListener('keydown', e => { if (e.key==='Enter') confirmRenameCategory(); });

  els.ctxRename.addEventListener('click', () => { closeContextMenu(); if (state.contextCatId) openRenameCategoryModal(state.contextCatId); });
  els.ctxAddItems.addEventListener('click', () => { closeContextMenu(); if (state.contextCatId) openAddItemsModal(state.contextCatId); });
  els.ctxDelete.addEventListener('click', () => { closeContextMenu(); if (state.contextCatId) deleteCategory(state.contextCatId); });

  document.addEventListener('click', () => closeContextMenu());
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') {
      if (!els.modalSettings.classList.contains('hidden')) closeSettingsModal();
      else if (!els.modalStats.classList.contains('hidden')) closeStatsModal();
      else closeModals();
      closeDetailPanel();
    }
  });
  els.modalOverlay.addEventListener('click', e => {
    if (e.target===els.modalOverlay) {
      if (!els.modalSettings.classList.contains('hidden')) closeSettingsModal();
      else if (!els.modalStats.classList.contains('hidden')) closeStatsModal();
      else closeModals();
    }
  });

  els.detailClose.addEventListener('click', closeDetailPanel);
  els.btnSetArt.addEventListener('click', () => {
    if (!window.isPro) { showProGate('Cover Art'); return; }
    pickCoverArt();
  });
  els.btnRemoveArt.addEventListener('click', removeCoverArt);
  els.detailBtnLaunch.addEventListener('click', () => {
    const sc = findItem(state.selectedId);
    if (sc) launchShortcut(sc);
  });
  els.detailBtnHide.addEventListener('click', () => toggleHidden(state.selectedId));

  let notesSaveTimer;
  els.detailNotes.addEventListener('input', e => {
    if (!state.selectedId) return;
    state.notes[state.selectedId] = e.target.value;
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(() => window.api.storeSet('notes', state.notes), 500);
  });
}

function applyGridSize(px) {
  document.documentElement.style.setProperty('--grid-card-size', `${px}px`);
}

// ===== Folder Management =====
function updateFolderDisplay() {
  if (state.folderPath) {
    const name = state.folderPath.split(/[\\/]/).pop() || state.folderPath;
    els.folderName.textContent = name;
    els.folderName.title = state.folderPath;
    els.btnOpenFolder.disabled = false;
  } else {
    els.folderName.textContent = 'No folder selected';
    els.folderName.title = '';
    els.btnOpenFolder.disabled = true;
  }
}

async function changeFolder() {
  const folder = await window.api.pickFolder();
  if (!folder) return;
  state.folderPath = folder;
  state.shortcuts  = [];
  state.iconCache  = {};
  updateFolderDisplay();
  await saveState();
  await scanFolder(false);
}

async function scanFolder(showToast = false) {
  if (!state.folderPath) return;
  setBtnLoading(els.btnRescan, true);
  const raw = await window.api.scanFolder(state.folderPath);
  state.shortcuts = raw;
  setBtnLoading(els.btnRescan, false);
  loadIcons(raw);
  registerGameExes();
  renderView();
  updateShowHiddenBtn();
  await saveState();
  if (showToast) toast(`Found ${raw.length} shortcut${raw.length!==1?'s':''}`);
}

// ===== Sidebar =====
function renderSidebar() {
  els.categoriesList.innerHTML = '';
  for (const [id, cat] of Object.entries(state.categories)) {
    const btn = document.createElement('button');
    btn.className = 'nav-item category-item';
    btn.dataset.view = `cat-${id}`;
    if (state.currentView === `cat-${id}`) btn.classList.add('active');
    btn.innerHTML = `
      <span class="nav-icon">&#128193;</span>
      <span>${escHtml(cat.name)}</span>
      <span class="cat-actions">
        <button class="cat-action-btn" data-action="menu" data-id="${id}" title="Options">&#8942;</button>
      </span>`;
    btn.addEventListener('click', e => { if (e.target.dataset.action === 'menu') return; setView(`cat-${id}`); });
    btn.querySelector('[data-action="menu"]').addEventListener('click', e => { e.stopPropagation(); openContextMenu(e, id); });
    btn.addEventListener('contextmenu', e => { e.preventDefault(); openContextMenu(e, id); });
    els.categoriesList.appendChild(btn);
  }
  document.querySelectorAll('.nav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === state.currentView);
  });
}

// ===== View Routing =====
function setView(view) {
  state.currentView = view;
  closeDetailPanel();
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view===view));
  renderView();
}

function renderView() {
  const view = state.currentView;
  const q    = state.searchQuery;

  let title = 'All';
  if (view==='recent')         title = 'Recently Played';
  else if (view==='favorites') title = 'Favorites';
  else if (view==='most-played') title = 'Most Played';
  else if (view.startsWith('cat-')) {
    const cat = state.categories[view.slice(4)];
    title = cat ? cat.name : 'Category';
  }
  els.viewTitle.textContent = title;
  els.btnAddItemsToCat.classList.toggle('hidden', !view.startsWith('cat-'));

  const topPlayed = getMostPlayedItems(5);
  if (view==='all' && topPlayed.length > 0) {
    els.mostPlayedStrip.classList.remove('hidden');
    renderMostPlayedStrip(topPlayed);
  } else {
    els.mostPlayedStrip.classList.add('hidden');
  }

  if (view==='all' && state.recentlyPlayed.length > 0) {
    els.recentStrip.classList.remove('hidden');
    renderRecentStrip();
  } else {
    els.recentStrip.classList.add('hidden');
  }

  const all = getAllItems();
  let items = [];
  if (view==='all') {
    items = [...all];
  } else if (view==='recent') {
    items = state.recentlyPlayed.map(r => all.find(s => s.id===r.id)).filter(Boolean);
  } else if (view==='favorites') {
    items = all.filter(s => state.favorites.has(s.id));
  } else if (view==='most-played') {
    items = [...all]
      .filter(s => (state.playCounts[s.id]||0) > 0 || (state.steamPlaytime[s.id]||0) > 0)
      .sort((a,b) => {
        const pa = (state.playCounts[a.id]||0) + Math.round((state.steamPlaytime[a.id]||0)/60);
        const pb = (state.playCounts[b.id]||0) + Math.round((state.steamPlaytime[b.id]||0)/60);
        return pb - pa;
      })
      .slice(0, 5);
  } else if (view.startsWith('cat-')) {
    const cat = state.categories[view.slice(4)];
    if (cat) items = all.filter(s => cat.items.has(s.id));
  }

  if (!state.showHidden) items = items.filter(s => !state.hiddenItems.has(s.id));
  if (q) items = items.filter(s => s.name.toLowerCase().includes(q));
  items = sortItems(items);

  if (!state.folderPath && state.steamGames.length === 0) {
    els.emptyState.innerHTML = `<div id="empty-icon">&#128194;</div><p>No folder selected.<br/>Click <strong>Change</strong> in the sidebar to get started.</p>`;
    els.emptyState.classList.remove('hidden');
    els.shortcutsGrid.innerHTML = '';
    els.shortcutsGrid.classList.add('hidden');
    return;
  }

  if (items.length === 0) {
    els.shortcutsGrid.innerHTML = '';
    els.shortcutsGrid.classList.add('hidden');
    els.emptyState.innerHTML = `<div id="empty-icon">&#128270;</div><p>${q ? 'No results for <strong>"'+escHtml(q)+'"</strong>' : 'Nothing here yet.'}</p>`;
    els.emptyState.classList.remove('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');
  els.shortcutsGrid.classList.remove('hidden');
  const fragment = document.createDocumentFragment();
  for (const sc of items) fragment.appendChild(buildCard(sc));
  els.shortcutsGrid.innerHTML = '';
  els.shortcutsGrid.appendChild(fragment);

  if (state.selectedId) {
    const card = document.querySelector(`[data-id="${state.selectedId}"]`);
    if (card) card.classList.add('selected');
    else closeDetailPanel();
  }
}

function sortItems(items) {
  const arr = [...items];
  switch (state.sortOrder) {
    case 'name-az':     return arr.sort((a,b) => a.name.localeCompare(b.name));
    case 'name-za':     return arr.sort((a,b) => b.name.localeCompare(a.name));
    case 'most-played': return arr.sort((a,b) => (state.playCounts[b.id]||0)-(state.playCounts[a.id]||0));
    case 'last-played': return arr.sort((a,b) => (state.lastPlayedTime[b.id]||0)-(state.lastPlayedTime[a.id]||0));
    default: return arr;
  }
}

function getMostPlayedItems(limit) {
  return [...getAllItems()]
    .filter(s => {
      if (!state.showHidden && state.hiddenItems.has(s.id)) return false;
      return (state.playCounts[s.id]||0) > 0 || (state.steamPlaytime[s.id]||0) > 0;
    })
    .sort((a,b) => {
      const pa = (state.playCounts[a.id]||0) + Math.round((state.steamPlaytime[a.id]||0)/60);
      const pb = (state.playCounts[b.id]||0) + Math.round((state.steamPlaytime[b.id]||0)/60);
      return pb - pa;
    })
    .slice(0, limit);
}

function renderMostPlayedStrip(items) {
  els.mostPlayedCards.innerHTML = '';
  for (const sc of items) {
    const plays = state.playCounts[sc.id] || 0;
    const steamMins = state.steamPlaytime[sc.id];
    const subtitle = steamMins !== undefined
      ? formatSteamTime(steamMins)
      : `${plays} play${plays!==1?'s':''}`;
    const card = document.createElement('div');
    card.className = 'recent-card';
    card.title = `${sc.name}\n${subtitle}`;
    const imgSrc = state.customArt[sc.id] || state.iconCache[sc.id];
    card.innerHTML = `
      ${imgSrc
        ? `<img src="${imgSrc}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:4px;">`
        : `<div class="rc-icon">${sc.isUrl?'&#127760;':'&#127918;'}</div>`}
      <div class="recent-info">
        <div class="recent-name">${escHtml(sc.name)}</div>
        <div class="recent-time">${subtitle}</div>
      </div>`;
    card.addEventListener('click', () => launchShortcut(sc));
    els.mostPlayedCards.appendChild(card);
  }
}

function renderRecentStrip() {
  els.recentCards.innerHTML = '';
  const all = getAllItems();
  for (const r of state.recentlyPlayed.slice(0,5)) {
    const sc = all.find(s => s.id===r.id);
    if (sc && state.hiddenItems.has(sc.id) && !state.showHidden) continue;
    const card = document.createElement('div');
    card.className = 'recent-card';
    card.title = `${r.name}\nLast played: ${formatDate(r.timestamp)}`;
    const imgSrc = state.customArt[r.id] || state.iconCache[r.id];
    card.innerHTML = `
      ${imgSrc
        ? `<img src="${imgSrc}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:4px;">`
        : `<div class="rc-icon">${sc&&sc.isUrl?'&#127760;':'&#127918;'}</div>`}
      <div class="recent-info">
        <div class="recent-name">${escHtml(r.name)}</div>
        <div class="recent-time">${formatDate(r.timestamp)}</div>
      </div>`;
    card.addEventListener('click', () => sc && launchShortcut(sc));
    els.recentCards.appendChild(card);
  }
}

// ===== Card Builder =====
function buildCard(sc) {
  const isFav     = state.favorites.has(sc.id);
  const icon      = state.iconCache[sc.id];
  const art       = state.customArt[sc.id];
  const isHidden  = state.hiddenItems.has(sc.id);
  const badges    = getCatBadges(sc.id);
  const isSelected = state.selectedId === sc.id;
  const isSteam   = sc.isSteamGame || state.steamAppIds[sc.id] !== undefined;
  const fallbackIcon = sc.isSteamGame ? '&#127918;' : (sc.isUrl ? '&#127760;' : '&#127918;');

  const card = document.createElement('div');
  card.className = `shortcut-card${art?' has-cover':''}${isHidden?' is-hidden':''}${isSelected?' selected':''}`;
  card.dataset.id = sc.id;
  card.title = sc.name;

  const steamBadge = isSteam ? '<span class="cat-badge steam-cat-badge">STEAM</span>' : '';
  const starClass  = isFav ? ' active' : '';
  const starTitle  = isFav ? 'Remove from favorites' : 'Add to favorites';
  const actBtns = `
    <div class="card-actions">
      <button class="btn-play" title="Launch">&#9654;</button>
      <button class="btn-star${starClass}" title="${starTitle}">&#11088;</button>
      <button class="btn-add-cat" title="Add to category">&#10133;</button>
    </div>
    <div class="card-categories">${steamBadge}${badges}</div>`;

  if (art) {
    card.innerHTML = `
      <img class="card-cover-img" src="${art}" alt="" />
      <div class="card-name">${escHtml(sc.name)}</div>
      ${actBtns}`;
  } else {
    card.innerHTML = `
      <div class="card-icon-wrap">
        <img class="card-icon-img${icon?'':' hidden'}" src="${icon||''}" alt="" />
        <div class="card-icon-fallback${icon?' hidden':''}">${fallbackIcon}</div>
      </div>
      <div class="card-name">${escHtml(sc.name)}</div>
      ${actBtns}`;
  }

  card.querySelector('.btn-play').addEventListener('click', e => { e.stopPropagation(); launchShortcut(sc); });
  card.querySelector('.btn-star').addEventListener('click', e => { e.stopPropagation(); toggleFavorite(sc.id, card); });
  card.querySelector('.btn-add-cat').addEventListener('click', e => { e.stopPropagation(); openAddToCategoryModal(sc.id); });
  card.addEventListener('click', e => { if (e.target.closest('.card-actions')) return; openDetailPanel(sc); });

  return card;
}

function getCatBadges(scId) {
  return Object.entries(state.categories)
    .filter(([,cat]) => cat.items.has(scId))
    .map(([,cat]) => `<span class="cat-badge">${escHtml(cat.name)}</span>`)
    .join('');
}

function refreshCard(scId) {
  const sc = findItem(scId);
  if (!sc) return;
  const existing = document.querySelector(`[data-id="${scId}"]`);
  if (!existing) return;
  existing.replaceWith(buildCard(sc));
}

// ===== Launch =====
async function launchShortcut(sc) {
  const card = document.querySelector(`[data-id="${sc.id}"]`);
  if (card) {
    const overlay = document.createElement('div');
    overlay.className = 'card-loading';
    overlay.textContent = '⏳';
    card.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1500);
  }
  const launchTarget = (sc.isUrl && sc.url?.startsWith('shell:')) ? sc.url : sc.path;
  await window.api.launchShortcut(launchTarget);

  const now = Date.now();
  state.playCounts[sc.id] = (state.playCounts[sc.id]||0)+1;
  if (!state.firstPlayed[sc.id]) state.firstPlayed[sc.id] = now;
  state.lastPlayedTime[sc.id] = now;

  state.recentlyPlayed = state.recentlyPlayed.filter(r => r.id!==sc.id);
  state.recentlyPlayed.unshift({ id:sc.id, name:sc.name, path:sc.path, timestamp:now });
  state.recentlyPlayed = state.recentlyPlayed.slice(0,5);

  await saveState();
  renderRecentStrip();
  if (state.currentView==='recent') renderView();
  if (state.selectedId===sc.id) populateDetailPanel(sc);
}

// ===== Favorites =====
function toggleFavorite(scId, card) {
  if (state.favorites.has(scId)) {
    state.favorites.delete(scId);
    if (card) { card.querySelector('.btn-star').classList.remove('active'); card.querySelector('.btn-star').title='Add to favorites'; }
    toast('Removed from favorites');
  } else {
    state.favorites.add(scId);
    if (card) { card.querySelector('.btn-star').classList.add('active'); card.querySelector('.btn-star').title='Remove from favorites'; }
    toast('Added to favorites ⭐');
  }
  saveState();
  if (state.currentView==='favorites') renderView();
}

// ===== Hidden Items =====
function toggleHidden(scId) {
  if (!scId) return;
  if (state.hiddenItems.has(scId)) {
    state.hiddenItems.delete(scId);
    toast('Shortcut unhidden');
  } else {
    state.hiddenItems.add(scId);
    toast('Shortcut hidden');
    if (!state.showHidden) closeDetailPanel();
  }
  saveState();
  updateShowHiddenBtn();
  renderView();
  if (state.selectedId===scId) updateHideBtn(scId);
}

function updateShowHiddenBtn() {
  const n = state.hiddenItems.size;
  if (n===0) {
    els.btnShowHidden.classList.add('hidden');
    state.showHidden = false;
    els.btnShowHidden.classList.remove('active');
  } else {
    els.btnShowHidden.classList.remove('hidden');
    els.btnShowHidden.textContent = state.showHidden ? `&#128065; Hide Hidden (${n})` : `&#128065; Show Hidden (${n})`;
  }
}

function updateHideBtn(scId) {
  const isHidden = state.hiddenItems.has(scId);
  els.detailBtnHide.innerHTML = isHidden ? '&#128065; Unhide' : '&#128065; Hide';
  els.detailBtnHide.classList.toggle('unhide-mode', isHidden);
}

// ===== Cover Art =====
async function pickCoverArt() {
  const raw = await window.api.pickImage();
  if (!raw) return;
  const resized = raw.startsWith('data:image/gif') ? raw : await resizeImage(raw, 640);
  state.customArt[state.selectedId] = resized;
  await window.api.storeSet('customArt', state.customArt);
  refreshCard(state.selectedId);
  const card = document.querySelector(`[data-id="${state.selectedId}"]`);
  if (card) card.classList.add('selected');
  updateDetailCover(state.selectedId);
  toast('Cover art set');
}

async function removeCoverArt() {
  delete state.customArt[state.selectedId];
  await window.api.storeSet('customArt', state.customArt);
  refreshCard(state.selectedId);
  const card = document.querySelector(`[data-id="${state.selectedId}"]`);
  if (card) card.classList.add('selected');
  updateDetailCover(state.selectedId);
  toast('Cover art removed');
}

function updateDetailCover(scId) {
  const art  = state.customArt[scId];
  const icon = state.iconCache[scId];
  const sc   = findItem(scId);
  if (art) {
    els.detailCoverImg.src = art;
    els.detailCoverImg.classList.remove('hidden');
    els.detailCoverFallback.classList.add('hidden');
    els.btnRemoveArt.classList.remove('hidden');
  } else if (icon) {
    els.detailCoverImg.src = icon;
    els.detailCoverImg.classList.remove('hidden');
    els.detailCoverFallback.classList.add('hidden');
    els.btnRemoveArt.classList.add('hidden');
  } else {
    els.detailCoverImg.classList.add('hidden');
    els.detailCoverFallback.textContent = sc?.isSteamGame ? '🎮' : (sc?.isUrl ? '🌐' : '🎮');
    els.detailCoverFallback.classList.remove('hidden');
    els.btnRemoveArt.classList.add('hidden');
  }
}

async function resizeImage(dataUrl, maxWidth) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth/img.width);
      const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
      const canvas = document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ===== Detail Panel =====
function openDetailPanel(sc) {
  document.querySelector('.shortcut-card.selected')?.classList.remove('selected');
  document.querySelector(`[data-id="${sc.id}"]`)?.classList.add('selected');
  state.selectedId = sc.id;
  populateDetailPanel(sc);
  els.detailPanel.classList.add('open');
}

function closeDetailPanel() {
  document.querySelector('.shortcut-card.selected')?.classList.remove('selected');
  state.selectedId = null;
  els.detailPanel.classList.remove('open');
}

function populateDetailPanel(sc) {
  els.detailName.textContent        = sc.name;
  els.detailTarget.textContent      = sc.targetPath || sc.path;
  els.detailPlays.textContent       = state.playCounts[sc.id]
    ? `${state.playCounts[sc.id]} launch${state.playCounts[sc.id]!==1?'es':''}` : 'Never';
  els.detailFirstPlayed.textContent = state.firstPlayed[sc.id]    ? formatDate(state.firstPlayed[sc.id])    : '—';
  els.detailLastPlayed.textContent  = state.lastPlayedTime[sc.id] ? formatDate(state.lastPlayedTime[sc.id]) : '—';

  // Steam playtime row
  const steamMins = state.steamPlaytime[sc.id];
  if (steamMins !== undefined) {
    els.detailSteamTime.textContent = formatSteamTime(steamMins);
    els.detailRowSteam.classList.remove('hidden');
  } else {
    els.detailRowSteam.classList.add('hidden');
  }

  // Tracked session time row
  const sessSeconds = state.sessionTime[sc.id] || 0;
  const isActive    = !!state.activeSessions[sc.id];
  if (sessSeconds > 0 || isActive) {
    let sessText = formatSessionTime(sessSeconds);
    if (isActive) {
      const runningFor = Math.round((Date.now() - state.activeSessions[sc.id]) / 1000);
      sessText += ` (+ ${formatSessionTime(runningFor)} now)`;
    }
    els.detailSessionTime.textContent = sessText;
    els.detailRowSession.classList.remove('hidden');
  } else {
    els.detailRowSession.classList.add('hidden');
  }

  const catNames = Object.entries(state.categories)
    .filter(([,cat]) => cat.items.has(sc.id))
    .map(([,cat]) => `<span class="cat-badge">${escHtml(cat.name)}</span>`).join('');
  els.detailCats.innerHTML  = catNames || '<span style="color:var(--text-muted);font-size:11px">None</span>';
  els.detailNotes.value     = state.notes[sc.id] || '';
  updateDetailCover(sc.id);
  updateHideBtn(sc.id);
}

// ===== Icon Loading =====
async function loadIcons(shortcuts) {
  const uncached    = shortcuts.filter(sc => !state.iconCache[sc.id]);
  if (uncached.length === 0) return;

  const localMap    = {};
  const needFavicon = [];

  for (const sc of uncached) {
    if (sc.isUrl && !sc.iconPath) {
      if (sc.url && !sc.url.startsWith('shell:')) needFavicon.push(sc);
    } else {
      const p = sc.iconPath || sc.targetPath || sc.path;
      if (!localMap[p]) localMap[p] = [];
      localMap[p].push(sc.id);
    }
  }

  const localPaths = Object.keys(localMap);
  if (localPaths.length > 0) {
    const iconMap = await window.api.getIconsBatch(localPaths);
    for (const [p, dataUrl] of Object.entries(iconMap)) {
      for (const scId of (localMap[p]||[])) {
        state.iconCache[scId] = dataUrl;
        updateCardIcon(scId, dataUrl);
        if (state.recentlyPlayed.some(r=>r.id===scId)) renderRecentStrip();
        if (state.selectedId===scId) updateDetailCover(scId);
      }
    }
  }

  const CONCURRENCY = 5;
  for (let i = 0; i < needFavicon.length; i += CONCURRENCY) {
    await Promise.all(needFavicon.slice(i, i+CONCURRENCY).map(async sc => {
      const dataUrl = await fetchFavicon(sc.url);
      if (dataUrl) {
        state.iconCache[sc.id] = dataUrl;
        updateCardIcon(sc.id, dataUrl);
        if (state.recentlyPlayed.some(r=>r.id===sc.id)) renderRecentStrip();
        if (state.selectedId===sc.id) updateDetailCover(sc.id);
      }
    }));
  }
}

async function fetchFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    const resp = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function updateCardIcon(scId, iconData) {
  const wrap = document.querySelector(`[data-id="${scId}"] .card-icon-wrap`);
  if (!wrap) return;
  const img      = wrap.querySelector('.card-icon-img');
  const fallback = wrap.querySelector('.card-icon-fallback');
  if (img)      { img.src = iconData; img.classList.remove('hidden'); }
  if (fallback) fallback.classList.add('hidden');
}

// ===== Steam Integration =====

async function syncSteam() {
  const { apiKey, steamId } = state.steamCreds;
  if (!apiKey || !steamId) {
    setSteamStatus('Enter your API key and Steam ID first.', true);
    return;
  }

  setSteamStatus('Syncing…', false);
  els.btnSteamSync.disabled = true;

  let response, installedIds;
  try {
    [response, installedIds] = await Promise.all([
      window.api.steamSync({ apiKey, steamId }),
      window.api.getSteamInstalled()
    ]);
  } catch (e) {
    setSteamStatus(`Error: ${e.message}`, true);
    els.btnSteamSync.disabled = false;
    return;
  }

  const games = response.games || [];
  if (games.length === 0) {
    setSteamStatus('No games returned. Check your API key and Steam ID (must be public).', true);
    els.btnSteamSync.disabled = false;
    return;
  }

  const installedSet = new Set(installedIds);
  let matched = 0, added = 0, updated = 0;

  for (const game of games) {
    const { appid, name, playtime_forever = 0, rtime_last_played = 0, img_icon_url } = game;
    const lastMs = rtime_last_played ? rtime_last_played * 1000 : null;

    // Try to find an existing shortcut regardless of install status
    const existing = findMatchingShortcut(appid, name);

    if (existing) {
      // Tag and update playtime / last-played
      state.steamAppIds[existing.id]   = appid;
      state.steamPlaytime[existing.id] = playtime_forever;
      if (lastMs) {
        if (!state.lastPlayedTime[existing.id] || lastMs > state.lastPlayedTime[existing.id])
          state.lastPlayedTime[existing.id] = lastMs;
        if (!state.firstPlayed[existing.id])
          state.firstPlayed[existing.id] = lastMs;
      }
      matched++;
      // Remove any standalone Steam entry now covered by this shortcut
      const dupeIdx = state.steamGames.findIndex(g => g.steamAppId === appid);
      if (dupeIdx >= 0) state.steamGames.splice(dupeIdx, 1);
    } else if (installedSet.has(appid)) {
      // Only create a new entry for installed games
      const id = `steam-${appid}`;
      const entry = {
        id, name,
        path:       `steam://rungameid/${appid}`,
        targetPath: `steam://rungameid/${appid}`,
        iconPath:   null,
        isSteamGame: true,
        steamAppId:  appid,
        isUrl:       false,
        imgIconUrl:  img_icon_url || null,
      };
      const existingSteam = state.steamGames.findIndex(g => g.steamAppId === appid);
      if (existingSteam >= 0) {
        state.steamGames[existingSteam] = entry;
        updated++;
      } else {
        state.steamGames.push(entry);
        added++;
      }
      state.steamPlaytime[id] = playtime_forever;
      state.steamAppIds[id]   = appid;
      if (lastMs) {
        if (!state.lastPlayedTime[id] || lastMs > state.lastPlayedTime[id])
          state.lastPlayedTime[id] = lastMs;
        if (!state.firstPlayed[id]) state.firstPlayed[id] = lastMs;
      }
    }
    // else: uninstalled, not already in library → skip
  }

  // Load icons for new Steam entries
  const needIcons = state.steamGames.filter(g => !state.iconCache[g.id] && g.imgIconUrl);
  loadSteamIcons(needIcons);

  await saveState();
  registerGameExes();
  renderView();
  renderSidebar();

  const msg = `Synced ${games.length} games — ${matched} matched, ${added} added, ${updated} updated`;
  setSteamStatus(msg, false);
  toast(`Steam synced: ${matched} matched · ${added} added`);
  els.btnSteamSync.disabled = false;
}

function findMatchingShortcut(appid, steamName) {
  const scs = state.shortcuts;

  // Previously tagged
  const byTag = scs.find(sc => state.steamAppIds[sc.id] === appid);
  if (byTag) return byTag;

  // Steam URL in target or url field
  const byUrl = scs.find(sc =>
    sc.targetPath === `steam://rungameid/${appid}` ||
    sc.targetPath === `steam://run/${appid}` ||
    sc.url        === `steam://rungameid/${appid}`
  );
  if (byUrl) return byUrl;

  // steam.exe -applaunch {appid}
  const byApplaunch = scs.find(sc =>
    sc.targetPath && /steam\.exe/i.test(sc.targetPath) &&
    new RegExp(`[-/]applaunch\\s+${appid}\\b`).test(sc.targetPath)
  );
  if (byApplaunch) return byApplaunch;

  // Normalized name match
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const steamNorm = norm(steamName);
  if (steamNorm.length >= 3) {
    const byName = scs.find(sc => norm(sc.name) === steamNorm);
    if (byName) return byName;
  }

  return null;
}

async function loadSteamIcons(games) {
  const CONCURRENCY = 5;
  for (let i = 0; i < games.length; i += CONCURRENCY) {
    await Promise.all(games.slice(i, i+CONCURRENCY).map(async game => {
      if (!game.imgIconUrl) return;
      try {
        const url  = `https://media.steampowered.com/steamcommunity/public/images/apps/${game.steamAppId}/${game.imgIconUrl}.jpg`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const blob = await resp.blob();
        const dataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (dataUrl) {
          state.iconCache[game.id] = dataUrl;
          updateCardIcon(game.id, dataUrl);
          if (state.selectedId === game.id) updateDetailCover(game.id);
        }
      } catch {}
    }));
  }
}

function setSteamStatus(msg, isError) {
  if (!els.steamSyncStatus) return;
  els.steamSyncStatus.textContent = msg;
  els.steamSyncStatus.className   = `steam-status${isError ? ' steam-status-error' : ' steam-status-ok'}`;
}

// ===== Settings Modal =====
function openSettingsModal() {
  els.steamApiKey.value = state.steamCreds.apiKey || '';
  els.steamIdVal.value  = state.steamCreds.steamId || '';
  els.steamSyncStatus.textContent = '';
  els.steamSyncStatus.className   = 'steam-status';
  showModal(els.modalSettings);
}

function closeSettingsModal() {
  const apiKey  = els.steamApiKey.value.trim();
  const steamId = els.steamIdVal.value.trim();
  if (apiKey !== state.steamCreds.apiKey || steamId !== state.steamCreds.steamId) {
    state.steamCreds = { apiKey, steamId };
    window.api.storeSet('steamCreds', state.steamCreds);
  }
  closeModals();
}

async function flushActiveSessions() {
  const now = Date.now();
  for (const [scId, startTime] of Object.entries(state.activeSessions)) {
    const duration = Math.round((now - startTime) / 1000);
    if (duration > 0) {
      state.sessionTime[scId] = (state.sessionTime[scId] || 0) + duration;
    }
  }
  state.activeSessions = {};
  await window.api.storeSet('sessionTime', state.sessionTime);
}

// ===== Process Watcher =====
function registerGameExes() {
  const map = {};
  for (const sc of getAllItems()) {
    if (!sc.targetPath) continue;
    const parts   = sc.targetPath.split(/[\\/]/);
    const exeName = parts[parts.length - 1]?.toLowerCase();
    if (exeName && exeName.endsWith('.exe')) {
      if (!map[exeName]) map[exeName] = [];
      map[exeName].push(sc.id);
    }
  }
  window.api.registerGameExes(map);
}

function handleProcessSnapshot(runningExes) {
  const running = new Set(runningExes);
  const now     = Date.now();

  // Build current exe → scId map
  const exeToIds = {};
  for (const sc of getAllItems()) {
    if (!sc.targetPath) continue;
    const parts   = sc.targetPath.split(/[\\/]/);
    const exeName = parts[parts.length - 1]?.toLowerCase();
    if (exeName && exeName.endsWith('.exe')) {
      if (!exeToIds[exeName]) exeToIds[exeName] = [];
      exeToIds[exeName].push(sc.id);
    }
  }

  // Detect new game starts
  for (const [exe, ids] of Object.entries(exeToIds)) {
    if (running.has(exe)) {
      for (const scId of ids) {
        if (!state.activeSessions[scId]) {
          state.activeSessions[scId] = now;
        }
      }
    }
  }

  // Detect game stops — session ended
  for (const [scId, startTime] of Object.entries(state.activeSessions)) {
    const exe = Object.entries(exeToIds).find(([, ids]) => ids.includes(scId))?.[0];
    if (!exe || !running.has(exe)) {
      const duration = Math.round((now - startTime) / 1000);
      if (duration > 30) { // ignore sub-30s blips
        state.sessionTime[scId] = (state.sessionTime[scId] || 0) + duration;
        window.api.storeSet('sessionTime', state.sessionTime);
        const sc = findItem(scId);
        if (sc) toast(`Session ended — ${sc.name}: ${formatSessionTime(duration)}`);
        refreshCard(scId);
        if (state.selectedId === scId) populateDetailPanel(findItem(scId));
      }
      delete state.activeSessions[scId];
    }
  }
}

// ===== Categories =====
function openAddCategoryModal() {
  els.categoryNameInput.value = '';
  showModal(els.modalCategory);
  setTimeout(() => els.categoryNameInput.focus(), 50);
}
function confirmAddCategory() {
  const name = els.categoryNameInput.value.trim();
  if (!name) return;
  const id = Date.now().toString();
  state.categories[id] = { name, items: new Set() };
  saveState(); renderSidebar(); closeModals();
  toast(`Category "${name}" created`);
}
function openRenameCategoryModal(catId) {
  const cat = state.categories[catId];
  if (!cat) return;
  els.renameCatInput.value = cat.name;
  els.btnConfirmRenameCat.dataset.catId = catId;
  showModal(els.modalRenameCat);
  setTimeout(() => els.renameCatInput.focus(), 50);
}
function confirmRenameCategory() {
  const catId = els.btnConfirmRenameCat.dataset.catId;
  const name  = els.renameCatInput.value.trim();
  if (!name||!catId||!state.categories[catId]) return;
  state.categories[catId].name = name;
  saveState(); renderSidebar(); renderView(); closeModals();
  toast(`Renamed to "${name}"`);
}
function deleteCategory(catId) {
  if (!state.categories[catId]) return;
  delete state.categories[catId];
  if (state.currentView===`cat-${catId}`) setView('all');
  saveState(); renderSidebar(); renderView();
  toast('Category deleted');
}

function openAddItemsModal(catId) {
  const cat = state.categories[catId];
  if (!cat) return;
  state.addToCatTargetId = catId;
  els.addToCatName.textContent = `Category: ${cat.name}`;
  renderAddToCatList(catId);
  showModal(els.modalAddToCat);
}

function openAddToCategoryModal(scId) {
  if (Object.keys(state.categories).length===0) { toast('Create a category first'); return; }
  const sc = findItem(scId);
  if (!sc) return;
  els.addToCatName.textContent = `Add "${sc.name}" to categories`;
  renderAddToCatListForShortcut(scId);
  showModal(els.modalAddToCat);
}

function renderAddToCatList(catId) {
  const cat = state.categories[catId];
  els.addToCatList.innerHTML = '';
  for (const sc of getAllItems()) {
    const inCat  = cat.items.has(sc.id);
    const imgSrc = state.customArt[sc.id] || state.iconCache[sc.id];
    const item   = document.createElement('div');
    item.className = `add-cat-item${inCat?' checked':''}`;
    item.innerHTML = `
      ${imgSrc ? `<img src="${imgSrc}" alt="">` : `<div class="aci-icon">${sc.isUrl||sc.isSteamGame?'&#127918;':'&#127918;'}</div>`}
      <span>${escHtml(sc.name)}</span>
      <div class="add-cat-check"></div>`;
    item.addEventListener('click', () => {
      cat.items.has(sc.id) ? cat.items.delete(sc.id) : cat.items.add(sc.id);
      item.classList.toggle('checked', cat.items.has(sc.id));
      saveState(); refreshCatBadgesOnCard(sc.id);
    });
    els.addToCatList.appendChild(item);
  }
}

function renderAddToCatListForShortcut(scId) {
  els.addToCatList.innerHTML = '';
  for (const [catId, cat] of Object.entries(state.categories)) {
    const inCat = cat.items.has(scId);
    const item  = document.createElement('div');
    item.className = `add-cat-item${inCat?' checked':''}`;
    item.innerHTML = `<div class="aci-icon">&#128193;</div><span>${escHtml(cat.name)}</span><div class="add-cat-check"></div>`;
    item.addEventListener('click', () => {
      cat.items.has(scId) ? cat.items.delete(scId) : cat.items.add(scId);
      item.classList.toggle('checked', cat.items.has(scId));
      saveState(); refreshCatBadgesOnCard(scId);
      if (state.selectedId===scId) populateDetailPanel(findItem(scId));
    });
    els.addToCatList.appendChild(item);
  }
}

function refreshCatBadgesOnCard(scId) {
  const el = document.querySelector(`[data-id="${scId}"] .card-categories`);
  if (el) el.innerHTML = getCatBadges(scId);
}

// ===== Stats Modal =====
let statsPolling = false;
const RING_CIRC  = 238.76; // 2π × r38

function openStatsModal() {
  showModal(els.modalStats);
  statsPolling = true;
  pollStats();
}

function closeStatsModal() {
  statsPolling = false;
  closeModals();
}

async function pollStats() {
  if (!statsPolling || els.modalStats.classList.contains('hidden')) {
    statsPolling = false;
    return;
  }
  try {
    const s = await window.api.getSystemStats();
    renderStats(s);
  } catch {}
  if (statsPolling) setTimeout(pollStats, 1000);
}

function setRing(ringEl, pct) {
  if (!ringEl) return;
  const p = Math.max(0, Math.min(100, pct));
  ringEl.style.strokeDashoffset = RING_CIRC * (1 - p / 100);
  ringEl.style.stroke = p >= 90 ? 'var(--danger)' : p >= 70 ? '#e6a817' : 'var(--accent)';
}

function setTemp(tempEl, celsius) {
  if (!tempEl) return;
  if (celsius === null || celsius <= 0) { tempEl.textContent = ''; return; }
  tempEl.textContent = `${celsius}°C`;
  tempEl.style.color = celsius >= 85 ? 'var(--danger)' : celsius >= 70 ? '#e6a817' : 'var(--text-muted)';
}

function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '—';
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function renderStats(s) {
  // CPU
  const cpuPct = s.cpuPct || 0;
  els.statCpuPct.textContent    = `${cpuPct}%`;
  els.statCpuDetail.textContent = s.cpuCores ? `${s.cpuCores} core${s.cpuCores !== 1 ? 's' : ''}` : '—';
  els.statCpuName.textContent   = s.cpuName  || '—';
  setRing(els.statCpuRing, cpuPct);
  setTemp(els.statCpuTemp, s.cpuTemp ?? null);

  // RAM
  const ramPct = s.ramTotal > 0 ? Math.round(s.ramUsed / s.ramTotal * 100) : 0;
  els.statRamPct.textContent    = `${ramPct}%`;
  els.statRamDetail.textContent = `${fmtBytes(s.ramUsed)} / ${fmtBytes(s.ramTotal)}`;
  setRing(els.statRamRing, ramPct);

  // GPU
  if (s.gpuUtil !== null && s.gpuUtil >= 0) {
    els.statGpuPct.textContent = `${s.gpuUtil}%`;
    setRing(els.statGpuRing, s.gpuUtil);
  } else {
    els.statGpuPct.textContent             = 'N/A';
    els.statGpuRing.style.stroke           = 'var(--text-muted)';
    els.statGpuRing.style.strokeDashoffset = RING_CIRC * 0.75;
  }
  setTemp(els.statGpuTemp, s.gpuTemp ?? null);
  if (s.gpuVramUsed !== null && s.gpuVram) {
    els.statGpuDetail.textContent = `${fmtBytes(s.gpuVramUsed)} / ${fmtBytes(s.gpuVram)} VRAM`;
  } else if (s.gpuVram) {
    els.statGpuDetail.textContent = `${fmtBytes(s.gpuVram)} VRAM`;
  } else {
    els.statGpuDetail.textContent = '';
  }
  els.statGpuName.textContent = s.gpuName || '—';
}

// ===== Theme Modal =====
let savedThemes = []; // { name, vars }[]

function setupThemeModal() {
  THEMES.forEach(theme => {
    const btn = document.createElement('button');
    btn.className = 'theme-preset-btn';
    btn.textContent = theme.name;
    btn.style.background  = theme.vars['--bg-card'];
    btn.style.color       = theme.vars['--text-primary'];
    btn.style.borderColor = theme.vars['--accent'];
    btn.addEventListener('click', () => {
      applyThemeVars(theme.vars);
      window.api.storeSet('theme', getCurrentThemeVars());
      clearActiveThemeBtn();
      btn.classList.add('active');
      syncColorPickers();
    });
    els.themePresets.appendChild(btn);
  });
  document.querySelectorAll('#custom-theme-pickers input[type="color"]').forEach(picker => {
    picker.addEventListener('input', () => {
      document.documentElement.style.setProperty(picker.dataset.var, picker.value);
      applyDerivedVars();
      window.api.storeSet('theme', getCurrentThemeVars());
    });
  });
  $('btn-save-theme').addEventListener('click', saveCurrentTheme);
  $('save-theme-name').addEventListener('keydown', e => { if (e.key==='Enter') saveCurrentTheme(); });
}

async function loadSavedThemes() {
  savedThemes = await window.api.storeGet('savedThemes') || [];
  renderSavedThemes();
}

function renderSavedThemes() {
  const list = $('saved-themes-list');
  const section = $('saved-themes-section');
  list.innerHTML = '';
  if (savedThemes.length === 0) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  savedThemes.forEach((theme, i) => {
    const row = document.createElement('div');
    row.className = 'saved-theme-row';
    const btn = document.createElement('button');
    btn.className = 'theme-preset-btn saved-theme-btn';
    btn.textContent = theme.name;
    btn.style.background  = theme.vars['--bg-card'];
    btn.style.color       = theme.vars['--text-primary'];
    btn.style.borderColor = theme.vars['--accent'];
    btn.addEventListener('click', () => {
      applyThemeVars(theme.vars);
      window.api.storeSet('theme', getCurrentThemeVars());
      clearActiveThemeBtn();
      btn.classList.add('active');
      syncColorPickers();
    });
    const del = document.createElement('button');
    del.className = 'saved-theme-delete';
    del.title = 'Delete theme';
    del.textContent = '×';
    del.addEventListener('click', () => deleteSavedTheme(i));
    row.appendChild(btn);
    row.appendChild(del);
    list.appendChild(row);
  });
}

async function saveCurrentTheme() {
  const nameInput = $('save-theme-name');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  const vars = getCurrentThemeVars();
  const existing = savedThemes.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing >= 0) savedThemes[existing] = { name, vars };
  else savedThemes.push({ name, vars });
  await window.api.storeSet('savedThemes', savedThemes);
  nameInput.value = '';
  renderSavedThemes();
  toast(`Theme "${name}" saved`);
}

async function deleteSavedTheme(index) {
  const name = savedThemes[index].name;
  savedThemes.splice(index, 1);
  await window.api.storeSet('savedThemes', savedThemes);
  renderSavedThemes();
  toast(`Theme "${name}" deleted`);
}

function clearActiveThemeBtn() {
  document.querySelectorAll('.theme-preset-btn').forEach(b => b.classList.remove('active'));
}

function openThemeModal() {
  syncColorPickers();
  renderSavedThemes();
  const customSection = $('custom-theme-pickers');
  const saveRow = $('save-theme-row');
  let proNotice = $('theme-pro-notice');
  if (window.isPro) {
    customSection.classList.remove('hidden');
    saveRow.classList.remove('hidden');
    if (proNotice) proNotice.remove();
  } else {
    customSection.classList.add('hidden');
    saveRow.classList.add('hidden');
    if (!proNotice) {
      proNotice = document.createElement('div');
      proNotice.id = 'theme-pro-notice';
      proNotice.style.cssText = 'font-size:0.82rem;color:var(--text-dim);text-align:center;padding:8px 0;';
      proNotice.innerHTML = '🔒 <a href="#" style="color:var(--accent);text-decoration:none;" onclick="event.preventDefault();document.getElementById(\'modal-overlay\').classList.add(\'hidden\');document.getElementById(\'license-overlay\').classList.add(\'visible\')">Upgrade to Pro</a> to create custom themes';
      saveRow.insertAdjacentElement('afterend', proNotice);
    }
  }
  showModal(els.modalTheme);
}
function syncColorPickers() {
  document.querySelectorAll('#custom-theme-pickers input[type="color"]').forEach(picker => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(picker.dataset.var).trim();
    picker.value = raw.startsWith('rgb') ? rgbToHex(raw) : (raw.startsWith('#') ? raw : '#888888');
  });
}
function getCurrentThemeVars() {
  const vars = {};
  ROOT_VARS.forEach(v => {
    const val = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    vars[v] = val.startsWith('rgb') ? rgbToHex(val) : val;
  });
  return vars;
}
function resetTheme() {
  applyThemeVars(THEMES[0].vars);
  window.api.storeDelete('theme');
  syncColorPickers();
  clearActiveThemeBtn();
  els.themePresets.querySelector('.theme-preset-btn').classList.add('active');
}

// ===== Context Menu =====
function openContextMenu(e, catId) {
  e.stopPropagation();
  state.contextCatId = catId;
  const menu = els.contextMenu;
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top  = `${e.clientY}px`;
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right>window.innerWidth)   menu.style.left = `${window.innerWidth-r.width-8}px`;
    if (r.bottom>window.innerHeight) menu.style.top  = `${window.innerHeight-r.height-8}px`;
  });
}
function closeContextMenu() { els.contextMenu.classList.add('hidden'); }

// ===== Modal helpers =====
function showModal(modal) {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  els.modalOverlay.classList.remove('hidden');
  modal.classList.remove('hidden');
}
function closeModals() {
  els.modalOverlay.classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// ===== Toast =====
let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// ===== Utils =====
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(ts) {
  const d=new Date(ts), diff=Date.now()-ts;
  if (diff<60000)    return 'Just now';
  if (diff<3600000)  return `${Math.floor(diff/60000)}m ago`;
  if (diff<86400000) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  return d.toLocaleDateString([],{month:'short',day:'numeric'})+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
function formatSteamTime(mins) {
  if (!mins) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins/60), m = mins % 60;
  return `${h} hr${h!==1?'s':''}${m>0?` ${m} min`:''}`;
}
function formatSessionTime(secs) {
  if (secs < 60) return '< 1 min';
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
  if (h === 0) return `${m} min`;
  return `${h} hr${h!==1?'s':''} ${m} min`;
}
function setBtnLoading(btn, loading) { btn.disabled=loading; btn.style.opacity=loading?'0.6':''; }

// ===== Program Scanner =====
let scannedPrograms = [];
let selectedPrograms = new Set();
let programSearchQuery = '';
const programIconCache = {};

async function openProgramScanner() {
  if (!state.folderPath) { toast('Select a folder first'); return; }
  scannedPrograms = [];
  selectedPrograms = new Set();
  programSearchQuery = '';
  els.programSearch.value = '';
  els.programList.innerHTML = '';
  els.programScannerStatus.textContent = 'Scanning for installed programs…';
  els.programSelectedCount.textContent = '0 selected';
  els.btnSelectAllPrograms.textContent = 'Select All';
  showModal(els.modalProgramScanner);

  try {
    const programs = await window.api.scanInstalledPrograms(state.folderPath);
    scannedPrograms = programs;
    if (programs.length === 0) {
      els.programScannerStatus.textContent = 'No new programs found — all detected programs are already in your launcher.';
    } else {
      els.programScannerStatus.textContent = `Found ${programs.length} program${programs.length !== 1 ? 's' : ''} not in your launcher.`;
    }
    renderProgramList();
    loadProgramIcons(programs);
  } catch {
    els.programScannerStatus.textContent = 'Error scanning for programs.';
  }
}

function renderProgramList() {
  const q = programSearchQuery.toLowerCase();
  const visible = q ? scannedPrograms.filter(p => p.name.toLowerCase().includes(q)) : scannedPrograms;

  els.programList.innerHTML = '';
  for (const prog of visible) {
    const checked = selectedPrograms.has(prog.sourcePath);
    const item = document.createElement('div');
    item.className = `add-cat-item${checked ? ' checked' : ''}`;
    const iconSrc = programIconCache[prog.id];
    item.innerHTML = `
      ${iconSrc
        ? `<img src="${iconSrc}" alt="" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;">`
        : `<div class="aci-icon">${prog.isStoreApp ? '&#127981;' : '&#127918;'}</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(prog.name)}${prog.isStoreApp ? ' <span style="font-size:0.68rem;background:var(--accent);color:white;padding:1px 4px;border-radius:3px;opacity:0.85;vertical-align:middle;">Store</span>' : ''}</div>
        <div style="font-size:0.73rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(prog.isStoreApp ? 'Microsoft Store app' : prog.targetPath)}</div>
      </div>
      <div class="add-cat-check"></div>`;
    item.addEventListener('click', () => {
      if (selectedPrograms.has(prog.sourcePath)) selectedPrograms.delete(prog.sourcePath);
      else selectedPrograms.add(prog.sourcePath);
      item.classList.toggle('checked', selectedPrograms.has(prog.sourcePath));
      updateProgramSelectedCount();
    });
    els.programList.appendChild(item);
  }
}

function updateProgramSelectedCount() {
  const n = selectedPrograms.size;
  els.programSelectedCount.textContent = `${n} selected`;
}

function toggleSelectAllPrograms() {
  const q = programSearchQuery.toLowerCase();
  const visible = q ? scannedPrograms.filter(p => p.name.toLowerCase().includes(q)) : scannedPrograms;
  const allSelected = visible.length > 0 && visible.every(p => selectedPrograms.has(p.sourcePath));
  if (allSelected) {
    visible.forEach(p => selectedPrograms.delete(p.sourcePath));
    els.btnSelectAllPrograms.textContent = 'Select All';
  } else {
    visible.forEach(p => selectedPrograms.add(p.sourcePath));
    els.btnSelectAllPrograms.textContent = 'Deselect All';
  }
  renderProgramList();
  updateProgramSelectedCount();
}

async function loadProgramIcons(programs) {
  const uncached = programs.filter(p => !programIconCache[p.id] && p.iconPath);
  if (uncached.length === 0) return;

  const pathToIds = {};
  for (const p of uncached) {
    if (!pathToIds[p.iconPath]) pathToIds[p.iconPath] = [];
    pathToIds[p.iconPath].push(p.id);
  }

  const iconMap = await window.api.getIconsBatch(Object.keys(pathToIds));
  for (const [iconPath, dataUrl] of Object.entries(iconMap)) {
    for (const id of (pathToIds[iconPath] || [])) {
      if (dataUrl) programIconCache[id] = dataUrl;
    }
  }
  renderProgramList();
}

async function addSelectedPrograms() {
  if (selectedPrograms.size === 0) { toast('Select at least one program'); return; }
  if (!state.folderPath) { toast('No folder selected'); return; }

  els.btnAddSelectedPrograms.disabled = true;
  els.btnAddSelectedPrograms.textContent = 'Adding…';

  try {
    const selected = scannedPrograms.filter(p => selectedPrograms.has(p.sourcePath));
    const result = await window.api.createShortcutsInFolder(selected, state.folderPath);
    closeModals();
    await scanFolder(false);
    const n = result.created.length;
    toast(`Added ${n} shortcut${n !== 1 ? 's' : ''} to launcher`);
  } catch {
    toast('Error adding shortcuts');
  } finally {
    els.btnAddSelectedPrograms.disabled = false;
    els.btnAddSelectedPrograms.textContent = '+ Add Selected';
  }
}

// ===== Web Shortcut =====
function openWebShortcutModal() {
  if (!window.isPro) { showProGate('Web Shortcuts'); return; }
  if (!state.folderPath) { toast('Select a folder first'); return; }
  els.webShortcutName.value        = '';
  els.webShortcutUrl.value         = '';
  els.webShortcutError.textContent = '';
  els.modalOverlay.classList.remove('hidden');
  els.modalWebShortcut.classList.remove('hidden');
  setTimeout(() => els.webShortcutUrl.focus(), 50);
}

async function confirmWebShortcut() {
  const rawUrl  = els.webShortcutUrl.value.trim();
  let   rawName = els.webShortcutName.value.trim();

  let url = rawUrl;
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

  if (!url) {
    els.webShortcutError.textContent = 'Please enter a URL.';
    els.webShortcutUrl.focus();
    return;
  }
  try { new URL(url); } catch {
    els.webShortcutError.textContent = "That doesn't look like a valid URL.";
    els.webShortcutUrl.focus();
    return;
  }

  if (!rawName) {
    try { rawName = new URL(url).hostname.replace(/^www\./, ''); } catch { rawName = 'Web Shortcut'; }
  }

  const btn = $('btn-confirm-web-shortcut');
  btn.disabled    = true;
  btn.textContent = 'Adding…';
  els.webShortcutError.textContent = '';

  try {
    const result = await window.api.createWebShortcut({ name: rawName, url, folderPath: state.folderPath });
    if (result.error) { els.webShortcutError.textContent = result.error; return; }
    closeModals();
    await scanFolder(false);
    toast(`Web shortcut "${rawName}" added`);
  } catch {
    els.webShortcutError.textContent = 'Failed to create shortcut.';
  } finally {
    btn.disabled    = false;
    btn.textContent = '+ Add Shortcut';
  }
}

// ===== Start =====
init();
