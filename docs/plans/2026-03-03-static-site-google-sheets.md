# Static Site with Google Sheets Backend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate MizukiPrism to a fully static site (no backend) that reads/writes data from Google Sheets, with YouTube Data API v3 replacing server-side scraping.

**Architecture:** Fan site and admin UI both deploy as static HTML/JS on GitHub Pages. Google Sheets is the single source of truth. Fan site reads from Sheets API. Admin UI reads/writes via Sheets API and fetches YouTube data via YouTube Data API v3. All external API calls happen in the browser.

**Tech Stack:** Next.js 16 (static export), Google Sheets API v4, YouTube Data API v3, TypeScript, React 19

**Design doc:** `docs/plans/2026-03-03-static-site-google-sheets-design.md`

---

## Pre-requisites (Manual — Do Before Starting)

The implementer must complete these manual steps first:

1. **Google Cloud Console** → Create project "MizukiPrism"
2. **Enable APIs** → Google Sheets API + YouTube Data API v3
3. **Create API Key** → Restrict to HTTP referrers (`*.github.io/*`, `localhost:3000/*`) and APIs (Sheets + YouTube)
4. **Create Google Sheet** with 5 tabs:
   - `Performances` — columns: `songId, title, originalArtist, tags, streamId, date, videoId, timestamp, endTimestamp, note`
   - `Streams` — columns: `id, channelId, title, date, videoId, youtubeUrl, creditAuthor, creditAuthorUrl, creditCommentUrl`
   - `Streamers` — columns: `channelId, handle, displayName, avatarUrl, description, youtube, twitter, facebook, instagram, twitch`
   - `Metadata` — columns: `songId, fetchStatus, matchConfidence, albumArtUrl, albumArtSmall, albumArtMedium, albumArtBig, albumArtXl, albumTitle, itunesTrackId, itunesCollectionId, trackDuration, fetchedAt, lastError`
   - `Lyrics` — columns: `songId, fetchStatus, syncedLyrics, plainLyrics, fetchedAt, lastError`
5. **Set Sheet sharing** to "Anyone with the link can edit"
6. **Populate Sheet** — Run the seed script (Task 2) to migrate existing JSON data into the Sheet
7. **Record** the API Key and Sheet ID for use in `lib/config.ts`

---

## Task 1: Create Google Sheets Client Library

**Files:**
- Create: `lib/sheets.ts`
- Create: `lib/config.ts`
- Test: `lib/admin/__tests__/sheets.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/admin/__tests__/sheets.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSheet, appendRows, updateRow } from '../../sheets';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchSheet', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('fetches and parses sheet rows into objects', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        values: [
          ['songId', 'title', 'originalArtist'],
          ['song-1', '誰', '李友廷'],
          ['song-2', '僕が死のうと思ったのは', '中島美嘉'],
        ],
      }),
    });

    const result = await fetchSheet('Performances');
    expect(result).toEqual([
      { songId: 'song-1', title: '誰', originalArtist: '李友廷' },
      { songId: 'song-2', title: '僕が死のうと思ったのは', originalArtist: '中島美嘉' },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('sheets.googleapis.com/v4/spreadsheets/'),
      expect.any(Object),
    );
  });

  it('returns empty array when sheet is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ values: [['songId', 'title']] }),
    });
    const result = await fetchSheet('Performances');
    expect(result).toEqual([]);
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
    await expect(fetchSheet('Performances')).rejects.toThrow('Sheets API error: 403');
  });
});

describe('appendRows', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('appends rows to a sheet tab', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ updates: { updatedRows: 2 } }),
    });

    await appendRows('Streams', [
      { id: 'stream-1', title: 'Test' },
      { id: 'stream-2', title: 'Test 2' },
    ], ['id', 'title']);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(':append?'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- lib/admin/__tests__/sheets.test.ts`
Expected: FAIL — modules not found

**Step 3: Write config module**

```typescript
// lib/config.ts
export const GOOGLE_API_KEY = 'YOUR_API_KEY_HERE'; // Replace after setup
export const SHEET_ID = 'YOUR_SHEET_ID_HERE';       // Replace after setup
export const SHEETS_BASE_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
```

**Step 4: Write sheets client**

