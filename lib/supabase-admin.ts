/**
 * Client-side Supabase write operations for admin pages.
 * All functions use the anon key (RLS disabled on all tables).
 */
import { supabase } from './supabase';
import { validateYoutubeUrl, extractVideoId, timestampToSeconds } from './utils';
import type { Stream, Song } from './types';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ---- Auth (localStorage-based, no server cookies) ----

const AUTH_KEY = 'admin-auth';
const CURATOR_PASSWORD = 'mizuki-admin';

export function login(password: string): boolean {
  if (password === CURATOR_PASSWORD) {
    localStorage.setItem(AUTH_KEY, 'curator');
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(AUTH_KEY) === 'curator';
}

// ---- Streams ----

export async function createStream(
  title: string,
  date: string,
  youtubeUrl: string,
  channelId?: string,
): Promise<Stream> {
  if (!validateYoutubeUrl(youtubeUrl)) throw new Error('請輸入有效的 YouTube URL');
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) throw new Error('請輸入有效的 YouTube URL');

  // Check duplicate
  const { data: existing } = await supabase
    .from('streams')
    .select('id')
    .eq('video_id', videoId)
    .single();
  if (existing) throw new Error('此 YouTube URL 已存在於直播場次中');

  const id = generateId('stream');
  const { data, error } = await supabase
    .from('streams')
    .insert({ id, title, date, video_id: videoId, youtube_url: youtubeUrl, channel_id: channelId ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return {
    id: data.id,
    title: data.title,
    date: data.date,
    videoId: data.video_id,
    youtubeUrl: data.youtube_url,
    channelId: data.channel_id ?? undefined,
  };
}

// ---- Songs ----

export async function updateSong(
  id: string,
  title: string,
  originalArtist: string,
  tags: string[],
): Promise<void> {
  // Check duplicate (same title+artist, different id)
  const { data: dup } = await supabase
    .from('songs')
    .select('id')
    .eq('title', title)
    .eq('original_artist', originalArtist)
    .neq('id', id)
    .single();
  if (dup) throw new Error('已存在相同歌名與原唱者的歌曲');

  const { error } = await supabase
    .from('songs')
    .update({ title, original_artist: originalArtist, tags })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- MusicBrainz Duration (browser-safe, CORS-friendly, no API key) ----

export async function fetchMusicBrainzSongInfo(artist: string, title: string): Promise<{ durationSeconds: number, artistName: string } | null> {
  try {
    const q = encodeURIComponent(artist ? `artist:${artist} recording:${title}` : `recording:${title}`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=5`,
      { headers: { 'User-Agent': 'MizukiPrism/1.0 (github.com/AyaSakura-comp/MizukiPrism)' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    for (const r of data.recordings ?? []) {
      if (r.length && r.length > 0) {
        const artistName = r['artist-credit']?.[0]?.name || '';
        return { durationSeconds: Math.round(r.length / 1000), artistName };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---- iTunes Duration (browser-safe, CORS-friendly, no API key) ----

let lastItunesCallTime = 0;
const ITUNES_RATE_LIMIT_MS = 3000;

export async function fetchItunesSongInfo(artist: string, title: string): Promise<{ durationSeconds: number, artistName: string } | null> {
  try {
    // Rate limit: 3s between calls
    const elapsed = Date.now() - lastItunesCallTime;
    if (elapsed < ITUNES_RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, ITUNES_RATE_LIMIT_MS - elapsed));
    }
    lastItunesCallTime = Date.now();

    const term = artist ? `${artist} ${title}`.trim() : title;
    const params = new URLSearchParams({
      term,
      media: 'music',
      entity: 'song',
      country: 'JP',
      limit: '5',
    });
    const res = await fetch(`https://itunes.apple.com/search?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    for (const r of data.results ?? []) {
      if (r.trackTimeMillis && r.trackTimeMillis > 0) {
        return { durationSeconds: Math.round(r.trackTimeMillis / 1000), artistName: r.artistName || '' };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Import stream + songs (bulk) ----

export async function importStreamWithSongs(params: {
  videoId: string;
  title: string;
  date: string;
  youtubeUrl: string;
  channelId?: string;
  credit?: { author: string; authorUrl: string; commentUrl?: string };
  songs: Array<{
    songName: string;
    artist: string;
    startSeconds: number;
    endSeconds: number | null;
    note?: string;
  }>;
}): Promise<{ streamId: string; songsCreated: number; songsUpdated: number }> {
  const { videoId, title, date, youtubeUrl, channelId, credit, songs } = params;

  // Upsert stream
  const streamId = `stream-${date}-${videoId.slice(0, 8)}`;
  const { error: streamErr } = await supabase.from('streams').upsert({
    id: streamId,
    title,
    date,
    video_id: videoId,
    youtube_url: youtubeUrl,
    channel_id: channelId ?? null,
    credit_author: credit?.author ?? null,
    credit_author_url: credit?.authorUrl ?? null,
    credit_comment_url: credit?.commentUrl ?? null,
  });
  if (streamErr) throw new Error(streamErr.message);

  let songsCreated = 0;
  let songsUpdated = 0;

  // Batch fetch existing songs and performances in 2 queries
  const songKeys = songs.map(s => `${s.songName.toLowerCase()}|||${s.artist.toLowerCase()}`);
  const { data: existingSongs } = await supabase
    .from('songs')
    .select('id, title, original_artist')
    .in('title', songs.map(s => s.songName));

  const { data: existingPerfs } = await supabase
    .from('performances')
    .select('timestamp_sec')
    .eq('stream_id', streamId);

  const existingSongMap = new Map<string, string>();
  for (const row of existingSongs ?? []) {
    existingSongMap.set(`${row.title.toLowerCase()}|||${row.original_artist.toLowerCase()}`, row.id);
  }
  const existingPerfTimestamps = new Set((existingPerfs ?? []).map(p => p.timestamp_sec));

  // Insert new songs in bulk
  const newSongRows: { id: string; title: string; original_artist: string; tags: string[] }[] = [];
  const songIdMap = new Map<string, string>();
  for (const s of songs) {
    const key = `${s.songName.toLowerCase()}|||${s.artist.toLowerCase()}`;
    if (existingSongMap.has(key)) {
      songIdMap.set(key, existingSongMap.get(key)!);
      songsUpdated++;
    } else if (!songIdMap.has(key)) {
      const id = generateId('song');
      newSongRows.push({ id, title: s.songName, original_artist: s.artist, tags: [] });
      songIdMap.set(key, id);
      songsCreated++;
    }
  }
  if (newSongRows.length > 0) {
    const { error: songErr } = await supabase.from('songs').insert(newSongRows);
    if (songErr) throw new Error(songErr.message);
  }

  // Insert new performances in bulk
  const newPerfRows = songs
    .filter(s => !existingPerfTimestamps.has(s.startSeconds))
    .map(s => {
      const key = `${s.songName.toLowerCase()}|||${s.artist.toLowerCase()}`;
      return {
        id: generateId('perf'),
        song_id: songIdMap.get(key)!,
        stream_id: streamId,
        date,
        stream_title: title,
        video_id: videoId,
        timestamp_sec: s.startSeconds,
        end_timestamp_sec: s.endSeconds,
        note: s.note ?? '',
      };
    });
  if (newPerfRows.length > 0) {
    const { error: perfErr } = await supabase.from('performances').insert(newPerfRows);
    if (perfErr) throw new Error(perfErr.message);
  }

  return { streamId, songsCreated, songsUpdated };
}

// ---- Streamer upsert ----

export async function saveStreamer(profile: {
  channelId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  description: string;
}): Promise<void> {
  const { error } = await supabase.from('streamers').upsert({
    channel_id: profile.channelId,
    handle: profile.handle,
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
    description: profile.description,
    social_links: {},
  });
  if (error) throw new Error(error.message);
}

// ---- Performances ----

export async function createPerformance(params: {
  songTitle: string;
  originalArtist: string;
  songTags: string[];
  streamId: string;
  startTimestamp: string;
  endTimestamp?: string;
  note?: string;
  songId?: string;
}): Promise<void> {
  const { songTitle, originalArtist, songTags, streamId, startTimestamp, endTimestamp, note, songId: existingSongId } = params;

  // Get stream
  const { data: stream, error: streamErr } = await supabase
    .from('streams')
    .select('id, title, date, video_id')
    .eq('id', streamId)
    .single();
  if (streamErr || !stream) throw new Error('Stream not found');

  // Find or create song
  let songId = existingSongId;
  if (!songId) {
    const { data: found } = await supabase
      .from('songs')
      .select('id')
      .ilike('title', songTitle)
      .ilike('original_artist', originalArtist)
      .single();
    songId = found?.id;
  }

  if (!songId) {
    const newId = generateId('song');
    const { data: newSong, error: songErr } = await supabase
      .from('songs')
      .insert({ id: newId, title: songTitle, original_artist: originalArtist, tags: songTags })
      .select('id')
      .single();
    if (songErr) throw new Error(songErr.message);
    songId = newSong.id;
  }

  const startSec = timestampToSeconds(startTimestamp);
  const endSec = endTimestamp ? timestampToSeconds(endTimestamp) : null;

  const { error: perfErr } = await supabase.from('performances').insert({
    id: generateId('perf'),
    song_id: songId,
    stream_id: streamId,
    date: stream.date,
    stream_title: stream.title,
    video_id: stream.video_id,
    timestamp_sec: startSec,
    end_timestamp_sec: endSec,
    note: note ?? '',
  });
  if (perfErr) throw new Error(perfErr.message);
}

export async function updatePerformance(
  id: string,
  startTimestamp: string,
  endTimestamp: string | undefined,
  note: string,
): Promise<void> {
  const startSec = timestampToSeconds(startTimestamp);
  const endSec = endTimestamp ? timestampToSeconds(endTimestamp) : null;

  const { error } = await supabase
    .from('performances')
    .update({ timestamp_sec: startSec, end_timestamp_sec: endSec, note })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePerformance(id: string): Promise<void> {
  const { error } = await supabase.from('performances').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
