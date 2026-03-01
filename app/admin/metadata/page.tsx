// app/admin/metadata/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Music2,
  Image as ImageIcon,
  FileText,
  Search,
  RefreshCw,
  Check,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Song, SongMetadata, SongLyrics } from '@/lib/types';

interface MetadataStatus {
  songId: string;
  songTitle: string;
  artist: string;
  hasArt: boolean;
  hasLyrics: boolean;
  artStatus?: string;
  lyricsStatus?: string;
}

export default function MetadataPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState<Song[]>([]);
  const [metadata, setMetadata] = useState<SongMetadata[]>([]);
  const [lyrics, setLyrics] = useState<SongLyrics[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetchingAll, setIsFetchingAll] = useState(false);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [filter, setActiveFilter] = useState<'all' | 'missing-art' | 'missing-lyrics'>('all');

  const fetchData = useCallback(async () => {
    try {
      const [songsRes, metaRes, lyricsRes] = await Promise.all([
        fetch('/api/songs'),
        fetch('/api/metadata'),
        fetch('/api/lyrics'),
      ]);
      const [songsData, metaData, lyricsData] = await Promise.all([
        songsRes.json(),
        metaRes.json(),
        lyricsRes.json(),
      ]);
      setSongs(songsData);
      setMetadata(metaData);
      setLyrics(lyricsData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/check', { method: 'POST' })
      .then((res) => {
        if (!res.ok) router.replace('/admin/login');
        else {
          setAuthenticated(true);
          fetchData();
        }
      });
  }, [router, fetchData]);

  const songStatuses: MetadataStatus[] = songs.map(s => {
    const meta = metadata.find(m => m.songId === s.id);
    const lyric = lyrics.find(l => l.songId === s.id);
    return {
      songId: s.id,
      songTitle: s.title,
      artist: s.originalArtist,
      hasArt: !!meta?.albumArtUrl,
      hasLyrics: !!lyric?.syncedLyrics || !!lyric?.plainLyrics,
      artStatus: meta?.fetchStatus,
      lyricsStatus: lyric?.fetchStatus,
    };
  });

  const filteredStatuses = songStatuses.filter(s => {
    const matchesSearch = s.songTitle.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         s.artist.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    
    if (filter === 'missing-art') return !s.hasArt;
    if (filter === 'missing-lyrics') return !s.hasLyrics;
    return true;
  });

  async function fetchMetadata(status: MetadataStatus) {
    if (fetchingIds.has(status.songId)) return;
    
    setFetchingIds(prev => new Set([...prev, status.songId]));
    try {
      const res = await fetch('/api/admin/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: status.songId,
          artist: status.artist,
          title: status.songTitle,
        }),
      });
      if (res.ok) {
        // Just refresh the relevant data
        const [metaRes, lyricsRes] = await Promise.all([
          fetch('/api/metadata'),
          fetch('/api/lyrics'),
        ]);
        const [metaData, lyricsData] = await Promise.all([
          metaRes.json(),
          lyricsRes.json(),
        ]);
        setMetadata(metaData);
        setLyrics(lyricsData);
      }
    } finally {
      setFetchingIds(prev => {
        const next = new Set(prev);
        next.delete(status.songId);
        return next;
      });
    }
  }

  async function fetchAllMissing() {
    const missing = songStatuses.filter(s => !s.hasArt || !s.hasLyrics);
    if (missing.length === 0) return;
    
    setIsFetchingAll(true);
    // Fetch in batches of 3 to avoid rate limits
    for (let i = 0; i < missing.length; i++) {
      await fetchMetadata(missing[i]);
      // Small delay between requests
      if (i % 3 === 0) await new Promise(r => setTimeout(res => r(res), 1000));
    }
    setIsFetchingAll(false);
  }

  if (!authenticated || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold text-slate-800">中繼資料管理</h1>
          </div>
          
          <button
            onClick={fetchAllMissing}
            disabled={isFetchingAll}
            className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-xl hover:bg-pink-600 disabled:opacity-50 transition-all shadow-md"
          >
            {isFetchingAll ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            擷取所有缺失資料
          </button>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="搜尋歌曲或原唱..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-300"
            />
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'all' ? 'bg-white shadow-sm text-pink-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveFilter('missing-art')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'missing-art' ? 'bg-white shadow-sm text-pink-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              缺封面
            </button>
            <button
              onClick={() => setActiveFilter('missing-lyrics')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'missing-lyrics' ? 'bg-white shadow-sm text-pink-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              缺歌詞
            </button>
          </div>
        </div>

        {/* Songs List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">歌曲資訊</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">專輯封面</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">動態歌詞</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStatuses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    找不到符合條件的歌曲
                  </td>
                </tr>
              ) : (
                filteredStatuses.map(status => (
                  <tr key={status.songId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-800 text-sm">{status.songTitle}</p>
                      <p className="text-xs text-slate-400">{status.artist}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {status.hasArt ? (
                          <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                            <Check size={14} /> 已取得
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                            {status.artStatus === 'no_match' ? '無相符' : status.artStatus === 'error' ? '發生錯誤' : '未擷取'}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {status.hasLyrics ? (
                          <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                            <Check size={14} /> 已取得
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                            {status.lyricsStatus === 'no_match' ? '無相符' : status.lyricsStatus === 'error' ? '發生錯誤' : '未擷取'}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => fetchMetadata(status)}
                        disabled={fetchingIds.has(status.songId)}
                        className={`p-2 rounded-lg transition-colors ${
                          fetchingIds.has(status.songId)
                            ? 'text-slate-300'
                            : 'text-slate-400 hover:text-pink-500 hover:bg-pink-50'
                        }`}
                        title="重新擷取"
                      >
                        {fetchingIds.has(status.songId) ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <RefreshCw size={18} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
