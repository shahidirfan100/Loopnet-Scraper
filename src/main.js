import { Actor, log } from 'apify';
import { load as cheerioLoad } from 'cheerio';
import { firefox } from 'playwright';
import { readFile } from 'node:fs/promises';

await Actor.init();

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.7; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
];

const BLOCKED_HOST_PATTERNS = [/google-analytics/i, /googletagmanager/i, /doubleclick/i, /facebook/i, /crazyegg/i];
const LISTING_SIGNALS_PATTERN = /data-gtm-listing[_-]id=|data-gtm-listing[_-]id|<article[^>]*class=["'][^"']*placard|RealEstateListing/i;
const CHALLENGE_SIGNALS_PATTERN = /sec-if-cpt-container|Powered and protected by|\/akam\//i;
const AVAILABLE_AVAILABILITY_TOKENS = new Set(['instock', 'limitedavailability', 'presale', 'preorder', 'onlineonly']);
const UNAVAILABLE_AVAILABILITY_TOKENS = new Set(['outofstock', 'soldout', 'discontinued']);

function parsePositiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function valueOrFallback(value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string' && value.trim() === '') return fallback;
    return value;
}

function parseBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
}

function normalizeUrl(value, base = 'https://www.loopnet.com') {
    if (!value || typeof value !== 'string') return null;
    try {
        return new URL(value, base).toString();
    } catch {
        return null;
    }
}

function sanitizeSearchUrl(value, base = 'https://www.loopnet.com') {
    const normalized = normalizeUrl(value, base);
    if (!normalized) return null;

    const parsed = new URL(normalized);
    parsed.search = '';
    parsed.hash = '';

    if (!parsed.pathname.endsWith('/')) parsed.pathname = `${parsed.pathname}/`;

    return parsed.toString();
}

function listingTypeFromUrl(value) {
    const normalized = sanitizeSearchUrl(value);
    if (!normalized) return null;

    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/(for-sale|for-lease)(?:\/|$)/i);
    return match ? match[1].toLowerCase() : null;
}

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasListingSignals(html) {
    return LISTING_SIGNALS_PATTERN.test(html || '');
}

function hasChallengeSignals(html) {
    return CHALLENGE_SIGNALS_PATTERN.test(html || '');
}

function availabilityToken(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value ? 'instock' : 'outofstock';

    const normalized = cleanText(value).toLowerCase();
    if (!normalized) return undefined;

    const noFragment = normalized.split('#').pop() || normalized;
    const lastSegment = noFragment.split('/').pop() || noFragment;
    const token = lastSegment.replace(/[^a-z]/g, '');

    return token || undefined;
}

function normalizeAvailability(value) {
    const token = availabilityToken(value);
    if (!token) return undefined;
    if (AVAILABLE_AVAILABILITY_TOKENS.has(token)) return 'available';
    if (UNAVAILABLE_AVAILABILITY_TOKENS.has(token)) return 'not_available';
    return token;
}

function compactValue(value) {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    }

    if (Array.isArray(value)) {
        const arr = value.map(compactValue).filter((item) => item !== undefined);
        return arr.length ? arr : undefined;
    }

    if (typeof value === 'object') {
        const out = {};
        for (const [key, nested] of Object.entries(value)) {
            const compacted = compactValue(nested);
            if (compacted !== undefined) out[key] = compacted;
        }
        return Object.keys(out).length ? out : undefined;
    }

    return value;
}

function compactRecord(record) {
    return compactValue(record) || {};
}

