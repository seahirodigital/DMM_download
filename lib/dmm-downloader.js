const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_VIDEO_SELECTORS = [
  '#sample-video',
  'div[data-name="player-cover"]',
  'a.fn-sampleVideoBtn[onclick*="video_url"]'
];
const LITEVIDEO_QUALITY_SIZES = ['1920_1080', '1280_720', '720_480', '644_414', '560_360', '476_306'];

const FETCH_VIDEO_SAMPLE_QUERY = `
query FetchVideoSample($seasonId: ID!) {
  video(id: $seasonId) {
    id
    __typename
    titleName
    seasonName
    ... on VideoLegacySeason {
      sampleMovie {
        url
        thumbnail
      }
      content {
        id
      }
    }
    ... on VideoSeason {
      episodes(type: PV, first: 1) {
        edges {
          node {
            id
            sampleMovie
          }
        }
      }
    }
    ... on VideoShortSeason {
      episodes(type: PV, first: 1) {
        edges {
          node {
            id
            sampleMovie
          }
        }
      }
    }
    ... on VideoSpotLiveSeason {
      episodes(type: PV, first: 1) {
        edges {
          node {
            id
            sampleMovie
          }
        }
      }
    }
  }
}
`;

const SEARCH_VIDEO_FOR_PREVIEW_QUERY = `
query FetchSearchVideosForPreview($device: Device!, $keyword: String, $categories: [ID!], $sort: VideoSearchSortKey, $first: Int) {
  searchVideos(device: $device, keyword: $keyword, categories: $categories, sort: $sort, first: $first) {
    edges {
      node {
        id
        titleName
        seasonName
      }
    }
  }
}
`;

function buildDmmHeaders(config) {
  return buildDmmSiteHeaders(config, config.ranking.referer);
}

function getHttpOrigin(value) {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
}

function buildDmmSiteHeaders(config, refererUrl) {
  const referer = refererUrl || config.ranking.referer;
  const headers = {
    Origin: getHttpOrigin(referer) || config.ranking.origin,
    Referer: referer,
    'User-Agent': config.ranking.userAgent
  };

  if (config.dmm.cookieHeader) {
    headers.Cookie = config.dmm.cookieHeader;
  }

  return headers;
}

function buildDmmTvPlaybackUrl(seasonId, contentId = seasonId) {
  const url = new URL('https://tv.dmm.com/vod/playback/on-demand/');
  url.searchParams.set('season', seasonId);
  url.searchParams.set('content', contentId);
  url.searchParams.set('mode', 'sample');
  return url.toString();
}

function buildDmmTvDetailUrl(seasonId) {
  const url = new URL('https://tv.dmm.com/vod/detail/');
  url.searchParams.set('season', seasonId);
  return url.toString();
}

function isLikelyDirectMediaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!/^https?:$/i.test(url.protocol)) {
    return false;
  }

  const normalized = url.toString();
  return /\.(m3u8|mp4|m4v|mov|webm)(\?|$)/i.test(normalized);
}

