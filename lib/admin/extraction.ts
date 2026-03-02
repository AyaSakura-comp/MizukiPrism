
// Port of tools/mizukilens/src/mizukilens/extraction.py

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds threshold above which a timestamp is flagged as suspicious (>12h) */
const SUSPICIOUS_THRESHOLD = 43200; // 12 * 3600

/** Minimum timestamp patterns required to qualify as a candidate comment */
const MIN_TIMESTAMPS_REQUIRED = 3;

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Matches: H:MM:SS, HH:MM:SS, M:SS, MM:SS */
const TIMESTAMP_RE = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;
const TIMESTAMP_RE_GLOBAL = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/g;

/** Finds timestamp at the start of a line */
const LINE_TS_RE = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;

/** Range end-timestamp: matches "~ HH:MM:SS", "- HH:MM:SS", etc. */
const RANGE_END_RE = /^(?:~|-|–|—)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedSong {
  orderIndex: number;
  songName: string;
  artist: string;
  startSeconds: number;
  endSeconds: number | null;
  startTimestamp: string;
  endTimestamp: string | null;
  suspicious: boolean;
}

export interface SongLineResult {
  startSeconds: number;
  songName: string;
  artist: string;
  endSeconds?: number;
}

export interface Comment {
  text: string;
  votes: string | number;
  isPinned?: boolean;
  author?: string;
  authorUrl?: string;
  cid?: string;
}

// ---------------------------------------------------------------------------
// Timestamp parsing
// ---------------------------------------------------------------------------

