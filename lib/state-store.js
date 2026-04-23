const fs = require('node:fs');
const path = require('node:path');

const { ensureDir, expandUserProfile, firstLine, readJson, toIsoTimestamp, writeJson } = require('./utils');

class StateStore {
  constructor(config) {
    this.config = config;
    this.dataDir = path.join(process.cwd(), 'data');
    this.runtimeDir = path.join(this.dataDir, 'runtime');
    this.historyDir = path.join(this.dataDir, 'history');
    this.settingsFile = path.join(this.runtimeDir, 'settings.json');
    this.currentRankingFile = path.join(this.runtimeDir, 'current-ranking.json');
    this.downloadHistoryFile = path.join(this.historyDir, 'download-history.json');

    this.settings = null;
    this.currentRanking = null;
    this.downloadHistory = [];
  }

  getDefaultSettings() {
    return {
      downloadLimit: this.config.downloads.defaultLimit,
      filenameTemplate: this.config.downloads.filenameTemplate,
      libraryDirectory: this.config.paths.downloadDir,
      rankingFetchCount: this.config.ranking.first,
      rankingSourceUrl: this.config.ranking.sourcePageUrl,
      autoplayNext: true
    };
  }

  async init() {
    await ensureDir(this.runtimeDir);
    await ensureDir(this.historyDir);

    const defaultSettings = this.getDefaultSettings();
    const storedSettings = await readJson(this.settingsFile, defaultSettings);
    this.settings = {
      ...defaultSettings,
      ...storedSettings,
      libraryDirectory: expandUserProfile(storedSettings.libraryDirectory || defaultSettings.libraryDirectory),
      rankingFetchCount: Number.isFinite(Number(storedSettings.rankingFetchCount))
        ? Math.max(1, Number(storedSettings.rankingFetchCount))
        : defaultSettings.rankingFetchCount,
      rankingSourceUrl: storedSettings.rankingSourceUrl || defaultSettings.rankingSourceUrl
    };
    await writeJson(this.settingsFile, this.settings);

    this.currentRanking = await readJson(this.currentRankingFile, {
      fetchedAt: null,
      items: []
    });
    this.downloadHistory = await readJson(this.downloadHistoryFile, []);
  }

  getSettings() {
    return { ...this.settings };
  }

  async saveSettings(patch) {
    const nextSettings = {
      ...this.settings,
      ...patch
    };

    if (nextSettings.libraryDirectory) {
      nextSettings.libraryDirectory = expandUserProfile(nextSettings.libraryDirectory);
    }

    this.settings = nextSettings;
    await writeJson(this.settingsFile, this.settings);
    return this.getSettings();
  }

  getRanking() {
    return this.currentRanking;
  }

  async setRanking(ranking) {
    this.currentRanking = ranking;
    await writeJson(this.currentRankingFile, ranking);
    return this.currentRanking;
  }

  listHistory(limit = 250) {
    return this.downloadHistory.slice(0, limit);
  }

  getCompletedRecord(seasonId) {
    return this.downloadHistory.find((record) => {
      return record.seasonId === seasonId && record.status === 'completed';
    });
  }

  isSeasonDownloaded(seasonId) {
    const record = this.getCompletedRecord(seasonId);
    if (!record) {
      return false;
    }

    if (!record.filePath) {
      return true;
    }

    return fs.existsSync(record.filePath);
  }

  async appendHistory(record) {
    const nextRecord = {
      createdAt: toIsoTimestamp(),
      updatedAt: toIsoTimestamp(),
      ...record
    };

    this.downloadHistory = [nextRecord, ...this.downloadHistory].slice(0, 5000);
    await writeJson(this.downloadHistoryFile, this.downloadHistory);
    return nextRecord;
  }

  async updateHistory(jobId, patch) {
    const index = this.downloadHistory.findIndex((record) => record.jobId === jobId);

    if (index === -1) {
      throw new Error(`History record not found: ${jobId}`);
    }

    const updatedRecord = {
      ...this.downloadHistory[index],
      ...patch,
      updatedAt: toIsoTimestamp()
    };

    this.downloadHistory[index] = updatedRecord;
    await writeJson(this.downloadHistoryFile, this.downloadHistory);
    return updatedRecord;
  }

  buildSummary() {
    const summary = {
      completed: 0,
      failed: 0,
      skipped: 0,
      stopped: 0,
      queued: 0,
      downloading: 0,
      lastMessage: null
    };

    for (const record of this.downloadHistory) {
      if (summary[record.status] !== undefined) {
        summary[record.status] += 1;
      }
    }

    if (this.downloadHistory[0]) {
      summary.lastMessage = firstLine(this.downloadHistory[0].message || '');
    }

    return summary;
  }
}

module.exports = {
  StateStore
};
