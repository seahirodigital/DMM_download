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

function buildKeywordSourcePageUrl(config, keyword) {
  const url = new URL('https://tv.dmm.com/vod/restrict/list/');
  for (const category of config.ranking.categories || []) {
    url.searchParams.append('categories', category);
  }
  url.searchParams.set('sort', config.ranking.sort || 'RANK');
  url.searchParams.set('keyword', keyword);
  return url.toString();
}

function hasAffiliateItemListCredentials(config) {
  return Boolean(config.affiliate?.apiId && config.affiliate?.itemListAffiliateId);
}

function asArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value.item)) {
    return value.item;
  }
  return [value];
}

function getAffiliateItemActresses(item) {
  return asArray(item?.iteminfo?.actor || item?.iteminfo?.actress)
    .map((entry) => String(entry?.name || entry || '').trim())
    .filter(Boolean);
}

function getAffiliateItemThumbnail(item) {
  return item?.imageURL?.large || item?.imageURL?.small || item?.imageURL?.list || '';
}

function getAffiliateItemPlaybackUrl(item) {
  const sample = item?.sampleMovieURL || {};
  return (
    sample.size_720_480 ||
    sample.size_644_414 ||
    sample.size_560_360 ||
    sample.size_476_306 ||
    ''
  );
}

function normalizeAffiliateTitle(rawTitle, actressNames) {
  let title = String(rawTitle || '（タイトル不明）').trim();
  for (const actress of actressNames) {
    title = title.replace(new RegExp(`\\s*/?\\s*${escapeRegExp(actress)}\\s*$`), '').trim();
  }
  return title || String(rawTitle || '（タイトル不明）').trim() || '（タイトル不明）';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const variables = {
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
  };
  const result = await fetchSearchVideosPage(config, {
    errorLabel: 'ランキング取得',
    sourcePageUrl: parsedUrl.sourcePageUrl,
    variables
  });

  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date());
  const items = mapSearchEdges(config, result.edges, {
    dateLabel,
    fetchedAt,
    source: 'ranking',
    sourcePageUrl: parsedUrl.sourcePageUrl
  });

  return {
    fetchedAt,
    sourcePageUrl: parsedUrl.sourcePageUrl,
    total: result.total ?? items.length,
    items
  };
}

async function fetchSearchVideosPage(config, options = {}) {
  const body = {
    operationName: 'FetchSearchVideos',
    variables: options.variables || {},
    query: SEARCH_QUERY
  };

  const response = await fetch(config.ranking.endpoint, {
    method: 'POST',
    headers: buildHeaders(config, options.sourcePageUrl),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json ? JSON.stringify(json).slice(0, 300) : response.statusText;
    throw new Error(`${options.errorLabel || 'DMM検索'}に失敗しました: ${response.status} ${message}`);
  }

  const edges = json?.data?.searchVideos?.edges;
  if (!Array.isArray(edges)) {
    throw new Error('DMM検索APIのレスポンスに data.searchVideos.edges が含まれていません。');
  }

  return {
    edges,
    pageInfo: json?.data?.searchVideos?.pageInfo || {},
    total: json?.data?.searchVideos?.total
  };
}

function mapSearchEdges(config, edges, options = {}) {
  const {
    actressFallback = '',
    dateLabel = formatDateForRanking(new Date()),
    fetchedAt = toIsoTimestamp(),
    rankOffset = 0,
    source = 'search',
    sourcePageUrl = ''
  } = options;

  return edges.map((edge, index) => {
    const node = edge?.node || {};
    const seasonId = node.id;
    const rawTitle = node.titleName || node.seasonName || '';
    const parsed = splitTitleAndActress(rawTitle);
    const title = parsed.title;
    const actress = parsed.actress || actressFallback;

    return {
      fetchedAt,
      fetchedDateLabel: dateLabel,
      rank: rankOffset + index + 1,
      seasonId,
      sourcePageUrl,
      title,
      actress,
      rawTitle,
      thumbnailUrl:
        node.packageLargeImage || node.packageImage || node.keyVisualImage || node.keyVisualWithoutLogoImage || '',
      detailUrl: `https://tv.dmm.com/vod/detail/?season=${seasonId}`,
      playbackUrl: buildPlaybackUrl(seasonId),
      searchUrl: buildSearchUrl(config, title, actress),
      source
    };
  });
}

async function fetchAffiliateItemListPage(config, options = {}) {
  const url = new URL(config.affiliate.itemListEndpoint);
  const params = {
    affiliate_id: config.affiliate.itemListAffiliateId,
    api_id: config.affiliate.apiId,
    floor: config.affiliate.itemListFloor,
    hits: options.hits,
    keyword: options.keyword,
    offset: options.offset,
    output: 'json',
    service: config.affiliate.itemListService,
    site: config.affiliate.itemListSite,
    sort: config.affiliate.itemListSort
  };

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(config.downloads.requestTimeoutMs)
  });
  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json ? JSON.stringify(json).slice(0, 300) : response.statusText;
    throw new Error(`DMM ItemList API検索に失敗しました: ${response.status} ${message}`);
  }

  const result = json?.result || {};
  if (result.status && String(result.status) !== '200') {
    throw new Error(`DMM ItemList API検索に失敗しました: ${result.message || result.status}`);
  }

  const items = Array.isArray(result.items) ? result.items : [];
  return {
    items,
    resultCount: Number(result.result_count || items.length),
    total: Number(result.total_count || items.length)
  };
}

