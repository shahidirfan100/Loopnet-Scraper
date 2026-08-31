import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Actor, log } from 'apify';
import { load as cheerioLoad } from 'cheerio';
import { Impit } from 'impit';
import { chromium } from 'patchright';
import { CookieJar } from 'tough-cookie';

await Actor.init();

const LOOPNET_ORIGIN = 'https://www.loopnet.com';
function parsePositiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function valueOrFallback(value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string' && value.trim() === '') return fallback;
    return value;
}

function sanitizeSearchUrl(value, base = LOOPNET_ORIGIN) {
    if (!value || typeof value !== 'string') return null;

    try {
        const parsed = new URL(value, base);
        if (parsed.hostname !== 'www.loopnet.com' && !parsed.hostname.endsWith('.loopnet.com')) return null;
        parsed.search = '';
        parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\/map\/?$/i, '/');
        if (!parsed.pathname.endsWith('/')) parsed.pathname = `${parsed.pathname}/`;
        if (!parsed.pathname.toLowerCase().startsWith('/search/')) return null;
        if (!/\/(for-sale|for-lease|auctions)(?:\/\d+)?\/$/i.test(parsed.pathname)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function listingTypeFromUrl(value) {
    const normalized = sanitizeSearchUrl(value);
    if (!normalized) return null;

    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/(for-sale|for-lease)(?:\/|$)/i);
    return match ? match[1].toLowerCase() : null;
}

function baseSearchUrl({ propertySegment, location, listingType }) {
    return `${LOOPNET_ORIGIN}/search/${propertySegment}/${location}/${listingType}/`;
}

function compactValue(value) {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || undefined;
    }

    if (Array.isArray(value)) {
        const compacted = value.map(compactValue).filter((item) => item !== undefined);
        return compacted.length ? compacted : undefined;
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

function absoluteUrl(value) {
    if (!value) return undefined;
    try {
        return new URL(value, LOOPNET_ORIGIN).toString();
    } catch {
        return undefined;
    }
}

function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
}

function isListingImageUrl(value) {
    if (!value) return false;
    try {
        const parsed = new URL(value);
        return parsed.hostname === 'images1.loopnet.com';
    } catch {
        return false;
    }
}

function extractGalleryUrls($, article) {
    const urls = [];

    article.find('img').each((_, image) => {
        const img = $(image);
        urls.push(
            absoluteUrl(img.attr('src')),
            absoluteUrl(img.attr('lazy-src')),
            absoluteUrl(img.attr('data-src')),
            absoluteUrl(img.attr('data-lazy-src')),
        );
    });

    article.find('[style]').each((_, element) => {
        const style = $(element).attr('style') || '';
        for (const match of style.matchAll(/(?:background-image|background-lazy-image)\s*:\s*url\((['"]?)(.*?)\1\)/gi)) {
            urls.push(absoluteUrl(match[2]));
        }
    });

    return uniqueValues(urls).filter(isListingImageUrl);
}

function numericText(value) {
    if (!value) return undefined;
    const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePlacardEventModel(fragment) {
    const match = fragment.match(/placard-event-model="([^"]+)"/);
    if (!match) return new Map();

    try {
        const model = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        const coordinates = new Map();
        for (const item of model.ListingSearchResultItems || []) {
            if (item?.ListingID) {
                coordinates.set(String(item.ListingID), {
                    latitude: item.Latitude,
                    longitude: item.Longitude,
                });
            }
        }
        return coordinates;
    } catch {
        return new Map();
    }
}

function parseMapCoordinates(mapHtml) {
    const coordinates = new Map();
    if (!mapHtml) return coordinates;

    const $ = cheerioLoad(mapHtml);
    $('div[map-pin][id]').each((_, el) => {
        const pin = $(el);
        const latitude = numericText(pin.attr('lat'));
        const longitude = numericText(pin.attr('lon'));
        const ids = [pin.attr('id'), ...(pin.attr('listingids') || '').split(',')]
            .map((value) => value?.trim())
            .filter(Boolean);

        for (const id of ids) {
            if (latitude !== undefined && longitude !== undefined) coordinates.set(id, { latitude, longitude });
        }
    });

    return coordinates;
}

function getPlacardFragments(searchPlacards) {
    if (Array.isArray(searchPlacards)) return searchPlacards;
    if (typeof searchPlacards === 'string') return [searchPlacards];
    if (typeof searchPlacards?.Html === 'string') return [searchPlacards.Html];
    return Object.values(searchPlacards || {}).filter((value) => typeof value === 'string');
}

function extractListingsFromApiPlacards(searchData, sourceSearchUrl, searchPage) {
    const placardFragments = getPlacardFragments(searchData.SearchPlacards);
    const html = placardFragments.join('\n');
    const $ = cheerioLoad(html);
    const coordinateMap = new Map([...parseMapCoordinates(searchData.Map?.HTML), ...parsePlacardEventModel(html)]);
    const records = [];
    const seenUrls = new Set();

    $('article[data-gtm-listing_id], article[gtm-listing-id]').each((_, el) => {
        const article = $(el);
        const attrs = el.attribs || {};
        const listingId = attrs['data-gtm-listing_id'] || attrs['gtm-listing-id'] || attrs['data-id'];
        if (!listingId) return;

        const href = article
            .find('a[href*="/Listing/"], a[href*="/listing/"], a[ng-href*="/Listing/"], a[ng-href*="/listing/"]')
            .first()
            .attr('href');
        const url = absoluteUrl(href || article.find('a[ng-href]').first().attr('ng-href'));
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);

        const titleEl = article.find('header .left-h6, a.left-h6').first();
        const addressEl = article.find('header .left-h4, a.left-h4').first();
        const rightH4 = article.find('header .right-h4, .right-h4').first();
        const rightH6 = article.find('header .right-h6, .right-h6').first();
        const galleryUrls = extractGalleryUrls($, article);
        const allText = article.text().replace(/\s+/g, ' ').trim();
        const linkTitle = article.find('a[title*="More details for"]').first().attr('title');
        const fallbackTitle = linkTitle?.replace(/^More details for\s+/i, '').replace(/\s+-\s+[^-]+$/, '');
        const sqftMatch = allText.match(/([0-9,]+)\s+SF/i);
        const priceMatch = allText.match(/[$€£]\s*([0-9,]+(?:\.[0-9]+)?)/);
        const rightH6Text = rightH6.text().replace(/\s+/g, ' ').trim();
        const locParts = rightH6Text.split(',').map((item) => item.trim());
        const coordinates = coordinateMap.get(String(listingId)) || {};

        records.push(
            compactRecord({
                listingId,
                title: titleEl.text().replace(/\s+/g, ' ').trim() || fallbackTitle,
                url,
                addressLine: addressEl.text().replace(/\s+/g, ' ').trim(),
                city: attrs['gtm-listing-city'] || (locParts.length > 0 ? locParts[0] : undefined),
                state: attrs['gtm-listing-state'] || (locParts.length > 1 ? locParts[1].split(/\s+/)[0] : undefined),
                postalCode: attrs['gtm-listing-zip'] || (locParts.length > 1 ? locParts[1].split(/\s+/)[1] : undefined),
                country: attrs['gtm-listing-country'],
                county: attrs['gtm-listing-county'],
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                propertyType: attrs['gtm-listing-property-type-name'],
                propertyTypeId: attrs['gtm-listing-property-type-id'],
                propertyId: attrs['gtm-listing-property-id'],
                listingType: attrs['gtm-listing-search-type'] === 'FL' ? 'for-lease' : 'for-sale',
                listingTypeName: attrs['gtm-listing-type-name'],
                listingTypeId: attrs['gtm-listing-type-id'],
                exposureLevel: attrs['gtm-listing-exposure-level'] || attrs['data-gtm-listing_exposure_level'],
                listingStatus: attrs['gtm-listing-status'],
                listingStatusId: attrs['gtm-listing-status-id'],
                searchMarketId: attrs['gtm-listing-search-market-id'],
                resultPageRank: numericText(attrs['gtm-listing-search-result-page-rank']),
                resultPositionRank: numericText(attrs['gtm-listing-search-result-position-rank']),
                squareFeet: attrs['gtm-listing-sqft'] || (sqftMatch ? sqftMatch[1].replace(/,/g, '') : undefined),
                sizeText: rightH4.text().replace(/\s+/g, ' ').trim(),
                offeringPrice: attrs['gtm-listing-price'] || (priceMatch ? priceMatch[0] : undefined),
                capRate: numericText(attrs['gtm-listing-cap-rate']),
                yearBuilt: numericText(attrs['gtm-listing-year-built']),
                buildingClass: attrs['gtm-listing-bldg-class'],
                brokerName: attrs['gtm-listing-broker'],
                imageUrl: galleryUrls[0],
                galleryUrls,
                buyNowEnabled: attrs['gtm-buy-now-enabled'],
                sourceSearchUrl,
                searchPage,
                collectedAt: new Date().toISOString(),
            }),
        );
    });

    return records;
}

function buildApiHeaders(startUrl, csrfToken, cookieHeader) {
    return {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json;charset=UTF-8',
        origin: LOOPNET_ORIGIN,
        referer: startUrl,
        RequestVerificationToken: csrfToken,
        'x-page-loopnetarea': 'SRP-Client',
        ...(cookieHeader && { cookie: cookieHeader }),
    };
}

async function fetchSearchData(client, requestHeaders, criteria, searchPage) {
    const apiUrl = `${LOOPNET_ORIGIN}/services/search`;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await client.fetch(apiUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({
                    pageguid: `loopnet-api-${Date.now()}`,
                    criteria: {
                        ...criteria,
                        PageNumber: searchPage,
                    },
                    savedsearcheditmode: false,
                }),
            });
            const text = await response.text();

            if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
                const delay = attempt * 1000;
                log.warning(`Retrying API page ${searchPage} after HTTP ${response.status} (${attempt}/${maxAttempts})`);
                await new Promise((resolve) => {
                    setTimeout(resolve, delay);
                });
                continue;
            }

            let json = null;
            try {
                json = JSON.parse(text);
            } catch {
                return {
                    ok: false,
                    status: response.status,
                    contentType: response.headers.get('content-type'),
                    errorPreview: text.slice(0, 300),
                };
            }

            return {
                ok: response.ok,
                status: response.status,
                contentType: response.headers.get('content-type'),
                json,
            };
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            log.warning(`Retrying API page ${searchPage} after request error (${attempt}/${maxAttempts})`);
            await new Promise((resolve) => {
                setTimeout(resolve, attempt * 1000);
            });
        }
    }

    throw new Error(`API request failed for page ${searchPage}`);
}

