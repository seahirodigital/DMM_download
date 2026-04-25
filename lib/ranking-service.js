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

const DEFAULT_ITEM_LIST_FALLBACK_TARGETS = [
  { site: 'DMM.com', service: 'mono', floor: 'dvd' },
  { site: 'FANZA', service: 'digital', floor: 'videoa' },
  { site: 'FANZA', service: 'mono', floor: 'dvd' }
];
const LITEVIDEO_QUALITY_SIZES = ['1920_1080', '1280_720', '720_480', '644_414', '560_360', '476_306'];
const SEARCH_TITLE_EXCLUDE_PATTERNS = [/BOD/i, /ブルーレイ/i, /blu[-\s]?ray/i];

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

function hasAffiliateApiCredentials(config) {
  return Boolean(config.affiliate?.apiId && (config.affiliate?.itemListAffiliateId || config.affiliate?.affiliateId));
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

function normalizeItemListTarget(target = {}) {
  return {
    floor: String(target.floor || '').trim(),
    service: String(target.service || '').trim(),
    site: String(target.site || '').trim(),
    sort: String(target.sort || '').trim()
  };
}

function getItemListTargets(config) {
  const primary = normalizeItemListTarget({
    floor: config.affiliate.itemListFloor,
    service: config.affiliate.itemListService,
    site: config.affiliate.itemListSite,
    sort: config.affiliate.itemListSort
  });
  const configuredFallbacks = asArray(config.affiliate.itemListFallbackTargets)
    .map(normalizeItemListTarget)
    .filter((target) => target.site && target.service && target.floor);
  const targets = [primary, ...configuredFallbacks, ...DEFAULT_ITEM_LIST_FALLBACK_TARGETS.map(normalizeItemListTarget)];
  const seen = new Set();

  return targets.filter((target) => {
    if (!target.site || !target.service || !target.floor) {
      return false;
    }

    const key = `${target.site}\0${target.service}\0${target.floor}\0${target.sort || config.affiliate.itemListSort || ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getAffiliateItemActresses(item) {
  return asArray(item?.iteminfo?.actor || item?.iteminfo?.actress)
    .map((entry) => String(entry?.name || entry || '').trim())
    .filter(Boolean);
}

function inferLargePackageImageUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.replace(/p[st](\.(?:jpe?g|webp|png)(?:\?.*)?)$/i, 'pl$1');
}

function preferFullSizeImageUrl(url) {
  return inferLargePackageImageUrl(url);
}

function getAffiliateItemThumbnail(item) {
  const imageUrl = item?.imageURL || {};
  return (
    preferFullSizeImageUrl(imageUrl.large) ||
    preferFullSizeImageUrl(imageUrl.small || imageUrl.list) ||
    imageUrl.large ||
    imageUrl.small ||
    imageUrl.list ||
    ''
  );
}

function getAffiliateItemThumbnailFallback(item) {
  const imageUrl = item?.imageURL || {};
  const primary = getAffiliateItemThumbnail(item);
  const fallback = imageUrl.large || imageUrl.small || imageUrl.list || '';
  return fallback && fallback !== primary ? fallback : '';
}

function qualityPixelsFromSizeLabel(value) {
  const match = /(\d{3,4})[_x](\d{3,4})/i.exec(String(value || ''));
  if (!match) {
    return 0;
  }
  return Number(match[1]) * Number(match[2]);
}

function litevideoUrlWithQuality(value, qualitySize = LITEVIDEO_QUALITY_SIZES[0]) {
  try {
    const url = new URL(value);
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
    return value || '';
  }
}

function preferHighQualityLitevideoUrl(value) {
  return litevideoUrlWithQuality(value, LITEVIDEO_QUALITY_SIZES[0]);
}

function getBestSampleMovieUrl(sample) {
  const entries = Object.entries(sample || {})
    .filter(([, url]) => url)
    .sort((left, right) => qualityPixelsFromSizeLabel(right[0]) - qualityPixelsFromSizeLabel(left[0]));
  return entries[0]?.[1] || '';
}

function getAffiliateItemPlaybackUrl(item) {
  const sample = item?.sampleMovieURL || {};
  const playbackUrl = getBestSampleMovieUrl(sample);
  return preferHighQualityLitevideoUrl(playbackUrl);
}

function getActressImageUrl(actress) {
  return actress?.imageURL?.large || actress?.imageURL?.small || '';
}

function normalizeSearchText(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

function pickBestActress(actresses, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) {
    return actresses[0] || null;
  }

  return (
    actresses.find((actress) => normalizeSearchText(actress.name) === normalizedKeyword) ||
    actresses.find((actress) => normalizeSearchText(actress.ruby) === normalizedKeyword) ||
    actresses.find((actress) => normalizeSearchText(actress.name).includes(normalizedKeyword)) ||
    actresses.find((actress) => normalizeSearchText(actress.ruby).includes(normalizedKeyword)) ||
    actresses[0] ||
    null
  );
}

function mapActressMeta(actress) {
  if (!actress) {
    return null;
  }

  return {
    birthday: actress.birthday || '',
    bloodType: actress.blood_type || '',
    bust: actress.bust || '',
    cup: actress.cup || '',
    height: actress.height || '',
    hip: actress.hip || '',
    hobby: actress.hobby || '',
    id: String(actress.id || ''),
    imageUrl: getActressImageUrl(actress),
    listUrl: actress.listURL || {},
    name: actress.name || '',
    prefectures: actress.prefectures || '',
    ruby: actress.ruby || '',
    waist: actress.waist || ''
  };
}

function buildActressSourcePageUrl(config, actress, target, fallbackKeyword) {
  const listUrl = actress?.listURL || {};
  const targetService = String(target?.service || '').toLowerCase();
  const matchedUrl =
    (targetService === 'digital' && listUrl.digital) ||
    (targetService === 'mono' && listUrl.mono) ||
    (targetService === 'monthly' && listUrl.monthly) ||
    listUrl.digital ||
    listUrl.mono ||
    listUrl.monthly;

  return matchedUrl || buildSearchUrl(config, '', actress?.name || fallbackKeyword);
}

function normalizeAffiliateTitle(rawTitle, actressNames) {
  let title = String(rawTitle || '（タイトル不明）').trim();
  for (const actress of actressNames) {
    title = title.replace(new RegExp(`\\s*/?\\s*${escapeRegExp(actress)}\\s*$`), '').trim();
  }
  return title || String(rawTitle || '（タイトル不明）').trim() || '（タイトル不明）';
}

function isLimitedQuantityTitle(rawTitle) {
  return String(rawTitle || '').includes('【数量限定】');
}

function hasSearchTitleExcludeWord(rawTitle) {
  const title = String(rawTitle || '');
  return isLimitedQuantityTitle(title) || SEARCH_TITLE_EXCLUDE_PATTERNS.some((pattern) => pattern.test(title));
}

function normalizeSearchTitleForDedup(rawTitle) {
  return String(rawTitle || '')
    .normalize('NFKC')
    .replace(/【数量限定】/g, '')
    .replace(/BOD/gi, '')
    .replace(/ブルーレイ/gi, '')
    .replace(/blu[-\s]?ray/gi, '')
    .replace(/\s+/g, '')
    .replace(/[()[\]{}（）［］「」『』【】]/g, '')
    .toLowerCase();
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

    const thumbnailUrl =
      preferFullSizeImageUrl(node.packageLargeImage || node.packageImage) ||
      node.packageLargeImage ||
      node.packageImage ||
      node.keyVisualImage ||
      node.keyVisualWithoutLogoImage ||
      '';

    return {
      fetchedAt,
      fetchedDateLabel: dateLabel,
      rank: rankOffset + index + 1,
      seasonId,
      sourcePageUrl,
      title,
      actress,
      rawTitle,
      thumbnailUrl,
      detailUrl: `https://tv.dmm.com/vod/detail/?season=${seasonId}`,
      playbackUrl: buildPlaybackUrl(seasonId),
      searchUrl: buildSearchUrl(config, title, actress),
      source
    };
  });
}