function isPotentialFanzaMediaUrl(value) {
  try {
    const url = new URL(value);
    return (
      /^https?:$/i.test(url.protocol) &&
      /(?:^|\.)dmm\.co\.jp$/i.test(url.hostname) &&
      /(?:\/litevideo\/|\/freepv\/|\/sample\/)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isLitevideoPageUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && /(?:^|\.)dmm\.co\.jp$/i.test(url.hostname) && /\/litevideo\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function litevideoUrlWithQuality(value, qualitySize = LITEVIDEO_QUALITY_SIZES[0]) {
  try {
    const url = new URL(value);
    if (/\.(m3u8|mp4|m4v|mov|webm)$/i.test(url.pathname)) {
      return url.toString();
    }

    if (!/\/litevideo\//i.test(url.pathname)) {
      return url.toString();
    }

    if (/\/size=[^/]+/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/size=[^/]+/i, `/size=${qualitySize}`);
    } else {
      url.pathname = url.pathname.replace(/\/?$/, `/size=${qualitySize}/`);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function preferHighQualityLitevideoUrl(value) {
  return litevideoUrlWithQuality(value, LITEVIDEO_QUALITY_SIZES[0]);
}

function getLitevideoQualityUrls(value) {
  const urls = LITEVIDEO_QUALITY_SIZES.map((qualitySize) => litevideoUrlWithQuality(value, qualitySize));
  try {
    urls.push(new URL(value).toString());
  } catch {
    if (value) {
      urls.push(value);
    }
  }
  return [...new Set(urls.filter(Boolean))];
}

function mediaTypeFromUrl(value) {
  if (/\.m3u8(\?|$)/i.test(value)) {
    return 'hls';
  }
  return 'direct';
}

function mediaTypeFromContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('mpegurl') || normalized.includes('application/vnd.apple.mpegurl')) {
    return 'hls';
  }
  if (normalized.startsWith('video/') || normalized.includes('mp4')) {
    return 'direct';
  }
  return '';
}

async function probeMediaSource(url, headers, config) {
  const response = await fetch(url, {
    headers: {
      ...headers,
      Range: 'bytes=0-0'
    },
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });

  if (response.body && typeof response.body.cancel === 'function') {
    await response.body.cancel().catch(() => {});
  }

  if (!response.ok && response.status !== 206) {
    return null;
  }

  const type = mediaTypeFromContentType(response.headers.get('content-type'));
  return type
    ? {
        type,
        url: response.url || url
      }
    : null;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function decodeEscapedText(text) {
  return decodeHtmlEntities(String(text || ''))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, value) => String.fromCharCode(Number.parseInt(value, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, value) => String.fromCharCode(Number.parseInt(value, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003a/gi, ':')
    .replace(/\\u003f/gi, '?')
    .replace(/\\u0026/gi, '&');
}

function normalizeCandidateValue(value) {
  return decodeEscapedText(value)
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mediaScore(url) {
  let total = 0;
  if (/\.m3u8(\?|$)/i.test(url)) total += 60;
  if (/master|playlist|index/i.test(url)) total += 20;
  if (/\.(mp4|m4v|mov|webm)(\?|$)/i.test(url)) total += 15;
  if (/sample|trailer|playback|stream/i.test(url)) total += 8;
  const sizeMatch = /(?:size=|[/?_-])(\d{3,4})[_x](\d{3,4})(?:[/?_.-]|$)/i.exec(url);
  if (sizeMatch) {
    total += Math.round(Number(sizeMatch[2]) / 10);
  }
  const qualityMatch = /(\d{3,4})p/i.exec(url);
  if (qualityMatch) {
    total += Math.round(Number(qualityMatch[1]) / 10);
  }
  if (/subtitle|caption|vtt/i.test(url)) total -= 100;
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)) total -= 120;
  return total;
}

function registerCandidate(candidateMap, value, baseUrl, priority, source) {
  const normalized = normalizeCandidateValue(value);
  if (!normalized) {
    return;
  }

  let resolved;
  try {
    resolved = new URL(normalized, baseUrl).toString();
  } catch {
    return;
  }

  if (mediaScore(resolved) <= -100) {
    return;
  }

  const existing = candidateMap.get(resolved);
  if (existing) {
    existing.priority = Math.max(existing.priority, priority);
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }
    return;
  }

  candidateMap.set(resolved, {
    priority,
    sources: [source],
    url: resolved
  });
}

function getHtmlAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(tag);
  return match ? decodeEscapedText(match[2] || match[3] || match[4] || '') : '';
}

function extractVideoUrlValues(text) {
  const normalized = decodeEscapedText(text).replace(/\\"/g, '"').replace(/\\'/g, "'");
  const values = [];
  const patterns = [
    /["']video_url["']\s*:\s*["']([^"']+)["']/gi,
    /\bvideo_url\s*[:=]\s*["']([^"']+)["']/gi,
    /\bvideoUrl\s*[:=]\s*["']([^"']+)["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      if (match[1]) {
        values.push(match[1]);
      }
    }
  }

  return values;
}

function findBalancedObjectText(text, assignmentPattern) {
  const assignmentMatch = assignmentPattern.exec(text);
  if (!assignmentMatch) {
    return '';
  }

  const objectStart = text.indexOf('{', assignmentMatch.index);
  if (objectStart < 0) {
    return '';
  }

  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = objectStart; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(objectStart, index + 1);
      }
    }
  }

  return '';
}

