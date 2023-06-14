const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const urlModule = require("url");
const { createObjectCsvWriter } = require("csv-writer");
const Database = require("better-sqlite3");

const app = express();
const port = 3000;

const db = new Database(":memory:");

db.exec(`
  CREATE TABLE IF NOT EXISTS scraped_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    price TEXT NOT NULL,
    success INTEGER NOT NULL,
    last_updated INTEGER NOT NULL
  )
`);

app.use(express.json());

const scrapePrice = async (url, cacheExpiryMinutes) => {
  let price = "0";
  let success = true;
  const domain = new urlModule.URL(url).hostname.replace("www.", "");
  const selectQuery = db.prepare(
    `SELECT * FROM scraped_data WHERE url = ? AND last_updated > ?`
  );
  const currentTime = Date.now() - cacheExpiryMinutes * 60 * 1000;
  const currentTimeStamp = Date.now();

  try {
    const cachedData = selectQuery.get(url, currentTime);

    if (cachedData) {
      return buildResponse(cachedData, true);
    }

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const priceRegex = /\d+(\.\d{1,2})?/;

    $("*")
      .filter((i, el) => {
        return (
          ($(el).attr("class") &&
            $(el).attr("class").toLowerCase().includes("price")) ||
          ($(el).attr("id") && $(el).attr("id").toLowerCase().includes("price"))
        );
      })
      .each((index, element) => {
        const potentialPrice = priceRegex.exec($(element).text());
        if (potentialPrice && price === "0") {
          price = potentialPrice[0];
          return false;
        }
      });

    const insertQuery = db.prepare(
      `INSERT INTO scraped_data (url, domain, price, success, last_updated) VALUES (?, ?, ?, ?, ?)`
    );
    insertQuery.run(url, domain, price, success ? 1 : 0, currentTimeStamp);

    return buildResponse(
      { url, domain, price, success, last_updated: currentTimeStamp },
      false
    );
  } catch (error) {
    console.error(`Error while scraping ${url}: ${error}`);
    success = false;

    const cachedData = selectQuery.get(url, currentTime);

    if (cachedData) {
      return buildResponse(cachedData, true);
    }

    const insertQuery = db.prepare(
      `INSERT INTO scraped_data (url, domain, price, success, last_updated) VALUES (?, ?, ?, ?, ?)`
    );
    insertQuery.run(url, domain, price, success ? 1 : 0, currentTimeStamp);

    return buildResponse(
      { url, domain, price, success, last_updated: currentTimeStamp },
      false
    );
  }
};

const buildResponse = (data, isCached) => {
  return {
    url: data.url,
    domain: data.domain,
    price: data.price,
    success: data.success === 1,
    lastUpdated: data.last_updated,
    isCached: isCached,
  };
};

app.get("/scrape", async (req, res) => {
  const { url, cacheExpiryMinutes = 60 } = req.query;

  if (!url) {
    return res.status(400).json({
      error: "Missing URL parameter",
    });
  }

  const urls = url.split(",");

  try {
    const prices = await Promise.all(
      urls.map((url) => scrapePrice(url, cacheExpiryMinutes))
    );

    const numericPrices = prices
      .map((pair) => parseFloat(pair.price))
      .filter((price) => price > 0);

    if (!numericPrices.length) {
      return res.status(404).json({
        error: "Price(s) not found",
      });
    }

    const bestPrice = Math.min(...numericPrices);
    const worstPrice = Math.max(...numericPrices);
    const averagePrice = (
      numericPrices.reduce((a, b) => a + b, 0) / numericPrices.length
    ).toFixed(2);

    const response = {
      prices: prices.map((price) => ({
        url: price.url,
        domain: price.domain,
        price: price.price,
        success: price.success,
        lastUpdated: price.lastUpdated,
        isCached: price.isCached,
      })),
      metrics: {
        bestPrice: bestPrice.toString(),
        worstPrice: worstPrice.toString(),
        averagePrice: averagePrice.toString(),
      },
    };

    return res.json(response);
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({
      error: "An error occurred while scraping",
    });
  }
});

app.post("/scrape", async (req, res) => {
  const { urls, cacheExpiryMinutes = 60 } = req.body;

  if (!urls) {
    return res.status(400).json({
      error: "Missing urls in request body",
    });
  }

  try {
    const prices = await Promise.all(
      urls.map((url) => scrapePrice(url, cacheExpiryMinutes))
    );

    if (!prices.length || prices.some((pair) => pair.price === undefined)) {
      return res.status(404).json({
        error: "Price(s) not found",
      });
    }

    const numericPrices = prices
      .map((pair) => parseFloat(pair.price))
      .filter((price) => price > 0);

    const bestPrice = Math.min(...numericPrices);
    const worstPrice = Math.max(...numericPrices);
    const averagePrice = (
      numericPrices.reduce((a, b) => a + b, 0) / numericPrices.length
    ).toFixed(2);

    const response = {
      prices: prices.map((price) => ({
        url: price.url,
        domain: price.domain,
        price: price.price,
        success: price.success,
        lastUpdated: price.lastUpdated,
        isCached: price.isCached,
      })),
      metrics: {
        bestPrice: bestPrice.toString(),
        worstPrice: worstPrice.toString(),
        averagePrice: averagePrice.toString(),
      },
    };

    return res.json(response);
  } catch (error) {
    console.error(`Error: ${error}`);
    return res.status(500).json({
      error: "An error occurred while scraping",
    });
  }
});

app.get("/export", (req, res) => {
  const query = `SELECT * FROM scraped_data`;

  db.all(query, (err, rows) => {
    if (err) {
      console.error(`Error while fetching data: ${err}`);
      return res.status(500).json({
        error: "An error occurred while exporting data",
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        error: "No data found",
      });
    }

    const csvWriter = createObjectCsvWriter({
      path: "export.csv",
      header: [
        { id: "id", title: "ID" },
        { id: "url", title: "URL" },
        { id: "domain", title: "Domain" },
        { id: "price", title: "Price" },
        { id: "success", title: "Success" },
        { id: "last_updated", title: "Last_Updated" },
      ],
      encoding: "utf8",
      alwaysQuote: false,
    });

    csvWriter
      .writeRecords([{}]) // Add an empty row as the header row
      .then(() => {
        csvWriter.writeRecords(rows).then(() => {
          console.log("CSV file created: export.csv");
          res.sendFile("export.csv", { root: __dirname });
        });
      })
      .catch((err) => {
        console.error(`Error while creating CSV file: ${err}`);
        return res.status(500).json({
          error: "An error occurred while exporting data",
        });
      });
  });
});

app.listen(port, () => {
  console.log(`Price scraping API is listening at http://localhost:${port}`);
});
