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
  { site: 'FANZA', service: 'digital', floor: 'videoa' },
  { site: 'FANZA', service: 'mono', floor: 'dvd' },
  { site: 'DMM.com', service: 'mono', floor: 'dvd' }
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

function buildAffiliateKeywordSourcePageUrl(config, keyword, target) {
  const url = new URL('https://affiliate.dmm.com/search_link');
  url.searchParams.set('site', 'dmm');
  url.searchParams.set('affiliateId', config.affiliate.searchAffiliateId);
  url.searchParams.set('service', target?.service || config.affiliate.itemListService);
  url.searchParams.set('floor', target?.floor || config.affiliate.itemListFloor);
  url.searchParams.set('sort', target?.sort || config.affiliate.itemListSort || 'date');
  url.searchParams.set('keyword', keyword);
  return url.toString();
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

function normalizeSearchProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'd' || normalized === 'dmm' || normalized === 'dmm.com') {
    return 'dmm';
  }
  if (normalized === 'f' || normalized === 'fanza') {
    return 'fanza';
  }
  return 'fanza';
}

function isFanzaItemListTarget(target = {}) {
  return String(target.site || '').toLowerCase() === 'fanza';
}

function getActressItemListTargets(config, provider = 'fanza') {
  const normalizedProvider = normalizeSearchProvider(provider);
  return [...getItemListTargets(config)]
    .filter((target) =>
      normalizedProvider === 'fanza' ? isFanzaItemListTarget(target) : !isFanzaItemListTarget(target)
    )
    .sort((left, right) => {
      const leftFanza = isFanzaItemListTarget(left) ? 0 : 1;
      const rightFanza = isFanzaItemListTarget(right) ? 0 : 1;
      const leftDigital = String(left.service || '').toLowerCase() === 'digital' ? 0 : 1;
      const rightDigital = String(right.service || '').toLowerCase() === 'digital' ? 0 : 1;
      const leftVideoa = String(left.floor || '').toLowerCase() === 'videoa' ? 0 : 1;
      const rightVideoa = String(right.floor || '').toLowerCase() === 'videoa' ? 0 : 1;
      return leftFanza - rightFanza || leftDigital - rightDigital || leftVideoa - rightVideoa;
    });
}

function getKeywordItemListTargets(config, provider = 'fanza') {
  const keywordSort = config.affiliate.itemListKeywordSort || 'match';
  return getActressItemListTargets(config, provider).map((target) => ({
    ...target,
    sort: keywordSort
  }));
}

function formatProductCode(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const normalized = raw
    .normalize('NFKC')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^0-9a-z]/gi, '');
  const match = /([a-z]+)0*(\d+[a-z]?)$/i.exec(normalized);
  if (!match) {
    return raw.toUpperCase();
  }

  const number = match[2].replace(/^0+(?=\d)/, '').toUpperCase();
  return `${match[1].toUpperCase()}-${number}`;
}

function getAffiliateItemProductCode(item) {
  return formatProductCode(item?.product_id || item?.content_id || item?.cid || item?.itemCode || '');
}

function getAffiliateItemReleaseDate(item) {
  return item?.date || item?.iteminfo?.date || item?.release_date || '';
}

function createAffiliateItemDeduper() {
  const seenContentIds = new Set();
  const seenTitleKeys = new Set();

  return function shouldKeepAffiliateItem(item) {
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
  };
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
    if (/\.(m3u8|mp4|m4v|mov|webm)$/i.test(url.pathname)) {
      return url.toString();
    }

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
    return null;
  }

  return (
    actresses.find((actress) => normalizeSearchText(actress.name) === normalizedKeyword) ||
    actresses.find((actress) => normalizeSearchText(actress.ruby) === normalizedKeyword) ||
    actresses.find((actress) => normalizeSearchText(actress.name).includes(normalizedKeyword)) ||
    actresses.find((actress) => normalizeSearchText(actress.ruby).includes(normalizedKeyword)) ||
    null
  );
}

