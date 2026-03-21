'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ArrowLeft } from 'lucide-react';
import { isAuthenticated } from '@/lib/supabase-admin';
import { loadStreams, loadStreamers } from '@/lib/supabase-data';
import {
  extractChannelInput,
  fetchChannelUploads,
  ChannelInfo,
  ChannelVideo,
} from '@/lib/youtube-api';

function ChannelBrowserInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authenticated, setAuthenticated] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [importedVideoIds, setImportedVideoIds] = useState<Set<string>>(new Set());
  const [streamers, setStreamers] = useState<{ channelId: string; handle: string; displayName: string; avatarUrl: string }[]>([]);
  const [selectedFromCards, setSelectedFromCards] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/admin/login'); return; }
    setAuthenticated(true);
    loadStreams().then(streams => {
      setImportedVideoIds(new Set(streams.map(s => s.videoId)));
    }).catch(() => {/* non-critical */});
    loadStreamers().then(setStreamers).catch(() => {/* non-critical */});
    // Auto-load channel if ?url= param present (e.g. navigating back from discover)
    const urlParam = searchParams.get('url') ? decodeURIComponent(searchParams.get('url')!) : null;
    if (urlParam) {
      setUrlInput(urlParam);
      setSelectedFromCards(true);
      const input = extractChannelInput(urlParam.trim());
      if (input) {
        setLoading(true);
        fetchChannelUploads(input, page => setLoadingPage(page)).then(result => {
          setChannel(result.channel);
          setVideos(result.videos);
          if (result.partialError) setPartialError(`部分載入失敗：${result.partialError}`);
        }).catch(err => {
          setError(err instanceof Error ? err.message : String(err));
        }).finally(() => {
          setLoading(false);
          setLoadingPage(0);
        });
      }
    }
  }, [router, searchParams]);

  async function handleSearch() {
    setError(null);
    setPartialError(null);
    setChannel(null);
    setVideos([]);
    const input = extractChannelInput(urlInput.trim());
    if (!input) {
      setError('請輸入有效的 YouTube 頻道網址（例：youtube.com/@handle）');
      return;
    }
    setLoading(true);
    try {
      const result = await fetchChannelUploads(input, page => setLoadingPage(page));
      setChannel(result.channel);
      setVideos(result.videos);
      if (result.partialError) setPartialError(`部分載入失敗：${result.partialError}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadingPage(0);
    }
  }

  function handleBackToCards() {
    setChannel(null);
    setVideos([]);
    setUrlInput('');
    setError(null);
    setPartialError(null);
    setSelectedFromCards(false);
  }

  function handleSelectStreamer(channelId: string) {
    const url = `https://www.youtube.com/channel/${channelId}`;
    setUrlInput(url);
    setError(null);
    setPartialError(null);
    setChannel(null);
    setVideos([]);
    setSelectedFromCards(true);
    const input = extractChannelInput(url);
    if (!input) return;
    setLoading(true);
    fetchChannelUploads(input, page => setLoadingPage(page))
      .then(result => {
        setChannel(result.channel);
        setVideos(result.videos);
        if (result.partialError) setPartialError(`部分載入失敗：${result.partialError}`);
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => { setLoading(false); setLoadingPage(0); });
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fff0f5] via-[#f0f8ff] to-[#e6e6fa]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-white/60 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-slate-700">瀏覽頻道歌回</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* URL input */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 p-6">
          <label className="block text-sm font-medium text-slate-600 mb-2">YouTube 頻道網址</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="https://www.youtube.com/@mizukiTW"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
              data-testid="channel-url-input"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !urlInput.trim()}
              className="px-4 py-2.5 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              data-testid="channel-search-button"
            >
              <Search className="w-4 h-4" />
              搜尋
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600" data-testid="channel-error">{error}</p>
          )}
        </div>

        {/* Streamer quick-select */}
        {streamers.length > 0 && !channel && !loading && !selectedFromCards && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">已知頻道</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {streamers.map(s => (
                <button
                  key={s.channelId}
                  onClick={() => handleSelectStreamer(s.channelId)}
                  className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-pink-200 transition-all group"
                >
                  {s.avatarUrl ? (
                    <img src={s.avatarUrl} alt={s.displayName} className="w-14 h-14 rounded-full object-cover ring-2 ring-white group-hover:ring-pink-200 transition-all" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-200 to-blue-200 flex items-center justify-center text-white text-xl font-bold">
                      {s.displayName[0]}
                    </div>
                  )}
                  <p className="text-sm font-medium text-slate-700 text-center leading-tight">{s.displayName}</p>
                  {s.handle && <p className="text-xs text-slate-400">{s.handle}</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-8 text-slate-500 text-sm" data-testid="channel-loading">
            載入中... (第 {loadingPage} 頁)
          </div>
        )}

        {/* Partial error warning */}
        {partialError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700">
            ⚠️ {partialError}（已顯示部分結果）
          </div>
        )}

        {/* Channel header */}
        {channel && (
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 p-4 flex items-center gap-4" data-testid="channel-header">
            {selectedFromCards && (
              <button
                onClick={handleBackToCards}
                className="shrink-0 flex items-center gap-1 text-sm text-pink-400 hover:text-pink-600 transition-colors"
                data-testid="back-to-cards-button"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </button>
            )}
            {channel.avatarUrl && (
              <img src={channel.avatarUrl} alt={channel.displayName} className="w-14 h-14 rounded-full object-cover" />
            )}
            <div>
              <p className="font-semibold text-slate-800">{channel.displayName}</p>
              {channel.handle && <p className="text-sm text-slate-500">{channel.handle}</p>}
              <p className="text-sm text-slate-500 mt-0.5">找到 {videos.length} 部歌回直播</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {channel && videos.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 text-sm" data-testid="channel-empty">
            此頻道目前沒有符合的歌回直播
          </div>
        )}

        {/* Stream list */}
        {videos.length > 0 && (
          <div className="space-y-3" data-testid="channel-stream-list">
            {videos.map(video => {
              const isImported = importedVideoIds.has(video.videoId);
              const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
              return (
                <div
                  key={video.videoId}
                  className="bg-white/80 backdrop-blur-xl rounded-xl shadow-sm border border-white/60 p-4 flex items-center gap-4"
                  data-testid={`channel-stream-${video.videoId}`}
                >
                  {video.thumbnailUrl && (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-24 h-[54px] object-cover rounded-lg shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{video.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{video.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isImported && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                        已匯入
                      </span>
                    )}
                    <button
                      onClick={() => router.push(`/admin/discover?url=${encodeURIComponent(youtubeUrl)}&from=channel&channelUrl=${encodeURIComponent(urlInput)}`)}
                      className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
                      data-testid={`import-btn-${video.videoId}`}
                    >
                      匯入
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ChannelBrowserPage() {
  return (
    <Suspense>
      <ChannelBrowserInner />
    </Suspense>
  );
}
