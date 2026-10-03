# FetchRSS & Track Changes Engine (Inoreader Parity)

A modern full-stack **Web-to-RSS Generator** and **Track Changes Page Monitor** web application built with **Node.js, Express, TypeScript, Cheerio, SQLite, React (Vite) and TailwindCSS**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![React](https://img.shields.io/badge/React-19.0-61dafb)

---

## 🌟 Key Features

1. **✨ AI Auto-Detection Mode:**
   - Automatically analyzes DOM structures of target web pages to extract news/article items in under 30 seconds without requiring manual clicking.

2. **🛠️ Manual Visual Selector (FetchRSS & Inoreader Parity):**
   - Live iframe proxy viewer with element hover inspector to visually pick **Item Container**, **Title**, **Link**, **Description**, and **Image** selectors.

3. **🔄 Track Changes Feed (Page Monitor & Diff Engine):**
   - Monitor specific DOM regions (e.g. price tags, announcement boxes, terms of service pages).
   - Generates SHA-256 content hashes, detects changes, and produces **RSS items with visual diffs** (`+ additions` / `- deletions`).

4. **⚙️ Page Settings Popup:**
   - **Page Layout:** Toggle between Desktop (`1280px`) and Mobile (`375px`) viewports.
   - **Cookie Consent Remover:** Automatically strips annoying GDPR cookie banners from proxied pages.
   - **Select & Remove Element:** Click any element to remove/hide it before scraping.

5. **🎛️ Advanced Options:**
   - **CSS Selectors Tab:** Edit raw CSS selector strings and highlight matching elements live (**Find matching elements**).
   - **Custom Headers Tab:** Pass custom HTTP headers (`Authorization`, `Cookie`, `Accept-Language`, etc.).

6. **⚡ Caching & Background Cron Scheduler:**
   - Built-in `node-cron` background worker auto-updates all active feeds every 15 minutes and serves cached RSS 2.0 XML instantly (`/feed/:id.xml`).

---

## 🚀 Quick Start & Installation

### Prerequisites
- **Node.js** (v18+)
- **npm** (v9+)

### Installation

```bash
# Clone repository
git clone https://github.com/mserman90/fetchrss-clone.git
cd fetchrss-clone

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
npm run build
cd ..
```

### Running the Application

```bash
# Start backend server and serve built frontend UI
npm start
```

Open your browser and navigate to **`http://localhost:3000`**.

---

## 📄 License
This project is licensed under the **MIT License**.
