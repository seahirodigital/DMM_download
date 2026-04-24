const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');

const { getPublicConfig, loadConfig, saveConfigPatch } = require('./lib/config');
const { DownloadManager } = require('./lib/download-manager');
const { resolvePlayableSource } = require('./lib/dmm-downloader');
const { fetchRanking } = require('./lib/ranking-service');
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
    const headers = {
      Origin: config.ranking.origin,
      Referer: refererUrl || config.ranking.referer,
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
    if (!seasonId) {
      throw new Error('Preview season parameter is required.');
    }

    const rankingItem = stateStore
      .getRanking()
      ?.items?.find((item) => String(item.seasonId || '') === seasonId || String(item.contentId || '') === contentId);

    if (rankingItem) {
      return {
        ...rankingItem,
        contentId: rankingItem.contentId || contentId || rankingItem.seasonId
      };
    }

    return {
      contentId: contentId || seasonId,
      detailUrl: `https://tv.dmm.com/vod/detail/?season=${encodeURIComponent(seasonId)}`,
      seasonId
    };
  }

  async function resolvePreviewSource(item) {
    const cacheKey = `${item.seasonId}:${item.contentId || item.seasonId}`;
    const cached = previewSourceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.source;
    }

    const source = await resolvePlayableSource(item, config);
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

  function buildPreviewAssetUrl(request, assetUrl, refererUrl) {
    const proxyUrl = new URL('/api/preview/asset', `http://${request.headers.host || '127.0.0.1'}`);
    proxyUrl.searchParams.set('url', encodeProxyUrl(assetUrl));
    proxyUrl.searchParams.set('referer', refererUrl || config.ranking.referer);
    return proxyUrl.pathname + proxyUrl.search;
  }

  function rewriteManifestAttribute(line, manifestUrl, request, refererUrl) {
    return line.replace(/(URI=)("[^"]*"|[^,]*)/i, (_, prefix, rawValue) => {
      const normalized = String(rawValue || '').replace(/^"|"$/g, '');
      const resolved = new URL(normalized, manifestUrl).toString();
      return `${prefix}"${buildPreviewAssetUrl(request, resolved, refererUrl)}"`;
    });
  }

  function rewriteMediaPlaylist(manifestUrl, manifestText, request, refererUrl) {
    return manifestText
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return line;
        }

        if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
          return rewriteManifestAttribute(line, manifestUrl, request, refererUrl);
        }

        if (trimmed.startsWith('#')) {
          return line;
        }

        const resolved = new URL(trimmed, manifestUrl).toString();
        return buildPreviewAssetUrl(request, resolved, refererUrl);
      })
      .join('\n');
  }

  async function proxyPreviewAsset(targetUrl, refererUrl, request, response) {
    const headers = buildPreviewHeaders(refererUrl);
    if (request.headers.range) {
      headers.Range = request.headers.range;
    }

    const remoteResponse = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
    });

    if (!remoteResponse.ok && remoteResponse.status !== 206) {
      throw new Error(`Failed to stream preview asset: ${remoteResponse.status} ${targetUrl}`);
    }

    const responseHeaders = {
      'Cache-Control': 'no-store',
      'Content-Type': remoteResponse.headers.get('content-type') || 'application/octet-stream'
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
    if (remoteResponse.body) {
      Readable.fromWeb(remoteResponse.body).pipe(response);
      return;
    }

    response.end();
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
    const source = await resolvePreviewSource(item);
    const refererUrl = source.detailUrl || item.detailUrl || config.ranking.referer;

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

    const rewrittenPlaylist = rewriteMediaPlaylist(manifestUrl, manifestText, request, refererUrl);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8'
    });
    response.end(rewrittenPlaylist);
  }

  async function handlePreviewInfo(url, response) {
    const item = buildPreviewItem(url);
    const source = await resolvePreviewSource(item);
    sendJson(response, 200, {
      playbackUrl: `/api/preview/play?${new URLSearchParams({
        content: item.contentId || item.seasonId,
        season: item.seasonId
      }).toString()}`,
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
    try {
      const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);

      if (request.method === 'GET' && url.pathname === '/api/state') {
        await handleState(url, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/ranking/fetch') {
        await handleFetchRanking(request, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/settings') {
        await handleSettings(request, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/session/cookie') {
        await handleSaveCookie(request, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/session/import-n8n-cookie') {
        await handleImportN8nCookie(response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/session/clear-cookie') {
        await handleClearCookie(response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/history') {
        await handleHistory(url, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/library') {
        await handleLibrary(url, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/preview/play') {
        await handlePreviewPlay(url, request, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/preview/info') {
        await handlePreviewInfo(url, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/preview/asset') {
        await handlePreviewAsset(url, request, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/download/start') {
        await handleDownloadStart(request, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/download/stop') {
        await handleDownloadStop(response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/video') {
        await handleVideoStream(url, request, response);
        return;
      }

      if (request.method === 'GET') {
        await serveStaticFile(response, publicDir, url.pathname);
        return;
      }

      sendText(response, 405, '許可されていないHTTPメソッドです。');
    } catch (error) {
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
