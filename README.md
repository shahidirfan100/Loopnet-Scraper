# LoopNet Commercial Real Estate Scraper

Extract commercial real estate listings from LoopNet search pages in a structured dataset. Collect property details, location data, listing metadata, images, pricing signals, and ranking information for market research, lead discovery, investment analysis, and listing monitoring.

## Features

- **Flexible Search Inputs** - Start from a LoopNet search URL or build one from a location slug and listing type.
- **Sale And Lease Support** - Collect commercial properties listed for sale or for lease.
- **Richer Listing Metadata** - Capture IDs, property types, location fields, coordinates, image URLs, status fields, exposure level, and search ranking details.
- **Duplicate-Free Results** - Skip repeated records across pages and multiple start URLs.
- **Clean Dataset Output** - Remove empty fields so exported JSON, CSV, and Excel files stay readable.
- **Pagination Control** - Limit pages and result count for quick tests or larger collection runs.

---

## Use Cases

### Investment Research

Build a list of available commercial properties in a target market. Compare asset type, size, price signals, location, and listing rank to identify opportunities worth deeper review.

### Brokerage Lead Discovery

Collect structured listing data for broker research, outreach planning, and CRM enrichment. Listing URLs, property IDs, addresses, and market fields make it easier to match records with internal workflows.

### Market Monitoring

Schedule recurring runs for the same LoopNet search and compare new results over time. This is useful for watching supply changes in a city, asset class, or transaction type.

### Portfolio And Location Analysis

Use latitude, longitude, city, state, postal code, and property type fields to analyze where listings cluster. Export the dataset into BI tools or spreadsheets for mapping and filtering.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---:|---|---|
| `startUrl` | String | No | LoopNet New York sale search | LoopNet search page URL to collect from. |
| `location` | String | No | `new-york-ny` | Location slug used when `startUrl` is not provided. |
| `propertySegment` | String | No | `commercial-real-estate` | Search category path segment. |
| `listingType` | String | No | `for-sale` | Listing type: `for-sale` or `for-lease`. |
| `results_wanted` | Integer | No | `20` | Maximum number of records to save. |
| `max_pages` | Integer | No | `3` | Maximum search result pages to process. |
| `proxyConfiguration` | Object | No | Disabled | Proxy settings for more reliable collection. |

---

## Output Data

Each dataset item can include:

| Field | Type | Description |
|---|---|---|
| `listingId` | String | LoopNet listing identifier. |
| `title` | String | Listing headline. |
| `url` | String | Listing detail page URL. |
| `addressLine` | String | Street address or displayed address. |
| `city` | String | City name. |
| `state` | String | State abbreviation. |
| `postalCode` | String | ZIP or postal code. |
| `country` | String | Country code. |
| `county` | String | County when available. |
| `latitude` | Number | Listing latitude. |
| `longitude` | Number | Listing longitude. |
| `propertyType` | String | Property category such as Retail, Office, or Industrial. |
| `propertyTypeId` | String | Property category identifier. |
| `propertyId` | String | LoopNet property identifier. |
| `listingType` | String | Sale or lease listing type. |
| `listingTypeName` | String | Source listing type label. |
| `listingTypeId` | String | Source listing type identifier. |
| `exposureLevel` | String | Listing exposure level. |
| `listingStatus` | String | Listing status text when available. |
| `listingStatusId` | String | Listing status identifier. |
| `searchMarketId` | String | Market identifier from the search result. |
| `resultPageRank` | Number | Rank within the current result page. |
| `resultPositionRank` | Number | Position rank within the search result. |
| `squareFeet` | String | Square footage when available. |
| `sizeText` | String | Displayed size summary. |
| `offeringPrice` | String | Displayed price when available. |
| `capRate` | Number | Capitalization rate when available. |
| `yearBuilt` | Number | Year built when available. |
| `buildingClass` | String | Building class when available. |
| `brokerName` | String | Broker name when available. |
| `imageUrl` | String | Primary listing image URL. |
| `galleryUrls` | Array | Listing gallery image URLs found in the search result payload. |
| `buyNowEnabled` | String | Buy-now availability flag when present. |
| `sourceSearchUrl` | String | Search URL used for the record. |
| `searchPage` | Number | Search result page number. |
| `collectedAt` | String | Collection timestamp in ISO format. |

