# Express Price Scraper

The Express Price Scraper API is a great tool for scraping prices from websites. It provides a flexible and efficient solution for retrieving product prices, caching the data, and generating insightful metrics. This API is built with Node.js and utilizes the Express framework for handling HTTP requests.

## Features

- **Price Scraping**: The API allows you to scrape prices from one or multiple websites by providing the URL(s) of the target pages.
- **Caching Mechanism**: The scraped data is cached in an SQLite database to minimize the number of requests and improve performance.
- **Cache Expiry**: You can specify the cache expiry time in minutes to control how long the scraped data should be considered valid before refreshing.
- **Metrics Calculation**: The API provides useful metrics such as the best price, worst price, and average price based on the scraped data.
- **Error Handling**: The API handles errors gracefully and provides appropriate error messages for missing URLs, price not found, and other potential issues.
- **Export to CSV**: You can export the scraped data from the database into a CSV file for further analysis or reporting.

## Installation

1. Clone the repository: `git clone https://github.com/Gingerbreadfork/express-price-scraper.git`
2. Navigate to the project directory: `cd express-price-scraper`
3. Install dependencies: `npm install`
4. Start the API server: `node api.js`

## API Endpoints

### Scrape Prices (GET /scrape)

This endpoint allows you to scrape prices from one or multiple websites.

**Query Parameters:**

- `url` (required): Comma-separated URLs of the target pages to scrape prices from.
- `cacheExpiryMinutes` (optional): Expiry time in minutes for the cache (default: 60 minutes).

**Example Request:**

```
GET /scrape?url=https://example.com/product1,https://example.com/product2&cacheExpiryMinutes=120
```

**Example Response:**

```json
{
  "prices": [
    {
      "url": "https://example.com/product1",
      "domain": "example.com",
      "price": "99.99",
      "success": true,
      "lastUpdated": 1653456789000,
      "isCached": false
    },
    {
      "url": "https://example.com/product2",
      "domain": "example.com",
      "price": "49.99",
      "success": true,
      "lastUpdated": 1653456790000,
      "isCached": false
    }
  ],
  "metrics": {
    "bestPrice": "49.99",
    "worstPrice": "99.99",
    "averagePrice": "74.99"
  }
}
```

### Scrape Prices (POST /scrape)

This endpoint allows you to scrape prices from one or multiple websites using a POST request.

**Request Body:**

```json
{
  "urls": ["https://example.com/product1", "https://example.com/product2"],
  "cacheExpiryMinutes": 120
}
```

**Example Request:**

```
POST /scrape
Content-Type: application/json

{
  "urls": ["https://example.com/product1", "https://example.com/product2"],
  "cacheExpiryMinutes": 120
}
```

### Export Cached Data (GET /export)
Returns a CSV file if any data is cached.
