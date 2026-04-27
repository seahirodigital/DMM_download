const state = {
  activeDashboardPreviewKeys: [],
  activeDashboardPreviewItems: new Map(),
  activeFavoritePreviewKeys: [],
  activeInlinePreviewAudioKey: '',
  activeSearchPreviewKeys: [],
  controlsDirty: false,
  dashboardPreviewPlayers: new Map(),
  dashboardPreviewToken: 0,
  downloadSelectionMode: false,
  favoritePreviewPlayers: new Map(),
  favoritePreviewToken: 0,
  favoriteSelectionMode: false,
  favorites: {},
  headerActionsMode: '',
  history: [],
  cachedRankingItems: [],
  library: {
    directory: '',
    error: null,
    items: []
  },
  localViewerFiles: [],
  messageTimer: null,
  mpegtsPlayer: null,
  mobileMenuOpen: false,
  previewModalOpen: false,
  previewHlsPlayer: null,
  refreshTimer: null,
  renderCache: {
    dashboardRanking: '',
    favorites: '',
    searchResults: ''
  },
  search: {
    backgroundError: '',
    backgroundLoading: false,
    error: '',
    fetchedAt: null,
    hasMore: false,
    displayPageSize: 100,
    items: [],
    loading: false,
    page: 1,
    pageSize: 0,
    pagesFetched: 0,
    provider: 'fanza',
    query: '',
    sourcePageUrl: '',
    total: 0
  },
  searchDraft: null,
  searchFilters: {
    castType: '',
    dateSort: ''
  },
  selectedDownloadKeys: new Set(),
  selectedFavoriteKeys: new Set(),
  selectedSearchKeys: new Set(),
  settingsOpen: false,
  searchPreviewPlayers: new Map(),
  searchPreviewToken: 0,
  searchSelectionMode: false,
  shortcutModalOpen: false,
  snapshot: null,
  phoneLayout: false,
  tabletLayout: false,
  touchDevice: false,
  thumbnailModalOpen: false,
  tab: 'dashboard',
  viewerIndex: -1,
  viewerMode: 'server'
};

const elements = {};
const FAVORITES_STORAGE_KEY = 'dmm-download-favorites-v1';
const DEFAULT_SEARCH_DISPLAY_PAGE_SIZE = 100;
const SEARCH_DISPLAY_PAGE_SIZE_OPTIONS = [50, 100, 200, 300, 400, 500];
const previewInfoCache = new Map();
const INLINE_PREVIEW_TOKEN_KEYS = {
  dashboard: 'dashboardPreviewToken',
  favorites: 'favoritePreviewToken',
  search: 'searchPreviewToken'
};
let previewSourceTokenCounter = 0;
let searchRequestToken = 0;
const TOUCH_DEVICE_MEDIA_QUERY = '(hover: none) and (pointer: coarse)';
const PHONE_LAYOUT_MEDIA_QUERY = `${TOUCH_DEVICE_MEDIA_QUERY} and (max-width: 767px), ${TOUCH_DEVICE_MEDIA_QUERY} and (max-height: 599px)`;
const TABLET_LAYOUT_MEDIA_QUERY = `${TOUCH_DEVICE_MEDIA_QUERY} and (min-width: 768px) and (min-height: 600px) and (max-width: 1400px)`;

function qs(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getItemKey(item) {
  return String(item?.seasonId || item?.contentId || item?.detailUrl || item?.title || item?.rank || '');
}

function getDownloadKey(item) {
  return String(item?.seasonId || item?.contentId || getItemKey(item));
}

function currentRankingItems() {
  const items = state.snapshot?.ranking?.items || [];
  if (items.length) {
    return items;
  }

  if (state.activeDashboardPreviewKeys.length || state.downloadSelectionMode || state.selectedDownloadKeys.size) {
    return state.cachedRankingItems;
  }

  return [];
}

function cacheRankingItems(items = []) {
  if (Array.isArray(items) && items.length) {
    state.cachedRankingItems = items;
  }
}

function currentSearchItems() {
  return state.search?.items || [];
}

function mergeSearchItems(primaryItems = [], nextItems = []) {
  const seenKeys = new Set();
  return [...primaryItems, ...nextItems]
    .filter((item) => {
      const key = getItemKey(item);
      if (!key || seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));
}

function normalizeSearchProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'd' || normalized === 'dmm' || normalized === 'dmm.com' ? 'dmm' : 'fanza';
}

function searchProviderLabel(provider = state.search.provider) {
  return normalizeSearchProvider(provider) === 'dmm' ? 'DMM' : 'FANZA';
}

function formatProductCode(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = raw
    .normalize('NFKC')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^0-9a-z]/gi, '');
  const match = /([a-z]+)0*(\d+[a-z]?)$/i.exec(normalized);
  if (!match) {
    return raw.toUpperCase();
  }

  const number = match[2].replace(/^0+(?=\d)/, '').toUpperCase();
  return `${match[1].toUpperCase()}-${number}`;
}

function getProductCode(item) {
  return formatProductCode(item?.productCode || item?.contentId || item?.seasonId || '');
}

function isSearchPreviewable(item) {
  return Boolean(item?.seasonId || item?.playbackUrl);
}

function splitActressNames(value) {
  return String(value || '')
    .split(/\s*(?:,|、|，|\/|／|&|＆)\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function getSearchItemCastType(item) {
  const count = Number(item?.actressCount);
  if (Number.isFinite(count) && count > 1) {
    return 'multi';
  }
  if (Number.isFinite(count) && count === 1) {
    return 'single';
  }
  return splitActressNames(item?.actress).length > 1 ? 'multi' : 'single';
}

function getSearchItemDateValue(item) {
  const time = Date.parse(item?.releaseDate || item?.date || item?.fetchedAt || '');
  return Number.isFinite(time) ? time : 0;
}

function areSearchFiltersActive() {
  return Boolean(state.searchFilters.castType || state.searchFilters.dateSort);
}

function visibleSearchItems() {
  const filters = state.searchFilters;
  let items = currentSearchItems();
  if (filters.castType) {
    items = items.filter((item) => getSearchItemCastType(item) === filters.castType);
  }
  if (filters.dateSort) {
    const direction = filters.dateSort === 'asc' ? 1 : -1;
    items = [...items].sort((left, right) => {
      const dateDelta = (getSearchItemDateValue(left) - getSearchItemDateValue(right)) * direction;
      if (dateDelta) {
        return dateDelta;
      }
      const rankDelta = Number(left.rank || 0) - Number(right.rank || 0);
      return rankDelta || String(left.title || '').localeCompare(String(right.title || ''), 'ja');
    });
  }
  return items;
}

function normalizeSearchDisplayPageSize(value) {
  const pageSize = Number(value);
  return SEARCH_DISPLAY_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_SEARCH_DISPLAY_PAGE_SIZE;
}

function searchDisplayPageSize() {
  return normalizeSearchDisplayPageSize(state.search?.displayPageSize);
}

function getSearchPageCount(itemsOrCount = visibleSearchItems()) {
  const itemCount = Array.isArray(itemsOrCount) ? itemsOrCount.length : Number(itemsOrCount || 0);
  return Math.max(1, Math.ceil(itemCount / searchDisplayPageSize()));
}

function clampSearchPage(itemsOrCount = visibleSearchItems()) {
  const pageCount = getSearchPageCount(itemsOrCount);
  const nextPage = Math.min(Math.max(1, Number(state.search?.page || 1)), pageCount);
  state.search.page = nextPage;
  return nextPage;
}

function paginatedSearchItems(items = visibleSearchItems()) {
  const pageSize = searchDisplayPageSize();
  const currentPage = clampSearchPage(items);
  const startIndex = (currentPage - 1) * pageSize;
  return items.slice(startIndex, startIndex + pageSize);
}

function refreshSearchFilterResults() {
  state.search.page = 1;
  state.activeSearchPreviewKeys = [];
  state.selectedSearchKeys.clear();
  state.searchSelectionMode = false;
  destroySearchPreviewPlayers();
  state.renderCache.searchResults = '';
  renderSearchResults();
  syncSearchSelectionControls();
}

function setSearchCastFilter(type) {
  state.searchFilters.castType = state.searchFilters.castType === type ? '' : type;
  refreshSearchFilterResults();
}

function setSearchDateSort(sort) {
  state.searchFilters.dateSort = state.searchFilters.dateSort === sort ? '' : sort;
  refreshSearchFilterResults();
}

function resetSearchFilters() {
  if (!areSearchFiltersActive()) {
    return;
  }
  state.searchFilters = {
    castType: '',
    dateSort: ''
  };
  refreshSearchFilterResults();
}

function refreshSearchPagingResults() {
  state.activeSearchPreviewKeys = [];
  destroySearchPreviewPlayers();
  state.renderCache.searchResults = '';
  renderSearchResults();
  syncSearchSelectionControls();
}

function setSearchPage(page) {
  const pageCount = getSearchPageCount();
  const nextPage = Math.min(Math.max(1, Number(page || 1)), pageCount);
  if (state.search.page === nextPage) {
    return;
  }
  state.search.page = nextPage;
  refreshSearchPagingResults();
}

function setSearchDisplayPageSize(value) {
  const nextPageSize = normalizeSearchDisplayPageSize(value);
  if (searchDisplayPageSize() === nextPageSize) {
    return;
  }
  state.search.displayPageSize = nextPageSize;
  state.search.page = 1;
  refreshSearchPagingResults();
}

function selectedRankingItems() {
  return currentRankingItems().filter((item) => state.selectedDownloadKeys.has(getDownloadKey(item)));
}

function getSelectionKey(item, selectionKind) {
  if (selectionKind === 'download') {
    return getDownloadKey(item);
  }

  if (selectionKind === 'favorite' || selectionKind === 'search') {
    return getItemKey(item);
  }

  return '';
}

function favoriteItemsSorted() {
  return Object.values(state.favorites).sort((left, right) => {
    const leftRank = Number(left.rank || 999999);
    const rightRank = Number(right.rank || 999999);
    return leftRank - rightRank || String(left.title || '').localeCompare(String(right.title || ''), 'ja');
  });
}

function syncResponsiveState() {
  const touchDevice = window.matchMedia(TOUCH_DEVICE_MEDIA_QUERY).matches;
  const phoneLayout = window.matchMedia(PHONE_LAYOUT_MEDIA_QUERY).matches;
  const tabletLayout = window.matchMedia(TABLET_LAYOUT_MEDIA_QUERY).matches;
  const changed =
    state.touchDevice !== touchDevice || state.phoneLayout !== phoneLayout || state.tabletLayout !== tabletLayout;
  state.touchDevice = touchDevice;
  state.phoneLayout = phoneLayout;
  state.tabletLayout = tabletLayout;
  document.body.classList.toggle('iphone-inline-layout', phoneLayout);
  document.body.classList.toggle('ipad-inline-layout', tabletLayout);
  return changed;
}

function isDesktopBrowserExperience() {
  return !state.touchDevice;
}

function canUseInlinePreviewExperience() {
  return isDesktopBrowserExperience() || state.tabletLayout || state.phoneLayout;
}

function appCapabilities() {
  return state.snapshot?.config?.capabilities || {};
}

function isHostedMode() {
  return state.snapshot?.config?.appMode === 'hosted';
}

function canDownload() {
  return Boolean(appCapabilities().canDownload);
}

function canManageSettings() {
  return Boolean(appCapabilities().canPersistSettings);
}

function canUseLibrary() {
  return Boolean(appCapabilities().canUseLibrary);
}

function pruneDownloadSelection() {
  const validKeys = new Set(currentRankingItems().map(getDownloadKey).filter(Boolean));
  for (const key of [...state.selectedDownloadKeys]) {
    if (!validKeys.has(key)) {
      state.selectedDownloadKeys.delete(key);
    }
  }
}

function pruneFavoriteSelection() {
  const validKeys = new Set(Object.keys(state.favorites));
  for (const key of [...state.selectedFavoriteKeys]) {
    if (!validKeys.has(key)) {
      state.selectedFavoriteKeys.delete(key);
    }
  }
}

function pruneSearchSelection() {
  const validKeys = new Set(visibleSearchItems().filter(isSearchPreviewable).map(getItemKey).filter(Boolean));
  for (const key of [...state.selectedSearchKeys]) {
    if (!validKeys.has(key)) {
      state.selectedSearchKeys.delete(key);
    }
  }
}

function pruneFavoritePreviewKeys() {
  state.activeFavoritePreviewKeys = state.activeFavoritePreviewKeys.filter((key) => state.favorites[key]);
}

function pruneSearchPreviewKeys() {
  const validKeys = new Set(visibleSearchItems().filter(isSearchPreviewable).map(getItemKey).filter(Boolean));
  state.activeSearchPreviewKeys = state.activeSearchPreviewKeys.filter((key) => validKeys.has(key));
}

function setFavoriteSelectionMode(isEnabled) {
  const nextValue = Boolean(isEnabled && canUseInlinePreviewExperience());
  state.favoriteSelectionMode = nextValue;
  if (!nextValue) {
    state.selectedFavoriteKeys.clear();
  }
  renderFavorites();
  syncFavoriteSelectionControls();
}

function toggleFavoriteSelectionMode() {
  setFavoriteSelectionMode(!state.favoriteSelectionMode);
}

function toggleFavoriteSelection(key, isSelected = !state.selectedFavoriteKeys.has(key)) {
  if (!key || !state.favorites[key]) {
    return;
  }

  if (isSelected) {
    state.selectedFavoriteKeys.add(key);
  } else {
    state.selectedFavoriteKeys.delete(key);
  }

  syncCardSelectionControl(elements.favoritesContent, key, isSelected);
  syncFavoriteSelectionControls();
}

function setSearchSelectionMode(isEnabled) {
  const nextValue = Boolean(isEnabled && canUseInlinePreviewExperience());
  state.searchSelectionMode = nextValue;
  if (!nextValue) {
    state.selectedSearchKeys.clear();
  } else {
    pruneSearchSelection();
  }
  renderSearchResults();
  syncSearchSelectionControls();
}

function toggleSearchSelectionMode() {
  setSearchSelectionMode(!state.searchSelectionMode);
}

function toggleSearchSelection(key, isSelected = !state.selectedSearchKeys.has(key)) {
  if (!key || !visibleSearchItems().some((item) => getItemKey(item) === key && isSearchPreviewable(item))) {
    return;
  }

  if (isSelected) {
    state.selectedSearchKeys.add(key);
  } else {
    state.selectedSearchKeys.delete(key);
  }

  syncCardSelectionControl(elements.searchResults, key, isSelected);
  syncSearchSelectionControls();
}

function isTextEntryTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
    return true;
  }

  if (tag !== 'input') {
    return false;
  }

  return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(
    String(target.type || '').toLowerCase()
  );
}

function isCommandShortcutTarget(target) {
  return Boolean(target?.closest?.('button, a, [role="button"]'));
}

function playSelectedInlinePreviewsForCurrentTab() {
  if (!canUseInlinePreviewExperience()) {
    return false;
  }

  if (state.tab === 'dashboard' && state.downloadSelectionMode && state.selectedDownloadKeys.size) {
    openDashboardInlinePreviews([...state.selectedDownloadKeys]);
    return true;
  }

  if (state.tab === 'favorites' && state.favoriteSelectionMode && state.selectedFavoriteKeys.size) {
    openFavoriteInlinePreviews([...state.selectedFavoriteKeys]);
    return true;
  }

  if (state.tab === 'search' && state.searchSelectionMode && state.selectedSearchKeys.size) {
    openSearchInlinePreviews([...state.selectedSearchKeys]);
    return true;
  }

  return false;
}

function handleSelectionPlayShortcut(event) {
  if (
    event.key !== 'Enter' ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    state.settingsOpen ||
    state.thumbnailModalOpen ||
    state.previewModalOpen ||
    state.shortcutModalOpen ||
    isTextEntryTarget(event.target) ||
    isCommandShortcutTarget(event.target)
  ) {
    return false;
  }

  if (!playSelectedInlinePreviewsForCurrentTab()) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
}

function normalizeFavoriteItem(item) {
  return {
    actress: item.actress || '',
    actressCount: item.actressCount || 0,
    contentId: item.contentId || '',
    detailUrl: item.detailUrl || '',
    playbackUrl: item.playbackUrl || '',
    productCode: getProductCode(item),
    rank: item.rank ?? '',
    releaseDate: item.releaseDate || '',
    searchUrl: item.searchUrl || '',
    seasonId: item.seasonId || '',
    sourcePageUrl: item.sourcePageUrl || '',
    thumbnailFallbackUrl: item.thumbnailFallbackUrl || '',
    thumbnailUrl: item.thumbnailUrl || '',
    title: item.title || '',
    updatedAt: new Date().toISOString()
  };
}

function loadFavorites() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || '{}');
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((item) => [getItemKey(item), item]).filter(([key]) => key));
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveFavorites() {
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites));
}

function isFavorite(item) {
  return Boolean(state.favorites[getItemKey(item)]);
}

function toggleFavorite(item) {
  const key = getItemKey(item);
  if (!key) {
    return;
  }

  if (state.favorites[key]) {
    delete state.favorites[key];
  } else {
    state.favorites[key] = normalizeFavoriteItem(item);
  }

  saveFavorites();
  pruneFavoriteSelection();
  pruneFavoritePreviewKeys();
  renderDashboardRanking();
  renderFavorites();
  renderSearchResults();
}