function pickExactActress(actresses, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) {
    return null;
  }

  return (
    actresses.find((actress) => normalizeSearchText(actress.name) === normalizedKeyword) ||
    actresses.find((actress) => normalizeSearchText(actress.ruby) === normalizedKeyword) ||
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

function parseFirstArrayParam(searchParams, keys) {
  for (const key of keys) {
    const values = parseArrayParam(searchParams, key);
    if (values) {
      return values;
    }
  }
  return undefined;
}

function hasVrBadge(value) {
  return /【\s*VR\s*】|\[\s*VR\s*\]|（\s*VR\s*）|\(\s*VR\s*\)/i.test(String(value || ''));
}

function isVrRankingItem(item) {
  return hasVrBadge(item?.rawTitle) || hasVrBadge(item?.title);
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
      viewingTypes: parseFirstArrayParam(searchParams, ['viewing_types', 'viewingTypes'])
    }
  };
}

async function fetchRanking(config, options = {}) {
  const parsedUrl = parseSourcePageUrl(config, options.sourcePageUrl);
  const first = Math.max(1, Number(options.first || parsedUrl.variables.first || config.ranking.first));
  const fetchFirst = Math.min(100, Math.max(first, first * 2));
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
    first: fetchFirst
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
  })
    .filter((item) => !isVrRankingItem(item))
    .slice(0, first)
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));

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
      actressCount: actress ? 1 : 0,
      productCode: formatProductCode(seasonId),
      releaseDate: '',
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
    source = '',
    sourcePageUrl = '',
    target = null
  } = options;

  return apiItems.map((item, index) => {
    const actressNames = getAffiliateItemActresses(item);
    const actress = actressNames.join(', ') || actressFallback;
    const title = normalizeAffiliateTitle(item.title, actressNames);
    const contentId = item.content_id || item.product_id || item.cid || item.itemCode || '';
    const productCode = getAffiliateItemProductCode(item);
    const detailUrl = item.URL || item.affiliateURL || '';

    return {
      actress,
      actressCount: actressNames.length || (actress ? 1 : 0),
      contentId,
      detailUrl,
      fetchedAt,
      fetchedDateLabel: dateLabel,
      playbackUrl: getAffiliateItemPlaybackUrl(item),
      productCode,
      releaseDate: getAffiliateItemReleaseDate(item),
      rank: rankOffset + index + 1,
      rawTitle: item.title || title,
      searchUrl: buildSearchUrl(config, title, actress),
      source: source || (isFanzaItemListTarget(target) ? 'fanza-actress-search' : 'affiliate-actress-search'),
      sourcePageUrl,
      thumbnailFallbackUrl: getAffiliateItemThumbnailFallback(item),
      thumbnailUrl: getAffiliateItemThumbnail(item),
      title
    };
  });
}

