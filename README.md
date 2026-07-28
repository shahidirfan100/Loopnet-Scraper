## What does LoopNet Commercial Real Estate Scraper do?

LoopNet Commercial Real Estate Scraper collects structured property listing data from LoopNet search result pages. Enter a LoopNet search URL or let the scraper build one from a location and listing type, and it returns property details, location data, pricing signals, images, and listing metadata in a clean dataset for market research, investment analysis, and lead discovery.

## Why use LoopNet Commercial Real Estate Scraper?

- **Reliable dataset creation** - Collect structured commercial real estate listings without manual copy-paste from search result pages.
- **Automation-ready output** - Export results to JSON, CSV, Excel, or XML for analysis in spreadsheets, BI tools, or data pipelines.
- **Use-case fit** - Supports investment research, brokerage lead generation, market monitoring, and property portfolio analysis workflows.
- **Sale and lease coverage** - Collect listings for both for-sale and for-lease properties across any supported LoopNet market.

## What data can you extract from LoopNet?

| Field | Description |
|-------|-------------|
| `title` | Listing headline |
| `url` | Direct LoopNet listing detail page URL |
| `addressLine` | Street address or displayed address |
| `city`, `state`, `postalCode`, `country` | Location details |
| `latitude`, `longitude` | Listing coordinates |
| `propertyType` | Property category such as Retail, Office, or Industrial |
| `listingType` | Sale or lease listing type |
| `squareFeet` | Square footage when available |
| `offeringPrice` | Displayed price when available |
| `capRate` | Capitalization rate when available |
| `yearBuilt` | Year built when available |
| `buildingClass` | Building class when available |
| `brokerName` | Broker name when available |
| `imageUrl`, `galleryUrls` | Primary and gallery listing images |
| `listingStatus` | Listing status text |

## How to use LoopNet Commercial Real Estate Scraper

1. Open the Actor on Apify Store.
2. Provide a LoopNet search URL or configure the location and listing type.
3. Set the maximum number of listings and pages to process.
4. Optionally enable proxy configuration for scheduled or repeated runs.
5. Run the Actor.
6. Download the dataset or connect it to your workflow.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | LoopNet New York sale search | Full LoopNet search page URL to start from. Query and hash parts are ignored automatically. |
| `listingType` | String | No | `for-sale` | Fallback transaction type used only when the URL does not already include it. Options: `for-sale`, `for-lease`. |
| `results_wanted` | Integer | No | `20` | Maximum number of listing records to save in the dataset. |
| `max_pages` | Integer | No | `10` | Safety cap on paginated search result pages to process. |
| `proxyConfiguration` | Object | No | Disabled | Proxy settings for more reliable collection during repeated or scheduled runs. |

## Output Data

| Field | Type | Description |
|-------|------|-------------|
| `listingId` | String | LoopNet listing identifier |
| `title` | String | Listing headline |
| `url` | String | Direct listing detail page URL |
| `addressLine` | String | Street address or displayed address |
| `city` | String | City name |
| `state` | String | State abbreviation |
| `postalCode` | String | ZIP or postal code |
| `country` | String | Country code |
| `county` | String | County when available |
| `latitude` | Number | Listing latitude |
| `longitude` | Number | Listing longitude |
| `propertyType` | String | Property category such as Retail, Office, or Industrial |
| `propertyTypeId` | String | Property category identifier |
| `propertyId` | String | LoopNet property identifier |
| `listingType` | String | Sale or lease listing type |
| `listingTypeName` | String | Source listing type label |
| `listingTypeId` | String | Source listing type identifier |
| `exposureLevel` | String | Listing exposure level |
| `listingStatus` | String | Listing status text when available |
| `listingStatusId` | String | Listing status identifier |
| `searchMarketId` | String | Market identifier from the search result |
| `resultPageRank` | Number | Rank within the current result page |
| `resultPositionRank` | Number | Position rank within the search result |
| `squareFeet` | String | Square footage when available |
| `sizeText` | String | Displayed size summary |
| `offeringPrice` | String | Displayed price when available |
| `capRate` | Number | Capitalization rate when available |
| `yearBuilt` | Number | Year built when available |
| `buildingClass` | String | Building class when available |
| `brokerName` | String | Broker name when available |
| `imageUrl` | String | Primary listing image URL |
| `galleryUrls` | Array | Listing gallery image URLs from the search result payload |
| `buyNowEnabled` | String | Buy-now availability flag when present |
| `sourceSearchUrl` | String | Search URL used for the record |
| `searchPage` | Number | Search result page number |
| `collectedAt` | String | Collection timestamp in ISO format |