function syncFavoritesWithRanking() {
  const rankingItems = state.snapshot?.ranking?.items || [];
  let changed = false;

  for (const item of rankingItems) {
    const key = getItemKey(item);
    if (key && state.favorites[key]) {
      state.favorites[key] = {
        ...state.favorites[key],
        ...normalizeFavoriteItem(item),
        updatedAt: state.favorites[key].updatedAt
      };
      changed = true;
    }
  }

  if (changed) {
    saveFavorites();
  }
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ja-JP');
}

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const normalized = value / 1024 ** exponent;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function formatStatus(value) {
  const labels = {
    completed: '完了',
    downloading: 'ダウンロード中',
    failed: '失敗',
    idle: '待機中',
    queued: '待機列',
    running: '実行中',
    skipped: 'スキップ',
    stopped: '停止'
  };
  return labels[value] || value || '-';
}

function showMessage(message, type = 'info') {
  elements.flashMessage.textContent = message;
  elements.flashMessage.className = `flash-message ${type === 'info' ? '' : type}`.trim();

  window.clearTimeout(state.messageTimer);
  state.messageTimer = window.setTimeout(() => {
    elements.flashMessage.textContent = '';
    elements.flashMessage.className = 'flash-message';
  }, 4000);
}

function updateSelectionButton() {
  const button = qs('header-select-download-button');
  if (!button) {
    return;
  }

  const selectedCount = state.selectedDownloadKeys.size;
  button.classList.toggle('active', state.downloadSelectionMode);
  button.setAttribute('aria-pressed', String(state.downloadSelectionMode));
  button.textContent = state.downloadSelectionMode
    ? selectedCount
      ? `選択中 ${selectedCount}`
      : '選択中'
    : '複数選択';
}

function syncSelectionControls(container, toggleSelector, playSelector, isActive, selectedCount) {
  if (!container) {
    return;
  }

  container.querySelectorAll(toggleSelector).forEach((button) => {
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.textContent = isActive ? (selectedCount ? `選択中 ${selectedCount}` : '選択中') : '複数選択';
  });

  container.querySelectorAll(playSelector).forEach((button) => {
    button.disabled = selectedCount === 0;
  });
}

function syncDashboardSelectionControls() {
  syncSelectionControls(
    elements.dashboardRanking,
    '[data-dashboard-selection-toggle]',
    '[data-dashboard-selection-play]',
    state.downloadSelectionMode,
    state.selectedDownloadKeys.size
  );
}

function syncFavoriteSelectionControls() {
  syncSelectionControls(
    elements.favoritesContent,
    '[data-favorite-selection-toggle]',
    '[data-favorite-selection-play]',
    state.favoriteSelectionMode,
    state.selectedFavoriteKeys.size
  );
}

function syncSearchSelectionControls() {
  syncSelectionControls(
    elements.searchResults,
    '[data-search-selection-toggle]',
    '[data-search-selection-play]',
    state.searchSelectionMode,
    state.selectedSearchKeys.size
  );
}

function syncCardSelectionControl(container, key, isSelected) {
  if (!container || !key) {
    return;
  }

  container.querySelectorAll(`[data-card-select-key="${CSS.escape(key)}"]`).forEach((checkbox) => {
    checkbox.checked = Boolean(isSelected);
    checkbox.closest('.ranking-card-select')?.classList.toggle('active', Boolean(isSelected));
  });
}

function setDownloadSelectionMode(isEnabled) {
  state.downloadSelectionMode = isEnabled;
  if (!isEnabled) {
    state.selectedDownloadKeys.clear();
  } else {
    pruneDownloadSelection();
  }

  document.body.classList.toggle('download-selection-mode', isEnabled);
  renderDashboardRanking();
  renderHeaderActions();
  updateSelectionButton();
  syncDashboardSelectionControls();
}

function toggleDownloadSelectionMode() {
  setDownloadSelectionMode(!state.downloadSelectionMode);
}

function toggleDownloadSelection(key, isSelected) {
  if (!key) {
    return;
  }

  if (isSelected) {
    state.selectedDownloadKeys.add(key);
  } else {
    state.selectedDownloadKeys.delete(key);
  }

  syncCardSelectionControl(elements.dashboardRanking, key, isSelected);
  updateSelectionButton();
  syncDashboardSelectionControls();
}

function setMobileMenuOpen(isOpen) {
  state.mobileMenuOpen = isOpen;
  document.body.classList.toggle('mobile-menu-open', isOpen);
  if (elements.mobileMenuButton) {
    elements.mobileMenuButton.setAttribute('aria-expanded', String(isOpen));
  }
  if (elements.mobileSidebarBackdrop) {
    elements.mobileSidebarBackdrop.hidden = !isOpen;
  }
}

function syncResponsiveActionPlacement() {
  if (!elements.topbarActions || !elements.topbarActionsSlot || !elements.mobileSidebarActions) {
    return;
  }

  const shouldMoveToSidebar = elements.mobileActionMedia?.matches;
  const nextParent = shouldMoveToSidebar ? elements.mobileSidebarActions : elements.topbarActionsSlot;
  if (elements.topbarActions.parentElement !== nextParent) {
    nextParent.appendChild(elements.topbarActions);
  }

  if (!shouldMoveToSidebar) {
    setMobileMenuOpen(false);
  }
}

function syncInlinePreviewLayoutState() {
  const activeInlinePreview = Boolean(document.querySelector('.view.active .section-block.inline-preview-active'));
  document.body.classList.toggle('inline-preview-active', activeInlinePreview);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `リクエストに失敗しました: ${response.status}`);
  }

  return payload;
}

function switchTab(tabName) {
  if (tabName === 'viewer' && !canUseLibrary()) {
    tabName = 'dashboard';
  }

  if (state.tab === 'favorites' && tabName !== 'favorites') {
    destroyFavoritePreviewPlayers();
    state.renderCache.favorites = '';
  }

  if (state.tab === 'dashboard' && tabName !== 'dashboard') {
    destroyDashboardPreviewPlayers();
    state.renderCache.dashboardRanking = '';
  }

  if (state.tab === 'search' && tabName !== 'search') {
    destroySearchPreviewPlayers();
    state.renderCache.searchResults = '';
  }

  state.tab = tabName;
  setMobileMenuOpen(false);
  document.querySelectorAll('.nav-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `${tabName}-view`);
  });
  syncInlinePreviewLayoutState();

  if (tabName === 'history') {
    renderHistory();
  }

  if (tabName === 'favorites') {
    renderFavorites();
  }

  if (tabName === 'viewer') {
    refreshLibrary({ silent: true });
  }

  if (tabName === 'search') {
    renderSearchResults();
  }

  renderHeaderActions();
}

function renderWarnings() {
  const warnings = state.snapshot?.warnings || [];
  if (!warnings.length) {
    elements.warningList.innerHTML = '';
    return;
  }

  elements.warningList.innerHTML = warnings
    .map((warning) => `<div class="warning-card">${warning}</div>`)
    .join('');
}

function renderSummary() {
  if (!state.snapshot) {
    return;
  }

  const ranking = state.snapshot.ranking || { fetchedAt: null };
  elements.appSummary.innerHTML = `
    <span class="sidebar-summary-label">最終取得</span>
    <strong>${ranking.fetchedAt ? formatDate(ranking.fetchedAt) : '-'}</strong>
  `;
}

function renderActressSearchForm(options = {}) {
  const { extraClass = '', idPrefix = '' } = options;
  const prefix = idPrefix ? `${idPrefix}-` : '';
  const inputValue = state.searchDraft ?? state.search.query;
  const provider = normalizeSearchProvider(state.search.provider);
  return `
    <form id="${prefix}actress-search-form" class="header-search-form ${escapeHtml(extraClass)}" data-actress-search-form>
      <label class="header-control header-search-control">
        <span>検索語</span>
        <input
          id="${prefix}actress-search-input"
          class="text-input header-search-input"
          type="search"
          autocomplete="off"
          data-actress-search-input
          value="${escapeHtml(inputValue)}"
          placeholder="女優名・商品名で検索"
        />
      </label>
      <div class="search-provider-switch" role="group" aria-label="検索先">
        <button
          class="search-provider-option ${provider === 'dmm' ? 'active' : ''}"
          type="button"
          data-search-provider="dmm"
          aria-pressed="${provider === 'dmm' ? 'true' : 'false'}"
          title="DMMで検索"
        >
          D
        </button>
        <button
          class="search-provider-option ${provider === 'fanza' ? 'active' : ''}"
          type="button"
          data-search-provider="fanza"
          aria-pressed="${provider === 'fanza' ? 'true' : 'false'}"
          title="FANZAで検索"
        >
          F
        </button>
      </div>
      <button class="header-command-button actress-search-submit" type="submit" title="Search" aria-label="Search keyword" ${state.search.loading ? 'disabled' : ''}>
        <span aria-hidden="true">${state.search.loading ? '&hellip;' : '&#128269;'}</span>
      </button>
    </form>
  `;
}

function captureActressSearchFocus(scope = document) {
  const active = document.activeElement;
  if (!active?.matches?.('[data-actress-search-input]') || (scope && !scope.contains(active))) {
    return null;
  }

  return {
    id: active.id,
    selectionDirection: active.selectionDirection || 'none',
    selectionEnd: active.selectionEnd,
    selectionStart: active.selectionStart
  };
}

function restoreActressSearchFocus(snapshot) {
  if (!snapshot?.id) {
    return;
  }

  const input = qs(snapshot.id);
  if (!input) {
    return;
  }

  input.focus({ preventScroll: true });
  if (typeof input.setSelectionRange === 'function') {
    const fallbackPosition = input.value.length;
    const selectionStart = Math.min(snapshot.selectionStart ?? fallbackPosition, input.value.length);
    const selectionEnd = Math.min(snapshot.selectionEnd ?? selectionStart, input.value.length);
    input.setSelectionRange(selectionStart, selectionEnd, snapshot.selectionDirection);
  }
}

function syncActressSearchInputs(value, sourceInput = null) {
  document.querySelectorAll('[data-actress-search-input]').forEach((input) => {
    if (input !== sourceInput) {
      input.value = value;
    }
  });
}

function setSearchProvider(provider) {
  const nextProvider = normalizeSearchProvider(provider);
  if (state.search.provider === nextProvider) {
    return;
  }

  searchRequestToken += 1;
  state.search = {
    ...state.search,
    backgroundError: '',
    backgroundLoading: false,
    page: 1,
    provider: nextProvider
  };
  state.controlsDirty = false;
  state.renderCache.searchResults = '';
  renderHeaderActions();
  renderSearchResults();
}

function bindActressSearchForms(root = document) {
  root.querySelectorAll('[data-actress-search-form]').forEach((form) => {
    const input = form.querySelector('[data-actress-search-input]');
    input?.addEventListener('input', () => {
      state.searchDraft = input.value;
      state.controlsDirty = true;
      syncActressSearchInputs(input.value, input);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      searchActress(input?.value || '');
    });
    form.querySelectorAll('[data-search-provider]').forEach((button) => {
      button.addEventListener('click', () => {
        setSearchProvider(button.dataset.searchProvider);
      });
    });
  });
}

function renderSearchHeaderActions() {
  const focusSnapshot = captureActressSearchFocus(elements.headerActions);
  elements.headerActions.innerHTML = renderActressSearchForm();
  bindActressSearchForms(elements.headerActions);
  restoreActressSearchFocus(focusSnapshot);
}

function renderHeaderActions() {
  if (!state.snapshot) {
    return;
  }

  const mode = state.tab === 'search' ? 'search' : 'ranking';
  if (state.headerActionsMode && state.headerActionsMode !== mode) {
    state.controlsDirty = false;
  }
  if (state.controlsDirty && state.headerActionsMode === mode) {
    return;
  }
  state.headerActionsMode = mode;

  if (mode === 'search') {
    renderSearchHeaderActions();
    return;
  }

  const isRunning = Boolean(state.snapshot.downloads?.running);
  const downloadEnabled = canDownload();
  const { config, settings } = state.snapshot;
  const rankingFetchCount = settings.rankingFetchCount || config.ranking.first || 15;

  elements.headerActions.innerHTML = `
    <label class="header-control">
      <span>ランキング取得数</span>
      <input id="ranking-fetch-count-input" class="number-input header-number-input" type="number" min="1" max="100" value="${rankingFetchCount}" />
    </label>
    <label class="header-control">
      <span>ダウンロード上限</span>
      <input id="download-limit-input" class="number-input header-number-input" type="number" min="1" max="50" value="${settings.downloadLimit}" />
    </label>
    <button id="header-fetch-ranking-button" class="header-command-button" type="button">ランキング取得</button>
    <button
      id="header-select-download-button"
      class="header-command-button ${state.downloadSelectionMode ? 'active' : ''}"
      type="button"
      aria-pressed="${state.downloadSelectionMode ? 'true' : 'false'}"
      ${isRunning ? 'disabled' : ''}
    >
      ${state.downloadSelectionMode ? (state.selectedDownloadKeys.size ? `選択中 ${state.selectedDownloadKeys.size}` : '選択中') : '複数選択'}
    </button>
    <button
      id="header-download-button"
      class="header-command-button ${isRunning ? 'danger-outline' : ''}"
      type="button"
    >
      ${isRunning ? '停止' : 'ダウンロード開始'}
    </button>
  `;

  if (!downloadEnabled) {
    qs('download-limit-input')?.closest('.header-control')?.setAttribute('hidden', 'hidden');
    qs('header-select-download-button')?.remove();
    qs('header-download-button')?.remove();
  }

  const markDirty = () => {
    state.controlsDirty = true;
  };

  qs('ranking-fetch-count-input').addEventListener('input', markDirty);
  qs('download-limit-input')?.addEventListener('input', markDirty);
  qs('header-fetch-ranking-button').addEventListener('click', fetchRanking);
  qs('header-select-download-button')?.addEventListener('click', toggleDownloadSelectionMode);
  qs('header-download-button')?.addEventListener('click', () => {
    if (isRunning) {
      stopDownload();
      return;
    }
    startDownload();
  });
}

function renderDashboardControls() {
  if (elements.dashboardControls) {
    elements.dashboardControls.innerHTML = '';
  }
}

function renderSettingsPanel() {
  if (!state.snapshot || state.controlsDirty) {
    return;
  }

  if (!canManageSettings()) {
    elements.settingsPanelContent.innerHTML = `
      <div class="empty-state">
        Hosted mode では設定変更と Cookie 保存を無効化しています。PC の ` + '`start.bat`' + ` から起動したときだけダウンロード機能を使えます。
      </div>
    `;
    return;
  }

  const { config, settings } = state.snapshot;

  elements.settingsPanelContent.innerHTML = `
    <div class="settings-info-grid">
      <div class="settings-info-card">
        <span>設定ファイル</span>
        <strong>${escapeHtml(config.paths.configFile)}</strong>
      </div>
      <div class="settings-info-card">
        <span>ランキングAPI</span>
        <strong>https://api.tv.dmm.com/graphql</strong>
      </div>
      <div class="settings-info-card">
        <span>操作名 / アフィリエイトID</span>
        <strong>FetchSearchVideos / ${escapeHtml(config.affiliate.searchAffiliateId)}</strong>
      </div>
      <div class="settings-info-card">
        <span>取得元ページ</span>
        <strong>${escapeHtml(settings.rankingSourceUrl)}</strong>
      </div>
      <div class="settings-info-card">
        <span>保存先フォルダ</span>
        <strong>${escapeHtml(config.paths.downloadDir)}</strong>
      </div>
      <div class="settings-info-card">
        <span>Cookie設定</span>
        <strong>${config.capabilities.hasCookie ? `設定済み（${config.capabilities.cookieLength}文字）` : '未設定'}</strong>
      </div>
    </div>

    <div class="settings-form">
      <label class="control-group">
        <span>ファイル名テンプレート</span>
        <input
          id="filename-template-input"
          class="text-input"
          type="text"
          value="${escapeHtml(settings.filenameTemplate)}"
          placeholder="{{title}}_{{actress}}_{{seasonId}}"
        />
      </label>

      <label class="control-group">
        <span>ランキング取得元URL</span>
        <input
          id="ranking-source-url-input"
          class="text-input"
          type="text"
          value="${escapeHtml(settings.rankingSourceUrl)}"
          placeholder="${escapeHtml(config.ranking.sourcePageUrl)}"
        />
      </label>

      <label class="control-group">
        <span>ビューアー用フォルダ</span>
        <input
          id="library-directory-input-settings"
          class="text-input"
          type="text"
          value="${escapeHtml(settings.libraryDirectory)}"
          placeholder="${escapeHtml(config.paths.downloadDir)}"
        />
      </label>

      <label class="control-group">
        <span>DMMのCookie（ログインセッション）</span>
        <textarea
          id="dmm-cookie-input"
          class="textarea-input"
          rows="5"
          placeholder="${config.capabilities.hasCookie ? `Cookieは保存済みです（${config.capabilities.cookieLength}文字）。変更する場合だけ新しいCookieを貼り付けてください。` : 'DMMにログインしたブラウザの開発者ツールから、リクエストヘッダー内のCookie値を貼り付けてください。'}"
        ></textarea>
        <small class="control-note">
          ${config.capabilities.hasCookie ? '保存済みCookieは安全のため本文を表示しません。空欄に戻るのは正常です。' : 'Cookieを貼り付けたら、すぐに「Cookieを保存」を押してください。'}
        </small>
      </label>

      <div class="settings-button-row">
        <button id="save-settings-button" class="action-button">設定を保存</button>
        <button id="save-cookie-button" class="ghost-button">Cookieを保存</button>
        <button id="import-n8n-cookie-button" class="ghost-button">n8nからCookie取り込み</button>
        <button id="clear-cookie-button" class="danger-button">Cookie削除</button>
      </div>
    </div>
  `;

  const markDirty = () => {
    state.controlsDirty = true;
  };

  qs('filename-template-input').addEventListener('input', markDirty);
  qs('ranking-source-url-input').addEventListener('input', markDirty);
  qs('library-directory-input-settings').addEventListener('input', markDirty);
  qs('dmm-cookie-input').addEventListener('input', markDirty);
  qs('save-settings-button').addEventListener('click', saveSettings);
  qs('save-cookie-button').addEventListener('click', saveCookie);
  qs('import-n8n-cookie-button').addEventListener('click', importN8nCookie);
  qs('clear-cookie-button').addEventListener('click', clearCookie);
}

