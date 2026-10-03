import express, { Request, Response } from 'express';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Initialize Google Gemini API on server side (free & keyless in AI Studio environment)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Serve static assets from public/ directory
const publicDir = path.resolve(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Data models
export interface FeedItem {
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  publishedLabel?: string;
  excerpt?: string;
  imageUrl?: string;
  category?: string;
}

export interface FeedRecord {
  id: string;
  slug?: string;
  name: string;
  url: string;
  feed_token: string;
  public_url: string;
  json_public_url: string;
  is_permanent?: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoredFeed {
  feed: FeedRecord;
  channel: {
    title: string;
    url: string;
    description: string;
  };
  items: FeedItem[];
  cachedAt: number;
}

export interface PermanentFeed {
  id: string;
  slug: string;
  name: string;
  url: string;
  description: string;
  topicFilter?: string;
  aiSummarize?: boolean;
  customSelectors?: {
    items?: string;
    title?: string;
    url?: string;
    description?: string;
  };
  cachedItems: FeedItem[];
  itemCount: number;
  lastScrapedAt: string;
  createdAt: string;
  updatedAt: string;
}

// Storage paths (Vercel serverless uses /tmp as writable storage)
const DATA_DIR = process.env.VERCEL
  ? path.resolve('/tmp', 'data')
  : path.resolve(__dirname, 'data');
const FEEDS_FILE = path.join(DATA_DIR, 'persistent_feeds.json');
const INITIAL_FEEDS_FILE = path.resolve(__dirname, 'data', 'persistent_feeds.json');

// Memory caches
const feedsCache = new Map<string, StoredFeed>();

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `feed-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateSmartSlug(url: string, title?: string): string {
  try {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const parsed = new URL(cleanUrl);
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // remove common multi-part and standard TLDs
    host = host.replace(/\.(gov|edu|org|com|net|co|me|io|ai|app|dev)(\.[a-z]{2})?$/i, '');
    host = host.replace(/\.[a-z]{2,8}$/i, '');

    let pathPart = parsed.pathname.replace(/^\/|\/$/g, '').split('/')[0] || '';
    pathPart = pathPart.replace(/\.(html|php|asp|aspx)$/i, '');

    let base = host;
    if (pathPart && pathPart.length >= 3 && pathPart.length <= 25 && !['index', 'home', 'default', 'main', 'tr', 'en'].includes(pathPart)) {
      base = `${host}-${pathPart}`;
    }

    const clean = slugify(base);
    if (clean && clean.length >= 3) {
      return clean;
    }
  } catch {
    // fallback to title
  }

  if (title && title.trim()) {
    const cleanTitle = slugify(title).split('-').slice(0, 4).join('-');
    if (cleanTitle && cleanTitle.length >= 3) {
      return cleanTitle;
    }
  }

  return `feed-${Math.random().toString(36).slice(2, 8)}`;
}

function loadPermanentFeeds(): Map<string, PermanentFeed> {
  const map = new Map<string, PermanentFeed>();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let sourceFile = FEEDS_FILE;
    if (!fs.existsSync(FEEDS_FILE) && fs.existsSync(INITIAL_FEEDS_FILE)) {
      sourceFile = INITIAL_FEEDS_FILE;
    }

    if (fs.existsSync(sourceFile)) {
      const data = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          map.set(item.slug, item);
        }
      }
    } else {
      // Seed default permanent feeds
      const seeds: PermanentFeed[] = [
        {
          id: 'tarimorman',
          slug: 'tarimorman',
          name: 'T.C. Tarım ve Orman Bakanlığı',
          url: 'https://www.tarimorman.gov.tr',
          description: 'Tarım ve Orman Bakanlığı güncel haber, destekleme ve duyuruları.',
          cachedItems: [],
          itemCount: 0,
          lastScrapedAt: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tarim-destekleri',
          slug: 'tarim-destekleri',
          name: 'Tarım Destekleri ve Hibeleri (AI Filtreli)',
          url: 'https://www.tarimorman.gov.tr',
          description: 'Yapay zeka ile filtrelenmiş çiftçi desteklemeleri, hibe ve kuraklık duyuruları.',
          topicFilter: 'Tarımsal desteklemeler, mazot gübre desteği, hibe, kredi ve çiftçi duyuruları',
          aiSummarize: true,
          cachedItems: [],
          itemCount: 0,
          lastScrapedAt: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'hackernews',
          slug: 'hackernews',
          name: 'Hacker News Frontpage',
          url: 'https://news.ycombinator.com',
          description: 'Top technology stories and startup discussions from Hacker News.',
          cachedItems: [],
          itemCount: 0,
          lastScrapedAt: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      for (const s of seeds) {
        map.set(s.slug, s);
      }
      try {
        fs.writeFileSync(FEEDS_FILE, JSON.stringify(seeds, null, 2), 'utf-8');
      } catch (writeErr) {
        // ignore if read-only
      }
    }
  } catch (err) {
    console.error('Error loading persistent feeds:', err);
  }
  return map;
}

const permanentFeeds = loadPermanentFeeds();

function savePermanentFeeds() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(permanentFeeds.values());
    fs.writeFileSync(FEEDS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving persistent feeds:', err);
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateToken(url: string): string {
  return Buffer.from(url.trim(), 'utf8').toString('base64url');
}

// Intelligent Gemini-powered Article Filtering and Summarization
async function aiExtractAndFilter(
  url: string,
  rawItems: { title: string; url: string; excerpt?: string }[],
  options?: {
    topicFilter?: string;
    summarize?: boolean;
    siteTitle?: string;
  }
): Promise<FeedItem[]> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is not available, skipping AI enhancement');
      return [];
    }

    if (!rawItems || rawItems.length === 0) return [];

    const prompt = `You are an expert RSS Feed Architect and News Editor.
Analyze the following candidate items extracted from "${url}" (Site: "${options?.siteTitle || ''}").

${
  options?.topicFilter
    ? `CRITICAL FILTER: The user ONLY wants items matching this specific topic/criteria: "${options.topicFilter}". Strictly exclude unrelated news/items.`
    : 'Select the most informative, important articles, announcements or blog posts.'
}

${
  options?.summarize
    ? 'For each item, generate a concise, objective 1-2 sentence summary in Turkish (or the source language).'
    : 'Provide a clear, high-quality description without boilerplate or navigational text.'
}

Requirements:
1. Clean titles: remove site names, duplicate phrases, or ALL-CAPS if ugly.
2. Keep original valid URLs.
3. Max 25 items.
4. Output strictly according to JSON schema.`;

    const candidateData = rawItems.slice(0, 35).map((it) => ({
      title: it.title,
      url: it.url,
      snippet: it.excerpt || '',
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `${prompt}\n\nCandidate Items:\n${JSON.stringify(candidateData)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              url: { type: Type.STRING },
              description: { type: Type.STRING },
              category: { type: Type.STRING },
            },
            required: ['title', 'url', 'description'],
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item: any) => ({
        title: item.title,
        url: item.url.startsWith('http') ? item.url : new URL(item.url, url).href,
        description: item.description || item.title,
        publishedAt: new Date().toISOString(),
        publishedLabel: new Date().toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', year: 'numeric' }),
        excerpt: item.description,
        category: item.category,
      }));
    }
  } catch (error: any) {
    console.error('AI Extraction Error:', error.message);
  }
  return [];
}

