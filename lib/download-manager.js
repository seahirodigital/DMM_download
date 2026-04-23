const path = require('node:path');

const { resolvePlayableSource } = require('./dmm-downloader');
const { downloadMediaSource } = require('./media-downloader');
const { buildFileNameFromTemplate, ensureDir, firstLine, toIsoTimestamp, uniqueBy } = require('./utils');

class DownloadManager {
  constructor(config, stateStore) {
    this.config = config;
    this.stateStore = stateStore;
    this.queue = [];
    this.current = null;
    this.running = false;
    this.stopRequested = false;
    this.lastError = null;
    this.activeController = null;
  }

  getStatus() {
    return {
      running: this.running,
      stopRequested: this.stopRequested,
      current: this.current,
      queueLength: this.queue.length,
      queue: this.queue.map((entry) => ({
        jobId: entry.jobId,
        rank: entry.item.rank,
        seasonId: entry.item.seasonId,
        title: entry.item.title
      })),
      lastError: this.lastError
    };
  }

  async start(items, limit, settings) {
    if (this.running) {
      return {
        alreadyRunning: true,
        enqueued: this.queue.length
      };
    }

    const topItems = uniqueBy(items.slice(0, limit), (item) => item.seasonId);
    const queueEntries = [];
    let skippedDuplicates = 0;

    for (const item of topItems) {
      if (this.stateStore.isSeasonDownloaded(item.seasonId)) {
        skippedDuplicates += 1;
        await this.stateStore.appendHistory({
          jobId: `skip_${Date.now()}_${item.seasonId}`,
          seasonId: item.seasonId,
          title: item.title,
          rank: item.rank,
          detailUrl: item.detailUrl,
          status: 'skipped',
          message: 'この作品はダウンロード済みのためスキップしました。'
        });
        continue;
      }

      queueEntries.push({
        jobId: `job_${Date.now()}_${item.seasonId}_${Math.random().toString(36).slice(2, 8)}`,
        item
      });
    }

    if (!queueEntries.length) {
      return {
        started: false,
        enqueued: 0,
        skippedDuplicates
      };
    }

    this.queue = queueEntries;
    this.running = true;
    this.stopRequested = false;
    this.lastError = null;

    void this.processQueue(settings);

    return {
      started: true,
      enqueued: queueEntries.length,
      skippedDuplicates
    };
  }

  async stop() {
    if (!this.running) {
      return {
        stopped: false
      };
    }

    this.stopRequested = true;
    if (this.activeController) {
      this.activeController.abort();
    }

    return {
      stopped: true
    };
  }

  async processQueue(settings) {
    try {
      while (this.queue.length && !this.stopRequested) {
        const job = this.queue.shift();
        await this.runJob(job, settings);
      }

      if (this.stopRequested) {
        for (const queued of this.queue) {
          await this.stateStore.appendHistory({
            jobId: queued.jobId,
            seasonId: queued.item.seasonId,
            title: queued.item.title,
            rank: queued.item.rank,
            detailUrl: queued.item.detailUrl,
            status: 'stopped',
            message: '開始前に停止されました。'
          });
        }
        this.queue = [];
      }
    } finally {
      this.current = null;
      this.activeController = null;
      this.running = false;
      this.stopRequested = false;
    }
  }

  async runJob(job, settings) {
    const item = job.item;
    await this.stateStore.appendHistory({
      jobId: job.jobId,
      seasonId: item.seasonId,
      title: item.title,
      rank: item.rank,
      detailUrl: item.detailUrl,
      status: 'queued',
      message: '動画URLの抽出待ちです。'
    });

    this.current = {
      jobId: job.jobId,
      stage: 'extracting',
      seasonId: item.seasonId,
      title: item.title,
      rank: item.rank
    };

    this.activeController = new AbortController();

    try {
      await this.stateStore.updateHistory(job.jobId, {
        status: 'downloading',
        message: '再生可能な動画URLを確認しています。'
      });

      const playableSource = await resolvePlayableSource(item, this.config);
      const rankLabel = String(item.rank).padStart(2, '0');
      const outputBaseName = buildFileNameFromTemplate(settings.filenameTemplate, {
        actress: item.actress || '',
        rank: rankLabel,
        seasonId: item.seasonId,
        title: item.title
      });
      const outputBasePath = path.join(this.config.paths.downloadDir, outputBaseName);

      this.current = {
        ...this.current,
        stage: 'downloading',
        sourceUrl: playableSource.url
      };

      await ensureDir(this.config.paths.downloadDir);

      const result = await downloadMediaSource(playableSource, outputBasePath, {
        headers: {
          Origin: this.config.ranking.origin,
          Referer: item.detailUrl,
          'User-Agent': this.config.ranking.userAgent,
          Cookie: this.config.dmm.cookieHeader
        },
        signal: this.activeController.signal
      });

      await this.stateStore.updateHistory(job.jobId, {
        completedAt: toIsoTimestamp(),
        extractor: playableSource.extractor,
        filePath: result.outputPath,
        message: `${path.basename(result.outputPath)} を保存しました。`,
        sourceUrl: playableSource.url,
        status: 'completed'
      });
    } catch (error) {
      const aborted = error?.name === 'AbortError' || this.stopRequested;
      const message = aborted ? 'ユーザー操作により停止しました。' : firstLine(error.message || '不明なダウンロードエラーです。');

      await this.stateStore.updateHistory(job.jobId, {
        message,
        sourceUrl: this.current?.sourceUrl || null,
        status: aborted ? 'stopped' : 'failed'
      });

      if (!aborted) {
        this.lastError = message;
      }
    } finally {
      this.current = null;
      this.activeController = null;
    }
  }
}

module.exports = {
  DownloadManager
};
