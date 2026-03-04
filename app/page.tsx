'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Play, Shuffle, ExternalLink, Mic2, Youtube, Twitter, Facebook, Instagram, Twitch, Sparkles, ListMusic, Clock, Heart, Disc3, ChevronDown, ChevronRight, Plus, ListPlus, X, SlidersHorizontal, User, WifiOff, ChevronLeft, MoreHorizontal, House } from 'lucide-react';
import streamersData from '@/data/streamer.json';
import streamsData from '@/data/streams.json';

// For backward compat with existing single-streamer references
const streamerData = {
  ...streamersData[0],
  name: streamersData[0]?.displayName ?? '',
  subTitle: 'Official Song Archive',
};
import { usePlayer } from './contexts/PlayerContext';
import { usePlaylist } from './contexts/PlaylistContext';
import { useLikedSongs } from './contexts/LikedSongsContext';
import { useRecentlyPlayed } from './contexts/RecentlyPlayedContext';
import Toast from './components/Toast';
import PlaylistPanel from './components/PlaylistPanel';
import LikedSongsPanel from './components/LikedSongsPanel';
import RecentlyPlayedPanel from './components/RecentlyPlayedPanel';
import CreatePlaylistDialog from './components/CreatePlaylistDialog';
import AddToPlaylistDropdown from './components/AddToPlaylistDropdown';
import AlbumArt from './components/AlbumArt';
import SidebarNav from './components/SidebarNav';
import { loadSongs, loadMetadata, loadStreams } from '@/lib/supabase-data';

interface Performance {
  id: string;
  streamId?: string;
  date: string;
  streamTitle: string;
  videoId: string;
  timestamp: number;
  endTimestamp?: number | null;
  note: string;
}

interface Song {
  id: string;
  title: string;
  originalArtist: string;
  tags: string[];
  performances: Performance[];
  albumArtUrl?: string;
}

interface FlattenedSong extends Song {
  performanceId: string;
  streamId?: string;
  date: string;
  streamTitle: string;
  videoId: string;
  timestamp: number;
  endTimestamp?: number;
  note: string;
  searchString: string;
  albumArtUrl?: string;
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

type ViewMode = 'timeline' | 'grouped';

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [streams, setStreams] = useState<{id:string;title:string;date:string;videoId:string}[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [expandedSongs, setExpandedSongs] = useState<Set<string>>(new Set());
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false);
  const [showLikedSongsPanel, setShowLikedSongsPanel] = useState(false);
  const [showRecentlyPlayedPanel, setShowRecentlyPlayedPanel] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [mobileTab, setMobileTab] = useState<'home' | 'search' | 'library' | 'profile'>('home');
  const [songs, setSongs] = useState<Song[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [selectedStreamers, setSelectedStreamers] = useState<string[]>([]);
  // empty array = "All"
  // Map from songId to albumArtUrl — populated from /api/metadata
  const albumArtMapRef = useRef<Map<string, string>>(new Map());

  // Fetch songs from API — extracted so the retry button can call it again
  const fetchSongs = () => {
    loadSongs()
      .then((data: Song[]) => {
        // Merge albumArtUrl from metadata map into songs
        const merged = data.map(song => ({
          ...song,
          albumArtUrl: albumArtMapRef.current.get(song.id),
        }));
        setSongs(merged);
        setLoadError(false);
      })
      .catch(() => {
        setLoadError(true);
      });
  };

  // Fetch metadata on mount and populate albumArtMap, then fetch songs
  useEffect(() => {
    loadMetadata()
      .catch(() => ({ songMetadata: [], artistInfo: [] }))
      .then((data: { songMetadata: { songId: string; albumArtUrl?: string; albumArtUrls?: { small: string } }[] }) => {
        const map = new Map<string, string>();
        for (const entry of data.songMetadata) {
          const url = entry.albumArtUrl ?? entry.albumArtUrls?.small;
          if (url) {
            map.set(entry.songId, url);
          }
        }
        albumArtMapRef.current = map;
      })
      .catch(() => {
        // metadata fetch failed — continue without art
      })
      .finally(() => {
        fetchSongs();
      });

    loadStreams()
      .catch(() => [])
      .then((data: {id:string;title:string;date:string;videoId:string}[]) => {
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setStreams(data);
      })
      .catch(() => {
        // streams fetch failed — continue without stream list
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { currentTrack, playTrack, addToQueue, apiLoadError, unavailableVideoIds, timestampWarning, clearTimestampWarning, skipNotification, clearSkipNotification, shuffleOn, toggleShuffle } = usePlayer();
  const { playlists, storageError, clearStorageError } = usePlaylist();
  const { likedCount } = useLikedSongs();
  const { recentCount } = useRecentlyPlayed();

  const handleAddToQueue = (track: { id: string; songId: string; title: string; originalArtist: string; videoId: string; timestamp: number; endTimestamp?: number; albumArtUrl?: string }) => {
    addToQueue(track);
    setToastMessage('已加入播放佇列');
    setShowToast(true);
  };

  const handlePlayAll = () => {
    type TrackInfo = { id: string; songId: string; title: string; originalArtist: string; videoId: string; timestamp: number; endTimestamp?: number; albumArtUrl?: string };
    let tracks: TrackInfo[];
    if (viewMode === 'timeline') {
      tracks = flattenedSongs.map(s => ({
        id: s.performanceId, songId: s.id, title: s.title,
        originalArtist: s.originalArtist, videoId: s.videoId,
        timestamp: s.timestamp, endTimestamp: s.endTimestamp, albumArtUrl: s.albumArtUrl,
      }));
    } else {
      tracks = groupedSongs.flatMap(song => {
        if (!song.performances.length) return [];
        const latest = [...song.performances].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        return [{ id: latest.id, songId: song.id, title: song.title,
          originalArtist: song.originalArtist, videoId: latest.videoId,
          timestamp: latest.timestamp, endTimestamp: latest.endTimestamp ?? undefined, albumArtUrl: song.albumArtUrl,
        }];
      });
    }
    const available = tracks.filter(t => !unavailableVideoIds.has(t.videoId));
    if (available.length === 0) return;
    playTrack(available[0]);
    available.slice(1).forEach(t => addToQueue(t));
  };

  const handleAddToPlaylistSuccess = () => {
    setToastMessage('已加入播放清單');
    setShowToast(true);
  };

  // Show storage error toast
  useEffect(() => {
    if (storageError) {
      setToastMessage(storageError);
      setShowToast(true);
      clearStorageError();
    }
  }, [storageError, clearStorageError]);

  // Show timestamp warning toast
  useEffect(() => {
    if (timestampWarning) {
      setToastMessage(timestampWarning);
      setShowToast(true);
      clearTimestampWarning();
    }
  }, [timestampWarning, clearTimestampWarning]);

  // Show skip notification toast (deleted version skipped or playlist ended)
  useEffect(() => {
    if (skipNotification) {
      setToastMessage(skipNotification);
      setShowToast(true);
      clearSkipNotification();
    }
  }, [skipNotification, clearSkipNotification]);

  // Load view preference from sessionStorage
  useEffect(() => {
    const savedView = sessionStorage.getItem('mizukiprism-view-mode');
    if (savedView === 'timeline' || savedView === 'grouped') {
      setViewMode(savedView);
    }
  }, []);

  // Save view preference to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('mizukiprism-view-mode', viewMode);
  }, [viewMode]);

  const toggleSongExpansion = (songId: string) => {
    setExpandedSongs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(songId)) {
        newSet.delete(songId);
      } else {
        newSet.add(songId);
      }
      return newSet;
    });
  };

  const allArtists = useMemo(() => {
    const artists = new Set<string>();
    songs.forEach(song => artists.add(song.originalArtist));
    return Array.from(artists).sort((a, b) => a.localeCompare(b, 'zh-TW'));
  }, [songs]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    streams.forEach(s => years.add(new Date(s.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [streams]);

  // Build channelId → streamer map
  const streamerMap = useMemo(() => {
    const map = new Map<string, typeof streamersData[0]>();
    for (const s of streamersData) map.set(s.channelId, s);
    return map;
  }, []);

  // Build streamId → channelId map from streams data
  const streamChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of streams) {
      if ((s as any).channelId) map.set(s.id, (s as any).channelId);
    }
    return map;
  }, [streams]);

