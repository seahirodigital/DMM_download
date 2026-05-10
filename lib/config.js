const path = require('node:path');

const { expandUserProfile, pathExists, readJson, writeJson } = require('./utils');

const CONFIG_FILE = path.join(process.cwd(), 'config', 'app-config.json');
const EXAMPLE_CONFIG_FILE = path.join(process.cwd(), 'config', 'app-config.example.json');

const DEFAULT_CONFIG = {
  app: {
    host: '127.0.0.1',
    port: 4312
  },
  paths: {
    downloadDir: '%USERPROFILE%\\Downloads\\DMM'
  },
  ranking: {
    endpoint: 'https://api.tv.dmm.com/graphql',
    sourcePageUrl: 'https://tv.dmm.com/vod/restrict/list/?genres=66313',
    categories: ['23'],
    sort: 'RANK',
    first: 15,
    device: 'BROWSER',
    origin: 'https://tv.dmm.com',
    referer: 'https://tv.dmm.com/',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
  },
  dmm: {
    cookieHeader: ''
  },
  affiliate: {
    searchAffiliateId: 'cycreator-003',
    apiId: '',
    affiliateId: '',
    actressSearchEndpoint: 'https://api.dmm.com/affiliate/v3/ActressSearch',
    actressSearchSort: 'name',
    itemListAffiliateId: '',
    itemListEndpoint: 'https://api.dmm.com/affiliate/v3/ItemList',
    itemListSite: 'DMM.com',
    itemListService: 'mono',
    itemListFloor: 'dvd',
    itemListSort: 'date',
    itemListKeywordSort: 'match',
    itemListHits: 100
  },
  downloads: {
    defaultLimit: 5,
    concurrency: 1,
    filenameTemplate: '{{title}}_{{actress}}_{{seasonId}}',
    ffmpegCommand: 'ffmpeg',
    requestTimeoutMs: 120000
  }
};

function mergeDeep(baseValue, overrideValue) {
  if (
    !baseValue ||
    !overrideValue ||
    typeof baseValue !== 'object' ||
    typeof overrideValue !== 'object' ||
    Array.isArray(baseValue) ||
    Array.isArray(overrideValue)
  ) {
    return overrideValue === undefined ? baseValue : overrideValue;
  }

  const merged = { ...baseValue };
  for (const [key, value] of Object.entries(overrideValue)) {
    merged[key] = mergeDeep(baseValue[key], value);
  }
  return merged;
}

function detectAppMode() {
  if (process.env.APP_MODE) {
    return String(process.env.APP_MODE).toLowerCase();
  }

  return process.env.VERCEL ? 'hosted' : 'desktop';
}

function canPersistLocally(mode) {
  return mode !== 'hosted';
}

