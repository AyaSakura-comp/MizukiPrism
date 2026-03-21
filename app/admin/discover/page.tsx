// app/admin/discover/page.tsx
'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, Download, Check, Trash2, AlertCircle, Play, Pause, RotateCcw, ClipboardCopy, Lock, LockOpen } from 'lucide-react';
import { fetchVideoInfo, fetchVideoComments, fetchChannelInfo } from '@/lib/youtube-api';
import { parseTextToSongs, findCandidateComment, secondsToTimestamp } from '@/lib/admin/extraction';
import { isAuthenticated, importStreamWithSongs, saveStreamer, fetchItunesSongInfo, fetchMusicBrainzSongInfo } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabase';
import { extractVideoId } from '@/lib/utils';
import AdminHeader from '@/app/admin/components/AdminHeader';

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
  durationSource: 'iTunes' | 'MusicBrainz' | 'comment' | 'none';
  artistSource?: 'iTunes' | 'MusicBrainz' | 'comment' | 'none';
}

type Step = 'input' | 'extracting' | 'review' | 'importing' | 'done';

function DiscoverPageInner() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [songs, setSongs] = useState<ExtractedSong[]>([]);
  const [copiedSongList, setCopiedSongList] = useState(false);
  const [showNovaHelper, setShowNovaHelper] = useState(false);
  const [novaCopiedField, setNovaCopiedField] = useState<string | null>(null);
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

  // Preview player state
  const [activeSongIndex, setActiveSongIndex] = useState<number | null>(null);
  const [playerReloadKey, setPlayerReloadKey] = useState(0);
  const activeSongIndexRef = useRef<number | null>(null);
  const originalSongsRef = useRef<ExtractedSong[]>([]);
  const [lockedEndTimestamps, setLockedEndTimestamps] = useState<Set<number>>(new Set());
  const lockedEndTimestampsRef = useRef<Set<number>>(new Set());
  // Sync both ref and state synchronously — ref must be updated immediately so
  // the 500ms interval reads the correct value without a render-cycle delay
  function setLocked(updater: (prev: Set<number>) => Set<number>) {
    const next = updater(lockedEndTimestampsRef.current);
    lockedEndTimestampsRef.current = next;
    setLockedEndTimestamps(next);
  }
  // Keep ref in sync so the player interval can read it without stale closure
  useEffect(() => { activeSongIndexRef.current = activeSongIndex; }, [activeSongIndex]);
  const [playerCurrentTime, setPlayerCurrentTime] = useState<number>(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const prevIsPreviewPlayingRef = useRef(false);
  // Timestamp of last manual toggle — interval skips polling isPreviewPlaying for 1s after toggle
  // to avoid race: pauseVideo() is async so getPlayerState() may still return 1 briefly after pause
  const manualToggleTimeRef = useRef<number>(0);
  // Auto-lock active song on pause, auto-unlock on play
  useEffect(() => {
    const wasPlaying = prevIsPreviewPlayingRef.current;
    prevIsPreviewPlayingRef.current = isPreviewPlaying;
    if (activeSongIndex === null) return;
    if (wasPlaying && !isPreviewPlaying) {
      // playing → paused: lock immediately (ref updated synchronously)
      setLocked(prev => { const next = new Set(prev); next.add(activeSongIndex); return next; });
    } else if (!wasPlaying && isPreviewPlaying) {
      // paused → playing: unlock immediately
      setLocked(prev => { const next = new Set(prev); next.delete(activeSongIndex); return next; });
    }
  }, [isPreviewPlaying, activeSongIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewPlayerRef = useRef<any>(null);
  const timeUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ytPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived formatted song list text for copy block
  const songListText = useMemo(() => {
    return songs.map((song, i) => {
      const idx = String(i + 1).padStart(2, '0');
      const start = formatTime(song.startSeconds ?? 0);
      const end = song.endSeconds != null ? ` ~ ${formatTime(song.endSeconds)}` : '';
      const artist = song.artist ? ` / ${song.artist}` : '';
      return `${idx}. ${start}${end} ${song.songName}${artist}`;
    }).join('\n');
  }, [songs]);

  // Nova export format (no index number)
  const novaExportText = useMemo(() => {
    return songs.map((song) => {
      const start = formatTime(song.startSeconds ?? 0);
      const end = song.endSeconds != null ? ` ~ ${formatTime(song.endSeconds)}` : '';
      const artist = song.artist ? ` / ${song.artist}` : '';
      return `${start}${end} ${song.songName}${artist}`;
    }).join('\n');
  }, [songs]);

  const searchParams = useSearchParams();
  const urlParam = searchParams.get('url') ? decodeURIComponent(searchParams.get('url')!) : null;
  const fromChannel = searchParams.get('from') === 'channel';
  const channelUrlParam = searchParams.get('channelUrl') ? decodeURIComponent(searchParams.get('channelUrl')!) : null;
  const backHref = fromChannel && channelUrlParam
    ? `/admin/channel?url=${encodeURIComponent(channelUrlParam)}`
    : '/admin';

  // Auth check
  useEffect(() => {
    if (!isAuthenticated()) router.replace('/admin/login');
    else setAuthenticated(true);
  }, [router]);

  // Ensure YouTube IFrame API script is loaded
  useEffect(() => {
    if ((window as any).YT?.Player) return;
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }, []);

  // Initialize/destroy preview player on review step
  useEffect(() => {
    const isManual = !videoInfo?.videoId || videoInfo.videoId.startsWith('manual');
    if (step !== 'review' || isManual) {
      // Cleanup if leaving review
      if (ytPollRef.current) { clearInterval(ytPollRef.current); ytPollRef.current = null; }
      if (timeUpdateRef.current) { clearInterval(timeUpdateRef.current); timeUpdateRef.current = null; }
      if (previewPlayerRef.current) {
        try { previewPlayerRef.current.destroy(); } catch {}
        previewPlayerRef.current = null;
      }
      return;
    }

    let destroyed = false;

    function createPlayer() {
      if (destroyed) return;
      const container = playerContainerRef.current;
      if (!container) return;
      // Create a fresh target element inside the container so React doesn't re-own it
      container.innerHTML = '';
      const targetDiv = document.createElement('div');
      container.appendChild(targetDiv);

      const player = new (window as any).YT.Player(targetDiv, {
        videoId: videoInfo!.videoId,
        height: '360',
        width: '640',
        playerVars: {
          controls: 1,
          rel: 0,
          autoplay: 0,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: (e: any) => {
            if (destroyed) return;
            previewPlayerRef.current = e.target;
            timeUpdateRef.current = setInterval(() => {
              if (previewPlayerRef.current) {
                const t = previewPlayerRef.current.getCurrentTime() ?? 0;
                setPlayerCurrentTime(t);
                const state = previewPlayerRef.current.getPlayerState?.();
                // Treat buffering (3) as "playing" for UI — don't flip to paused just because the
                // player is buffering. Only flip isPreviewPlaying to false on explicit pause (state 2).
                const isActuallyPlaying = state === 1;
                const isPlayingOrBuffering = state === 1 || state === 3;
                const isExplicitlyPaused = state === 2;
                // Only update isPreviewPlaying from poll if >1s since last manual toggle,
                // to avoid race: pauseVideo() is async and getPlayerState() may still return
                // 1/3 briefly after the call.
                if (Date.now() - manualToggleTimeRef.current > 1000) {
                  if (isPlayingOrBuffering) setIsPreviewPlaying(true);
                  else if (isExplicitlyPaused) setIsPreviewPlaying(false);
                }
                // Continuously sync active song's end-timestamp while actually playing (skip locked songs)
                const idx = activeSongIndexRef.current;
                if (isActuallyPlaying && idx !== null && !lockedEndTimestampsRef.current.has(idx)) {
                  const ts = secondsToTimestamp(Math.round(t));
                  setSongs(prev => prev.map((s, i) => i === idx ? { ...s, endTimestamp: ts, endSeconds: Math.round(t) } : s));
                }
              }
            }, 500);
          },
          onStateChange: (e: any) => {
            if (destroyed) return;
            // Only flip isPreviewPlaying on definitive states — ignore buffering (3)
            // so we don't auto-lock when the player briefly buffers mid-playback.
            if (e.data === 1 || e.data === 3) setIsPreviewPlaying(true);
            else if (e.data === 2 || e.data === 0) setIsPreviewPlaying(false);
          },
        },
      });
      previewPlayerRef.current = player;
    }

    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      // Poll until YT API is ready (handles async script load)
      ytPollRef.current = setInterval(() => {
        if ((window as any).YT?.Player) {
          clearInterval(ytPollRef.current!);
          ytPollRef.current = null;
          createPlayer();
        }
      }, 100);
    }

    return () => {
      destroyed = true;
      if (ytPollRef.current) { clearInterval(ytPollRef.current); ytPollRef.current = null; }
      if (timeUpdateRef.current) { clearInterval(timeUpdateRef.current); timeUpdateRef.current = null; }
      if (previewPlayerRef.current) {
        try { previewPlayerRef.current.destroy(); } catch {}
        previewPlayerRef.current = null;
      }
    };
  }, [step, videoInfo, playerReloadKey]);

  // Preview player helpers
  function seekPreview(seconds: number, songIndex?: number) {
    if (previewPlayerRef.current) {
      previewPlayerRef.current.seekTo(seconds, true);
      previewPlayerRef.current.playVideo();
      manualToggleTimeRef.current = Date.now(); // prevent interval from overriding for 1s
      setIsPreviewPlaying(true); // player transitions to buffering/playing — update state immediately
    }
    if (songIndex !== undefined) setActiveSongIndex(songIndex);
  }

  function nudgeTime(delta: number) {
    if (previewPlayerRef.current) {
      const cur = previewPlayerRef.current.getCurrentTime() ?? 0;
      previewPlayerRef.current.seekTo(cur + delta, true);
    }
  }

  function togglePreviewPlayPause() {
    if (!previewPlayerRef.current) return;
    manualToggleTimeRef.current = Date.now(); // block interval polling for 1s to avoid race
    // Read actual player state instead of React state — state can be stale if the interval
    // hasn't run yet since the player started (e.g. immediately after seekPreview)
    // Use React state to decide — it is kept in sync by seekPreview/interval/onStateChange
    // and is more reliable than getPlayerState() which can lag behind UI state
    if (isPreviewPlaying) {
      previewPlayerRef.current.pauseVideo();
      setIsPreviewPlaying(false); // immediate update so auto-lock fires instantly
    } else {
      previewPlayerRef.current.playVideo();
      setIsPreviewPlaying(true);
    }
  }

  function formatTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // Auto-trigger fetch when navigated from channel browser with ?url= param
  useEffect(() => {
    if (!authenticated || !urlParam) return;
    setUrl(urlParam);
    handleFetchVideo(urlParam);
  }, [authenticated, urlParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global Space key → play/pause in review step (when focus is not in a text input)
  useEffect(() => {
    if (step !== 'review' || !videoInfo || videoInfo.videoId.startsWith('manual')) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== ' ') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      togglePreviewPlayPause();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, videoInfo, isPreviewPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 1: Fetch video info
  async function handleFetchVideo(overrideUrl?: string) {
    const targetUrl = overrideUrl ?? url;
    setError(null);
    try {
      const videoId = extractVideoId(targetUrl);
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
        // Tag songs that already have end timestamps from the comment
        parsed = parsed.map(s => ({
          ...s,
          durationSource: s.endSeconds !== null ? 'comment' : 'none',
          artistSource: s.artist ? 'comment' : 'none',
        })) as any[];
        // Enrich missing end timestamps: iTunes primary, MusicBrainz fallback
        for (let i = 0; i < parsed.length; i++) {
          const s = parsed[i] as any;
          if (s.durationSource === 'comment' && s.artistSource === 'comment') continue;
          // Try iTunes first (3s rate limit built into fetchItunesDuration)
          const itunesInfo = await fetchItunesSongInfo(s.artist, s.songName);
          if (itunesInfo) {
            const { durationSeconds, artistName } = itunesInfo;
            if (s.durationSource === 'none') {
              s.endSeconds = s.startSeconds + durationSeconds;
              s.endTimestamp = secondsToTimestamp(s.endSeconds);
              s.durationSource = 'iTunes';
            }
            if (s.artistSource === 'none' && artistName) {
              s.artist = artistName;
              s.artistSource = 'iTunes';
            }
          }
          if (s.durationSource === 'none' || s.artistSource === 'none') {
            // Fallback to MusicBrainz (1.1s rate limit)
            await new Promise(r => setTimeout(r, 1100));
            const mbInfo = await fetchMusicBrainzSongInfo(s.artist, s.songName);
            if (mbInfo) {
              const { durationSeconds, artistName } = mbInfo;
              if (s.durationSource === 'none') {
                 s.endSeconds = s.startSeconds + durationSeconds;
                 s.endTimestamp = secondsToTimestamp(s.endSeconds);
                 s.durationSource = 'MusicBrainz';
              }
              if (s.artistSource === 'none' && artistName) {
                s.artist = artistName;
                s.artistSource = 'MusicBrainz';
              }
            } else if (i === parsed.length - 1 && videoDurationSeconds) {
              // Last song fallback: use video end time
              if (s.durationSource === 'none') {
                s.endSeconds = videoDurationSeconds;
                s.endTimestamp = secondsToTimestamp(videoDurationSeconds);
              }
            }
          }
          parsed[i] = s;
        }
        originalSongsRef.current = parsed as any[];
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
      const parsed = parseTextToSongs(pastedText).map(s => ({ ...s, durationSource: 'none' as const, artistSource: s.artist ? 'comment' as const : 'none' as const }));
      originalSongsRef.current = parsed as any[];
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
      const parsed = parseTextToSongs(pastedText).map(s => ({ ...s, durationSource: 'none' as const, artistSource: s.artist ? 'comment' as const : 'none' as const }));
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
      originalSongsRef.current = parsed as any[];
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

  function toggleLockEndTimestamp(index: number) {
    setLocked(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function removeSong(index: number) {
    setSongs((prev) => prev.filter((_, i) => i !== index));
    originalSongsRef.current = originalSongsRef.current.filter((_, i) => i !== index);
    // Shift locked indices
    setLocked(prev => {
      const next = new Set<number>();
      prev.forEach(idx => { if (idx < index) next.add(idx); else if (idx > index) next.add(idx - 1); });
      return next;
    });
    // If active song shifts down due to removal, adjust index
    if (activeSongIndex !== null) {
      if (activeSongIndex === index) {
        setActiveSongIndex(null);
        activeSongIndexRef.current = null;
      } else if (activeSongIndex > index) {
        setActiveSongIndex(activeSongIndex - 1);
        activeSongIndexRef.current = activeSongIndex - 1;
      }
    }
  }

  function resetSong(index: number) {
    const orig = originalSongsRef.current[index];
    if (orig) {
      setSongs((prev) => prev.map((s, i) => i === index ? { ...orig } : s));
      // Stop live-syncing this song so the interval doesn't immediately overwrite the restored value
      if (activeSongIndex === index) {
        setActiveSongIndex(null);
        activeSongIndexRef.current = null;
      }
      // Clear lock when resetting
      setLocked(prev => { const next = new Set(prev); next.delete(index); return next; });
    }
  }

  function durationBadge(source: ExtractedSong['durationSource']) {
    const styles: Record<string, string> = {
      iTunes: 'bg-blue-200 text-blue-800 border border-blue-300',
      MusicBrainz: 'bg-violet-200 text-violet-800 border border-violet-300',
      comment: 'bg-green-200 text-green-800 border border-green-300',
      none: 'bg-gray-200 text-gray-600 border border-gray-300',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[source] || styles.none}`}>
        {source}
      </span>
    );
  }

  function artistBadge(source: ExtractedSong['artistSource']) {
    if (!source || source === 'comment') return null;
    const styles: Record<string, string> = {
      iTunes: 'bg-blue-200 text-blue-800 border border-blue-300',
      MusicBrainz: 'bg-violet-200 text-violet-800 border border-violet-300',
      none: 'bg-gray-200 text-gray-600 border border-gray-300',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[source] || styles.none}`}>
        {source}
      </span>
    );
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-blue-50">
      <AdminHeader />
      <div className={`${step === 'review' && videoInfo && !videoInfo.videoId.startsWith('manual') ? 'max-w-7xl' : 'max-w-4xl'} mx-auto space-y-4 p-4 sm:p-6`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.push(backHref)} className="text-gray-500 hover:text-gray-700">
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
                  onClick={() => handleFetchVideo()}
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
        {step === 'review' && videoInfo && (() => {
          const isManual = videoInfo.videoId.startsWith('manual');
          return (
            <div className={`lg:flex lg:gap-6 space-y-4 lg:space-y-0 ${isManual ? '' : 'lg:items-start'}`}>
              {/* Left column: YouTube preview player */}
              {!isManual && (
                <div className="-mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:w-[400px] lg:shrink-0 sticky top-0 lg:top-6 lg:self-start z-10 pb-3 lg:pb-0 bg-pink-50 lg:bg-transparent w-auto">
                  <div className="bg-white lg:bg-white/80 lg:backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-4 space-y-3">
                    <div className="relative aspect-video bg-black rounded-lg overflow-hidden [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:w-full [&_iframe]:h-full">
                      <div ref={playerContainerRef} className="w-full h-full" />
                    </div>

                    {/* Current time display */}
                    <div className="text-center text-sm font-mono text-gray-600 bg-gray-50 rounded-lg py-1.5">
                      {formatTime(playerCurrentTime)}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => nudgeTime(-5)}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded font-mono"
                        title="-5s"
                      >-5s</button>
                      <button
                        onClick={() => nudgeTime(-1)}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded font-mono"
                        title="-1s"
                      >-1s</button>
                      <button
                        data-testid="preview-play-pause-btn"
                        onClick={togglePreviewPlayPause}
                        className="px-3 py-1.5 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
                      >
                        {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button
                        onClick={() => nudgeTime(1)}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded font-mono"
                        title="+1s"
                      >+1s</button>
                      <button
                        onClick={() => nudgeTime(5)}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded font-mono"
                        title="+5s"
                      >+5s</button>
                    </div>

                    {/* Active song name */}
                    {activeSongIndex !== null && songs[activeSongIndex] && (
                      <div className="text-xs text-center text-gray-500 truncate px-2">
                        調整中：{songs[activeSongIndex].songName}
                        {songs[activeSongIndex].artist ? ` / ${songs[activeSongIndex].artist}` : ''}
                      </div>
                    )}

                    {/* Reload player button */}
                    <button
                      onClick={() => setPlayerReloadKey(k => k + 1)}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded py-1 transition-colors"
                      title="重新載入 YouTube 播放器"
                    >
                      ↺ 重新載入播放器
                    </button>

                    {/* Keyboard shortcut tips */}
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                      <p className="font-medium text-gray-500 mb-1">⌨️ 快捷鍵（聚焦結束時間欄時）</p>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        <span><kbd className="bg-gray-100 px-1 rounded">←</kbd> / <kbd className="bg-gray-100 px-1 rounded">→</kbd></span><span>±1 秒</span>
                        <span><kbd className="bg-gray-100 px-1 rounded">⇧←</kbd> / <kbd className="bg-gray-100 px-1 rounded">⇧→</kbd></span><span>±5 秒</span>
                        <span><kbd className="bg-gray-100 px-1 rounded">Space</kbd></span><span>播放 / 暫停</span>
<span><kbd className="bg-gray-100 px-1 rounded">↺</kbd> 按鈕</span><span>還原 API 偵測值</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Right column: video info + song list */}
              <div className="flex-1 min-w-0 space-y-4">
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
                  <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6 overflow-x-hidden">
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
                          className={`flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 p-3 rounded-lg border-l-4 ${
                            activeSongIndex === i
                              ? 'bg-pink-50 border-l-pink-400'
                              : song.suspicious
                              ? 'bg-yellow-50 border-l-yellow-200 border border-yellow-200'
                              : 'bg-gray-50 border-l-transparent'
                          }`}
                        >
                          {/* Row 1 (mobile) / all-in-one (desktop): timestamps + badges */}
                          <div className="flex items-center gap-2 sm:contents">
                            <button
                              onClick={() => seekPreview(song.startSeconds, i)}
                              className="text-blue-500 hover:text-blue-700 hover:underline text-sm font-mono min-w-[3rem] text-left shrink-0"
                              title="跳到此時間點"
                            >
                              {song.startTimestamp}
                            </button>
                            <span className="text-gray-400 text-sm shrink-0">-</span>
                            {(() => {
                              const origEnd = originalSongsRef.current[i]?.endTimestamp ?? null;
                              const isChanged = origEnd !== null && song.endTimestamp !== origEnd;
                              const isLocked = lockedEndTimestamps.has(i);
                              return (<>
                                <input
                                  data-testid={`end-timestamp-input-${i}`}
                                  value={song.endTimestamp || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateSong(i, 'endTimestamp', val);
                                    if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
                                    seekDebounceRef.current = setTimeout(() => {
                                      if (!previewPlayerRef.current) return;
                                      const parts = val.trim().split(':').map(Number);
                                      let secs: number | null = null;
                                      if (parts.length === 2 && parts.every(n => !isNaN(n))) secs = parts[0] * 60 + parts[1];
                                      else if (parts.length === 3 && parts.every(n => !isNaN(n))) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
                                      if (secs !== null) previewPlayerRef.current.seekTo(secs, true);
                                    }, 400);
                                  }}
                                  onFocus={() => {
                                    setActiveSongIndex(i);
                                    if (song.endSeconds !== null && previewPlayerRef.current) {
                                      previewPlayerRef.current.seekTo(song.endSeconds, true);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (seekDebounceRef.current) { clearTimeout(seekDebounceRef.current); seekDebounceRef.current = null; }
                                  }}
                                  onKeyDown={(e) => {
                                    if (!previewPlayerRef.current) return;
                                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                                      e.preventDefault();
                                      const delta = e.key === 'ArrowRight'
                                        ? (e.shiftKey ? 5 : 1)
                                        : (e.shiftKey ? -5 : -1);
                                      nudgeTime(delta);
                                      setTimeout(() => {
                                        if (!previewPlayerRef.current) return;
                                        const t = Math.round(previewPlayerRef.current.getCurrentTime() ?? 0);
                                        updateSong(i, 'endTimestamp', secondsToTimestamp(t));
                                      }, 80);
                                    } else if (e.key === ' ') {
                                      e.preventDefault();
                                      togglePreviewPlayPause();
                                    }
                                  }}
                                  placeholder="結束"
                                  className={`w-[5rem] px-1 py-1 border rounded hover:border-gray-300 focus:outline-none text-sm font-mono font-bold shrink-0 transition-colors ${
                                    isChanged
                                      ? 'bg-pink-50 border-pink-300 text-pink-700 focus:border-pink-500'
                                      : 'bg-white/50 border-gray-200 text-gray-900 focus:border-pink-400'
                                  }`}
                                />
                                <button
                                  onClick={() => toggleLockEndTimestamp(i)}
                                  title={isLocked ? '已鎖定（點擊解鎖）' : '鎖定結束時間（不隨播放更新）'}
                                  className={`shrink-0 transition-colors ${isLocked ? 'text-pink-500 hover:text-pink-700' : 'text-gray-300 hover:text-gray-500'}`}
                                >
                                  {isLocked ? <Lock size={13} /> : <LockOpen size={13} />}
                                </button>
                              </>);
                            })()}
                            {durationBadge(song.durationSource)}
                          </div>
                          {/* Row 2 (mobile) / continuation (desktop): song name + artist */}
                          <div className="flex items-center gap-2 sm:contents min-w-0">
                            <input
                              value={song.songName}
                              onChange={(e) => updateSong(i, 'songName', e.target.value)}
                              className="flex-1 min-w-0 px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-pink-400 focus:outline-none"
                            />
                            <span className="text-gray-400 shrink-0">/</span>
                            {artistBadge(song.artistSource)}
                            <input
                              value={song.artist}
                              onChange={(e) => updateSong(i, 'artist', e.target.value)}
                              className="flex-1 min-w-0 px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-pink-400 focus:outline-none"
                            />
                            {(() => {
                              const origEnd = originalSongsRef.current[i]?.endTimestamp ?? null;
                              const isChanged = origEnd !== null && song.endTimestamp !== origEnd;
                              return (
                                <button
                                  onClick={() => resetSong(i)}
                                  className={`shrink-0 transition-colors ${isChanged ? 'text-pink-400 hover:text-pink-600' : 'text-gray-400 hover:text-blue-500'}`}
                                  title="還原此曲目"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              );
                            })()}
                            <button onClick={() => removeSong(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Copy song list block */}
                    <div className="mt-4 rounded-lg border border-white/60 bg-white/50 p-4" data-testid="song-list-copy-block">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-600">歌單文字</span>
                        <div className="flex items-center gap-2">
                          {videoInfo && !videoInfo.videoId.startsWith('manual') && (
                            <button
                              data-testid="export-to-nova-button"
                              onClick={() => {
                                navigator.clipboard.writeText(novaExportText);
                                window.open('https://nova.oshi.tw/vod', '_blank');
                                setShowNovaHelper(true);
                                setNovaCopiedField(null);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1 text-sm rounded-lg bg-violet-100 border border-violet-200 hover:bg-violet-200 text-violet-700 transition-colors"
                            >
                              ↗ 匯出到 Nova
                            </button>
                          )}
                          <button
                            data-testid="copy-song-list-button"
                            onClick={() => {
                              navigator.clipboard.writeText(songListText);
                              setCopiedSongList(true);
                              setTimeout(() => setCopiedSongList(false), 2000);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 text-sm rounded-lg bg-white/80 border border-white/60 hover:bg-white text-gray-600 hover:text-gray-900 transition-colors"
                          >
                            {copiedSongList ? <Check size={14} className="text-green-500" /> : <ClipboardCopy size={14} />}
                            {copiedSongList ? '已複製！' : '複製'}
                          </button>
                        </div>
                      </div>
                      <pre className="text-sm text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">{songListText}</pre>

                      {/* Nova export helper */}
                      {showNovaHelper && videoInfo && (
                        <div className="mt-3 p-3 rounded-lg bg-violet-50 border border-violet-200 text-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-violet-700">Nova 匯出助手</span>
                            <button onClick={() => setShowNovaHelper(false)} className="text-violet-400 hover:text-violet-600 text-xs">✕ 關閉</button>
                          </div>
                          <p className="text-violet-600 text-xs">歌單已複製到剪貼簿，請在 Nova 貼上。以下欄位點擊即可複製：</p>
                          <div className="space-y-1.5">
                            {[
                              { label: 'YouTube URL', value: `https://www.youtube.com/watch?v=${videoInfo.videoId}` },
                              { label: '直播標題', value: videoInfo.title },
                              { label: '直播日期', value: videoInfo.date.replace(/-/g, '/') },
                            ].map(({ label, value }) => (
                              <div key={label} className="flex items-center gap-2">
                                <span className="text-violet-500 w-20 shrink-0 text-xs">{label}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(value);
                                    setNovaCopiedField(label);
                                    setTimeout(() => setNovaCopiedField(null), 2000);
                                  }}
                                  className="flex-1 text-left px-2 py-1 rounded bg-white/80 border border-violet-200 font-mono text-xs text-gray-700 hover:bg-violet-100 truncate"
                                >
                                  {novaCopiedField === label ? '✓ 已複製！' : value}
                                </button>
                              </div>
                            ))}
                            <div className="flex items-center gap-2">
                              <span className="text-violet-500 w-20 shrink-0 text-xs">歌單時間戳</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(novaExportText);
                                  setNovaCopiedField('songs');
                                  setTimeout(() => setNovaCopiedField(null), 2000);
                                }}
                                className="flex-1 text-left px-2 py-1 rounded bg-white/80 border border-violet-200 text-xs text-gray-700 hover:bg-violet-100"
                              >
                                {novaCopiedField === 'songs' ? '✓ 已複製！' : `${songs.length} 首歌 (點擊再次複製)`}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
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
            </div>
          );
        })()}

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
                onClick={() => router.push(backHref)}
                className="px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                {fromChannel ? '返回歌回列表' : '返回管理面板'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense>
      <DiscoverPageInner />
    </Suspense>
  );
}