// Scrape website and extract items
async function scrapeUrl(
  targetUrl: string,
  customSelectors?: { items?: string; title?: string; url?: string; description?: string }
): Promise<{
  channel: { title: string; url: string; description: string };
  items: FeedItem[];
}> {
  let normalized = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  const response = await fetch(normalized, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; html2rss/1.13.0; +https://github.com/html2rss/html2rss-web)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website (HTTP ${response.status}: ${response.statusText})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract channel metadata
  const channelTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    new URL(normalized).hostname;

  const channelDesc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    `RSS feed for ${channelTitle} generated by html2rss-web`;

  const items: FeedItem[] = [];
  const seenUrls = new Set<string>();

  // Helper to resolve URL
  const resolveHref = (href?: string): string | undefined => {
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return undefined;
    try {
      return new URL(href, normalized).href;
    } catch {
      return undefined;
    }
  };

  if (customSelectors?.items) {
    // Custom selector mode
    $(customSelectors.items).each((_, el) => {
      const $el = $(el);
      const title = (customSelectors.title ? $el.find(customSelectors.title).text() : $el.text()).trim();
      const rawHref = customSelectors.url ? $el.find(customSelectors.url).attr('href') : $el.find('a').attr('href');
      const itemUrl = resolveHref(rawHref);
      const description = (customSelectors.description ? $el.find(customSelectors.description).text() : '').trim();

      if (title && itemUrl && !seenUrls.has(itemUrl)) {
        seenUrls.add(itemUrl);
        items.push({
          title,
          url: itemUrl,
          description: description || title,
          publishedAt: new Date().toISOString(),
          publishedLabel: new Date().toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', year: 'numeric' }),
          excerpt: description.slice(0, 200),
        });
      }
    });
  } else {
    // Auto-source mode: smart selector discovery

    // Special site handling: Hacker News
    if (normalized.includes('news.ycombinator.com')) {
      $('.athing').each((_, el) => {
        const $el = $(el);
        const titleEl = $el.find('.titleline > a').first();
        const title = titleEl.text().trim();
        const rawHref = titleEl.attr('href');
        const itemUrl = resolveHref(rawHref);
        const subtext = $el.next('tr').find('.subtext').text().trim();

        if (title && itemUrl && !seenUrls.has(itemUrl)) {
          seenUrls.add(itemUrl);
          items.push({
            title,
            url: itemUrl,
            description: subtext || title,
            publishedAt: new Date().toISOString(),
            publishedLabel: 'Today',
            excerpt: subtext,
          });
        }
      });
    }

    // Special site handling: GitHub Trending
    if (items.length === 0 && normalized.includes('github.com/trending')) {
      $('article.Box-row').each((_, el) => {
        const $el = $(el);
        const titleEl = $el.find('h2 a').first();
        const title = titleEl.text().replace(/\s+/g, ' ').trim();
        const itemUrl = resolveHref(titleEl.attr('href'));
        const desc = $el.find('p').text().trim();

        if (title && itemUrl && !seenUrls.has(itemUrl)) {
          seenUrls.add(itemUrl);
          items.push({
            title,
            url: itemUrl,
            description: desc || title,
            publishedAt: new Date().toISOString(),
            publishedLabel: 'Today',
            excerpt: desc,
          });
        }
      });
    }

    // News & announcements link extraction (Turkish & international news structures)
    if (items.length === 0) {
      $('a[href*="/Haber/"], a[href*="/Duyuru/"], a[href*="/haber/"], a[href*="/duyuru/"], a[href*="/news/"], a[href*="/post/"]').each((_, el) => {
        if (items.length >= 35) return;
        const $el = $(el);
        let title = $el.text().replace(/\s+/g, ' ').trim();
        const rawHref = $el.attr('href');
        const itemUrl = resolveHref(rawHref);

        if (title.toLowerCase() === 'devamı' || title.toLowerCase() === 'tümü' || title.length < 5) {
          const parentHeading = $el.closest('div, li, tr').find('h2, h3, h4, h5, .title, strong').first();
          if (parentHeading.length) {
            title = parentHeading.text().replace(/\s+/g, ' ').trim();
          }
        }

        if (title.length > 5 && itemUrl && !seenUrls.has(itemUrl)) {
          seenUrls.add(itemUrl);
          const excerpt = $el.closest('div, li, tr').find('p').first().text().replace(/\s+/g, ' ').trim() || title;
          items.push({
            title,
            url: itemUrl,
            description: excerpt,
            publishedAt: new Date().toISOString(),
            publishedLabel: 'Son Haberler',
            excerpt: excerpt.slice(0, 200),
          });
        }
      });
    }

    // Generic article containers
    if (items.length === 0) {
      const containerSelectors = [
        'article',
        '.post',
        '.article',
        '.story',
        '.news-item',
        '.entry',
        '.item',
        '.c-card',
        '.card',
        '.feed-item',
        'li:has(h2 a[href])',
        'li:has(h3 a[href])',
        'div[class*="post"]',
        'div[class*="article"]',
        'div[class*="entry"]',
        'div[class*="story"]',
      ];

      for (const selector of containerSelectors) {
        if (items.length >= 10) break;
        $(selector).each((_, el) => {
          if (items.length >= 35) return;
          const $el = $(el);

          const heading = $el.find('h1, h2, h3, h4, .title, .headline, a[class*="title"]').first();
          let title = heading.text().trim();
          let linkEl = heading.is('a') ? heading : heading.find('a').first();
          if (!linkEl.length) {
            linkEl = $el.find('a[href]').first();
          }

          if (!title) {
            title = linkEl.text().trim();
          }

          title = title.replace(/\s+/g, ' ').trim();
          const itemUrl = resolveHref(linkEl.attr('href'));

          if (title.length > 3 && itemUrl && !seenUrls.has(itemUrl)) {
            const excerpt =
              $el.find('p, .summary, .description, .excerpt, .snippet').first().text().replace(/\s+/g, ' ').trim() ||
              '';

            const timeVal =
              $el.find('time').attr('datetime') ||
              $el.find('time').text().trim() ||
              $el.find('.date, .time, .published').text().trim();

            let pubDate = new Date().toISOString();
            let pubLabel = 'Recent';
            if (timeVal) {
              const parsed = new Date(timeVal);
              if (!isNaN(parsed.getTime())) {
                pubDate = parsed.toISOString();
                pubLabel = parsed.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', year: 'numeric' });
              } else {
                pubLabel = timeVal.slice(0, 24);
              }
            }

            const imgUrl = resolveHref($el.find('img').attr('src'));

            seenUrls.add(itemUrl);
            items.push({
              title,
              url: itemUrl,
              description: excerpt || title,
              publishedAt: pubDate,
              publishedLabel: pubLabel,
              excerpt: excerpt.slice(0, 240),
              imageUrl: imgUrl,
            });
          }
        });
      }
    }

    // Fallback: prominent links
    if (items.length === 0) {
      $('main a[href], #content a[href], body a[href]').each((_, el) => {
        if (items.length >= 30) return;
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, ' ').trim();
        const href = resolveHref($el.attr('href'));

        if (text.length >= 15 && href && !seenUrls.has(href)) {
          const lower = text.toLowerCase();
          if (
            ['about', 'contact', 'privacy', 'terms', 'home', 'login', 'sign up', 'register', 'cookie'].some((skip) =>
              lower.includes(skip)
            )
          ) {
            return;
          }

          seenUrls.add(href);
          items.push({
            title: text,
            url: href,
            description: text,
            publishedAt: new Date().toISOString(),
            publishedLabel: 'Recent',
            excerpt: text,
          });
        }
      });
    }
  }

  return {
    channel: {
      title: channelTitle,
      url: normalized,
      description: channelDesc,
    },
    items,
  };
}