function normalizeCookieHeader(value) {
  return String(value || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join('; ');
}

function withAgeCheckCookie(value) {
  const normalized = normalizeCookieHeader(value);
  if (!normalized) {
    return '';
  }
  if (/(^|;\s*)age_check_done=/i.test(normalized)) {
    return normalized;
  }
  return [normalized, 'age_check_done=1'].filter(Boolean).join('; ');
}

async function loadConfig() {
  const mode = detectAppMode();
  const persistent = canPersistLocally(mode);
  const sourceConfigFile = persistent ? CONFIG_FILE : EXAMPLE_CONFIG_FILE;

  if (persistent && !(await pathExists(CONFIG_FILE))) {
    await writeJson(CONFIG_FILE, DEFAULT_CONFIG);
  }

  const storedConfig = await readJson(sourceConfigFile, {});
  const merged = mergeDeep(DEFAULT_CONFIG, storedConfig);
  const itemListHits = Number(process.env.DMM_ITEMLIST_HITS || merged.affiliate.itemListHits);
  const cookieHeader = withAgeCheckCookie(
    process.env.DMM_COOKIE_HEADER || process.env.DMM_COOKIE || merged.dmm.cookieHeader
  );

  return {
    ...merged,
    appMode: mode,
    dmm: {
      ...merged.dmm,
      cookieHeader
    },
    affiliate: {
      ...merged.affiliate,
      apiId: process.env.DMM_API_ID || merged.affiliate.apiId || '',
      affiliateId: process.env.DMM_AFFILIATE_ID || merged.affiliate.affiliateId || merged.affiliate.itemListAffiliateId || '',
      actressSearchEndpoint: process.env.DMM_ACTRESS_SEARCH_ENDPOINT || merged.affiliate.actressSearchEndpoint,
      actressSearchSort: process.env.DMM_ACTRESS_SEARCH_SORT || merged.affiliate.actressSearchSort,
      itemListAffiliateId: process.env.DMM_AFFILIATE_ID || merged.affiliate.itemListAffiliateId || merged.affiliate.affiliateId || '',
      itemListEndpoint: process.env.DMM_ITEMLIST_ENDPOINT || merged.affiliate.itemListEndpoint,
      itemListFloor: process.env.DMM_ITEMLIST_FLOOR || merged.affiliate.itemListFloor,
      itemListHits: Number.isFinite(itemListHits) ? Math.max(1, Math.min(100, itemListHits)) : 100,
      itemListKeywordSort: process.env.DMM_ITEMLIST_KEYWORD_SORT || merged.affiliate.itemListKeywordSort || 'match',
      itemListService: process.env.DMM_ITEMLIST_SERVICE || merged.affiliate.itemListService,
      itemListSite: process.env.DMM_ITEMLIST_SITE || merged.affiliate.itemListSite,
      itemListSort: process.env.DMM_ITEMLIST_SORT || merged.affiliate.itemListSort
    },
    paths: {
      ...merged.paths,
      configFile: sourceConfigFile,
      downloadDir: expandUserProfile(merged.paths.downloadDir)
    }
  };
}

async function saveConfigPatch(patch) {
  const mode = detectAppMode();
  if (!canPersistLocally(mode)) {
    throw new Error('Hosted mode does not allow saving local config changes.');
  }

  if (!(await pathExists(CONFIG_FILE))) {
    await writeJson(CONFIG_FILE, DEFAULT_CONFIG);
  }

  const storedConfig = await readJson(CONFIG_FILE, {});
  const nextConfig = mergeDeep(storedConfig, patch);
  await writeJson(CONFIG_FILE, nextConfig);
  return loadConfig();
}

function getPublicConfig(config) {
  const hosted = config.appMode === 'hosted';

  return {
    app: config.app,
    appMode: config.appMode,
    paths: {
      configFile: config.paths.configFile,
      downloadDir: config.paths.downloadDir
    },
    ranking: {
      categories: config.ranking.categories,
      first: config.ranking.first,
      sourcePageUrl: config.ranking.sourcePageUrl,
      sort: config.ranking.sort
    },
    affiliate: {
      hasAffiliateApiCredentials: Boolean(config.affiliate.apiId && (config.affiliate.itemListAffiliateId || config.affiliate.affiliateId)),
      hasItemListCredentials: Boolean(config.affiliate.apiId && (config.affiliate.itemListAffiliateId || config.affiliate.affiliateId)),
      itemListFloor: config.affiliate.itemListFloor,
      itemListService: config.affiliate.itemListService,
      itemListSite: config.affiliate.itemListSite,
      searchAffiliateId: config.affiliate.searchAffiliateId
    },
    downloads: {
      concurrency: config.downloads.concurrency,
      defaultLimit: config.downloads.defaultLimit,
      filenameTemplate: config.downloads.filenameTemplate,
      ffmpegCommand: config.downloads.ffmpegCommand
    },
    capabilities: {
      canDownload: !hosted,
      canManageCookies: !hosted,
      canPersistSettings: !hosted,
      canUseLibrary: !hosted,
      cookieLength: config.dmm.cookieHeader ? config.dmm.cookieHeader.length : 0,
      hasCookie: Boolean(config.dmm.cookieHeader)
    }
  };
}

module.exports = {
  DEFAULT_CONFIG,
  CONFIG_FILE,
  getPublicConfig,
  loadConfig,
  saveConfigPatch
};