## Usage Examples

### Basic Sale Search

Collect 20 for-sale listings from the New York commercial real estate search:

```json
{
    "startUrl": "https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/",
    "results_wanted": 20,
    "max_pages": 3
}
```

### Lease Listings in Chicago

Collect lease listings without providing a full URL -- the scraper builds the search from the location slug and listing type:

```json
{
    "location": "chicago-il",
    "listingType": "for-lease",
    "results_wanted": 30,
    "max_pages": 4
}
```

### Larger Collection with Proxy

Run a larger collection for Los Angeles with residential proxies for better reliability:

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

### Multi-URL Collection

The Actor also accepts multiple start URLs programmatically through the Apify API for collecting from multiple markets in one run.

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

## Tips for Best Results

- **Start with a working URL** - Open the LoopNet search in your browser first and use a URL that returns visible listings.
- **Test with a small limit** - Use `results_wanted: 20` while checking a new market before running larger collections.
- **Match limits to availability** - Set `results_wanted` and `max_pages` based on realistic listing counts for your target market.
- **Enable proxies for scheduled runs** - Use proxy configuration when running the Actor on a schedule to maintain collection reliability.
- **Empty fields are normal** - Some listings do not include every field. Empty values are removed from each record automatically.

## Integrations

- **Google Sheets** - Send listing data to spreadsheets for team analysis.
- **Airtable** - Build a searchable property database from collected results.
- **Make** - Trigger follow-up workflows after each collection run.
- **Zapier** - Send new listings to other applications.
- **Webhooks** - Deliver results to internal systems.

### Export Formats

- **JSON** - For developers and data pipelines.
- **CSV** - For spreadsheet analysis.
- **Excel** - For reports and sharing.
- **XML** - For legacy integrations.

## Frequently Asked Questions

### Can I collect both sale and lease listings?

Yes. Use `listingType` with `for-sale` or `for-lease`, or provide a LoopNet URL that already contains the desired listing type.

### How many listings can I collect?

You can collect up to your configured `results_wanted` value, limited by available search results and the `max_pages` setting.

### Why are some fields missing in the output?

Some listings do not publish every data point. Empty fields are removed from each record so the dataset stays clean and readable.

### Can I monitor the same market over time?

Yes. Schedule the Actor with the same input and compare datasets across runs by `listingId`, `url`, and `collectedAt`.

### Does the Actor remove duplicate listings?

Yes. Records are deduplicated by listing ID or URL before being saved to the dataset.

### Can I export the data to CSV or Excel?

Yes. Apify datasets can be downloaded in CSV, Excel, JSON, XML, and other supported formats from Apify Console or the API.

### Can I run this Actor on a schedule?

Yes. You can schedule the Actor in Apify Console to refresh data hourly, daily, weekly, or at another interval.

### Is this Actor suitable for non-technical users?

Yes. The Actor can be run from Apify Console with form-based inputs, and the output can be downloaded without writing code.

### Is it legal to scrape LoopNet?

Scraping public web data can be legal, but you are responsible for complying with applicable laws, website terms, and privacy rules.

## Related Actors

- [Crexi Property Scraper](https://apify.com/shahidirfan/crexi-property-scraper) - Collect commercial real estate listings from Crexi.
- [Realtor.com Scraper](https://apify.com/shahidirfan/realtor-com-scraper) - Extract residential and commercial property data from Realtor.com.
- [Redfin Property Scraper](https://apify.com/shahidirfan/redfin-property-scraper) - Collect property listings and details from Redfin.
- [Propertyfinder Scraper](https://apify.com/shahidirfan/propertyfinder-scraper) - Extract real estate listings from Propertyfinder.

## Support

For issues, feature requests, or custom Actor work, use the Issues tab on the Actor page or contact the developer through Apify.

## Legal Notice

This Actor is designed for legitimate data collection from publicly available LoopNet search results. Users are responsible for complying with LoopNet's terms of service and applicable laws. Use collected data responsibly.
