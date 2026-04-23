function decodeCandidate(value) {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\\//g, '/')
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return decodeCandidate(match[1]);
    }
  }
  return '';
}

async function extract({ detailUrl, html, item }) {
  const url = firstMatch(html, [
    /"video_url"\s*:\s*"([^"]+)"/i,
    /<video\b[^>]*\bsrc=["']([^"']+)["']/i,
    /<source\b[^>]*\bsrc=["']([^"']+)["']/i,
    /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i
  ]);

  if (!url) {
    return null;
  }

  return {
    type: /\.m3u8(\?|$)/i.test(url) ? 'hls' : 'direct',
    url: new URL(url, detailUrl).toString(),
    note: `Example extractor matched ${item?.seasonId || detailUrl}`
  };
}

module.exports = {
  extract
};
