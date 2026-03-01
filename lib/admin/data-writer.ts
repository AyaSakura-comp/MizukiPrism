// lib/admin/data-writer.ts

// Merge new streams and songs into data/ JSON files

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Streamer } from '@/lib/types';

// Re-export types from lib/types for convenience
interface Performance {
  id: string;
  streamId: string;
  date: string;
  streamTitle: string;
  videoId: string;
  timestamp: number;
  endTimestamp: number | null;
  note: string;
}

interface Song {
  id: string;
  title: string;
  originalArtist: string;
  tags: string[];
  performances: Performance[];
}

interface Stream {
  id: string;
  channelId?: string;
  title: string;
  date: string;
  videoId: string;
  youtubeUrl: string;
  credit?: {
    author: string;
    authorUrl: string;
    commentUrl?: string;
  };
}

export interface ImportSong {
  songName: string;
  artist: string;
  startSeconds: number;
  endSeconds: number | null;
  note?: string;
}

export interface ImportRequest {
  videoId: string;
  title: string;
  date: string;
  youtubeUrl: string;
  channelId?: string;  // links to streamer profile
  songs: ImportSong[];
  credit?: {
    author: string;
    authorUrl: string;
    commentUrl?: string;
  };
}

export interface ImportResult {
  streamId: string;
  newSongs: number;
  existingSongMatches: number;
  newPerformances: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJsonFileAtomic<T>(filePath: string, data: T): void {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function findExistingSong(songs: Song[], title: string, artist: string): string | null {
  const match = songs.find(
    (s) => s.title === title && s.originalArtist === artist
  );
  return match ? match.id : null;
}

export function generateSongId(songs: { id: string }[]): string {
  const maxNum = songs.reduce((max, s) => {
    const m = s.id.match(/^song-(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `song-${maxNum + 1}`;
}

export function generatePerformanceId(songIndex: number, perfIndex: number): string {
  return `p${songIndex}-${perfIndex}`;
}

function generateStreamId(date: string, existingStreams: Stream[]): string {
  let id = `stream-${date}`;
  const existing = existingStreams.map((s) => s.id);
  if (!existing.includes(id)) return id;

  // Append suffix: -a, -b, -c, ...
  for (let i = 0; i < 26; i++) {
    const suffix = String.fromCharCode(97 + i); // a-z
    const candidate = `${id}-${suffix}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${id}-${crypto.randomUUID().slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Main merge function
// ---------------------------------------------------------------------------

/**
 * Add a new stream and its songs to the data/ JSON files.
 * If a song with the same title+artist already exists, adds a new performance.
 * If the song is new, creates a new song entry.
 *
 * @param dataDir - Path to the data/ directory
 * @param request - The import request with stream info and songs
 * @returns Import result summary
 */
export function addStreamAndSongs(dataDir: string, request: ImportRequest): ImportResult {
  const songsPath = path.join(dataDir, 'songs.json');
  const streamsPath = path.join(dataDir, 'streams.json');

  const songs: Song[] = readJsonFile(songsPath);
  const streams: Stream[] = readJsonFile(streamsPath);

  // Check for duplicate stream
  if (streams.some((s) => s.videoId === request.videoId)) {
    throw new Error(`Stream with videoId ${request.videoId} already exists`);
  }

  // Create stream
  const streamId = generateStreamId(request.date, streams);
  const newStream: Stream = {
    id: streamId,
    channelId: request.channelId || '',
    title: request.title,
    date: request.date,
    videoId: request.videoId,
    youtubeUrl: request.youtubeUrl,
  };
  if (request.credit) newStream.credit = request.credit;
  streams.push(newStream);

  // Process songs
  let newSongCount = 0;
  let existingMatchCount = 0;
  let perfCount = 0;

  for (const importSong of request.songs) {
    const existingId = findExistingSong(songs, importSong.songName, importSong.artist);

    if (existingId) {
      // Add performance to existing song
      existingMatchCount++;
      const song = songs.find((s) => s.id === existingId)!;
      const songIdx = parseInt(song.id.replace('song-', ''), 10);
      const perfIdx = song.performances.length + 1;

      song.performances.push({
        id: generatePerformanceId(songIdx, perfIdx),
        streamId,
        date: request.date,
        streamTitle: request.title,
        videoId: request.videoId,
        timestamp: importSong.startSeconds,
        endTimestamp: importSong.endSeconds,
        note: importSong.note || '',
      });
    } else {
      // Create new song
      newSongCount++;
      const songId = generateSongId(songs);
      const songIdx = parseInt(songId.replace('song-', ''), 10);

      songs.push({
        id: songId,
        title: importSong.songName,
        originalArtist: importSong.artist,
        tags: [],
        performances: [
          {
            id: generatePerformanceId(songIdx, 1),
            streamId,
            date: request.date,
            streamTitle: request.title,
            videoId: request.videoId,
            timestamp: importSong.startSeconds,
            endTimestamp: importSong.endSeconds,
            note: importSong.note || '',
          },
        ],
      });
    }
    perfCount++;
  }

  // Write files atomically
  writeJsonFileAtomic(songsPath, songs);
  writeJsonFileAtomic(streamsPath, streams);

  return {
    streamId,
    newSongs: newSongCount,
    existingSongMatches: existingMatchCount,
    newPerformances: perfCount,
  };
}

// ---------------------------------------------------------------------------
// Metadata file updates
// ---------------------------------------------------------------------------

export interface MetadataUpdate {
  songId: string;
  fetchStatus: 'matched' | 'no_match' | 'error';
  matchConfidence: string | null;
  albumArtUrl?: string;
  albumArtUrls?: { small: string; medium: string; big: string; xl: string };
  albumTitle?: string;
  itunesTrackId?: number;
  itunesCollectionId?: number;
  trackDuration?: number;
  fetchedAt: string;
  lastError?: string;
}

export interface LyricsUpdate {
  songId: string;
  fetchStatus: 'matched' | 'no_match' | 'error';
  syncedLyrics?: string;
  plainLyrics?: string;
  fetchedAt: string;
  lastError?: string;
}

/**
 * Upsert metadata for a song into the metadata JSON files.
 */
export function updateMetadataFiles(
  dataDir: string,
  metadata?: MetadataUpdate,
  lyrics?: LyricsUpdate,
): void {
  const metaDir = path.join(dataDir, 'metadata');

  if (metadata) {
    const metaPath = path.join(metaDir, 'song-metadata.json');
    const existing: any[] = readJsonFile(metaPath);
    const idx = existing.findIndex((m: any) => m.songId === metadata.songId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...metadata };
    } else {
      existing.push(metadata);
    }
    writeJsonFileAtomic(metaPath, existing);
  }

  if (lyrics) {
    const lyricsPath = path.join(metaDir, 'song-lyrics.json');
    const existing: any[] = readJsonFile(lyricsPath);
    const idx = existing.findIndex((l: any) => l.songId === lyrics.songId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...lyrics };
    } else {
      existing.push(lyrics);
    }
    writeJsonFileAtomic(lyricsPath, existing);
  }
}

// ---------------------------------------------------------------------------
// Streamer file operations
// ---------------------------------------------------------------------------

export function readStreamers(dataDir: string): Streamer[] {
  const filePath = path.join(dataDir, 'streamer.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function writeStreamers(dataDir: string, streamers: Streamer[]): void {
  const filePath = path.join(dataDir, 'streamer.json');
  writeJsonFileAtomic(filePath, streamers);
}

export function findStreamerByChannelId(streamers: Streamer[], channelId: string): Streamer | null {
  return streamers.find((s) => s.channelId === channelId) || null;
}

export function addStreamer(dataDir: string, streamer: Streamer): void {
  const streamers = readStreamers(dataDir);
  if (findStreamerByChannelId(streamers, streamer.channelId)) return;
  streamers.push(streamer);
  writeStreamers(dataDir, streamers);
}