// Preconfigured Catalog Feeds
interface CatalogConfig {
  id: string;
  path: string;
  title: string;
  description: string;
  channelUrl: string;
  defaults?: Record<string, string>;
}

const CATALOG_CONFIGS: CatalogConfig[] = [
  {
    id: 'tarimorman',
    path: '/feeds/tarimorman.rss',
    title: 'T.C. Tarım ve Orman Bakanlığı',
    description: 'Tarım ve Orman Bakanlığı güncel haber, duyuru ve destekleme bültenleri.',
    channelUrl: 'https://www.tarimorman.gov.tr',
  },
  {
    id: 'tarim-destekleri',
    path: '/feeds/tarim-destekleri.rss',
    title: 'Tarım Destekleri ve Hibeleri (AI Filtreli)',
    description: 'Yapay zeka ile filtrelenmiş çiftçi desteklemeleri, hibe ve kuraklık duyuruları.',
    channelUrl: 'https://www.tarimorman.gov.tr',
  },
  {
    id: 'hackernews',
    path: '/feeds/hackernews.rss',
    title: 'Hacker News Frontpage',
    description: 'Top headlines and technology conversations from Hacker News.',
    channelUrl: 'https://news.ycombinator.com',
  },
  {
    id: 'github-trending',
    path: '/feeds/github-trending.rss',
    title: 'GitHub Trending Repositories',
    description: 'Trending open-source projects on GitHub today.',
    channelUrl: 'https://github.com/trending',
  },
  {
    id: 'lobsters',
    path: '/feeds/lobsters.rss',
    title: 'Lobste.rs Stories',
    description: 'Computing-focused link aggregation and discussions.',
    channelUrl: 'https://lobste.rs',
  },
  {
    id: 'devto',
    path: '/feeds/devto.rss',
    title: 'Dev.to Community Feed',
    description: 'Constructive and inclusive social network for software developers.',
    channelUrl: 'https://dev.to',
  },
  {
    id: 'techcrunch',
    path: '/feeds/techcrunch.rss',
    title: 'TechCrunch Latest',
    description: 'Startup and technology news, funding rounds, and product launches.',
    channelUrl: 'https://techcrunch.com',
  },
  {
    id: 'chip-testberichte',
    path: '/feeds/chip-testberichte.rss',
    title: 'CHIP Testberichte',
    description: 'Aktuelle Produkttests und Kaufberatung von CHIP.',
    channelUrl: 'https://www.chip.de/testberichte',
  },
];

