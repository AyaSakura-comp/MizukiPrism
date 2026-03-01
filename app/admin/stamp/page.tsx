// app/admin/stamp/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Video,
  Music2,
  ChevronRight,
  Clock,
  Check,
  Save,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  AlertCircle,
  Loader2,
  Keyboard,
} from 'lucide-react';
import { Song, Stream, Performance } from '@/lib/types';
import { secondsToTimestamp, timestampToSeconds } from '@/lib/utils';

// --- Components ---

interface StreamItemProps {
  stream: Stream;
  songCount: number;
  missingEndCount: number;
  isSelected: boolean;
  onClick: () => void;
}

function StreamItem({ stream, songCount, missingEndCount, isSelected, onClick }: StreamItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 flex items-center justify-between transition-all border-b border-slate-100 ${
        isSelected ? 'bg-pink-50/80 border-l-4 border-l-pink-400' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`p-2 rounded-lg flex-shrink-0 ${isSelected ? 'bg-pink-100 text-pink-500' : 'bg-slate-100 text-slate-400'}`}>
          <Video size={18} />
        </div>
        <div className="text-left overflow-hidden">
          <p className={`font-semibold text-sm truncate ${isSelected ? 'text-pink-700' : 'text-slate-700'}`}>
            {stream.title}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{stream.date}</span>
            <span>·</span>
            <span>{songCount} 首歌</span>
            {missingEndCount > 0 && (
              <span className="text-pink-500 font-medium flex items-center gap-0.5">
                <Clock size={10} /> {missingEndCount} 缺結束
              </span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight size={16} className={isSelected ? 'text-pink-400' : 'text-slate-300'} />
    </button>
  );
}

// --- Main Page ---

export default function StampPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [selectedPerformanceId, setSelectedPerformanceId] = useState<string | null>(null);
  const [isSaving, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlayingState, setIsPlayingState] = useState(false);

  const playerRef = useRef<any>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Auth & Data Loading ---

  useEffect(() => {
    fetch('/api/auth/check', { method: 'POST' })
      .then((res) => {
        if (!res.ok) router.replace('/admin/login');
        else {
          setAuthenticated(true);
          fetchData();
        }
      })
      .catch(() => router.replace('/admin/login'));
  }, [router]);

  async function fetchData() {
    try {
      const [streamsRes, songsRes] = await Promise.all([
        fetch('/api/streams'),
        fetch('/api/songs'),
      ]);
      const [streamsData, songsData] = await Promise.all([
        streamsRes.json(),
        songsRes.json(),
      ]);
      console.log('Loaded streams:', streamsData.length);
      console.log('Loaded songs:', songsData.length);
      setStreams(streamsData.sort((a: Stream, b: Stream) => b.date.localeCompare(a.date)));
      setSongs(songsData);
    } catch (err) {
      setError('載入資料失敗');
    } finally {
      setLoading(false);
    }
  }

  // --- Derived State ---

  const selectedStream = streams.find(s => s.id === selectedStreamId);
  
  const streamPerformances = selectedStreamId 
    ? songs.flatMap(s => 
        s.performances
          .filter(p => p.streamId === selectedStreamId)
          .map(p => ({ ...p, songTitle: s.title, artist: s.originalArtist }))
      ).sort((a, b) => a.timestamp - b.timestamp)
    : [];

  const selectedPerformance = streamPerformances.find(p => p.id === selectedPerformanceId);

  // --- YouTube IFrame API ---

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!authenticated) return;

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    window.onYouTubeIframeAPIReady = () => {
      // API ready
    };

    return () => {
      if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
    };
  }, [authenticated]);

  const initPlayer = useCallback((videoId: string) => {
    if (!window.YT || !window.YT.Player) return;

    if (playerRef.current) {
      playerRef.current.destroy();
    }

    playerRef.current = new window.YT.Player('stamp-player-iframe', {
      height: '100%',
      width: '100%',
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          setIsPlayerReady(true);
          startPolling();
        },
        onStateChange: (event: any) => {
          setIsPlayingState(event.data === 1);
        },
      },
    });
  }, []);

  const startPolling = () => {
    if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
    timeUpdateIntervalRef.current = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 100);
  };

  useEffect(() => {
    if (selectedStream?.videoId && authenticated) {
      initPlayer(selectedStream.videoId);
    }
  }, [selectedStream?.videoId, initPlayer, authenticated]);

  // --- Actions ---

  const seekTo = (seconds: number) => {
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(seconds, true);
    }
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlayingState) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const setTimestamp = async (perfId: string, field: 'timestamp' | 'endTimestamp', value: number) => {
    setError(null);
    const perf = streamPerformances.find(p => p.id === perfId);
    if (!perf) return;

    const body = {
      id: perfId,
      startTimestamp: field === 'timestamp' ? secondsToTimestamp(value) : secondsToTimestamp(perf.timestamp),
      endTimestamp: field === 'endTimestamp' ? secondsToTimestamp(value) : (perf.endTimestamp ? secondsToTimestamp(perf.endTimestamp) : undefined),
      note: perf.note,
    };

    try {
      const res = await fetch('/api/versions/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('儲存失敗');
      
      // Refresh local state
      setSongs(prev => prev.map(s => {
        if (s.performances.some(p => p.id === perfId)) {
          return {
            ...s,
            performances: s.performances.map(p => 
              p.id === perfId ? { ...p, [field]: value } : p
            )
          };
        }
        return s;
      }));
    } catch (err) {
      setError(String(err));
    }
  };

  // --- Keyboard Shortcuts ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'm': // Mark End
          if (selectedPerformanceId) setTimestamp(selectedPerformanceId, 'endTimestamp', Math.floor(currentTime));
          break;
        case 't': // Set Start
          if (selectedPerformanceId) setTimestamp(selectedPerformanceId, 'timestamp', Math.floor(currentTime));
          break;
        case 's': // Seek to start
          if (selectedPerformance) seekTo(selectedPerformance.timestamp);
          break;
        case 'e': // Seek to end
          if (selectedPerformance?.endTimestamp) seekTo(selectedPerformance.endTimestamp);
          break;
        case 'arrowleft':
          seekTo(currentTime - 5);
          break;
        case 'arrowright':
          seekTo(currentTime + 5);
          break;
        case 'n': // Next song
          const nextIdx = streamPerformances.findIndex(p => p.id === selectedPerformanceId) + 1;
          if (nextIdx < streamPerformances.length) setSelectedPerformanceId(streamPerformances[nextIdx].id);
          break;
        case 'p': // Prev song
          const prevIdx = streamPerformances.findIndex(p => p.id === selectedPerformanceId) - 1;
          if (prevIdx >= 0) setSelectedPerformanceId(streamPerformances[prevIdx].id);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPerformanceId, selectedPerformance, currentTime, streamPerformances]);

  // --- Render Helpers ---

  if (!authenticated || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
      </div>
    );
  }

  const streamsMissingEnd = streams.map(s => {
    const perfs = songs.flatMap(song => song.performances.filter(p => p.streamId === s.id));
    const missing = perfs.filter(p => !p.endTimestamp).length;
    return { stream: s, count: perfs.length, missing };
  });

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 flex items-center px-4 justify-between bg-white z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-slate-800">時間戳標記</h1>
        </div>
        
        {error && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 text-xs rounded-full border border-red-100">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-500 font-mono">Space</kbd>
            <span>暫停/播放</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-500 font-mono">T</kbd>
            <span>設開始</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-500 font-mono">M</kbd>
            <span>設結束</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Streams */}
        <div className="w-72 border-r border-slate-200 flex flex-col shrink-0 bg-slate-50/30 overflow-y-auto" data-testid="stamp-stream-list">
          <div className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">直播場次</div>
          {streamsMissingEnd.map(({ stream, count, missing }) => (
            <StreamItem
              key={stream.id}
              stream={stream}
              songCount={count}
              missingEndCount={missing}
              isSelected={selectedStreamId === stream.id}
              onClick={() => {
                setSelectedStreamId(stream.id);
                setSelectedPerformanceId(null);
              }}
            />
          ))}
        </div>

        {/* Center - Player */}
        <div className="flex-1 flex flex-col bg-black relative">
          <div className="flex-1" id="stamp-player-container">
            <div id="stamp-player-iframe" data-testid="stamp-player" />
          </div>
          
          {/* Custom Controls Bar */}
          <div className="h-16 bg-white border-t border-slate-200 flex items-center px-6 gap-6 shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => seekTo(currentTime - 5)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
                <SkipBack size={20} fill="currentColor" />
              </button>
              <button onClick={togglePlay} className="p-3 bg-pink-500 text-white rounded-full hover:bg-pink-600 shadow-md">
                {isPlayingState ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
              </button>
              <button onClick={() => seekTo(currentTime + 5)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
                <SkipForward size={20} fill="currentColor" />
              </button>
            </div>

            <div className="flex-1 flex items-center gap-4">
              <span className="text-2xl font-mono font-bold text-slate-700 w-32">
                {secondsToTimestamp(Math.floor(currentTime))}
              </span>
              
              {selectedPerformance && (
                <div className="flex-1 border-l border-slate-200 pl-4 overflow-hidden">
                  <div className="text-xs text-slate-400 font-medium truncate uppercase tracking-tighter">正在標記</div>
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {selectedPerformance.songTitle} <span className="font-normal text-slate-400">/ {selectedPerformance.artist}</span>
                  </div>
                </div>
              )}
            </div>

            {selectedPerformance && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimestamp(selectedPerformance.id, 'timestamp', Math.floor(currentTime))}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-semibold transition-colors"
                  data-testid="stamp-set-start-button"
                >
                  <Clock size={16} /> 設為開始
                </button>
                <button
                  onClick={() => setTimestamp(selectedPerformance.id, 'endTimestamp', Math.floor(currentTime))}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 text-sm font-semibold transition-colors shadow-sm"
                  data-testid="stamp-mark-end-button"
                >
                  <Check size={16} /> 標記結束
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Songs */}
        <div className="w-80 border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto" data-testid="stamp-song-list">
          <div className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-white sticky top-0 border-b border-slate-100">
            本場歌曲
          </div>
          {!selectedStreamId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Video size={32} className="text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">請從左側選擇直播場次</p>
            </div>
          ) : streamPerformances.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Music2 size={32} className="text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">此場次尚無歌曲</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {streamPerformances.map((perf) => {
                const isSelected = selectedPerformanceId === perf.id;
                return (
                  <button
                    key={perf.id}
                    onClick={() => {
                      setSelectedPerformanceId(perf.id);
                      seekTo(perf.timestamp);
                    }}
                    className={`w-full p-4 text-left transition-colors ${
                      isSelected ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className={`font-bold text-sm leading-tight ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                        {perf.songTitle}
                      </p>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        perf.endTimestamp ? 'bg-green-100 text-green-600' : 'bg-pink-100 text-pink-600'
                      }`}>
                        {perf.endTimestamp ? '已標記' : '未結束'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{perf.artist}</p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/60 p-2 rounded border border-slate-100">
                        <div className="text-[9px] text-slate-400 uppercase font-bold">開始</div>
                        <div className="text-xs font-mono font-bold text-slate-600">{secondsToTimestamp(perf.timestamp)}</div>
                      </div>
                      <div className="bg-white/60 p-2 rounded border border-slate-100">
                        <div className="text-[9px] text-slate-400 uppercase font-bold">結束</div>
                        <div className="text-xs font-mono font-bold text-slate-600">
                          {perf.endTimestamp ? secondsToTimestamp(perf.endTimestamp) : '--:--'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