async function extractApiPages(fetchPage, startUrl, bootstrap, resultsWanted, maxPages, savedCount, seenListings) {
    let totalSaved = savedCount;
    let consecutiveEmptyPages = 0;

    for (let searchPage = 1; totalSaved < resultsWanted && searchPage <= maxPages; searchPage++) {
        log.info(`Fetching API page ${searchPage}/${maxPages}`);
        const response = await fetchPage(bootstrap.criteria, searchPage);
        if (!response.ok || !response.json) {
            log.warning('API request failed', {
                searchPage,
                status: response.status,
                contentType: response.contentType,
                preview: response.errorPreview,
            });
            break;
        }

        const listings = extractListingsFromApiPlacards(response.json, startUrl, searchPage);
        const batch = [];
        let duplicateCount = 0;

        for (const listing of listings) {
            if (totalSaved >= resultsWanted) break;

            const dedupKey = listing.listingId || listing.url;
            if (!dedupKey || seenListings.has(dedupKey)) {
                duplicateCount++;
                continue;
            }

            seenListings.add(dedupKey);
            batch.push(listing);
            totalSaved++;
        }

        if (batch.length > 0) {
            await Actor.pushData(batch);
            log.info(`Saved ${batch.length} API records. Total: ${totalSaved}/${resultsWanted}`, {
                searchPage,
                duplicatesSkipped: duplicateCount,
            });
            consecutiveEmptyPages = 0;
        } else {
            consecutiveEmptyPages++;
            log.warning('API page produced no new records', { searchPage, duplicatesSkipped: duplicateCount });
            if (consecutiveEmptyPages >= 2) break;
        }

        const totalAvailable = response.json.MetaState?.TotalResultCount;
        if (totalAvailable && totalSaved >= totalAvailable) break;
    }

    return totalSaved;
}

