## Selected API
- Endpoint: `https://www.loopnet.com/services/search`
- Method: `POST`
- Auth: Browser session cookies plus `RequestVerificationToken` from the LoopNet bootstrap page.
- Pagination: `criteria.PageNumber` with `criteria.PageSize` from the bootstrap payload.
- Fields available: `MetaState`, `UrlState`, `SearchPlacards`, `PagingState`, `SearchCriteria`, `Map`, `AllListingIds`, `ListingSearchCriteriaDatalayer`, `SearchH1Text`, `CountryReturned`, `ListingCountryCode`, and related SEO/navigation metadata. Listing-level fields are present in API-returned placard fragments, event attributes, map-pin metadata, and carousel media markup.
- Fields added vs. original actor: latitude, longitude, country, county, property ID, listing type name, exposure level, status fields, search market ID, result rank, result position, buy-now flag, source page metadata, `imageUrl`, and `galleryUrls`.
- Field count: 30+ mapped output fields vs. 19 original extracted fields.

## Why This API Was Selected
- Returns JSON directly: +30
- Has more than 15 useful fields across metadata, paging, criteria, listing IDs, map data, and placard fragments: +25
- No account authentication required, but a browser session is required for Akamai context: +10
- Supports pagination through `PageNumber` and `PageSize`: +15
- Matches and extends current fields: +10
- Total score: 90

The endpoint works with an official Impit `ios18` client when the same client keeps a `tough-cookie` jar between the bootstrap GET and the `/services/search` POST. Generic Impit Chrome/Firefox profiles and okhttp app profiles were blocked or returned challenge shells. Patchright Chrome remains as a fallback when direct Impit bootstrap is unavailable. Extraction is driven by `/services/search` responses, not by scraping rendered search-page HTML.

## Candidate Matrix

| Candidate | Header profile | Status/body | Fields | Pagination | Decision |
|---|---|---:|---:|---|---|
| URLScan existing public scans | URLScan search API | Search results available; full result fetch required login for tested scan | Unknown | Unknown | Rejected as insufficient without full result JSON |
| Desktop search page | Desktop Chrome HTTP | `403 Access Denied` | 0 | N/A | Rejected |
| iOS18 search page | Impit `browser: 'ios18'` + cookie jar | `200` full HTML bootstrap with CSRF and criteria | 160+ criteria keys | Page URLs and `PageNumber` | Selected bootstrap |
| Android app-style page probe | Impit `okhttp4` | `403 Access Denied` | 0 | N/A | Rejected |
| Search JS bundle | iOS18 response/bundle | Found `/services/search` and `/services/listing/multiPinProfile` | Endpoint-level evidence | `PageNumber` | Used to identify API |
| `/services/search` direct HTTP replay | Impit `ios18` + cookie jar + API headers | `200` JSON, about 1.1 MB | 30+ mapped fields | `criteria.PageNumber` | Selected |
| `/services/search` generic profiles | Impit Chrome/Firefox variants | `403` or 2.6 KB challenge shell | 0 | N/A | Rejected |
| `/services/search` browser fallback | Patchright Chrome session + transferred cookies | Valid only when browser bootstrap succeeds | 30+ mapped fields | `criteria.PageNumber` | Fallback |
| `/services/listing/multiPinProfile` | Browser-session POST with IDs | `200` but returned HTML mini placards | Limited extra value | By listing IDs | Rejected as weaker than search API |

## How The Working Flow Runs
- Create one Impit `ios18` client with a `tough-cookie` jar and the configured proxy URL, when a proxy is available.
- Fetch the LoopNet search URL with that client and extract `csrfTokenValue` and `criteria` from the `viewdata.set(...)` bootstrap payload.
- Reuse the same client and cookie jar for `/services/search`; send only the API-specific headers (`RequestVerificationToken`, `x-page-loopnetarea`, `Origin`, `Referer`, content type, and JSON accept).
- Set `criteria.PageNumber` for pagination and push each page batch immediately after deduplication.
- If direct Impit bootstrap fails, start a fresh Patchright persistent Chrome context under `storage/browser-sessions/...`, using `channel: "chrome"`, `headless: false`, and `noViewport: true`, then execute the API fallback inside that same browser context so its TLS profile, cookies, headers, and CSRF token stay coherent.
- Treat a `200` challenge shell or a successful response with no listing placards as a failed candidate.
- Parse listing records from `SearchPlacards.Html` or equivalent `SearchPlacards` fragments returned by the JSON response.
- Parse coordinates from `Map.HTML` `map-pin` elements, because coordinates are more reliable there than in placard fragments.
- Parse `galleryUrls` from carousel image markup in `SearchPlacards.Html` using `src`, `lazy-src`, `data-src`, `data-lazy-src`, and background-image styles. Filter gallery URLs to `https://images1.loopnet.com/...` so UI assets and logos are not saved as property photos.