function setSettingsPanelOpen(isOpen) {
  state.settingsOpen = isOpen;
  elements.settingsPanel.classList.toggle('open', isOpen);
  elements.settingsPanel.setAttribute('aria-hidden', String(!isOpen));
  elements.settingsOverlay.hidden = !isOpen;
  document.body.classList.toggle('settings-open', isOpen);
}

function renderDashboardMetrics() {
  if (!state.snapshot) {
    return;
  }

  elements.dashboardMetrics.innerHTML = '';
}

function isSeasonCompleted(seasonId) {
  return state.history.some((record) => record.seasonId === seasonId && record.status === 'completed');
}

function buildPlaybackUrl(item) {
  const seasonId = item?.seasonId || '';
  const contentId = item?.contentId || seasonId;
  const params = new URLSearchParams({
    season: seasonId,
    content: contentId,
    mode: 'sample'
  });
  return `https://tv.dmm.com/vod/playback/on-demand/?${params.toString()}`;
}

function preferHighQualityPlaybackUrl(value) {
  try {
    const url = new URL(value);
    if (/\.(m3u8|mp4|m4v|mov|webm)$/i.test(url.pathname)) {
      return url.toString();
    }

    if (!/\/litevideo\//i.test(url.pathname)) {
      return url.toString();
    }

    if (/\/size=[^/]+/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/size=[^/]+/i, '/size=1920_1080');
    } else {
      url.pathname = url.pathname.replace(/\/?$/, '/size=1920_1080/');
    }
    return url.toString();
  } catch {
    return value || '';
  }
}

function buildCardPlaybackUrl(item) {
  return preferHighQualityPlaybackUrl(item?.playbackUrl) || item?.detailUrl || buildPlaybackUrl(item);
}

function buildPreviewUrl(item, options = {}) {
  const seasonId = item?.seasonId || '';
  const contentId = item?.contentId || seasonId;
  const params = new URLSearchParams();
  if (seasonId) {
    params.set('season', seasonId);
  }
  if (contentId) {
    params.set('content', contentId);
  }
  if (!seasonId && item?.playbackUrl) {
    params.set('playback', item.playbackUrl);
  }
  if (!seasonId && item?.detailUrl) {
    params.set('detail', item.detailUrl);
  }
  if (options.forceRefresh) {
    params.set('refresh', '1');
  }
  if (options.cacheBust) {
    params.set('_preview', options.cacheBust);
  }
  return `/api/preview/play?${params.toString()}`;
}

function buildPreviewInfoUrl(item, options = {}) {
  const seasonId = item?.seasonId || '';
  const contentId = item?.contentId || seasonId;
  const params = new URLSearchParams();
  if (seasonId) {
    params.set('season', seasonId);
  }
  if (contentId) {
    params.set('content', contentId);
  }
  if (!seasonId && item?.playbackUrl) {
    params.set('playback', item.playbackUrl);
  }
  if (!seasonId && item?.detailUrl) {
    params.set('detail', item.detailUrl);
  }
  if (options.forceRefresh) {
    params.set('refresh', '1');
  }
  if (options.cacheBust) {
    params.set('_preview', options.cacheBust);
  }
  return `/api/preview/info?${params.toString()}`;
}

function buildPreviewCacheKey(item) {
  return `${item?.seasonId || ''}:${item?.contentId || item?.seasonId || item?.playbackUrl || item?.detailUrl || ''}`;
}

function parseHlsAttributeList(line) {
  const attributes = {};
  const text = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

  for (const match of text.matchAll(pattern)) {
    attributes[match[1]] = match[2].replace(/^"|"$/g, '');
  }

  return attributes;
}

function selectHighestHlsVariantUrl(manifestUrl, manifestText) {
  const lines = String(manifestText || '').split(/\r?\n/).map((line) => line.trim());
  const variants = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('#EXT-X-STREAM-INF')) {
      continue;
    }

    const attributes = parseHlsAttributeList(line);
    const nextLine = lines[index + 1];
    if (!nextLine || nextLine.startsWith('#')) {
      continue;
    }

    const resolution = String(attributes.RESOLUTION || '').split('x').map((value) => Number(value) || 0);
    variants.push({
      bandwidth: Number(attributes.BANDWIDTH || attributes['AVERAGE-BANDWIDTH'] || 0),
      pixels: (resolution[0] || 0) * (resolution[1] || 0),
      url: new URL(nextLine, manifestUrl).toString()
    });
  }

  if (!variants.length) {
    return '';
  }

  variants.sort((left, right) => right.pixels - left.pixels || right.bandwidth - left.bandwidth);
  return variants[0].url;
}

async function preferHighestHlsVariant(info) {
  if (!isHostedMode() || info?.type !== 'hls' || !/^https?:\/\//i.test(info.playbackUrl || '')) {
    return info;
  }

  try {
    const response = await fetch(info.playbackUrl, {
      cache: 'no-store',
      mode: 'cors'
    });
    if (!response.ok) {
      return info;
    }

    const variantUrl = selectHighestHlsVariantUrl(info.playbackUrl, await response.text());
    return variantUrl ? { ...info, playbackUrl: variantUrl } : info;
  } catch {
    return info;
  }
}

function nextPreviewSourceToken() {
  previewSourceTokenCounter += 1;
  return `${Date.now()}-${previewSourceTokenCounter}`;
}

function clearPreviewInfoCache(item) {
  previewInfoCache.delete(buildPreviewCacheKey(item));
}

function previewSupportsNativeHls(video) {
  return Boolean(
    video && typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl')
  );
}

function supportsInlinePreview() {
  return Boolean(elements.previewPlayer && (previewSupportsNativeHls(elements.previewPlayer) || window.Hls?.isSupported()));
}

function currentInlinePreviewToken(kind) {
  const stateKey = INLINE_PREVIEW_TOKEN_KEYS[kind];
  return stateKey ? state[stateKey] : 0;
}

function bumpInlinePreviewToken(kind) {
  const stateKey = INLINE_PREVIEW_TOKEN_KEYS[kind];
  if (!stateKey) {
    return 0;
  }

  state[stateKey] += 1;
  return state[stateKey];
}

function isInlinePreviewMountCurrent(kind, token, video) {
  return currentInlinePreviewToken(kind) === token && (!video || video.isConnected);
}

async function getPreviewInfo(item, options = {}) {
  const cacheKey = buildPreviewCacheKey(item);
  const { forceRefresh = false, cacheBust = '' } = options;
  const cached = forceRefresh ? null : previewInfoCache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  if (!item?.seasonId && !item?.playbackUrl && !item?.detailUrl) {
    throw new Error('このコンテンツにはページ内プレビュー用の動画情報がありません。');
  }

  if (forceRefresh) {
    previewInfoCache.delete(cacheKey);
  }

  const pending = requestJson(buildPreviewInfoUrl(item, { cacheBust, forceRefresh })).then((payload) => {
    const resolved = {
      playbackUrl: payload.playbackUrl || buildPreviewUrl(item, { cacheBust, forceRefresh }),
      type: payload.type || 'direct'
    };
    previewInfoCache.set(cacheKey, resolved);
    return resolved;
  });

  previewInfoCache.set(cacheKey, pending);
  return pending.catch((error) => {
    previewInfoCache.delete(cacheKey);
    throw error;
  });
}

function resetVideoElement(video) {
  if (!video) {
    return;
  }

  video.parentElement?.querySelectorAll('[data-preview-iframe]').forEach((iframe) => {
    iframe.remove();
  });
  video.hidden = false;
  video.style.display = '';

  try {
    video.pause();
  } catch {}

  video.removeAttribute('src');
  delete video.dataset.previewSourceToken;
  video.load();
}

function attachPreviewIframe(video, info, options = {}) {
  const { onReady } = options;
  resetVideoElement(video);
  video.hidden = true;
  video.style.display = 'none';

  const iframe = document.createElement('iframe');
  iframe.className = `${video.className || ''} preview-iframe`.trim();
  iframe.dataset.previewIframe = 'true';
  iframe.allow = 'autoplay; fullscreen; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.scrolling = 'no';
  iframe.src = info.playbackUrl;
  iframe.addEventListener(
    'load',
    () => {
      onReady?.(info);
    },
    { once: true }
  );

  video.parentElement?.appendChild(iframe);
  return info;
}

function destroyHlsPlayerInstance(player) {
  if (!player) {
    return;
  }

  try {
    player.stopLoad?.();
    player.detachMedia?.();
    player.destroy();
  } catch {}
}

function destroyPreviewHlsPlayer() {
  if (!state.previewHlsPlayer) {
    return;
  }

  destroyHlsPlayerInstance(state.previewHlsPlayer);
  state.previewHlsPlayer = null;
}

function destroyFavoritePreviewPlayers() {
  bumpInlinePreviewToken('favorites');
  for (const player of state.favoritePreviewPlayers.values()) {
    destroyHlsPlayerInstance(player);
  }
  state.favoritePreviewPlayers.clear();
  state.renderCache.favorites = '';

  elements.favoritesContent?.querySelectorAll('[data-inline-preview-video]').forEach((video) => {
    resetVideoElement(video);
    delete video.dataset.previewBound;
  });
}

function destroyDashboardPreviewPlayers() {
  bumpInlinePreviewToken('dashboard');
  for (const player of state.dashboardPreviewPlayers.values()) {
    destroyHlsPlayerInstance(player);
  }
  state.dashboardPreviewPlayers.clear();
  state.renderCache.dashboardRanking = '';

  elements.dashboardRanking?.querySelectorAll('[data-inline-preview-video]').forEach((video) => {
    resetVideoElement(video);
    delete video.dataset.previewBound;
  });
}

function destroySearchPreviewPlayers() {
  bumpInlinePreviewToken('search');
  for (const player of state.searchPreviewPlayers.values()) {
    destroyHlsPlayerInstance(player);
  }
  state.searchPreviewPlayers.clear();
  state.renderCache.searchResults = '';

  elements.searchResults?.querySelectorAll('[data-inline-preview-video]').forEach((video) => {
    resetVideoElement(video);
    delete video.dataset.previewBound;
  });
}

function ensureInlinePreviewAudioFocus(keys) {
  const availableKeys = (keys || []).filter(Boolean);
  if (!availableKeys.length) {
    state.activeInlinePreviewAudioKey = '';
    return;
  }

  if (!availableKeys.includes(state.activeInlinePreviewAudioKey)) {
    [state.activeInlinePreviewAudioKey] = availableKeys;
  }
}

function syncInlinePreviewCardAudio(card) {
  const key = card.dataset.inlinePreviewCardKey;
  const video = card.querySelector('[data-inline-preview-video]');
  const isActive = Boolean(key && key === state.activeInlinePreviewAudioKey);
  card.classList.toggle('inline-preview-card-active-audio', isActive);
  if (!video) {
    return;
  }

  const canEnableAudio = isActive && !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  video.muted = !canEnableAudio;
  video.defaultMuted = !canEnableAudio;
}

function applyInlinePreviewAudioFocus() {
  const previewCards = [...document.querySelectorAll('[data-inline-preview-card-key]')];
  const visibleKeys = previewCards.map((card) => card.dataset.inlinePreviewCardKey).filter(Boolean);
  ensureInlinePreviewAudioFocus(visibleKeys);

  previewCards.forEach(syncInlinePreviewCardAudio);
}

function scheduleInlinePreviewAudioFocusSync(repeatCount = 2) {
  const repeat = Math.max(1, Number(repeatCount) || 1);
  window.requestAnimationFrame(() => {
    applyInlinePreviewAudioFocus();
    if (repeat > 1) {
      window.setTimeout(() => scheduleInlinePreviewAudioFocusSync(repeat - 1), 150);
    }
  });
}

function bindInlinePreviewAudioFocus(container) {
  container.querySelectorAll('[data-inline-preview-card-key]').forEach((card) => {
    if (card.dataset.inlinePreviewAudioBound === 'true') {
      return;
    }
    card.dataset.inlinePreviewAudioBound = 'true';
    const activate = () => {
      const key = card.dataset.inlinePreviewCardKey;
      if (!key) {
        return;
      }

      state.activeInlinePreviewAudioKey = key;
      applyInlinePreviewAudioFocus();
    };

    card.addEventListener('pointerdown', activate);
    card.addEventListener('click', activate);
    const video = card.querySelector('[data-inline-preview-video]');
    if (video) {
      const enforceFocus = () => scheduleInlinePreviewAudioFocusSync(2);
      const enforceMutedForInactiveCard = () => {
        const key = card.dataset.inlinePreviewCardKey;
        if (key && key !== state.activeInlinePreviewAudioKey && !video.muted) {
          video.muted = true;
          video.defaultMuted = true;
        }
      };
      video.addEventListener('play', activate);
      video.addEventListener('playing', enforceFocus);
      video.addEventListener('loadeddata', enforceFocus);
      video.addEventListener('canplay', enforceFocus);
      video.addEventListener('volumechange', enforceMutedForInactiveCard);
    }
  });

  scheduleInlinePreviewAudioFocusSync(3);
}

async function attachPreviewSource(video, item, options = {}) {
  if (!video) {
    throw new Error('プレビュー用の video 要素が見つかりません。');
  }

  const {
    autoplay = false,
    cacheBust = nextPreviewSourceToken(),
    forceRefresh = false,
    muted = false,
    onAutoplayBlocked,
    onError,
    onReady,
    playerKey = '',
    playerStore = null,
    retryCount = 0,
    shouldContinue = () => true
  } = options;
  if (!shouldContinue()) {
    return null;
  }

  let info;
  try {
    info = await getPreviewInfo(item, { cacheBust, forceRefresh });
    info = await preferHighestHlsVariant(info);
  } catch (error) {
    if (retryCount <= 0 || !shouldContinue()) {
      throw error;
    }

    clearPreviewInfoCache(item);
    return attachPreviewSource(video, item, {
      ...options,
      cacheBust: nextPreviewSourceToken(),
      forceRefresh: true,
      retryCount: retryCount - 1
    });
  }

  if (!shouldContinue()) {
    return null;
  }

  const useNativeHls = previewSupportsNativeHls(video);
  const activeStore = playerStore || null;

  if (activeStore && playerKey && activeStore.has(playerKey)) {
    destroyHlsPlayerInstance(activeStore.get(playerKey));
    activeStore.delete(playerKey);
  }

  if (!activeStore) {
    destroyPreviewHlsPlayer();
  }

  if (!shouldContinue()) {
    return null;
  }

  resetVideoElement(video);
  video.muted = Boolean(muted);
  video.defaultMuted = Boolean(muted);
  const sourceToken = nextPreviewSourceToken();
  video.dataset.previewSourceToken = sourceToken;
  const isCurrentSource = () => shouldContinue() && video.dataset.previewSourceToken === sourceToken;
  const retryWithFreshSource = (error) => {
    if (!isCurrentSource()) {
      return;
    }

    if (retryCount <= 0) {
      onError?.(error);
      return;
    }

    clearPreviewInfoCache(item);
    if (activeStore && playerKey && activeStore.has(playerKey)) {
      destroyHlsPlayerInstance(activeStore.get(playerKey));
      activeStore.delete(playerKey);
    }
    if (!activeStore) {
      destroyPreviewHlsPlayer();
    }

    attachPreviewSource(video, item, {
      ...options,
      cacheBust: nextPreviewSourceToken(),
      forceRefresh: true,
      retryCount: retryCount - 1
    }).catch((retryError) => {
      if (shouldContinue()) {
        onError?.(retryError);
      }
    });
  };

  if (info.type === 'iframe') {
    return attachPreviewIframe(video, info, {
      onReady: (readyInfo) => {
        if (isCurrentSource()) {
          onReady?.(readyInfo);
        }
      }
    });
  }

  let readyHandled = false;
  const handleReady = () => {
    if (readyHandled) {
      return;
    }

    if (!isCurrentSource()) {
      return;
    }

    readyHandled = true;
    if (autoplay) {
      video.muted = true;
      video.defaultMuted = true;
      video
        .play()
        .then(() => {
          if (isCurrentSource()) {
            onReady?.(info);
            applyInlinePreviewAudioFocus();
          }
        })
        .catch((error) => {
          onAutoplayBlocked?.(error);
        });
      return;
    }

    onReady?.(info);
  };

  video.addEventListener('loadedmetadata', handleReady, { once: true });
  video.addEventListener('loadeddata', handleReady, { once: true });
  video.addEventListener('canplay', handleReady, { once: true });
  video.addEventListener(
    'error',
    () => {
      if (isCurrentSource()) {
        retryWithFreshSource(new Error('プレビューを読み込めませんでした。'));
      }
    },
    { once: true }
  );

  if (info.type === 'hls') {
    if (useNativeHls) {
      video.src = info.playbackUrl;
      video.load();
      return info;
    }

    if (!window.Hls?.isSupported()) {
      throw new Error('このブラウザではページ内プレビューを再生できません。');
    }

    const hls = new window.Hls({
      enableWorker: true
    });

    hls.on(window.Hls.Events.MEDIA_ATTACHED, () => {
      if (isCurrentSource()) {
        hls.loadSource(info.playbackUrl);
      }
    });
    hls.on(window.Hls.Events.FRAG_BUFFERED, handleReady);
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data?.fatal && isCurrentSource()) {
        retryWithFreshSource(new Error('HLS プレビューの再生に失敗しました。'));
      }
    });
    hls.attachMedia(video);

    if (activeStore && playerKey) {
      activeStore.set(playerKey, hls);
    } else {
      state.previewHlsPlayer = hls;
    }

    return info;
  }

  video.src = info.playbackUrl;
  video.load();
  return info;
}