async function bootstrapSearchWithImpit(startUrl, proxyUrl) {
    const cookieJar = new CookieJar();
    const client = new Impit({
        browser: 'ios18',
        ignoreTlsErrors: true,
        ...(proxyUrl && { proxyUrl }),
        cookieJar,
    });
    const response = await client.fetch(startUrl);
    const html = await response.text();
    const bootstrap = {
        ...extractBootstrapFromHtml(html),
        status: response.status,
        source: 'impit-ios18-bootstrap',
    };

    if (!bootstrap.ok || !bootstrap.criteria) return { bootstrap, client, requestHeaders: null };

    const cookieHeader = await cookieJar.getCookieString(startUrl);
    return {
        bootstrap,
        client,
        requestHeaders: buildApiHeaders(startUrl, bootstrap.csrfToken, cookieHeader),
    };
}

async function runImpitExtraction(startUrl, proxyUrl, resultsWanted, maxPages, savedCount, seenListings) {
    try {
        const session = await bootstrapSearchWithImpit(startUrl, proxyUrl);
        if (!session.bootstrap.ok || !session.bootstrap.criteria || !session.requestHeaders) {
            log.warning('Impit bootstrap did not return LoopNet search data', {
                status: session.bootstrap.status,
                source: session.bootstrap.source,
                reason: session.bootstrap.reason,
            });
            return savedCount;
        }

        return await extractApiPages(
            (criteria, searchPage) => fetchSearchData(session.client, session.requestHeaders, criteria, searchPage),
            startUrl,
            session.bootstrap,
            resultsWanted,
            maxPages,
            savedCount,
            seenListings,
        );
    } catch (error) {
        log.warning('Impit extraction attempt failed', {
            startUrl,
            usedProxy: Boolean(proxyUrl),
            reason: error?.message || String(error),
        });
        return savedCount;
    }
}

