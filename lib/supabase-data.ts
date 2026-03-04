import { supabase } from './supabase';
import type { Song, Stream, SongMetadata, SongLyrics, ArtistInfo } from './types';

/** Load all songs with their performances from Supabase */
export async function loadSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from('performances')
    .select(`
      id,
      stream_id,
      date,
      stream_title,
      video_id,
      timestamp_sec,
      end_timestamp_sec,
      note,
      songs (
        id,
        title,
        original_artist,
        tags
      )
    `)
    .order('date', { ascending: false });

  if (error) throw new Error(`Supabase error: ${error.message}`);

  // Group performances by song
  const songMap = new Map<string, Song>();
  for (const row of data ?? []) {
    const song = row.songs as unknown as { id: string; title: string; original_artist: string; tags: string[] };
    if (!songMap.has(song.id)) {
      songMap.set(song.id, {
        id: song.id,
        title: song.title,
        originalArtist: song.original_artist,
        tags: song.tags ?? [],
        performances: [],
      });
    }
    songMap.get(song.id)!.performances.push({
      id: row.id,
      streamId: row.stream_id,
      date: row.date,
      streamTitle: row.stream_title ?? '',
      videoId: row.video_id,
      timestamp: row.timestamp_sec,
      endTimestamp: row.end_timestamp_sec ?? null,
      note: row.note ?? '',
    });
  }

  return Array.from(songMap.values());
}

/** Load all streams from Supabase */
export async function loadStreams(): Promise<Stream[]> {
  const { data, error } = await supabase
    .from('streams')
    .select('*')
    .order('date', { ascending: false });

  if (error) throw new Error(`Supabase error: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    channelId: row.channel_id ?? undefined,
    title: row.title,
    date: row.date,
    videoId: row.video_id,
    youtubeUrl: row.youtube_url,
    credit: row.credit_author ? {
      author: row.credit_author,
      authorUrl: row.credit_author_url ?? '',
      commentUrl: row.credit_comment_url ?? undefined,
    } : undefined,
  }));
}

/** Load all streamers from Supabase */
export async function loadStreamers(): Promise<{ channelId: string; handle: string; displayName: string; avatarUrl: string; description: string; social_links: Record<string, string> }[]> {
  const { data, error } = await supabase.from('streamers').select('*');
  if (error) throw new Error(`Supabase error: ${error.message}`);
  return (data ?? []).map((row) => ({
    channelId: row.channel_id,
    handle: row.handle ?? '',
    displayName: row.display_name ?? '',
    avatarUrl: row.avatar_url ?? '',
    description: row.description ?? '',
    social_links: row.social_links ?? {},
  }));
}

/** Load song metadata from Supabase */
export async function loadMetadata(): Promise<{ songMetadata: SongMetadata[]; artistInfo: ArtistInfo[] }> {
  const { data, error } = await supabase
    .from('song_metadata')
    .select('*');

  if (error) throw new Error(`Supabase error: ${error.message}`);

  const songMetadata: SongMetadata[] = (data ?? []).map((row) => ({
    songId: row.song_id,
    fetchStatus: row.fetch_status ?? 'no_match',
    matchConfidence: row.match_confidence ?? null,
    albumArtUrl: row.album_art_url ?? undefined,
    albumArtUrls: row.album_art_small ? {
      small: row.album_art_small,
      medium: row.album_art_medium,
      big: row.album_art_big,
      xl: row.album_art_xl,
    } : undefined,
    albumTitle: row.album_title ?? undefined,
    itunesTrackId: row.itunes_track_id ?? undefined,
    itunesCollectionId: row.itunes_collection_id ?? undefined,
    trackDuration: row.track_duration ?? undefined,
    fetchedAt: row.fetched_at ?? '',
    lastError: row.last_error ?? undefined,
  }));

  return { songMetadata, artistInfo: [] };
}

/** Load lyrics from Supabase (lazy-loaded) */
export async function loadLyrics(): Promise<SongLyrics[]> {
  const { data, error } = await supabase
    .from('song_lyrics')
    .select('*');

  if (error) throw new Error(`Supabase error: ${error.message}`);

  return (data ?? []).map((row) => ({
    songId: row.song_id,
    fetchStatus: row.fetch_status ?? 'no_match',
    syncedLyrics: row.synced_lyrics ?? undefined,
    plainLyrics: row.plain_lyrics ?? undefined,
    fetchedAt: row.fetched_at ?? '',
    lastError: row.last_error ?? undefined,
  }));
}
