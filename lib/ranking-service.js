const SEARCH_QUERY = `
query FetchSearchVideos($device: Device!, $keyword: String, $title: ID, $categories: [ID!], $genres: [ID!], $casts: [ID!], $staffs: [ID!], $series: ID, $contentType: VideoContentTypeFilter, $viewingTypes: [VideoViewingType!], $campaigns: [ID!], $sort: VideoSearchSortKey, $first: Int, $last: Int, $before: String, $after: String) {
  searchVideos(
    device: $device
    keyword: $keyword
    title: $title
    categories: $categories
    genres: $genres
    casts: $casts
    staffs: $staffs
    series: $series
    contentType: $contentType
    viewingTypes: $viewingTypes
    campaigns: $campaigns
    sort: $sort
    first: $first
    last: $last
    before: $before
    after: $after
  ) {
    ...VideoSearchResultConnection
    __typename
  }
}

fragment VideoSearchResultConnection on VideoSearchResultConnection {
  edges {
    node {
      ...BaseSearchResult
      __typename
    }
    __typename
  }
  pageInfo {
    startCursor
    endCursor
    hasNextPage
    hasPreviousPage
    __typename
  }
  total
  facet {
    titles {
      name
      value
      count
      __typename
    }
    categories {
      name
      value
      count
      __typename
    }
    genres {
      name
      value
      count
      __typename
    }
    casts {
      name
      value
      count
      __typename
    }
    staffs {
      name
      value
      count
      __typename
    }
    series {
      name
      value
      count
      __typename
    }
    campaigns {
      name
      value
      count
      __typename
    }
    contentTypes {
      name
      value
      count
      __typename
    }
    viewingTypes {
      name
      value
      count
      __typename
    }
    __typename
  }
  __typename
}

fragment BaseSearchResult on VideoSearchResult {
  __typename
  id
  titleName
  seasonName
  packageImage
  packageLargeImage
  keyVisualImage
  keyVisualWithoutLogoImage
  description
  lowestPrice
  highestPrice
  seasonType
  discountedLowestPrice
  discountedHighestPrice
  isNewArrival
  isExclusive
  isOnCampaign
  customTag
  viewingTypes
  reviewAveragePoint
  rating
}
`;

const { formatDateForRanking, toIsoTimestamp } = require('./utils');

function buildHeaders(config, sourcePageUrl) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: config.ranking.origin,
    Referer: sourcePageUrl || config.ranking.referer,
    'User-Agent': config.ranking.userAgent
  };

  if (config.dmm.cookieHeader) {
    headers.Cookie = config.dmm.cookieHeader;
  }

  return headers;
}

function buildAffiliateSearchUrlBase(config) {
  return `https://affiliate.dmm.com/search_link?site=dmm&affiliateId=${encodeURIComponent(config.affiliate.searchAffiliateId)}&service=mono&floor=dvd&sort=date&keyword=`;
}

function splitTitleAndActress(rawTitle) {
  const normalized = String(rawTitle ?? '').trim();
  if (!normalized) {
    return {
      title: '（タイトル不明）',
      actress: ''
    };
  }

  const parts = normalized.split(/\s+/);
  if (parts.length === 1) {
    return {
      title: normalized,
      actress: ''
    };
  }

  return {
    title: parts.slice(0, -1).join(' '),
    actress: parts.at(-1)
  };
}

function buildSearchUrl(config, title, actress) {
  const keyword = actress || title;
  return `${buildAffiliateSearchUrlBase(config)}${encodeURIComponent(keyword)}`;
}

function buildPlaybackUrl(seasonId, contentId = seasonId) {
  const url = new URL('https://tv.dmm.com/vod/playback/on-demand/');
  url.searchParams.set('season', seasonId);
  url.searchParams.set('content', contentId);
  url.searchParams.set('mode', 'sample');
  return url.toString();
}

function parseArrayParam(searchParams, key) {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length ? values : undefined;
}