export function parseTimestamp(ts: string): number | null {
  const m = ts.trim().match(new RegExp(`^${TIMESTAMP_RE.source}$`));
  if (!m) return null;
  const hours = m[1] !== undefined ? parseInt(m[1], 10) : 0;
  const minutes = parseInt(m[2], 10);
  const seconds = parseInt(m[3], 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export function secondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const rem = seconds % 3600;
  const m = Math.floor(rem / 60);
  const s = rem % 60;
  if (h) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function countTimestamps(text: string): number {
  const matches = text.match(TIMESTAMP_RE_GLOBAL);
  return matches ? matches.length : 0;
}

export function isSuspiciousTimestamp(seconds: number): boolean {
  return seconds > SUSPICIOUS_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Artist splitting
// ---------------------------------------------------------------------------

function splitArtist(songInfo: string): [string, string] {
  // Try " / " variants (including full-width)
  let m = songInfo.match(/\s*[\/／]\s+|\s+[\/／]\s*/);
  if (m && m.index !== undefined) {
    const name = songInfo.slice(0, m.index).trim();
    const artist = songInfo.slice(m.index + m[0].length).trim();
    return [name, artist];
  }

  // Try " - " (em-dash, en-dash, and full-width pipe/colon)
  m = songInfo.match(/\s+[-–—｜：]\s+/);
  if (m && m.index !== undefined) {
    const name = songInfo.slice(0, m.index).trim();
    const artist = songInfo.slice(m.index + m[0].length).trim();
    return [name, artist];
  }

  // Try bare separators
  const bareMatch = songInfo.match(/[\/／｜：]/);
  if (bareMatch && bareMatch.index !== undefined) {
    const name = songInfo.slice(0, bareMatch.index).trim();
    const artist = songInfo.slice(bareMatch.index + 1).trim();
    if (name && artist) return [name, artist];
  }

  return [songInfo.trim(), ''];
}

// ---------------------------------------------------------------------------
// Song line parsing
// ---------------------------------------------------------------------------

export function parseSongLine(line: string): SongLineResult | null {
  line = line.trim();
  if (!line) return null;

  // Strip leading box-drawing / tree-formatting characters
  line = line.replace(/^[\u2500-\u257F\s]+/, '');
  if (!line) return null;

  // Strip common alphanumeric prefixes: "01. ", "EX. ", "1) ", "#3 "
  line = line.replace(/^(?:[A-Z0-9]+\.\s*|\d+\)\s+|#\d+\s+)/i, '');

  // Strip bullet prefixes: "- ", "* ", "+ "
  line = line.replace(/^[-*+]\s+/, '');

  // Find leading timestamp
  const tsMatch = line.match(LINE_TS_RE);
  if (!tsMatch) return null;

  const hours = tsMatch[1] !== undefined ? parseInt(tsMatch[1], 10) : 0;
  const minutes = parseInt(tsMatch[2], 10);
  const seconds = parseInt(tsMatch[3], 10);
  const startSeconds = hours * 3600 + minutes * 60 + seconds;

  // Rest of the line after the timestamp
  let remainder = line.slice(tsMatch[0].length).trim();

  // Check for range end-timestamp
  let endSeconds: number | undefined;
  const rangeMatch = remainder.match(RANGE_END_RE);
  if (rangeMatch) {
    const rh = rangeMatch[1] !== undefined ? parseInt(rangeMatch[1], 10) : 0;
    const rm = parseInt(rangeMatch[2], 10);
    const rs = parseInt(rangeMatch[3], 10);
    endSeconds = rh * 3600 + rm * 60 + rs;
    remainder = remainder.slice(rangeMatch[0].length).trim();
  }

  // Strip leading separator characters
  const sepMatch = remainder.match(/^(?:-\s+|–\s+|—\s+)/);
  if (sepMatch) {
    remainder = remainder.slice(sepMatch[0].length).trim();
  }

  if (!remainder) return null;

  const [songName, artist] = splitArtist(remainder);

  const result: SongLineResult = { startSeconds, songName, artist };
  if (endSeconds !== undefined) result.endSeconds = endSeconds;
  return result;
}

// ---------------------------------------------------------------------------
// Multi-line text parsing
// ---------------------------------------------------------------------------

export function parseTextToSongs(text: string): ParsedSong[] {
  const rawSongs: SongLineResult[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseSongLine(line);
    if (parsed) rawSongs.push(parsed);
  }

  if (rawSongs.length === 0) return [];

  const result: ParsedSong[] = [];
  for (let i = 0; i < rawSongs.length; i++) {
    const song = rawSongs[i];
    const startSec = song.startSeconds;

    // We no longer infer the end time from the next song.
    // This allows the enrichment step to fetch the actual track duration from iTunes for EVERY song.
    let endSec: number | null = song.endSeconds !== undefined ? song.endSeconds : null;

    result.push({
      orderIndex: i,
      songName: song.songName,
      artist: song.artist,
      startSeconds: startSec,
      endSeconds: endSec,
      startTimestamp: secondsToTimestamp(startSec),
      endTimestamp: endSec !== null ? secondsToTimestamp(endSec) : null,
      suspicious: isSuspiciousTimestamp(startSec),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Candidate comment selection
// ---------------------------------------------------------------------------

function parseVoteCount(votes: string | number): number {
  if (typeof votes === 'number') return votes;
  const s = String(votes).trim().replace(/,/g, '');
  if (!s || s === '0') return 0;
  try {
    if (s.endsWith('K') || s.endsWith('k')) return Math.floor(parseFloat(s.slice(0, -1)) * 1000);
    if (s.endsWith('M') || s.endsWith('m')) return Math.floor(parseFloat(s.slice(0, -1)) * 1_000_000);
    return Math.floor(parseFloat(s));
  } catch {
    return 0;
  }
}

export function findCandidateComment(comments: Comment[]): Comment | null {
  const candidates = comments.filter(
    (c) => countTimestamps(c.text) >= MIN_TIMESTAMPS_REQUIRED
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, c) => {
    const bestScore = [
      best.isPinned ? 1 : 0,
      parseVoteCount(best.votes),
      countTimestamps(best.text),
    ];
    const cScore = [
      c.isPinned ? 1 : 0,
      parseVoteCount(c.votes),
      countTimestamps(c.text),
    ];
    for (let i = 0; i < 3; i++) {
      if (cScore[i] > bestScore[i]) return c;
      if (cScore[i] < bestScore[i]) return best;
    }
    return best;
  });
}

// ---------------------------------------------------------------------------
// iTunes Duration Enrichment
// ---------------------------------------------------------------------------

import { fetchItunesMetadata } from './metadata';

const OUTRO_BUFFER_SECONDS = 0;

/**
 * Iterates through parsed songs and attempts to fill any missing endSeconds
 * by querying the iTunes API for the official track duration.
 */
export async function enrichMissingEndTimestamps(songs: ParsedSong[]): Promise<ParsedSong[]> {
  const result = [...songs];
  
  for (let i = 0; i < result.length; i++) {
    const song = result[i];
    
    if (song.endSeconds === null) {
      try {
        const itunesResult = await fetchItunesMetadata(song.artist, song.songName);
        if (itunesResult && itunesResult.data.trackDuration > 0) {
          const duration = itunesResult.data.trackDuration;
          const newEndSeconds = song.startSeconds + duration + OUTRO_BUFFER_SECONDS;
          
          result[i] = {
            ...song,
            endSeconds: newEndSeconds,
            endTimestamp: secondsToTimestamp(newEndSeconds),
          };
        }
      } catch (error) {
        // Silently ignore iTunes fetch errors and leave endSeconds as null
        console.warn(`Failed to fetch iTunes duration for ${song.artist} - ${song.songName}:`, error);
      }
    }
  }
  
  return result;
}
