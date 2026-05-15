const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const { getPublicConfig, loadConfig, saveConfigPatch } = require('./lib/config');
const { DownloadManager } = require('./lib/download-manager');
const { extractBestPlayableSourceFromHtml, resolvePlayableSource } = require('./lib/dmm-downloader');
const { fetchActressSearch, fetchRanking } = require('./lib/ranking-service');
const { StateStore } = require('./lib/state-store');
const {
  appendCsvRows,
  expandUserProfile,
  isPathInside,
  sortByModifiedDesc
} = require('./lib/utils');

const STATIC_EXTENSIONS = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.ts']);
const VIDEO_CONTENT_TYPES = new Map([
  ['.m4v', 'video/mp4'],
  ['.mkv', 'video/x-matroska'],
  ['.mov', 'video/quicktime'],
  ['.mp4', 'video/mp4'],
  ['.ts', 'video/mp2t'],
  ['.webm', 'video/webm']
]);

function applyRuntimeConfig(target, source) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function normalizeCookieHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const withoutPrefix = raw.toLowerCase().startsWith('cookie:')
    ? raw.slice(raw.indexOf(':') + 1).trim()
    : raw;

  return withoutPrefix
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('; ')
    .replace(/\s*;\s*/g, '; ');
}

function findCookieInWorkflow(workflow) {
  const workflows = Array.isArray(workflow) ? workflow : [workflow];
  const candidates = [];

  for (const entry of workflows) {
    for (const node of entry?.nodes || []) {
      const jsonHeaders = node?.parameters?.jsonHeaders;
      if (!jsonHeaders) {
        continue;
      }

      try {
        const headers = JSON.parse(jsonHeaders);
        if (headers.Cookie) {
          candidates.push({
            cookieHeader: normalizeCookieHeader(headers.Cookie),
            nodeName: node.name || '名称未設定のHTTP Request'
          });
        }
      } catch {
        continue;
      }
    }
  }

  const rankingCandidate = candidates.find((candidate) => candidate.nodeName.includes('ランキング'));
  return rankingCandidate || candidates[0] || null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(message);
}

function parseAttributeList(line) {
  const attributes = {};
  const text = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

  for (const match of text.matchAll(pattern)) {
    attributes[match[1]] = match[2].replace(/^"|"$/g, '');
  }

  return attributes;
}

function parseMasterPlaylist(manifestUrl, manifestText) {
  const lines = manifestText.split(/\r?\n/).map((line) => line.trim());
  const variants = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('#EXT-X-STREAM-INF')) {
      continue;
    }

    const attributes = parseAttributeList(line);
    const nextLine = lines[index + 1];
    if (!nextLine || nextLine.startsWith('#')) {
      continue;
    }

    variants.push({
      bandwidth: Number(attributes.BANDWIDTH || 0),
      url: new URL(nextLine, manifestUrl).toString()
    });
  }

  if (!variants.length) {
    return null;
  }

  variants.sort((left, right) => right.bandwidth - left.bandwidth);
  return variants[0].url;
}

function encodeProxyUrl(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

function decodeProxyUrl(value) {
  return Buffer.from(String(value || ''), 'base64').toString('utf8');
}

function sanitizeUrlForLog(value) {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return String(value || '').split('?')[0];
  }
}

function isLitevideoPlaybackPageUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && /(?:^|\.)dmm\.co\.jp$/i.test(url.hostname) && /\/litevideo\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function buildHostedLitevideoPlayerUrl(value) {
  const url = new URL(value);
  const cid = /\/cid=([^/]+)/i.exec(url.pathname)?.[1];
  if (!cid) {
    return url.toString();
  }

  const mode = /\/litevideo\/-\/([^/]+)/i.exec(url.pathname)?.[1] || 'part';
  const affiId = /\/affi_id=([^/]+)/i.exec(url.pathname)?.[1] || url.searchParams.get('affi_id') || '';
  const playerUrl = new URL('https://www.dmm.co.jp/service/digitalapi/-/html5_player/=/');
  const parts = [
    `cid=${encodeURIComponent(decodeURIComponent(cid))}`,
    'mtype=AhRVShI_',
    'service=litevideo',
    `mode=${encodeURIComponent(decodeURIComponent(mode))}`,
    'width=1920',
    'height=1080',
    'forceAutoPlay=1'
  ];
  if (affiId) {
    parts.push(`affi_id=${encodeURIComponent(decodeURIComponent(affiId))}`);
  }
  playerUrl.pathname = `/service/digitalapi/-/html5_player/=/${parts.join('/')}/`;
  return playerUrl.toString();
}

