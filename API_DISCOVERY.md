## Selected Data Source

- Primary URL: `https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/`
- Method: Browser page load (GET)
- Auth: None
- Pagination: Path-based page numbers (`.../for-sale/2/`, `.../for-sale/3/`, ...)
- Data source used in actor: Search page JSON-LD + placard metadata attributes + optional listing page JSON-LD

## Endpoint Discovery Findings

### Candidate 1
- Endpoint: `https://www.loopnet.com/services/search/fireimpressions`
- Method: XHR
- Auth: None
- Pagination support: No
- Purpose: Tracking/impression telemetry
- Score: 30 (JSON) + 20 (no auth) = 50
- Decision: Rejected for extraction because payload is tracking-focused and not listing-rich.

### Candidate 2
- Endpoint: `https://www.loopnet.com/services/geography/lookupstates/us`
- Method: XHR
- Auth: None
- Pagination support: No
- Purpose: Geography helper
- Score: 30 + 20 = 50
- Decision: Rejected for extraction because it does not contain listing records.

### Candidate 3
- Endpoint: `https://www.loopnet.com/services/listing/auction-preview`
- Method: XHR
- Auth: None
- Pagination support: No
- Purpose: Auction preview
- Notes: Returned HTTP 429 in tests
- Score: 30 + 20 = 50
- Decision: Rejected for extraction due instability and narrow data scope.

## Fallback Selection Rationale

No discovered public endpoint provided broad paginated listing data with stable, rich fields suitable for production extraction.

Per fallback priority, actor uses:
1. JSON-LD listing blocks on search pages
2. Placard metadata attributes in search cards
3. Optional JSON-LD extraction on detail pages

## Field Coverage Comparison

- Previous actor target: Remote.co jobs schema (not relevant to LoopNet)
- New LoopNet actor output (non-null fields only):
  - `listingId`, `title`, `summary`, `url`, `propertyType`, `location`, `city`, `state`, `postalCode`, `offerPrice`, `priceCurrency`, `description`, `imageUrl`, `searchPage`, `sourceSearchUrl`, plus metadata fields when present

This design keeps extraction stable under anti-bot conditions while maximizing useful listing fields from available page data.