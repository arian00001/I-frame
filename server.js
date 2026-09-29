import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

let browser;

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

app.get("/", (req, res) => {
  res.json({
    name: "FrameScroll Backend",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.json({ success: true, status: "healthy" });
});

app.post("/render", async (req, res) => {
  const {
    url,
    width = 1440,
    height = 900,
    deviceScaleFactor = 1
  } = req.body;

  if (!url || !validUrl(url)) {
    return res.status(400).json({
      success: false,
      error: "Invalid URL"
    });
  }

  const allowedWidths = [1280, 1366, 1440, 1920];
  const allowedHeights = [720, 768, 900, 1080];

  const finalWidth = allowedWidths.includes(Number(width))
    ? Number(width)
    : 1440;

  const finalHeight = allowedHeights.includes(Number(height))
    ? Number(height)
    : 900;

  const browser = await getBrowser();

  const context = await browser.newContext({
    viewport: {
      width: finalWidth,
      height: finalHeight
    },
    deviceScaleFactor
  });

  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForLoadState("networkidle", {
      timeout: 15000
    }).catch(() => {});

    const title = await page.title();

    const pageSize = await page.evaluate(() => ({
      width: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      ),
      height: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      )
    }));

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false
    });

    res.json({
      success: true,
      data: {
        url,
        title,
        viewport: {
          width: finalWidth,
          height: finalHeight
        },
        pageSize,
        screenshot: screenshot.toString("base64")
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await context.close();
  }
});

app.post("/inspect", async (req, res) => {
  const { url } = req.body;

  if (!url || !validUrl(url)) {
    return res.status(400).json({
      success: false,
      error: "Invalid URL"
    });
  }

  const browser = await getBrowser();

  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900
    }
  });

  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForLoadState("networkidle", {
      timeout: 15000
    }).catch(() => {});

    const result = await page.evaluate(() => ({
      title: document.title,
      width: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      ),
      height: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      )
    }));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await context.close();
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FrameScroll backend running on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});