async function fetchAffiliateKeywordSearch(config, options = {}) {
  const keyword = String(options.keyword || options.actress || '').trim();
  if (!keyword) {
    throw new Error('検索語を入力してください。');
  }

  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || config.affiliate.itemListHits || 100)));
  const maxPages = Math.max(1, Math.min(100, Number(options.maxPages || 100)));
  const stopAfterItems = Math.max(0, Number(options.stopAfterItems || 0));
  const searchProvider = normalizeSearchProvider(options.searchProvider || options.provider);
  const itemListTargets = getKeywordItemListTargets(config, searchProvider);
  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date(fetchedAt));
  const shouldKeepAffiliateItem = createAffiliateItemDeduper();
  const items = [];
  const usedTargets = [];
  const actressMeta = options.actress && typeof options.actress === 'object' ? options.actress : null;
  let pagesFetched = 0;
  let sourcePageUrl = buildAffiliateKeywordSourcePageUrl(config, keyword, itemListTargets[0] || null);
  let hasMore = false;
  let total = 0;

  async function collectItemsForTarget(target) {
    const targetSourcePageUrl = buildAffiliateKeywordSourcePageUrl(config, keyword, target);
    let offset = 1;
    let page = 0;
    let targetTotal = 0;
    let added = 0;

    while (page < maxPages) {
      const result = await fetchAffiliateItemListPage(config, {
        ...target,
        hits: pageSize,
        keyword,
        offset
      });
      targetTotal = Number.isFinite(result.total) ? result.total : targetTotal;

      const pageItems = result.items.filter(shouldKeepAffiliateItem);
      const mappedItems = mapAffiliateItems(config, pageItems, {
        actressFallback: '',
        dateLabel,
        fetchedAt,
        rankOffset: items.length,
        source: isFanzaItemListTarget(target) ? 'fanza-keyword-search' : 'affiliate-keyword-search',
        sourcePageUrl: targetSourcePageUrl,
        target
      });
      items.push(...mappedItems);
      added += mappedItems.length;

      page += 1;
      offset += result.resultCount || result.items.length;
      if (stopAfterItems && items.length >= stopAfterItems) {
        hasMore = Boolean((targetTotal && offset <= targetTotal) || page < maxPages);
        break;
      }
      if (!result.items.length || (targetTotal && offset > targetTotal)) {
        break;
      }
    }

    if (targetTotal && offset <= targetTotal) {
      hasMore = true;
    }

    return {
      added,
      pagesFetched: page,
      sourcePageUrl: targetSourcePageUrl,
      target,
      total: targetTotal || added
    };
  }

  for (const target of itemListTargets) {
    const result = await collectItemsForTarget(target);
    if (result.added) {
      if (!usedTargets.length) {
        sourcePageUrl = result.sourcePageUrl;
      }
      usedTargets.push({
        floor: target.floor,
        mode: 'keyword',
        service: target.service,
        site: target.site,
        sort: target.sort
      });
      pagesFetched += result.pagesFetched;
      total += result.total;
    }
    if (stopAfterItems && items.length >= stopAfterItems) {
      hasMore = hasMore || itemListTargets.indexOf(target) < itemListTargets.length - 1;
      break;
    }
  }

  return {
    actress: actressMeta,
    actressMatches: options.actressMatches || [],
    fetchedAt,
    items,
    itemListTarget: usedTargets[0] || itemListTargets[0] || null,
    itemListTargets: usedTargets,
    pageSize,
    pagesFetched,
    provider: 'affiliate-keyword-search',
    query: keyword,
    searchProvider,
    searchType: 'keyword',
    sourcePageUrl,
    total: total || items.length,
    hasMore
  };
}

async function fetchAffiliateActressSearch(config, options = {}) {
  const keyword = String(options.keyword || options.actress || '').trim();
  if (!keyword) {
    throw new Error('検索語を入力してください。');
  }

  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || config.affiliate.itemListHits || 100)));
  const maxPages = Math.max(1, Math.min(100, Number(options.maxPages || 100)));
  const stopAfterItems = Math.max(0, Number(options.stopAfterItems || 0));
  const actressSearchHits = Math.max(1, Math.min(100, Number(options.actressHits || 20)));
  const searchProvider = normalizeSearchProvider(options.provider);
  const itemListTargets = getActressItemListTargets(config, searchProvider);
  const actressPage = await fetchAffiliateActressPage(config, {
    hits: actressSearchHits,
    keyword,
    offset: 1
  });
  const exactActress = pickExactActress(actressPage.actresses, keyword);
  const matchedActress = exactActress || pickBestActress(actressPage.actresses, keyword);
  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date(fetchedAt));
  const shouldKeepAffiliateItem = createAffiliateItemDeduper();
  const items = [];
  let pagesFetched = 0;
  const usedTargets = [];
  let sourcePageUrl = buildActressSourcePageUrl(config, matchedActress, itemListTargets[0] || null, keyword);
  let hasMore = false;
  let total = 0;

  if (!exactActress?.id) {
    return fetchAffiliateKeywordSearch(config, {
      ...options,
      actressMatches: actressPage.actresses.map(mapActressMeta),
      keyword,
      searchProvider
    });
  }

  async function collectItemsForTarget(target, mode) {
    const targetSourcePageUrl = buildActressSourcePageUrl(config, matchedActress, target, keyword);
    let offset = 1;
    let page = 0;
    let targetTotal = 0;
    let added = 0;

    while (page < maxPages) {
      const result = await fetchAffiliateItemListPage(config, {
        ...target,
        ...(mode === 'keyword'
          ? { keyword: matchedActress.name || keyword }
          : { article: 'actress', articleId: matchedActress.id }),
        hits: pageSize,
        offset
      });
      targetTotal = Number.isFinite(result.total) ? result.total : targetTotal;

      const pageItems = result.items.filter(shouldKeepAffiliateItem);

      const mappedItems = mapAffiliateItems(config, pageItems, {
        actressFallback: matchedActress.name || keyword,
        dateLabel,
        fetchedAt,
        rankOffset: items.length,
        sourcePageUrl: targetSourcePageUrl,
        target
      });
      items.push(...mappedItems);
      added += mappedItems.length;

      page += 1;
      offset += result.resultCount || result.items.length;
      if (stopAfterItems && items.length >= stopAfterItems) {
        hasMore = Boolean((targetTotal && offset <= targetTotal) || page < maxPages);
        break;
      }
      if (!result.items.length || (targetTotal && offset > targetTotal)) {
        break;
      }
    }

    if (targetTotal && offset <= targetTotal) {
      hasMore = true;
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
        site: target.site,
        sort: target.sort
      });
      pagesFetched += result.pagesFetched;
      total += result.total;
    }
    if (stopAfterItems && items.length >= stopAfterItems) {
      hasMore = hasMore || itemListTargets.indexOf(target) < itemListTargets.length - 1;
      break;
    }
  }

  if (!items.length) {
    return fetchAffiliateKeywordSearch(config, {
      ...options,
      actress: mapActressMeta(matchedActress),
      actressMatches: actressPage.actresses.map(mapActressMeta),
      keyword,
      searchProvider
    });
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
    query: matchedActress.name || keyword,
    searchProvider,
    searchType: 'actress',
    sourcePageUrl,
    total: total || items.length,
    hasMore
  };
}