---

## Usage Examples

### Basic Search URL

Collect 20 sale listings from a New York search:

```json
{
    "startUrl": "https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/",
    "results_wanted": 20,
    "max_pages": 3
}
```

### Lease Listings By Location

Build the search from a city slug:

```json
{
    "location": "chicago-il",
    "listingType": "for-lease",
    "results_wanted": 30,
    "max_pages": 4
}
```

### Larger Market Run

Collect more records with proxy support:

```json
{
    "startUrl": "https://www.loopnet.com/search/commercial-real-estate/los-angeles-ca/for-sale/",
    "results_wanted": 100,
    "max_pages": 8,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

---

## Sample Output

```json
{
    "listingId": "40529829",
    "title": "Turnkey Retail on Major Brooklyn Thoroughfare",
    "url": "https://www.loopnet.com/Listing/1801-1803-Flatbush-Ave-Brooklyn-NY/40529829/",
    "addressLine": "1801-1803 Flatbush Ave",
    "city": "Brooklyn",
    "state": "NY",
    "postalCode": "11210",
    "country": "US",
    "latitude": 40.626239,
    "longitude": -73.940373,
    "propertyType": "Retail",
    "propertyTypeId": "6",
    "propertyId": "9283298",
    "listingType": "for-sale",
    "listingTypeName": "PropertyForAuction",
    "listingTypeId": "22",
    "exposureLevel": "Tier1",
    "resultPageRank": 1,
    "resultPositionRank": 1,
    "sizeText": "6,195 SF Retail",
    "imageUrl": "https://images1.loopnet.com/i2/example/117/image.jpg",
    "galleryUrls": [
        "https://images1.loopnet.com/i2/example/117/image.jpg",
        "https://images1.loopnet.com/i2/example/117/interior.jpg"
    ],
    "sourceSearchUrl": "https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/",
    "searchPage": 1,
    "collectedAt": "2026-07-26T09:30:00.000Z"
}
```

---

## Tips For Best Results

### Start With A Working Search URL

- Open the LoopNet search in your browser first.
- Use city and transaction pages that return visible listings.
- Keep query strings out of the URL unless you need a specific filter.

### Keep Test Runs Small

- Use `results_wanted: 20` while checking a new market.
- Increase `max_pages` after confirming the output looks right.
- Match `results_wanted` to realistic listing availability.

### Use Proxies For Reliability

- Enable residential proxies for repeated or scheduled runs.
- Keep proxy settings consistent across monitoring jobs.
- Retry later if a market page temporarily blocks access.

---

## Integrations

Connect your data with:

- **Google Sheets** - Review and filter listings with a team.
- **Airtable** - Build a searchable property database.
- **Make** - Trigger follow-up workflows after each run.
- **Zapier** - Send new listings to other apps.
- **Webhooks** - Deliver results to internal systems.

### Export Formats

- **JSON** - For developers and data pipelines.
- **CSV** - For spreadsheet analysis.
- **Excel** - For reports and sharing.
- **XML** - For legacy integrations.

---

## Frequently Asked Questions

### Can I collect both sale and lease listings?

Yes. Use `listingType` with `for-sale` or `for-lease`, or provide a LoopNet URL that already contains the desired listing type.

### How many listings can I collect?

You can collect up to your configured `results_wanted` value, limited by available results and `max_pages`.

### Why are some fields missing?

Some listings do not include every field. Empty values are removed from each record so the dataset stays clean.

### Can I monitor the same market over time?

Yes. Schedule the actor with the same input and compare datasets by `listingId`, `url`, and `collectedAt`.

### Does the actor remove duplicates?

Yes. Records are deduplicated by listing ID or URL before being saved.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring compliance with website terms of service and applicable laws. Use collected data responsibly.