function isExpectedStreamAbort(error, response) {
  const code = error?.code || error?.cause?.code;
  return (
    response.writableEnded ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    code === 'ABORT_ERR' ||
    code === 'ECONNRESET' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    code === 'UND_ERR_ABORTED' ||
    code === 'UND_ERR_SOCKET'
  );
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('リクエスト本文はJSON形式で送信してください。');
  }
}

async function serveStaticFile(response, publicDir, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.resolve(publicDir, `.${safePath}`);
  if (!isPathInside(publicDir, resolved)) {
    sendText(response, 403, 'アクセスできないパスです。');
    return;
  }

  const extension = path.extname(resolved).toLowerCase();
  const contentType = STATIC_EXTENSIONS.get(extension);
  if (!contentType) {
    sendText(response, 404, '見つかりません。');
    return;
  }

  try {
    const contents = await fsp.readFile(resolved);
    response.writeHead(200, {
      'Content-Type': contentType
    });
    response.end(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendText(response, 404, '見つかりません。');
      return;
    }
    throw error;
  }
}

async function listVideoFiles(directoryPath) {
  const results = [];

  async function walk(currentPath) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      const stats = await fsp.stat(fullPath);
      results.push({
        name: entry.name,
        path: fullPath,
        relativePath: path.relative(directoryPath, fullPath),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        modifiedAtTs: stats.mtimeMs
      });
    }
  }

  await walk(directoryPath);
  return sortByModifiedDesc(results);
}

function buildHistoryCsvRows(ranking) {
  return ranking.items.map((item) => ({
    actress: item.actress,
    detailUrl: item.playbackUrl || item.detailUrl,
    fetchedAt: item.fetchedAt,
    rank: item.rank,
    searchUrl: item.searchUrl,
    seasonId: item.seasonId,
    sourcePageUrl: item.sourcePageUrl || ranking.sourcePageUrl || '',
    thumbnailUrl: item.thumbnailUrl,
    title: item.title
  }));
}

function isActressSearchPath(pathname) {
  return pathname === '/api/search/actress' || pathname === '/search/actress' || pathname === '/actress';
}

