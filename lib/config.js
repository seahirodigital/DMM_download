const path = require('node:path');

const { expandUserProfile, pathExists, readJson, writeJson } = require('./utils');

const CONFIG_FILE = path.join(process.cwd(), 'config', 'app-config.json');

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
    searchAffiliateId: 'cycreator-003'
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

async function loadConfig() {
  if (!(await pathExists(CONFIG_FILE))) {
    await writeJson(CONFIG_FILE, DEFAULT_CONFIG);
  }

  const storedConfig = await readJson(CONFIG_FILE, {});
  const merged = mergeDeep(DEFAULT_CONFIG, storedConfig);

  return {
    ...merged,
    paths: {
      ...merged.paths,
      configFile: CONFIG_FILE,
      downloadDir: expandUserProfile(merged.paths.downloadDir)
    }
  };
}

async function saveConfigPatch(patch) {
  if (!(await pathExists(CONFIG_FILE))) {
    await writeJson(CONFIG_FILE, DEFAULT_CONFIG);
  }

  const storedConfig = await readJson(CONFIG_FILE, {});
  const nextConfig = mergeDeep(storedConfig, patch);
  await writeJson(CONFIG_FILE, nextConfig);
  return loadConfig();
}

function getPublicConfig(config) {
  return {
    app: config.app,
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
      searchAffiliateId: config.affiliate.searchAffiliateId
    },
    downloads: {
      concurrency: config.downloads.concurrency,
      defaultLimit: config.downloads.defaultLimit,
      filenameTemplate: config.downloads.filenameTemplate,
      ffmpegCommand: config.downloads.ffmpegCommand
    },
    capabilities: {
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