function rankingSectionSignature(options) {
  const items = options.items || [];
  const selectionKind = options.selectionKind || '';
  const selectedKeys = options.selectedKeys || new Set();
  return JSON.stringify({
    allowDownloadSelection: Boolean(options.allowDownloadSelection),
    afterHeaderHtmlSignature: options.afterHeaderHtmlSignature || '',
    afterItemsHtmlSignature: options.afterItemsHtmlSignature || '',
    beforeHtmlSignature: options.beforeHtmlSignature || '',
    downloadSelectionMode: state.downloadSelectionMode,
    emptyText: options.emptyText,
    eyebrow: options.eyebrow,
    footerSignature: options.footerSignature || '',
    headerAsideSignature: options.headerAsideSignature || options.statusText || '',
    previewMode: options.previewMode || 'default',
    selectionKind,
    selectionMode: Boolean(options.selectionMode),
    statusText: options.statusText,
    title: options.title,
    items: items.map((item) => {
      const key = getItemKey(item);
      const downloadKey = getDownloadKey(item);
      const selectionKey = getSelectionKey(item, selectionKind);
      return {
        actress: item.actress || '',
        favorite: isFavorite(item),
        key,
        playbackUrl: buildCardPlaybackUrl(item),
        productCode: getProductCode(item),
        previewable: options.isPreviewable
          ? Boolean(options.isPreviewable(item))
          : Boolean(item.seasonId || item.playbackUrl || item.detailUrl),
        rank: item.rank ?? '',
        seasonId: item.seasonId || '',
        selectedForDownload: state.selectedDownloadKeys.has(downloadKey),
        selectedForSelection: selectionKey ? selectedKeys.has(selectionKey) : false,
        thumbnailUrl: item.thumbnailUrl || '',
        title: item.title || ''
      };
    })
  });
}

function collectInlinePreviewCards(container) {
  const cards = new Map();
  container?.querySelectorAll('[data-inline-preview-card-key]').forEach((card) => {
    const key = card.dataset.inlinePreviewCardKey;
    if (key) {
      const video = card.querySelector('[data-inline-preview-video]');
      cards.set(key, {
        card,
        playback: video
          ? {
              currentTime: video.currentTime || 0,
              muted: video.muted,
              paused: video.paused,
              playbackRate: video.playbackRate || 1
            }
          : null
      });
    }
  });
  return cards;
}

function disposeInlinePreviewCard(card) {
  const video = card?.querySelector?.('[data-inline-preview-video]');
  if (video) {
    resetVideoElement(video);
  }
  card?.remove?.();
}

function restoreInlinePreviewCards(container, preservedCards) {
  if (!container || !preservedCards?.size) {
    return;
  }

  const restoredKeys = new Set();
  container.querySelectorAll('[data-inline-preview-card-key]').forEach((nextCard) => {
    const key = nextCard.dataset.inlinePreviewCardKey;
    const preserved = key ? preservedCards.get(key) : null;
    if (!preserved?.card) {
      return;
    }
    restoredKeys.add(key);
    nextCard.replaceWith(preserved.card);

    const video = preserved.card.querySelector('[data-inline-preview-video]');
    if (video && preserved.playback) {
      video.playbackRate = preserved.playback.playbackRate;
      video.muted = preserved.playback.muted;
      video.defaultMuted = preserved.playback.muted;
      if (!preserved.playback.paused) {
        video.play().catch(() => {});
      }
    }
  });

  preservedCards.forEach((preserved, key) => {
    if (!restoredKeys.has(key)) {
      disposeInlinePreviewCard(preserved.card);
    }
  });
}

function renderRankingSection(container, options) {
  if (!container) {
    return;
  }

  const items = options.items || [];
  const inlinePreviewAction = options.inlinePreviewAction || '';
  const inlinePreviewActive = Boolean(options.inlinePreviewActive);
  container.classList.toggle('inline-preview-active', inlinePreviewActive);
  container.classList.toggle('inline-preview-dashboard', inlinePreviewAction === 'dashboard');
  container.classList.toggle('inline-preview-search', inlinePreviewAction === 'search');
  container.classList.toggle('inline-preview-favorites', inlinePreviewAction === 'favorites');
  syncInlinePreviewLayoutState();
  const cacheKey = options.cacheKey;
  const signature = rankingSectionSignature(options);
  if (cacheKey && state.renderCache[cacheKey] === signature) {
    return;
  }

  const preservedInlinePreviewCards = collectInlinePreviewCards(container);
  options.onBeforeRender?.();

  if (cacheKey) {
    state.renderCache[cacheKey] = signature;
  }

  const headerAside = options.headerAsideHtml || `<p class="muted">${escapeHtml(options.statusText)}</p>`;
  const selectionKind = options.selectionKind || '';
  const selectionMode = Boolean(options.selectionMode);
  const selectedKeys = options.selectedKeys || new Set();

  container.innerHTML = `
    ${options.beforeHtml || ''}
    <div class="ranking-header">
      <div>
        <p class="eyebrow">${escapeHtml(options.eyebrow)}</p>
        <h2>${escapeHtml(options.title)}</h2>
      </div>
      ${headerAside}
    </div>
    ${options.afterHeaderHtml || ''}

    ${
      items.length
        ? `<div class="ranking-grid">
            ${items
              .map((item) => {
                const key = getItemKey(item);
                const selectionKey = getSelectionKey(item, selectionKind);
                const playbackUrl = buildCardPlaybackUrl(item);
                const productCode = getProductCode(item);
                const hasPreview = options.isPreviewable
                  ? Boolean(options.isPreviewable(item))
                  : Boolean(item.seasonId || item.playbackUrl || item.detailUrl);
                const favorite = isFavorite(item);
                const selectable = Boolean(
                  selectionMode &&
                    selectionKey &&
                    (!options.isSelectable || options.isSelectable(item))
                );
                const selectedForSelection = selectionKey ? selectedKeys.has(selectionKey) : false;
                const selectionAttrs = selectable
                  ? `data-card-selection-kind="${escapeHtml(selectionKind)}" data-card-selection-key="${escapeHtml(selectionKey)}"`
                  : '';
                const rankControl = selectable
                  ? `<label class="ranking-card-select ${selectedForSelection ? 'active' : ''}" title="選択">
                      <input
                        type="checkbox"
                        data-card-select-kind="${escapeHtml(selectionKind)}"
                        data-card-select-key="${escapeHtml(selectionKey)}"
                        aria-label="${escapeHtml(item.title || '動画')}を選択"
                        ${selectedForSelection ? 'checked' : ''}
                      />
                      <span aria-hidden="true"></span>
                    </label>`
                  : `<span class="ranking-card-rank">${escapeHtml(item.rank ?? '')}</span>`;
                const thumbnail = item.thumbnailUrl
                  ? `<a
                      class="ranking-card-image-link ${selectable ? 'ranking-card-image-link-selectable' : ''}"
                      href="${escapeHtml(playbackUrl)}"
                      target="_blank"
                      rel="noreferrer"
                      ${selectionAttrs}
                    >
                      <img
                        class="ranking-card-image"
                        src="${escapeHtml(item.thumbnailUrl)}"
                        ${item.thumbnailFallbackUrl ? `data-fallback-src="${escapeHtml(item.thumbnailFallbackUrl)}" onerror="if (this.dataset.fallbackSrc && this.src !== this.dataset.fallbackSrc) { this.src = this.dataset.fallbackSrc; this.removeAttribute('data-fallback-src'); }"` : ''}
                        alt="${escapeHtml(item.title)}"
                        decoding="async"
                        loading="lazy"
                      />
                    </a>`
                  : `<a
                      class="ranking-card-image-link ranking-card-image-empty ${selectable ? 'ranking-card-image-link-selectable' : ''}"
                      href="${escapeHtml(playbackUrl)}"
                      target="_blank"
                      rel="noreferrer"
                      ${selectionAttrs}
                    >
                      No Image
                    </a>`;

                return `
                  <article class="ranking-card">
                    ${rankControl}
                    <button
                      class="favorite-button ${favorite ? 'active' : ''}"
                      type="button"
                      data-favorite-key="${escapeHtml(key)}"
                      aria-label="${escapeHtml(item.title || '作品')}をお気に入り${favorite ? 'から外す' : 'に追加'}"
                      aria-pressed="${favorite ? 'true' : 'false'}"
                      title="お気に入り"
                    >
                      <span aria-hidden="true">${favorite ? '★' : '☆'}</span>
                    </button>
                    ${thumbnail}
                    <div class="ranking-card-meta">
                      <p class="ranking-card-title">${escapeHtml(item.title || '-')}</p>
                      <p class="ranking-card-code">${escapeHtml(productCode || '-')}</p>
                      <div class="ranking-card-subrow">
                        <p class="ranking-card-actress">${escapeHtml(item.actress || '-')}</p>
                        <div class="ranking-card-actions">
                          <button
                            class="thumbnail-button"
                            type="button"
                            data-thumbnail-key="${escapeHtml(key)}"
                            ${item.thumbnailUrl ? '' : 'disabled'}
                            title="サムネイル表示"
                          >
                            サムネイル
                          </button>
                          <button class="watch-button" type="button" data-preview-key="${escapeHtml(key)}" title="再生" ${hasPreview ? '' : 'disabled'}>
                            <span aria-hidden="true">▶</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                `;
              })
              .join('')}
          </div>`
        : `<div class="empty-state">${escapeHtml(options.emptyText)}</div>`
    }
    ${options.afterItemsHtml || ''}
    ${options.footerHtml || ''}
  `;

  restoreInlinePreviewCards(container, preservedInlinePreviewCards);
  bindRankingCardActions(container, items, options);
  options.onAfterRender?.();
}

function bindRankingCardActions(container, items, options = {}) {
  const itemMap = new Map(items.map((item) => [getItemKey(item), item]));

  container.querySelectorAll('[data-card-select-key]').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.cardSelectKey;
      const kind = checkbox.dataset.cardSelectKind;
      if (kind === 'download') {
        toggleDownloadSelection(key, checkbox.checked);
      }
      if (kind === 'favorite') {
        toggleFavoriteSelection(key, checkbox.checked);
      }
      if (kind === 'search') {
        toggleSearchSelection(key, checkbox.checked);
      }
      checkbox.closest('.ranking-card-select')?.classList.toggle('active', checkbox.checked);
    });
  });

  container.querySelectorAll('[data-card-selection-key]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const kind = link.dataset.cardSelectionKind;
      if (!options.selectionMode || !['download', 'favorite', 'search'].includes(kind)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (kind === 'download') {
        const selectionKey = link.dataset.cardSelectionKey;
        const nextSelected = !state.selectedDownloadKeys.has(selectionKey);
        toggleDownloadSelection(selectionKey, nextSelected);
        const checkbox = container.querySelector(`[data-card-select-key="${CSS.escape(selectionKey)}"]`);
        if (checkbox) {
          checkbox.checked = nextSelected;
          checkbox.closest('.ranking-card-select')?.classList.toggle('active', nextSelected);
        }
      }
      if (kind === 'favorite') {
        toggleFavoriteSelection(link.dataset.cardSelectionKey);
      }
      if (kind === 'search') {
        toggleSearchSelection(link.dataset.cardSelectionKey);
      }
    });
  });

  container.querySelectorAll('[data-favorite-key]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.favoriteKey;
      const item = itemMap.get(key) || state.favorites[key];
      if (item) {
        toggleFavorite(item);
      }
    });
  });

  container.querySelectorAll('[data-thumbnail-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.thumbnailKey;
      const item = itemMap.get(key) || state.favorites[key];
      if (item?.thumbnailUrl) {
        openThumbnailModal(item);
      }
    });
  });

  container.querySelectorAll('[data-preview-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.previewKey;
      const item = itemMap.get(key) || state.favorites[key];
      if (!item) {
        return;
      }
      const selectedKeys = [...(options.selectedKeys || new Set())].filter(Boolean);
      const shouldPlaySelection = Boolean(options.selectionMode && selectedKeys.length);

      if (options.previewMode === 'favorite-inline' && canUseInlinePreviewExperience()) {
        openFavoriteInlinePreviews(shouldPlaySelection ? selectedKeys : [key]);
        return;
      }

      if (options.previewMode === 'dashboard-inline' && canUseInlinePreviewExperience()) {
        openDashboardInlinePreviews(shouldPlaySelection ? selectedKeys : [getDownloadKey(item)]);
        return;
      }

      if (options.previewMode === 'search-inline' && canUseInlinePreviewExperience()) {
        openSearchInlinePreviews(shouldPlaySelection ? selectedKeys : [key]);
        return;
      }

      if (!supportsInlinePreview()) {
        window.open(buildCardPlaybackUrl(item), '_blank', 'noopener,noreferrer');
        return;
      }

      openPreviewModal(item);
    });
  });
}

function renderDashboardRanking() {
  if (!canUseInlinePreviewExperience()) {
    destroyDashboardPreviewPlayers();
    state.activeDashboardPreviewKeys = [];
  }

  const rankingItems = currentRankingItems();
  cacheRankingItems(rankingItems);
  const itemMap = new Map([
    ...state.activeDashboardPreviewItems,
    ...rankingItems.map((item) => [getItemKey(item), item])
  ]);
  const activePreviewItems = state.activeDashboardPreviewKeys.map((key) => itemMap.get(key)).filter(Boolean);
  const displayItems = rankingItems.length ? rankingItems : activePreviewItems;
  const showBrowserControls = canUseInlinePreviewExperience();
  const allowInlinePlayback = showBrowserControls && state.tab === 'dashboard';
  const selectedCount = state.selectedDownloadKeys.size;
  const statusText = displayItems.length ? `${displayItems.length}件を読み込み済み` : 'ランキング取得を実行するとここに表示されます。';
  const headerAsideHtml = showBrowserControls
    ? `
        <div class="ranking-header-actions">
          <button
            type="button"
            class="header-command-button ${state.downloadSelectionMode ? 'active' : ''}"
            data-dashboard-selection-toggle
            aria-pressed="${state.downloadSelectionMode ? 'true' : 'false'}"
          >
            ${state.downloadSelectionMode ? (selectedCount ? `選択中 ${selectedCount}` : '選択中') : '複数選択'}
          </button>
          <button
            type="button"
            class="icon-button favorite-header-play-button"
            data-dashboard-selection-play
            title="選択した動画を同時再生"
            aria-label="選択した動画を同時再生"
            ${selectedCount ? '' : 'disabled'}
          >
            <span aria-hidden="true">&#9654;</span>
          </button>
          <p class="muted">${escapeHtml(statusText)}</p>
        </div>
      `
    : `<p class="muted">${escapeHtml(statusText)}</p>`;

  renderRankingSection(elements.dashboardRanking, {
    cacheKey: 'dashboardRanking',
    emptyText: 'ランキングデータはまだありません。',
    eyebrow: '最新ランキング',
    footerHtml:
      allowInlinePlayback && activePreviewItems.length
        ? renderInlinePreviewSection(activePreviewItems, {
            closeAction: 'dashboard',
            heading: 'ダウンロード候補内で再生',
            selectedCount,
            selectionAction: 'dashboard',
            selectionMode: state.downloadSelectionMode,
            showFavoriteToggle: true
          })
        : '',
    footerSignature: allowInlinePlayback ? activePreviewItems.map(getItemKey).join(',') : '',
    headerAsideHtml,
    headerAsideSignature: JSON.stringify({
      activePreviewCount: activePreviewItems.length,
      allowInlinePlayback,
      selectedCount,
      selectionMode: state.downloadSelectionMode,
      statusText
    }),
    inlinePreviewAction: 'dashboard',
    inlinePreviewActive: allowInlinePlayback && activePreviewItems.length > 0,
    items: displayItems,
    onAfterRender: () => {
      elements.dashboardRanking?.querySelectorAll('[data-dashboard-selection-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
          toggleDownloadSelectionMode();
        });
      });
      elements.dashboardRanking?.querySelectorAll('[data-dashboard-selection-play]').forEach((button) => {
        button.addEventListener('click', () => {
          openDashboardInlinePreviews([...state.selectedDownloadKeys]);
        });
      });
      elements.dashboardRanking?.querySelector('[data-inline-preview-close="dashboard"]')?.addEventListener('click', () => {
        closeDashboardInlinePreviews();
      });
      bindInlinePreviewRemoveControls(elements.dashboardRanking);
      if (allowInlinePlayback && activePreviewItems.length) {
        const mountToken = currentInlinePreviewToken('dashboard');
        queueMicrotask(() => {
          mountDashboardInlinePreviews(activePreviewItems, mountToken).catch((error) => {
            showMessage(error.message, 'error');
          });
        });
      }
    },
    onBeforeRender: allowInlinePlayback && !activePreviewItems.length ? destroyDashboardPreviewPlayers : undefined,
    previewMode: allowInlinePlayback ? 'dashboard-inline' : 'default',
    selectionKind: 'download',
    selectionMode: state.downloadSelectionMode,
    selectedKeys: state.selectedDownloadKeys,
    statusText,
    title: 'ダウンロード候補'
  });
}