async function fetchAffiliateItemListPage(config, options = {}) {
  const url = new URL(config.affiliate.itemListEndpoint);
  const affiliateId = config.affiliate.itemListAffiliateId || config.affiliate.affiliateId;
  const params = {
    article: options.article,
    article_id: options.articleId,
    affiliate_id: affiliateId,
    api_id: config.affiliate.apiId,
    floor: options.floor || config.affiliate.itemListFloor,
    hits: options.hits,
    keyword: options.keyword,
    offset: options.offset,
    output: 'json',
    service: options.service || config.affiliate.itemListService,
    site: options.site || config.affiliate.itemListSite,
    sort: options.sort || config.affiliate.itemListSort
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
    target: {
      floor: params.floor,
      service: params.service,
      site: params.site,
      sort: params.sort
    },
    total: Number(result.total_count || items.length)
  };
}

async function fetchAffiliateActressPage(config, options = {}) {
  const url = new URL(config.affiliate.actressSearchEndpoint);
  const affiliateId = config.affiliate.itemListAffiliateId || config.affiliate.affiliateId;
  const params = {
    affiliate_id: affiliateId,
    api_id: config.affiliate.apiId,
    hits: options.hits,
    keyword: options.keyword,
    offset: options.offset,
    output: 'json',
    sort: options.sort || config.affiliate.actressSearchSort
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
    throw new Error(`DMM ActressSearch API検索に失敗しました: ${response.status} ${message}`);
  }

  const result = json?.result || {};
  if (result.status && String(result.status) !== '200') {
    throw new Error(`DMM ActressSearch API検索に失敗しました: ${result.message || result.status}`);
  }

  const actresses = asArray(result.actress);
  return {
    actresses,
    resultCount: Number(result.result_count || actresses.length),
    total: Number(result.total_count || actresses.length)
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
      thumbnailFallbackUrl: getAffiliateItemThumbnailFallback(item),
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
  const actressSearchHits = Math.max(1, Math.min(100, Number(options.actressHits || 20)));
  const itemListTargets = getItemListTargets(config);
  const actressPage = await fetchAffiliateActressPage(config, {
    hits: actressSearchHits,
    keyword: actress,
    offset: 1
  });
  const matchedActress = pickBestActress(actressPage.actresses, actress);
  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date(fetchedAt));
  const seenContentIds = new Set();
  const seenTitleKeys = new Set();
  const items = [];
  let pagesFetched = 0;
  const usedTargets = [];
  let sourcePageUrl = buildActressSourcePageUrl(config, matchedActress, itemListTargets[0] || null, actress);
  let total = 0;

  if (!matchedActress?.id) {
    return {
      actress: null,
      actressMatches: actressPage.actresses.map(mapActressMeta),
      fetchedAt,
      items,
      pageSize,
      pagesFetched: 0,
      provider: 'affiliate-actress-search',
      query: actress,
      sourcePageUrl,
      total: 0
    };
  }

  async function collectItemsForTarget(target, mode) {
    const targetSourcePageUrl = buildActressSourcePageUrl(config, matchedActress, target, actress);
    let offset = 1;
    let page = 0;
    let targetTotal = 0;
    let added = 0;

    while (page < maxPages) {
      const result = await fetchAffiliateItemListPage(config, {
        ...target,
        ...(mode === 'keyword'
          ? { keyword: matchedActress.name || actress }
          : { article: 'actress', articleId: matchedActress.id }),
        hits: pageSize,
        offset
      });
      targetTotal = Number.isFinite(result.total) ? result.total : targetTotal;

      const pageItems = result.items.filter((item) => {
        if (hasSearchTitleExcludeWord(item?.title)) {
          return false;
        }

        const contentId = item.content_id || item.product_id || item.cid || item.itemCode || item.URL || item.affiliateURL;
        if (!contentId || seenContentIds.has(contentId)) {
          return false;
        }

        const titleKey = normalizeSearchTitleForDedup(normalizeAffiliateTitle(item.title, getAffiliateItemActresses(item)));
        if (titleKey && seenTitleKeys.has(titleKey)) {
          return false;
        }

        seenContentIds.add(contentId);
        if (titleKey) {
          seenTitleKeys.add(titleKey);
        }
        return true;
      });

      const mappedItems = mapAffiliateItems(config, pageItems, {
        actressFallback: matchedActress.name || actress,
        dateLabel,
        fetchedAt,
        rankOffset: items.length,
        sourcePageUrl: targetSourcePageUrl
      });
      items.push(...mappedItems);
      added += mappedItems.length;

      page += 1;
      offset += result.resultCount || result.items.length;
      if (!result.items.length || (targetTotal && offset > targetTotal)) {
        break;
      }
    }

    return {
      added,
      mode,
      pagesFetched: page,
      sourcePageUrl: targetSourcePageUrl,
      target,
      total: targetTotal || added
    };
  }

  for (const target of itemListTargets) {
    let result = await collectItemsForTarget(target, 'article');

    if (!result.added && String(target.site).toLowerCase() === 'dmm.com') {
      result = await collectItemsForTarget(target, 'keyword');
    }

    if (result.added) {
      if (!usedTargets.length) {
        sourcePageUrl = result.sourcePageUrl;
      }
      usedTargets.push({
        floor: target.floor,
        mode: result.mode,
        service: target.service,
        site: target.site
      });
      pagesFetched += result.pagesFetched;
      total += result.total;
    }
  }

  return {
    actress: mapActressMeta(matchedActress),
    actressMatches: actressPage.actresses.map(mapActressMeta),
    fetchedAt,
    items,
    itemListTarget: usedTargets[0] || itemListTargets[0] || null,
    itemListTargets: usedTargets,
    pageSize,
    pagesFetched,
    provider: 'affiliate-actress-search',
    query: matchedActress.name || actress,
    sourcePageUrl,
    total: items.length
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
  const seenTitleKeys = new Set();
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
      const rawTitle = edge?.node?.titleName || edge?.node?.seasonName || '';
      if (hasSearchTitleExcludeWord(rawTitle)) {
        return false;
      }

      if (!seasonId || seenSeasonIds.has(seasonId)) {
        return false;
      }

      const parsed = splitTitleAndActress(rawTitle);
      const titleKey = normalizeSearchTitleForDedup(parsed.title || rawTitle);
      if (titleKey && seenTitleKeys.has(titleKey)) {
        return false;
      }

      seenSeasonIds.add(seasonId);
      if (titleKey) {
        seenTitleKeys.add(titleKey);
      }
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
    total: items.length,
    items,
    pageSize,
    pagesFetched: page,
    provider: 'tv-graphql'
  };
}

async function fetchActressSearch(config, options = {}) {
  if (hasAffiliateApiCredentials(config)) {
    return fetchAffiliateActressSearch(config, options);
  }

  throw new Error(
    'DMM ActressSearch APIの認証情報が未設定です。ローカルは config/app-config.json、Vercelは DMM_API_ID と DMM_AFFILIATE_ID を設定してください。'
  );
}

module.exports = {
  fetchActressSearch,
  fetchRanking
};