function parseJsonSafe(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function listingIdFromUrl(value) {
    if (!value) return undefined;
    const match = String(value).match(/\/(\d+)\/?(?:\?.*)?$/);
    return match ? match[1] : undefined;
}

function firstImageUrl(article) {
    const src = article.find('img[src], img[lazy-src]').first().attr('src') || article.find('img[src], img[lazy-src]').first().attr('lazy-src');
    if (src) return src;

    const style = article.find('figure[style]').first().attr('style') || '';
    const match = style.match(/url\(([^)]+)\)/i);
    return match ? match[1].replace(/["']/g, '') : undefined;
}

function normalizeType(typeValue) {
    if (!typeValue) return '';
    if (Array.isArray(typeValue)) return typeValue.join(',');
    return String(typeValue);
}

function extractJsonLdListings($, pageUrl) {
    const listingsByKey = new Map();

    $('script[type="application/ld+json"]').each((_, element) => {
        const parsed = parseJsonSafe($(element).html() || '');
        if (!parsed) return;

        const candidates = [];
        const pushItems = (node) => {
            if (!node) return;
            if (Array.isArray(node)) {
                node.forEach(pushItems);
                return;
            }
            if (node.mainEntity?.itemListElement) pushItems(node.mainEntity.itemListElement);
            if (node.itemListElement) pushItems(node.itemListElement);
            if (node.item) pushItems(node.item);
            candidates.push(node);
        };

        pushItems(parsed);

        for (const candidate of candidates) {
            const typeName = normalizeType(candidate['@type'] || candidate.type).toLowerCase();
            const rawUrl = candidate.url || candidate['@id'] || candidate.mainEntityOfPage?.['@id'];
            const listingUrl = normalizeUrl(rawUrl);

            if (!listingUrl) continue;
            if (!typeName.includes('realestate') && !/\/listing\//i.test(listingUrl)) continue;

            const offers = Array.isArray(candidate.offers) ? candidate.offers[0] : candidate.offers;
            const address = candidate.spatialCoverage?.address || candidate.address;
            const listingId = listingIdFromUrl(listingUrl);

            const record = compactRecord({
                listingId,
                title: candidate.name || candidate.headline,
                description: candidate.description,
                url: listingUrl,
                imageUrl: candidate.image,
                propertyType: candidate.additionalType,
                addressLine: candidate.spatialCoverage?.name,
                city: address?.addressLocality,
                state: address?.addressRegion,
                postalCode: address?.postalCode,
                offerPrice: offers?.price,
                priceCurrency: offers?.priceCurrency,
                offerValidThrough: offers?.validThrough,
                availability: normalizeAvailability(offers?.availability),
                sourceSearchUrl: pageUrl,
            });

            const key = record.listingId || record.url;
            if (key) listingsByKey.set(key, record);
        }
    });

    return listingsByKey;
}

function extractPlacardListings($, pageUrl, pageNo) {
    const ldMap = extractJsonLdListings($, pageUrl);
    const listings = [];

    $('article.placard').each((_, element) => {
        const article = $(element);
        const listingId = article.attr('data-gtm-listing_id') || article.attr('gtm-listing-id') || article.attr('data-id');
        const url = normalizeUrl(article.find('a[href*="/Listing/"]').first().attr('href') || '');

        if (!listingId && !url) return;

        const title = cleanText(article.find('a.left-h6').first().text());
        const locationText = cleanText(article.find('a.right-h6').first().text());
        const summary = cleanText(article.find('a.right-h4').first().text());

        const base = compactRecord({
            listingId,
            title,
            summary,
            location: locationText,
            url,
            imageUrl: firstImageUrl(article),
            tier: article.attr('data-gtm-listing_exposure_level') || article.attr('gtm-listing-exposure-level'),
            resultPosition: article.attr('data-gtm-listing_position') || article.attr('gtm-listing-search-result-position-rank'),
            resultPageRank: article.attr('gtm-listing-search-result-page-rank'),
            city: article.attr('gtm-listing-city'),
            state: article.attr('gtm-listing-state'),
            country: article.attr('gtm-listing-country'),
            postalCode: article.attr('gtm-listing-zip'),
            listingStatus: article.attr('gtm-listing-status'),
            listingStatusId: article.attr('gtm-listing-status-id'),
            listingTypeName: article.attr('gtm-listing-type-name'),
            listingTypeId: article.attr('gtm-listing-type-id'),
            propertyType: article.attr('gtm-listing-property-type-name'),
            propertyTypeId: article.attr('gtm-listing-property-type-id'),
            propertyId: article.attr('gtm-listing-property-id'),
            searchType: article.attr('gtm-listing-search-type'),
            spaceUse: article.attr('gtm-listing-space-use'),
            sourceSearchUrl: pageUrl,
            searchPage: pageNo,
        });

        const key = base.listingId || base.url;
        const fromLd = key ? ldMap.get(key) : undefined;
        listings.push(compactRecord({ ...fromLd, ...base }));
    });

    if (listings.length > 0) return listings;

    return [...ldMap.values()].map((item) => compactRecord({ ...item, searchPage: pageNo }));
}

function extractDetailData($, detailUrl) {
    let primary = null;

    $('script[type="application/ld+json"]').each((_, element) => {
        if (primary) return;

        const parsed = parseJsonSafe($(element).html() || '');
        if (!parsed) return;

        const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
        while (stack.length) {
            const current = stack.shift();
            if (!current || typeof current !== 'object') continue;

            if (Array.isArray(current)) {
                stack.push(...current);
                continue;
            }

            if (current.mainEntity) stack.push(current.mainEntity);
            if (current.itemListElement) stack.push(...current.itemListElement);
            if (current.item) stack.push(current.item);

            const type = normalizeType(current['@type'] || current.type).toLowerCase();
            const url = normalizeUrl(current.url || current['@id'] || current.mainEntityOfPage?.['@id'] || detailUrl);

            if (!url) continue;
            if (!/\/listing\//i.test(url)) continue;
            if (!type.includes('realestate') && !current.description) continue;

            primary = current;
            break;
        }
    });

    const offers = Array.isArray(primary?.offers) ? primary.offers[0] : primary?.offers;
    const address = primary?.address || primary?.spatialCoverage?.address;

    return compactRecord({
        detailUrl,
        description: primary?.description,
        addressLine: primary?.spatialCoverage?.name || primary?.address?.streetAddress,
        city: address?.addressLocality,
        state: address?.addressRegion,
        postalCode: address?.postalCode,
        latitude: primary?.geo?.latitude,
        longitude: primary?.geo?.longitude,
        floorSize: primary?.floorSize?.value,
        floorSizeUnit: primary?.floorSize?.unitCode,
        offerPrice: primary?.price || offers?.price,
        priceCurrency: offers?.priceCurrency,
        offerValidFrom: offers?.validFrom,
        offerValidThrough: offers?.validThrough,
        availability: normalizeAvailability(offers?.availability),
    });
}

function baseSearchUrl({ propertySegment, location, listingType }) {
    return `https://www.loopnet.com/search/${propertySegment}/${location}/${listingType}/`;
}

function withPage(url, pageNo) {
    const normalized = sanitizeSearchUrl(url);
    if (!normalized) return null;

    const parsed = new URL(normalized);
    const cleanPath = parsed.pathname.replace(/\/\d+\/?$/, '/');
    parsed.pathname = pageNo > 1 ? `${cleanPath}${pageNo}/` : cleanPath;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
}

function pageNoFromUrl(url) {
    const normalized = sanitizeSearchUrl(url);
    if (!normalized) return 1;
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/(\d+)\/?$/);
    return match ? parsePositiveInt(match[1], 1) : 1;
}

function chooseNextPageUrl($, currentUrl, currentPageNo) {
    const wanted = currentPageNo + 1;
    const candidates = new Set();
    const currentParsed = new URL(currentUrl);
    const basePath = currentParsed.pathname.replace(/\/\d+\/?$/, '/');

    $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        const absolute = sanitizeSearchUrl(href || '', currentUrl);
        if (!absolute) return;

        const absoluteParsed = new URL(absolute);
        const absoluteBase = absoluteParsed.pathname.replace(/\/\d+\/?$/, '/');
        if (absoluteBase !== basePath) return;

        const pageNo = pageNoFromUrl(absolute);
        if (pageNo === wanted) candidates.add(absolute);
    });

    if (candidates.size > 0) return [...candidates][0];
    return withPage(currentUrl, wanted);
}

function proxyUrlToPlaywright(proxyUrl) {
    if (!proxyUrl) return undefined;

    const parsed = new URL(proxyUrl);
    const server = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;

    return {
        server,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };
}

async function createBrowserSession(proxyConfiguration) {
    let proxy;
    if (proxyConfiguration) {
        const proxyUrl = await proxyConfiguration.newUrl();
        proxy = proxyUrlToPlaywright(proxyUrl);
    }

    const browser = await firefox.launch({
        headless: true,
        proxy,
    });

    const context = await browser.newContext({
        userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        viewport: { width: 1366, height: 900 },
        locale: 'en-US',
    });

    return { browser, context };
}

async function navigateWithWarmup(page, targetUrl) {
    for (let attempt = 1; attempt <= 4; attempt++) {
        if (attempt === 1) {
            try {
                await page.goto('https://www.loopnet.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(600);
            } catch {
                // Keep trying target navigation even if homepage warmup fails.
            }
        }

        try {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(900 + attempt * 200);

            for (let probe = 0; probe < 6; probe++) {
                const title = await page.title();
                if (/access denied/i.test(title)) break;

                let html = await page.content();
                let hasListings = hasListingSignals(html);
                if (hasListings) return true;

                const isChallenge = hasChallengeSignals(html);
                if (isChallenge) {
                    await page.waitForTimeout(1400);
                    try {
                        await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
                    } catch {
                        // Keep probing after challenge transitions.
                    }
                    continue;
                }

                try {
                    await page.waitForSelector('article.placard, script[type="application/ld+json"]', { timeout: 2500 });
                } catch {
                    // Fall through to another probe cycle.
                }

                html = await page.content();
                hasListings = hasListingSignals(html);
                if (hasListings) return true;

                await page.waitForTimeout(700);
            }
        } catch {
            // Try again with another warmup pass.
        }

        await page.waitForTimeout(600 * attempt);
    }

    return false;
}

async function navigateFast(page, targetUrl) {
    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(900);

        let html = await page.content();
        if (hasListingSignals(html)) return true;
        if (hasChallengeSignals(html)) return false;

        try {
            await page.waitForSelector('article.placard, script[type="application/ld+json"]', { timeout: 2500 });
        } catch {
            // Keep fallback behavior if selectors don't appear quickly.
        }

        html = await page.content();
        return hasListingSignals(html);
    } catch {
        return false;
    }
}

async function fetchSearchPageViaHttp(currentUrl, currentPageNo, options = {}) {
    const {
        attempts = 2,
        perAttemptTimeoutMs = 30000,
        retryDelayBaseMs = 700,
    } = options;

    const targetUrl = withPage(currentUrl, currentPageNo) || currentUrl;
    const normalizedTarget = sanitizeSearchUrl(targetUrl) || targetUrl;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch(normalizedTarget, {
                redirect: 'follow',
                signal: AbortSignal.timeout(perAttemptTimeoutMs),
                headers: {
                    'user-agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
                    'accept-language': 'en-US,en;q=0.9',
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'cache-control': 'no-cache',
                },
            });

            if (!response.ok) {
                await sleep(retryDelayBaseMs * attempt);
                continue;
            }

            const html = await response.text();
            const pageUrl = sanitizeSearchUrl(response.url || normalizedTarget) || normalizedTarget;
            const $ = cheerioLoad(html);
            const listings = extractPlacardListings($, pageUrl, currentPageNo);
            const nextUrl = chooseNextPageUrl($, pageUrl, currentPageNo);

            if (listings.length > 0 || !hasChallengeSignals(html)) {
                return { listings, pageUrl, nextUrl };
            }
        } catch {
            // Retry HTTP fallback fetch.
        }

        await sleep(retryDelayBaseMs * attempt);
    }

    return null;
}

