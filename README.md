# LoopNet Commercial Real Estate Scraper

Extract commercial real estate listings from LoopNet search pages in a clean and structured dataset. Collect listing-level details such as title, location, type, listing metadata, and optional enrichment from listing pages. Perfect for market research, lead discovery, portfolio analysis, and listing monitoring workflows.

---

## Features

- **Search URL or Slug Input** - Start from a direct LoopNet search page or build a URL from location and listing type.
- **Reliable Pagination** - Follows paginated result pages to reach your requested dataset size.
- **Rich Listing Metadata** - Captures listing identifiers, type, rank, location metadata, and URLs.
- **Optional Detail Enrichment** - Visits listing pages to collect additional fields when available.
- **Clean Dataset Output** - Removes empty and null-only fields before storing records.

---

## Use Cases

### Investment Opportunity Discovery
Track available properties in target markets and build a shortlist of relevant opportunities by type, location, and listing rank.

### Commercial Brokerage Research
Create structured listing datasets to compare inventory by submarket and identify trends in available properties.

### Market Monitoring
Schedule recurring runs to monitor new or changing listings and feed updates into dashboards or alerts.

### Lead Generation Workflows
Collect listing URLs and location metadata for downstream qualification pipelines and CRM enrichment.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `startUrl` | String | No | `https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/` | Search URL to start from. |
| `location` | String | No | `new-york-ny` | Location slug used when `startUrl` is empty. |
| `propertySegment` | String | No | `commercial-real-estate` | Search category path segment. |
| `listingType` | String | No | `for-sale` | Listing type. Allowed values: `for-sale`, `for-lease`. |
| `results_wanted` | Integer | No | `20` | Maximum number of records to collect. |
| `max_pages` | Integer | No | `10` | Safety limit for paginated search pages. |
| `proxyConfiguration` | Object | No | Apify Proxy enabled | Proxy settings for improved reliability. |

---

## Output Data

Each item in the dataset can include:

| Field | Type | Description |
|---|---|---|
| `listingId` | String | LoopNet listing identifier. |
| `title` | String | Listing title. |
| `summary` | String | Summary text shown in search cards. |
| `url` | String | Listing URL. |
| `propertyType` | String | Property type/category. |
| `location` | String | Listing location display text. |
| `city` | String | Listing city. |
| `state` | String | Listing state. |
| `postalCode` | String | Listing postal code when available. |
| `offerPrice` | Number | Listing price when available. |
| `priceCurrency` | String | Currency code for price. |
| `description` | String | Listing description when available. |
| `imageUrl` | String | Primary listing image URL. |
| `sourceSearchUrl` | String | Search page URL where listing was found. |
| `searchPage` | Integer | Search page number. |
| `collectedAt` | String | ISO timestamp of extraction. |

---

## Usage Examples

### Basic Search URL Run

```json
{
	"startUrl": "https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/",
	"results_wanted": 20,
	"max_pages": 3
}
```

### For Lease Listings by Slug

```json
{
	"location": "chicago-il",
	"listingType": "for-lease",
	"results_wanted": 30,
	"max_pages": 4
}
```

### Metadata-Only Fast Mode

```json
{
	"startUrl": "https://www.loopnet.com/search/commercial-real-estate/los-angeles-ca/for-sale/",
	"results_wanted": 25,
	"max_pages": 2
}
```

---

## Sample Output

```json
{
	"listingId": "39180986",
	"title": "Multifaceted Condos | Significant Upside",
	"summary": "3 Condo Units",
	"url": "https://www.loopnet.com/Listing/Multifaceted-Condos-Significant-Upside/39180986/",
	"propertyType": "Multifamily",
	"location": "New York, NY",
	"city": "New York",
	"state": "NY",
	"postalCode": "10001",
	"priceCurrency": "USD",
	"imageUrl": "https://images1.loopnet.com/i2/sL5MWIt1AZY2Q1sJ1WRZ4zCcCivtU7JTvBo511HL-H8/117/multifaceted-condos-|-significant-upside-office-retail-property-for-sale-new-york-ny.jpg",
	"sourceSearchUrl": "https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/",
	"searchPage": 1,
	"collectedAt": "2026-03-11T12:00:00.000Z"
}
```

---

## Tips For Best Results

### Use Stable Search URLs
- Start from known working city or market pages.
- Keep URL paths consistent with your target geography and listing type.

### Tune Collection Limits
- Start with `results_wanted: 20` for quick verification.
- Increase `max_pages` gradually when scaling extraction.

### Improve Reliability With Proxy
- Enable Apify Proxy for better run stability.
- Residential proxy groups are recommended for production workloads.

---

## Integrations

- **Google Sheets** - Share and review listings with teams.
- **Airtable** - Build searchable property tracking bases.
- **Make** - Trigger follow-up automations after each run.
- **Zapier** - Send listing updates to downstream apps.
- **Webhooks** - Stream results directly into your own systems.

### Export Formats

- **JSON** - API-ready structured data.
- **CSV** - Spreadsheet-friendly export.
- **Excel** - Reporting and analysis workflows.
- **XML** - Legacy system integration.

---

## Frequently Asked Questions

### How many listings can I collect?
You can collect as many as available within your configured `results_wanted` and `max_pages` limits.

### Can I scrape multiple locations?
Yes. Run the actor multiple times with different `startUrl` or `location` values and merge datasets downstream.

### Why are some fields missing on some records?
Some listings do not expose every attribute. Empty fields are removed automatically to keep output clean.

### Does this support both sale and lease listings?
Yes. Set `listingType` to `for-sale` or `for-lease`.

### Is this suitable for scheduled monitoring?
Yes. You can schedule recurring runs and compare datasets over time.

---

## Support

For issues or feature requests, use the actor support channels in Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for legitimate data collection and analysis workflows. You are responsible for complying with all applicable laws, terms, and data usage policies.