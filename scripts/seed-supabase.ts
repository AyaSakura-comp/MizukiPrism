// scripts/seed-supabase.ts
// Usage: SUPABASE_SERVICE_KEY=... npx tsx scripts/seed-supabase.ts
//
// Reads data/*.json files and inserts all rows into Supabase.
// Run this ONCE after creating the schema.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://earoiujuuvnzessimxyb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('Usage: SUPABASE_SERVICE_KEY=<service_role_key> npx tsx scripts/seed-supabase.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const dataDir = path.join(process.cwd(), 'data');

async function upsert(table: string, rows: object[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw new Error(`Failed to upsert ${table}: ${error.message}`);
  console.log(`  ${table}: upserted ${rows.length} rows`);
}

async function main() {
  // 1. Streamers
  console.log('Seeding streamers...');
  const streamers = JSON.parse(fs.readFileSync(path.join(dataDir, 'streamer.json'), 'utf-8'));
  await upsert('streamers', streamers.map((s: any) => ({
    channel_id: s.channelId,
    handle: s.handle,
    display_name: s.displayName,
    avatar_url: s.avatarUrl,
    description: s.description,
    social_links: s.socialLinks ?? {},
  })));

  // 2. Streams
  console.log('Seeding streams...');
  const streams = JSON.parse(fs.readFileSync(path.join(dataDir, 'streams.json'), 'utf-8'));
  await upsert('streams', streams.map((s: any) => ({
    id: s.id,
    channel_id: s.channelId ?? null,
    title: s.title,
    date: s.date,
    video_id: s.videoId,
    youtube_url: s.youtubeUrl,
    credit_author: s.credit?.author ?? null,
    credit_author_url: s.credit?.authorUrl ?? null,
    credit_comment_url: s.credit?.commentUrl ?? null,
  })));

  // 3. Songs
  console.log('Seeding songs...');
  const songs = JSON.parse(fs.readFileSync(path.join(dataDir, 'songs.json'), 'utf-8'));
  await upsert('songs', songs.map((s: any) => ({
    id: s.id,
    title: s.title,
    original_artist: s.originalArtist,
    tags: s.tags ?? [],
  })));

  // 4. Performances (flatten)
  console.log('Seeding performances...');
  const perfRows: object[] = [];
  for (const song of songs) {
    for (const perf of song.performances) {
      perfRows.push({
        id: perf.id,
        song_id: song.id,
        stream_id: perf.streamId,
        date: perf.date,
        stream_title: perf.streamTitle ?? '',
        video_id: perf.videoId,
        timestamp_sec: perf.timestamp,
        end_timestamp_sec: perf.endTimestamp ?? null,
        note: perf.note ?? '',
      });
    }
  }
  // Batch in chunks of 500
  for (let i = 0; i < perfRows.length; i += 500) {
    const chunk = perfRows.slice(i, i + 500);
    const { error } = await supabase.from('performances').upsert(chunk);
    if (error) throw new Error(`Failed to upsert performances: ${error.message}`);
    console.log(`  performances: upserted rows ${i + 1}-${i + chunk.length}`);
  }

  // 5. Metadata
  const metaPath = path.join(dataDir, 'metadata', 'song-metadata.json');
  if (fs.existsSync(metaPath)) {
    console.log('Seeding song_metadata...');
    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    await upsert('song_metadata', metadata.map((m: any) => ({
      song_id: m.songId,
      fetch_status: m.fetchStatus ?? 'no_match',
      match_confidence: m.matchConfidence ?? null,
      album_art_url: m.albumArtUrl ?? null,
      album_art_small: m.albumArtUrls?.small ?? null,
      album_art_medium: m.albumArtUrls?.medium ?? null,
      album_art_big: m.albumArtUrls?.big ?? null,
      album_art_xl: m.albumArtUrls?.xl ?? null,
      album_title: m.albumTitle ?? null,
      itunes_track_id: m.itunesTrackId ?? null,
      itunes_collection_id: m.itunesCollectionId ?? null,
      track_duration: m.trackDuration ?? null,
      fetched_at: m.fetchedAt ?? null,
      last_error: m.lastError ?? null,
    })));
  }

  // 6. Lyrics
  const lyricsPath = path.join(dataDir, 'metadata', 'song-lyrics.json');
  if (fs.existsSync(lyricsPath)) {
    console.log('Seeding song_lyrics...');
    const lyrics = JSON.parse(fs.readFileSync(lyricsPath, 'utf-8'));
    // Batch in chunks (lyrics can be large)
    for (let i = 0; i < lyrics.length; i += 200) {
      const chunk = lyrics.slice(i, i + 200).map((l: any) => ({
        song_id: l.songId,
        fetch_status: l.fetchStatus ?? 'no_match',
        synced_lyrics: l.syncedLyrics ?? null,
        plain_lyrics: l.plainLyrics ?? null,
        fetched_at: l.fetchedAt ?? null,
        last_error: l.lastError ?? null,
      }));
      const { error } = await supabase.from('song_lyrics').upsert(chunk);
      if (error) throw new Error(`Failed to upsert song_lyrics: ${error.message}`);
      console.log(`  song_lyrics: upserted rows ${i + 1}-${i + chunk.length}`);
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