async function fetchSearchDataInBrowser(page, criteria, csrfToken, searchPage) {
    return page.evaluate(
        async ({ criteriaForPage, csrfTokenForPage }) => {
            const response = await fetch('/services/search', {
                method: 'POST',
                headers: {
                    accept: 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                    RequestVerificationToken: csrfTokenForPage,
                    'x-page-loopnetarea': 'SRP-Client',
                },
                body: JSON.stringify({
                    pageguid: `loopnet-api-${Date.now()}`,
                    criteria: {
                        ...criteriaForPage,
                        PageNumber: searchPage,
                    },
                    savedsearcheditmode: false,
                }),
            });
            const text = await response.text();
            let json = null;
            try {
                json = JSON.parse(text);
            } catch {
                return {
                    ok: false,
                    status: response.status,
                    contentType: response.headers.get('content-type'),
                    errorPreview: text.slice(0, 300),
                };
            }

            return {
                ok: response.ok,
                status: response.status,
                contentType: response.headers.get('content-type'),
                json,
            };
        },
        {
            criteriaForPage: criteria,
            csrfTokenForPage: csrfToken,
            searchPage,
        },
    );
}

async function bootstrapSearchSession(page, startUrl) {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(8000);

    return page.evaluate(() => {
        const html = [
            document.documentElement.outerHTML,
            ...Array.from(document.scripts, (script) => script.textContent || ''),
        ].join('\n');
        const csrfToken = html.match(/csrfTokenValue:'([^']+)'/)?.[1] || null;
        const marker = 'viewdata.set(';
        const markerIndex = html.indexOf(marker);
        if (markerIndex < 0) {
            return {
                ok: false,
                title: document.title,
                htmlLength: html.length,
                csrfToken,
                reason: 'Missing LoopNet viewdata bootstrap payload.',
            };
        }

        let depth = 0;
        let inString = false;
        let escaped = false;
        let endIndex = -1;
        for (let index = markerIndex + marker.length; index < html.length; index++) {
            const char = html[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }

            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0) {
                    endIndex = index + 1;
                    break;
                }
            }
        }

        if (!csrfToken || endIndex < 0) {
            return {
                ok: false,
                title: document.title,
                htmlLength: html.length,
                csrfToken,
                reason: 'Missing CSRF token or incomplete viewdata payload.',
            };
        }

        try {
            const viewData = JSON.parse(html.slice(markerIndex + marker.length, endIndex));
            return {
                ok: true,
                csrfToken,
                criteria: viewData.criteria,
                totalResultCount: viewData.totalResultCount,
            };
        } catch (error) {
            return {
                ok: false,
                title: document.title,
                htmlLength: html.length,
                csrfToken,
                reason: `Could not parse viewdata payload: ${error.message}`,
            };
        }
    });
}

