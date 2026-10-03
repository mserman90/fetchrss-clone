import React, { useState, useEffect, useRef, useMemo } from 'react';

interface FeedRecord {
  id: string;
  name: string;
  url: string;
  feed_token: string;
  public_url: string;
  json_public_url: string;
  created_at: string;
  updated_at: string;
}

interface FeedItem {
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  publishedLabel?: string;
  excerpt?: string;
  imageUrl?: string;
}

interface CatalogEntry {
  id: string;
  path: string;
  title: string;
  description: string;
  channel: { url: string };
  directory: { title: string; summary: string };
}

const STARTER_FEEDS = [
  {
    title: 'Hacker News Frontpage',
    url: 'https://news.ycombinator.com',
    description: 'Top headlines and tech conversations from Hacker News.',
  },
  {
    title: 'GitHub Trending Repositories',
    url: 'https://github.com/trending',
    description: 'Trending open-source projects on GitHub today.',
  },
  {
    title: 'Lobste.rs Stories',
    url: 'https://lobste.rs',
    description: 'Computing-focused link aggregation and discussions.',
  },
  {
    title: 'Dev.to Community Feed',
    url: 'https://dev.to',
    description: 'Constructive and inclusive social network for software developers.',
  },
  {
    title: 'TechCrunch Latest',
    url: 'https://techcrunch.com',
    description: 'Startup and technology news, funding rounds, and product launches.',
  },
  {
    title: 'CHIP Testberichte',
    url: 'https://www.chip.de/testberichte',
    description: 'Aktuelle Produkttests und Kaufberatung von CHIP.',
  },
];