function mapAffiliateItems(config, apiItems, options = {}) {
  const {
    actressFallback = '',
    dateLabel = formatDateForRanking(new Date()),
    fetchedAt = toIsoTimestamp(),
    rankOffset = 0,
    sourcePageUrl = ''
  } = options;

  return apiItems.map((item, index) => {
    const actressNames = getAffiliateItemActresses(item);
    const actress = actressNames.join(', ') || actressFallback;
    const title = normalizeAffiliateTitle(item.title, actressNames);
    const contentId = item.content_id || item.product_id || item.cid || item.itemCode || '';
    const detailUrl = item.URL || item.affiliateURL || '';

    return {
      actress,
      contentId,
      detailUrl,
      fetchedAt,
      fetchedDateLabel: dateLabel,
      playbackUrl: getAffiliateItemPlaybackUrl(item),
      rank: rankOffset + index + 1,
      rawTitle: item.title || title,
      searchUrl: buildSearchUrl(config, title, actress),
      source: 'affiliate-actress-search',
      sourcePageUrl,
      thumbnailUrl: getAffiliateItemThumbnail(item),
      title
    };
  });
}

async function fetchAffiliateActressSearch(config, options = {}) {
  const actress = String(options.actress || '').trim();
  if (!actress) {
    throw new Error('女優名を入力してください。');
  }

  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || config.affiliate.itemListHits || 100)));
  const maxPages = Math.max(1, Math.min(100, Number(options.maxPages || 100)));
  const sourcePageUrl = buildSearchUrl(config, '', actress);
  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date(fetchedAt));
  const seenContentIds = new Set();
  const items = [];
  let offset = 1;
  let page = 0;
  let total = 0;

  while (page < maxPages) {
    const result = await fetchAffiliateItemListPage(config, {
      hits: pageSize,
      keyword: actress,
      offset
    });
    total = Number.isFinite(result.total) ? result.total : total;

    const pageItems = result.items.filter((item) => {
      const contentId = item.content_id || item.product_id || item.cid || item.itemCode || item.URL || item.affiliateURL;
      if (!contentId || seenContentIds.has(contentId)) {
        return false;
      }
      seenContentIds.add(contentId);
      return true;
    });

    items.push(
      ...mapAffiliateItems(config, pageItems, {
        actressFallback: actress,
        dateLabel,
        fetchedAt,
        rankOffset: items.length,
        sourcePageUrl
      })
    );

    page += 1;
    offset += result.resultCount || result.items.length;
    if (!result.items.length || (total && offset > total)) {
      break;
    }
  }

  return {
    fetchedAt,
    items,
    pageSize,
    pagesFetched: page,
    provider: 'affiliate',
    query: actress,
    sourcePageUrl,
    total: total || items.length
  };
}

async function fetchTvActressSearch(config, options = {}) {
  const actress = String(options.actress || '').trim();
  if (!actress) {
    throw new Error('女優名を入力してください。');
  }

  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 100)));
  const maxPages = Math.max(1, Math.min(100, Number(options.maxPages || 100)));
  const sourcePageUrl = buildKeywordSourcePageUrl(config, actress);
  const baseVariables = {
    sort: options.sort || config.ranking.sort,
    categories: config.ranking.categories,
    keyword: actress,
    device: config.ranking.device
  };
  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date(fetchedAt));
  const seenSeasonIds = new Set();
  const items = [];
  let after;
  let total = 0;
  let page = 0;

  while (page < maxPages) {
    const result = await fetchSearchVideosPage(config, {
      errorLabel: '女優名検索',
      sourcePageUrl,
      variables: {
        ...baseVariables,
        first: pageSize,
        after
      }
    });
    total = Number.isFinite(Number(result.total)) ? Number(result.total) : total;

    const pageEdges = result.edges.filter((edge) => {
      const seasonId = edge?.node?.id;
      if (!seasonId || seenSeasonIds.has(seasonId)) {
        return false;
      }
      seenSeasonIds.add(seasonId);
      return true;
    });

    items.push(
      ...mapSearchEdges(config, pageEdges, {
        actressFallback: actress,
        dateLabel,
        fetchedAt,
        rankOffset: items.length,
        source: 'actress-search',
        sourcePageUrl
      })
    );

    page += 1;
    after = result.pageInfo?.endCursor;
    if (!result.pageInfo?.hasNextPage || !after) {
      break;
    }
  }

  return {
    fetchedAt,
    query: actress,
    sourcePageUrl,
    total: total || items.length,
    items,
    pageSize,
    pagesFetched: page,
    provider: 'tv-graphql'
  };
}

async function fetchActressSearch(config, options = {}) {
  if (hasAffiliateItemListCredentials(config)) {
    return fetchAffiliateActressSearch(config, options);
  }

  return fetchTvActressSearch(config, options);
}

module.exports = {
  fetchActressSearch,
  fetchRanking
};