async function createApp() {
  const config = await loadConfig();
  const hosted = config.appMode === 'hosted';
  const stateStore = new StateStore(config);
  await stateStore.init();

  const downloadManager = new DownloadManager(config, stateStore);
  const publicDir = path.join(process.cwd(), 'public');
  const rankingHistoryCsv = path.join(process.cwd(), 'data', 'history', 'ranking-history.csv');
  const previewSourceCache = new Map();
  const initialRankingCount = Math.max(1, Number(config.ranking.first || 15));
  const initialRankingMaxAgeMs = 10 * 60 * 1000;
  let latestRankingSyncPromise = null;

  function buildSnapshot() {
    const warnings = [];
    if (hosted) {
      warnings.push('Hosted mode is enabled. Downloading, local library access, and cookie persistence are disabled on Vercel.');
    }
    if (!config.dmm.cookieHeader) {
      warnings.push(
        'DMMのCookieが未設定です。ログインが必要な詳細ページは取得できません。'
      );
    }

    return {
      config: getPublicConfig(config),
      downloads: downloadManager.getStatus(),
      historySummary: stateStore.buildSummary(),
      ranking: stateStore.getRanking(),
      favorites: stateStore.getFavorites(),
      settings: stateStore.getSettings(),
      warnings
    };
  }

  function shouldRefreshInitialRanking(options = {}) {
    const ranking = stateStore.getRanking();
    const items = Array.isArray(ranking?.items) ? ranking.items : [];
    if (!items.length) {
      return true;
    }

    if (options.enforceCount && items.length !== initialRankingCount) {
      return true;
    }

    const expectedSourcePageUrl = stateStore.getSettings().rankingSourceUrl || config.ranking.sourcePageUrl;
    if ((ranking?.sourcePageUrl || '') !== expectedSourcePageUrl) {
      return true;
    }

    const fetchedAtMs = Date.parse(ranking?.fetchedAt || '');
    if (!Number.isFinite(fetchedAtMs)) {
      return true;
    }

    return Date.now() - fetchedAtMs > initialRankingMaxAgeMs;
  }

  async function loadLatestRanking(options = {}) {
    const currentSettings = stateStore.getSettings();
    const ranking = await fetchRanking(config, {
      first: Number.isFinite(Number(options.first)) ? Math.max(1, Number(options.first)) : initialRankingCount,
      sourcePageUrl: options.sourcePageUrl || currentSettings.rankingSourceUrl
    });
    await stateStore.setRanking(ranking);
    if (!hosted) {
      await appendCsvRows(
        rankingHistoryCsv,
        ['fetchedAt', 'rank', 'seasonId', 'title', 'actress', 'detailUrl', 'thumbnailUrl', 'searchUrl', 'sourcePageUrl'],
        buildHistoryCsvRows(ranking)
      );
    }
    return ranking;
  }

  async function ensureInitialRankingLoaded(options = {}) {
    if (!shouldRefreshInitialRanking(options)) {
      return stateStore.getRanking();
    }

    if (!latestRankingSyncPromise) {
      latestRankingSyncPromise = loadLatestRanking({
        first: options.enforceCount ? initialRankingCount : undefined
      }).finally(() => {
        latestRankingSyncPromise = null;
      });
    }

    return latestRankingSyncPromise;
  }

  function buildPreviewHeaders(refererUrl) {
    const referer = refererUrl || config.ranking.referer;
    let origin = config.ranking.origin;
    try {
      origin = new URL(referer).origin;
    } catch {}

    const headers = {
      Origin: origin,
      Referer: referer,
      'User-Agent': config.ranking.userAgent
    };

    if (config.dmm.cookieHeader) {
      headers.Cookie = config.dmm.cookieHeader;
    }

    return headers;
  }

  function buildPreviewItem(url) {
    const seasonId = String(url.searchParams.get('season') || '').trim();
    const contentId = String(url.searchParams.get('content') || seasonId).trim();
    const rawPlaybackUrl = String(url.searchParams.get('playback') || '').trim();
    const rawDetailUrl = String(url.searchParams.get('detail') || '').trim();
    let playbackUrl = '';
    let detailUrl = '';

    if (rawPlaybackUrl) {
      const parsedPlaybackUrl = new URL(rawPlaybackUrl);
      if (!/^https?:$/i.test(parsedPlaybackUrl.protocol)) {
        throw new Error('Unsupported preview playback URL.');
      }
      playbackUrl = parsedPlaybackUrl.toString();
    }

    if (rawDetailUrl) {
      const parsedDetailUrl = new URL(rawDetailUrl);
      if (!/^https?:$/i.test(parsedDetailUrl.protocol)) {
        throw new Error('Unsupported preview detail URL.');
      }
      detailUrl = parsedDetailUrl.toString();
    }

    if (!seasonId && !playbackUrl && !detailUrl) {
      throw new Error('Preview season, playback, or detail parameter is required.');
    }

    const rankingItem = stateStore
      .getRanking()
      ?.items?.find(
        (item) =>
          (seasonId && String(item.seasonId || '') === seasonId) ||
          (contentId && String(item.contentId || '') === contentId)
      );

    if (rankingItem) {
      return {
        ...rankingItem,
        contentId: rankingItem.contentId || contentId || rankingItem.seasonId,
        detailUrl: detailUrl || rankingItem.detailUrl,
        playbackUrl: playbackUrl || rankingItem.playbackUrl
      };
    }

    const fallbackDetailUrl = seasonId
      ? `https://tv.dmm.com/vod/detail/?season=${encodeURIComponent(seasonId)}`
      : config.ranking.referer;

    return {
      contentId: contentId || seasonId,
      detailUrl: detailUrl || fallbackDetailUrl,
      playbackUrl,
      seasonId
    };
  }

  function buildPreviewPlaybackParams(item, options = {}) {
    const params = new URLSearchParams();
    if (item.seasonId) {
      params.set('season', item.seasonId);
    }
    if (item.contentId || item.seasonId) {
      params.set('content', item.contentId || item.seasonId);
    }
    if (item.playbackUrl && !item.seasonId) {
      params.set('playback', item.playbackUrl);
    }
    if (item.detailUrl && !item.seasonId) {
      params.set('detail', item.detailUrl);
    }
    if (options.forceRefresh) {
      params.set('refresh', '1');
    }
    if (options.session) {
      params.set('_preview', options.session);
    }
    return params;
  }

  async function resolvePreviewSource(item, options = {}) {
    const cacheKey = `${item.seasonId || ''}:${item.contentId || item.seasonId || item.playbackUrl || item.detailUrl || ''}`;
    const cached = previewSourceCache.get(cacheKey);
    if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.source;
    }

    const source = await resolvePlayableSource(item, config);
    previewSourceCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      source
    });
    return source;
  }

  async function resolveHostedLitevideoSource(item) {
    const playerUrl = buildHostedLitevideoPlayerUrl(item.playbackUrl);
    const cacheKey = `hosted-litevideo:${playerUrl}`;
    const cached = previewSourceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.source;
    }

    const response = await fetch(playerUrl, {
      headers: buildPreviewHeaders(item.detailUrl || item.playbackUrl || playerUrl),
      signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch hosted litevideo player: ${response.status} ${playerUrl}`);
    }

    const extracted = extractBestPlayableSourceFromHtml(await response.text(), playerUrl);
    if (!extracted?.url) {
      throw new Error(`Failed to extract hosted litevideo media source: ${playerUrl}`);
    }

    const source = {
      detailUrl: playerUrl,
      extractor: 'hosted-litevideo-html5-player',
      signal: extracted.signal,
      type: extracted.type || 'direct',
      url: extracted.url
    };
    previewSourceCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      source
    });
    return source;
  }

  async function fetchPreviewText(targetUrl, refererUrl) {
    const response = await fetch(targetUrl, {
      headers: buildPreviewHeaders(refererUrl),
      signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch preview manifest: ${response.status} ${targetUrl}`);
    }

    return response.text();
  }

  function buildPreviewAssetUrl(request, assetUrl, refererUrl, previewSession = '') {
    if (hosted) {
      return assetUrl;
    }

    const proxyUrl = new URL('/api/preview/asset', `http://${request.headers.host || '127.0.0.1'}`);
    proxyUrl.searchParams.set('url', encodeProxyUrl(assetUrl));
    proxyUrl.searchParams.set('referer', refererUrl || config.ranking.referer);
    if (previewSession) {
      proxyUrl.searchParams.set('_preview', previewSession);
    }
    return proxyUrl.pathname + proxyUrl.search;
  }

  function rewriteManifestAttribute(line, manifestUrl, request, refererUrl, previewSession = '') {
    return line.replace(/(URI=)("[^"]*"|[^,]*)/i, (_, prefix, rawValue) => {
      const normalized = String(rawValue || '').replace(/^"|"$/g, '');
      const resolved = new URL(normalized, manifestUrl).toString();
      return `${prefix}"${buildPreviewAssetUrl(request, resolved, refererUrl, previewSession)}"`;
    });
  }

  function rewriteMediaPlaylist(manifestUrl, manifestText, request, refererUrl, previewSession = '') {
    return manifestText
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return line;
        }

        if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
          return rewriteManifestAttribute(line, manifestUrl, request, refererUrl, previewSession);
        }

        if (trimmed.startsWith('#')) {
          return line;
        }

        const resolved = new URL(trimmed, manifestUrl).toString();
        return buildPreviewAssetUrl(request, resolved, refererUrl, previewSession);
      })
      .join('\n');
  }

  function inferPreviewContentType(targetUrl, remoteContentType) {
    const normalizedContentType = String(remoteContentType || '').toLowerCase();
    if (
      normalizedContentType &&
      normalizedContentType !== 'application/octet-stream' &&
      normalizedContentType !== 'binary/octet-stream'
    ) {
      return remoteContentType;
    }

    try {
      const parsed = new URL(targetUrl);
      if (/\.m3u8(\?|$)/i.test(parsed.toString())) {
        return 'application/vnd.apple.mpegurl';
      }
      if (/\.(mp4|m4v)(\?|$)/i.test(parsed.toString()) || /\/(?:litevideo|freepv|sample)\//i.test(parsed.pathname)) {
        return 'video/mp4';
      }
      if (/\.webm(\?|$)/i.test(parsed.toString())) {
        return 'video/webm';
      }
      if (/\.mov(\?|$)/i.test(parsed.toString())) {
        return 'video/quicktime';
      }
    } catch {}

    return remoteContentType || 'application/octet-stream';
  }

  async function proxyPreviewAsset(targetUrl, refererUrl, request, response) {
    const headers = buildPreviewHeaders(refererUrl);
    if (request.headers.range) {
      headers.Range = request.headers.range;
    }

    const controller = new AbortController();
    const headerTimeout = setTimeout(() => {
      controller.abort();
    }, config.downloads.requestTimeoutMs);

    let remoteResponse;
    try {
      remoteResponse = await fetch(targetUrl, {
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(headerTimeout);
    }

    if (!remoteResponse.ok && remoteResponse.status !== 206) {
      console.error('[preview/asset] upstream rejected media request', {
        contentType: remoteResponse.headers.get('content-type') || '',
        status: remoteResponse.status,
        targetUrl: sanitizeUrlForLog(targetUrl)
      });
      throw new Error(`Failed to stream preview asset: ${remoteResponse.status} ${sanitizeUrlForLog(targetUrl)}`);
    }

    const responseHeaders = {
      'Cache-Control': 'no-store',
      'Content-Type': inferPreviewContentType(targetUrl, remoteResponse.headers.get('content-type'))
    };

    for (const [headerName, headerValue] of [
      ['Accept-Ranges', remoteResponse.headers.get('accept-ranges')],
      ['Content-Length', remoteResponse.headers.get('content-length')],
      ['Content-Range', remoteResponse.headers.get('content-range')]
    ]) {
      if (headerValue) {
        responseHeaders[headerName] = headerValue;
      }
    }

    response.writeHead(remoteResponse.status, responseHeaders);
    if (!remoteResponse.body) {
      response.end();
      return;
    }

    let streamCompleted = false;
    const abortRemoteStream = () => {
      if (!streamCompleted && !response.writableEnded) {
        controller.abort();
      }
    };

    response.once('close', abortRemoteStream);

    try {
      await pipeline(Readable.fromWeb(remoteResponse.body), response);
      streamCompleted = true;
    } catch (error) {
      if (!isExpectedStreamAbort(error, response)) {
        console.error('Preview asset stream failed:', error);
      }

      if (!response.destroyed && !response.writableEnded) {
        response.destroy();
      }
    } finally {
      streamCompleted = true;
      response.off('close', abortRemoteStream);
    }
  }

  async function handleState(url, response) {
    if (url.searchParams.get('initial') === '1') {
      try {
        await ensureInitialRankingLoaded({
          enforceCount: true
        });
      } catch (error) {
        console.error('Failed to auto-load initial ranking:', error);
      }
    }
    sendJson(response, 200, buildSnapshot());
  }

  async function handleFetchRanking(request, response) {
    const body = await readRequestBody(request);
    const ranking = await loadLatestRanking({
      first: body.first,
      sourcePageUrl: body.sourcePageUrl
    });

    sendJson(response, 200, {
      ok: true,
      ranking
    });
  }

  async function handleActressSearch(url, request, response) {
    const body = request.method === 'GET' ? {} : await readRequestBody(request);
    const keyword = body.keyword || body.actress || url.searchParams.get('keyword') || url.searchParams.get('actress');
    const search = await fetchActressSearch(config, {
      actress: keyword,
      keyword,
      maxPages: body.maxPages || url.searchParams.get('maxPages'),
      pageSize: body.pageSize || url.searchParams.get('pageSize'),
      provider: body.provider || url.searchParams.get('provider') || url.searchParams.get('site'),
      searchType: body.searchType || body.type || url.searchParams.get('searchType') || url.searchParams.get('type'),
      stopAfterItems: body.stopAfterItems || url.searchParams.get('stopAfterItems')
    });

    sendJson(response, 200, {
      ok: true,
      search
    });
  }

  async function saveCookieHeader(cookieHeader) {
    const normalizedCookie = normalizeCookieHeader(cookieHeader);
    if (!normalizedCookie) {
      throw new Error('Cookieが空です。DMMにログインしたブラウザのRequest HeadersからCookieの値を貼り付けてください。');
    }

    const nextConfig = await saveConfigPatch({
      dmm: {
        cookieHeader: normalizedCookie
      }
    });
    applyRuntimeConfig(config, nextConfig);

    return {
      hasCookie: Boolean(config.dmm.cookieHeader),
      length: config.dmm.cookieHeader.length
    };
  }

  async function handleSaveCookie(request, response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Hosted mode does not allow saving cookies.'
      });
      return;
    }

    const body = await readRequestBody(request);
    const result = await saveCookieHeader(body.cookieHeader);
    sendJson(response, 200, {
      ok: true,
      result
    });
  }

  async function handleImportN8nCookie(response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Hosted mode does not allow importing cookies.'
      });
      return;
    }

    const workflowPath = path.join(process.cwd(), 'reference', 'DMM動画ダウンロードワークフロー.json');
    let workflow;
    try {
      workflow = JSON.parse(await fsp.readFile(workflowPath, 'utf8'));
    } catch (error) {
      throw new Error(`n8nワークフローを読み込めませんでした: ${error.message}`);
    }

    const candidate = findCookieInWorkflow(workflow);
    if (!candidate?.cookieHeader) {
      throw new Error('n8nワークフロー内のHTTP RequestからCookieヘッダーを見つけられませんでした。');
    }

    const result = await saveCookieHeader(candidate.cookieHeader);
    sendJson(response, 200, {
      ok: true,
      importedFrom: candidate.nodeName,
      result
    });
  }

  async function handleClearCookie(response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Hosted mode does not allow clearing cookies.'
      });
      return;
    }

    const nextConfig = await saveConfigPatch({
      dmm: {
        cookieHeader: ''
      }
    });
    applyRuntimeConfig(config, nextConfig);
    sendJson(response, 200, {
      ok: true
    });
  }

  async function handleSettings(request, response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Hosted mode does not allow changing local settings.'
      });
      return;
    }

    const body = await readRequestBody(request);
    const nextSettings = {};

    if (body.downloadLimit !== undefined) {
      const parsedLimit = Number(body.downloadLimit);
      nextSettings.downloadLimit = Number.isFinite(parsedLimit)
        ? Math.max(1, parsedLimit)
        : config.downloads.defaultLimit;
    }
    if (body.rankingFetchCount !== undefined) {
      const parsedCount = Number(body.rankingFetchCount);
      nextSettings.rankingFetchCount = Number.isFinite(parsedCount)
        ? Math.max(1, Math.min(100, parsedCount))
        : config.ranking.first;
    }
    if (body.filenameTemplate !== undefined) {
      nextSettings.filenameTemplate = String(body.filenameTemplate || config.downloads.filenameTemplate).trim();
    }
    if (body.libraryDirectory !== undefined) {
      nextSettings.libraryDirectory = expandUserProfile(String(body.libraryDirectory || config.paths.downloadDir).trim());
    }
    if (body.rankingSourceUrl !== undefined) {
      const rankingSourceUrl = String(body.rankingSourceUrl || config.ranking.sourcePageUrl).trim();
      try {
        nextSettings.rankingSourceUrl = new URL(rankingSourceUrl).toString();
      } catch {
        throw new Error('ランキング取得元URLが正しいURL形式ではありません。');
      }
    }
    if (body.autoplayNext !== undefined) {
      nextSettings.autoplayNext = Boolean(body.autoplayNext);
    }

    const settings = await stateStore.saveSettings(nextSettings);
    sendJson(response, 200, {
      ok: true,
      settings
    });
  }

  async function handleGetFavorites(response) {
    sendJson(response, 200, {
      favorites: stateStore.getFavorites()
    });
  }

  async function handleSaveFavorites(request, response) {
    const body = await readRequestBody(request);
    const favorites = await stateStore.setFavorites(body.favorites || {});
    sendJson(response, 200, {
      ok: true,
      favorites
    });
  }

  async function handleHistory(url, response) {
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit') || 250)));
    sendJson(response, 200, {
      items: stateStore.listHistory(limit)
    });
  }

  async function handleLibrary(url, response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Hosted mode does not provide local library access.',
        items: []
      });
      return;
    }

    const requestedDirectory = url.searchParams.get('dir');
    const libraryDirectory = requestedDirectory
      ? expandUserProfile(requestedDirectory)
      : stateStore.getSettings().libraryDirectory;

    try {
      const items = await listVideoFiles(libraryDirectory);
      sendJson(response, 200, {
        directory: libraryDirectory,
        items
      });
    } catch (error) {
      sendJson(response, 200, {
        directory: libraryDirectory,
        error: error.message,
        items: []
      });
    }
  }

  async function handleDownloadStart(request, response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Downloading is disabled in hosted mode.'
      });
      return;
    }

    const body = await readRequestBody(request);
    const ranking = stateStore.getRanking();
    if (!ranking?.items?.length) {
      sendJson(response, 400, {
        error: 'ランキングが未取得です。先にランキング取得を実行してください。'
      });
      return;
    }

    const settings = stateStore.getSettings();
    const requestedSeasonIds = Array.isArray(body.seasonIds)
      ? body.seasonIds.map((seasonId) => String(seasonId || '')).filter(Boolean)
      : [];
    const selectedItems = requestedSeasonIds.length
      ? requestedSeasonIds
          .map((seasonId) => ranking.items.find((item) => String(item.seasonId) === seasonId))
          .filter(Boolean)
      : ranking.items;

    if (requestedSeasonIds.length && selectedItems.length !== requestedSeasonIds.length) {
      sendJson(response, 400, {
        error: '選択された動画が現在のランキング内に見つかりません。'
      });
      return;
    }

    const parsedCount = Number(body.count);
    const sourceItems = requestedSeasonIds.length ? selectedItems : ranking.items;
    const limit = Math.max(
      1,
      Math.min(sourceItems.length, Number.isFinite(parsedCount) ? parsedCount : settings.downloadLimit)
    );
    const result = await downloadManager.start(sourceItems, limit, settings);
    sendJson(response, 200, {
      ok: true,
      result
    });
  }

  async function handleDownloadStop(response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Downloading is disabled in hosted mode.'
      });
      return;
    }

    const result = await downloadManager.stop();
    sendJson(response, 200, {
      ok: true,
      result
    });
  }

  async function handleVideoStream(url, request, response) {
    if (hosted) {
      sendJson(response, 403, {
        error: 'Hosted mode does not provide local video streaming.'
      });
      return;
    }

    const filePath = url.searchParams.get('path');
    if (!filePath) {
      sendJson(response, 400, {
        error: '動画ファイルのパスが指定されていません。'
      });
      return;
    }

    const allowedRoots = [config.paths.downloadDir, stateStore.getSettings().libraryDirectory].filter(Boolean);

    if (!allowedRoots.some((root) => isPathInside(root, filePath))) {
      sendJson(response, 403, {
        error: '指定されたファイルは許可されたライブラリフォルダの外にあります。'
      });
      return;
    }

    let stats;
    try {
      stats = await fsp.stat(filePath);
    } catch {
      sendJson(response, 404, {
        error: '動画ファイルが見つかりません。'
      });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = VIDEO_CONTENT_TYPES.get(extension) || 'application/octet-stream';

    const range = request.headers.range;
    if (!range) {
      response.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': stats.size,
        'Content-Type': contentType
      });
      fs.createReadStream(filePath).pipe(response);
      return;
    }

    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416);
      response.end();
      return;
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stats.size - 1;

    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Content-Type': contentType
    });

    fs.createReadStream(filePath, { start, end }).pipe(response);
  }

  async function handlePreviewPlay(url, request, response) {
    const item = buildPreviewItem(url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const previewSession = String(url.searchParams.get('_preview') || '');
    if (hosted && !item.seasonId && isLitevideoPlaybackPageUrl(item.playbackUrl)) {
      try {
        const source = await resolveHostedLitevideoSource(item);
        response.writeHead(302, {
          'Cache-Control': 'no-store',
          Location: source.url
        });
        response.end();
        return;
      } catch (error) {
        console.error('[preview/play] hosted litevideo FullHD extraction failed; falling back to iframe', {
          error: error.message,
          playbackUrl: sanitizeUrlForLog(item.playbackUrl)
        });
      }

      response.writeHead(302, {
        'Cache-Control': 'no-store',
        Location: buildHostedLitevideoPlayerUrl(item.playbackUrl)
      });
      response.end();
      return;
    }

    const source = await resolvePreviewSource(item, { forceRefresh });
    const refererUrl = source.detailUrl || item.detailUrl || config.ranking.referer;

    if (hosted) {
      if (source.type !== 'hls') {
        await proxyPreviewAsset(source.url, refererUrl, request, response);
        return;
      }

      response.writeHead(302, {
        'Cache-Control': 'no-store',
        Location: source.url
      });
      response.end();
      return;
    }

    if (source.type !== 'hls') {
      await proxyPreviewAsset(source.url, refererUrl, request, response);
      return;
    }

    let manifestUrl = source.url;
    let manifestText = await fetchPreviewText(manifestUrl, refererUrl);
    const highestVariantUrl = parseMasterPlaylist(manifestUrl, manifestText);
    if (highestVariantUrl) {
      manifestUrl = highestVariantUrl;
      manifestText = await fetchPreviewText(manifestUrl, refererUrl);
    }

    const rewrittenPlaylist = rewriteMediaPlaylist(manifestUrl, manifestText, request, refererUrl, previewSession);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8'
    });
    response.end(rewrittenPlaylist);
  }

  async function handlePreviewInfo(url, response) {
    const item = buildPreviewItem(url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const previewSession = String(url.searchParams.get('_preview') || Date.now());
    if (hosted && !item.seasonId && isLitevideoPlaybackPageUrl(item.playbackUrl)) {
      try {
        const source = await resolveHostedLitevideoSource(item);
        sendJson(response, 200, {
          playbackUrl: source.url,
          type: source.type || 'direct'
        });
        return;
      } catch (error) {
        console.error('[preview/info] hosted litevideo FullHD extraction failed; falling back to iframe', {
          error: error.message,
          playbackUrl: sanitizeUrlForLog(item.playbackUrl)
        });
      }

      sendJson(response, 200, {
        playbackUrl: buildHostedLitevideoPlayerUrl(item.playbackUrl),
        type: 'iframe'
      });
      return;
    }

    if (hosted && !item.seasonId && !item.playbackUrl && !item.detailUrl) {
      sendJson(response, 400, {
        error: 'Hosted preview requires a sample playback URL or detail URL for search results.'
      });
      return;
    }

    const source = await resolvePreviewSource(item, { forceRefresh });
    const proxiedPlaybackUrl = `/api/preview/play?${buildPreviewPlaybackParams(item, {
      forceRefresh,
      session: previewSession
    }).toString()}`;

    sendJson(response, 200, {
      playbackUrl: hosted && source.type === 'hls' ? source.url : proxiedPlaybackUrl,
      type: source.type || 'direct'
    });
  }

  async function handlePreviewAsset(url, request, response) {
    const encodedUrl = url.searchParams.get('url');
    const refererUrl = url.searchParams.get('referer') || config.ranking.referer;
    if (!encodedUrl) {
      sendJson(response, 400, {
        error: 'Preview asset url is required.'
      });
      return;
    }

    const targetUrl = decodeProxyUrl(encodedUrl);
    const parsed = new URL(targetUrl);
    if (!/^https?:$/i.test(parsed.protocol)) {
      sendJson(response, 400, {
        error: 'Unsupported preview asset protocol.'
      });
      return;
    }

    await proxyPreviewAsset(parsed.toString(), refererUrl, request, response);
  }

  const requestHandler = async (request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);

      if (request.method === 'GET' && requestUrl.pathname === '/api/state') {
        await handleState(requestUrl, response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/ranking/fetch') {
        await handleFetchRanking(request, response);
        return;
      }

      if ((request.method === 'GET' || request.method === 'POST') && isActressSearchPath(requestUrl.pathname)) {
        await handleActressSearch(requestUrl, request, response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/settings') {
        await handleSettings(request, response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/favorites') {
        await handleGetFavorites(response);
        return;
      }

      if (request.method === 'PUT' && requestUrl.pathname === '/api/favorites') {
        await handleSaveFavorites(request, response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/session/cookie') {
        await handleSaveCookie(request, response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/session/import-n8n-cookie') {
        await handleImportN8nCookie(response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/session/clear-cookie') {
        await handleClearCookie(response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/history') {
        await handleHistory(requestUrl, response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/library') {
        await handleLibrary(requestUrl, response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/preview/play') {
        await handlePreviewPlay(requestUrl, request, response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/preview/info') {
        await handlePreviewInfo(requestUrl, response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/preview/asset') {
        await handlePreviewAsset(requestUrl, request, response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/download/start') {
        await handleDownloadStart(request, response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/download/stop') {
        await handleDownloadStop(response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/video') {
        await handleVideoStream(requestUrl, request, response);
        return;
      }

      if (request.method === 'GET') {
        await serveStaticFile(response, publicDir, requestUrl.pathname);
        return;
      }

      sendText(response, 405, '許可されていないHTTPメソッドです。');
    } catch (error) {
      if (response.headersSent) {
        if (!response.destroyed) {
          response.destroy(error);
        }
        return;
      }
      console.error('[request] handler failed', {
        error: error.message,
        method: request.method,
        pathname: requestUrl?.pathname || ''
      });
      sendJson(response, 500, {
        error: error.message
      });
    }
  };

  const server = http.createServer(requestHandler);

  return {
    config,
    requestHandler,
    server
  };
}

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }

  return appPromise;
}

async function handler(request, response) {
  const app = await getApp();
  return app.requestHandler(request, response);
}

async function main() {
  const app = await createApp();
  app.server.listen(app.config.app.port, app.config.app.host, () => {
    console.log(`動画視聴: http://${app.config.app.host}:${app.config.app.port}`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = handler;
module.exports.createApp = createApp;
