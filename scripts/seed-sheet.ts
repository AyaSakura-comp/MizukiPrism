// scripts/seed-sheet.ts
// Usage: GOOGLE_API_KEY=... SHEET_ID=... npx tsx scripts/seed-sheet.ts
//
// Reads data/*.json files and appends all rows to the Google Sheet.
// Run this ONCE after creating the Sheet with the correct tab headers.

import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GOOGLE_API_KEY;
const SHEET_ID_ENV = process.env.SHEET_ID;

if (!API_KEY || !SHEET_ID_ENV) {
  console.error('Usage: GOOGLE_API_KEY=... SHEET_ID=... npx tsx scripts/seed-sheet.ts');
  process.exit(1);
}

const BASE_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID_ENV}`;
const CHUNK_SIZE = 500;

async function appendToSheet(tab: string, values: (string | number | null)[][]) {
  const url = `${BASE_URL}/values/${encodeURIComponent(tab)}:append?valueInputOption=RAW&key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to append to ${tab}: ${res.status} ${text}`);
  }
  const data = await res.json();
  console.log(`  ${tab}: appended ${data.updates?.updatedRows ?? '?'} rows`);
}

async function appendInChunks(tab: string, rows: (string | number | null)[][]) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await appendToSheet(tab, rows.slice(i, i + CHUNK_SIZE));
  }
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');

  // 1. Songs -> Performances (flatten: one row per performance, song info repeated)
  console.log('Seeding Performances...');
  const songs = JSON.parse(fs.readFileSync(path.join(dataDir, 'songs.json'), 'utf-8'));
  const perfRows: (string | number | null)[][] = [];
  for (const song of songs) {
    for (const perf of song.performances) {
      perfRows.push([
        song.id,
        song.title,
        song.originalArtist,
        (song.tags || []).join(','),
        perf.streamId,
        perf.date,
        perf.videoId,
        perf.timestamp,
        perf.endTimestamp ?? '',
        perf.note || '',
      ]);
    }
  }
  await appendInChunks('Performances', perfRows);
  console.log(`  Total: ${perfRows.length} performance rows`);

  // 2. Streams (flatten credit object)
  console.log('Seeding Streams...');
  const streams = JSON.parse(fs.readFileSync(path.join(dataDir, 'streams.json'), 'utf-8'));
  const streamRows = streams.map((s: any) => [
    s.id,
    s.channelId || '',
    s.title,
    s.date,
    s.videoId,
    s.youtubeUrl,
    s.credit?.author || '',
    s.credit?.authorUrl || '',
    s.credit?.commentUrl || '',
  ]);
  await appendToSheet('Streams', streamRows);
  console.log(`  Total: ${streamRows.length} stream rows`);

  // 3. Streamers (flatten socialLinks)
  console.log('Seeding Streamers...');
  const streamers = JSON.parse(fs.readFileSync(path.join(dataDir, 'streamer.json'), 'utf-8'));
  const streamerRows = streamers.map((s: any) => [
    s.channelId,
    s.handle,
    s.displayName,
    s.avatarUrl,
    s.description,
    s.socialLinks?.youtube || '',
    s.socialLinks?.twitter || '',
    s.socialLinks?.facebook || '',
    s.socialLinks?.instagram || '',
    s.socialLinks?.twitch || '',
  ]);
  await appendToSheet('Streamers', streamerRows);
  console.log(`  Total: ${streamerRows.length} streamer rows`);

  // 4. Metadata (flatten albumArtUrls)
  const metaPath = path.join(dataDir, 'metadata', 'song-metadata.json');
  if (fs.existsSync(metaPath)) {
    console.log('Seeding Metadata...');
    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const metaRows = metadata.map((m: any) => [
      m.songId,
      m.fetchStatus || '',
      m.matchConfidence || '',
      m.albumArtUrl || '',
      m.albumArtUrls?.small || '',
      m.albumArtUrls?.medium || '',
      m.albumArtUrls?.big || '',
      m.albumArtUrls?.xl || '',
      m.albumTitle || '',
      m.itunesTrackId ?? m.deezerTrackId ?? '',
      m.itunesCollectionId ?? m.deezerArtistId ?? '',
      m.trackDuration ?? '',
      m.fetchedAt || '',
      m.lastError || '',
    ]);
    await appendInChunks('Metadata', metaRows);
    console.log(`  Total: ${metaRows.length} metadata rows`);
  } else {
    console.log('Skipping Metadata (file not found)');
  }

  // 5. Lyrics
  const lyricsPath = path.join(dataDir, 'metadata', 'song-lyrics.json');
  if (fs.existsSync(lyricsPath)) {
    console.log('Seeding Lyrics...');
    const lyrics = JSON.parse(fs.readFileSync(lyricsPath, 'utf-8'));
    const lyricsRows = lyrics.map((l: any) => [
      l.songId,
      l.fetchStatus || '',
      l.syncedLyrics || '',
      l.plainLyrics || '',
      l.fetchedAt || '',
      l.lastError || '',
    ]);
    await appendInChunks('Lyrics', lyricsRows);
    console.log(`  Total: ${lyricsRows.length} lyrics rows`);
  } else {
    console.log('Skipping Lyrics (file not found)');
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