## Fixed Issues During Update
- Direct HTTP replay returned Akamai `403`, so the actor uses browser-session API replay instead.
- Browser bootstrap sometimes loaded a valid LoopNet shell without exposing the payload in `outerHTML`; fixed by also reading inline script text.
- Persistent `./user_data` profiles could retain blocked/challenged state; fixed by creating a fresh profile directory per run and deleting it on cleanup.
- `SearchPlacards` response shape varied between object-with-`Html`, object values, arrays, and strings; fixed with a normalizer before parsing.
- Coordinates were missing from saved records when only placard event metadata was parsed; fixed by reading `Map.HTML`.
- Gallery images were missing from output; fixed by extracting carousel URLs directly from the same search endpoint response with no detail-page visits and no extra listing requests.
- A non-listing SVG logo appeared in gallery extraction; fixed by allowing only `images1.loopnet.com` URLs.
- Some records lacked a headline element; fixed by falling back to the listing link title.
- Unused direct `https-proxy-agent` dependency was removed. Runtime dependencies are now `apify`, `cheerio`, and `patchright`.
- Proxy is optional. The actor no longer auto-enables Apify Residential proxy from environment variables and no longer forces the `RESIDENTIAL` group onto user proxy settings. If the user selects a proxy in `input_schema.json`, the actor uses that exact proxy configuration; if proxy authentication fails, it retries with another proxy session and then without proxy.
- `ERR_INVALID_AUTH_CREDENTIALS` from Impit or browser navigation is handled as a proxy-auth failure instead of a hard actor error.
- Generic Impit Chrome, Firefox, and okhttp profiles were rejected by the current Akamai edge; official `ios18` returned full bootstrap HTML and `200` JSON API responses.
- Map-view URLs such as `?view=map` and `/map/` are normalized to the equivalent LoopNet search URL before bootstrap.
- Non-search LoopNet URLs such as listing detail pages are not used as bootstrap targets. They fall back to the configured `location` and `listingType` search URL and log a warning, so the actor can still complete instead of trying to parse a listing page as a search page.
- Search URLs are validated before use; only `/search/.../(for-sale|for-lease|auctions)/` paths are accepted as direct start URLs.

## Local Validation Results
- `npm run lint`: passed.
- JSON validation for `package.json`, `INPUT.json`, `.actor/input_schema.json`, and `.actor/dataset_schema.json`: passed.
- `npm start`: succeeded locally with the default New York sale input.
- Dataset check after local run: 20 records, 0 duplicate listing IDs, 0 duplicate URLs, 0 null or empty saved fields.
- Washington, DC lease regression: 40 records saved across 2 API pages (25 + 15), matching the reported failing input.
- Image coverage: 20/20 records had `imageUrl`; 20/20 records had `galleryUrls`; gallery size ranged from 3 to 24 property-photo URLs per record.
- Coordinate coverage: 18/20 records had latitude and longitude. The remaining records did not expose coordinates in the search endpoint map pins for this run.
- Washington DC lease URL without proxy: local run succeeded.
- Washington DC lease URL with `?view=map` without proxy: local run succeeded after URL normalization.
- Listing detail URL input: local run fell back to a valid search URL and succeeded.

## Required Runtime Details
- Headers: `accept: application/json, text/plain, */*`, `content-type: application/json;charset=UTF-8`, `RequestVerificationToken`, `x-page-loopnetarea: SRP-Client`.
- Cookies: browser-managed LoopNet session cookies.
- Tokens: `csrfTokenValue` from `globalThis.forge` bootstrap script.
- Proxy: Apify Residential proxy is supported and used when configured; local tests can run without proxy when the page allows the local IP.
- HTTP/2: not used directly; browser session handles transport.
- Session rotation: the actor creates a browser context and logs a warning if API replay fails, allowing Apify retries or proxy session changes to recover.
- Browser requirement: optional fallback only; the primary path is direct Impit `ios18` bootstrap plus API extraction. The actor never extracts records from rendered page content.