function extractBootstrapFromHtml(html) {
    const csrfToken = html.match(/csrfTokenValue:'([^']+)'/)?.[1] || null;
    const marker = 'viewdata.set(';
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) {
        return {
            ok: false,
            htmlLength: html.length,
            reason: 'Missing LoopNet viewdata bootstrap payload.',
        };
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIndex = -1;
    for (let index = markerIndex + marker.length; index < html.length; index++) {
        const char = html[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                endIndex = index + 1;
                break;
            }
        }
    }

    if (!csrfToken || endIndex < 0) {
        return {
            ok: false,
            htmlLength: html.length,
            reason: 'Missing CSRF token or incomplete viewdata payload.',
        };
    }

    try {
        const viewData = JSON.parse(html.slice(markerIndex + marker.length, endIndex));
        return {
            ok: true,
            csrfToken,
            criteria: viewData.criteria,
            totalResultCount: viewData.totalResultCount,
        };
    } catch (error) {
        return {
            ok: false,
            htmlLength: html.length,
            reason: `Could not parse viewdata payload: ${error.message}`,
        };
    }
}


async function runApiExtraction(startUrl, proxyUrl, resultsWanted, maxPages, savedCount, seenListings) {
    const userDataDir = join(process.cwd(), 'storage', 'browser-sessions', `loopnet-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`);
    const totalSaved = savedCount;
    let browserContext;
    let page;

    try {
        browserContext = await chromium.launchPersistentContext(userDataDir, {
            channel: 'chrome',
            headless: false,
            noViewport: true,
            proxy: proxyUrl ? { server: proxyUrl } : undefined,
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-component-extensions-with-background-pages',
                '--mute-audio',
            ],
            ignoreDefaultArgs: ['--enable-automation'],
        });

        page = await browserContext.newPage();
        const bootstrap = await bootstrapSearchSession(page, startUrl);
        if (!bootstrap.ok || !bootstrap.criteria || !bootstrap.csrfToken) {
            log.warning('Could not bootstrap a trusted LoopNet API session', {
                status: bootstrap.status,
                reason: bootstrap.reason,
            });
            return totalSaved;
        }

        return await extractApiPages(
            (criteria, searchPage) => fetchSearchDataInBrowser(page, criteria, bootstrap.csrfToken, searchPage),
            startUrl,
            bootstrap,
            resultsWanted,
            maxPages,
            totalSaved,
            seenListings,
        );
    } catch (err) {
        const message = err?.message || String(err);
        if (message.includes('ERR_INVALID_AUTH_CREDENTIALS')) {
            log.warning('Proxy authentication failed during browser bootstrap; this proxy attempt will be skipped', {
                startUrl,
                usedProxy: Boolean(proxyUrl),
            });
        } else {
            log.exception(err, 'API extraction error');
        }
        return totalSaved;
    } finally {
        if (page) await page.close().catch(() => {});
        if (browserContext) await browserContext.close().catch(() => {});
        await rm(userDataDir, { recursive: true, force: true });
    }
}

