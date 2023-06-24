const express = require('express');
const axios = require('axios');
const { parse } = require('node-html-parser');
const urlModule = require('url');
const { createObjectCsvWriter } = require('csv-writer');
const Database = require('better-sqlite3');

const app = express();
const port = 3000;

const db = new Database(':memory:'); // Creates a database in memory by default
const stmt = db.prepare(`CREATE TABLE IF NOT EXISTS scraped_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  price TEXT NOT NULL,
  success INTEGER NOT NULL,
  last_updated INTEGER NOT NULL
)`);

stmt.run();

app.use(express.json());

const domainSelectors = [
  { domain: "example.com", selector: "#product-price > span" }
  // Add more domain-specific selectors here
];

const scrapePrice = async (url, cacheExpiryMinutes) => {
  const startTime = Date.now();
  let price = "0";
  let success = true;
  const domain = new urlModule.URL(url).hostname.replace('www.', '');
  const selectQuery = db.prepare(`SELECT * FROM scraped_data WHERE url = ? AND last_updated > ?`);
  const currentTime = Date.now() - cacheExpiryMinutes * 60 * 1000;
  const currentTimeStamp = Date.now();
  let elapsedTime;

  try {
    const cachedData = selectQuery.get(url, currentTime);

    if (cachedData) {
      return {
        url: cachedData.url,
        domain: cachedData.domain,
        price: cachedData.price,
        success: cachedData.success === 1,
        lastUpdated: cachedData.last_updated,
        isCached: true
      };
    }

    const { data } = await axios.get(url);
    const root = parse(data);
    const priceRegex = /\d+(\.\d{1,2})?/;

    const domainSpecificSelector = domainSelectors.find(e => e.domain === domain);
    if (domainSpecificSelector) {
      const priceElement = root.querySelector(domainSpecificSelector.selector);
      if (priceElement) {
        const potentialPrice = priceRegex.exec(priceElement.rawText);
        if (potentialPrice) {
          price = potentialPrice[0];
        }
      }
    } else {
      root.querySelectorAll('*').forEach(el => {
        const classAttr = el.getAttribute('class') || '';
        const id = el.getAttribute('id') || '';
        const classNames = classAttr.split(' ');
        
        if (
          (classNames && classNames.some(className => className.toLowerCase().includes('price'))) ||
          (id && id.toLowerCase().includes('price'))
        ) {
          const potentialPrice = priceRegex.exec(el.rawText);
          if (potentialPrice && price === "0") {
            price = potentialPrice[0];
          }
        }
      });
    }

elapsedTime = Date.now() - startTime;
console.log(`Scraped ${url} in ${elapsedTime}ms`);
  
    db.prepare(`INSERT INTO scraped_data (url, domain, price, success, last_updated) VALUES (?, ?, ?, ?, ?)`)
      .run(url, domain, price, success ? 1 : 0, currentTimeStamp);

    return {
      url: url,
      domain: domain,
      price: price,
      success: success,
      lastUpdated: currentTimeStamp,
      isCached: false
    };

  } catch (error) {
    console.error(`Error while scraping ${url}: ${error}`);
    success = false;

    const cachedData = selectQuery.get(url, currentTime);

    if (cachedData) {
      return {
        url: cachedData.url,
        domain: cachedData.domain,
        price: cachedData.price,
        success: cachedData.success === 1,
        lastUpdated: cachedData.last_updated,
        isCached: true
      };
    }

    db.prepare(`INSERT INTO scraped_data (url, domain, price, success, last_updated) VALUES (?, ?, ?, ?, ?)`)
      .run(url, domain, price, success ? 1 : 0, currentTimeStamp);

    return {
      url: url,
      domain: domain,
      price: price,
      success: success,
      lastUpdated: currentTimeStamp,
      isCached: false
    };
  }
};

app.get('/scrape', async (req, res) => {
  const { url, cacheExpiryMinutes = 60 } = req.query;

  if (!url) {
    return res.status(400).json({
      error: 'Missing URL parameter'
    });
  }

  const urls = url.split(',');

  try {
    const prices = await Promise.all(urls.map(url => scrapePrice(url, cacheExpiryMinutes)));

    const numericPrices = prices.map(pair => parseFloat(pair.price)).filter(price => price > 0);

    if (!numericPrices.length) {
      return res.status(404).json({
        error: 'Price(s) not found'
      });
    }

    const bestPrice = Math.min(...numericPrices);
    const worstPrice = Math.max(...numericPrices);
    const averagePrice = (numericPrices.reduce((a, b) => a + b, 0) / numericPrices.length).toFixed(2);

    const response = {
      prices: prices.map(price => ({
        url: price.url,
        domain: price.domain,
        price: price.price,
        success: price.success,
        lastUpdated: price.lastUpdated,
        isCached: price.isCached
      })),
      metrics: {
        bestPrice: bestPrice.toString(),
        worstPrice: worstPrice.toString(),
        averagePrice: averagePrice.toString()
      }
    };

    return res.json(response);

  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({
      error: 'An error occurred while scraping'
    });
  }
});

app.post('/scrape', async (req, res) => {
  const { urls, cacheExpiryMinutes = 60 } = req.body;

  if (!urls) {
    return res.status(400).json({
      error: 'Missing urls in request body'
    });
  }

  try {
    const prices = await Promise.all(urls.map(url => scrapePrice(url, cacheExpiryMinutes)));

    if (!prices.length || prices.some(pair => pair.price === undefined)) {
      return res.status(404).json({
        error: 'Price(s) not found'
      });
    }

    const numericPrices = prices.map(pair => parseFloat(pair.price)).filter(price => price > 0);

    const bestPrice = Math.min(...numericPrices);
    const worstPrice = Math.max(...numericPrices);
    const averagePrice = (numericPrices.reduce((a, b) => a + b, 0) / numericPrices.length).toFixed(2);

    const response = {
      prices: prices.map(price => ({
        url: price.url,
        domain: price.domain,
        price: price.price,
        success: price.success,
        lastUpdated: price.lastUpdated,
        isCached: price.isCached
      })),
      metrics: {
        bestPrice: bestPrice.toString(),
        worstPrice: worstPrice.toString(),
        averagePrice: averagePrice.toString()
      }
    };

    return res.json(response);

  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({
      error: 'An error occurred while scraping'
    });
  }
});

app.get('/export', (req, res) => {
  const query = `SELECT * FROM scraped_data`;

  const rows = db.prepare(query).all();

  if (rows.length === 0) {
    return res.status(404).json({
      error: 'No data found'
    });
  }

  const csvWriter = createObjectCsvWriter({
    path: 'export.csv',
    header: [
      { id: 'id', title: 'ID' },
      { id: 'url', title: 'URL' },
      { id: 'domain', title: 'DOMAIN' },
      { id: 'price', title: 'PRICE' },
      { id: 'success', title: 'SUCCESS' },
      { id: 'last_updated', title: 'LAST_UPDATED' }
    ]
  });

  csvWriter.writeRecords(rows)
    .then(() => res.download('export.csv'))
    .catch(err => res.status(500).json({
      error: 'An error occurred while exporting'
    }));
});

app.listen(port, () => {
  console.log(`Scraper app listening at http://localhost:${port}`);
});