export default function App() {
  const [url, setUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedResult, setFeedResult] = useState<{
    feed: FeedRecord;
    preview: { channel: { title: string; url: string; description: string }; items: FeedItem[] };
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [showRawXmlModal, setShowRawXmlModal] = useState(false);
  const [rawXmlContent, setRawXmlContent] = useState('');
  const [isLoadingXml, setIsLoadingXml] = useState(false);
  const [showBookmarkletHelp, setShowBookmarkletHelp] = useState(false);
  const [showAdvancedSelectors, setShowAdvancedSelectors] = useState(false);
  const [customItemSelector, setCustomItemSelector] = useState('');
  const [customTitleSelector, setCustomTitleSelector] = useState('');
  const [customUrlSelector, setCustomUrlSelector] = useState('');
  const [customDescSelector, setCustomDescSelector] = useState('');

  const [accessToken, setAccessToken] = useState(() => {
    try {
      return localStorage.getItem('html2rss_access_token') || '';
    } catch {
      return '';
    }
  });
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  // Check URL query parameter on mount (e.g. from bookmarklet)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryUrl = params.get('url');
      if (queryUrl) {
        setUrl(queryUrl);
        handleCreateFeed(queryUrl);
      }
    } catch {
      // ignore
    }
  }, []);

  // Filter catalog hits based on current user input
  const catalogHits = useMemo(() => {
    const trimmed = url.trim().toLowerCase();
    if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return [];
    }
    return STARTER_FEEDS.filter(
      (item) =>
        item.title.toLowerCase().includes(trimmed) ||
        item.description.toLowerCase().includes(trimmed) ||
        item.url.toLowerCase().includes(trimmed)
    );
  }, [url]);

  const handleCreateFeed = async (targetUrl?: string) => {
    const rawUrl = (targetUrl || url).trim();
    if (!rawUrl) {
      setError('URL is required.');
      return;
    }

    let normalized = rawUrl;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    setIsCreating(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const bodyPayload: any = { url: normalized };
      if (showAdvancedSelectors && customItemSelector.trim()) {
        bodyPayload.selectors = {
          items: customItemSelector.trim(),
          title: customTitleSelector.trim() || undefined,
          url: customUrlSelector.trim() || undefined,
          description: customDescSelector.trim() || undefined,
        };
      }

      const res = await fetch('/api/v1/feeds', {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Couldn't create feed. Please check the URL.");
      }

      setFeedResult(data.data);
    } catch (err: any) {
      setError(err.message || 'Unable to complete feed creation.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleViewRawXml = async () => {
    if (!feedResult) return;
    setIsLoadingXml(true);
    setShowRawXmlModal(true);
    try {
      const res = await fetch(feedResult.feed.public_url);
      const text = await res.text();
      setRawXmlContent(text);
    } catch (err: any) {
      setRawXmlContent('Error loading XML: ' + err.message);
    } finally {
      setIsLoadingXml(false);
    }
  };

  const handleDownloadXml = async () => {
    if (!feedResult) return;
    try {
      const res = await fetch(feedResult.feed.public_url);
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/rss+xml;charset=utf-8' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${feedResult.feed.id || 'feed'}.rss`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSaveToken = () => {
    const val = tokenDraft.trim();
    setAccessToken(val);
    try {
      if (val) {
        localStorage.setItem('html2rss_access_token', val);
      } else {
        localStorage.removeItem('html2rss_access_token');
      }
    } catch {
      // ignore
    }
    setShowTokenDialog(false);
  };

  const bookmarkletCode = `javascript:window.location.assign('${window.location.origin}/?url='+encodeURIComponent(window.location.href));`;

  return (
    <div className="page-shell">
      <main className="page-main">
        <section className="workspace-shell workspace-shell--centered">
          {/* Header Brand */}
          <header className="workspace-hero">
            <button
              type="button"
              className="brand-lockup cursor-pointer bg-transparent border-0"
              onClick={() => {
                setFeedResult(null);
                setError(null);
                setUrl('');
                inputRef.current?.focus();
              }}
              aria-label="html2rss home"
            >
              <span className="brand-lockup__mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <strong className="brand-lockup__wordmark">html2rss</strong>
            </button>
          </header>

          <div className="workspace-content">
            {/* Bookmarklet instructions banner */}
            {showBookmarkletHelp && (
              <div className="notice" data-tone="neutral">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="notice__title">Bookmarklet</div>
                    <p className="text-sm text-zinc-400 mt-1">
                      Drag the Bookmarklet button from the footer below to your browser&apos;s bookmarks bar.
                      Whenever you are browsing any website, click it to immediately turn that page into an RSS feed here!
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--quiet btn--linkish"
                    onClick={() => setShowBookmarkletHelp(false)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* ERROR NOTICE */}
            {error && (
              <div className="notice" data-tone="error" role="alert">
                <div className="notice__title">Couldn&apos;t create feed</div>
                <p className="text-sm mt-1">{error}</p>
                <div className="mt-2">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => handleCreateFeed()}
                    disabled={isCreating}
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* MAIN FORM / RESULT VIEW */}
            {!feedResult ? (
              <div className="w-full">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateFeed();
                  }}
                  className="w-full"
                >
                  <div className="dominant-field">
                    <label className="field-block" htmlFor="url-input">
                      <span className="ui-eyebrow ui-eyebrow--ghost">URL</span>
                      <input
                        id="url-input"
                        ref={inputRef}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="example.com/articles"
                        value={url}
                        disabled={isCreating}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          if (error) setError(null);
                        }}
                      />
                    </label>
                    <button
                      type="submit"
                      className="dominant-field__action"
                      disabled={isCreating || !url.trim()}
                      aria-label="Create feed"
                    >
                      {isCreating ? (
                        <span className="preview-feedback__spinner" />
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            d="M6 12L10 8L6 4"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </form>

                {/* Advanced Selectors Toggle */}
                <div className="text-center mt-3">
                  <button
                    type="button"
                    className="text-xs text-zinc-500 hover:text-zinc-300 underline bg-transparent border-0 cursor-pointer"
                    onClick={() => setShowAdvancedSelectors(!showAdvancedSelectors)}
                  >
                    {showAdvancedSelectors ? 'Hide Custom CSS Selectors' : 'Custom CSS Selectors (Optional)'}
                  </button>
                </div>

                {showAdvancedSelectors && (
                  <div className="max-w-[38rem] mx-auto mt-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-left grid gap-3">
                    <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                      CSS Selector Extraction
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Items Container Selector</label>
                      <input
                        type="text"
                        className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100"
                        placeholder="e.g. article, .post, .entry-card"
                        value={customItemSelector}
                        onChange={(e) => setCustomItemSelector(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Title Selector</label>
                        <input
                          type="text"
                          className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-100"
                          placeholder="e.g. h2, .title"
                          value={customTitleSelector}
                          onChange={(e) => setCustomTitleSelector(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Link/URL Selector</label>
                        <input
                          type="text"
                          className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-100"
                          placeholder="e.g. a (href)"
                          value={customUrlSelector}
                          onChange={(e) => setCustomUrlSelector(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Description Selector</label>
                        <input
                          type="text"
                          className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-100"
                          placeholder="e.g. p, .summary"
                          value={customDescSelector}
                          onChange={(e) => setCustomDescSelector(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Filtered suggestions while typing */}
                {catalogHits.length > 0 && (
                  <div className="catalog-hit-list">
                    <p className="ui-eyebrow text-zinc-500 mb-2">Matching feeds</p>
                    {catalogHits.map((entry) => (
                      <div
                        key={entry.url}
                        className="catalog-hit"
                        onClick={() => {
                          setUrl(entry.url);
                          handleCreateFeed(entry.url);
                        }}
                      >
                        <span className="catalog-hit__title">{entry.title}</span>
                        <span className="catalog-hit__excerpt">{entry.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Starter feeds when input is empty */}
                {!url && !isCreating && (
                  <div className="mt-8 max-w-[38rem] mx-auto text-left">
                    <p className="ui-eyebrow text-zinc-500 mb-3 text-center">
                      Or pick a starter website
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STARTER_FEEDS.map((feed) => (
                        <div
                          key={feed.url}
                          className="catalog-hit p-3"
                          onClick={() => {
                            setUrl(feed.url);
                            handleCreateFeed(feed.url);
                          }}
                        >
                          <span className="catalog-hit__title text-sm">{feed.title}</span>
                          <span className="catalog-hit__excerpt text-xs line-clamp-1">{feed.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isCreating && (
                  <div className="mt-6 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <span className="preview-feedback__spinner" />
                    <span className="text-sm">Scraping website and generating feed items...</span>
                  </div>
                )}
              </div>
            ) : (
              /* RESULT SCREEN */
              <div className="result-shell">
                <header className="result-header">
                  <p className="ui-eyebrow">Feed ready</p>
                  <h1 className="result-title">{feedResult.feed.name}</h1>
                </header>

                {/* RSS Feed URL Input + Copy button */}
                <div className="dominant-field">
                  <label className="field-block" htmlFor="result-feed-url">
                    <span className="ui-eyebrow ui-eyebrow--ghost">Feed URL</span>
                    <input
                      id="result-feed-url"
                      type="text"
                      readOnly
                      value={`${window.location.origin}${feedResult.feed.public_url}`}
                    />
                  </label>
                  <button
                    type="button"
                    className={`dominant-field__action dominant-field__action--text ${
                      copied ? 'dominant-field__action--soft' : ''
                    }`}
                    onClick={() => handleCopy(`${window.location.origin}${feedResult.feed.public_url}`)}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="ui-actions">
                  <a
                    href={`${window.location.origin}${feedResult.feed.public_url}`}
                    className="btn btn--ghost"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open feed (RSS)
                  </a>
                  <a
                    href={`${window.location.origin}${feedResult.feed.json_public_url}`}
                    className="btn btn--ghost"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open JSON Feed
                  </a>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={handleViewRawXml}
                  >
                    Inspect RSS XML
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={handleDownloadXml}
                  >
                    Download .rss
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet btn--linkish"
                    onClick={() => {
                      setFeedResult(null);
                      setUrl('');
                      inputRef.current?.focus();
                    }}
                  >
                    Create another feed
                  </button>
                </div>

                {/* AI Studio Dev Environment Note */}
                <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-left text-xs text-zinc-400">
                  <div className="font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                    <span>💡 İpucu: Harici RSS Okuyucuları ve 403 Hatası</span>
                  </div>
                  <p className="leading-relaxed">
                    Google AI Studio geliştirme bağlantıları (<code>ais-dev-...</code>) güvenlik nedeniyle yalnızca oturum açmış Google hesabınıza açıktır. Harici bir RSS okuyucusunda (Feedly, Inoreader, Thunderbird vb.) 403 hatası almadan kullanmak için yukarıdaki <strong>Download .rss</strong> ile dosyayı indirebilir veya akışı <strong>Inspect RSS XML</strong> ile anında görüntüleyebilirsiniz.
                  </p>
                </div>

                {/* Live Feed Preview Items */}
                <div className="mt-6 text-left">
                  <p className="ui-eyebrow mb-2">
                    Feed preview ({feedResult.preview.items.length} items)
                  </p>
                  <ul className="ui-item-list" role="list">
                    {feedResult.preview.items.map((item, idx) => (
                      <li key={`${item.url}-${idx}`} className="ui-item">
                        {item.publishedLabel && (
                          <p className="ui-item__meta">
                            <time>{item.publishedLabel}</time>
                          </p>
                        )}
                        <h2 className="ui-item__title">
                          <a href={item.url} target="_blank" rel="noopener noreferrer">
                            {item.title}
                          </a>
                        </h2>
                        {item.description && <p className="ui-item__excerpt">{item.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* FOOTER UTILITY STRIP */}
      <footer className="app-footer">
        <div className="app-footer__inner">
          <div className="utility-strip">
            <div className="utility-strip__items">
              <a
                href="https://html2rss.github.io/feed-directory/"
                target="_blank"
                rel="noopener noreferrer"
                className="utility-link"
              >
                Browse Feed Directory
              </a>

              <a
                href={bookmarkletCode}
                className="utility-link cursor-grab"
                title="Drag this bookmarklet to your bookmarks bar"
                onClick={(e) => {
                  e.preventDefault();
                  setShowBookmarkletHelp(true);
                }}
              >
                Bookmarklet
              </a>

              {accessToken ? (
                <button
                  type="button"
                  className="utility-button text-red-400"
                  onClick={() => {
                    setAccessToken('');
                    try {
                      localStorage.removeItem('html2rss_access_token');
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Clear Access Token
                </button>
              ) : (
                <button
                  type="button"
                  className="utility-button"
                  onClick={() => {
                    setTokenDraft(accessToken);
                    setShowTokenDialog(true);
                  }}
                >
                  Set Access Token
                </button>
              )}

              <a
                href="https://hub.docker.com/r/html2rss/web"
                target="_blank"
                rel="noopener noreferrer"
                className="utility-link"
              >
                Install from Docker Hub
              </a>

              <a
                href="/openapi.yaml"
                target="_blank"
                rel="noopener noreferrer"
                className="utility-link"
              >
                OpenAPI spec
              </a>

              <a
                href="https://github.com/html2rss/html2rss-web"
                target="_blank"
                rel="noopener noreferrer"
                className="utility-link"
              >
                Source code
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Access Token Dialog */}
      {showTokenDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="token-dialog">
            <h3 className="text-lg font-bold text-white mb-2">Access Token</h3>
            <p className="text-xs text-zinc-400 mb-4">
              If this instance requires an access token (HTML2RSS_ACCESS_TOKEN), enter it here.
            </p>
            <input
              type="password"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:border-amber-500"
              placeholder="Paste HTML2RSS_ACCESS_TOKEN"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => setShowTokenDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSaveToken}
              >
                Save Token
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw RSS XML Modal */}
      {showRawXmlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                <h3 className="text-sm font-semibold text-zinc-100 font-mono">
                  RSS 2.0 XML ({feedResult?.feed.name})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn--ghost text-xs"
                  onClick={() => handleCopy(rawXmlContent)}
                >
                  {copied ? 'Copied XML!' : 'Copy XML'}
                </button>
                <button
                  type="button"
                  className="btn btn--quiet text-xs"
                  onClick={() => setShowRawXmlModal(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-black/60">
              {isLoadingXml ? (
                <div className="flex items-center justify-center h-48 text-zinc-400 gap-2">
                  <span className="preview-feedback__spinner" />
                  <span className="text-sm">Fetching generated XML...</span>
                </div>
              ) : (
                <pre className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre select-all">
                  {rawXmlContent}
                </pre>
              )}
            </div>

            <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/30 flex justify-between items-center text-xs text-zinc-500">
              <span>Standard RSS 2.0 with &lt;?xml-stylesheet href=&quot;/rss.xsl&quot;?&gt;</span>
              <button
                type="button"
                className="btn btn--primary text-xs"
                onClick={handleDownloadXml}
              >
                Download .rss File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