```typescript
// lib/sheets.ts
import { GOOGLE_API_KEY, SHEETS_BASE_URL } from './config';

/**
 * Fetch all rows from a sheet tab, returning an array of objects
 * keyed by the header row.
 */
export async function fetchSheet<T extends Record<string, string>>(
  tabName: string,
): Promise<T[]> {
  const url = `${SHEETS_BASE_URL}/values/${encodeURIComponent(tabName)}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);

  const data = await res.json();
  const rows: string[][] = data.values || [];
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj as T;
  }) ;
}

/**
 * Append rows to a sheet tab.
 * `columns` defines the column order matching the sheet header.
 */
export async function appendRows(
  tabName: string,
  rows: Record<string, string | number | null>[],
  columns: string[],
): Promise<void> {
  const url = `${SHEETS_BASE_URL}/values/${encodeURIComponent(tabName)}:append?valueInputOption=RAW&key=${GOOGLE_API_KEY}`;
  const values = rows.map((row) => columns.map((col) => row[col] ?? ''));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets API append error: ${res.status}`);
}

/**
 * Update a specific row range in a sheet tab.
 */
export async function updateRow(
  tabName: string,
  rowIndex: number,
  row: Record<string, string | number | null>,
  columns: string[],
): Promise<void> {
  const range = `${tabName}!A${rowIndex + 2}`;  // +2: header is row 1, data starts row 2
  const url = `${SHEETS_BASE_URL}/values/${encodeURIComponent(range)}?valueInputOption=RAW&key=${GOOGLE_API_KEY}`;
  const values = [columns.map((col) => row[col] ?? '')];
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets API update error: ${res.status}`);
}
```

**Step 5: Run test to verify it passes**

Run: `npm run test:unit -- lib/admin/__tests__/sheets.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/config.ts lib/sheets.ts lib/admin/__tests__/sheets.test.ts
git commit -m "feat: add Google Sheets API client library"
```

---

## Task 2: Create Data Seed Script (JSON → Google Sheet)

**Files:**
- Create: `scripts/seed-sheet.ts`

This script migrates existing `data/*.json` into the Google Sheet. Run once.

**Step 1: Write the seed script**

```typescript
// scripts/seed-sheet.ts
// Usage: npx tsx scripts/seed-sheet.ts
//
// Reads data/*.json files and appends all rows to the Google Sheet.
// Run this ONCE after creating the Sheet with the correct tab headers.

import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GOOGLE_API_KEY || 'YOUR_API_KEY';
const SHEET_ID = process.env.SHEET_ID || 'YOUR_SHEET_ID';
const BASE_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

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

async function main() {
  const dataDir = path.join(process.cwd(), 'data');

  // 1. Songs → Performances (flatten)
  console.log('Seeding Performances...');
  const songs = JSON.parse(fs.readFileSync(path.join(dataDir, 'songs.json'), 'utf-8'));
  const perfRows: (string | number | null)[][] = [];
  for (const song of songs) {
    for (const perf of song.performances) {
      perfRows.push([
        song.id, song.title, song.originalArtist, (song.tags || []).join(','),
        perf.streamId, perf.date, perf.videoId,
        perf.timestamp, perf.endTimestamp ?? '', perf.note || '',
      ]);
    }
  }
  // Batch in chunks of 500
  for (let i = 0; i < perfRows.length; i += 500) {
    await appendToSheet('Performances', perfRows.slice(i, i + 500));
  }

  // 2. Streams
  console.log('Seeding Streams...');
  const streams = JSON.parse(fs.readFileSync(path.join(dataDir, 'streams.json'), 'utf-8'));
  const streamRows = streams.map((s: any) => [
    s.id, s.channelId || '', s.title, s.date, s.videoId, s.youtubeUrl,
    s.credit?.author || '', s.credit?.authorUrl || '', s.credit?.commentUrl || '',
  ]);
  await appendToSheet('Streams', streamRows);

  // 3. Streamers
  console.log('Seeding Streamers...');
  const streamers = JSON.parse(fs.readFileSync(path.join(dataDir, 'streamer.json'), 'utf-8'));
  const streamerRows = streamers.map((s: any) => [
    s.channelId, s.handle, s.displayName, s.avatarUrl, s.description,
    s.socialLinks?.youtube || '', s.socialLinks?.twitter || '',
    s.socialLinks?.facebook || '', s.socialLinks?.instagram || '',
    s.socialLinks?.twitch || '',
  ]);
  await appendToSheet('Streamers', streamerRows);

  // 4. Metadata
  const metaPath = path.join(dataDir, 'metadata', 'song-metadata.json');
  if (fs.existsSync(metaPath)) {
    console.log('Seeding Metadata...');
    const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const metaRows = metadata.map((m: any) => [
      m.songId, m.fetchStatus || '', m.matchConfidence || '',
      m.albumArtUrl || '', m.albumArtUrls?.small || '', m.albumArtUrls?.medium || '',
      m.albumArtUrls?.big || '', m.albumArtUrls?.xl || '', m.albumTitle || '',
      m.itunesTrackId ?? '', m.itunesCollectionId ?? '',
      m.trackDuration ?? '', m.fetchedAt || '', m.lastError || '',
    ]);
    for (let i = 0; i < metaRows.length; i += 500) {
      await appendToSheet('Metadata', metaRows.slice(i, i + 500));
    }
  }

  // 5. Lyrics
  const lyricsPath = path.join(dataDir, 'metadata', 'song-lyrics.json');
  if (fs.existsSync(lyricsPath)) {
    console.log('Seeding Lyrics...');
    const lyrics = JSON.parse(fs.readFileSync(lyricsPath, 'utf-8'));
    const lyricsRows = lyrics.map((l: any) => [
      l.songId, l.fetchStatus || '', l.syncedLyrics || '',
      l.plainLyrics || '', l.fetchedAt || '', l.lastError || '',
    ]);
    for (let i = 0; i < lyricsRows.length; i += 500) {
      await appendToSheet('Lyrics', lyricsRows.slice(i, i + 500));
    }
  }

  console.log('Done!');
}

main().catch(console.error);
```

**Step 2: Run the seed script**

Run: `GOOGLE_API_KEY=... SHEET_ID=... npx tsx scripts/seed-sheet.ts`
Expected: Output showing rows appended per tab

**Step 3: Verify in Google Sheets**

Open the Sheet in browser. Confirm Performances tab has ~503+ rows, Streams has ~14 rows, etc.

**Step 4: Commit**

```bash
git add scripts/seed-sheet.ts
git commit -m "feat: add seed script to migrate JSON data to Google Sheets"
```

---

## Task 3: Create YouTube Data API v3 Client

Replaces server-side YouTube scraping with browser-compatible API calls.

**Files:**
- Create: `lib/youtube-api.ts`
- Test: `lib/admin/__tests__/youtube-api.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/admin/__tests__/youtube-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchVideoInfo, fetchVideoComments, fetchVideoDuration, fetchChannelInfo } from '../../youtube-api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchVideoInfo', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns video title, date, duration, channel info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{
          snippet: {
            title: '【歌枠】テスト',
            publishedAt: '2025-03-26T12:00:00Z',
            channelId: 'UCjv4bfP_67WLuPheS-Z8Ekg',
            channelTitle: '浠Mizuki',
            description: 'description text',
          },
          contentDetails: { duration: 'PT1H30M5S' },
        }],
      }),
    });

    const info = await fetchVideoInfo('lVAiHsvF8z8');
    expect(info).toEqual({
      videoId: 'lVAiHsvF8z8',
      title: '【歌枠】テスト',
      date: '2025-03-26',
      description: 'description text',
      durationSeconds: 5405,
      channelId: 'UCjv4bfP_67WLuPheS-Z8Ekg',
      channelName: '浠Mizuki',
    });
  });
});

describe('fetchVideoComments', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns top-level comments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            snippet: {
              topLevelComment: {
                id: 'c1',
                snippet: {
                  authorDisplayName: 'Kirali',
                  authorChannelUrl: 'http://youtube.com/channel/UC123',
                  textDisplay: '0:00 Song1\n3:45 Song2',
                  likeCount: 10,
                },
              },
            },
          },
        ],
      }),
    });

    const comments = await fetchVideoComments('lVAiHsvF8z8');
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toContain('Song1');
    expect(comments[0].author).toBe('Kirali');
  });
});

describe('fetchVideoDuration', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('searches for a song and returns duration in seconds', async () => {
    // Search returns video IDs
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ id: { videoId: 'abc123' } }],
      }),
    });
    // Videos endpoint returns duration
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ contentDetails: { duration: 'PT4M30S' } }],
      }),
    });

    const duration = await fetchVideoDuration('李友廷', '誰');
    expect(duration).toBe(270);
  });
});

describe('fetchChannelInfo', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns channel profile info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{
          snippet: {
            title: '浠Mizuki',
            customUrl: '@浠Mizuki',
            description: 'VTuber desc',
            thumbnails: { high: { url: 'https://img.example.com/avatar.jpg' } },
          },
        }],
      }),
    });

    const info = await fetchChannelInfo('UCjv4bfP_67WLuPheS-Z8Ekg');
    expect(info).toEqual({
      channelId: 'UCjv4bfP_67WLuPheS-Z8Ekg',
      handle: '@浠Mizuki',
      displayName: '浠Mizuki',
      avatarUrl: 'https://img.example.com/avatar.jpg',
      description: 'VTuber desc',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- lib/admin/__tests__/youtube-api.test.ts`
Expected: FAIL — module not found

**Step 3: Write the YouTube Data API client**

```typescript
// lib/youtube-api.ts
import { GOOGLE_API_KEY } from './config';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/** Parse ISO 8601 duration (PT1H30M5S) to seconds */
export function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) +
         (parseInt(match[2] || '0') * 60) +
         parseInt(match[3] || '0');
}