function parseSourcePageUrl(config, sourcePageUrl) {
  const fallbackUrl = config.ranking.sourcePageUrl;
  let parsedUrl;

  try {
    parsedUrl = new URL(sourcePageUrl || fallbackUrl);
  } catch {
    parsedUrl = new URL(fallbackUrl);
  }

  const searchParams = parsedUrl.searchParams;
  const parsedFirst = Number(searchParams.get('first'));

  return {
    sourcePageUrl: parsedUrl.toString(),
    variables: {
      campaigns: parseArrayParam(searchParams, 'campaigns'),
      casts: parseArrayParam(searchParams, 'casts'),
      categories: parseArrayParam(searchParams, 'categories') || config.ranking.categories,
      contentType: searchParams.get('contentType') || undefined,
      first: Number.isFinite(parsedFirst) ? Math.max(1, parsedFirst) : undefined,
      genres: parseArrayParam(searchParams, 'genres'),
      keyword: searchParams.get('keyword') || undefined,
      series: searchParams.get('series') || undefined,
      sort: searchParams.get('sort') || undefined,
      staffs: parseArrayParam(searchParams, 'staffs'),
      title: searchParams.get('title') || undefined,
      viewingTypes: parseArrayParam(searchParams, 'viewingTypes')
    }
  };
}

async function fetchRanking(config, options = {}) {
  const parsedUrl = parseSourcePageUrl(config, options.sourcePageUrl);
  const first = Math.max(1, Number(options.first || parsedUrl.variables.first || config.ranking.first));
  const body = {
    operationName: 'FetchSearchVideos',
    variables: {
      sort: parsedUrl.variables.sort || config.ranking.sort,
      categories: parsedUrl.variables.categories,
      genres: parsedUrl.variables.genres,
      casts: parsedUrl.variables.casts,
      staffs: parsedUrl.variables.staffs,
      series: parsedUrl.variables.series,
      contentType: parsedUrl.variables.contentType,
      viewingTypes: parsedUrl.variables.viewingTypes,
      campaigns: parsedUrl.variables.campaigns,
      keyword: parsedUrl.variables.keyword,
      title: parsedUrl.variables.title,
      device: config.ranking.device,
      first
    },
    query: SEARCH_QUERY
  };

  const response = await fetch(config.ranking.endpoint, {
    method: 'POST',
    headers: buildHeaders(config, parsedUrl.sourcePageUrl),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json ? JSON.stringify(json).slice(0, 300) : response.statusText;
    throw new Error(`ランキング取得に失敗しました: ${response.status} ${message}`);
  }

  const edges = json?.data?.searchVideos?.edges;
  if (!Array.isArray(edges)) {
    throw new Error('ランキングAPIのレスポンスに data.searchVideos.edges が含まれていません。');
  }

  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date());
  const items = edges.map((edge, index) => {
    const node = edge?.node || {};
    const seasonId = node.id;
    const rawTitle = node.titleName || node.seasonName || '';
    const parsed = splitTitleAndActress(rawTitle);
    const title = parsed.title;
    const actress = parsed.actress;

    return {
      fetchedAt,
      fetchedDateLabel: dateLabel,
      rank: index + 1,
      seasonId,
      sourcePageUrl: parsedUrl.sourcePageUrl,
      title,
      actress,
      rawTitle,
      thumbnailUrl:
        node.packageLargeImage || node.packageImage || node.keyVisualImage || node.keyVisualWithoutLogoImage || '',
      detailUrl: `https://tv.dmm.com/vod/detail/?season=${seasonId}`,
      playbackUrl: buildPlaybackUrl(seasonId),
      searchUrl: buildSearchUrl(config, title, actress),
      source: 'ranking'
    };
  });

  return {
    fetchedAt,
    sourcePageUrl: parsedUrl.sourcePageUrl,
    total: json?.data?.searchVideos?.total ?? items.length,
    items
  };
}

module.exports = {
  fetchRanking
};
