import React, { useState, useEffect, useRef, useMemo } from 'react';

interface FeedRecord {
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

interface FeedItem {
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  publishedLabel?: string;
  excerpt?: string;
  imageUrl?: string;
  category?: string;
}

interface PermanentFeedItem {
  id: string;
  slug: string;
  name: string;
  url: string;
  description: string;
  topicFilter?: string;
  aiSummarize?: boolean;
  itemCount: number;
  lastScrapedAt: string;
  createdAt: string;
  public_url: string;
  json_public_url: string;
  full_rss_url: string;
  full_json_url: string;
}

const STARTER_FEEDS = [
  {
    title: 'T.C. Tarım ve Orman Bakanlığı',
    url: 'https://www.tarimorman.gov.tr',
    description: 'Güncel tarım, hayvancılık, orman haberleri ve resmi duyurular.',
  },
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
  const [activeTab, setActiveTab] = useState<'instant' | 'ai' | 'saved'>('instant');
  const [url, setUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedResult, setFeedResult] = useState<{
    feed: FeedRecord;
    preview: { channel: { title: string; url: string; description: string }; items: FeedItem[] };
    isPermanent?: boolean;
  } | null>(null);

  // AI Generation State
  const [aiTopicFilter, setAiTopicFilter] = useState('');
  const [aiCustomSlug, setAiCustomSlug] = useState('');
  const [aiFeedName, setAiFeedName] = useState('');
  const [aiSummarize, setAiSummarize] = useState(true);

  // Permanent Feeds List
  const [permanentFeeds, setPermanentFeeds] = useState<PermanentFeedItem[]>([]);
  const [isLoadingPermanent, setIsLoadingPermanent] = useState(false);

  // Slug inline edit state
  const [isEditingSlug, setIsEditingSlug] = useState(false);
  const [editSlugValue, setEditSlugValue] = useState('');
  const [slugEditError, setSlugEditError] = useState<string | null>(null);
  const [isSavingSlug, setIsSavingSlug] = useState(false);

  // UI Modals & Helpers
  const [copied, setCopied] = useState<string | false>(false);
  const [showRawXmlModal, setShowRawXmlModal] = useState(false);
  const [rawXmlContent, setRawXmlContent] = useState('');
  const [isLoadingXml, setIsLoadingXml] = useState(false);
  const [showBookmarkletHelp, setShowBookmarkletHelp] = useState(false);
  const [showAdvancedSelectors, setShowAdvancedSelectors] = useState(false);
  const [customItemSelector, setCustomItemSelector] = useState('');
  const [customTitleSelector, setCustomTitleSelector] = useState('');
  const [customUrlSelector, setCustomUrlSelector] = useState('');
  const [customDescSelector, setCustomDescSelector] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch permanent feeds on mount
  const fetchPermanentFeeds = async () => {
    setIsLoadingPermanent(true);
    try {
      const res = await fetch('/api/v1/feeds/permanent');
      const data = await res.json();
      if (data.success && data.data?.feeds) {
        setPermanentFeeds(data.data.feeds);
      }
    } catch (err) {
      console.error('Error fetching permanent feeds:', err);
    } finally {
      setIsLoadingPermanent(false);
    }
  };

  useEffect(() => {
    fetchPermanentFeeds();

    // Check URL query parameter on mount (e.g. from bookmarklet)
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

  // Standard Feed Creation (Now auto-creates clean permanent feeds)
  const handleCreateFeed = async (targetUrl?: string) => {
    const rawUrl = (targetUrl || url).trim();
    if (!rawUrl) {
      setError('Lütfen bir URL adresi girin.');
      return;
    }

    let normalized = rawUrl;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    setIsCreating(true);
    setError(null);

    try {
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Akış oluşturulamadı. Lütfen URL adresini kontrol edin.");
      }

      setFeedResult({
        ...data.data,
        isPermanent: true,
      });
      setEditSlugValue(data.data.feed.slug || data.data.feed.id);
      setIsEditingSlug(false);
      fetchPermanentFeeds();
    } catch (err: any) {
      setError(err.message || 'Akış oluşturma işlemi tamamlanamadı.');
    } finally {
      setIsCreating(false);
    }
  };

  // AI-Powered Permanent Feed Creation
  const handleCreateAiFeed = async () => {
    const rawUrl = url.trim();
    if (!rawUrl) {
      setError('Lütfen kaynak web sitesi URL adresini girin.');
      return;
    }

    let normalized = rawUrl;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    setIsCreating(true);
    setError(null);

    try {
      const bodyPayload = {
        url: normalized,
        name: aiFeedName.trim() || undefined,
        slug: aiCustomSlug.trim() || undefined,
        topicFilter: aiTopicFilter.trim() || undefined,
        aiSummarize,
      };

      const res = await fetch('/api/v1/feeds/permanent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Yapay zeka ile akış oluşturulamadı.');
      }

      setFeedResult({
        ...data.data,
        isPermanent: true,
      });
      setEditSlugValue(data.data.feed.slug || data.data.feed.id);
      setIsEditingSlug(false);
      fetchPermanentFeeds();
    } catch (err: any) {
      setError(err.message || 'Yapay zeka akış oluşturma hatası.');
    } finally {
      setIsCreating(false);
    }
  };

  // Rename current feed's slug
  const handleRenameSlug = async () => {
    if (!feedResult) return;
    const currentSlug = feedResult.feed.slug || feedResult.feed.id;
    const newSlug = slugify(editSlugValue);

    if (!newSlug || newSlug === currentSlug) {
      setIsEditingSlug(false);
      return;
    }

    setIsSavingSlug(true);
    setSlugEditError(null);

    try {
      const res = await fetch('/api/v1/feeds/permanent/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldSlug: currentSlug, newSlug }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Kısa ad güncellenemedi.');
      }

      setFeedResult((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          feed: {
            ...prev.feed,
            id: newSlug,
            slug: newSlug,
            feed_token: newSlug,
            public_url: `/feeds/${newSlug}.rss`,
            json_public_url: `/feeds/${newSlug}.json`,
          },
        };
      });
      setIsEditingSlug(false);
      fetchPermanentFeeds();
    } catch (err: any) {
      setSlugEditError(err.message || 'Kısa ad değiştirilemedi.');
    } finally {
      setIsSavingSlug(false);
    }
  };

  // Delete permanent feed
  const handleDeletePermanentFeed = async (slug: string) => {
    if (!confirm(`"${slug}" kalıcı akışını silmek istediğinize emin misiniz?`)) return;
    try {
      await fetch(`/api/v1/feeds/permanent/${slug}`, { method: 'DELETE' });
      fetchPermanentFeeds();
      if (feedResult && (feedResult.feed.slug === slug || feedResult.feed.id === slug)) {
        setFeedResult(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopy = async (text: string, key = 'default') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleViewRawXml = async (feedUrl?: string) => {
    const target = feedUrl || feedResult?.feed.public_url;
    if (!target) return;
    setIsLoadingXml(true);
    setShowRawXmlModal(true);
    try {
      const res = await fetch(target);
      const text = await res.text();
      setRawXmlContent(text);
    } catch (err: any) {
      setRawXmlContent('XML yüklenirken hata oluştu: ' + err.message);
    } finally {
      setIsLoadingXml(false);
    }
  };

  const handleDownloadXml = async (feedUrl?: string, fileName?: string) => {
    const target = feedUrl || feedResult?.feed.public_url;
    if (!target) return;
    try {
      const res = await fetch(target);
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/rss+xml;charset=utf-8' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${fileName || feedResult?.feed.slug || feedResult?.feed.id || 'feed'}.rss`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);
    } catch (err: any) {
      console.error(err);
    }
  };

  const bookmarkletCode = `javascript:window.location.assign('${window.location.origin}/?url='+encodeURIComponent(window.location.href));`;

  function slugify(text: string): string {
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

  // Calculate public shared URL if in Google Cloud AI Studio dev environment
  const currentOrigin = window.location.origin;
  const isGoogleDevEnv = currentOrigin.includes('ais-dev-');
  const sharedPublicOrigin = isGoogleDevEnv
    ? currentOrigin.replace('ais-dev-', 'ais-pre-')
    : currentOrigin;

  const currentSlug = feedResult?.feed.slug || feedResult?.feed.feed_token || 'feed';
  const permanentRssUrl = `${currentOrigin}/feeds/${currentSlug}.rss`;
  const permanentSharedRssUrl = `${sharedPublicOrigin}/feeds/${currentSlug}.rss`;
  const permanentJsonUrl = `${currentOrigin}/feeds/${currentSlug}.json`;

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
            {/* Top Navigation Tabs */}
            {!feedResult && (
              <div className="flex items-center justify-center gap-1.5 p-1 bg-zinc-900/80 border border-zinc-800 rounded-full max-w-md mx-auto w-full mb-3 text-xs">
                <button
                  type="button"
                  className={`flex-1 py-1.5 px-3 rounded-full font-medium transition-colors ${
                    activeTab === 'instant'
                      ? 'bg-amber-500 text-black font-semibold shadow'
                      : 'text-zinc-400 hover:text-white bg-transparent'
                  }`}
                  onClick={() => {
                    setActiveTab('instant');
                    setError(null);
                  }}
                >
                  ⚡ Hızlı Akış Oluştur
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1.5 px-3 rounded-full font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'ai'
                      ? 'bg-amber-500 text-black font-semibold shadow'
                      : 'text-zinc-400 hover:text-white bg-transparent'
                  }`}
                  onClick={() => {
                    setActiveTab('ai');
                    setError(null);
                  }}
                >
                  <span>🤖 Yapay Zeka (AI)</span>
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1.5 px-3 rounded-full font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'saved'
                      ? 'bg-amber-500 text-black font-semibold shadow'
                      : 'text-zinc-400 hover:text-white bg-transparent'
                  }`}
                  onClick={() => {
                    setActiveTab('saved');
                    setError(null);
                    fetchPermanentFeeds();
                  }}
                >
                  <span>📁 Kalıcı Akışlarım ({permanentFeeds.length})</span>
                </button>
              </div>
            )}

            {/* Bookmarklet instructions banner */}
            {showBookmarkletHelp && (
              <div className="notice" data-tone="neutral">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="notice__title">Bookmarklet (Tarayıcı Butonu)</div>
                    <p className="text-sm text-zinc-400 mt-1">
                      Aşağıdaki Bookmarklet bağlantısını tarayıcınızın yer imleri çubuğuna sürükleyip bırakın.
                      Herhangi bir web sayfasını gezerken butona tıklayarak anında o sayfayı RSS akışına dönüştürebilirsiniz!
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--quiet btn--linkish"
                    onClick={() => setShowBookmarkletHelp(false)}
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}

            {/* ERROR NOTICE */}
            {error && (
              <div className="notice" data-tone="error" role="alert">
                <div className="notice__title">Akış Oluşturulamadı</div>
                <p className="text-sm mt-1">{error}</p>
                <div className="mt-2">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => (activeTab === 'ai' ? handleCreateAiFeed() : handleCreateFeed())}
                    disabled={isCreating}
                  >
                    Tekrar Dene
                  </button>
                </div>
              </div>
            )}

            {/* MAIN CONTENT VIEW */}
            {!feedResult ? (
              activeTab === 'saved' ? (
                /* TAB 3: PERMANENT FEEDS DIRECTORY */
                <div className="w-full max-w-2xl mx-auto text-left">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-white">Kalıcı ve Otomatik Güncellenen Akışlarınız</h2>
                      <p className="text-xs text-zinc-400">
                        Bu akışlar sunucuda kalıcı linklere sahiptir ve RSS okuyucunuz her ziyaret ettiğinde otomatik güncellenir.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost text-xs"
                      onClick={fetchPermanentFeeds}
                      disabled={isLoadingPermanent}
                    >
                      {isLoadingPermanent ? 'Yenileniyor...' : 'Yenile'}
                    </button>
                  </div>

                  {permanentFeeds.length === 0 ? (
                    <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl text-zinc-500 text-sm">
                      Henüz oluşturulmuş kalıcı bir akış bulunmuyor.
                      <div className="mt-3">
                        <button
                          type="button"
                          className="btn btn--primary text-xs"
                          onClick={() => setActiveTab('instant')}
                        >
                          ⚡ İlk Akışınızı Oluşturun
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {permanentFeeds.map((feed) => (
                        <div
                          key={feed.slug}
                          className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col gap-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white text-sm">{feed.name}</span>
                                {feed.topicFilter && (
                                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                                    AI Filtreli
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-400 mt-0.5">{feed.description}</p>
                              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-400 font-mono">
                                <span>Kaynak: {new URL(feed.url).hostname}</span>
                                <span>•</span>
                                <span className="text-amber-400 font-semibold">/feeds/{feed.slug}.rss</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="text-zinc-500 hover:text-red-400 text-xs px-2 py-1 bg-transparent border-0 cursor-pointer"
                              title="Akışı Sil"
                              onClick={() => handleDeletePermanentFeed(feed.slug)}
                            >
                              Sil
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/60">
                            <button
                              type="button"
                              className="btn btn--primary text-xs"
                              onClick={() => handleCopy(`${window.location.origin}/feeds/${feed.slug}.rss`, feed.slug)}
                            >
                              {copied === feed.slug ? 'Kopyalandı!' : 'Kalıcı RSS URL Kopyala'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost text-xs"
                              onClick={() => handleViewRawXml(`/feeds/${feed.slug}.rss`)}
                            >
                              XML İncele
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost text-xs"
                              onClick={() => handleDownloadXml(`/feeds/${feed.slug}.rss`, feed.slug)}
                            >
                              .rss İndir
                            </button>
                            <a
                              href={`${window.location.origin}/feeds/${feed.slug}.json`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn--quiet text-xs"
                            >
                              JSON Feed
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === 'ai' ? (
                /* TAB 2: AI-POWERED SMART FEED CREATOR */
                <div className="w-full max-w-xl mx-auto text-left">
                  <div className="mb-4 text-center">
                    <span className="ui-eyebrow text-amber-500">Ücretsiz & Keyless Gemini 3.8 Flash</span>
                    <h2 className="text-xl font-bold text-white mt-1">Yapay Zeka Destekli Akıllı Akış</h2>
                    <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                      Doğal dille konu filtresi belirleyin, karmaşık siteleri gürültüsüz haber akışına dönüştürün ve kalıcı link elde edin.
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateAiFeed();
                    }}
                    className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 grid gap-4 shadow-xl"
                  >
                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                        Kaynak Web Sitesi URL Adresi <span className="text-amber-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                        placeholder="Örn: https://www.tarimorman.gov.tr"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={isCreating}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block mb-1.5 flex items-center justify-between">
                        <span>🎯 Akıllı Konu Filtresi (Yapay Zeka Sadece Bu Konuları Çıkarır)</span>
                        <span className="text-[10px] text-zinc-500 font-normal">İsteğe Bağlı</span>
                      </label>
                      <input
                        type="text"
                        className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                        placeholder="Örn: Sadece tarımsal hibe, kuraklık ve destekleme duyuruları"
                        value={aiTopicFilter}
                        onChange={(e) => setAiTopicFilter(e.target.value)}
                        disabled={isCreating}
                      />
                      <span className="text-[11px] text-zinc-500 mt-1 block">
                        Yapay zeka sayfadaki yüzlerce bağlantı arasından yalnızca bu temaya uyan haberleri seçer.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                          Kalıcı Akış Kısa Adı (Slug)
                        </label>
                        <input
                          type="text"
                          className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                          placeholder="Otomatik (Örn: tarim-destekleri)"
                          value={aiCustomSlug}
                          onChange={(e) => setAiCustomSlug(e.target.value)}
                          disabled={isCreating}
                        />
                        <span className="text-[10px] text-zinc-500 mt-0.5 block">
                          URL: /feeds/{aiCustomSlug ? slugify(aiCustomSlug) : 'otomatik-kisa-ad'}.rss
                        </span>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                          Akış Başlığı (İsteğe Bağlı)
                        </label>
                        <input
                          type="text"
                          className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                          placeholder="Örn: Tarım Destekleme Bülteni"
                          value={aiFeedName}
                          onChange={(e) => setAiFeedName(e.target.value)}
                          disabled={isCreating}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="ai-summarize-check"
                        className="rounded border-zinc-700 text-amber-500 focus:ring-0 cursor-pointer"
                        checked={aiSummarize}
                        onChange={(e) => setAiSummarize(e.target.checked)}
                      />
                      <label htmlFor="ai-summarize-check" className="text-xs text-zinc-300 cursor-pointer select-none">
                        Haberleri yapay zeka ile otomatik özetle ve başlıkları temizle
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="btn btn--primary w-full py-3 mt-1 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                      disabled={isCreating || !url.trim()}
                    >
                      {isCreating ? (
                        <>
                          <span className="preview-feedback__spinner" />
                          <span>Gemini Sayfayı Analiz Ediyor &amp; Filtreliyor...</span>
                        </>
                      ) : (
                        <span>✨ Yapay Zeka ile Akışı Oluştur ve Kaydet</span>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                /* TAB 1: INSTANT URL SCRAPER */
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
                          placeholder="tarimorman.gov.tr veya site.com/haberler"
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
                      {showAdvancedSelectors ? 'Özel CSS Seçicilerini Gizle' : 'Özel CSS Seçicileri (İsteğe Bağlı)'}
                    </button>
                  </div>

                  {showAdvancedSelectors && (
                    <div className="max-w-[38rem] mx-auto mt-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-left grid gap-3">
                      <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                        CSS Seçici Yapılandırması
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Öğe Taşıyıcı Seçici (Items Container)</label>
                        <input
                          type="text"
                          className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100"
                          placeholder="Örn: article, .post, .entry-card"
                          value={customItemSelector}
                          onChange={(e) => setCustomItemSelector(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-zinc-400 block mb-1">Başlık Seçici</label>
                          <input
                            type="text"
                            className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-100"
                            placeholder="Örn: h2, .title"
                            value={customTitleSelector}
                            onChange={(e) => setCustomTitleSelector(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 block mb-1">Bağlantı/URL Seçici</label>
                          <input
                            type="text"
                            className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-100"
                            placeholder="Örn: a (href)"
                            value={customUrlSelector}
                            onChange={(e) => setCustomUrlSelector(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400 block mb-1">Açıklama Seçici</label>
                          <input
                            type="text"
                            className="w-full text-xs font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-100"
                            placeholder="Örn: p, .summary"
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
                      <p className="ui-eyebrow text-zinc-500 mb-2">Eşleşen Akışlar</p>
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
                        Veya popüler başlangıç sitelerinden birini seçin
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
                      <span className="text-sm">Web sitesi taranıyor ve kalıcı akış hazırlanıyor...</span>
                    </div>
                  )}
                </div>
              )
            ) : (
              /* RESULT SCREEN */
              <div className="result-shell">
                <header className="result-header">
                  <div className="flex items-center gap-2">
                    <p className="ui-eyebrow">Akış Hazır</p>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                      ✓ Kalıcı RSS Akışı
                    </span>
                  </div>
                  <h1 className="result-title">{feedResult.feed.name}</h1>
                </header>

                {/* Dominant RSS Feed URL Input + Copy button */}
                <div className="dominant-field">
                  <label className="field-block" htmlFor="result-feed-url">
                    <span className="ui-eyebrow ui-eyebrow--ghost">Kalıcı RSS Akış URL&apos;si</span>
                    <input
                      id="result-feed-url"
                      type="text"
                      readOnly
                      value={permanentRssUrl}
                    />
                  </label>
                  <button
                    type="button"
                    className={`dominant-field__action dominant-field__action--text ${
                      copied === 'main-feed' ? 'dominant-field__action--soft' : ''
                    }`}
                    onClick={() => handleCopy(permanentRssUrl, 'main-feed')}
                  >
                    {copied === 'main-feed' ? 'Kopyalandı!' : 'Kopyala'}
                  </button>
                </div>

                {/* Inline Slug Customization Widget */}
                <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 text-left text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400 font-medium">Kalıcı Yol (Slug):</span>
                      <code className="text-amber-400 font-mono font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        /feeds/{currentSlug}.rss
                      </code>
                    </div>
                    {!isEditingSlug && (
                      <button
                        type="button"
                        className="text-xs text-amber-400 hover:text-amber-300 underline bg-transparent border-0 cursor-pointer font-medium"
                        onClick={() => {
                          setEditSlugValue(currentSlug);
                          setIsEditingSlug(true);
                          setSlugEditError(null);
                        }}
                      >
                        Kısa Adı Değiştir
                      </button>
                    )}
                  </div>

                  {isEditingSlug && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/80">
                      <label className="text-[11px] text-zinc-400 block mb-1 font-medium">
                        Yeni Kalıcı Kısa Ad (Örn: <code>tarim-haberleri</code>, <code>bakanlik</code>):
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 font-mono text-xs">/feeds/</span>
                        <input
                          type="text"
                          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                          value={editSlugValue}
                          onChange={(e) => setEditSlugValue(e.target.value)}
                          placeholder="ozel-kisa-ad"
                          disabled={isSavingSlug}
                        />
                        <span className="text-zinc-500 font-mono text-xs">.rss</span>
                        <button
                          type="button"
                          className="btn btn--primary text-xs py-1.5 px-3"
                          onClick={handleRenameSlug}
                          disabled={isSavingSlug || !editSlugValue.trim()}
                        >
                          {isSavingSlug ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--quiet text-xs py-1.5 px-2"
                          onClick={() => {
                            setIsEditingSlug(false);
                            setSlugEditError(null);
                          }}
                        >
                          İptal
                        </button>
                      </div>
                      {slugEditError && (
                        <p className="text-red-400 text-[11px] mt-1.5">{slugEditError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="ui-actions">
                  <a
                    href={permanentRssUrl}
                    className="btn btn--ghost"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Akışı Aç (RSS)
                  </a>
                  <a
                    href={permanentJsonUrl}
                    className="btn btn--ghost"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    JSON Feed
                  </a>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => handleViewRawXml(permanentRssUrl)}
                  >
                    XML İncele
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => handleDownloadXml(permanentRssUrl, currentSlug)}
                  >
                    .rss İndir
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => handleCopy(`/feeds/${currentSlug}.rss`, 'short-path')}
                  >
                    {copied === 'short-path' ? 'Kopyalandı!' : 'Kısa Yol Kopyala'}
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
                    Yeni Akış Oluştur
                  </button>
                </div>

                {/* External RSS Reader Guidance */}
                <div className="mt-3 p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-left text-xs text-zinc-300">
                  <div className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
                    <span>📡 Harici RSS Okuyucuları İçin (Feedly, Inoreader, Thunderbird vb.)</span>
                  </div>
                  {isGoogleDevEnv ? (
                    <div className="space-y-2">
                      <p className="text-zinc-400 text-[11px] leading-relaxed">
                        Şu an Google AI Studio geliştirici önizlemesindesiniz. Dış RSS okuyucularınızın şifresiz/doğrudan akışı okuyabilmesi için genel paylaşım bağlantınızı kullanın:
                      </p>
                      <div className="flex items-center gap-2 p-2 bg-black/40 rounded-lg border border-zinc-800/80">
                        <input
                          type="text"
                          readOnly
                          className="flex-1 bg-transparent border-0 font-mono text-[11px] text-amber-400 focus:outline-none select-all"
                          value={permanentSharedRssUrl}
                        />
                        <button
                          type="button"
                          className="btn btn--primary text-[10px] py-1 px-2.5"
                          onClick={() => handleCopy(permanentSharedRssUrl, 'shared-url')}
                        >
                          {copied === 'shared-url' ? 'Kopyalandı!' : 'Genel Linki Kopyala'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      Kalıcı RSS bağlantınız doğrudan <code>{permanentRssUrl}</code> adresindedir. Bu adresi Feedly, Inoreader veya herhangi bir RSS okuyucusuna doğrudan ekleyebilirsiniz.
                    </p>
                  )}
                </div>

                {/* Live Feed Preview Items */}
                <div className="mt-6 text-left">
                  <p className="ui-eyebrow mb-2">
                    Akış Önizlemesi ({feedResult.preview.items.length} Öğe)
                  </p>
                  <ul className="ui-item-list" role="list">
                    {feedResult.preview.items.map((item, idx) => (
                      <li key={`${item.url}-${idx}`} className="ui-item">
                        {item.publishedLabel && (
                          <p className="ui-item__meta">
                            <time>{item.publishedLabel}</time>
                            {item.category && <span className="ml-2 text-amber-500 font-mono text-[10px]">#{item.category}</span>}
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
                Feed Directory
              </a>

              <a
                href={bookmarkletCode}
                className="utility-link cursor-grab"
                title="Bu bookmarklet'i yer imleri çubuğunuza sürükleyin"
                onClick={(e) => {
                  e.preventDefault();
                  setShowBookmarkletHelp(true);
                }}
              >
                Bookmarklet
              </a>

              <button
                type="button"
                className="utility-button text-amber-400 font-medium"
                onClick={() => {
                  setFeedResult(null);
                  setActiveTab('saved');
                  fetchPermanentFeeds();
                }}
              >
                📁 Kalıcı Akışlarım ({permanentFeeds.length})
              </button>

              <a
                href="/openapi.yaml"
                target="_blank"
                rel="noopener noreferrer"
                className="utility-link"
              >
                OpenAPI Spec
              </a>

              <a
                href="https://github.com/html2rss/html2rss-web"
                target="_blank"
                rel="noopener noreferrer"
                className="utility-link"
              >
                Kaynak Kod (GitHub)
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Raw RSS XML Modal */}
      {showRawXmlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                <h3 className="text-sm font-semibold text-zinc-100 font-mono">
                  RSS 2.0 XML ({feedResult?.feed.name || 'Feed'})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn--ghost text-xs"
                  onClick={() => handleCopy(rawXmlContent, 'xml')}
                >
                  {copied === 'xml' ? 'Kopyalandı!' : 'XML Kopyala'}
                </button>
                <button
                  type="button"
                  className="btn btn--quiet text-xs"
                  onClick={() => setShowRawXmlModal(false)}
                >
                  Kapat
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-black/60">
              {isLoadingXml ? (
                <div className="flex items-center justify-center h-48 text-zinc-400 gap-2">
                  <span className="preview-feedback__spinner" />
                  <span className="text-sm">XML Çıktısı Alınıyor...</span>
                </div>
              ) : (
                <pre className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre select-all">
                  {rawXmlContent}
                </pre>
              )}
            </div>

            <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/30 flex justify-between items-center text-xs text-zinc-500">
              <span>Standard RSS 2.0 ile &lt;?xml-stylesheet href=&quot;/rss.xsl&quot;?&gt;</span>
              <button
                type="button"
                className="btn btn--primary text-xs"
                onClick={() => handleDownloadXml()}
              >
                .rss Dosyasını İndir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