export interface VideoInfo {
  videoId: string;
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  durationSeconds: number;
  channelId: string;
  channelName: string;
}

/** Fetch video info (title, date, duration, channel) via YouTube Data API v3 */
export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  const url = `${YT_BASE}/videos?part=snippet,contentDetails&id=${videoId}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error(`Video not found: ${videoId}`);

  const item = data.items[0];
  const publishedAt = item.snippet.publishedAt;

  return {
    videoId,
    title: item.snippet.title,
    date: publishedAt.slice(0, 10),
    description: item.snippet.description,
    durationSeconds: parseIsoDuration(item.contentDetails.duration),
    channelId: item.snippet.channelId,
    channelName: item.snippet.channelTitle,
  };
}

export interface YouTubeComment {
  cid: string;
  author: string;
  authorUrl: string;
  text: string;
  likeCount: number;
  isPinned: boolean; // Note: Data API doesn't expose pinned status directly
}

/** Fetch top-level comments for a video */
export async function fetchVideoComments(
  videoId: string,
  maxResults = 20,
): Promise<YouTubeComment[]> {
  const url = `${YT_BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube Comments API error: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map((item: any) => {
    const snippet = item.snippet.topLevelComment.snippet;
    return {
      cid: item.snippet.topLevelComment.id,
      author: snippet.authorDisplayName,
      authorUrl: snippet.authorChannelUrl || '',
      text: snippet.textDisplay,
      likeCount: snippet.likeCount || 0,
      isPinned: false, // Data API v3 doesn't expose this
    };
  });
}