function parsePlayerArgs(text) {
  const objectText = findBalancedObjectText(text, /\b(?:const|let|var)\s+args\s*=/i);
  if (!objectText) {
    return null;
  }

  try {
    return JSON.parse(objectText);
  } catch {
    return null;
  }
}

function qualityScore(value) {
  const text = String(value || '');
  const match = /(\d{3,4})\s*p/i.exec(text);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}

function collectPlayerArgsCandidates(text, baseUrl) {
  const args = parsePlayerArgs(text);
  if (!args) {
    return [];
  }

  const candidates = [];
  if (args.src) {
    candidates.push({
      label: 'player-src',
      score: qualityScore(args.bitrate || args.label || ''),
      url: args.src
    });
  }

  if (Array.isArray(args.bitrates)) {
    for (const bitrate of args.bitrates) {
      if (bitrate?.src) {
        candidates.push({
          label: bitrate.bitrate || 'player-bitrate',
          score: qualityScore(bitrate.bitrate),
          url: bitrate.src
        });
      }
    }
  }

  return candidates
    .map((candidate) => {
      try {
        return {
          ...candidate,
          url: new URL(normalizeCandidateValue(candidate.url), baseUrl).toString()
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function collectCandidateUrls(text, baseUrl) {
  const normalized = decodeEscapedText(text);
  const rawMatches = [];
  const patterns = [
    /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi,
    /https?:\/\/[^\s"'<>\\]+(?:\.mp4|\.m4v|\.mov|\.webm)[^\s"'<>\\]*/gi,
    /"(\/[^"]+\.(?:m3u8|mp4|m4v|mov|webm)[^"]*)"/gi,
    /'(\/[^']+\.(?:m3u8|mp4|m4v|mov|webm)[^']*)'/gi
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = match[1] || match[0];
      try {
        rawMatches.push(new URL(value, baseUrl).toString());
      } catch {
        continue;
      }
    }
  }

  const unique = [...new Set(rawMatches)];
  unique.sort((left, right) => mediaScore(right) - mediaScore(left));
  return unique;
}

function collectScriptJsonUrls(text, baseUrl) {
  const urls = [];
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;

  function walk(value) {
    if (typeof value === 'string') {
      for (const candidate of collectCandidateUrls(value, baseUrl)) {
        urls.push(candidate);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry);
      }
      return;
    }

    if (value && typeof value === 'object') {
      for (const entry of Object.values(value)) {
        walk(entry);
      }
    }
  }

  for (const match of text.matchAll(scriptPattern)) {
    const scriptBody = match[1]?.trim();
    if (!scriptBody || (!scriptBody.startsWith('{') && !scriptBody.startsWith('['))) {
      continue;
    }

    try {
      walk(JSON.parse(scriptBody));
    } catch {
      continue;
    }
  }

  return [...new Set(urls)];
}

function collectReferenceCandidates(text, baseUrl) {
  const normalized = decodeEscapedText(text);
  const candidateMap = new Map();

  const explicitPatterns = [
    {
      priority: 260,
      source: 'inline-video-url',
      pattern: /"video_url"\s*:\s*"([^"]+)"/gi
    },
    {
      priority: 250,
      source: 'video-tag',
      pattern: /<video\b[^>]*\bsrc=(["'])([^"']+)\1/gi,
      valueIndex: 2
    },
    {
      priority: 245,
      source: 'source-tag',
      pattern: /<source\b[^>]*\bsrc=(["'])([^"']+)\1/gi,
      valueIndex: 2
    },
    {
      priority: 220,
      source: 'data-media-attr',
      pattern: /\b(?:data-video-url|data-src)=(["'])([^"']+)\1/gi,
      valueIndex: 2
    }
  ];

  for (const entry of explicitPatterns) {
    for (const match of normalized.matchAll(entry.pattern)) {
      registerCandidate(candidateMap, match[entry.valueIndex || 1], baseUrl, entry.priority, entry.source);
    }
  }

  for (const videoUrl of extractVideoUrlValues(text)) {
    registerCandidate(candidateMap, videoUrl, baseUrl, 300, 'video-url-field');
  }

  for (const playerCandidate of collectPlayerArgsCandidates(text, baseUrl)) {
    registerCandidate(
      candidateMap,
      playerCandidate.url,
      baseUrl,
      320 + playerCandidate.score,
      `litevideo-player-args:${playerCandidate.label}`
    );
  }

  const sampleButtonPattern = /<a\b[^>]*fn-sampleVideoBtn[^>]*>/gi;
  for (const match of text.matchAll(sampleButtonPattern)) {
    const onclickValue = getHtmlAttribute(match[0], 'onclick');
    for (const videoUrl of extractVideoUrlValues(onclickValue || match[0])) {
      registerCandidate(candidateMap, videoUrl, baseUrl, 290, 'sample-button-onclick');
    }
  }

  for (const candidate of collectScriptJsonUrls(text, baseUrl)) {
    registerCandidate(candidateMap, candidate, baseUrl, 180, 'script-json');
  }

  for (const candidate of collectCandidateUrls(normalized, baseUrl)) {
    registerCandidate(candidateMap, candidate, baseUrl, 140, 'generic-media-match');
  }

  return [...candidateMap.values()].sort((left, right) => {
    const leftScore = left.priority + mediaScore(left.url);
    const rightScore = right.priority + mediaScore(right.url);
    return rightScore - leftScore;
  });
}

function extractBestPlayableSourceFromHtml(html, baseUrl) {
  const selected = collectReferenceCandidates(html, baseUrl)[0];
  if (!selected?.url) {
    return null;
  }

  return {
    signal: selected.sources.join(','),
    type: mediaTypeFromUrl(selected.url),
    url: selected.url
  };
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ');
}

function cleanTitleText(text) {
  return decodeHtmlEntities(stripTags(text))
    .replace(/\u3010.*?\u3011/g, ' ')
    .replace(/\s*[-|]\s*(DMM|FANZA).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferPageTitle(item, html) {
  const candidates = [
    item?.title,
    html.match(/<h1\b[^>]*id=(["'])title\1[^>]*>([\s\S]*?)<\/h1>/i)?.[2],
    html.match(/<meta\b[^>]*property=(["'])og:title\1[^>]*content=(["'])(.*?)\2/i)?.[3],
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  ]
    .map(cleanTitleText)
    .filter(Boolean);

  return candidates[0] || item?.seasonId || 'the detail page';
}

function detectReferenceSignals(html) {
  const signals = [];

  if (/id=(["'])sample-video\1/i.test(html)) {
    signals.push('#sample-video');
  }
  if (/data-name=(["'])player-cover\1/i.test(html)) {
    signals.push('div[data-name="player-cover"]');
  }
  if (/fn-sampleVideoBtn/i.test(html) && /video_url/i.test(html)) {
    signals.push('a.fn-sampleVideoBtn[onclick*="video_url"]');
  }

  return signals;
}

function findFirstString(value, predicate) {
  if (typeof value === 'string') {
    return predicate(value) ? value : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = findFirstString(entry, predicate);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      const result = findFirstString(entry, predicate);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

function collectStringValues(value, predicate, results = []) {
  if (typeof value === 'string') {
    if (predicate(value)) {
      results.push(value);
    }
    return results;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStringValues(entry, predicate, results);
    }
    return results;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      collectStringValues(entry, predicate, results);
    }
  }

  return results;
}

function normalizeDmmTvLookupCode(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^0-9a-z]/gi, '')
    .toLowerCase();
}

function getDmmTvLookupCodeVariants(value) {
  const normalized = normalizeDmmTvLookupCode(value);
  if (!normalized) {
    return [];
  }

  const variants = [normalized];
  if (normalized.endsWith('dl') && normalized.length > 2) {
    variants.push(normalized.slice(0, -2));
  }
  return variants;
}

function extractDmmTvLookupCodesFromUrl(value) {
  if (!value) {
    return [];
  }

  try {
    const url = new URL(value);
    const values = [
      url.searchParams.get('id'),
      url.searchParams.get('cid'),
      url.searchParams.get('content_id'),
      url.searchParams.get('product_id'),
      /\/cid=([^/?#]+)/i.exec(url.pathname)?.[1],
      /\/id=([^/?#]+)/i.exec(url.pathname)?.[1]
    ];
    return values.flatMap(getDmmTvLookupCodeVariants);
  } catch {
    return [];
  }
}

function getDmmTvLookupCodes(item) {
  const values = [
    item?.contentId,
    item?.productCode,
    ...extractDmmTvLookupCodesFromUrl(item?.detailUrl),
    ...extractDmmTvLookupCodesFromUrl(item?.playbackUrl)
  ];
  return [...new Set(values.flatMap(getDmmTvLookupCodeVariants).filter(Boolean))];
}

function shouldPreferDmmTvContentLookup(item) {
  return /^affiliate-(?:actress|keyword|maker)-search$/i.test(String(item?.source || ''));
}

function pickDmmTvLookupMatch(edges, lookupCodes) {
  const nodes = edges.map((edge) => edge?.node).filter((node) => node?.id);
  if (!nodes.length) {
    return null;
  }

  const matchedByCode = nodes.find((node) => {
    const seasonKey = normalizeDmmTvLookupCode(node.id);
    return lookupCodes.some((code) => seasonKey.endsWith(code) || code.endsWith(seasonKey));
  });
  if (matchedByCode) {
    return matchedByCode;
  }

  return nodes.length === 1 ? nodes[0] : null;
}

async function fetchDmmTvLookupEdges(keyword, config) {
  const response = await fetch(config.ranking.endpoint, {
    method: 'POST',
    headers: {
      ...buildDmmHeaders(config),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      operationName: 'FetchSearchVideosForPreview',
      variables: {
        categories: config.ranking.categories,
        device: config.ranking.device,
        first: 10,
        keyword,
        sort: config.ranking.sort
      },
      query: SEARCH_VIDEO_FOR_PREVIEW_QUERY
    }),
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return [];
  }

  const edges = payload?.data?.searchVideos?.edges;
  return Array.isArray(edges) ? edges : [];
}

async function fetchGraphqlSampleSource(item, config) {
  if (!item?.seasonId) {
    return null;
  }

  const response = await fetch(config.ranking.endpoint, {
    method: 'POST',
    headers: {
      ...buildDmmHeaders(config),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      operationName: 'FetchVideoSample',
      variables: {
        seasonId: item.seasonId
      },
      query: FETCH_VIDEO_SAMPLE_QUERY
    }),
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload ? JSON.stringify(payload).slice(0, 300) : response.statusText;
    throw new Error(`動画詳細APIの取得に失敗しました: ${response.status} ${message}`);
  }

  const url = collectStringValues(payload?.data?.video, (value) => mediaScore(value) > 0).sort(
    (left, right) => mediaScore(right) - mediaScore(left)
  )[0];
  if (!url) {
    return null;
  }

  return {
    detailUrl: item.detailUrl,
    extractor: 'graphql-sample-movie',
    type: /\.m3u8(\?|$)/i.test(url) ? 'hls' : 'direct',
    url
  };
}

async function fetchGraphqlSampleSourceByContentId(item, config) {
  if (item?.seasonId) {
    return null;
  }

  const lookupCodes = getDmmTvLookupCodes(item);
  if (!lookupCodes.length) {
    return null;
  }

  for (const keyword of lookupCodes.slice(0, 4)) {
    const edges = await fetchDmmTvLookupEdges(keyword, config).catch(() => []);
    const matched = pickDmmTvLookupMatch(edges, lookupCodes);
    if (!matched?.id) {
      continue;
    }

    const tvItem = {
      ...item,
      contentId: matched.id,
      detailUrl: buildDmmTvDetailUrl(matched.id),
      playbackUrl: buildDmmTvPlaybackUrl(matched.id),
      seasonId: matched.id
    };
    const source = await fetchGraphqlSampleSource(tvItem, config).catch(() => null);
    if (source?.url) {
      return {
        ...source,
        extractor: `${source.extractor || 'graphql-sample-movie'}-content-id`
      };
    }
  }

  return null;
}

function loadCustomExtractor() {
  const customExtractorPath = path.join(process.cwd(), 'scripts', 'custom-dmm-extractor.js');
  if (!fs.existsSync(customExtractorPath)) {
    return null;
  }

  delete require.cache[customExtractorPath];
  const loaded = require(customExtractorPath);
  return typeof loaded.extract === 'function' ? loaded.extract : null;
}

async function fetchText(url, headers, config) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`ページの取得に失敗しました: ${response.status} ${url}`);
  }

  return response.text();
}

function extractIframeUrl(html, baseUrl) {
  const iframePattern = /<iframe\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>/gi;
  const iframes = [];

  for (const match of html.matchAll(iframePattern)) {
    try {
      const iframeUrl = new URL(decodeEscapedText(match[2]), baseUrl).toString();
      iframes.push(iframeUrl);
    } catch {
      continue;
    }
  }

  return iframes.find((url) => /\/service\/digitalapi\/-\/html5_player\//i.test(url)) || iframes[0] || '';
}

async function resolveLitevideoPageSource(playbackUrl, detailUrl, config) {
  for (const litevideoUrl of getLitevideoQualityUrls(playbackUrl)) {
    const litevideoSource = await (async () => {
      const pageHeaders = buildDmmSiteHeaders(config, detailUrl || litevideoUrl);
      const pageHtml = await fetchText(litevideoUrl, pageHeaders, config);
      const iframeUrl = extractIframeUrl(pageHtml, litevideoUrl);

      if (iframeUrl) {
        const iframeHeaders = buildDmmSiteHeaders(config, litevideoUrl);
        const iframeHtml = await fetchText(iframeUrl, iframeHeaders, config);
        const iframeCandidates = collectReferenceCandidates(iframeHtml, iframeUrl);
        if (iframeCandidates.length) {
          const selected = iframeCandidates[0];
          return {
            detailUrl: iframeUrl,
            embedUrl: iframeUrl,
            extractor: 'litevideo-html5-player',
            signal: selected.sources.join(','),
            type: mediaTypeFromUrl(selected.url),
            url: selected.url
          };
        }
      }

      const pageCandidates = collectReferenceCandidates(pageHtml, litevideoUrl);
      if (pageCandidates.length) {
        const selected = pageCandidates[0];
        return {
          detailUrl: iframeUrl || litevideoUrl,
          embedUrl: iframeUrl || '',
          extractor: 'litevideo-page',
          signal: selected.sources.join(','),
          type: mediaTypeFromUrl(selected.url),
          url: selected.url
        };
      }

      return null;
    })().catch(() => null);

    if (litevideoSource?.url) {
      return litevideoSource;
    }
  }

  return null;
}

async function resolvePlayableSource(item, config) {
  const detailUrl = item.detailUrl;

  if (item?.playbackUrl) {
    let parsedPlaybackUrl;
    try {
      parsedPlaybackUrl = new URL(item.playbackUrl);
    } catch {
      parsedPlaybackUrl = null;
    }

    const normalizedPlaybackUrl = parsedPlaybackUrl?.toString() || '';
    if (parsedPlaybackUrl && isLikelyDirectMediaUrl(normalizedPlaybackUrl)) {
      return {
        detailUrl: detailUrl || config.ranking.referer,
        extractor: 'item-playback-url',
        type: mediaTypeFromUrl(normalizedPlaybackUrl),
        url: normalizedPlaybackUrl
      };
    }
  }

  const headers = buildDmmSiteHeaders(config, detailUrl);
  let contentIdGraphqlSource = null;
  let triedContentIdGraphqlSource = false;

  if (shouldPreferDmmTvContentLookup(item)) {
    triedContentIdGraphqlSource = true;
    contentIdGraphqlSource = await fetchGraphqlSampleSourceByContentId(item, config).catch(() => null);
    if (contentIdGraphqlSource?.url) {
      return contentIdGraphqlSource;
    }
  }

  if (item?.playbackUrl && isLitevideoPageUrl(item.playbackUrl)) {
    const litevideoSource = await resolveLitevideoPageSource(item.playbackUrl, detailUrl, config).catch(() => null);
    if (litevideoSource?.url) {
      return litevideoSource;
    }
  }

  if (item?.playbackUrl && isPotentialFanzaMediaUrl(item.playbackUrl)) {
    const probedSource = await probeMediaSource(item.playbackUrl, headers, config).catch(() => null);
    if (probedSource?.url) {
      return {
        detailUrl: detailUrl || config.ranking.referer,
        extractor: 'item-playback-url-probed',
        type: probedSource.type,
        url: probedSource.url
      };
    }
  }

  const graphqlSource = await fetchGraphqlSampleSource(item, config);

  if (graphqlSource?.url) {
    return graphqlSource;
  }

  if (!triedContentIdGraphqlSource) {
    contentIdGraphqlSource = await fetchGraphqlSampleSourceByContentId(item, config).catch(() => null);
  }
  if (contentIdGraphqlSource?.url) {
    return contentIdGraphqlSource;
  }

  const response = await fetch(detailUrl, {
    headers,
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`詳細ページの取得に失敗しました: ${response.status} ${detailUrl}`);
  }

  const html = await response.text();
  const customExtractor = loadCustomExtractor();

  if (customExtractor) {
    const customResult = await customExtractor({
      config,
      detailUrl,
      headers,
      html,
      item
    });

    if (customResult?.url) {
      return {
        detailUrl,
        extractor: 'custom',
        type: customResult.type || (/\.m3u8(\?|$)/i.test(customResult.url) ? 'hls' : 'direct'),
        url: customResult.url
      };
    }
  }

  const rankedCandidates = collectReferenceCandidates(html, detailUrl);
  if (!rankedCandidates.length) {
    const pageTitle = inferPageTitle(item, html);
    const signals = detectReferenceSignals(html);
    const signalText = signals.length ? ` Signals found: ${signals.join(', ')}.` : '';
    throw new Error(
      `「${pageTitle}」の再生用動画URLを見つけられませんでした。確認対象: ${SAMPLE_VIDEO_SELECTORS.join(', ')} と video_url。${signalText}ブラウザ操作が必要な場合は scripts/custom-dmm-extractor.js を追加してください。`
    );
  }

  const selected = rankedCandidates[0];
  return {
    detailUrl,
    extractor: 'default',
    signal: selected.sources.join(','),
    type: mediaTypeFromUrl(selected.url),
    url: selected.url
  };
}

module.exports = {
  buildDmmHeaders,
  collectCandidateUrls,
  collectScriptJsonUrls,
  extractBestPlayableSourceFromHtml,
  resolvePlayableSource
};