// Helper to get or scrape a permanent feed
async function getOrScrapePermanentFeed(feed: PermanentFeed, origin: string): Promise<StoredFeed> {
  const now = Date.now();
  const lastScraped = feed.lastScrapedAt ? new Date(feed.lastScrapedAt).getTime() : 0;

  // Use cache if under 10 minutes and not empty
  if (feed.cachedItems && feed.cachedItems.length > 0 && now - lastScraped < 10 * 60 * 1000) {
    return {
      feed: {
        id: feed.slug,
        slug: feed.slug,
        name: feed.name,
        url: feed.url,
        feed_token: feed.slug,
        public_url: `/feeds/${feed.slug}.rss`,
        json_public_url: `/feeds/${feed.slug}.json`,
        is_permanent: true,
        created_at: feed.createdAt,
        updated_at: feed.updatedAt,
      },
      channel: {
        title: feed.name,
        url: feed.url,
        description: feed.description,
      },
      items: feed.cachedItems,
      cachedAt: lastScraped,
    };
  }

  // Scrape fresh
  const scraped = await scrapeUrl(feed.url, feed.customSelectors);
  let finalItems = scraped.items;

  // If AI filter or summarization is enabled, run Gemini enhancement
  if (feed.topicFilter || feed.aiSummarize) {
    const aiItems = await aiExtractAndFilter(feed.url, scraped.items, {
      topicFilter: feed.topicFilter,
      summarize: feed.aiSummarize,
      siteTitle: feed.name,
    });
    if (aiItems && aiItems.length > 0) {
      finalItems = aiItems;
    }
  }

  feed.cachedItems = finalItems;
  feed.itemCount = finalItems.length;
  feed.lastScrapedAt = new Date().toISOString();
  feed.updatedAt = new Date().toISOString();
  savePermanentFeeds();

  return {
    feed: {
      id: feed.slug,
      slug: feed.slug,
      name: feed.name,
      url: feed.url,
      feed_token: feed.slug,
      public_url: `/feeds/${feed.slug}.rss`,
      json_public_url: `/feeds/${feed.slug}.json`,
      is_permanent: true,
      created_at: feed.createdAt,
      updated_at: feed.updatedAt,
    },
    channel: {
      title: feed.name,
      url: feed.url,
      description: feed.description,
    },
    items: finalItems,
    cachedAt: now,
  };
}

