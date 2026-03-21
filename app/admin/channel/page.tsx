'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowLeft } from 'lucide-react';
import { isAuthenticated } from '@/lib/supabase-admin';
import { loadStreams } from '@/lib/supabase-data';
import {
  extractChannelInput,
  fetchChannelUploads,
  ChannelInfo,
  ChannelVideo,
} from '@/lib/youtube-api';

export default function ChannelBrowserPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [importedVideoIds, setImportedVideoIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/admin/login'); return; }
    setAuthenticated(true);
    loadStreams().then(streams => {
      setImportedVideoIds(new Set(streams.map(s => s.videoId)));
    }).catch(() => {/* non-critical */});
  }, [router]);

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
                      onClick={() => router.push(`/admin/discover?url=${encodeURIComponent(youtubeUrl)}`)}
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
