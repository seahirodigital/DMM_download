const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_VIDEO_SELECTORS = [
  '#sample-video',
  'div[data-name="player-cover"]',
  'a.fn-sampleVideoBtn[onclick*="video_url"]'
];

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

function buildDmmHeaders(config) {
  const headers = {
    Origin: config.ranking.origin,
    Referer: config.ranking.referer,
    'User-Agent': config.ranking.userAgent
  };

  if (config.dmm.cookieHeader) {
    headers.Cookie = config.dmm.cookieHeader;
  }

  return headers;
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

  const sampleButtonPattern =
    /<a\b[^>]*class=(["'])[^"']*fn-sampleVideoBtn[^"']*\1[^>]*onclick=(["'])([\s\S]*?)\2/gi;
  for (const match of normalized.matchAll(sampleButtonPattern)) {
    const onclickValue = match[3];
    for (const urlMatch of onclickValue.matchAll(/"video_url"\s*:\s*"([^"]+)"/gi)) {
      registerCandidate(candidateMap, urlMatch[1], baseUrl, 280, 'sample-button-onclick');
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

  const url = findFirstString(payload?.data?.video, (value) => mediaScore(value) > 0);
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

function loadCustomExtractor() {
  const customExtractorPath = path.join(process.cwd(), 'scripts', 'custom-dmm-extractor.js');
  if (!fs.existsSync(customExtractorPath)) {
    return null;
  }

  delete require.cache[customExtractorPath];
  const loaded = require(customExtractorPath);
  return typeof loaded.extract === 'function' ? loaded.extract : null;
}

async function resolvePlayableSource(item, config) {
  const detailUrl = item.detailUrl;
  const headers = buildDmmHeaders(config);
  const graphqlSource = await fetchGraphqlSampleSource(item, config);

  if (graphqlSource?.url) {
    return graphqlSource;
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
    type: /\.m3u8(\?|$)/i.test(selected.url) ? 'hls' : 'direct',
    url: selected.url
  };
}

module.exports = {
  buildDmmHeaders,
  collectCandidateUrls,
  collectScriptJsonUrls,
  resolvePlayableSource
};