function renderSearchFilterControls() {
  const filters = state.searchFilters;
  return `
    <div class="search-filter-controls" aria-label="検索結果フィルター">
      <button
        type="button"
        class="header-command-button filter-toggle-button ${filters.castType === 'single' ? 'active' : ''}"
        data-search-cast-filter="single"
        aria-pressed="${filters.castType === 'single' ? 'true' : 'false'}"
      >
        単体
      </button>
      <button
        type="button"
        class="header-command-button filter-toggle-button ${filters.castType === 'multi' ? 'active' : ''}"
        data-search-cast-filter="multi"
        aria-pressed="${filters.castType === 'multi' ? 'true' : 'false'}"
      >
        企画
      </button>
      <button
        type="button"
        class="header-command-button filter-toggle-button ${filters.dateSort === 'asc' ? 'active' : ''}"
        data-search-date-sort="asc"
        aria-pressed="${filters.dateSort === 'asc' ? 'true' : 'false'}"
      >
        日付↑
      </button>
      <button
        type="button"
        class="header-command-button filter-toggle-button ${filters.dateSort === 'desc' ? 'active' : ''}"
        data-search-date-sort="desc"
        aria-pressed="${filters.dateSort === 'desc' ? 'true' : 'false'}"
      >
        日付↓
      </button>
      <button
        type="button"
        class="header-command-button filter-toggle-button danger-outline"
        data-search-filters-reset
        ${areSearchFiltersActive() ? '' : 'disabled'}
      >
        OFF
      </button>
    </div>
  `;
}

function bindSearchFilterControls(root = document) {
  root.querySelectorAll('[data-search-cast-filter]').forEach((button) => {
    button.addEventListener('click', () => setSearchCastFilter(button.dataset.searchCastFilter));
  });
  root.querySelectorAll('[data-search-date-sort]').forEach((button) => {
    button.addEventListener('click', () => setSearchDateSort(button.dataset.searchDateSort));
  });
  root.querySelectorAll('[data-search-filters-reset]').forEach((button) => {
    button.addEventListener('click', resetSearchFilters);
  });
}

function searchPaginationPages(currentPage, pageCount) {
  const pages = new Set([1, pageCount]);
  const leadingEnd = Math.min(5, pageCount);
  for (let page = 2; page <= leadingEnd; page += 1) {
    pages.add(page);
  }
  const windowStart = Math.max(1, currentPage - 2);
  const windowEnd = Math.min(pageCount, currentPage + 2);
  for (let page = windowStart; page <= windowEnd; page += 1) {
    pages.add(page);
  }

  const sortedPages = [...pages].sort((left, right) => left - right);
  const parts = [];
  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (index && page - previousPage > 1) {
      parts.push('ellipsis');
    }
    parts.push(page);
  });
  return parts;
}

function renderSearchPagingControls(filteredCount, position = 'top') {
  if (!filteredCount) {
    return '';
  }

  const pageSize = searchDisplayPageSize();
  const pageCount = getSearchPageCount(filteredCount);
  const currentPage = clampSearchPage(filteredCount);
  const startCount = (currentPage - 1) * pageSize + 1;
  const endCount = Math.min(filteredCount, currentPage * pageSize);
  const sizeOptions = SEARCH_DISPLAY_PAGE_SIZE_OPTIONS.map((option) => {
    return `<option value="${option}" ${option === pageSize ? 'selected' : ''}>${option}</option>`;
  }).join('');
  const paginationHtml =
    pageCount > 1
      ? `
          <div class="search-pagination-controls" aria-label="検索結果ページ">
            <button
              type="button"
              class="search-page-button"
              data-search-page="${currentPage - 1}"
              aria-label="前のページ"
              ${currentPage <= 1 ? 'disabled' : ''}
            >
              &lsaquo;
            </button>
            ${searchPaginationPages(currentPage, pageCount)
              .map((page) => {
                if (page === 'ellipsis') {
                  return '<span class="search-page-ellipsis" aria-hidden="true">...</span>';
                }
                return `
                  <button
                    type="button"
                    class="search-page-button ${page === currentPage ? 'active' : ''}"
                    data-search-page="${page}"
                    aria-current="${page === currentPage ? 'page' : 'false'}"
                  >
                    ${page}
                  </button>
                `;
              })
              .join('')}
            <button
              type="button"
              class="search-page-button"
              data-search-page="${currentPage + 1}"
              aria-label="次のページ"
              ${currentPage >= pageCount ? 'disabled' : ''}
            >
              &rsaquo;
            </button>
          </div>
        `
      : '';

  return `
    <div class="search-pagination-bar search-pagination-bar-${escapeHtml(position)}">
      <label class="search-page-size-control">
        <span>表示件数</span>
        <select class="search-page-size-select" data-search-display-page-size>
          ${sizeOptions}
        </select>
      </label>
      <p class="search-page-status">${startCount}-${endCount} / ${filteredCount}件</p>
      ${paginationHtml}
    </div>
  `;
}

function bindSearchPagingControls(root = document) {
  root.querySelectorAll('[data-search-display-page-size]').forEach((select) => {
    select.addEventListener('change', () => setSearchDisplayPageSize(select.value));
  });
  root.querySelectorAll('[data-search-page]').forEach((button) => {
    button.addEventListener('click', () => setSearchPage(button.dataset.searchPage));
  });
}

function renderSearchResults() {
  if (!elements.searchResults) {
    return;
  }

  if (!canUseInlinePreviewExperience()) {
    state.searchSelectionMode = false;
    state.selectedSearchKeys.clear();
    destroySearchPreviewPlayers();
    state.activeSearchPreviewKeys = [];
  }

  pruneSearchSelection();
  pruneSearchPreviewKeys();

  const search = state.search;
  const totalSearchItems = currentSearchItems();
  const filteredSearchItems = visibleSearchItems();
  const currentPage = clampSearchPage(filteredSearchItems);
  const pageSize = searchDisplayPageSize();
  const pageCount = getSearchPageCount(filteredSearchItems);
  const searchItems = paginatedSearchItems(filteredSearchItems);
  const startCount = filteredSearchItems.length ? (currentPage - 1) * pageSize + 1 : 0;
  const endCount = filteredSearchItems.length ? Math.min(filteredSearchItems.length, currentPage * pageSize) : 0;
  const itemMap = new Map(filteredSearchItems.map((item) => [getItemKey(item), item]));
  const activePreviewItems = state.activeSearchPreviewKeys.map((key) => itemMap.get(key)).filter(Boolean);
  const showBrowserControls = canUseInlinePreviewExperience();
  const allowInlinePlayback = showBrowserControls && state.tab === 'search';
  const selectedCount = state.selectedSearchKeys.size;
  const statusText = search.loading
    ? `${searchProviderLabel(search.provider)}検索を実行中です。`
    : search.error
      ? search.error
      : filteredSearchItems.length
        ? `${searchProviderLabel(search.provider)} ${startCount}-${endCount}件を表示中${
            pageCount > 1 ? ` / ${pageCount}ページ中${currentPage}ページ` : ''
          }${
            totalSearchItems.length !== filteredSearchItems.length ? ` / 絞り込み前${totalSearchItems.length}件` : search.total ? ` / 全${search.total}件` : ''
          }${search.backgroundLoading ? ' / 追加取得中' : search.backgroundError ? ` / ${search.backgroundError}` : ''}`
        : totalSearchItems.length && areSearchFiltersActive()
          ? `${searchProviderLabel(search.provider)} 0件を表示中 / 絞り込み前${totalSearchItems.length}件`
          : 'ヘッダーの検索フォームから女優名または商品名を入力してください。';
  const headerAsideHtml = showBrowserControls
    ? `
        <div class="ranking-header-actions">
          ${renderSearchFilterControls()}
          <button
            type="button"
            class="header-command-button ${state.searchSelectionMode ? 'active' : ''}"
            data-search-selection-toggle
            aria-pressed="${state.searchSelectionMode ? 'true' : 'false'}"
          >
            ${state.searchSelectionMode ? (selectedCount ? `選択中 ${selectedCount}` : '選択中') : '複数選択'}
          </button>
          <button
            type="button"
            class="icon-button favorite-header-play-button"
            data-search-selection-play
            title="選択した動画を同時再生"
            aria-label="選択した動画を同時再生"
            ${selectedCount ? '' : 'disabled'}
          >
            <span aria-hidden="true">&#9654;</span>
          </button>
          <p class="muted">${escapeHtml(statusText)}</p>
        </div>
      `
    : `<p class="muted">${escapeHtml(statusText)}</p>`;
  const mobileSearchFormHtml = `
    <div class="search-mobile-panel">
      ${renderActressSearchForm({
        extraClass: 'search-mobile-form',
        idPrefix: 'mobile'
      })}
    </div>
  `;
  const topSearchPagingHtml = renderSearchPagingControls(filteredSearchItems.length, 'top');
  const bottomSearchPagingHtml = renderSearchPagingControls(filteredSearchItems.length, 'bottom');
  const focusSnapshot = captureActressSearchFocus(elements.searchResults);

  renderRankingSection(elements.searchResults, {
    afterHeaderHtml: topSearchPagingHtml,
    afterHeaderHtmlSignature: JSON.stringify({
      currentPage,
      filteredCount: filteredSearchItems.length,
      pageCount,
      pageSize,
      position: 'top'
    }),
    afterItemsHtml: bottomSearchPagingHtml,
    afterItemsHtmlSignature: JSON.stringify({
      currentPage,
      filteredCount: filteredSearchItems.length,
      pageCount,
      pageSize,
      position: 'bottom'
    }),
    beforeHtml: mobileSearchFormHtml,
    beforeHtmlSignature: JSON.stringify({
      loading: search.loading,
      provider: search.provider,
      query: search.query
    }),
    cacheKey: 'searchResults',
    emptyText: search.query
      ? areSearchFiltersActive()
        ? 'フィルター条件に合うコンテンツは見つかりませんでした。'
        : '該当するコンテンツは見つかりませんでした。'
      : '検索語を入力してください。',
    eyebrow: `${searchProviderLabel(search.provider)}検索`,
    footerHtml:
      allowInlinePlayback && activePreviewItems.length
        ? renderInlinePreviewSection(activePreviewItems, {
            closeAction: 'search',
            heading: '検索結果内で再生',
            selectedCount,
            selectionAction: 'search',
            selectionMode: state.searchSelectionMode,
            showFavoriteToggle: true
          })
        : '',
    footerSignature: allowInlinePlayback ? activePreviewItems.map(getItemKey).join(',') : '',
    headerAsideHtml,
    headerAsideSignature: JSON.stringify({
      activePreviewCount: activePreviewItems.length,
      backgroundError: search.backgroundError,
      backgroundLoading: search.backgroundLoading,
      error: search.error,
      fetchedAt: search.fetchedAt,
      hasMore: search.hasMore,
      loading: search.loading,
      pagesFetched: search.pagesFetched,
      provider: search.provider,
      query: search.query,
      selectedCount,
      selectionMode: state.searchSelectionMode,
      showBrowserControls,
      statusText,
      filters: state.searchFilters,
      currentPage,
      filteredSearchItems: filteredSearchItems.length,
      pageCount,
      pageSize,
      totalSearchItems: totalSearchItems.length,
      total: search.total
    }),
    inlinePreviewAction: 'search',
    inlinePreviewActive: allowInlinePlayback && activePreviewItems.length > 0,
    isPreviewable: isSearchPreviewable,
    isSelectable: isSearchPreviewable,
    items: searchItems,
    onAfterRender: () => {
      bindActressSearchForms(elements.searchResults);
      bindSearchFilterControls(elements.searchResults);
      bindSearchPagingControls(elements.searchResults);
      restoreActressSearchFocus(focusSnapshot);
      elements.searchResults?.querySelectorAll('[data-search-selection-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
          toggleSearchSelectionMode();
        });
      });
      elements.searchResults?.querySelectorAll('[data-search-selection-play]').forEach((button) => {
        button.addEventListener('click', () => {
          openSearchInlinePreviews([...state.selectedSearchKeys]);
        });
      });
      elements.searchResults?.querySelector('[data-inline-preview-close="search"]')?.addEventListener('click', () => {
        closeSearchInlinePreviews();
      });
      bindInlinePreviewRemoveControls(elements.searchResults);
      if (allowInlinePlayback && activePreviewItems.length) {
        const mountToken = currentInlinePreviewToken('search');
        queueMicrotask(() => {
          mountSearchInlinePreviews(activePreviewItems, mountToken).catch((error) => {
            showMessage(error.message, 'error');
          });
        });
      }
    },
    onBeforeRender: allowInlinePlayback && !activePreviewItems.length ? destroySearchPreviewPlayers : undefined,
    previewMode: allowInlinePlayback ? 'search-inline' : 'default',
    selectionKind: showBrowserControls ? 'search' : '',
    selectionMode: showBrowserControls && state.searchSelectionMode,
    selectedKeys: state.selectedSearchKeys,
    statusText,
    title: search.query ? `${search.query} のコンテンツ` : '女優名・商品名検索'
  });
}

function renderInlinePreviewSelectionControls(options = {}) {
  const { selectionAction = '', selectionMode = false, selectedCount = 0 } = options;
  const actionAttributes = {
    dashboard: {
      play: 'data-dashboard-selection-play',
      toggle: 'data-dashboard-selection-toggle'
    },
    favorites: {
      play: 'data-favorite-selection-play',
      toggle: 'data-favorite-selection-toggle'
    },
    search: {
      play: 'data-search-selection-play',
      toggle: 'data-search-selection-toggle'
    }
  }[selectionAction];

  if (!actionAttributes) {
    return '';
  }

  return `
    <button
      type="button"
      class="header-command-button inline-selection-toggle ${selectionMode ? 'active' : ''}"
      ${actionAttributes.toggle}
      aria-pressed="${selectionMode ? 'true' : 'false'}"
    >
      ${selectionMode ? (selectedCount ? `選択中 ${selectedCount}` : '選択中') : '複数選択'}
    </button>
    <button
      type="button"
      class="icon-button favorite-header-play-button inline-selection-play-button"
      ${actionAttributes.play}
      title="選択した動画を同時再生"
      aria-label="選択した動画を同時再生"
      ${selectedCount ? '' : 'disabled'}
    >
      <span aria-hidden="true">&#9654;</span>
    </button>
  `;
}

