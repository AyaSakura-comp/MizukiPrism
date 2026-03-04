// app/admin/discover/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Download, Check, Trash2, AlertCircle } from 'lucide-react';
import { fetchVideoInfo, fetchVideoComments, fetchChannelInfo } from '@/lib/youtube-api';
import { parseTextToSongs, findCandidateComment, secondsToTimestamp } from '@/lib/admin/extraction';
import { isAuthenticated, importStreamWithSongs, saveStreamer, fetchMusicBrainzDuration } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabase';
import { extractVideoId } from '@/lib/utils';

interface VideoInfo {
  videoId: string;
  title: string;
  date: string;
  description: string;
  durationSeconds: number;
  channelId: string;
  channelName: string;
  channelHandle: string | null;
  isNewStreamer: boolean;
  existingStreamer: any | null;
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
  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [isNewStreamer, setIsNewStreamer] = useState(false);
  const [streamerProfile, setStreamerProfile] = useState<any>(null);
  const [showStreamerConfirm, setShowStreamerConfirm] = useState(false);
  const [channelId, setChannelId] = useState<string>('');

  // Auth check
  useEffect(() => {
    if (!isAuthenticated()) router.replace('/admin/login');
    else setAuthenticated(true);
  }, [router]);

  // Step 1: Fetch video info
  async function handleFetchVideo() {
    setError(null);
    try {
      const videoId = extractVideoId(url);
      if (!videoId) throw new Error('Invalid YouTube URL');

      const info = await fetchVideoInfo(videoId);

      // Check if streamer is new
      const { data: existingStreamer } = await supabase
        .from('streamers')
        .select('channel_id, display_name')
        .eq('channel_id', info.channelId)
        .single();

      const data = {
        videoId: info.videoId,
        title: info.title,
        date: info.date,
        description: info.description,
        durationSeconds: info.durationSeconds,
        channelId: info.channelId,
        channelName: info.channelName,
        channelHandle: null as string | null,
        isNewStreamer: !existingStreamer,
        existingStreamer: existingStreamer || null,
      };

      setVideoInfo(data);
      setChannelId(info.channelId);

      if (data.isNewStreamer && info.channelId) {
        const profile = await fetchChannelInfo(info.channelId);
        setStreamerProfile({
          channelId: profile.channelId,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          description: profile.description,
        });
        setShowStreamerConfirm(true);
      } else {
        setStep('extracting');
        handleExtract(info.videoId, info.durationSeconds);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleConfirmStreamer() {
    try {
      await saveStreamer(streamerProfile);
      setShowStreamerConfirm(false);
      setStep('extracting');
      handleExtract(videoInfo!.videoId, videoInfo!.durationSeconds);
    } catch (err) {
      setError(String(err));
    }
  }

  // Strip HTML tags from YouTube comment textDisplay, converting <br> to newlines
  function stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  // Step 2: Extract songs from comments
  async function handleExtract(videoId: string, videoDurationSeconds?: number) {
    try {
      const comments = await fetchVideoComments(videoId, 20);
      const candidate = findCandidateComment(comments.map(c => ({
        cid: c.cid,
        author: c.author,
        authorUrl: c.authorUrl,
        text: stripHtml(c.text),
        votes: c.likeCount,
        isPinned: c.isPinned,
      })));

      if (candidate) {
        let parsed = parseTextToSongs(stripHtml(candidate.text));
        // Enrich end timestamps via MusicBrainz (1 req/sec rate limit)
        for (let i = 0; i < parsed.length; i++) {
          const s = parsed[i];
          if (s.endSeconds !== null) continue;
          // Wait 1.1s between requests to respect MusicBrainz rate limit
          if (i > 0) await new Promise(r => setTimeout(r, 1100));
          const dur = await fetchMusicBrainzDuration(s.artist, s.songName);
          if (dur) {
            parsed[i] = { ...s, endSeconds: s.startSeconds + dur, endTimestamp: secondsToTimestamp(s.startSeconds + dur) };
          } else if (i === parsed.length - 1 && videoDurationSeconds) {
            // Last song fallback: use video end time
            parsed[i] = { ...s, endSeconds: videoDurationSeconds, endTimestamp: secondsToTimestamp(videoDurationSeconds) };
          }
        }
        setSongs(parsed as any[]);
        setExtractionSource('comment');
        setCommentAuthor(candidate.author ?? null);
        setStep('review');
      } else {
        setPasteMode(true);
        setStep('review');
      }
    } catch {
      setPasteMode(true);
      setStep('review');
    }
  }

  // Extract from pasted text
  async function handlePasteExtract() {
    try {
      const parsed = parseTextToSongs(pastedText);
      setSongs(parsed as any[]);
      setExtractionSource('text');
      setPasteMode(false);
    } catch (err) {
      setError(String(err));
    }
  }

  // Manual mode: extract from pasted text without YouTube URL
  async function handleManualExtract() {
    if (!manualTitle || !pastedText) return;
    setError(null);
    try {
      const parsed = parseTextToSongs(pastedText);
      const manualId = `manual${Date.now()}`;
      setVideoInfo({
        videoId: manualId,
        title: manualTitle,
        date: manualDate,
        description: '',
        durationSeconds: 0,
        channelId: '',
        channelName: '',
        channelHandle: null,
        isNewStreamer: false,
        existingStreamer: null,
      });
      setSongs(parsed as any[]);
      setExtractionSource('text');
      setPasteMode(false);
      setStep('review');
    } catch (err) {
      setError(String(err));
    }
  }

  // Step 3: Import approved songs
  async function handleImport() {
    if (!videoInfo) return;
    setStep('importing');
    try {
      const result = await importStreamWithSongs({
        videoId: videoInfo.videoId,
        title: videoInfo.title,
        date: videoInfo.date,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoInfo.videoId}`,
        channelId: channelId || undefined,
        songs: songs.map((s) => ({
          songName: s.songName,
          artist: s.artist,
          startSeconds: s.startSeconds,
          endSeconds: s.endSeconds,
          note: '',
        })),
        credit: commentAuthor ? { author: commentAuthor, authorUrl: '' } : undefined,
      });
      setImportResult({
        newSongs: result.songsCreated,
        existingSongMatches: result.songsUpdated,
        newPerformances: songs.length,
        isOverwrite: false,
      });
      setStep('done');
    } catch (err) {
      setError(String(err));
      setStep('review');
    }
  }

  // Edit song inline
  function updateSong(index: number, field: string, value: string) {
    setSongs((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, [field]: value };
        if (field === 'endTimestamp') {
          // Parse MM:SS or HH:MM:SS back to seconds
          let sec = null;
          if (value.trim()) {
            const parts = value.trim().split(':').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              sec = parts[0] * 60 + parts[1];
            } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
              sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          }
          updated.endSeconds = sec;
        }
        return updated;
      })
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
          <div className="mb-4 p-4 bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border-l-4 border-l-pink-500 border-y border-r border-white/60 flex items-center gap-3 text-pink-600">
            <AlertCircle size={20} />
            <span className="font-medium flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-pink-400 hover:text-pink-600 transition-colors">✕</button>
          </div>
        )}

        {/* Step 1: URL Input */}
        {step === 'input' && (
          <div className="space-y-4">
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
              <button
                data-testid="manual-mode-toggle"
                onClick={() => setManualMode(!manualMode)}
                className="mt-3 text-sm text-pink-500 hover:text-pink-700"
              >
                {manualMode ? '隱藏手動輸入' : '手動貼上歌單'}
              </button>
            </div>

            {manualMode && (
              <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6 space-y-3">
                <h3 className="font-semibold">手動輸入歌單</h3>
                <div className="flex gap-3">
                  <input
                    data-testid="manual-title-input"
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="直播標題"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                  />
                  <input
                    data-testid="manual-date-input"
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                  />
                </div>
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
                  onClick={handleManualExtract}
                  className="px-4 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
                >
                  擷取歌曲
                </button>
              </div>
            )}
          </div>
        )}

        {/* New streamer confirmation */}
        {showStreamerConfirm && streamerProfile && (
          <div data-testid="new-streamer-confirm" className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-orange-600 flex items-center gap-2">
              <AlertCircle size={20} />
              偵測到新的直播主
            </h3>
            <div className="flex items-center gap-4">
              {streamerProfile.avatarUrl && (
                <img
                  data-testid="streamer-avatar-preview"
                  src={streamerProfile.avatarUrl}
                  alt={streamerProfile.displayName}
                  className="w-16 h-16 rounded-full border-2 border-pink-200"
                />
              )}
              <div className="space-y-2 flex-1">
                <div>
                  <label className="text-xs text-gray-500">名稱</label>
                  <input
                    data-testid="streamer-name-input"
                    value={streamerProfile.displayName || ''}
                    onChange={(e) => setStreamerProfile({ ...streamerProfile, displayName: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                  />
                </div>
                <p className="text-sm text-gray-500">{streamerProfile.handle || channelId}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                data-testid="confirm-streamer-button"
                onClick={handleConfirmStreamer}
                className="px-4 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90 flex items-center gap-2"
              >
                <Check size={16} />
                確認新增
              </button>
              <button
                data-testid="skip-streamer-button"
                onClick={() => {
                  setShowStreamerConfirm(false);
                  setStep('extracting');
                  handleExtract(videoInfo!.videoId, videoInfo!.durationSeconds);
                }}
                className="px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                跳過
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
                      <span className="text-gray-400 text-sm font-mono w-12">{song.startTimestamp}</span>
                      <span className="text-gray-400 text-sm">-</span>
                      <input
                        data-testid={`end-timestamp-input-${i}`}
                        value={song.endTimestamp || ''}
                        onChange={(e) => updateSong(i, 'endTimestamp', e.target.value)}
                        placeholder="結束"
                        className="w-16 px-1 py-1 bg-white/50 border border-gray-200 rounded hover:border-gray-300 focus:border-pink-400 focus:outline-none text-sm font-mono text-gray-900 font-bold"
                      />
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
            {importResult.isOverwrite && (
              <div className="mb-4 p-3 bg-white/50 border-l-4 border-l-orange-400 rounded-r-lg text-orange-600 text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                <span>此直播先前已匯入過，已自動覆蓋更新原有的資料。</span>
              </div>
            )}
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
