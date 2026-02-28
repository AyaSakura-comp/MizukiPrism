// app/admin/discover/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Download, Check, Edit2, Trash2, Plus, AlertCircle } from 'lucide-react';

interface VideoInfo {
  videoId: string;
  title: string;
  date: string;
  description: string;
  durationSeconds: number;
}

interface ExtractedSong {
  orderIndex: number;
  songName: string;
  artist: string;
  startSeconds: number;
  endSeconds: number | null;
  startTimestamp: string;
  endTimestamp: string | null;
  suspicious: boolean;
}

type Step = 'input' | 'extracting' | 'review' | 'importing' | 'done';

export default function DiscoverPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [songs, setSongs] = useState<ExtractedSong[]>([]);
  const [extractionSource, setExtractionSource] = useState<string | null>(null);
  const [commentAuthor, setCommentAuthor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  // Auth check
  useEffect(() => {
    fetch('/api/auth/check', { method: 'POST' })
      .then((res) => {
        if (!res.ok) router.replace('/admin/login');
        else setAuthenticated(true);
      });
  }, [router]);

  // Step 1: Fetch video info
  async function handleFetchVideo() {
    setError(null);
    try {
      const res = await fetch('/api/admin/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVideoInfo(data);
      setStep('extracting');
      handleExtract(data.videoId);
    } catch (err) {
      setError(String(err));
    }
  }

  // Step 2: Extract songs from comments
  async function handleExtract(videoId: string) {
    try {
      const res = await fetch('/api/admin/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSongs(data.songs || []);
      setExtractionSource(data.source);
      setCommentAuthor(data.commentAuthor || null);

      if (data.songs?.length > 0) {
        setStep('review');
      } else {
        setPasteMode(true);
        setStep('review');
      }
    } catch (err) {
      setError(String(err));
      setPasteMode(true);
      setStep('review');
    }
  }

  // Extract from pasted text
  async function handlePasteExtract() {
    try {
      const res = await fetch('/api/admin/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText }),
      });
      const data = await res.json();
      setSongs(data.songs || []);
      setExtractionSource('text');
      setPasteMode(false);
    } catch (err) {
      setError(String(err));
    }
  }

  // Step 3: Import approved songs
  async function handleImport() {
    if (!videoInfo) return;
    setStep('importing');
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: videoInfo.videoId,
          title: videoInfo.title,
          date: videoInfo.date,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoInfo.videoId}`,
          songs: songs.map((s) => ({
            songName: s.songName,
            artist: s.artist,
            startSeconds: s.startSeconds,
            endSeconds: s.endSeconds,
          })),
          credit: commentAuthor ? {
            author: commentAuthor,
            authorUrl: '',
          } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportResult(data);
      setStep('done');

      // Auto-fetch metadata for new songs (fire and forget)
      fetchMetadataForNewSongs(songs);
    } catch (err) {
      setError(String(err));
      setStep('review');
    }
  }

  // Background metadata fetch
  async function fetchMetadataForNewSongs(songList: ExtractedSong[]) {
    for (const song of songList) {
      try {
        await fetch('/api/admin/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: '', // Will be matched by title+artist in the API
            artist: song.artist,
            title: song.songName,
          }),
        });
      } catch {
        // Non-critical, continue with next song
      }
    }
  }

  // Edit song inline
  function updateSong(index: number, field: string, value: string) {
    setSongs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function removeSong(index: number) {
    setSongs((prev) => prev.filter((_, i) => i !== index));
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-blue-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-blue-400 bg-clip-text text-transparent">
            匯入歌曲
          </h1>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Step 1: URL Input */}
        {step === 'input' && (
          <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
            <h2 className="text-lg font-semibold mb-4">貼上 YouTube 影片連結</h2>
            <div className="flex gap-2">
              <input
                data-testid="discover-url-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchVideo()}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
              <button
                data-testid="discover-fetch-button"
                onClick={handleFetchVideo}
                className="px-6 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90 flex items-center gap-2"
              >
                <Search size={16} />
                取得資訊
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Extracting */}
        {step === 'extracting' && videoInfo && (
          <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
            <h2 className="text-lg font-semibold mb-2">{videoInfo.title}</h2>
            <p className="text-gray-500 mb-4">{videoInfo.date}</p>
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-spin h-4 w-4 border-2 border-pink-400 border-t-transparent rounded-full" />
              正在從留言中擷取歌曲...
            </div>
          </div>
        )}

        {/* Step 3: Review extracted songs */}
        {step === 'review' && videoInfo && (
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
              <h2 className="text-lg font-semibold mb-1">{videoInfo.title}</h2>
              <p className="text-gray-500 text-sm mb-3">{videoInfo.date}</p>
              {extractionSource && (
                <p className="text-sm text-gray-400">
                  來源：{extractionSource === 'comment' ? `留言 (${commentAuthor || '未知'})` : '手動貼上'}
                </p>
              )}
            </div>

            {/* Paste mode */}
            {pasteMode && (
              <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
                <h3 className="font-semibold mb-2">手動貼上歌單</h3>
                <p className="text-sm text-gray-500 mb-3">未找到含有時間戳的留言。請手動貼上歌單文字。</p>
                <textarea
                  data-testid="paste-text-input"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="0:04:23 誰 / 李友廷&#10;0:08:26 Shape of You / Ed Sheeran&#10;..."
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 font-mono text-sm"
                />
                <button
                  data-testid="paste-extract-button"
                  onClick={handlePasteExtract}
                  className="mt-2 px-4 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
                >
                  擷取歌曲
                </button>
              </div>
            )}

            {/* Song list */}
            {songs.length > 0 && (
              <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">擷取到 {songs.length} 首歌曲</h3>
                  <button
                    onClick={() => setPasteMode(!pasteMode)}
                    className="text-sm text-pink-500 hover:text-pink-700"
                  >
                    {pasteMode ? '隱藏手動輸入' : '手動貼上歌單'}
                  </button>
                </div>

                <div className="space-y-2">
                  {songs.map((song, i) => (
                    <div
                      key={i}
                      data-testid={`extracted-song-${i}`}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        song.suspicious ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                      }`}
                    >
                      <span className="text-gray-400 text-sm font-mono w-16">{song.startTimestamp}</span>
                      <input
                        value={song.songName}
                        onChange={(e) => updateSong(i, 'songName', e.target.value)}
                        className="flex-1 px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-pink-400 focus:outline-none"
                      />
                      <span className="text-gray-400">/</span>
                      <input
                        value={song.artist}
                        onChange={(e) => updateSong(i, 'artist', e.target.value)}
                        className="flex-1 px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-pink-400 focus:outline-none"
                      />
                      <button onClick={() => removeSong(i)} className="text-gray-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    data-testid="import-button"
                    onClick={handleImport}
                    className="px-6 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90 flex items-center gap-2"
                  >
                    <Download size={16} />
                    匯入到歌曲庫
                  </button>
                  <button
                    onClick={() => { setStep('input'); setVideoInfo(null); setSongs([]); }}
                    className="px-4 py-2 text-gray-500 hover:text-gray-700"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Import complete */}
        {step === 'done' && importResult && (
          <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
            <div className="flex items-center gap-2 text-green-600 mb-4">
              <Check size={20} />
              <h2 className="text-lg font-semibold">匯入完成！</h2>
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              <p>新歌曲：{importResult.newSongs}</p>
              <p>已有歌曲（新增版本）：{importResult.existingSongMatches}</p>
              <p>總演出數：{importResult.newPerformances}</p>
            </div>
            <p className="mt-3 text-sm text-gray-400">專輯封面和歌詞正在背景中自動取得...</p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setStep('input'); setUrl(''); setVideoInfo(null); setSongs([]); setImportResult(null); }}
                className="px-4 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
              >
                匯入另一個直播
              </button>
              <button
                onClick={() => router.push('/admin')}
                className="px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                返回管理面板
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