function renderInlinePreviewSection(items, options = {}) {
  const multiple = items.length > 1;
  const {
    closeAction = '',
    heading = 'ブックマーク内で再生',
    selectedCount = 0,
    selectionAction = '',
    selectionMode = false,
    showFavoriteToggle = false
  } = options;
  const selectionControlsHtml = renderInlinePreviewSelectionControls({
    selectedCount,
    selectionAction,
    selectionMode
  });
  return `
    <section class="favorite-preview-section">
      <div class="favorite-preview-header">
        <div>
          <p class="eyebrow">同時再生</p>
          <h3>${escapeHtml(heading)}</h3>
        </div>
        <div class="favorite-preview-header-actions">
          ${selectionControlsHtml}
          <button type="button" class="ghost-button favorite-preview-close-button" data-inline-preview-close="${escapeHtml(closeAction)}">
            閉じる
          </button>
        </div>
      </div>
      <div class="favorite-preview-grid ${multiple ? 'favorite-preview-grid-multi' : 'favorite-preview-grid-single'}">
        ${items
          .map((item) => {
            const key = getItemKey(item);
            const favorite = isFavorite(item);
            const productCode = getProductCode(item);
            return `
              <article class="favorite-preview-card" data-inline-preview-card-key="${escapeHtml(key)}">
                <button
                  type="button"
                  class="favorite-preview-remove-button"
                  data-inline-preview-remove="${escapeHtml(closeAction)}"
                  data-inline-preview-remove-key="${escapeHtml(key)}"
                  aria-label="${escapeHtml(item.title || '動画')}を再生対象から外す"
                  title="再生対象から外す"
                >
                  &times;
                </button>
                <div class="favorite-preview-player-wrap">
                  <video
                    class="favorite-preview-video"
                    controls
                    playsinline
                    preload="metadata"
                    data-inline-preview-video
                    data-inline-preview-key="${escapeHtml(key)}"
                  ></video>
                </div>
                <div class="favorite-preview-meta">
                  <p class="favorite-preview-status" data-inline-preview-status="${escapeHtml(key)}">読み込み中</p>
                  <div class="favorite-preview-title-row">
                    <p class="favorite-preview-title">
                      <span class="favorite-preview-product-code">${escapeHtml(productCode || '-')}</span>
                      <span class="favorite-preview-actress-name">${escapeHtml(item.actress || '-')}</span>
                      <span class="favorite-preview-title-text">${escapeHtml(item.title || '-')}</span>
                    </p>
                    ${
                      showFavoriteToggle
                        ? `<button
                            type="button"
                            class="favorite-preview-bookmark-button ${favorite ? 'active' : ''}"
                            data-inline-preview-favorite="${escapeHtml(key)}"
                            aria-label="${escapeHtml(item.title || '動画')}をお気に入りに追加または解除"
                            aria-pressed="${favorite ? 'true' : 'false'}"
                            title="お気に入り"
                          >
                            <span aria-hidden="true">${favorite ? '★' : '☆'}</span>
                          </button>`
                        : ''
                    }
                  </div>
                  <p class="favorite-preview-code">${escapeHtml(productCode || '-')}</p>
                  <p class="favorite-preview-subtitle">${escapeHtml(item.actress || '-')}</p>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function destroyInlinePreviewPlayer(playerStore, key) {
  const player = playerStore?.get?.(key);
  if (player) {
    destroyHlsPlayerInstance(player);
    playerStore.delete(key);
  }
}

function removeInlinePreviewCardElement(container, key, playerStore) {
  if (!container || !key) {
    return false;
  }

  const card = container.querySelector(`[data-inline-preview-card-key="${CSS.escape(key)}"]`);
  if (!card) {
    return false;
  }

  destroyInlinePreviewPlayer(playerStore, key);
  disposeInlinePreviewCard(card);

  const remainingCards = [...container.querySelectorAll('[data-inline-preview-card-key]')];
  const grid = container.querySelector('.favorite-preview-grid');
  if (grid) {
    grid.classList.toggle('favorite-preview-grid-single', remainingCards.length <= 1);
    grid.classList.toggle('favorite-preview-grid-multi', remainingCards.length > 1);
  }
  scheduleInlinePreviewAudioFocusSync(2);
  return true;
}

function removeDashboardInlinePreview(key) {
  if (!key) {
    return;
  }

  const item = currentRankingItems().find((entry) => getItemKey(entry) === key);
  state.activeDashboardPreviewKeys = state.activeDashboardPreviewKeys.filter((entryKey) => entryKey !== key);
  state.activeDashboardPreviewItems.delete(key);
  if (item) {
    state.selectedDownloadKeys.delete(getDownloadKey(item));
  }
  if (state.activeInlinePreviewAudioKey === key) {
    state.activeInlinePreviewAudioKey = state.activeDashboardPreviewKeys[0] || '';
  }
  if (!state.activeDashboardPreviewKeys.length) {
    closeDashboardInlinePreviews();
    syncDashboardSelectionControls();
    return;
  }
  if (!removeInlinePreviewCardElement(elements.dashboardRanking, key, state.dashboardPreviewPlayers)) {
    renderDashboardRanking();
  }
  syncDashboardSelectionControls();
}

function removeFavoriteInlinePreview(key) {
  if (!key) {
    return;
  }

  state.activeFavoritePreviewKeys = state.activeFavoritePreviewKeys.filter((entryKey) => entryKey !== key);
  state.selectedFavoriteKeys.delete(key);
  if (state.activeInlinePreviewAudioKey === key) {
    state.activeInlinePreviewAudioKey = state.activeFavoritePreviewKeys[0] || '';
  }
  if (!state.activeFavoritePreviewKeys.length) {
    closeFavoriteInlinePreviews();
    syncFavoriteSelectionControls();
    return;
  }
  if (!removeInlinePreviewCardElement(elements.favoritesContent, key, state.favoritePreviewPlayers)) {
    renderFavorites();
  }
  syncFavoriteSelectionControls();
}

function removeSearchInlinePreview(key) {
  if (!key) {
    return;
  }

  state.activeSearchPreviewKeys = state.activeSearchPreviewKeys.filter((entryKey) => entryKey !== key);
  state.selectedSearchKeys.delete(key);
  if (state.activeInlinePreviewAudioKey === key) {
    state.activeInlinePreviewAudioKey = state.activeSearchPreviewKeys[0] || '';
  }
  if (!state.activeSearchPreviewKeys.length) {
    closeSearchInlinePreviews();
    syncSearchSelectionControls();
    return;
  }
  if (!removeInlinePreviewCardElement(elements.searchResults, key, state.searchPreviewPlayers)) {
    renderSearchResults();
  }
  syncSearchSelectionControls();
}

function removeInlinePreview(action, key) {
  if (action === 'dashboard') {
    removeDashboardInlinePreview(key);
    return;
  }
  if (action === 'favorites') {
    removeFavoriteInlinePreview(key);
    return;
  }
  if (action === 'search') {
    removeSearchInlinePreview(key);
  }
}

function bindInlinePreviewRemoveControls(container) {
  container?.querySelectorAll('[data-inline-preview-remove]').forEach((button) => {
    if (button.dataset.inlinePreviewRemoveBound === 'true') {
      return;
    }
    button.dataset.inlinePreviewRemoveBound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeInlinePreview(button.dataset.inlinePreviewRemove, button.dataset.inlinePreviewRemoveKey);
    });
  });
}

async function mountFavoriteInlinePreviews(items, mountToken = currentInlinePreviewToken('favorites')) {
  if (!elements.favoritesContent || !isInlinePreviewMountCurrent('favorites', mountToken)) {
    return;
  }

  const itemMap = new Map(items.map((item) => [getItemKey(item), item]));
  const videoElements = [...elements.favoritesContent.querySelectorAll('[data-inline-preview-video]')];

  for (const [key, player] of state.favoritePreviewPlayers.entries()) {
    if (!itemMap.has(key)) {
      player.destroy();
      state.favoritePreviewPlayers.delete(key);
    }
  }

  await Promise.all(
    videoElements.map(async (video) => {
      const key = video.dataset.inlinePreviewKey;
      const item = itemMap.get(key);
      const status = elements.favoritesContent.querySelector(`[data-inline-preview-status="${CSS.escape(key)}"]`);
      if (!isInlinePreviewMountCurrent('favorites', mountToken, video)) {
        return;
      }
      if (!key || !item || !status || video.dataset.previewBound === 'true') {
        return;
      }

      video.dataset.previewBound = 'true';
      status.textContent = '読み込み中';

      try {
        await attachPreviewSource(video, item, {
          autoplay: true,
          forceRefresh: true,
          muted: true,
          onError: () => {
            status.textContent = '読み込み失敗';
          },
          onAutoplayBlocked: () => {
            status.textContent = 'プレイヤーの再生ボタンを押してください';
          },
          onReady: () => {
            status.textContent = '';
          },
          playerKey: key,
          playerStore: state.favoritePreviewPlayers,
          retryCount: 1,
          shouldContinue: () => isInlinePreviewMountCurrent('favorites', mountToken, video)
        });
      } catch (error) {
        if (!isInlinePreviewMountCurrent('favorites', mountToken, video)) {
          return;
        }
        delete video.dataset.previewBound;
        status.textContent = '読み込み失敗';
        showMessage(error.message, 'error');
      }
    })
  );

  if (!isInlinePreviewMountCurrent('favorites', mountToken)) {
    return;
  }

  bindInlinePreviewAudioFocus(elements.favoritesContent);
}

function closeFavoriteInlinePreviews() {
  destroyFavoritePreviewPlayers();
  state.activeFavoritePreviewKeys = [];
  renderFavorites();
}