async function main() {
    const actorInput = (await Actor.getInput()) || {};

    const startUrl = valueOrFallback(actorInput.startUrl);
    const location = valueOrFallback(actorInput.location, 'new-york-ny');
    const requestedListingType = valueOrFallback(actorInput.listingType, 'for-sale');
    const propertySegment = valueOrFallback(actorInput.propertySegment, 'commercial-real-estate');
    const resultsWanted = parsePositiveInt(valueOrFallback(actorInput.results_wanted, 20), 20);
    const maxPages = parsePositiveInt(valueOrFallback(actorInput.max_pages, 3), 3);
    const proxyInput = valueOrFallback(actorInput.proxyConfiguration);

    const rawStartUrls = [];
    if (typeof startUrl === 'string' && startUrl) rawStartUrls.push(startUrl);

    const effectiveListingType =
        rawStartUrls.map((value) => listingTypeFromUrl(value)).find(Boolean) || requestedListingType || 'for-sale';

    if (rawStartUrls.length === 0) {
        rawStartUrls.push(baseSearchUrl({ propertySegment, location, listingType: effectiveListingType }));
    }

    let preparedStarts = [...new Set(rawStartUrls.map((value) => sanitizeSearchUrl(value)).filter(Boolean))];
    if (preparedStarts.length === 0) {
        const fallbackUrl = baseSearchUrl({ propertySegment, location, listingType: effectiveListingType });
        preparedStarts = [fallbackUrl];
        if (rawStartUrls.length > 0) {
            log.warning('Provided startUrl was not a LoopNet search URL; using location/listingType fallback', {
                fallbackUrl,
            });
        }
    }

    let proxyConfiguration;
    if (proxyInput) {
        const hasCustomProxyUrls = Array.isArray(proxyInput.proxyUrls) && proxyInput.proxyUrls.length > 0;
        const requestsApifyProxy = proxyInput.useApifyProxy === true && !hasCustomProxyUrls;
        if (hasCustomProxyUrls || requestsApifyProxy) {
            proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
        }
    }

    log.info('Starting LoopNet API scraper', {
        starts: preparedStarts,
        listingTypeUsed: effectiveListingType,
        resultsWanted,
        maxPages,
    });

    const seenListings = new Set();
    let totalSaved = 0;

    for (const start of preparedStarts) {
        if (totalSaved >= resultsWanted) break;

        const savedBeforeStart = totalSaved;
        const proxyAttempts = [];
        if (proxyConfiguration) {
            proxyAttempts.push(await proxyConfiguration.newUrl(`loopnet_${Date.now()}_1`));
            proxyAttempts.push(await proxyConfiguration.newUrl(`loopnet_${Date.now()}_2`));
        }
        proxyAttempts.push(undefined);

        for (const proxyUrl of proxyAttempts) {
            if (totalSaved >= resultsWanted) break;
            const savedBeforeAttempt = totalSaved;
            totalSaved = await runImpitExtraction(start, proxyUrl, resultsWanted, maxPages, totalSaved, seenListings);
            if (totalSaved === savedBeforeAttempt) {
                totalSaved = await runApiExtraction(start, proxyUrl, resultsWanted, maxPages, totalSaved, seenListings);
            }
            if (totalSaved > savedBeforeAttempt) break;
            if (proxyUrl) log.warning('Retrying LoopNet extraction with a different proxy mode');
        }

        if (totalSaved === savedBeforeStart) {
            log.warning('No records saved for start URL after all proxy modes', { start });
        }
    }

    log.info('LoopNet API scrape complete', { savedCount: totalSaved, resultsWanted });
}

main()
    .catch((error) => {
        log.exception(error, 'Unhandled error');
        process.exitCode = 1;
    })
    .finally(() => Actor.exit());