async function fetchTvActressSearch(config, options = {}) {
  const keyword = String(options.keyword || options.actress || '').trim();
  if (!keyword) {
    throw new Error('検索語を入力してください。');
  }

  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 100)));
  const maxPages = Math.max(1, Math.min(100, Number(options.maxPages || 100)));
  const stopAfterItems = Math.max(0, Number(options.stopAfterItems || 0));
  const sourcePageUrl = buildKeywordSourcePageUrl(config, keyword);
  const baseVariables = {
    sort: options.sort || config.ranking.sort,
    categories: config.ranking.categories,
    keyword,
    device: config.ranking.device
  };
  const fetchedAt = toIsoTimestamp();
  const dateLabel = formatDateForRanking(new Date(fetchedAt));
  const seenSeasonIds = new Set();
  const seenTitleKeys = new Set();
  const items = [];
  let after;
  let hasMore = false;
  let total = 0;
  let page = 0;

  while (page < maxPages) {
    const result = await fetchSearchVideosPage(config, {
      errorLabel: 'キーワード検索',
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
        actressFallback: keyword,
        dateLabel,
        fetchedAt,
        rankOffset: items.length,
        source: 'actress-search',
        sourcePageUrl
      })
    );

    page += 1;
    after = result.pageInfo?.endCursor;
    hasMore = Boolean(result.pageInfo?.hasNextPage && after);
    if (stopAfterItems && items.length >= stopAfterItems) {
      break;
    }
    if (!hasMore) {
      break;
    }
  }

  return {
    fetchedAt,
    query: keyword,
    sourcePageUrl,
    total: items.length,
    items,
    pageSize,
    pagesFetched: page,
    provider: 'tv-graphql',
    searchProvider: 'dmm',
    searchType: 'keyword',
    hasMore
  };
}

async function fetchActressSearch(config, options = {}) {
  const searchProvider = normalizeSearchProvider(options.provider);

  if (searchProvider === 'dmm') {
    if (hasAffiliateApiCredentials(config)) {
      return fetchAffiliateKeywordSearch(config, {
        ...options,
        provider: 'dmm'
      });
    }

    return fetchTvActressSearch(config, {
      ...options,
      provider: 'dmm'
    });
  }

  if (hasAffiliateApiCredentials(config)) {
    return fetchAffiliateActressSearch(config, {
      ...options,
      provider: 'fanza'
    });
  }

  throw new Error('FANZA検索にはDMM Affiliate APIの設定が必要です。');
}

module.exports = {
  fetchActressSearch,
  fetchRanking
};