/** Search YouTube for a song and return its duration in seconds */
export async function fetchVideoDuration(
  artist: string,
  title: string,
): Promise<number | null> {
  const query = encodeURIComponent(`${artist} ${title} official`);
  const searchUrl = `${YT_BASE}/search?part=snippet&q=${query}&type=video&maxResults=3&key=${GOOGLE_API_KEY}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();

  const videoIds = (searchData.items || [])
    .map((item: any) => item.id?.videoId)
    .filter(Boolean)
    .join(',');
  if (!videoIds) return null;

  const detailUrl = `${YT_BASE}/videos?part=contentDetails&id=${videoIds}&key=${GOOGLE_API_KEY}`;
  const detailRes = await fetch(detailUrl);
  if (!detailRes.ok) return null;
  const detailData = await detailRes.json();

  if (!detailData.items?.length) return null;
  return parseIsoDuration(detailData.items[0].contentDetails.duration);
}

export interface ChannelInfo {
  channelId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  description: string;
}

/** Fetch channel profile info */
export async function fetchChannelInfo(channelId: string): Promise<ChannelInfo> {
  const url = `${YT_BASE}/channels?part=snippet&id=${channelId}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube Channels API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error(`Channel not found: ${channelId}`);

  const snippet = data.items[0].snippet;
  return {
    channelId,
    handle: snippet.customUrl || '',
    displayName: snippet.title,
    avatarUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    description: snippet.description || '',
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- lib/admin/__tests__/youtube-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/youtube-api.ts lib/admin/__tests__/youtube-api.test.ts
git commit -m "feat: add YouTube Data API v3 client (replaces server-side scraping)"
```

---

## Task 4: Create Sheets Data Layer for Fan-Facing Page

Replaces `fetch('/api/songs')` etc. with Google Sheets reads. Transforms flat sheet rows back into nested Song/Stream types.

**Files:**
- Create: `lib/sheets-data.ts`
- Test: `lib/admin/__tests__/sheets-data.test.ts`

**Step 1: Write the failing test**

```typescript
// lib/admin/__tests__/sheets-data.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSongsFromSheet, loadStreamsFromSheet, loadMetadataFromSheet } from '../../sheets-data';

vi.mock('../../sheets', () => ({
  fetchSheet: vi.fn(),
}));

import { fetchSheet } from '../../sheets';
const mockFetchSheet = vi.mocked(fetchSheet);

describe('loadSongsFromSheet', () => {
  it('groups flat performance rows into nested Song objects', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { songId: 'song-1', title: '誰', originalArtist: '李友廷', tags: '',
        streamId: 'stream-1', date: '2025-03-26', videoId: 'abc',
        timestamp: '263', endTimestamp: '506', note: '' },
      { songId: 'song-1', title: '誰', originalArtist: '李友廷', tags: '',
        streamId: 'stream-2', date: '2026-01-01', videoId: 'def',
        timestamp: '100', endTimestamp: '300', note: 'encore' },
      { songId: 'song-2', title: '僕が死のうと思ったのは', originalArtist: '中島美嘉', tags: '',
        streamId: 'stream-1', date: '2025-03-26', videoId: 'abc',
        timestamp: '884', endTimestamp: '1255', note: '' },
    ]);

    const songs = await loadSongsFromSheet();
    expect(songs).toHaveLength(2);
    expect(songs[0].id).toBe('song-1');
    expect(songs[0].title).toBe('誰');
    expect(songs[0].performances).toHaveLength(2);
    expect(songs[0].performances[0].timestamp).toBe(263);
    expect(songs[0].performances[1].note).toBe('encore');
    expect(songs[1].performances).toHaveLength(1);
  });
});

