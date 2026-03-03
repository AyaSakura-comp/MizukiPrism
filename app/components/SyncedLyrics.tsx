'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SongLyrics, LyricLine } from '@/lib/types';
import { parseLRC, getActiveLyricIndex } from '@/lib/lyrics';
import { loadLyrics } from '@/lib/supabase-data';

interface SyncedLyricsProps {
  songId: string;
  currentTime: number;
}

// Module-level cache: only fetched once per page session
let lyricsCache: SongLyrics[] | null = null;
let lyricsFetchPromise: Promise<SongLyrics[]> | null = null;

async function fetchLyricsData(): Promise<SongLyrics[]> {
  if (lyricsCache !== null) return lyricsCache;
  if (lyricsFetchPromise) return lyricsFetchPromise;

  lyricsFetchPromise = loadLyrics()
    .then((data: SongLyrics[]) => {
      lyricsCache = Array.isArray(data) ? data : [];
      return lyricsCache;
    })
    .catch(() => {
      lyricsCache = [];
      return lyricsCache as SongLyrics[];
    });

  return lyricsFetchPromise;
}

export default function SyncedLyrics({ songId, currentTime }: SyncedLyricsProps) {
  const [lyricsEntry, setLyricsEntry] = useState<SongLyrics | null | 'not_found'>(null);
  const [parsedLines, setParsedLines] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Auto-scroll state
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isProgrammaticScrollRef = useRef(false);
  const manualScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualScrollRef = useRef(false);
  const lastActiveIndexRef = useRef<number>(-2); // -2 = sentinel "never scrolled"

  // Load lyrics lazily when component mounts (i.e., when modal/lyrics panel opens)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchLyricsData().then(allLyrics => {
      if (cancelled) return;
      const entry = allLyrics.find(l => l.songId === songId) ?? null;
      setLyricsEntry(entry === null ? 'not_found' : entry);

      if (entry && entry.syncedLyrics) {
        setParsedLines(parseLRC(entry.syncedLyrics));
      } else {
        setParsedLines([]);
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [songId]);

  // Resize line refs array when parsed lines change
  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, parsedLines.length);
  }, [parsedLines]);

  // Manual scroll detection
  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    // User scrolled manually
    isManualScrollRef.current = true;
    if (manualScrollTimerRef.current) {
      clearTimeout(manualScrollTimerRef.current);
    }
    manualScrollTimerRef.current = setTimeout(() => {
      isManualScrollRef.current = false;
    }, 5000);
  }, []);

  // Auto-scroll to active line
  const activeIndex = getActiveLyricIndex(parsedLines, currentTime);

  useEffect(() => {
    if (activeIndex === lastActiveIndexRef.current) return;
    lastActiveIndexRef.current = activeIndex;

    if (activeIndex === -1) return;
    if (isManualScrollRef.current) return;

    const el = lineRefs.current[activeIndex];
    if (!el) return;

    isProgrammaticScrollRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Clear the flag after the smooth scroll animation finishes (~500ms)
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 600);
  }, [activeIndex]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (manualScrollTimerRef.current) {
        clearTimeout(manualScrollTimerRef.current);
      }
    };
  }, []);

  // ---- Render states ----

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-8"
        style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}
      >
        載入歌詞中…
      </div>
    );
  }

  // No lyrics for this song at all
  if (lyricsEntry === 'not_found' || lyricsEntry === null) {
    return (
      <div
        data-testid="lyrics-no-lyrics"
        className="flex items-center justify-center py-8"
        style={{ color: 'var(--text-tertiary)', fontSize: '15px' }}
      >
        目前沒有歌詞
      </div>
    );
  }

  const entry = lyricsEntry as SongLyrics;

  // fetchStatus indicates no match or error with no lyrics data
  if (
    !entry.syncedLyrics &&
    !entry.plainLyrics
  ) {
    return (
      <div
        data-testid="lyrics-no-lyrics"
        className="flex items-center justify-center py-8"
        style={{ color: 'var(--text-tertiary)', fontSize: '15px' }}
      >
        目前沒有歌詞
      </div>
    );
  }

  // Plain text fallback (no syncedLyrics)
  if (!entry.syncedLyrics && entry.plainLyrics) {
    return (
      <div
        data-testid="lyrics-plain"
        className="overflow-y-auto px-4 py-4"
        style={{ maxHeight: '320px' }}
      >
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: '15px',
            lineHeight: '1.8',
            color: 'var(--text-secondary)',
          }}
        >
          {entry.plainLyrics}
        </pre>
      </div>
    );
  }

  // Synced lyrics
  return (
    <div
      data-testid="lyrics-synced"
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto px-4 py-4"
      style={{ maxHeight: '320px' }}
    >
      {parsedLines.map((line, i) => {
        const isActive = i === activeIndex;
        const isPast = activeIndex !== -1 && i < activeIndex;
        // upcoming: either before playback starts (activeIndex === -1) or i > activeIndex

        let color: string;
        let fontWeight: number;
        let fontSize: number;
        let opacity: number;

        if (isActive) {
          color = 'var(--accent-pink)';
          fontWeight = 700;
          fontSize = 18;
          opacity = 1;
        } else if (isPast) {
          color = 'var(--text-tertiary)';
          fontWeight = 400;
          fontSize = 16;
          opacity = 0.5;
        } else {
          // upcoming
          color = 'var(--text-secondary)';
          fontWeight = 400;
          fontSize = 16;
          opacity = 1;
        }

        return (
          <div
            key={i}
            ref={el => { lineRefs.current[i] = el; }}
            data-testid={isActive ? 'lyrics-active-line' : undefined}
            style={{
              color,
              fontWeight,
              fontSize: `${fontSize}px`,
              opacity,
              lineHeight: '1.8',
              padding: '2px 0',
              transition: 'color 0.3s, font-weight 0.2s, opacity 0.3s',
              minHeight: '1.8em',
            }}
          >
            {line.text || '\u00A0' /* non-breaking space for empty lines to preserve height */}
          </div>
        );
      })}
    </div>
  );
}