function openFavoriteInlinePreviews(keys) {
  const nextKeys = [...new Set((keys || []).filter((key) => state.favorites[key]))];
  if (!nextKeys.length) {
    showMessage('再生する動画を選択してください。', 'error');
    return;
  }

  state.activeFavoritePreviewKeys = nextKeys;
  state.activeInlinePreviewAudioKey = nextKeys[0] || '';
  state.renderCache.favorites = '';
  renderFavorites();
  window.requestAnimationFrame(() => {
    elements.favoritesContent?.querySelector('.favorite-preview-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

async function mountDashboardInlinePreviews(items, mountToken = currentInlinePreviewToken('dashboard')) {
  if (!elements.dashboardRanking || !isInlinePreviewMountCurrent('dashboard', mountToken)) {
    return;
  }

  const itemMap = new Map(items.map((item) => [getItemKey(item), item]));
  const videoElements = [...elements.dashboardRanking.querySelectorAll('[data-inline-preview-video]')];

  for (const [key, player] of state.dashboardPreviewPlayers.entries()) {
    if (!itemMap.has(key)) {
      player.destroy();
      state.dashboardPreviewPlayers.delete(key);
    }
  }

  await Promise.all(
    videoElements.map(async (video) => {
      const key = video.dataset.inlinePreviewKey;
      const item = itemMap.get(key);
      const status = elements.dashboardRanking.querySelector(`[data-inline-preview-status="${CSS.escape(key)}"]`);
      if (!isInlinePreviewMountCurrent('dashboard', mountToken, video)) {
        return;
      }
      if (!key || !item || !status || video.dataset.previewBound === 'true') {
        return;
      }

      video.dataset.previewBound = 'true';
      status.textContent = '読み込み中';

      try {
        await attachPreviewSource(video, item, {
          autoplay: true,
          forceRefresh: true,
          muted: true,
          onError: () => {
            status.textContent = '読み込み失敗';
          },
          onAutoplayBlocked: () => {
            status.textContent = 'プレイヤーの再生ボタンを押してください';
          },
          onReady: () => {
            status.textContent = '';
          },
          playerKey: key,
          playerStore: state.dashboardPreviewPlayers,
          retryCount: 1,
          shouldContinue: () => isInlinePreviewMountCurrent('dashboard', mountToken, video)
        });
      } catch (error) {
        if (!isInlinePreviewMountCurrent('dashboard', mountToken, video)) {
          return;
        }
        delete video.dataset.previewBound;
        status.textContent = '読み込み失敗';
        showMessage(error.message, 'error');
      }
    })
  );

  if (!isInlinePreviewMountCurrent('dashboard', mountToken)) {
    return;
  }

  bindInlinePreviewAudioFocus(elements.dashboardRanking);
  elements.dashboardRanking.querySelectorAll('[data-inline-preview-favorite]').forEach((button) => {
    if (button.dataset.inlinePreviewFavoriteBound === 'true') {
      return;
    }
    button.dataset.inlinePreviewFavoriteBound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.inlinePreviewFavorite;
      const item = itemMap.get(key);
      if (item) {
        toggleFavorite(item);
      }
    });
  });
}

function closeDashboardInlinePreviews() {
  destroyDashboardPreviewPlayers();
  state.activeDashboardPreviewKeys = [];
  state.activeDashboardPreviewItems.clear();
  renderDashboardRanking();
}

function openDashboardInlinePreviews(keys) {
  const itemMap = new Map(currentRankingItems().map((item) => [getDownloadKey(item), item]));
  const nextItems = [...new Set(keys || [])].map((key) => itemMap.get(key)).filter(Boolean);
  if (!nextItems.length) {
    showMessage('再生する動画を選択してください。', 'error');
    return;
  }

  state.activeDashboardPreviewKeys = nextItems.map(getItemKey);
  state.activeDashboardPreviewItems = new Map(nextItems.map((item) => [getItemKey(item), item]));
  state.activeInlinePreviewAudioKey = state.activeDashboardPreviewKeys[0] || '';
  cacheRankingItems(currentRankingItems().length ? currentRankingItems() : nextItems);
  state.renderCache.dashboardRanking = '';
  renderDashboardRanking();
  window.requestAnimationFrame(() => {
    elements.dashboardRanking?.querySelector('.favorite-preview-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

async function mountSearchInlinePreviews(items, mountToken = currentInlinePreviewToken('search')) {
  if (!elements.searchResults || !isInlinePreviewMountCurrent('search', mountToken)) {
    return;
  }

  const itemMap = new Map(items.map((item) => [getItemKey(item), item]));
  const videoElements = [...elements.searchResults.querySelectorAll('[data-inline-preview-video]')];

  for (const [key, player] of state.searchPreviewPlayers.entries()) {
    if (!itemMap.has(key)) {
      player.destroy();
      state.searchPreviewPlayers.delete(key);
    }
  }

  await Promise.all(
    videoElements.map(async (video) => {
      const key = video.dataset.inlinePreviewKey;
      const item = itemMap.get(key);
      const status = elements.searchResults.querySelector(`[data-inline-preview-status="${CSS.escape(key)}"]`);
      if (!isInlinePreviewMountCurrent('search', mountToken, video)) {
        return;
      }
      if (!key || !item || !status || video.dataset.previewBound === 'true') {
        return;
      }

      video.dataset.previewBound = 'true';
      status.textContent = '読み込み中';

      try {
        await attachPreviewSource(video, item, {
          autoplay: true,
          forceRefresh: true,
          muted: true,
          onError: () => {
            status.textContent = '読み込み失敗';
          },
          onAutoplayBlocked: () => {
            status.textContent = 'プレイヤーの再生ボタンを押してください';
          },
          onReady: () => {
            status.textContent = '';
          },
          playerKey: key,
          playerStore: state.searchPreviewPlayers,
          retryCount: 1,
          shouldContinue: () => isInlinePreviewMountCurrent('search', mountToken, video)
        });
      } catch (error) {
        if (!isInlinePreviewMountCurrent('search', mountToken, video)) {
          return;
        }
        delete video.dataset.previewBound;
        status.textContent = '読み込み失敗';
        showMessage(error.message, 'error');
      }
    })
  );

  if (!isInlinePreviewMountCurrent('search', mountToken)) {
    return;
  }

  bindInlinePreviewAudioFocus(elements.searchResults);
  elements.searchResults.querySelectorAll('[data-inline-preview-favorite]').forEach((button) => {
    if (button.dataset.inlinePreviewFavoriteBound === 'true') {
      return;
    }
    button.dataset.inlinePreviewFavoriteBound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.inlinePreviewFavorite;
      const item = itemMap.get(key);
      if (item) {
        toggleFavorite(item);
      }
    });
  });
}

function closeSearchInlinePreviews() {
  destroySearchPreviewPlayers();
  state.activeSearchPreviewKeys = [];
  renderSearchResults();
}

function openSearchInlinePreviews(keys) {
  const itemMap = new Map(visibleSearchItems().map((item) => [getItemKey(item), item]));
  const requestedKeys = [...new Set(keys || [])];
  const nextItems = requestedKeys.map((key) => itemMap.get(key)).filter(isSearchPreviewable);
  if (!nextItems.length) {
    showMessage('再生できるサンプル動画があるコンテンツを選択してください。', 'error');
    return;
  }

  if (nextItems.length < requestedKeys.length) {
    showMessage('サンプル動画URLがないコンテンツはスキップしました。', 'info');
  }

  state.activeSearchPreviewKeys = nextItems.map(getItemKey);
  state.activeInlinePreviewAudioKey = state.activeSearchPreviewKeys[0] || '';
  state.renderCache.searchResults = '';
  renderSearchResults();
  window.requestAnimationFrame(() => {
    elements.searchResults?.querySelector('.favorite-preview-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

function renderFavorites() {
  if (!canUseInlinePreviewExperience()) {
    state.favoriteSelectionMode = false;
    state.selectedFavoriteKeys.clear();
    destroyFavoritePreviewPlayers();
    state.activeFavoritePreviewKeys = [];
  }

  pruneFavoriteSelection();
  pruneFavoritePreviewKeys();

  const favoriteItems = favoriteItemsSorted();
  const activePreviewItems = state.activeFavoritePreviewKeys.map((key) => state.favorites[key]).filter(Boolean);
  const showBrowserControls = canUseInlinePreviewExperience();
  const allowInlinePlayback = showBrowserControls && state.tab === 'favorites';
  const selectionCount = state.selectedFavoriteKeys.size;
  const statusText = favoriteItems.length ? `${favoriteItems.length}件を保存中` : '気になる動画を保存するとここに表示されます。';
  const headerAsideHtml = showBrowserControls
    ? `
        <div class="ranking-header-actions">
          <button
            type="button"
            class="header-command-button ${state.favoriteSelectionMode ? 'active' : ''}"
            data-favorite-selection-toggle
            aria-pressed="${state.favoriteSelectionMode ? 'true' : 'false'}"
          >
            ${state.favoriteSelectionMode ? (selectionCount ? `選択中 ${selectionCount}` : '選択中') : '複数選択'}
          </button>
          <button
            type="button"
            class="icon-button favorite-header-play-button"
            data-favorite-selection-play
            title="選択した動画を同時再生"
            aria-label="選択した動画を同時再生"
            ${selectionCount ? '' : 'disabled'}
          >
            <span aria-hidden="true">&#9654;</span>
          </button>
          <p class="muted">${escapeHtml(statusText)}</p>
        </div>
      `
    : `<p class="muted">${escapeHtml(statusText)}</p>`;

  renderRankingSection(elements.favoritesContent, {
    cacheKey: 'favorites',
    emptyText: 'お気に入りはまだありません。星を押すとここに保存されます。',
    eyebrow: 'お気に入り',
    footerHtml:
      allowInlinePlayback && activePreviewItems.length
        ? renderInlinePreviewSection(activePreviewItems, {
            closeAction: 'favorites',
            heading: 'ブックマーク内で再生',
            selectedCount: selectionCount,
            selectionAction: 'favorites',
            selectionMode: state.favoriteSelectionMode
          })
        : '',
    footerSignature: allowInlinePlayback ? activePreviewItems.map(getItemKey).join(',') : '',
    headerAsideHtml,
    headerAsideSignature: JSON.stringify({
      activePreviewCount: activePreviewItems.length,
      allowInlinePlayback,
      selectionCount,
      selectionMode: state.favoriteSelectionMode,
      showBrowserControls,
      statusText
    }),
    inlinePreviewAction: 'favorites',
    inlinePreviewActive: allowInlinePlayback && activePreviewItems.length > 0,
    items: favoriteItems,
    onAfterRender: () => {
      elements.favoritesContent?.querySelectorAll('[data-favorite-selection-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
          toggleFavoriteSelectionMode();
        });
      });
      elements.favoritesContent?.querySelectorAll('[data-favorite-selection-play]').forEach((button) => {
        button.addEventListener('click', () => {
          openFavoriteInlinePreviews([...state.selectedFavoriteKeys]);
        });
      });
      elements.favoritesContent?.querySelector('[data-inline-preview-close="favorites"]')?.addEventListener('click', () => {
        closeFavoriteInlinePreviews();
      });
      bindInlinePreviewRemoveControls(elements.favoritesContent);
      if (allowInlinePlayback && activePreviewItems.length) {
        const mountToken = currentInlinePreviewToken('favorites');
        queueMicrotask(() => {
          mountFavoriteInlinePreviews(activePreviewItems, mountToken).catch((error) => {
            showMessage(error.message, 'error');
          });
        });
      }
    },
    onBeforeRender: allowInlinePlayback && !activePreviewItems.length ? destroyFavoritePreviewPlayers : undefined,
    previewMode: showBrowserControls ? 'favorite-inline' : 'default',
    selectionKind: showBrowserControls ? 'favorite' : '',
    selectionMode: showBrowserControls && state.favoriteSelectionMode,
    selectedKeys: state.selectedFavoriteKeys,
    statusText,
    title: 'ブックマーク'
  });
}

function setThumbnailModalOpen(isOpen) {
  state.thumbnailModalOpen = isOpen;
  elements.thumbnailModal.hidden = !isOpen;
  document.body.classList.toggle('thumbnail-modal-open', isOpen);
}

function openThumbnailModal(item) {
  elements.thumbnailModalImage.src = item.thumbnailUrl;
  elements.thumbnailModalImage.alt = item.title || 'サムネイル';
  elements.thumbnailModalTitle.textContent = [item.title, item.actress].filter(Boolean).join(' / ');
  setThumbnailModalOpen(true);
}

function closeThumbnailModal() {
  setThumbnailModalOpen(false);
  elements.thumbnailModalImage.removeAttribute('src');
  elements.thumbnailModalImage.alt = '';
  elements.thumbnailModalTitle.textContent = '';
}

function stopPreviewPlayback() {
  if (!elements.previewPlayer) {
    return;
  }

  destroyPreviewHlsPlayer();
  resetVideoElement(elements.previewPlayer);
  elements.previewModalTitle.textContent = '';
  elements.previewModalMeta.textContent = '';
}

function setPreviewModalOpen(isOpen) {
  state.previewModalOpen = isOpen;
  elements.previewModal.hidden = !isOpen;
  document.body.classList.toggle('preview-modal-open', isOpen);
}

function openPreviewModal(item) {
  const label = [item.title, item.actress].filter(Boolean).join(' / ');

  stopPreviewPlayback();
  elements.previewModalTitle.textContent = label || '動画プレビュー';
  elements.previewModalMeta.textContent = '読み込み中';
  setPreviewModalOpen(true);
  attachPreviewSource(elements.previewPlayer, item, {
    autoplay: true,
    onError: () => {
      elements.previewModalMeta.textContent = '読み込みに失敗しました';
    },
    onReady: () => {
      elements.previewModalMeta.textContent = '';
    }
  }).catch((error) => {
    elements.previewModalMeta.textContent = '読み込みに失敗しました';
    showMessage(error.message, 'error');
  });
}

function closePreviewModal() {
  setPreviewModalOpen(false);
  stopPreviewPlayback();
}

function setShortcutModalOpen(isOpen) {
  state.shortcutModalOpen = isOpen;
  elements.shortcutModal.hidden = !isOpen;
  document.body.classList.toggle('shortcut-modal-open', isOpen);
}

function openShortcutModal() {
  setShortcutModalOpen(true);
}

function closeShortcutModal() {
  setShortcutModalOpen(false);
}

function renderHistory() {
  const items = state.history;

  elements.historyContent.innerHTML = `
    <div class="table-title">
      <div>
        <p class="eyebrow">ダウンロード履歴</p>
        <h2>過去の実行結果と重複スキップ</h2>
      </div>
      <button id="refresh-history-button" class="ghost-button">更新</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>更新日時</th>
            <th>状態</th>
            <th>順位</th>
            <th>タイトル</th>
            <th>メッセージ</th>
            <th>ファイル</th>
          </tr>
        </thead>
        <tbody>
          ${
            items.length
              ? items
                  .map((record) => {
                    return `
                      <tr>
                        <td>${formatDate(record.updatedAt || record.createdAt)}</td>
                        <td><span class="status-badge status-${record.status}">${formatStatus(record.status)}</span></td>
                        <td>${record.rank ?? '-'}</td>
                        <td>${record.title || record.seasonId || '-'}</td>
                        <td>${record.message || '-'}</td>
                        <td class="muted">${record.filePath || '-'}</td>
                      </tr>
                    `;
                  })
                  .join('')
              : `<tr><td colspan="6" class="muted">履歴はまだありません。</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  qs('refresh-history-button').addEventListener('click', () => refreshHistory());
}

function currentViewerItems() {
  return state.viewerMode === 'local' ? state.localViewerFiles : state.library.items;
}

function currentViewerItem() {
  return currentViewerItems()[state.viewerIndex];
}

function renderViewerList() {
  const items = currentViewerItems();

  elements.viewerPlaylist.innerHTML = items.length
    ? items
        .map((item, index) => {
          const active = index === state.viewerIndex ? 'active' : '';
          const meta =
            state.viewerMode === 'local'
              ? formatSize(item.size)
              : `${formatSize(item.size)} / ${formatDate(item.modifiedAt)}`;

          return `
            <li>
              <button class="playlist-item ${active}" data-index="${index}">
                <strong>${item.name}</strong>
                <small>${meta}</small>
              </button>
            </li>
          `;
        })
        .join('')
    : `<li class="playlist-item"><strong>動画がありません</strong><small>パスを入力して開くか、フォルダを選択してください。</small></li>`;

  elements.viewerPlaylist.querySelectorAll('[data-index]').forEach((button) => {
    button.addEventListener('click', () => {
      playViewerIndex(Number(button.dataset.index));
    });
  });
}

function renderViewerMeta() {
  const items = currentViewerItems();
  const current = items[state.viewerIndex];

  if (!current) {
    elements.viewerNowTitle.textContent = '動画が選択されていません';
    return;
  }

  elements.viewerNowTitle.textContent = current.name;
}

function updateRateDisplay() {
  elements.viewerRateDisplay.textContent = `${elements.viewerPlayer.playbackRate.toFixed(1)}x`;
}

function getVideoMimeType(item) {
  const name = String(item?.name || item?.path || '').toLowerCase();
  if (name.endsWith('.webm')) {
    return 'video/webm';
  }
  if (name.endsWith('.mov')) {
    return 'video/quicktime';
  }
  if (name.endsWith('.mkv')) {
    return 'video/x-matroska';
  }
  if (name.endsWith('.ts')) {
    return 'video/mp2t';
  }
  return 'video/mp4';
}

function isTsVideo(item) {
  return String(item?.name || item?.path || '').toLowerCase().endsWith('.ts');
}

function destroyMpegtsPlayer() {
  if (!state.mpegtsPlayer) {
    return;
  }

  state.mpegtsPlayer.destroy();
  state.mpegtsPlayer = null;
}

function playViewerIndex(index) {
  const items = currentViewerItems();
  const item = items[index];
  if (!item) {
    return;
  }

  state.viewerIndex = index;
  const source =
    state.viewerMode === 'local' ? item.objectUrl : `/api/video?path=${encodeURIComponent(item.path)}`;
  const playbackRate = elements.viewerPlayer.playbackRate || 1;

  destroyMpegtsPlayer();
  elements.viewerPlayer.removeAttribute('src');
  elements.viewerPlayer.innerHTML = '';

  const useMpegts = isTsVideo(item) && window.mpegts?.isSupported();
  if (useMpegts) {
    try {
      state.mpegtsPlayer = window.mpegts.createPlayer(
        {
          isLive: false,
          type: 'mpegts',
          url: source
        },
        {
          enableWorker: false,
          lazyLoad: false,
          reuseRedirectedURL: true
        }
      );
      state.mpegtsPlayer.on(window.mpegts.Events.ERROR, (_type, _detail, info) => {
        const message = info?.msg ? `TS動画の読み込みに失敗しました: ${info.msg}` : 'TS動画の読み込みに失敗しました。';
        showMessage(message, 'error');
      });
      state.mpegtsPlayer.attachMediaElement(elements.viewerPlayer);
      state.mpegtsPlayer.load();
    } catch {
      destroyMpegtsPlayer();
      elements.viewerPlayer.innerHTML = `<source src="${escapeHtml(source)}" type="${getVideoMimeType(item)}" />`;
      elements.viewerPlayer.load();
    }
  } else {
    elements.viewerPlayer.innerHTML = `<source src="${escapeHtml(source)}" type="${getVideoMimeType(item)}" />`;
    elements.viewerPlayer.load();
  }
  elements.viewerPlayer.playbackRate = playbackRate;
  updateRateDisplay();
  renderViewerList();
  renderViewerMeta();
  elements.viewerPlayer.play().catch(() => {});
}

async function refreshLibrary(options = {}) {
  if (!canUseLibrary()) {
    state.library = {
      directory: '',
      error: 'Hosted mode does not provide local library access.',
      items: []
    };
    renderViewerList();
    renderViewerMeta();
    return;
  }

  if (state.viewerMode === 'local') {
    renderViewerList();
    renderViewerMeta();
    return;
  }

  try {
    const result = await requestJson(`/api/library?dir=${encodeURIComponent(elements.viewerDirectoryInput.value || '')}`);
    state.library = result;

    if (state.viewerIndex >= result.items.length) {
      state.viewerIndex = result.items.length ? 0 : -1;
    }

    renderViewerList();
    renderViewerMeta();
  } catch (error) {
    if (!options.silent) {
      showMessage(error.message, 'error');
    }
  }
}

async function refreshHistory() {
  const result = await requestJson('/api/history?limit=200');
  state.history = result.items || [];
  if (state.tab === 'history') {
    renderHistory();
  }
  renderDashboardRanking();
}

async function refreshState(options = {}) {
  const stateUrl = options.initial ? '/api/state?initial=1' : '/api/state';
  state.snapshot = await requestJson(stateUrl);
  cacheRankingItems(state.snapshot?.ranking?.items || []);
  if (options.initial && !state.snapshot?.config?.affiliate?.hasAffiliateApiCredentials) {
    state.search.provider = 'dmm';
  }
  syncFavoritesWithRanking();
  pruneDownloadSelection();
  renderWarnings();
  renderSummary();
  renderHeaderActions();
  renderDashboardControls();
  renderSettingsPanel();
  renderDashboardMetrics();
  renderDashboardRanking();
  renderFavorites();
  renderSearchResults();

  if (isHostedMode()) {
    document.querySelector('[data-tab="viewer"]')?.setAttribute('hidden', 'hidden');
    elements.settingsToggleButton?.setAttribute('hidden', 'hidden');
  }

  if (!elements.viewerDirectoryInput.value) {
    elements.viewerDirectoryInput.value = state.snapshot.settings.libraryDirectory;
  }
  elements.viewerAutoplayToggle.checked = Boolean(state.snapshot.settings.autoplayNext);
  scheduleAutoRefresh();
}

async function saveSettings(options = {}) {
  if (!canManageSettings()) {
    showMessage('Hosted mode では設定変更を保存できません。', 'error');
    return;
  }

  try {
    const parsedLimit = Number(qs('download-limit-input')?.value);
    const parsedRankingFetchCount = Number(qs('ranking-fetch-count-input')?.value);
    const payload = {
      autoplayNext: elements.viewerAutoplayToggle.checked,
      downloadLimit: Number.isFinite(parsedLimit) ? parsedLimit : state.snapshot?.settings?.downloadLimit || 5,
      filenameTemplate: qs('filename-template-input')?.value || state.snapshot?.settings?.filenameTemplate,
      libraryDirectory: qs('library-directory-input-settings')?.value || state.snapshot?.settings?.libraryDirectory,
      rankingFetchCount: Number.isFinite(parsedRankingFetchCount)
        ? parsedRankingFetchCount
        : state.snapshot?.settings?.rankingFetchCount || state.snapshot?.config?.ranking?.first || 15,
      rankingSourceUrl: qs('ranking-source-url-input')?.value || state.snapshot?.settings?.rankingSourceUrl
    };

    await requestJson('/api/settings', {
      body: JSON.stringify(payload),
      method: 'POST'
    });

    state.controlsDirty = false;
    await refreshState();
    await refreshLibrary({ silent: true });
    if (!options.silent) {
      showMessage('設定を保存しました。', 'success');
    }
  } catch (error) {
    showMessage(error.message, 'error');
    if (options.silent) {
      throw error;
    }
  }
}

async function saveCookie() {
  if (!appCapabilities().canManageCookies) {
    showMessage('Hosted mode では Cookie を保存できません。', 'error');
    return;
  }

  try {
    const cookieHeader = qs('dmm-cookie-input').value;
    await requestJson('/api/session/cookie', {
      body: JSON.stringify({ cookieHeader }),
      method: 'POST'
    });
    qs('dmm-cookie-input').value = '';
    state.controlsDirty = false;
    await refreshState();
    showMessage('DMMのCookieを保存しました。', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function importN8nCookie() {
  if (!appCapabilities().canManageCookies) {
    showMessage('Hosted mode では Cookie を取り込めません。', 'error');
    return;
  }

  try {
    const result = await requestJson('/api/session/import-n8n-cookie', {
      body: JSON.stringify({}),
      method: 'POST'
    });
    state.controlsDirty = false;
    await refreshState();
    showMessage(`n8nの「${result.importedFrom}」からCookieを取り込みました。期限切れの場合は新しいCookieを貼り付けてください。`, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function clearCookie() {
  if (!appCapabilities().canManageCookies) {
    showMessage('Hosted mode では Cookie を削除できません。', 'error');
    return;
  }

  try {
    await requestJson('/api/session/clear-cookie', {
      body: JSON.stringify({}),
      method: 'POST'
    });
    qs('dmm-cookie-input').value = '';
    state.controlsDirty = false;
    await refreshState();
    showMessage('保存済みCookieを削除しました。', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function shouldFetchRemainingSearchResults(search = state.search) {
  return Boolean(search?.hasMore || ((search?.items || []).length >= 100 && Number(search?.pagesFetched || 0) >= 1));
}

async function fetchRemainingSearchResults(keyword, provider, requestToken) {
  if (requestToken !== searchRequestToken) {
    return;
  }

  state.search = {
    ...state.search,
    backgroundError: '',
    backgroundLoading: true
  };
  state.renderCache.searchResults = '';
  renderSearchResults();

  try {
    const params = new URLSearchParams({
      keyword,
      maxPages: '100',
      pageSize: '100',
      provider
    });
    const result = await requestJson(`/api/search/actress?${params.toString()}`);
    if (requestToken !== searchRequestToken) {
      return;
    }

    const nextSearch = result.search || {};
    const mergedItems = mergeSearchItems(nextSearch.items || [], state.search.items || []);
    state.search = {
      ...state.search,
      backgroundError: '',
      backgroundLoading: false,
      fetchedAt: nextSearch.fetchedAt || state.search.fetchedAt,
      hasMore: Boolean(nextSearch.hasMore),
      items: mergedItems,
      page: clampSearchPage(mergedItems),
      pageSize: nextSearch.pageSize || state.search.pageSize,
      pagesFetched: nextSearch.pagesFetched || state.search.pagesFetched,
      provider: normalizeSearchProvider(nextSearch.searchProvider || provider),
      query: nextSearch.query || state.search.query,
      sourcePageUrl: nextSearch.sourcePageUrl || state.search.sourcePageUrl,
      total: nextSearch.total || mergedItems.length
    };
    state.renderCache.searchResults = '';
    renderSearchResults();
  } catch (error) {
    if (requestToken !== searchRequestToken) {
      return;
    }
    state.search = {
      ...state.search,
      backgroundError: '追加取得に失敗しました',
      backgroundLoading: false
    };
    state.renderCache.searchResults = '';
    renderSearchResults();
  }
}

async function searchActress(queryOverride = null) {
  const input =
    document.activeElement?.matches?.('[data-actress-search-input]')
      ? document.activeElement
      : document.querySelector('[data-actress-search-input]');
  const queryValue = queryOverride === null ? (input?.value ?? state.searchDraft ?? state.search.query ?? '') : queryOverride;
  const keyword = String(queryValue || '').trim();
  if (!keyword) {
    showMessage('検索する女優名または商品名を入力してください。', 'error');
    input?.focus();
    return;
  }

  const provider = normalizeSearchProvider(state.search.provider);
  const displayPageSize = searchDisplayPageSize();
  const requestToken = ++searchRequestToken;
  state.search = {
    ...state.search,
    backgroundError: '',
    backgroundLoading: false,
    displayPageSize,
    error: '',
    hasMore: false,
    items: [],
    loading: true,
    page: 1,
    provider,
    query: keyword,
    total: 0
  };
  state.searchDraft = keyword;
  state.activeSearchPreviewKeys = [];
  state.selectedSearchKeys.clear();
  state.searchSelectionMode = false;
  destroySearchPreviewPlayers();
  state.controlsDirty = false;
  state.renderCache.searchResults = '';
  renderHeaderActions();
  renderSearchResults();

  try {
    const params = new URLSearchParams({
      keyword,
      maxPages: '1',
      pageSize: '100',
      provider,
      stopAfterItems: '100'
    });
    const result = await requestJson(`/api/search/actress?${params.toString()}`);
    if (requestToken !== searchRequestToken) {
      return;
    }
    const nextSearch = result.search || {};
    const initialItems = mergeSearchItems([], nextSearch.items || []);
    state.search = {
      backgroundError: '',
      backgroundLoading: false,
      displayPageSize: searchDisplayPageSize(),
      error: '',
      fetchedAt: nextSearch.fetchedAt || null,
      hasMore: Boolean(nextSearch.hasMore),
      items: initialItems,
      loading: false,
      page: 1,
      pageSize: nextSearch.pageSize || 0,
      pagesFetched: nextSearch.pagesFetched || 0,
      provider: normalizeSearchProvider(nextSearch.searchProvider || provider),
      query: nextSearch.query || keyword,
      sourcePageUrl: nextSearch.sourcePageUrl || '',
      total: nextSearch.total || initialItems.length
    };
    state.renderCache.searchResults = '';
    renderHeaderActions();
    renderSearchResults();
    showMessage(`${state.search.query} の${searchProviderLabel(state.search.provider)}検索結果を取得しました。`, 'success');
    if (shouldFetchRemainingSearchResults(state.search)) {
      queueMicrotask(() => {
        fetchRemainingSearchResults(keyword, provider, requestToken);
      });
    }
  } catch (error) {
    if (requestToken !== searchRequestToken) {
      return;
    }
    state.search = {
      ...state.search,
      error: error.message,
      loading: false
    };
    state.renderCache.searchResults = '';
    renderHeaderActions();
    renderSearchResults();
    showMessage(error.message, 'error');
  }
}

async function fetchRanking() {
  try {
    const configuredFirst =
      Number(qs('ranking-fetch-count-input')?.value) ||
      state.snapshot?.settings?.rankingFetchCount ||
      state.snapshot?.config?.ranking?.first ||
      15;
    await saveSettings({ silent: true });
    await requestJson('/api/ranking/fetch', {
      body: JSON.stringify({
        first: configuredFirst,
        sourcePageUrl: qs('ranking-source-url-input')?.value || state.snapshot?.settings?.rankingSourceUrl
      }),
      method: 'POST'
    });
    state.selectedDownloadKeys.clear();
    await refreshState();
    await refreshHistory();
    showMessage('ランキングを取得し、CSVへ追記しました。', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function startDownload() {
  if (!canDownload()) {
    showMessage('Hosted mode ではダウンロード機能を無効化しています。', 'error');
    return;
  }

  try {
    if (!state.snapshot?.config?.capabilities?.hasCookie) {
      showMessage('DMMのCookieが未設定です。先にCookieを保存するか、n8nから取り込んでください。', 'error');
      return;
    }

    await saveSettings({ silent: true });
    const parsedLimit = Number(qs('download-limit-input')?.value);
    const selectedItems = state.downloadSelectionMode ? selectedRankingItems() : [];
    if (state.downloadSelectionMode && !selectedItems.length) {
      showMessage('ダウンロードする動画にチェックを入れてください。', 'error');
      return;
    }

    const payload = state.downloadSelectionMode
      ? {
          count: selectedItems.length,
          seasonIds: selectedItems.map((item) => item.seasonId).filter(Boolean)
        }
      : {
          count: Number.isFinite(parsedLimit) ? parsedLimit : state.snapshot?.settings?.downloadLimit || 5
        };

    await requestJson('/api/download/start', {
      body: JSON.stringify(payload),
      method: 'POST'
    });
    await refreshState();
    await refreshHistory();
    showMessage('ダウンロードを開始しました。', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function stopDownload() {
  if (!canDownload()) {
    showMessage('Hosted mode ではダウンロード機能を無効化しています。', 'error');
    return;
  }

  try {
    await requestJson('/api/download/stop', {
      body: JSON.stringify({}),
      method: 'POST'
    });
    await refreshState();
    await refreshHistory();
    showMessage('停止を要求しました。', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function adjustPlaybackRate(step) {
  const nextRate = Math.min(4, Math.max(0.1, +(elements.viewerPlayer.playbackRate + step).toFixed(1)));
  elements.viewerPlayer.playbackRate = nextRate;
  updateRateDisplay();
}

function jumpVideo(offset) {
  if (!elements.viewerPlayer.duration) {
    return;
  }
  elements.viewerPlayer.currentTime = Math.min(
    elements.viewerPlayer.duration,
    Math.max(0, elements.viewerPlayer.currentTime + offset)
  );
}

function moveViewerSelection(step) {
  const items = currentViewerItems();
  if (!items.length) {
    return false;
  }

  if (state.viewerIndex < 0) {
    playViewerIndex(0);
    return true;
  }

  const nextIndex = state.viewerIndex + step;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return false;
  }

  playViewerIndex(nextIndex);
  return true;
}

function handleViewerShortcuts(event) {
  if (
    state.tab !== 'viewer' ||
    state.settingsOpen ||
    state.thumbnailModalOpen ||
    state.previewModalOpen ||
    state.shortcutModalOpen
  ) {
    return;
  }

  const target = event.target;
  const tag = target?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
    return;
  }

  let handled = true;

  if (event.key === 'ArrowLeft') {
    jumpVideo(-5);
  } else if (event.key === 'ArrowRight') {
    jumpVideo(5);
  } else if (event.key === 'ArrowDown') {
    moveViewerSelection(1);
  } else if (event.key === 'ArrowUp') {
    moveViewerSelection(-1);
  } else if (event.key.toLowerCase() === 'd') {
    adjustPlaybackRate(0.1);
  } else if (event.key.toLowerCase() === 's') {
    adjustPlaybackRate(-0.1);
  } else {
    handled = false;
  }

  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function loadLocalFiles(fileList) {
  state.localViewerFiles.forEach((item) => {
    if (item.objectUrl) {
      URL.revokeObjectURL(item.objectUrl);
    }
  });

  const files = [...fileList].filter((file) => /\.(mp4|m4v|mov|webm|mkv|ts)$/i.test(file.name));
  files.sort((left, right) => left.name.localeCompare(right.name, 'ja'));

  state.localViewerFiles = files.map((file) => ({
    modifiedAt: new Date(file.lastModified).toISOString(),
    name: file.webkitRelativePath || file.name,
    objectUrl: URL.createObjectURL(file),
    path: file.webkitRelativePath || file.name,
    relativePath: file.webkitRelativePath || file.name,
    size: file.size
  }));
  state.viewerMode = 'local';
  state.viewerIndex = state.localViewerFiles.length ? 0 : -1;
  renderViewerList();
  renderViewerMeta();
  if (state.viewerIndex >= 0) {
    playViewerIndex(state.viewerIndex);
  }
}

function shouldRefreshHistory() {
  return state.tab === 'history' || Boolean(state.snapshot?.downloads?.running);
}

function autoRefreshDelay() {
  if (document.visibilityState === 'hidden') {
    return 45000;
  }

  if (state.previewModalOpen) {
    return 30000;
  }

  if (state.snapshot?.downloads?.running || state.controlsDirty) {
    return 4000;
  }

  if (state.tab === 'viewer' && state.viewerMode === 'server') {
    return 6000;
  }

  return 20000;
}

function scheduleAutoRefresh(delay = autoRefreshDelay()) {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(async () => {
    try {
      await refreshState();
      if (shouldRefreshHistory()) {
        await refreshHistory();
      }
      if (state.tab === 'viewer' && state.viewerMode === 'server') {
        await refreshLibrary({ silent: true });
      }
    } catch {
      return;
    } finally {
      scheduleAutoRefresh();
    }
  }, delay);
}

function bindStaticEvents() {
  document.querySelectorAll('.nav-button').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  elements.thumbnailModalBackdrop.addEventListener('click', closeThumbnailModal);
  elements.thumbnailModalCloseButton.addEventListener('click', closeThumbnailModal);
  elements.previewModalBackdrop.addEventListener('click', closePreviewModal);
  elements.previewModalCloseButton.addEventListener('click', closePreviewModal);
  elements.shortcutHelpButton.addEventListener('click', openShortcutModal);
  elements.shortcutModalBackdrop.addEventListener('click', closeShortcutModal);
  elements.shortcutModalCloseButton.addEventListener('click', closeShortcutModal);
  elements.mobileMenuButton.addEventListener('click', () => setMobileMenuOpen(!state.mobileMenuOpen));
  elements.mobileSidebarBackdrop.addEventListener('click', () => setMobileMenuOpen(false));
  elements.settingsToggleButton.addEventListener('click', () => {
    setMobileMenuOpen(false);
    setSettingsPanelOpen(true);
  });
  elements.settingsCloseButton.addEventListener('click', () => setSettingsPanelOpen(false));
  elements.settingsOverlay.addEventListener('click', () => setSettingsPanelOpen(false));
  document.addEventListener('keydown', (event) => {
    if (handleSelectionPlayShortcut(event)) {
      return;
    }

    if (event.key === 'Escape' && state.mobileMenuOpen) {
      setMobileMenuOpen(false);
      return;
    }

    if (event.key === 'Escape' && state.shortcutModalOpen) {
      closeShortcutModal();
      return;
    }

    if (event.key === 'Escape' && state.thumbnailModalOpen) {
      closeThumbnailModal();
      return;
    }

    if (event.key === 'Escape' && state.previewModalOpen) {
      closePreviewModal();
      return;
    }

    if (event.key === 'Escape' && state.settingsOpen) {
      setSettingsPanelOpen(false);
    }
  });

  elements.viewerRefreshButton.addEventListener('click', () => {
    state.viewerMode = 'server';
    refreshLibrary();
  });

  elements.viewerApplyDirectoryButton.addEventListener('click', async () => {
    try {
      await requestJson('/api/settings', {
        body: JSON.stringify({
          libraryDirectory: elements.viewerDirectoryInput.value
        }),
        method: 'POST'
      });
      state.viewerMode = 'server';
      await refreshState();
      await refreshLibrary();
      showMessage('ビューアー用フォルダを開きました。', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });

  elements.viewerOpenLocalButton.addEventListener('click', () => {
    elements.viewerFolderInput.click();
  });

  elements.viewerFolderInput.addEventListener('change', () => {
    loadLocalFiles(elements.viewerFolderInput.files);
  });

  elements.viewerAutoplayToggle.addEventListener('change', async () => {
    try {
      await requestJson('/api/settings', {
        body: JSON.stringify({
          autoplayNext: elements.viewerAutoplayToggle.checked
        }),
        method: 'POST'
      });
      showMessage('自動再生設定を更新しました。', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });

  elements.viewerPlayer.addEventListener('ended', () => {
    if (elements.viewerAutoplayToggle.checked) {
      moveViewerSelection(1);
    }
  });

  elements.viewerPlayer.addEventListener('error', () => {
    const current = currentViewerItem();
    if (String(current?.name || current?.path || '').toLowerCase().endsWith('.ts')) {
      showMessage('TS形式はブラウザによって再生できない場合があります。新規ダウンロードはMP4変換できる環境だと安定します。', 'error');
      return;
    }
    showMessage('動画を再生できませんでした。ファイル形式またはブラウザ対応を確認してください。', 'error');
  });

  elements.viewerPlayer.addEventListener('ratechange', updateRateDisplay);
  elements.previewPlayer.addEventListener('loadedmetadata', () => {
    elements.previewModalMeta.textContent = '';
  });
  elements.previewPlayer.addEventListener('error', () => {
    elements.previewModalMeta.textContent = '読み込みに失敗しました';
    showMessage('プレビューを再生できませんでした。必要ならDMM再生へ切り替えてください。', 'error');
  });
  document.addEventListener('keydown', handleViewerShortcuts, true);
  elements.mobileActionMedia.addEventListener('change', () => {
    syncResponsiveState();
    syncResponsiveActionPlacement();
    renderDashboardRanking();
    renderFavorites();
    renderSearchResults();
  });
  window.addEventListener('resize', () => {
    if (!syncResponsiveState()) {
      return;
    }
    syncResponsiveActionPlacement();
    renderDashboardRanking();
    renderFavorites();
    renderSearchResults();
  });
  document.addEventListener('visibilitychange', () => {
    scheduleAutoRefresh(document.visibilityState === 'visible' ? 1000 : autoRefreshDelay());
  });
  syncResponsiveActionPlacement();
}

async function boot() {
  elements.appSummary = qs('app-summary');
  elements.dashboardControls = qs('dashboard-controls');
  elements.dashboardMetrics = qs('dashboard-metrics');
  elements.dashboardRanking = qs('dashboard-ranking');
  elements.favoritesContent = qs('favorites-content');
  elements.flashMessage = qs('flash-message');
  elements.headerActions = qs('header-actions');
  elements.historyContent = qs('history-content');
  elements.mobileActionMedia = window.matchMedia('(max-width: 1180px), (hover: none) and (pointer: coarse)');
  elements.mobileMenuButton = qs('mobile-menu-button');
  elements.mobileSidebarActions = qs('mobile-sidebar-actions');
  elements.mobileSidebarBackdrop = qs('mobile-sidebar-backdrop');
  elements.settingsCloseButton = qs('settings-close-button');
  elements.settingsOverlay = qs('settings-overlay');
  elements.settingsPanel = qs('settings-panel');
  elements.settingsPanelContent = qs('settings-panel-content');
  elements.settingsToggleButton = qs('settings-toggle-button');
  elements.shortcutHelpButton = qs('shortcut-help-button');
  elements.shortcutModal = qs('shortcut-modal');
  elements.shortcutModalBackdrop = qs('shortcut-modal-backdrop');
  elements.shortcutModalCloseButton = qs('shortcut-modal-close-button');
  elements.previewModal = qs('preview-modal');
  elements.previewModalBackdrop = qs('preview-modal-backdrop');
  elements.previewModalCloseButton = qs('preview-modal-close-button');
  elements.previewModalMeta = qs('preview-modal-meta');
  elements.previewModalTitle = qs('preview-modal-title');
  elements.previewPlayer = qs('preview-player');
  elements.searchResults = qs('search-results');
  elements.thumbnailModal = qs('thumbnail-modal');
  elements.thumbnailModalBackdrop = qs('thumbnail-modal-backdrop');
  elements.thumbnailModalCloseButton = qs('thumbnail-modal-close-button');
  elements.thumbnailModalImage = qs('thumbnail-modal-image');
  elements.thumbnailModalTitle = qs('thumbnail-modal-title');
  elements.topbarActions = qs('topbar-actions');
  elements.topbarActionsSlot = qs('topbar-actions-slot');
  elements.viewerApplyDirectoryButton = qs('viewer-apply-directory-button');
  elements.viewerAutoplayToggle = qs('viewer-autoplay-toggle');
  elements.viewerDirectoryInput = qs('viewer-directory-input');
  elements.viewerFolderInput = qs('viewer-folder-input');
  elements.viewerNowTitle = qs('viewer-now-title');
  elements.viewerOpenLocalButton = qs('viewer-open-local-button');
  elements.viewerPlayer = qs('viewer-player');
  elements.viewerPlaylist = qs('viewer-playlist');
  elements.viewerRateDisplay = qs('viewer-rate-display');
  elements.viewerRefreshButton = qs('viewer-refresh-button');
  elements.warningList = qs('warning-list');

  state.favorites = loadFavorites();
  syncResponsiveState();
  bindStaticEvents();
  switchTab('dashboard');

  await refreshState({ initial: true });
  await refreshHistory();
  await refreshLibrary({ silent: true });
  scheduleAutoRefresh();
}

boot().catch((error) => {
  showMessage(error.message, 'error');
});
