const state = {
  controlsDirty: false,
  downloadSelectionMode: false,
  favorites: {},
  history: [],
  library: {
    directory: '',
    error: null,
    items: []
  },
  localViewerFiles: [],
  messageTimer: null,
  mpegtsPlayer: null,
  mobileMenuOpen: false,
  selectedDownloadKeys: new Set(),
  settingsOpen: false,
  shortcutModalOpen: false,
  snapshot: null,
  thumbnailModalOpen: false,
  tab: 'dashboard',
  viewerIndex: -1,
  viewerMode: 'server'
};

const elements = {};
const FAVORITES_STORAGE_KEY = 'dmm-download-favorites-v1';

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
  return state.snapshot?.ranking?.items || [];
}

function selectedRankingItems() {
  return currentRankingItems().filter((item) => state.selectedDownloadKeys.has(getDownloadKey(item)));
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

function normalizeFavoriteItem(item) {
  return {
    actress: item.actress || '',
    contentId: item.contentId || '',
    detailUrl: item.detailUrl || '',
    playbackUrl: item.playbackUrl || '',
    rank: item.rank ?? '',
    searchUrl: item.searchUrl || '',
    seasonId: item.seasonId || '',
    sourcePageUrl: item.sourcePageUrl || '',
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
  renderDashboardRanking();
  renderFavorites();
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

  updateSelectionButton();
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

  state.tab = tabName;
  setMobileMenuOpen(false);
  document.querySelectorAll('.nav-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `${tabName}-view`);
  });

  if (tabName === 'history') {
    renderHistory();
  }

  if (tabName === 'favorites') {
    renderFavorites();
  }

  if (tabName === 'viewer') {
    refreshLibrary({ silent: true });
  }
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

function renderHeaderActions() {
  if (!state.snapshot || state.controlsDirty) {
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

function renderRankingSection(container, options) {
  if (!container) {
    return;
  }

  const items = options.items || [];
  container.innerHTML = `
    <div class="ranking-header">
      <div>
        <p class="eyebrow">${escapeHtml(options.eyebrow)}</p>
        <h2>${escapeHtml(options.title)}</h2>
      </div>
      <p class="muted">${escapeHtml(options.statusText)}</p>
    </div>

    ${
      items.length
        ? `<div class="ranking-grid">
            ${items
              .map((item) => {
                const key = getItemKey(item);
                const downloadKey = getDownloadKey(item);
                const playbackUrl = item.playbackUrl || buildPlaybackUrl(item);
                const favorite = isFavorite(item);
                const selectable = Boolean(options.allowDownloadSelection && state.downloadSelectionMode);
                const selectedForDownload = state.selectedDownloadKeys.has(downloadKey);
                const rankControl = selectable
                  ? `<label class="ranking-card-select ${selectedForDownload ? 'active' : ''}" title="ダウンロード対象に選択">
                      <input
                        type="checkbox"
                        data-download-select-key="${escapeHtml(downloadKey)}"
                        aria-label="${escapeHtml(item.title || '作品')}をダウンロード対象に選択"
                        ${selectedForDownload ? 'checked' : ''}
                      />
                      <span aria-hidden="true"></span>
                    </label>`
                  : `<span class="ranking-card-rank">${item.rank}</span>`;
                const thumbnail = item.thumbnailUrl
                  ? `<a class="ranking-card-image-link" href="${escapeHtml(playbackUrl)}" target="_blank" rel="noreferrer">
                      <img class="ranking-card-image" src="${escapeHtml(item.thumbnailUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
                    </a>`
                  : `<a class="ranking-card-image-link ranking-card-image-empty" href="${escapeHtml(playbackUrl)}" target="_blank" rel="noreferrer">No Image</a>`;

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
                          <a class="watch-button" href="${escapeHtml(playbackUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(item.title || '動画')}を再生" title="再生">
                            <span aria-hidden="true">▶</span>
                          </a>
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
  `;

  bindRankingCardActions(container, items);
}

function bindRankingCardActions(container, items) {
  const itemMap = new Map(items.map((item) => [getItemKey(item), item]));

  container.querySelectorAll('[data-download-select-key]').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.downloadSelectKey;
      toggleDownloadSelection(key, checkbox.checked);
      checkbox.closest('.ranking-card-select')?.classList.toggle('active', checkbox.checked);
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
}

function renderDashboardRanking() {
  const rankingItems = state.snapshot?.ranking?.items || [];

  renderRankingSection(elements.dashboardRanking, {
    allowDownloadSelection: true,
    emptyText: 'ランキングデータはまだありません。',
    eyebrow: '最新ランキング',
    items: rankingItems,
    statusText: rankingItems.length ? `${rankingItems.length}件を読み込み済み` : 'ランキング取得を実行するとここに表示されます。',
    title: 'ダウンロード候補'
  });
}

function renderFavorites() {
  const favoriteItems = Object.values(state.favorites).sort((left, right) => {
    const leftRank = Number(left.rank || 999999);
    const rightRank = Number(right.rank || 999999);
    return leftRank - rightRank || String(left.title || '').localeCompare(String(right.title || ''), 'ja');
  });

  renderRankingSection(elements.favoritesContent, {
    emptyText: 'お気に入りはまだありません。星を押すとここに保存されます。',
    eyebrow: 'お気に入り',
    items: favoriteItems,
    statusText: favoriteItems.length ? `${favoriteItems.length}件を保存中` : '星を押した作品だけを表示します。',
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

async function refreshState() {
  state.snapshot = await requestJson('/api/state');
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

  if (isHostedMode()) {
    document.querySelector('[data-tab="viewer"]')?.setAttribute('hidden', 'hidden');
    elements.settingsToggleButton?.setAttribute('hidden', 'hidden');
  }

  if (!elements.viewerDirectoryInput.value) {
    elements.viewerDirectoryInput.value = state.snapshot.settings.libraryDirectory;
  }
  elements.viewerAutoplayToggle.checked = Boolean(state.snapshot.settings.autoplayNext);
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
  if (state.tab !== 'viewer' || state.settingsOpen || state.thumbnailModalOpen || state.shortcutModalOpen) {
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

function bindStaticEvents() {
  document.querySelectorAll('.nav-button').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  elements.thumbnailModalBackdrop.addEventListener('click', closeThumbnailModal);
  elements.thumbnailModalCloseButton.addEventListener('click', closeThumbnailModal);
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
  document.addEventListener('keydown', handleViewerShortcuts, true);
  elements.mobileActionMedia.addEventListener('change', syncResponsiveActionPlacement);
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
  bindStaticEvents();
  switchTab('dashboard');

  await refreshState();
  await refreshHistory();
  await refreshLibrary({ silent: true });

  window.setInterval(async () => {
    try {
      await refreshState();
      await refreshHistory();
      if (state.tab === 'viewer' && state.viewerMode === 'server') {
        await refreshLibrary({ silent: true });
      }
    } catch {
      return;
    }
  }, 4000);
}

boot().catch((error) => {
  showMessage(error.message, 'error');
});