// Helper to get or scrape a temporary feed
async function getOrScrapeFeed(url: string, origin: string): Promise<StoredFeed> {
  const token = generateToken(url);
  const existing = feedsCache.get(token);
  const now = Date.now();

  // Cache for 10 minutes
  if (existing && now - existing.cachedAt < 10 * 60 * 1000) {
    return existing;
  }

  const scraped = await scrapeUrl(url);
  const feedRecord: FeedRecord = {
    id: token,
    name: scraped.channel.title || url,
    url: url,
    feed_token: token,
    public_url: `/feeds/${token}.rss`,
    json_public_url: `/feeds/${token}.json`,
    created_at: existing ? existing.feed.created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const stored: StoredFeed = {
    feed: feedRecord,
    channel: scraped.channel,
    items: scraped.items,
    cachedAt: now,
  };

  feedsCache.set(token, stored);
  return stored;
}

// XML RSS 2.0 Renderer
function renderRssXml(feed: StoredFeed, origin: string): string {
  const token = feed.feed.slug || feed.feed.feed_token;
  const selfUrl = `${origin}/feeds/${token}.rss`;
  const itemsXml = feed.items
    .map((item) => {
      const pubDate = item.publishedAt ? new Date(item.publishedAt).toUTCString() : new Date().toUTCString();
      const enclosure = item.imageUrl
        ? `\n      <enclosure url="${escapeXml(item.imageUrl)}" type="image/jpeg" length="0" />`
        : '';
      const categoryTag = item.category ? `\n      <category>${escapeXml(item.category)}</category>` : '';
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <pubDate>${pubDate}</pubDate>${categoryTag}
      <description><![CDATA[${item.description || item.title}]]></description>${enclosure}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/rss.xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(feed.channel.title || 'Feed')}</title>
    <link>${escapeXml(feed.channel.url)}</link>
    <description>${escapeXml(feed.channel.description || 'Generated by html2rss-web')}</description>
    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>html2rss-web (https://github.com/html2rss/html2rss-web)</generator>
${itemsXml}
  </channel>
</rss>`;
}

// JSON Feed 1.1 Renderer
function renderJsonFeed(feed: StoredFeed, origin: string) {
  const token = feed.feed.slug || feed.feed.feed_token;
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: feed.channel.title || feed.feed.name,
    home_page_url: feed.channel.url,
    feed_url: `${origin}/feeds/${token}.json`,
    description: feed.channel.description,
    items: feed.items.map((item) => ({
      id: item.url,
      url: item.url,
      title: item.title,
      content_html: `<p>${escapeXml(item.description || '')}</p>`,
      summary: item.description,
      date_published: item.publishedAt,
      ...(item.category ? { tags: [item.category] } : {}),
      ...(item.imageUrl ? { image: item.imageUrl } : {}),
    })),
  };
}

// ----------------------------------------------------
// API V1 Routes
// ----------------------------------------------------

// GET /api/v1 - API metadata
app.get('/api/v1', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      api: {
        name: 'html2rss-web',
        description: 'Turn almost any website into an RSS or JSON feed with AI Smart Filtering',
        openapi_url: '/openapi.yaml',
      },
      instance: {
        catalog: {
          enabled: true,
          url: '/api/v1/configs',
        },
        feed_creation: {
          enabled: true,
          access_token_required: false,
        },
      },
    },
  });
});

// GET /api/v1/configs - Catalog configs
app.get('/api/v1/configs', (req: Request, res: Response) => {
  const configs = CATALOG_CONFIGS.map((cfg) => ({
    id: cfg.id,
    path: cfg.path,
    channel: { url: cfg.channelUrl },
    directory: {
      title: cfg.title,
      summary: cfg.description,
    },
    parameters: { defaults: cfg.defaults || {} },
    last_result: {
      state: 'ok',
      at: new Date().toISOString(),
    },
  }));

  res.json({
    success: true,
    data: { configs },
    meta: {
      total: configs.length,
      catalog_version: 2,
      starters: ['tarimorman', 'tarim-destekleri', 'hackernews', 'github-trending'],
    },
  });
});

// Health checks
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      health: {
        status: 'healthy',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          scraper: 'ok',
          gemini: process.env.GEMINI_API_KEY ? 'ready' : 'missing_key',
          storage: 'ok',
        },
      },
    },
  });
});

app.get('/api/v1/health/live', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      health: {
        status: 'live',
        timestamp: new Date().toISOString(),
      },
    },
  });
});

app.get('/api/v1/health/ready', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      health: {
        status: 'ready',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {},
      },
    },
  });
});

// ----------------------------------------------------
// AI Smart Feed Endpoint: POST /api/v1/ai/smart-feed
// ----------------------------------------------------
app.post('/api/v1/ai/smart-feed', async (req: Request, res: Response) => {
  try {
    const { url, topicFilter, summarize } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const origin = `${protocol}://${host}`;

    // Scrape initial items
    const scraped = await scrapeUrl(url);

    // Run Gemini smart extraction & filtering
    const aiItems = await aiExtractAndFilter(url, scraped.items, {
      topicFilter,
      summarize: summarize !== false,
      siteTitle: scraped.channel.title,
    });

    const finalItems = aiItems.length > 0 ? aiItems : scraped.items;
    const suggestedSlug = generateSmartSlug(
      url,
      topicFilter ? `${scraped.channel.title} ${topicFilter}` : scraped.channel.title
    );

    return res.json({
      success: true,
      data: {
        channel: {
          title: topicFilter ? `${scraped.channel.title} - ${topicFilter}` : scraped.channel.title,
          url: scraped.channel.url,
          description: topicFilter
            ? `Yapay zeka filtreli akış: ${topicFilter} (${scraped.channel.title})`
            : scraped.channel.description,
        },
        items: finalItems,
        suggestedSlug,
        itemCount: finalItems.length,
      },
    });
  } catch (error: any) {
    console.error('AI smart feed error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ----------------------------------------------------
// Permanent Feeds CRUD Endpoints
// ----------------------------------------------------

// GET /api/v1/feeds/permanent - List all permanent feeds
app.get('/api/v1/feeds/permanent', (req: Request, res: Response) => {
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const origin = `${protocol}://${host}`;

  const list = Array.from(permanentFeeds.values()).map((f) => ({
    ...f,
    public_url: `/feeds/${f.slug}.rss`,
    json_public_url: `/feeds/${f.slug}.json`,
    full_rss_url: `${origin}/feeds/${f.slug}.rss`,
    full_json_url: `${origin}/feeds/${f.slug}.json`,
  }));

  res.json({
    success: true,
    data: {
      feeds: list,
      total: list.length,
    },
  });
});

// POST /api/v1/feeds/permanent - Create or update a permanent feed
app.post('/api/v1/feeds/permanent', async (req: Request, res: Response) => {
  try {
    const { url, name, slug: customSlug, description, topicFilter, aiSummarize, customSelectors } = req.body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const origin = `${protocol}://${host}`;

    // Initial scrape to populate items & metadata
    const scraped = await scrapeUrl(url, customSelectors);
    let finalItems = scraped.items;

    // Clean smart slug
    const finalSlug = customSlug && customSlug.trim()
      ? slugify(customSlug)
      : generateSmartSlug(url, name || scraped.channel.title);

    if (topicFilter || aiSummarize) {
      const aiItems = await aiExtractAndFilter(url, scraped.items, {
        topicFilter,
        summarize: Boolean(aiSummarize),
        siteTitle: name || scraped.channel.title,
      });
      if (aiItems && aiItems.length > 0) {
        finalItems = aiItems;
      }
    }

    const now = new Date().toISOString();
    const existing = permanentFeeds.get(finalSlug);

    const permanentItem: PermanentFeed = {
      id: finalSlug,
      slug: finalSlug,
      name: name?.trim() || scraped.channel.title || url,
      url: url.trim(),
      description: description?.trim() || scraped.channel.description || 'Permanent RSS feed created with html2rss',
      topicFilter: topicFilter?.trim() || undefined,
      aiSummarize: Boolean(aiSummarize),
      customSelectors: customSelectors || undefined,
      cachedItems: finalItems,
      itemCount: finalItems.length,
      lastScrapedAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    permanentFeeds.set(finalSlug, permanentItem);
    savePermanentFeeds();

    return res.json({
      success: true,
      data: {
        feed: {
          id: permanentItem.slug,
          slug: permanentItem.slug,
          name: permanentItem.name,
          url: permanentItem.url,
          feed_token: permanentItem.slug,
          public_url: `/feeds/${permanentItem.slug}.rss`,
          json_public_url: `/feeds/${permanentItem.slug}.json`,
          is_permanent: true,
          created_at: permanentItem.createdAt,
          updated_at: permanentItem.updatedAt,
        },
        preview: {
          channel: {
            title: permanentItem.name,
            url: permanentItem.url,
            description: permanentItem.description,
          },
          items: finalItems.slice(0, 10),
        },
      },
    });
  } catch (error: any) {
    console.error('Permanent feed creation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/feeds/permanent/rename - Rename a slug
app.post('/api/v1/feeds/permanent/rename', (req: Request, res: Response) => {
  const { oldSlug, newSlug } = req.body;
  if (!oldSlug || !newSlug) {
    return res.status(400).json({ success: false, error: 'oldSlug and newSlug are required' });
  }

  const cleanNewSlug = slugify(newSlug);
  if (!permanentFeeds.has(oldSlug)) {
    return res.status(404).json({ success: false, error: 'Feed not found' });
  }

  if (oldSlug !== cleanNewSlug && permanentFeeds.has(cleanNewSlug)) {
    return res.status(409).json({ success: false, error: 'Bu kısa ad (slug) zaten başka bir akış tarafından kullanılıyor.' });
  }

  const item = permanentFeeds.get(oldSlug)!;
  permanentFeeds.delete(oldSlug);

  item.id = cleanNewSlug;
  item.slug = cleanNewSlug;
  item.updatedAt = new Date().toISOString();

  permanentFeeds.set(cleanNewSlug, item);
  savePermanentFeeds();

  return res.json({
    success: true,
    data: {
      slug: cleanNewSlug,
      public_url: `/feeds/${cleanNewSlug}.rss`,
      json_public_url: `/feeds/${cleanNewSlug}.json`,
    },
  });
});

// DELETE /api/v1/feeds/permanent/:slug - Delete a permanent feed
app.delete('/api/v1/feeds/permanent/:slug', (req: Request, res: Response) => {
  const { slug } = req.params;
  if (!permanentFeeds.has(slug)) {
    return res.status(404).json({ success: false, error: 'Feed not found' });
  }

  permanentFeeds.delete(slug);
  savePermanentFeeds();

  return res.json({ success: true, message: 'Feed deleted successfully' });
});

// ----------------------------------------------------
// Standard POST /api/v1/feeds (Auto-Permanent Creation)
// ----------------------------------------------------
app.post('/api/v1/feeds', async (req: Request, res: Response) => {
  try {
    const { url, selectors, topicFilter, aiSummarize, slug: customSlug, name: customName } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          kind: 'input',
          code: 'INVALID_INPUT',
          message: 'URL is required.',
          retryable: false,
          next_action: 'correct_input',
          retry_action: 'none',
        },
      });
    }

    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const origin = `${protocol}://${host}`;

    // Scrape items
    const scraped = await scrapeUrl(url, selectors && typeof selectors === 'object' ? selectors : undefined);
    let finalItems = scraped.items;

    if (finalItems.length === 0) {
      return res.status(422).json({
        success: false,
        error: {
          kind: 'input',
          code: 'EMPTY_EXTRACT',
          message: "Web sayfasında akış öğesi tespit edilemedi. Lütfen URL adresini kontrol edin.",
          retryable: true,
          next_action: 'retry',
          retry_action: 'primary',
        },
      });
    }

    // Determine clean smart slug
    const finalSlug = customSlug && customSlug.trim()
      ? slugify(customSlug)
      : generateSmartSlug(url, customName || scraped.channel.title);

    // If AI enhancement requested
    if (topicFilter || aiSummarize) {
      const aiItems = await aiExtractAndFilter(url, finalItems, {
        topicFilter,
        summarize: Boolean(aiSummarize),
        siteTitle: customName || scraped.channel.title,
      });
      if (aiItems && aiItems.length > 0) {
        finalItems = aiItems;
      }
    }

    const now = new Date().toISOString();
    const existing = permanentFeeds.get(finalSlug);

    // Save as permanent feed automatically!
    const permanentItem: PermanentFeed = {
      id: finalSlug,
      slug: finalSlug,
      name: customName?.trim() || scraped.channel.title || url,
      url: url.trim(),
      description: scraped.channel.description || 'Permanent RSS feed created with html2rss',
      topicFilter: topicFilter?.trim() || undefined,
      aiSummarize: Boolean(aiSummarize),
      customSelectors: selectors || undefined,
      cachedItems: finalItems,
      itemCount: finalItems.length,
      lastScrapedAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    permanentFeeds.set(finalSlug, permanentItem);
    savePermanentFeeds();

    return res.json({
      success: true,
      data: {
        feed: {
          id: permanentItem.slug,
          slug: permanentItem.slug,
          name: permanentItem.name,
          url: permanentItem.url,
          feed_token: permanentItem.slug,
          public_url: `/feeds/${permanentItem.slug}.rss`,
          json_public_url: `/feeds/${permanentItem.slug}.json`,
          is_permanent: true,
          created_at: permanentItem.createdAt,
          updated_at: permanentItem.updatedAt,
        },
        preview: {
          channel: scraped.channel,
          items: finalItems.slice(0, 10),
        },
      },
    });
  } catch (error: any) {
    console.error('Feed creation error:', error);
    return res.status(500).json({
      success: false,
      error: {
        kind: 'server',
        code: 'CREATION_FAILED',
        message: error.message || 'Unable to create feed from this URL.',
        retryable: true,
        next_action: 'retry',
        retry_action: 'primary',
      },
    });
  }
});

// GET /api/v1/feeds/:token - Feed metadata & preview
app.get('/api/v1/feeds/:token', async (req: Request, res: Response) => {
  const token = req.params.token.replace(/\.(rss|xml|json)$/, '');

  // Check permanent feeds first
  if (permanentFeeds.has(token)) {
    const pFeed = permanentFeeds.get(token)!;
    return res.json({
      success: true,
      data: {
        feed: {
          id: pFeed.slug,
          slug: pFeed.slug,
          name: pFeed.name,
          url: pFeed.url,
          feed_token: pFeed.slug,
          public_url: `/feeds/${pFeed.slug}.rss`,
          json_public_url: `/feeds/${pFeed.slug}.json`,
          is_permanent: true,
          created_at: pFeed.createdAt,
          updated_at: pFeed.updatedAt,
        },
        preview: {
          channel: {
            title: pFeed.name,
            url: pFeed.url,
            description: pFeed.description,
          },
          items: pFeed.cachedItems.slice(0, 10),
        },
      },
    });
  }

  const stored = feedsCache.get(token);
  if (!stored) {
    return res.status(404).json({
      success: false,
      error: {
        kind: 'input',
        code: 'NOT_FOUND',
        message: 'Feed not found.',
        retryable: false,
        next_action: 'correct_input',
        retry_action: 'none',
      },
    });
  }

  res.json({
    success: true,
    data: {
      feed: stored.feed,
      preview: {
        channel: stored.channel,
        items: stored.items.slice(0, 10),
      },
    },
  });
});

// ----------------------------------------------------
// Feed Rendering Routes: /feeds/:token, /rss/:token, /feed
// ----------------------------------------------------

// Handler function for rendering feeds
async function handleServeFeed(req: Request, res: Response, tokenParam: string, forceFormat?: 'rss' | 'json') {
  const isJson = forceFormat === 'json' || tokenParam.endsWith('.json') || (req.get('accept') && req.get('accept')?.includes('json'));
  let token = tokenParam.replace(/\.(rss|xml|json)$/, '');

  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const origin = `${protocol}://${host}`;

  // 1. Check Permanent Feeds first
  if (permanentFeeds.has(token)) {
    const pFeed = permanentFeeds.get(token)!;
    try {
      const stored = await getOrScrapePermanentFeed(pFeed, origin);
      if (isJson) {
        res.setHeader('Content-Type', 'application/feed+json; charset=utf-8');
        return res.json(renderJsonFeed(stored, origin));
      } else {
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        return res.send(renderRssXml(stored, origin));
      }
    } catch (err: any) {
      return res.status(500).send(`Error loading feed: ${err.message}`);
    }
  }

  // Handle aliases and legacy/truncated tokens
  if (token === 'aHR0cHM6Ly93d3cudGFyaW1vcm1hbi5n' || token === 'tarimorman') {
    if (permanentFeeds.has('tarimorman')) {
      const pFeed = permanentFeeds.get('tarimorman')!;
      const stored = await getOrScrapePermanentFeed(pFeed, origin);
      if (isJson) {
        res.setHeader('Content-Type', 'application/feed+json; charset=utf-8');
        return res.json(renderJsonFeed(stored, origin));
      } else {
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        return res.send(renderRssXml(stored, origin));
      }
    }
    token = generateToken('https://www.tarimorman.gov.tr');
  }

  // 2. Check in-memory cache
  let stored = feedsCache.get(token);

  // 3. If not found in cache, check if token decodes to a valid URL
  if (!stored) {
    try {
      let decodedUrl = Buffer.from(token, 'base64url').toString('utf8');
      if (decodedUrl.startsWith('https://www.tarimorman.g')) {
        decodedUrl = 'https://www.tarimorman.gov.tr';
      }
      if (/^https?:\/\//i.test(decodedUrl)) {
        stored = await getOrScrapeFeed(decodedUrl, origin);
      }
    } catch {
      // not a base64url
    }
  }

  // 4. Check catalog configs
  if (!stored) {
    const catalog = CATALOG_CONFIGS.find((c) => c.id === token);
    if (catalog) {
      stored = await getOrScrapeFeed(catalog.channelUrl, origin);
    }
  }

  if (!stored) {
    return res.status(404).send('Feed not found');
  }

  if (isJson) {
    res.setHeader('Content-Type', 'application/feed+json; charset=utf-8');
    return res.json(renderJsonFeed(stored, origin));
  } else {
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    return res.send(renderRssXml(stored, origin));
  }
}

// Direct /feed endpoint by URL: /feed?url=https://...&filter=...
app.get(['/feed', '/api/feed'], async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Query parameter ?url= is required');
  }

  const format = (req.query.format as string) || (req.get('accept')?.includes('json') ? 'json' : 'rss');
  const filter = (req.query.filter as string) || undefined;
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const origin = `${protocol}://${host}`;

  try {
    const stored = await getOrScrapeFeed(targetUrl, origin);
    if (filter) {
      const aiItems = await aiExtractAndFilter(targetUrl, stored.items, {
        topicFilter: filter,
        summarize: true,
        siteTitle: stored.channel.title,
      });
      if (aiItems && aiItems.length > 0) {
        stored.items = aiItems;
      }
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/feed+json; charset=utf-8');
      return res.json(renderJsonFeed(stored, origin));
    } else {
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      return res.send(renderRssXml(stored, origin));
    }
  } catch (error: any) {
    return res.status(500).send(`Error generating feed: ${error.message}`);
  }
});

// Route: /feeds/:token, /rss/:token, /api/feeds/:token, /api/rss/:token
app.get(['/feeds/:token', '/rss/:token', '/api/feeds/:token', '/api/rss/:token'], async (req: Request, res: Response) => {
  return handleServeFeed(req, res, req.params.token);
});

// Catalog & named permanent feed root endpoints (e.g., /hackernews.rss, /tarimorman.rss, /tarim-destekleri.rss)
app.get('/:feedName', async (req: Request, res: Response, next) => {
  const param = req.params.feedName;
  if (!param.endsWith('.rss') && !param.endsWith('.xml') && !param.endsWith('.json')) {
    return next();
  }

  const baseName = param.replace(/\.(rss|xml|json)$/, '');
  if (permanentFeeds.has(baseName) || CATALOG_CONFIGS.some((c) => c.id === baseName)) {
    return handleServeFeed(req, res, param);
  }

  next();
});

// ----------------------------------------------------
// Frontend Mounting (Vite in Dev / Static in Prod)
// ----------------------------------------------------
const distPath = path.resolve(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/feeds') ||
      req.path.startsWith('/feed') ||
      req.path.startsWith('/rss') ||
      req.path.startsWith('/json') ||
      req.path.endsWith('.rss') ||
      req.path.endsWith('.xml') ||
      req.path.endsWith('.json') ||
      req.path.endsWith('.yaml') ||
      req.path.endsWith('.xsl')
    ) {
      return next();
    }
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

export { app };
export default app;

if (!process.env.VERCEL) {
  async function startServer() {
    const PORT = Number(process.env.PORT) || 3000;

    if (process.env.NODE_ENV !== 'production' && !fs.existsSync(distPath)) {
      try {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: {
            middlewareMode: true,
            host: '0.0.0.0',
            port: PORT,
          },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      } catch (e) {
        console.warn('Vite dev middleware omitted:', e);
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`html2rss-web server running at http://localhost:${PORT}`);
    });
  }

  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}