describe('loadStreamsFromSheet', () => {
  it('parses stream rows with credit object', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { id: 'stream-1', channelId: 'UC123', title: 'Test Stream', date: '2025-03-26',
        videoId: 'abc', youtubeUrl: 'https://youtube.com/watch?v=abc',
        creditAuthor: '@hydai', creditAuthorUrl: 'UC456', creditCommentUrl: 'https://...' },
    ]);

    const streams = await loadStreamsFromSheet();
    expect(streams).toHaveLength(1);
    expect(streams[0].credit).toEqual({
      author: '@hydai',
      authorUrl: 'UC456',
      commentUrl: 'https://...',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- lib/admin/__tests__/sheets-data.test.ts`
Expected: FAIL — module not found

**Step 3: Write the sheets data layer**

```typescript
// lib/sheets-data.ts
import { fetchSheet } from './sheets';
import type { Song, Performance, Stream, SongMetadata, SongLyrics, ArtistInfo } from './types';

/** Load songs from the flat Performances sheet, grouped by songId */
export async function loadSongsFromSheet(): Promise<Song[]> {
  const rows = await fetchSheet('Performances');
  const songMap = new Map<string, Song>();

  for (const row of rows) {
    const songId = row.songId;
    if (!songMap.has(songId)) {
      songMap.set(songId, {
        id: songId,
        title: row.title,
        originalArtist: row.originalArtist,
        tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
        performances: [],
      });
    }

    const song = songMap.get(songId)!;
    const perfIndex = song.performances.length + 1;
    const songIndex = songId.replace('song-', '');

    song.performances.push({
      id: `p${songIndex}-${perfIndex}`,
      streamId: row.streamId,
      date: row.date,
      streamTitle: '', // Not stored in sheet; populated from streams if needed
      videoId: row.videoId,
      timestamp: Number(row.timestamp) || 0,
      endTimestamp: row.endTimestamp ? Number(row.endTimestamp) : null,
      note: row.note || '',
    });
  }

  return Array.from(songMap.values());
}

/** Load streams from sheet, reconstructing credit object */
export async function loadStreamsFromSheet(): Promise<Stream[]> {
  const rows = await fetchSheet('Streams');
  return rows.map((row) => {
    const stream: Stream = {
      id: row.id,
      channelId: row.channelId || undefined,
      title: row.title,
      date: row.date,
      videoId: row.videoId,
      youtubeUrl: row.youtubeUrl,
    };
    if (row.creditAuthor) {
      stream.credit = {
        author: row.creditAuthor,
        authorUrl: row.creditAuthorUrl || '',
        commentUrl: row.creditCommentUrl || undefined,
      };
    }
    return stream;
  });
}

/** Load song metadata from sheet */
export async function loadMetadataFromSheet(): Promise<{
  songMetadata: SongMetadata[];
  artistInfo: ArtistInfo[];
}> {
  const metaRows = await fetchSheet('Metadata');
  const songMetadata: SongMetadata[] = metaRows.map((row) => ({
    songId: row.songId,
    fetchStatus: (row.fetchStatus as 'matched' | 'no_match' | 'error' | 'manual') || 'no_match',
    matchConfidence: (row.matchConfidence as 'exact' | 'fuzzy' | 'manual' | null) || null,
    albumArtUrl: row.albumArtUrl || undefined,
    albumArtUrls: row.albumArtSmall ? {
      small: row.albumArtSmall,
      medium: row.albumArtMedium,
      big: row.albumArtBig,
      xl: row.albumArtXl,
    } : undefined,
    albumTitle: row.albumTitle || undefined,
    itunesTrackId: row.itunesTrackId ? Number(row.itunesTrackId) : undefined,
    itunesCollectionId: row.itunesCollectionId ? Number(row.itunesCollectionId) : undefined,
    trackDuration: row.trackDuration ? Number(row.trackDuration) : undefined,
    fetchedAt: row.fetchedAt || '',
    lastError: row.lastError || undefined,
  }));

  // ArtistInfo is derived — not stored separately in Sheet
  // Return empty for now; can add an ArtistInfo tab later if needed
  return { songMetadata, artistInfo: [] };
}

/** Load lyrics from sheet (lazy-loaded) */
export async function loadLyricsFromSheet(): Promise<SongLyrics[]> {
  const rows = await fetchSheet('Lyrics');
  return rows.map((row) => ({
    songId: row.songId,
    fetchStatus: (row.fetchStatus as 'matched' | 'no_match' | 'error' | 'manual') || 'no_match',
    syncedLyrics: row.syncedLyrics || undefined,
    plainLyrics: row.plainLyrics || undefined,
    fetchedAt: row.fetchedAt || '',
    lastError: row.lastError || undefined,
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- lib/admin/__tests__/sheets-data.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/sheets-data.ts lib/admin/__tests__/sheets-data.test.ts
git commit -m "feat: add Sheets data layer to transform flat rows into Song/Stream types"
```

---

## Task 5: Migrate Fan-Facing Page to Sheets Data

Replace `fetch('/api/...')` calls in `app/page.tsx` with the new Sheets data layer.

**Files:**
- Modify: `app/page.tsx` (lines ~92-140 where fetch calls happen)

**Step 1: Update imports in page.tsx**

Add at top of file:
```typescript
import { loadSongsFromSheet, loadStreamsFromSheet, loadMetadataFromSheet, loadLyricsFromSheet } from '@/lib/sheets-data';
```

**Step 2: Replace fetch('/api/songs') with loadSongsFromSheet()**

Find the `fetch('/api/songs')` call and replace with:
```typescript
loadSongsFromSheet().then((data) => {
  const merged = data.map(song => ({
    ...song,
    albumArtUrl: albumArtMapRef.current.get(song.id),
  }));
  setSongs(merged);
});
```

**Step 3: Replace fetch('/api/metadata') with loadMetadataFromSheet()**

Find the `fetch('/api/metadata')` call and replace with:
```typescript
loadMetadataFromSheet().then((data) => {
  const map = new Map<string, string>();
  for (const meta of data.songMetadata) {
    if (meta.albumArtUrl) map.set(meta.songId, meta.albumArtUrl);
  }
  albumArtMapRef.current = map;
}).finally(() => {
  fetchSongs();
});
```

**Step 4: Replace fetch('/api/streams') with loadStreamsFromSheet()**

**Step 5: Replace fetch('/api/lyrics') with loadLyricsFromSheet()**

Find the lyrics fetch (lazy-loaded on panel open) and replace.

**Step 6: Verify the fan site loads correctly**

Run: `npm run dev`
Open: `http://localhost:3000`
Expected: Songs load from Google Sheet, album art displays, player works

**Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: migrate fan-facing page to load data from Google Sheets"
```

---

## Task 6: Migrate Admin Discover Page to Client-Side APIs

Replace backend API calls with direct YouTube Data API + Sheets API calls.

**Files:**
- Modify: `app/admin/discover/page.tsx`

**Step 1: Replace discover API call**

Find `fetch('/api/admin/discover', ...)` and replace with direct call to `fetchVideoInfo()` from `lib/youtube-api.ts`.

**Step 2: Replace extract API call**

Find `fetch('/api/admin/extract', ...)` and replace with:
- `fetchVideoComments(videoId)` from `lib/youtube-api.ts`
- `findCandidateComment(comments)` from `lib/admin/extraction.ts` (reuse existing logic)
- `parseTextToSongs(text)` from `lib/admin/extraction.ts` (reuse existing logic)
- Duration enrichment: replace `fetchYouTubeDuration()` from youtube.ts with `fetchVideoDuration()` from `lib/youtube-api.ts`

**Step 3: Replace import API call**

Find `fetch('/api/admin/import', ...)` and replace with `appendRows()` calls to the Sheets API:
- Append to `Performances` tab (one row per song)
- Append to `Streams` tab (one row)

**Step 4: Replace metadata API call**

The metadata fetch (iTunes + LRCLIB) can stay as-is — these APIs are already CORS-friendly. Just call `fetchItunesMetadata()` and `fetchLrclibLyrics()` directly from the browser instead of through `/api/admin/metadata`.

After fetching, use `appendRows()` to write to the `Metadata` and `Lyrics` tabs in the Sheet.

**Step 5: Replace streamer API call**

Replace `fetch('/api/admin/streamer', ...)` with `fetchChannelInfo()` from `lib/youtube-api.ts`. Write new streamers to the `Streamers` tab via `appendRows()`.

**Step 6: Verify admin workflow**

Run: `npm run dev`
Open: `http://localhost:3000/admin/discover` (or the hidden admin URL)
Test: Paste a YouTube URL → songs extract → import → verify data appears in Google Sheet

**Step 7: Commit**

```bash
git add app/admin/discover/page.tsx
git commit -m "feat: migrate admin discover page to client-side YouTube + Sheets APIs"
```

---

## Task 7: Update Extraction Library for Client-Side Duration Enrichment

The existing `enrichMissingEndTimestamps()` in `lib/admin/extraction.ts` calls `fetchYouTubeDuration()` from the old `youtube.ts`. Update it to use the new YouTube Data API client.

**Files:**
- Modify: `lib/admin/extraction.ts`

**Step 1: Update the import**

Replace:
```typescript
import { fetchYouTubeDuration } from './youtube';
```
With:
```typescript
import { fetchVideoDuration } from '../youtube-api';
```

**Step 2: Update enrichMissingEndTimestamps()**

Replace the call to `fetchYouTubeDuration(artist, title)` with `fetchVideoDuration(artist, title)`. The signature is the same (returns `number | null`).

Note: The YouTube Data API search costs 100 quota units per call. With 10,000 units/day, that's ~100 searches/day. A typical stream import has ~15 songs needing enrichment, so this is fine.

**Step 3: Run existing extraction tests**

Run: `npm run test:unit -- lib/admin/__tests__/extraction.test.ts`
Expected: PASS (tests mock the duration function)

**Step 4: Commit**

```bash
git add lib/admin/extraction.ts
git commit -m "refactor: update extraction to use YouTube Data API for duration enrichment"
```

---

## Task 8: Remove Server-Side API Routes and Middleware

Clean up all the backend code that's no longer needed.

**Files:**
- Delete: `app/api/songs/route.ts`
- Delete: `app/api/streams/route.ts`
- Delete: `app/api/metadata/route.ts`
- Delete: `app/api/lyrics/route.ts`
- Delete: `app/api/admin/discover/route.ts`
- Delete: `app/api/admin/extract/route.ts`
- Delete: `app/api/admin/import/route.ts`
- Delete: `app/api/admin/metadata/route.ts`
- Delete: `app/api/admin/streamer/route.ts`
- Delete: `app/api/admin/deploy/route.ts`
- Delete: `app/api/auth/login/route.ts`
- Delete: `app/api/auth/check/route.ts`
- Delete: `middleware.ts`
- Delete: `lib/data.ts` (fs-based data loading, no longer needed)
- Delete: `lib/admin/youtube.ts` (server-side scraping, replaced by youtube-api.ts)
- Modify: `lib/admin/data-writer.ts` — either delete or keep parts needed for Sheet writes

**Step 1: Delete all API route files**

```bash
rm -rf app/api/
rm middleware.ts
rm lib/data.ts
rm lib/admin/youtube.ts
```

**Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Static export builds successfully with no errors

**Step 3: Fix any broken imports**

If any remaining files import from deleted modules, update them.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove server-side API routes, middleware, and scraping code"
```

---

## Task 9: Update E2E Tests

E2E tests currently hit API routes that no longer exist. Update them to work with the Sheets-based architecture.

**Files:**
- Modify: `tests/core-001.spec.ts` — fan-facing page test (should still work if Sheets data loads)
- Modify: `tests/admin-kirali-import.spec.ts` — admin workflow (needs significant update)
- Modify: `tests/admin-discover.spec.ts` — admin paste flow
- Delete or skip: tests that depend on server-side API routes

**Step 1: Update core fan-facing test**

The core test should still work since the page still loads songs — just from Sheets now instead of API routes. Run it first to check:

Run: `npx playwright test tests/core-001.spec.ts`
Expected: Should pass if Google Sheet is accessible

**Step 2: Update admin E2E tests**

Admin tests that use `fetch('/api/admin/...')` need to be updated. The admin UI now calls YouTube Data API and Sheets API directly from the browser. Mock or intercept these calls in tests.

**Step 3: Run full E2E suite**

Run: `npx playwright test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: update E2E tests for Sheets-based architecture"
```

---

## Task 10: Verify Static Export and Deploy

**Step 1: Build static site**

Run: `npm run build`
Expected: `out/` directory created with static HTML/JS

**Step 2: Serve static build locally**

Run: `npx serve out`
Open: `http://localhost:3000`
Expected: Fan site loads, songs display from Google Sheets, player works

**Step 3: Verify admin page works in static build**

Navigate to the admin page in the static build.
Expected: Admin UI loads, YouTube search works, can import to Sheet

**Step 4: Deploy to GitHub Pages**

Push the `out/` directory (or set up GitHub Actions to build and deploy).

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: finalize static export configuration"
```

---

## Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Google Sheets API client library | Medium |
| 2 | Data seed script (JSON → Sheet) | Low |
| 3 | YouTube Data API v3 client | Medium |
| 4 | Sheets data layer (row → Song/Stream) | Medium |
| 5 | Migrate fan page to Sheets data | Medium |
| 6 | Migrate admin page to client-side APIs | High |
| 7 | Update extraction for client-side duration | Low |
| 8 | Remove server-side code | Low |
| 9 | Update E2E tests | Medium |
| 10 | Verify static export and deploy | Low |

**Dependencies:** Task 1 → Tasks 2, 4, 5, 6. Task 3 → Tasks 6, 7. Task 8 depends on Tasks 5-7 being complete.
