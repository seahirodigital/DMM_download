const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const { ensureDir } = require('./utils');

function buildFetchHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function chooseDirectExtension(url, contentType) {
  const lowerContentType = String(contentType || '').toLowerCase();
  const lowerUrl = String(url || '').toLowerCase();

  if (lowerContentType.includes('video/webm') || lowerUrl.includes('.webm')) {
    return '.webm';
  }
  if (lowerContentType.includes('quicktime') || lowerUrl.includes('.mov')) {
    return '.mov';
  }
  if (lowerUrl.includes('.m4v')) {
    return '.m4v';
  }
  return '.mp4';
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

function parseHexIv(value) {
  const normalized = String(value || '').replace(/^0x/i, '');
  if (!normalized) {
    return null;
  }
  return Buffer.from(normalized.padStart(32, '0'), 'hex');
}

function deriveIv(sequenceNumber) {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32BE(sequenceNumber >>> 0, 12);
  return buffer;
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

function parseMediaPlaylist(manifestUrl, manifestText) {
  const lines = manifestText.split(/\r?\n/).map((line) => line.trim());
  let mediaSequence = 0;
  let currentKey = null;
  let initSegment = null;
  const segments = [];

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = Number(line.split(':')[1] || 0);
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attributes = parseAttributeList(line);
      if (attributes.METHOD === 'NONE') {
        currentKey = null;
      } else {
        currentKey = {
          method: attributes.METHOD,
          uri: attributes.URI ? new URL(attributes.URI, manifestUrl).toString() : null,
          iv: parseHexIv(attributes.IV)
        };
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const attributes = parseAttributeList(line);
      if (attributes.URI) {
        initSegment = new URL(attributes.URI, manifestUrl).toString();
      }
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    segments.push({
      sequenceNumber: mediaSequence + segments.length,
      url: new URL(line, manifestUrl).toString(),
      key: currentKey
        ? {
            ...currentKey,
            iv: currentKey.iv || deriveIv(mediaSequence + segments.length)
          }
        : null
    });
  }

  return {
    initSegment,
    segments
  };
}

async function fetchText(url, headers, signal) {
  const response = await fetch(url, {
    headers: buildFetchHeaders(headers),
    signal
  });

  if (!response.ok) {
    throw new Error(`プレイリストの取得に失敗しました: ${response.status} ${url}`);
  }

  return response.text();
}

async function fetchBuffer(url, headers, signal) {
  const response = await fetch(url, {
    headers: buildFetchHeaders(headers),
    signal
  });

  if (!response.ok) {
    throw new Error(`動画セグメントの取得に失敗しました: ${response.status} ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get('content-type') || ''
  };
}

function decryptAes128(buffer, keyBuffer, ivBuffer) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, ivBuffer);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}

async function downloadHlsManifest(manifestUrl, outputPathBase, options = {}) {
  const headers = options.headers || {};
  const signal = options.signal;
  let manifestText = options.manifestText;

  if (!manifestText) {
    manifestText = await fetchText(manifestUrl, headers, signal);
  }

  const preferredVariant = parseMasterPlaylist(manifestUrl, manifestText);
  if (preferredVariant) {
    return downloadHlsManifest(preferredVariant, outputPathBase, options);
  }

  const playlist = parseMediaPlaylist(manifestUrl, manifestText);
  if (!playlist.segments.length) {
    throw new Error('HLSプレイリストに動画セグメントが含まれていません。');
  }

  const likelyMp4 =
    Boolean(playlist.initSegment) ||
    playlist.segments.some((segment) => /\.(m4s|mp4)(\?|$)/i.test(segment.url));

  const extension = likelyMp4 ? '.mp4' : '.ts';
  const outputPath = `${outputPathBase}${extension}`;
  const keyCache = new Map();

  await ensureDir(path.dirname(outputPath));

  const stream = fs.createWriteStream(outputPath);

  try {
    if (playlist.initSegment) {
      const initData = await fetchBuffer(playlist.initSegment, headers, signal);
      stream.write(initData.buffer);
    }

    for (const segment of playlist.segments) {
      const segmentData = await fetchBuffer(segment.url, headers, signal);
      let payload = segmentData.buffer;

      if (segment.key) {
        if (segment.key.method !== 'AES-128') {
          throw new Error(`未対応のHLS暗号化方式です: ${segment.key.method}`);
        }

        if (!segment.key.uri) {
          throw new Error('暗号化セグメントにキーURLがありません。');
        }

        if (!keyCache.has(segment.key.uri)) {
          const keyData = await fetchBuffer(segment.key.uri, headers, signal);
          keyCache.set(segment.key.uri, keyData.buffer);
        }

        payload = decryptAes128(payload, keyCache.get(segment.key.uri), segment.key.iv);
      }

      stream.write(payload);
    }
  } finally {
    await new Promise((resolve) => stream.end(resolve));
  }

  return {
    outputPath,
    segmentCount: playlist.segments.length,
    type: 'hls'
  };
}

async function downloadDirectMedia(url, outputPathBase, options = {}) {
  const headers = options.headers || {};
  const signal = options.signal;
  const response = await fetch(url, {
    headers: buildFetchHeaders(headers),
    signal
  });

  if (!response.ok) {
    throw new Error(`動画の直接ダウンロードに失敗しました: ${response.status} ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('mpegurl') || /\.m3u8(\?|$)/i.test(url)) {
    const manifestText = await response.text();
    return downloadHlsManifest(url, outputPathBase, {
      headers,
      signal,
      manifestText
    });
  }

  const extension = chooseDirectExtension(url, contentType);
  const outputPath = `${outputPathBase}${extension}`;
  await ensureDir(path.dirname(outputPath));

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(outputPath));

  return {
    outputPath,
    contentType,
    type: 'direct'
  };
}

async function downloadMediaSource(source, outputPathBase, options = {}) {
  if (source.type === 'hls') {
    return downloadHlsManifest(source.url, outputPathBase, options);
  }

  return downloadDirectMedia(source.url, outputPathBase, options);
}

module.exports = {
  downloadMediaSource
};