  const filteredStreams = useMemo(() => {
    if (selectedYears.size === 0) return streams;
    return streams.filter(s => selectedYears.has(new Date(s.date).getFullYear()));
  }, [streams, selectedYears]);

  const toggleYear = (year: number) => {
    setSelectedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
    setSelectedStreamId(null);
  };

  const clearYears = () => {
    setSelectedYears(new Set());
    setSelectedStreamId(null);
  };

  const hasActiveFilters = searchTerm !== '' || selectedStreamId !== null || selectedArtist !== null || selectedYears.size > 0 || selectedStreamers.length > 0;

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedStreamId(null);
    setSelectedArtist(null);
    setSelectedYears(new Set());
    setSelectedStreamers([]);
  };

  const flattenedSongs: FlattenedSong[] = useMemo(() => {
    let result: FlattenedSong[] = [];
    songs.forEach(song => {
      song.performances.forEach(perf => {
        result.push({
          ...song,
          performanceId: perf.id,
          streamId: perf.streamId,
          date: perf.date,
          streamTitle: perf.streamTitle,
          videoId: perf.videoId,
          timestamp: perf.timestamp,
          endTimestamp: perf.endTimestamp ?? undefined,
          note: perf.note,
          searchString: `${song.title} ${song.originalArtist} ${perf.streamTitle}`.toLowerCase()
        });
      });
    });
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return result.filter(song => {
      const lowerTerm = searchTerm.toLowerCase();
      const matchesSearch = song.searchString.includes(lowerTerm);
      const matchesStream = selectedStreamId ? song.streamId === selectedStreamId : true;
      const matchesArtist = selectedArtist ? song.originalArtist === selectedArtist : true;
      const matchesYear = selectedYears.size > 0 ? selectedYears.has(new Date(song.date).getFullYear()) : true;
      const matchesStreamer = selectedStreamers.length > 0
        ? (() => { const chId = streamChannelMap.get(song.streamId || ''); return chId !== undefined && selectedStreamers.includes(chId); })()
        : true;
      return matchesSearch && matchesStream && matchesArtist && matchesYear && matchesStreamer;
    });
  }, [songs, searchTerm, selectedStreamId, selectedArtist, selectedYears, selectedStreamers, streamChannelMap]);

  // Grouped songs for song-grouped view
  const groupedSongs: Song[] = useMemo(() => {
    return songs
      .filter(song => {
        const lowerTerm = searchTerm.toLowerCase();
        const matchesSearch = `${song.title} ${song.originalArtist}`.toLowerCase().includes(lowerTerm);
        const matchesStream = selectedStreamId
          ? song.performances.some(p => p.streamId === selectedStreamId)
          : true;
        const matchesArtist = selectedArtist ? song.originalArtist === selectedArtist : true;
        const matchesYear = selectedYears.size > 0
          ? song.performances.some(perf => selectedYears.has(new Date(perf.date).getFullYear()))
          : true;
        const matchesStreamer = selectedStreamers.length > 0
          ? song.performances.some(p => {
              const chId = streamChannelMap.get(p.streamId || '');
              return chId !== undefined && selectedStreamers.includes(chId);
            })
          : true;
        return matchesSearch && matchesStream && matchesArtist && matchesYear && matchesStreamer;
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-TW'));
  }, [songs, searchTerm, selectedStreamId, selectedArtist, selectedYears, selectedStreamers, streamChannelMap]);

  const gradientText = "bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500";

  return (
    <>
      <Toast message={toastMessage} show={showToast} onHide={() => setShowToast(false)} />
      {/* API Load Error Banner */}
      {apiLoadError && (
        <div
          data-testid="api-load-error"
          className="fixed top-0 left-0 right-0 z-[300] bg-red-500 text-white px-6 py-3 flex items-center justify-center gap-3 shadow-lg"
        >
          <span className="font-bold text-sm">{apiLoadError}</span>
        </div>
      )}
      <div className="flex h-screen bg-gradient-to-br from-[#fff0f5] via-[#f0f8ff] to-[#e6e6fa] text-slate-600 font-sans selection:bg-pink-200 selection:text-pink-900 overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--bg-page-start) 0%, var(--bg-page-mid) 50%, var(--bg-page-end) 100%)' }}>

      {/* Sidebar */}
      <SidebarNav
        activePage="home"
        isHomeActive={!hasActiveFilters}
        onHomeClick={clearAllFilters}
        onCreatePlaylist={() => setShowCreateDialog(true)}
        onViewPlaylists={() => setShowPlaylistPanel(true)}
        playlistCount={playlists.length}
        onViewLikedSongs={() => setShowLikedSongsPanel(true)}
        likedSongsCount={likedCount}
        onViewRecentlyPlayed={() => setShowRecentlyPlayedPanel(true)}
        recentlyPlayedCount={recentCount}
        searchSlot={
          <div className="px-3 pb-3 flex-shrink-0">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search
                  className="w-4 h-4 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                />
              </div>
              <input
                type="text"
                placeholder="搜尋歌曲..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full font-medium py-2.5 pl-9 pr-4 outline-none transition-all text-sm"
                style={{
                  background: 'var(--bg-surface-glass)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-pill)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
        }
      >
        {/* ── Filters Section ── */}
        <div className="pt-2 pb-1">
          <div
            className="px-3 py-1.5 mb-1 font-bold uppercase tracking-widest flex items-center gap-2"
            style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', letterSpacing: '0.1em' }}
          >
            <SlidersHorizontal className="w-3 h-3" />
            篩選條件
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="ml-auto text-xs font-medium transition-colors"
                style={{ color: 'var(--accent-pink)', fontSize: 'var(--font-size-xs)' }}
                data-testid="clear-all-filters"
              >
                清除全部
              </button>
            )}
          </div>

          {/* Artist dropdown */}
          <div className="relative px-1 mb-2">
            <select
              value={selectedArtist ?? ''}
              onChange={(e) => setSelectedArtist(e.target.value || null)}
              className="w-full font-medium py-2 px-3 outline-none appearance-none text-sm cursor-pointer transition-all"
              style={{
                background: 'var(--bg-surface-glass)',
                border: '1px solid var(--border-glass)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text-secondary)',
              }}
              data-testid="artist-filter"
            >
              <option value="">全部歌手</option>
              {allArtists.map(artist => (
                <option key={artist} value={artist}>{artist}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </div>

          {/* Year filter chips */}
          <div className="flex flex-wrap gap-1.5 px-1" data-testid="year-filter-sidebar">
            {availableYears.map(year => (
              <button
                key={year}
                data-testid="year-filter-chip"
                onClick={() => toggleYear(year)}
                className="font-medium text-sm transition-all"
                style={{
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 12px',
                  ...(selectedYears.has(year)
                    ? { background: 'var(--bg-accent-pink)', color: 'var(--accent-pink)' }
                    : { background: 'var(--bg-surface-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }),
                }}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stream Playlists Section ── */}
        <div className="pt-2 pb-2">
          <div
            className="px-3 py-1.5 mb-1 font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)', letterSpacing: '0.1em' }}
          >
            歌枠回放{selectedYears.size > 0 && ` (${Array.from(selectedYears).sort().join(', ')})`}
          </div>
          <button
            onClick={() => setSelectedStreamId(null)}
            className="w-full text-left px-3 py-2 rounded-radius-lg text-sm font-medium transition-all"
            style={
              selectedStreamId === null
                ? { color: 'var(--accent-pink)', background: 'var(--bg-accent-pink)' }
                : { color: 'var(--text-secondary)', background: 'transparent' }
            }
          >
            全部歌曲
          </button>
          {filteredStreams.map(stream => (
            <button
              key={stream.id}
              data-testid="stream-filter-button"
              onClick={() => setSelectedStreamId(stream.id === selectedStreamId ? null : stream.id)}
              className="w-full text-left px-3 py-2 rounded-radius-lg text-sm font-medium transition-all hover:bg-white/40"
              style={
                selectedStreamId === stream.id
                  ? { color: 'var(--accent-pink)', background: 'var(--bg-accent-pink)' }
                  : { color: 'var(--text-secondary)', background: 'transparent' }
              }
            >
              <div className="truncate">{stream.title}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{stream.date}</div>
            </button>
          ))}
        </div>
      </SidebarNav>

      {/* Mobile TopBar — 56px, fixed top, mobile only */}
      <div
        data-testid="mobile-topbar"
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
        style={{
          height: '56px',
          padding: '0 20px',
          background: 'var(--bg-surface-frosted)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-glass)',
        }}
      >
        {/* Left: back button */}
        <button
          aria-label="Back"
          style={{ color: 'var(--text-secondary)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft style={{ width: '24px', height: '24px' }} />
        </button>

        {/* Center: Artist label */}
        <span
          style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}
        >
          Artist
        </span>

        {/* Right: more button */}
        <button
          aria-label="More options"
          style={{ color: 'var(--text-secondary)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <MoreHorizontal style={{ width: '24px', height: '24px' }} />
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:m-3 lg:rounded-3xl overflow-hidden relative shadow-2xl shadow-indigo-100/50 bg-white/40 backdrop-blur-md border border-white/60 flex flex-col" style={{ background: 'var(--bg-surface-glass)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-3xl)' }}>

        {/* Decorative glows */}
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-pink-300/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-40 -left-20 w-72 h-72 bg-blue-300/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Scrollable area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 pt-14 lg:pt-0">

          {/* Home tab content wrapper: always visible on desktop, only on home tab on mobile */}
          <div className={mobileTab !== 'home' ? 'hidden lg:block' : ''}>

          {/* Mobile Hero Section (§3.4.9.3) — vertical layout, mobile only */}
          <header
            data-testid="mobile-hero"
            className="lg:hidden flex flex-col items-center flex-shrink-0"
            style={{
              padding: '16px 24px 24px 24px',
              borderBottom: '1px solid var(--border-glass)',
              gap: '12px',
            }}
          >
            {/* Avatar: 160×160 circle with gradient border and outer shadow */}
            <div
              className="flex-shrink-0"
              style={{
                width: '160px',
                height: '160px',
                borderRadius: '80px',
                padding: '3px',
                background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                boxShadow: '0 8px 32px rgba(244, 114, 182, 0.25)',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '80px',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={streamerData.avatarUrl}
                  alt={streamerData.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.style.background = 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))';
                    }
                  }}
                />
              </div>
            </div>

            {/* Verified Badge: sparkles icon + "Verified Artist" */}
            <div
              className="flex items-center gap-1.5"
              style={{
                background: '#FDF2F8',
                borderRadius: 'var(--radius-pill)',
                padding: '4px 12px 4px 8px',
                color: 'var(--accent-pink)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              <Sparkles style={{ width: '12px', height: '12px' }} />
              Verified Artist
            </div>

            {/* Streamer Name: fontSize 36, fontWeight 900, letterSpacing -0.5 */}
            <h1
              style={{
                fontSize: '36px',
                fontWeight: 900,
                letterSpacing: '-0.5px',
                color: 'var(--text-primary)',
                lineHeight: 1.1,
                textAlign: 'center',
                margin: 0,
              }}
            >
              {streamerData.name}
            </h1>

            {/* Description: "Virtual Singer & Streamer · {songCount} Songs", fontSize 13, centered */}
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Virtual Singer &amp; Streamer
              {' '}
              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              {' '}
              <span style={{ fontWeight: 600 }}>{songs.length} Songs</span>
            </p>

            {/* Stats row: followerCount Followers · Rank #rank (rank in accent-pink), centered */}
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              21.8萬位訂閱者
              {' '}
              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              {' '}
              Rank{' '}
              <span style={{ color: 'var(--accent-pink)', fontWeight: 700 }}>#1</span>
            </p>
          </header>

          {/* Hero Section - Streamer Profile (~280px height) — desktop only */}
          <header
            className="relative hidden lg:flex items-center gap-8 overflow-hidden flex-shrink-0"
            style={{
              minHeight: '280px',
              padding: '40px 40px 0 40px',
              borderBottom: '1px solid var(--border-glass)',
            }}
          >
            {/* Left: Avatar */}
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{
                width: '180px',
                height: '180px',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--border-glass)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                alignSelf: 'flex-end',
                marginBottom: '40px',
              }}
            >
              <img
                src={streamerData.avatarUrl}
                alt={streamerData.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.style.background = 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))';
                    parent.style.display = 'flex';
                    parent.style.alignItems = 'center';
                    parent.style.justifyContent = 'center';
                  }
                }}
              />
            </div>

            {/* Right: Info Stack */}
            <div
              className="flex flex-col justify-end flex-1 min-w-0"
              style={{
                paddingBottom: '40px',
                gap: '8px',
              }}
            >
              {/* VerifiedBadge Component */}
              <div
                className="flex items-center gap-1.5 w-fit"
                style={{
                  background: 'var(--bg-accent-blue-muted)',
                  color: 'var(--accent-blue)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 12px 4px 8px',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 0L7.545 4.455L12 6L7.545 7.545L6 12L4.455 7.545L0 6L4.455 4.455L6 0Z" fill="currentColor" />
                </svg>
                認證藝人
              </div>

              {/* Streamer Name */}
              <h1
                className="tracking-tight leading-none"
                style={{
                  fontSize: 'var(--font-size-3xl)',
                  fontWeight: 900,
                  color: 'var(--text-primary)',
                  lineHeight: 1.1,
                }}
              >
                {streamerData.name}
              </h1>

              {/* Description / Stats Text */}
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--font-size-base)',
                  maxWidth: '480px',
                  lineHeight: 1.5,
                  margin: '2px 0',
                }}
              >
                {streamerData.description}
                {' '}
                <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                {' '}
                <span style={{ fontWeight: 600 }}>{flattenedSongs.length} 首歌曲</span>
              </p>

              {/* Statistics Row: Followers + Rank */}
              <div
                className="flex items-center gap-6"
                style={{ fontSize: 'var(--font-size-base)', marginTop: '4px' }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 'var(--font-size-xl)' }}
                  >
                    21.8萬
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    訂閱者
                  </span>
                </div>
                <div
                  style={{
                    width: '1px',
                    height: '16px',
                    background: 'var(--border-default)',
                  }}
                />
                <div className="flex items-center gap-1.5">
                  <span
                    style={{ fontWeight: 700, color: 'var(--accent-pink)', fontSize: 'var(--font-size-xl)' }}
                  >
                    #1
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    排名
                  </span>
                </div>
              </div>

              {/* Social Links Row */}
              <div className="flex items-center gap-2" style={{ marginTop: '4px' }}>
                {/* YouTube SocialButton */}
                <a
                  href={streamerData.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-all hover:opacity-80"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 14px 6px 10px',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                >
                  <Youtube className="w-4 h-4" style={{ color: '#FF0000' }} />
                  YouTube
                </a>
                {/* Twitter SocialButton */}
                <a
                  href={streamerData.socialLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-all hover:opacity-80"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 14px 6px 10px',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                >
                  <Twitter className="w-4 h-4" style={{ color: '#1DA1F2' }} />
                  X
                </a>
                {/* Facebook SocialButton */}
                <a
                  href={streamerData.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-all hover:opacity-80"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 14px 6px 10px',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                >
                  <Facebook className="w-4 h-4" style={{ color: '#1877F2' }} />
                  Facebook
                </a>
                {/* Instagram SocialButton */}
                <a
                  href={streamerData.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-all hover:opacity-80"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 14px 6px 10px',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                >
                  <Instagram className="w-4 h-4" style={{ color: '#E4405F' }} />
                  Instagram
                </a>
                {/* Twitch SocialButton */}
                <a
                  href={streamerData.socialLinks.twitch}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-all hover:opacity-80"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 14px 6px 10px',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                >
                  <Twitch className="w-4 h-4" style={{ color: '#9146FF' }} />
                  Twitch
                </a>
              </div>
            </div>

            {/* Bottom gradient overlay: white fading to transparent from bottom up */}
            <div
              className="absolute bottom-0 left-0 right-0 pointer-events-none"
              style={{
                height: '60px',
                background: 'linear-gradient(to top, rgba(255,255,255,0.6) 0%, transparent 100%)',
              }}
            />
          </header>

          {/* Mobile Action Bar (§3.4.9.4) — horizontal layout, mobile only */}
          <div
            data-testid="mobile-action-bar"
            className="lg:hidden flex items-center flex-shrink-0"
            style={{
              padding: '0 20px',
              gap: '12px',
              minHeight: '64px',
              background: 'var(--bg-overlay)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderBottom: '1px solid var(--border-glass)',
            }}
          >
            {/* Play button: 48×48 circle, gradient fill (pink→blue) */}
            <button
              data-testid="mobile-play-all-button"
              className="flex items-center justify-center flex-shrink-0 transition-all hover:scale-105"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                color: 'white',
                boxShadow: '0 4px 16px rgba(244, 114, 182, 0.35)',
              }}
              title="播放全部"
              onClick={handlePlayAll}
            >
              <Play className="w-5 h-5 fill-current" style={{ marginLeft: '2px' }} />
            </button>

            {/* Shuffle button: gradient fill when active, outline when off */}
            <button
              data-testid="mobile-shuffle-button"
              onClick={() => toggleShuffle()}
              className="flex items-center justify-center flex-shrink-0 transition-all hover:opacity-90"
              style={{
                background: shuffleOn
                  ? 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))'
                  : 'transparent',
                border: shuffleOn ? 'none' : '2px solid var(--accent-pink-light)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 28px',
                color: shuffleOn ? 'white' : 'var(--accent-pink)',
              }}
              title="隨機播放"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            {/* Flexible spacer */}
            <div style={{ flex: 1 }} />

            {/* Follow button: outline style */}
            <a
              href={streamerData.socialLinks.youtube}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="mobile-follow-button"
              className="flex items-center justify-center flex-shrink-0 font-semibold transition-all hover:opacity-80"
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '20px',
                padding: '8px 24px',
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-sm)',
                background: 'transparent',
              }}
            >
              追蹤
            </a>
          </div>

          {/* Mobile Year Filter Scroll — horizontal scrolling row, mobile only */}
          <div
            data-testid="mobile-stream-scroll"
            className="lg:hidden flex items-center flex-shrink-0"
            style={{
              padding: '12px 20px',
              gap: '8px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              borderBottom: '1px solid var(--border-glass)',
            }}
          >
            {/* All years chip */}
            <button
              onClick={clearYears}
              className="flex-shrink-0 font-medium transition-all"
              style={{
                height: '36px',
                borderRadius: '12px',
                padding: '0 16px',
                fontSize: 'var(--font-size-sm)',
                ...(selectedYears.size === 0
                  ? {
                      background: '#FDF2F8',
                      border: '1px solid #FBCFE8',
                      color: 'var(--accent-pink)',
                    }
                  : {
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                    }),
              }}
            >
              全部
            </button>
            {availableYears.map(year => (
              <button
                key={year}
                data-testid="year-filter-chip"
                onClick={() => toggleYear(year)}
                className="flex-shrink-0 font-medium transition-all"
                style={{
                  height: '36px',
                  borderRadius: '12px',
                  padding: '0 16px',
                  fontSize: 'var(--font-size-sm)',
                  whiteSpace: 'nowrap',
                  ...(selectedYears.has(year)
                    ? {
                        background: '#FDF2F8',
                        border: '1px solid #FBCFE8',
                        color: 'var(--accent-pink)',
                      }
                    : {
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                      }),
                }}
              >
                {year}
              </button>
            ))}
          </div>

          {/* Streamer switcher */}
          {streamersData.length > 1 && (
            <div data-testid="streamer-switcher" className="flex items-center gap-1.5 flex-wrap px-6" style={{ marginBottom: '8px', marginTop: '8px' }}>
              <button
                data-testid="streamer-filter-all"
                onClick={() => setSelectedStreamers([])}
                style={{
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: selectedStreamers.length === 0 ? 'var(--accent-pink)' : 'var(--bg-surface-frosted)',
                  color: selectedStreamers.length === 0 ? 'white' : 'var(--text-secondary)',
                }}
              >
                All
              </button>
              {streamersData.map((s) => (
                <button
                  key={s.channelId}
                  data-testid={`streamer-filter-${s.channelId}`}
                  onClick={() => {
                    setSelectedStreamers((prev) =>
                      prev.includes(s.channelId)
                        ? prev.filter((id) => id !== s.channelId)
                        : [...prev, s.channelId]
                    );
                  }}
                  style={{
                    padding: '4px 12px 4px 6px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: selectedStreamers.includes(s.channelId) ? 'var(--accent-pink)' : 'var(--bg-surface-frosted)',
                    color: selectedStreamers.includes(s.channelId) ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  <img
                    src={s.avatarUrl}
                    alt={s.displayName}
                    style={{ width: '20px', height: '20px', borderRadius: '50%' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  {s.displayName}
                </button>
              ))}
            </div>
          )}

          {/* Action Bar — desktop only */}
          <div
            className="hidden lg:flex sticky top-0 z-20 px-6 items-center gap-3 flex-wrap"
            style={{
              background: 'var(--bg-overlay)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderTop: '1px solid var(--border-glass)',
              borderBottom: '1px solid var(--border-glass)',
              minHeight: '64px',
              paddingTop: '10px',
              paddingBottom: '10px',
            }}
          >
            {/* Left side: Play Controls */}
            <div className="flex items-center gap-3 flex-shrink-0">

              {/* PlayButton — 48×48 circular gradient play button */}
              <button
                data-testid="desktop-play-all-button"
                className="bg-gradient-to-r from-pink-400 to-blue-400 text-white flex items-center justify-center transition-all hover:scale-105 hover:brightness-110 flex-shrink-0"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-circle)',
                  background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                  boxShadow: '0 4px 16px rgba(244, 114, 182, 0.35)',
                }}
                title="播放全部"
                onClick={handlePlayAll}
              >
                <Play className="w-5 h-5 fill-current" style={{ marginLeft: '2px' }} />
              </button>

              {/* GradientButton — "播放全部" pill */}
              <button
                className="font-semibold text-white flex items-center gap-1.5 transition-all hover:opacity-90 flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 'var(--font-size-sm)',
                  padding: 'var(--space-3) var(--space-5)',
                  color: 'var(--text-on-accent)',
                }}
                onClick={handlePlayAll}
              >
                播放全部
              </button>

              {/* OutlineButton — "追蹤" follow link (secondary action) */}
              <a
                href={streamerData.socialLinks.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold flex items-center gap-1.5 transition-all hover:opacity-80 flex-shrink-0"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 'var(--font-size-sm)',
                  padding: 'var(--space-3) var(--space-5)',
                  color: 'var(--text-secondary)',
                }}
              >
                追蹤
              </a>

              {/* View Mode Toggle — restyled to match design language */}
              <div
                className="hidden lg:flex items-center gap-1 flex-shrink-0"
                style={{
                  background: 'var(--bg-surface-muted)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '3px',
                  border: '1px solid var(--border-glass)',
                }}
              >
                <button
                  data-testid="view-toggle-timeline"
                  onClick={() => setViewMode('timeline')}
                  className={`flex items-center gap-1.5 font-semibold transition-all ${
                    viewMode === 'timeline'
                      ? 'bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow-md'
                      : ''
                  }`}
                  style={{
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--font-size-sm)',
                    padding: 'var(--space-2) var(--space-4)',
                    color: viewMode === 'timeline' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  }}
                >
                  <Clock className="w-3.5 h-3.5" />
                  時間序列
                </button>
                <button
                  data-testid="view-toggle-grouped"
                  onClick={() => setViewMode('grouped')}
                  className={`flex items-center gap-1.5 font-semibold transition-all ${
                    viewMode === 'grouped'
                      ? 'bg-gradient-to-r from-pink-400 to-blue-400 text-white shadow-md'
                      : ''
                  }`}
                  style={{
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--font-size-sm)',
                    padding: 'var(--space-2) var(--space-4)',
                    color: viewMode === 'grouped' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  }}
                >
                  <Disc3 className="w-3.5 h-3.5" />
                  歌曲分組
                </button>
              </div>
            </div>

            {/* Flexible spacer */}
            <div className="flex-1 hidden lg:block" />

            {/* Right side: Year Filter Chips */}
            <div className="hidden lg:flex items-center gap-1.5 flex-wrap" data-testid="year-filter-bar">
              {/* "全部" chip */}
              <button
                onClick={clearYears}
                className="font-medium transition-all"
                style={{
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 'var(--font-size-sm)',
                  padding: 'var(--space-2) var(--space-4)',
                  ...(selectedYears.size === 0
                    ? {
                        background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                        color: 'var(--text-on-accent)',
                      }
                    : {
                        background: 'var(--bg-surface-muted)',
                        color: 'var(--text-secondary)',
                      }),
                }}
              >
                全部
              </button>
              {availableYears.map(year => (
                <button
                  key={year}
                  data-testid="year-filter-chip"
                  onClick={() => toggleYear(year)}
                  className="font-medium transition-all"
                  style={{
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--font-size-sm)',
                    padding: 'var(--space-2) var(--space-4)',
                    ...(selectedYears.has(year)
                      ? {
                          background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                          color: 'var(--text-on-accent)',
                        }
                      : {
                          background: 'var(--bg-surface-muted)',
                          color: 'var(--text-secondary)',
                        }),
                  }}
                >
                  {year}
                </button>
              ))}
            </div>

          </div>

          {/* Song List - Conditional Rendering based on View Mode */}
          <div className="px-4 pb-32 mt-2">
            {loadError ? (
              /* Song API Load Error State */
              <div
                data-testid="song-load-error"
                className="flex flex-col items-center justify-center py-32 gap-6"
                style={{ color: 'var(--text-secondary)' }}
              >
                <div
                  className="flex items-center justify-center w-16 h-16 rounded-full"
                  style={{ background: 'var(--bg-accent-pink-muted)' }}
                >
                  <WifiOff className="w-8 h-8" style={{ color: 'var(--accent-pink)' }} />
                </div>
                <p
                  className="text-center font-medium max-w-sm"
                  style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)', lineHeight: 1.6 }}
                >
                  無法載入歌曲資料，請檢查網路連線後重新整理頁面
                </p>
                <button
                  data-testid="retry-button"
                  onClick={fetchSongs}
                  className="font-semibold transition-all hover:opacity-90"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--font-size-sm)',
                    padding: 'var(--space-3) var(--space-6)',
                    color: 'var(--text-on-accent)',
                  }}
                >
                  重新整理
                </button>
              </div>
            ) : viewMode === 'timeline' ? (
              /* Timeline View */
              <>
                {/* SongTableHeader */}
                <div
                  className="grid grid-cols-[32px_40px_1fr_60px] lg:grid-cols-[32px_40px_2fr_2fr_100px_60px] gap-0 px-3 py-2 sticky top-[88px] z-10"
                  style={{
                    borderBottom: '1px solid var(--border-table)',
                  }}
                >
                  <div
                    className="flex items-center justify-center text-center font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}
                  >
                    #
                  </div>
                  {/* Album art header spacer */}
                  <div />
                  <div
                    className="flex items-center font-bold uppercase tracking-wider lg:pl-3"
                    style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}
                  >
                    標題
                  </div>
                  <div
                    className="hidden lg:flex items-center font-bold uppercase tracking-wider pl-3"
                    style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}
                  >
                    出處直播
                  </div>
                  <div
                    className="hidden lg:flex items-center font-bold uppercase tracking-wider pl-3"
                    style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}
                  >
                    發布日期
                  </div>
                  <div
                    className="flex items-center justify-center"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <Clock style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)' }} />
                  </div>
                </div>

                <div className="mt-1 space-y-0.5">
                  {flattenedSongs.length === 0 ? (
                    songs.length === 0 && !hasActiveFilters ? (
                      <div className="py-20 text-center" data-testid="empty-catalog" style={{ color: 'var(--text-tertiary)' }}>
                        <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>目前尚無歌曲資料</p>
                      </div>
                    ) : (
                      <div className="py-20 text-center" data-testid="empty-state" style={{ color: 'var(--text-tertiary)' }}>
                        <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>找不到符合條件的歌曲</p>
                        {hasActiveFilters && (
                          <button
                            onClick={clearAllFilters}
                            className="mt-3 text-sm font-medium underline underline-offset-2 transition-colors"
                            style={{ color: 'var(--accent-pink)' }}
                            data-testid="clear-filters-empty"
                          >
                            清除所有篩選條件
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    flattenedSongs.map((song, index) => {
                      const isCurrentlyPlaying = currentTrack?.id === song.performanceId;
                      return (
                        <div
                          key={`${song.id}-${song.performanceId}`}
                          data-testid="performance-row"
                          className="group grid grid-cols-[32px_40px_1fr_60px] lg:grid-cols-[32px_40px_2fr_2fr_100px_60px] gap-0 items-center transition-all cursor-default"
                          style={{
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-3) var(--space-4)',
                            background: isCurrentlyPlaying
                              ? '#FCE7F320'
                              : undefined,
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrentlyPlaying) {
                              (e.currentTarget as HTMLElement).style.background = 'var(--bg-accent-pink)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrentlyPlaying) {
                              (e.currentTarget as HTMLElement).style.background = '';
                            }
                          }}
                        >
                          {/* # column: row number / play button — visible on mobile and desktop */}
                          <div
                            className="flex items-center justify-center relative"
                            style={{ width: '32px', height: '32px' }}
                          >
                            {/* Mobile: show number or accent music note when playing */}
                            <span
                              className="lg:hidden font-mono select-none"
                              style={{
                                fontSize: '14px',
                                color: isCurrentlyPlaying ? 'var(--accent-pink)' : 'var(--text-tertiary)',
                              }}
                            >
                              {index + 1}
                            </span>
                            {/* Desktop: number that fades on hover, replaced by play button */}
                            <span
                              className="hidden lg:block group-hover:opacity-0 transition-opacity font-mono text-sm select-none"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              {index + 1}
                            </span>
                            <button
                              onClick={() => {
                                if (!unavailableVideoIds.has(song.videoId)) {
                                  playTrack({
                                    id: song.performanceId,
                                    songId: song.id,
                                    title: song.title,
                                    originalArtist: song.originalArtist,
                                    videoId: song.videoId,
                                    timestamp: song.timestamp,
                                    endTimestamp: song.endTimestamp,
                                    albumArtUrl: song.albumArtUrl,
                                  });
                                }
                              }}
                              disabled={unavailableVideoIds.has(song.videoId)}
                              data-testid="play-button"
                              className={`hidden lg:flex absolute inset-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-all ${
                                unavailableVideoIds.has(song.videoId)
                                  ? 'cursor-not-allowed'
                                  : 'transform hover:scale-110'
                              }`}
                              style={{
                                color: unavailableVideoIds.has(song.videoId)
                                  ? 'var(--text-muted)'
                                  : 'var(--accent-pink)',
                              }}
                            >
                              <Play className="w-4 h-4 fill-current" />
                            </button>
                          </div>

                          {/* Album art column — 32×32 thumbnail */}
                          <div className="flex items-center justify-center">
                            <AlbumArt
                              src={song.albumArtUrl}
                              alt={`${song.title} - ${song.originalArtist}`}
                              size={32}
                            />
                          </div>

                          {/* Title column: song title + artist + NoteBadge */}
                          <div
                            className="min-w-0 lg:pl-3 cursor-pointer"
                            onClick={() => {
                              if (!unavailableVideoIds.has(song.videoId)) {
                                playTrack({
                                  id: song.performanceId,
                                  songId: song.id,
                                  title: song.title,
                                  originalArtist: song.originalArtist,
                                  videoId: song.videoId,
                                  timestamp: song.timestamp,
                                  endTimestamp: song.endTimestamp,
                                  albumArtUrl: song.albumArtUrl,
                                });
                              }
                            }}
                          >
                            {/* Unified title block — vertical stack, responsive font sizing */}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div
                                  className="font-bold truncate"
                                  style={{
                                    fontSize: '15px',
                                    color: isCurrentlyPlaying ? 'var(--accent-pink-dark)' : 'var(--text-primary)',
                                  }}
                                >
                                  {song.title}
                                </div>
                                {song.note && (
                                  <span
                                    className="inline-flex items-center border font-medium flex-shrink-0"
                                    style={{
                                      background: 'var(--bg-accent-blue-muted)',
                                      color: 'var(--accent-blue)',
                                      borderColor: 'var(--border-accent-blue)',
                                      borderRadius: 'var(--radius-pill)',
                                      fontSize: 'var(--font-size-xs)',
                                      padding: 'var(--space-1) var(--space-3)',
                                    }}
                                  >
                                    {song.note}
                                  </span>
                                )}
                              </div>
                              <div
                                className="truncate"
                                style={{
                                  fontSize: '13px',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {song.originalArtist}
                              </div>
                            </div>
                          </div>

                          {/* Stream title column (desktop only) */}
                          <div
                            className="hidden lg:flex items-center min-w-0 pl-3"
                            style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}
                          >
                            <span className="truncate">{song.streamTitle}</span>
                          </div>

                          {/* Date column (desktop only) */}
                          <div
                            className="hidden lg:flex items-center pl-3 font-mono"
                            style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}
                          >
                            {song.date}
                          </div>

                          {/* Duration / Actions column */}
                          <div
                            className="flex items-center justify-end gap-1.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <button
                              onClick={() => handleAddToQueue({
                                id: song.performanceId,
                                songId: song.id,
                                title: song.title,
                                originalArtist: song.originalArtist,
                                videoId: song.videoId,
                                timestamp: song.timestamp,
                                endTimestamp: song.endTimestamp,
                                albumArtUrl: song.albumArtUrl,
                              })}
                              className="opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110"
                              style={{
                                background: 'var(--bg-surface)',
                                padding: 'var(--space-2)',
                                borderRadius: 'var(--radius-circle)',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                color: 'var(--text-secondary)',
                              }}
                              title="加入佇列"
                              data-testid="add-to-queue"
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-pink)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <div
                              className="opacity-0 group-hover:opacity-100 transition-all"
                              style={{
                                background: 'var(--bg-surface)',
                                padding: 'var(--space-2)',
                                borderRadius: 'var(--radius-circle)',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <AddToPlaylistDropdown
                                version={{
                                  performanceId: song.performanceId,
                                  songTitle: song.title,
                                  originalArtist: song.originalArtist,
                                  videoId: song.videoId,
                                  timestamp: song.timestamp,
                                }}
                                onSuccess={handleAddToPlaylistSuccess}
                              />
                            </div>
                            <a
                              href={`https://www.youtube.com/watch?v=${song.videoId}&t=${song.timestamp}s`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110"
                              style={{
                                background: 'var(--bg-surface)',
                                padding: 'var(--space-2)',
                                borderRadius: 'var(--radius-circle)',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              title="在 YouTube 開啟"
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#FF0000'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <span
                              className="font-mono text-right"
                              style={{
                                minWidth: '40px',
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {formatTime(song.timestamp)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              /* Grouped View */
              <div className="mt-2 space-y-3">
                {groupedSongs.length === 0 ? (
                  songs.length === 0 && !hasActiveFilters ? (
                    <div className="py-20 text-center" data-testid="empty-catalog" style={{ color: 'var(--text-tertiary)' }}>
                      <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>目前尚無歌曲資料</p>
                    </div>
                  ) : (
                    <div className="py-20 text-center" data-testid="empty-state" style={{ color: 'var(--text-tertiary)' }}>
                      <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>找不到符合條件的歌曲</p>
                      {hasActiveFilters && (
                        <button
                          onClick={clearAllFilters}
                          className="mt-3 text-sm font-medium underline underline-offset-2 transition-colors"
                          style={{ color: 'var(--accent-pink)' }}
                          data-testid="clear-filters-empty"
                        >
                          清除所有篩選條件
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  groupedSongs.map((song) => {
                    const isExpanded = expandedSongs.has(song.id);
                    const sortedPerformances = [...song.performances].sort(
                      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                    );

                    return (
                      <div
                        key={song.id}
                        data-testid="song-card"
                        className="overflow-hidden transition-all"
                        style={{
                          background: 'var(--bg-surface-glass)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: 'var(--radius-xl)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                        }}
                      >
                        {/* Song Header - Clickable */}
                        <button
                          onClick={() => toggleSongExpansion(song.id)}
                          className="w-full flex items-center justify-between transition-all group"
                          style={{
                            padding: 'var(--space-5) var(--space-6)',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = 'var(--bg-accent-pink)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = '';
                          }}
                        >
                          <div className="flex items-start gap-4 flex-1 text-left">
                            <div
                              className="flex items-center justify-center flex-shrink-0"
                              style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'linear-gradient(135deg, var(--bg-accent-pink-muted), var(--bg-accent-blue-muted))',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                              }}
                            >
                              <Disc3 className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3
                                className="font-bold truncate"
                                style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-primary)', lineHeight: 1.3 }}
                              >
                                {song.title}
                              </h3>
                              <p
                                className="truncate mt-1"
                                style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}
                              >
                                {song.originalArtist}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span
                                  className="font-bold"
                                  style={{
                                    fontSize: 'var(--font-size-xs)',
                                    color: 'var(--accent-pink)',
                                    background: 'var(--bg-accent-pink-muted)',
                                    padding: 'var(--space-1) var(--space-3)',
                                    borderRadius: 'var(--radius-pill)',
                                    border: '1px solid var(--border-accent-pink)',
                                  }}
                                >
                                  {song.performances.length} 個版本
                                </span>
                              </div>
                            </div>
                          </div>
                          <div
                            className="ml-4 transition-colors"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5" />
                            ) : (
                              <ChevronRight className="w-5 h-5" />
                            )}
                          </div>
                        </button>

                        {/* Expanded Versions List */}
                        {isExpanded && (
                          <div
                            data-testid="versions-list"
                            className="space-y-0.5 px-3 pb-3"
                            style={{
                              borderTop: '1px solid var(--border-table)',
                              paddingTop: 'var(--space-3)',
                            }}
                          >
                            {sortedPerformances.map((perf) => (
                              <div
                                key={perf.id}
                                data-testid="version-row"
                                className="group/version grid grid-cols-[1fr_60px] lg:grid-cols-[32px_1fr_140px_60px] gap-0 items-center transition-all"
                                style={{
                                  borderRadius: 'var(--radius-lg)',
                                  padding: 'var(--space-3) var(--space-4)',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-accent-pink)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = '';
                                }}
                              >
                                {/* Play button column — desktop only */}
                                <div
                                  className="hidden lg:flex items-center justify-center"
                                  style={{ width: '32px', height: '32px' }}
                                >
                                  <button
                                    onClick={() => {
                                      if (!unavailableVideoIds.has(perf.videoId)) {
                                        playTrack({
                                          id: perf.id,
                                          songId: song.id,
                                          title: song.title,
                                          originalArtist: song.originalArtist,
                                          videoId: perf.videoId,
                                          timestamp: perf.timestamp,
                                          endTimestamp: perf.endTimestamp ?? undefined,
                                          albumArtUrl: song.albumArtUrl,
                                        });
                                      }
                                    }}
                                    disabled={unavailableVideoIds.has(perf.videoId)}
                                    data-testid="play-button"
                                    className={`w-8 h-8 rounded-full text-white flex items-center justify-center opacity-0 group-hover/version:opacity-100 transition-all flex-shrink-0 ${
                                      unavailableVideoIds.has(perf.videoId)
                                        ? 'cursor-not-allowed'
                                        : 'hover:scale-110'
                                    }`}
                                    style={{
                                      background: unavailableVideoIds.has(perf.videoId)
                                        ? 'var(--text-muted)'
                                        : 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                                      boxShadow: '0 2px 8px rgba(244, 114, 182, 0.3)',
                                    }}
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" style={{ marginLeft: '1px' }} />
                                  </button>
                                </div>

                                {/* Date + Note + Stream title */}
                                <div className="min-w-0 pl-1 lg:pl-3 flex items-center gap-2 lg:block">
                                  {/* Mobile play button */}
                                  <button
                                    onClick={() => {
                                      if (!unavailableVideoIds.has(perf.videoId)) {
                                        playTrack({
                                          id: perf.id,
                                          songId: song.id,
                                          title: song.title,
                                          originalArtist: song.originalArtist,
                                          videoId: perf.videoId,
                                          timestamp: perf.timestamp,
                                          endTimestamp: perf.endTimestamp ?? undefined,
                                          albumArtUrl: song.albumArtUrl,
                                        });
                                      }
                                    }}
                                    disabled={unavailableVideoIds.has(perf.videoId)}
                                    data-testid="mobile-play-button"
                                    className={`lg:hidden flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full ${
                                      unavailableVideoIds.has(perf.videoId) ? 'cursor-not-allowed opacity-40' : ''
                                    }`}
                                    style={{
                                      background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                                      color: 'white',
                                    }}
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" style={{ marginLeft: '1px' }} />
                                  </button>
                                  <div className="min-w-0 flex-1 lg:flex-none">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className="font-mono text-sm"
                                      style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}
                                    >
                                      {perf.date}
                                    </span>
                                    {perf.note && (
                                      <span
                                        className="inline-flex items-center border border-blue-200 text-blue-500 bg-blue-50 font-medium"
                                        style={{
                                          background: 'var(--bg-accent-blue-muted)',
                                          color: 'var(--accent-blue)',
                                          borderRadius: 'var(--radius-pill)',
                                          fontSize: 'var(--font-size-xs)',
                                          padding: 'var(--space-1) var(--space-3)',
                                        }}
                                      >
                                        {perf.note}
                                      </span>
                                    )}
                                  </div>
                                  <p
                                    className="truncate mt-0.5"
                                    style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}
                                  >
                                    {perf.streamTitle}
                                  </p>
                                  </div>
                                </div>

                                {/* Date column desktop (extra info hidden on mobile) */}
                                <div
                                  className="hidden lg:flex items-center min-w-0 pl-3"
                                  style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-xs)' }}
                                >
                                </div>

                                {/* Actions + Duration */}
                                <div
                                  className="flex items-center justify-end gap-1.5"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  <button
                                    onClick={() => handleAddToQueue({
                                      id: perf.id,
                                      songId: song.id,
                                      title: song.title,
                                      originalArtist: song.originalArtist,
                                      videoId: perf.videoId,
                                      timestamp: perf.timestamp,
                                      endTimestamp: perf.endTimestamp ?? undefined,
                                      albumArtUrl: song.albumArtUrl,
                                    })}
                                    className="opacity-0 group-hover/version:opacity-100 transition-all transform hover:scale-110"
                                    style={{
                                      background: 'var(--bg-surface)',
                                      padding: 'var(--space-2)',
                                      borderRadius: 'var(--radius-circle)',
                                      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                      color: 'var(--text-secondary)',
                                    }}
                                    title="加入佇列"
                                    data-testid="add-to-queue"
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-pink)'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                  <div
                                    className="opacity-0 group-hover/version:opacity-100 transition-all"
                                    style={{
                                      background: 'var(--bg-surface)',
                                      padding: 'var(--space-2)',
                                      borderRadius: 'var(--radius-circle)',
                                      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    <AddToPlaylistDropdown
                                      version={{
                                        performanceId: perf.id,
                                        songTitle: song.title,
                                        originalArtist: song.originalArtist,
                                        videoId: perf.videoId,
                                        timestamp: perf.timestamp,
                                      }}
                                      onSuccess={handleAddToPlaylistSuccess}
                                    />
                                  </div>
                                  <a
                                    href={`https://www.youtube.com/watch?v=${perf.videoId}&t=${perf.timestamp}s`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="opacity-0 group-hover/version:opacity-100 transition-all transform hover:scale-110"
                                    style={{
                                      background: 'var(--bg-surface)',
                                      padding: 'var(--space-2)',
                                      borderRadius: 'var(--radius-circle)',
                                      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                      color: 'var(--text-secondary)',
                                      display: 'flex',
                                      alignItems: 'center',
                                    }}
                                    title="在 YouTube 開啟"
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#FF0000'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                  <span
                                    className="font-mono text-right"
                                    style={{
                                      minWidth: '40px',
                                      fontSize: 'var(--font-size-sm)',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {formatTime(perf.timestamp)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
          {/* End home tab content wrapper */}
          </div>

          {/* Mobile Search Tab content — only visible on mobile when Search tab is active */}
          {mobileTab === 'search' && (
            <div
              className="lg:hidden flex-1 px-4 pt-4 pb-32"
              data-testid="mobile-search-tab"
            >
              {/* Search input */}
              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                <input
                  type="text"
                  placeholder="搜尋..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full py-3 pl-10 pr-4 text-sm outline-none"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-pill)',
                    color: 'var(--text-primary)',
                    backdropFilter: 'blur(8px)',
                  }}
                  data-testid="mobile-search-input"
                  autoFocus
                />
              </div>
              {/* Artist filter */}
              <div className="relative mb-3">
                <select
                  value={selectedArtist ?? ''}
                  onChange={(e) => setSelectedArtist(e.target.value || null)}
                  className="w-full font-medium py-2 px-3 outline-none appearance-none text-sm cursor-pointer"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--text-secondary)',
                  }}
                  data-testid="mobile-artist-filter"
                >
                  <option value="">全部歌手</option>
                  {allArtists.map(artist => (
                    <option key={artist} value={artist}>{artist}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                </div>
              </div>
              {/* Search results */}
              <div className="space-y-0.5">
                {flattenedSongs.map((song, index) => {
                  const isCurrentlyPlaying = currentTrack?.id === song.performanceId;
                  return (
                    <div
                      key={`search-${song.id}-${song.performanceId}`}
                      data-testid="performance-row"
                      className="flex items-center gap-3 transition-all cursor-default"
                      style={{
                        borderRadius: 'var(--radius-lg)',
                        padding: '12px 16px',
                        background: isCurrentlyPlaying ? 'var(--bg-accent-pink-muted)' : undefined,
                      }}
                    >
                      <button
                        onClick={() => {
                          if (!unavailableVideoIds.has(song.videoId)) {
                            playTrack({
                              id: song.performanceId,
                              songId: song.id,
                              title: song.title,
                              originalArtist: song.originalArtist,
                              videoId: song.videoId,
                              timestamp: song.timestamp,
                              endTimestamp: song.endTimestamp,
                              albumArtUrl: song.albumArtUrl,
                            });
                          }
                        }}
                        disabled={unavailableVideoIds.has(song.videoId)}
                        className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full ${unavailableVideoIds.has(song.videoId) ? 'opacity-40 cursor-not-allowed' : ''}`}
                        style={{
                          background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))',
                          color: 'white',
                        }}
                      >
                        <Play className="w-4 h-4 fill-current" style={{ marginLeft: '2px' }} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-bold truncate"
                          style={{ fontSize: '15px', fontWeight: 600, color: isCurrentlyPlaying ? 'var(--accent-pink)' : 'var(--text-primary)' }}
                        >
                          {song.title}
                        </div>
                        <div className="truncate" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {song.originalArtist}
                        </div>
                      </div>
                      <span className="font-mono" style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '40px', textAlign: 'right' }}>
                        {formatTime(song.timestamp)}
                      </span>
                    </div>
                  );
                })}
                {flattenedSongs.length === 0 && (
                  <div className="py-16 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    <p className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>找不到符合條件的歌曲</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mobile Library Tab content — only visible on mobile when Library tab is active */}
          {mobileTab === 'library' && (
            <div
              className="lg:hidden flex-1 px-4 pt-4 pb-32"
              data-testid="mobile-library-tab"
            >
              <div className="mb-4">
                <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>你的音樂庫</h2>

                {/* Liked Songs */}
                <button
                  onClick={() => setShowLikedSongsPanel(true)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-radius-lg font-medium text-sm transition-all mb-2"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-lg)',
                  }}
                  data-testid="mobile-liked-songs-button"
                >
                  <span className="flex items-center gap-3">
                    <Heart className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-pink)' }} />
                    喜愛的歌曲
                  </span>
                  {likedCount > 0 && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--bg-accent-pink-muted)', color: 'var(--accent-pink)' }}
                    >
                      {likedCount}
                    </span>
                  )}
                </button>

                {/* Recently Played */}
                <button
                  onClick={() => setShowRecentlyPlayedPanel(true)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-radius-lg font-medium text-sm transition-all mb-2"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-lg)',
                  }}
                  data-testid="mobile-recently-played-button"
                >
                  <span className="flex items-center gap-3">
                    <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-pink)' }} />
                    最近播放
                  </span>
                  {recentCount > 0 && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--bg-accent-pink-muted)', color: 'var(--accent-pink)' }}
                    >
                      {recentCount}
                    </span>
                  )}
                </button>

                {/* Create Playlist */}
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-radius-lg font-medium text-sm transition-all"
                  style={{
                    background: 'var(--bg-surface-glass)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-lg)',
                  }}
                  data-testid="mobile-create-playlist-button"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-pink)' }} />
                  建立新播放清單
                </button>
              </div>
              {playlists.length > 0 ? (
                <div>
                  <button
                    onClick={() => setShowPlaylistPanel(true)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-radius-lg font-medium text-sm transition-all mb-2"
                    style={{
                      background: 'var(--bg-surface-glass)',
                      border: '1px solid var(--border-glass)',
                      color: 'var(--text-secondary)',
                      borderRadius: 'var(--radius-lg)',
                    }}
                    data-testid="mobile-view-playlists-button"
                  >
                    <span className="flex items-center gap-3">
                      <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-pink)' }} />
                      查看播放清單
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--bg-accent-pink-muted)', color: 'var(--accent-pink)' }}
                    >
                      {playlists.length}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="py-16 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  <p className="text-base" style={{ color: 'var(--text-secondary)' }}>尚無播放清單，立即建立一個吧！</p>
                </div>
              )}
            </div>
          )}

          {/* Mobile Profile Tab content — only visible on mobile when Profile tab is active */}
          {mobileTab === 'profile' && (
            <div
              className="lg:hidden flex-1 px-4 pt-4 pb-32"
              data-testid="mobile-profile-tab"
            >
              <div className="text-center py-8">
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center p-1"
                  style={{ background: 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))' }}
                >
                  <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: 'var(--bg-surface-frosted)' }}>
                    <Sparkles className="w-9 h-9" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                </div>
                <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>帳號功能即將推出</p>
                <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>目前可使用播放清單的匯出/匯入功能</p>
              </div>
            </div>
          )}
        </div>
      </main>
      </div>

      {/* Mobile BottomNav — 64px, fixed bottom, mobile only */}
      <nav
        data-testid="mobile-bottom-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-[70] flex items-start justify-around"
        style={{
          height: '64px',
          padding: '8px 0 16px 0',
          background: 'var(--bg-surface-frosted)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-glass)',
        }}
      >
        {/* Home */}
        <button
          data-testid="bottom-nav-home"
          onClick={() => setMobileTab('home')}
          className="flex flex-col items-center justify-start"
          style={{ gap: '4px', flex: 1 }}
        >
          <House
            style={{
              width: '22px',
              height: '22px',
              color: mobileTab === 'home' ? 'var(--accent-pink)' : 'var(--text-tertiary)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: mobileTab === 'home' ? 700 : 500,
              color: mobileTab === 'home' ? 'var(--accent-pink)' : 'var(--text-tertiary)',
            }}
          >
            Home
          </span>
        </button>

        {/* Search */}
        <button
          data-testid="bottom-nav-search"
          onClick={() => setMobileTab('search')}
          className="flex flex-col items-center justify-start"
          style={{ gap: '4px', flex: 1 }}
        >
          <Search
            style={{
              width: '22px',
              height: '22px',
              color: mobileTab === 'search' ? 'var(--accent-pink)' : 'var(--text-tertiary)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: mobileTab === 'search' ? 700 : 500,
              color: mobileTab === 'search' ? 'var(--accent-pink)' : 'var(--text-tertiary)',
            }}
          >
            Search
          </span>
        </button>

        {/* Library */}
        <button
          data-testid="bottom-nav-library"
          onClick={() => setMobileTab('library')}
          className="flex flex-col items-center justify-start"
          style={{ gap: '4px', flex: 1 }}
        >
          <ListMusic
            style={{
              width: '22px',
              height: '22px',
              color: mobileTab === 'library' ? 'var(--accent-pink)' : 'var(--text-tertiary)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: mobileTab === 'library' ? 700 : 500,
              color: mobileTab === 'library' ? 'var(--accent-pink)' : 'var(--text-tertiary)',
            }}
          >
            Library
          </span>
        </button>

        {/* Profile */}
        <button
          data-testid="bottom-nav-profile"
          onClick={() => setMobileTab('profile')}
          className="flex flex-col items-center justify-start"
          style={{ gap: '4px', flex: 1 }}
        >
          {/* Gradient ellipse avatar icon */}
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: mobileTab === 'profile'
                ? 'linear-gradient(135deg, var(--accent-pink-light), var(--accent-blue-light))'
                : 'var(--bg-surface-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: mobileTab === 'profile' ? 'none' : '1px solid var(--border-glass)',
            }}
          >
            <User
              style={{
                width: '12px',
                height: '12px',
                color: mobileTab === 'profile' ? 'white' : 'var(--text-tertiary)',
              }}
            />
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: mobileTab === 'profile' ? 700 : 500,
              color: mobileTab === 'profile' ? 'var(--accent-pink)' : 'var(--text-tertiary)',
            }}
          >
            Profile
          </span>
        </button>
      </nav>

      {/* Playlist UI */}
      <PlaylistPanel
        show={showPlaylistPanel}
        onClose={() => setShowPlaylistPanel(false)}
        songsData={songs}
        onToast={(msg) => { setToastMessage(msg); setShowToast(true); }}
      />
      <LikedSongsPanel
        show={showLikedSongsPanel}
        onClose={() => setShowLikedSongsPanel(false)}
        onToast={(msg) => { setToastMessage(msg); setShowToast(true); }}
      />
      <RecentlyPlayedPanel
        show={showRecentlyPlayedPanel}
        onClose={() => setShowRecentlyPlayedPanel(false)}
        onToast={(msg) => { setToastMessage(msg); setShowToast(true); }}
      />
      <CreatePlaylistDialog
        show={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={() => {
          setToastMessage('播放清單已建立');
          setShowToast(true);
        }}
      />
    </>
  );
}