function shouldCollectMore(collectedCount, resultsWanted) {
    return collectedCount < resultsWanted;
}

async function main() {
    const actorInput = (await Actor.getInput()) || {};
    let inputDefaults = {};

    try {
        const localInputRaw = await readFile(new URL('../INPUT.json', import.meta.url), 'utf8');
        const localInput = JSON.parse(localInputRaw);
        if (localInput && typeof localInput === 'object') {
            inputDefaults = localInput;
            if (Object.keys(actorInput).length > 0) {
                log.info('Loaded INPUT.json fallback defaults (runtime Actor input has priority)');
            } else {
                log.info('Loaded INPUT.json fallback defaults (no runtime Actor input provided)');
            }
        }
    } catch {
        // INPUT.json fallback is optional.
    }

    const resolveInput = (key, hardFallback) => valueOrFallback(actorInput[key], valueOrFallback(inputDefaults[key], hardFallback));

    const startUrl = resolveInput('startUrl');
    const startUrls = resolveInput('startUrls');
    const url = resolveInput('url');
    const location = resolveInput('location', 'new-york-ny');
    const requestedListingType = resolveInput('listingType', 'for-sale');
    const propertySegment = resolveInput('propertySegment', 'commercial-real-estate');
    const results_wanted = resolveInput('results_wanted', 20);
    const max_pages = resolveInput('max_pages', 10);
    const proxyInput = resolveInput('proxyConfiguration');

    // Internal-only controls removed from input schema.
    const collectDetails = parseBoolean(valueOrFallback(inputDefaults.collectDetails, false), false);
    const internalMaxConcurrency = parsePositiveInt(inputDefaults.maxConcurrency, 4);

    const resultsWanted = parsePositiveInt(results_wanted, 20);
    const maxPages = parsePositiveInt(max_pages, 10);
    const concurrency = Math.min(8, internalMaxConcurrency);

    const rawStartUrls = [];
    if (Array.isArray(startUrls)) rawStartUrls.push(...startUrls.filter(Boolean));
    if (typeof startUrl === 'string' && startUrl) rawStartUrls.push(startUrl);
    if (typeof url === 'string' && url) rawStartUrls.push(url);

    const listingTypeFromProvidedUrl = rawStartUrls.map((value) => listingTypeFromUrl(value)).find(Boolean);
    const effectiveListingType = listingTypeFromProvidedUrl || requestedListingType || 'for-sale';

    if (rawStartUrls.length === 0) {
        rawStartUrls.push(baseSearchUrl({ propertySegment, location, listingType: effectiveListingType }));
    }

    const startInputSource = Array.isArray(actorInput.startUrls) || actorInput.startUrl || actorInput.url
        ? 'actorInput'
        : Array.isArray(inputDefaults.startUrls) || inputDefaults.startUrl || inputDefaults.url
          ? 'INPUT.json fallback'
          : 'generated default';

    const preparedStarts = [...new Set(rawStartUrls.map((value) => sanitizeSearchUrl(value)).filter(Boolean))];
    if (preparedStarts.length === 0) throw new Error('Unable to build a valid LoopNet start URL from input.');

    let proxyConfiguration;
    if (proxyInput) {
        const hasCustomProxyUrls = Array.isArray(proxyInput.proxyUrls) && proxyInput.proxyUrls.length > 0;
        const hasApifyProxyCredentials = Boolean(process.env.APIFY_TOKEN || process.env.APIFY_PROXY_PASSWORD);
        const requestsApifyProxy = proxyInput.useApifyProxy !== false && !hasCustomProxyUrls;

        if (hasCustomProxyUrls || !requestsApifyProxy || hasApifyProxyCredentials) {
            proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
        } else {
            log.warning('Apify Proxy requested but no local credentials were found. Continuing without proxy.');
        }
    }

    const seenListings = new Set();
    const detailQueue = [];
    let collectedCount = 0;
    let savedCount = 0;

    log.info('Starting LoopNet scraper', {
        starts: preparedStarts,
        startInputSource,
        listingTypeUsed: effectiveListingType,
        collectDetails,
        resultsWanted,
        maxPages,
        concurrency,
    });

    const { browser, context } = await createBrowserSession(proxyConfiguration);
    const searchPage = await context.newPage();
    const detailPage = collectDetails ? await context.newPage() : null;

    await searchPage.route('**/*', (route) => {
        const urlToCheck = route.request().url();
        if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(urlToCheck))) {
            return route.abort();
        }
        return route.continue();
    });

    if (detailPage) {
        await detailPage.route('**/*', (route) => {
            const urlToCheck = route.request().url();
            if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(urlToCheck))) {
                return route.abort();
            }
            return route.continue();
        });
    }

    try {
        for (const start of preparedStarts) {
            let currentUrl = withPage(start, pageNoFromUrl(start)) || start;
            let currentPageNo = pageNoFromUrl(currentUrl);

            while (currentPageNo <= maxPages && shouldCollectMore(collectedCount, resultsWanted)) {
                const pageStartedAt = Date.now();
                let searchPageUrl = currentUrl;
                let listings = [];
                let nextUrl;
                let fetchMode = 'browser_fast';
                let accessible = await navigateFast(searchPage, currentUrl);

                if (!accessible) {
                    fetchMode = 'browser_warmup';
                    accessible = await navigateWithWarmup(searchPage, currentUrl);
                }

                if (accessible) {
                    const html = await searchPage.content();
                    const $ = cheerioLoad(html);
                    searchPageUrl = sanitizeSearchUrl(searchPage.url() || currentUrl) || currentUrl;
                    listings = extractPlacardListings($, searchPageUrl, currentPageNo);
                    nextUrl = chooseNextPageUrl($, searchPageUrl, currentPageNo);
                } else {
                    log.warning('Search page blocked after retries', { currentUrl, pageNo: currentPageNo });
                    fetchMode = 'http_fallback';
                    const httpFallback = await fetchSearchPageViaHttp(currentUrl, currentPageNo, {
                        attempts: 3,
                        perAttemptTimeoutMs: 30000,
                        retryDelayBaseMs: 900,
                    });

                    if (!httpFallback) break;

                    searchPageUrl = httpFallback.pageUrl;
                    listings = httpFallback.listings;
                    nextUrl = httpFallback.nextUrl;

                    log.warning('Recovered search page via HTTP fallback', {
                        url: searchPageUrl,
                        pageNo: currentPageNo,
                        listingsFound: listings.length,
                    });
                }

                const pageOutput = [];

                log.info('Search page processed', {
                    url: searchPageUrl,
                    pageNo: currentPageNo,
                    listingsFound: listings.length,
                    fetchMode,
                    pageMs: Date.now() - pageStartedAt,
                });

                for (const listing of listings) {
                    if (!shouldCollectMore(collectedCount, resultsWanted)) break;

                    const key = listing.listingId || listing.url;
                    if (!key || seenListings.has(key)) continue;
                    seenListings.add(key);

                    const baseRecord = compactRecord({
                        ...listing,
                        sourceSearchUrl: searchPageUrl,
                        searchPage: currentPageNo,
                    });

                    if (collectDetails) {
                        detailQueue.push(baseRecord);
                    } else {
                        pageOutput.push(compactRecord({ ...baseRecord, collectedAt: new Date().toISOString() }));
                    }

                    collectedCount += 1;
                }

                if (pageOutput.length > 0) {
                    await Actor.pushData(pageOutput);
                    savedCount += pageOutput.length;
                }

                if (!shouldCollectMore(collectedCount, resultsWanted)) break;
                if (!nextUrl || nextUrl === currentUrl) break;

                currentUrl = nextUrl;
                currentPageNo += 1;
            }

            if (!shouldCollectMore(collectedCount, resultsWanted)) break;
        }

        if (collectDetails) {
            for (const listing of detailQueue.slice(0, resultsWanted)) {
                let outputRecord = compactRecord({ ...listing, collectedAt: new Date().toISOString() });

                if (detailPage && listing.url) {
                    const accessible = await navigateWithWarmup(detailPage, listing.url);
                    if (!accessible) {
                        log.warning('Detail page blocked after retries', { url: listing.url });
                    } else {
                        const detailHtml = await detailPage.content();
                        const detail$ = cheerioLoad(detailHtml);
                        outputRecord = compactRecord({
                            ...listing,
                            ...extractDetailData(detail$, detailPage.url() || listing.url),
                            collectedAt: new Date().toISOString(),
                        });
                    }
                }

                await Actor.pushData(outputRecord);
                savedCount += 1;
            }
        }

        log.info('LoopNet scrape complete', {
            savedCount,
            resultsWanted,
            collectDetails,
        });
    } finally {
        await context.close();
        await browser.close();
    }
}

main()
    .catch((error) => {
        log.exception(error, 'Actor failed');
        process.exitCode = 1;
    })
    .finally(async () => {
        await Actor.exit();
    });
