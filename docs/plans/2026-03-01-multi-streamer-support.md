# Multi-Streamer Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the MizukiPrism catalog to support multiple streamers, with auto-populated streamer profiles fetched from YouTube during the admin import flow.

**Architecture:** `data/streamer.json` becomes an array of streamer profiles. Each stream in `streams.json` gains a `channelId` foreign key linking to its streamer. The discover API extracts `channelId` from the video page data already fetched. A new channel page scraper fetches streamer avatar/handle/description. The fan-facing page gains a streamer switcher in the filter bar.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest (unit tests), Playwright (E2E), YouTube innertube page scraping

**Key architectural constraints:**
- `data/streamer.json` is imported directly by `app/page.tsx` via `import streamerData from '@/data/streamer.json'` — changing from object to array requires updating this import and all references.
- `videoDetails.channelId` is already available in `ytInitialPlayerResponse` — no extra fetch needed for the channel ID itself.
- Channel profile scraping (avatar, handle, description) requires a separate fetch to `youtube.com/channel/{channelId}` and parsing `ytInitialData` (different from `ytInitialPlayerResponse`).

---

### Task 1: Add `Streamer` type and update `Stream` type

**Files:**
- Modify: `lib/types.ts`

**Step 1: Add `Streamer` interface and update `Stream`**

Add to the end of the interfaces section in `lib/types.ts`:

```typescript
export interface Streamer {
  channelId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  description: string;
  socialLinks: Record<string, string>;
}
```

Update the existing `Stream` interface to add `channelId`:

```typescript
export interface Stream {
  id: string;
  channelId?: string;  // optional for backwards compat during migration
  title: string;
  date: string;
  videoId: string;
  youtubeUrl: string;
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: No errors (channelId is optional so existing code still compiles).

**Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add Streamer type and channelId to Stream"
```

---

### Task 2: YouTube channel profile scraping

Add a function to `lib/admin/youtube.ts` that fetches a YouTube channel page and extracts avatar, handle, and description from `ytInitialData`.

**Files:**
- Create: `lib/admin/__tests__/youtube-channel.test.ts`
- Modify: `lib/admin/youtube.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseChannelProfile, extractChannelInfo } from '../youtube';

describe('extractChannelInfo', () => {
  it('extracts channelId and author from videoDetails', () => {
    const videoData = {
      videoDetails: {
        videoId: 'abc123',
        title: 'Test Video',
        channelId: 'UCxxxxxxxx',
        author: 'Test Streamer',
        shortDescription: '',
        lengthSeconds: '3600',
      },
      microformat: {
        playerMicroformatRenderer: {
          ownerProfileUrl: 'http://www.youtube.com/@TestStreamer',
          uploadDate: '2026-01-01',
        },
      },
    };
    const info = extractChannelInfo(videoData);
    expect(info).toEqual({
      channelId: 'UCxxxxxxxx',
      author: 'Test Streamer',
      handle: '@TestStreamer',
    });
  });

  it('returns null handle when ownerProfileUrl is missing', () => {
    const videoData = {
      videoDetails: {
        channelId: 'UCxxxxxxxx',
        author: 'Test',
      },
      microformat: {},
    };
    const info = extractChannelInfo(videoData);
    expect(info.handle).toBeNull();
  });
});

describe('parseChannelProfile', () => {
  it('parses c4TabbedHeaderRenderer for avatar and metadata', () => {
    const mockData = {
      header: {
        c4TabbedHeaderRenderer: {
          avatar: {
            thumbnails: [
              { url: 'https://yt3.ggpht.com/small', width: 48, height: 48 },
              { url: 'https://yt3.ggpht.com/medium', width: 88, height: 88 },
              { url: 'https://yt3.ggpht.com/large', width: 176, height: 176 },
            ],
          },
          title: '煌Kirali',
          channelHandleText: { simpleText: '@KiraliHikari' },
        },
      },
      metadata: {
        channelMetadataRenderer: {
          description: 'A VTuber who loves singing',
          vanityChannelUrl: 'http://www.youtube.com/@KiraliHikari',
          externalId: 'UCxxxxxxxx',
        },
      },
    };

    const profile = parseChannelProfile(mockData, 'UCxxxxxxxx');
    expect(profile).toEqual({
      channelId: 'UCxxxxxxxx',
      handle: '@KiraliHikari',
      displayName: '煌Kirali',
      avatarUrl: 'https://yt3.ggpht.com/large',
      description: 'A VTuber who loves singing',
      socialLinks: {},
    });
  });

  it('falls back to pageHeaderRenderer when c4TabbedHeaderRenderer is absent', () => {
    const mockData = {
      header: {
        pageHeaderRenderer: {
          content: {
            pageHeaderViewModel: {
              title: { dynamicTextViewModel: { text: { content: 'FallbackName' } } },
              image: {
                decoratedAvatarViewModel: {
                  avatar: {
                    avatarViewModel: {
                      image: {
                        sources: [
                          { url: 'https://yt3.ggpht.com/fallback', width: 176, height: 176 },
                        ],
                      },
                    },
                  },
                },
              },
              metadata: {
                contentMetadataViewModel: {
                  metadataRows: [
                    { metadataParts: [{ text: { content: '@FallbackHandle' } }] },
                  ],
                },
              },
            },
          },
        },
      },
      metadata: {
        channelMetadataRenderer: {
          description: 'Fallback description',
          externalId: 'UCfallback',
        },
      },
    };

    const profile = parseChannelProfile(mockData, 'UCfallback');
    expect(profile.displayName).toBe('FallbackName');
    expect(profile.avatarUrl).toBe('https://yt3.ggpht.com/fallback');
    expect(profile.handle).toBe('@FallbackHandle');
  });

  it('returns minimal profile when scraping yields nothing', () => {
    const profile = parseChannelProfile({}, 'UCempty');
    expect(profile.channelId).toBe('UCempty');
    expect(profile.displayName).toBe('');
    expect(profile.avatarUrl).toBe('');
  });
});
```

Save to `lib/admin/__tests__/youtube-channel.test.ts`

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- youtube-channel
```

Expected: ALL FAIL (functions not found).

**Step 3: Add `extractChannelInfo` and `parseChannelProfile` to youtube.ts**

Add to `lib/admin/youtube.ts`:

```typescript
// ---------------------------------------------------------------------------
// Channel info extraction from video page data
// ---------------------------------------------------------------------------

export interface ChannelInfo {
  channelId: string;
  author: string;
  handle: string | null;
}

/**
 * Extract channel info from ytInitialPlayerResponse (already fetched for video).
 */
export function extractChannelInfo(data: Record<string, unknown>): ChannelInfo {
  const details = (data as any).videoDetails || {};
  const microformat = (data as any).microformat?.playerMicroformatRenderer || {};

  let handle: string | null = null;
  const ownerUrl = microformat.ownerProfileUrl || '';
  const handleMatch = ownerUrl.match(/@([A-Za-z0-9_.-]+)/);
  if (handleMatch) handle = `@${handleMatch[1]}`;

  return {
    channelId: details.channelId || '',
    author: details.author || '',
    handle,
  };
}

// ---------------------------------------------------------------------------
// Channel profile scraping
// ---------------------------------------------------------------------------

export interface ChannelProfile {
  channelId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  description: string;
  socialLinks: Record<string, string>;
}

/**
 * Fetch a YouTube channel page and extract profile info from ytInitialData.
 */
export async function fetchChannelProfile(channelId: string): Promise<ChannelProfile> {
  const url = `https://www.youtube.com/channel/${channelId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });
  const html = await res.text();

  const dataMatch = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script/s)
    || html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script/s);
  if (!dataMatch) return { channelId, handle: '', displayName: '', avatarUrl: '', description: '', socialLinks: {} };

  const pageData = JSON.parse(dataMatch[1]);
  return parseChannelProfile(pageData, channelId);
}

/**
 * Parse ytInitialData from a channel page into a ChannelProfile.
 * Supports both c4TabbedHeaderRenderer (older) and pageHeaderRenderer (newer) formats.
 */
export function parseChannelProfile(data: any, channelId: string): ChannelProfile {
  const profile: ChannelProfile = {
    channelId,
    handle: '',
    displayName: '',
    avatarUrl: '',
    description: '',
    socialLinks: {},
  };

  // Metadata (consistent across header formats)
  const meta = data?.metadata?.channelMetadataRenderer || {};
  profile.description = meta.description || '';

  // Try c4TabbedHeaderRenderer first (older/common format)
  const c4 = data?.header?.c4TabbedHeaderRenderer;
  if (c4) {
    profile.displayName = c4.title || '';
    const thumbnails = c4.avatar?.thumbnails || [];
    profile.avatarUrl = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';
    profile.handle = c4.channelHandleText?.simpleText || '';
    return profile;
  }

  // Fallback: pageHeaderRenderer (newer format)
  const phr = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
  if (phr) {
    profile.displayName = phr.title?.dynamicTextViewModel?.text?.content || '';

    const avatarSources = phr.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources || [];
    profile.avatarUrl = avatarSources.length > 0 ? avatarSources[avatarSources.length - 1].url : '';

    const metadataRows = phr.metadata?.contentMetadataViewModel?.metadataRows || [];
    if (metadataRows.length > 0) {
      const handleText = metadataRows[0]?.metadataParts?.[0]?.text?.content || '';
      if (handleText.startsWith('@')) profile.handle = handleText;
    }
  }

  return profile;
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- youtube-channel
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add lib/admin/youtube.ts lib/admin/__tests__/youtube-channel.test.ts
git commit -m "feat: add YouTube channel profile scraping"
```

---

### Task 3: Streamer data writer service

Add functions to read/write `streamer.json` and check for existing streamers.

**Files:**
- Create: `lib/admin/__tests__/streamer-writer.test.ts`
- Modify: `lib/admin/data-writer.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  readStreamers,
  writeStreamers,
  findStreamerByChannelId,
  addStreamer,
} from '../data-writer';

function createTempData() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuki-streamer-'));
  fs.writeFileSync(
    path.join(tmpDir, 'streamer.json'),
    JSON.stringify([
      {
        channelId: 'UC111',
        handle: '@Mizuki',
        displayName: '浠Mizuki',
        avatarUrl: 'https://example.com/mizuki.jpg',
        description: 'A VTuber',
        socialLinks: { youtube: 'https://youtube.com/@Mizuki' },
      },
    ])
  );
  return tmpDir;
}

describe('readStreamers', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempData(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads streamer array from file', () => {
    const streamers = readStreamers(tmpDir);
    expect(streamers).toHaveLength(1);
    expect(streamers[0].channelId).toBe('UC111');
  });

  it('returns empty array when file is empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'streamer.json'), '');
    const streamers = readStreamers(tmpDir);
    expect(streamers).toEqual([]);
  });
});

describe('findStreamerByChannelId', () => {
  it('finds existing streamer', () => {
    const streamers = [{ channelId: 'UC111', handle: '@Mizuki', displayName: '浠Mizuki', avatarUrl: '', description: '', socialLinks: {} }];
    expect(findStreamerByChannelId(streamers, 'UC111')).toBeTruthy();
  });

  it('returns null for unknown channelId', () => {
    const streamers = [{ channelId: 'UC111', handle: '@Mizuki', displayName: '浠Mizuki', avatarUrl: '', description: '', socialLinks: {} }];
    expect(findStreamerByChannelId(streamers, 'UC999')).toBeNull();
  });
});

describe('addStreamer', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempData(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('appends new streamer to file', () => {
    addStreamer(tmpDir, {
      channelId: 'UC222',
      handle: '@Kirali',
      displayName: '煌Kirali',
      avatarUrl: 'https://example.com/kirali.jpg',
      description: 'Singer',
      socialLinks: { youtube: 'https://youtube.com/@Kirali' },
    });

    const streamers = readStreamers(tmpDir);
    expect(streamers).toHaveLength(2);
    expect(streamers[1].channelId).toBe('UC222');
  });

  it('skips duplicate channelId', () => {
    addStreamer(tmpDir, {
      channelId: 'UC111',
      handle: '@Mizuki',
      displayName: '浠Mizuki',
      avatarUrl: '',
      description: '',
      socialLinks: {},
    });

    const streamers = readStreamers(tmpDir);
    expect(streamers).toHaveLength(1);
  });
});
```

Save to `lib/admin/__tests__/streamer-writer.test.ts`

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- streamer-writer
```

Expected: ALL FAIL.

**Step 3: Add streamer functions to data-writer.ts**

Add to `lib/admin/data-writer.ts`:

```typescript
import type { Streamer } from '@/lib/types';

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
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- streamer-writer
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add lib/admin/data-writer.ts lib/admin/__tests__/streamer-writer.test.ts
git commit -m "feat: add streamer data reader/writer"
```

---

### Task 4: Update discover API to return channel info

The discover API already fetches the video page. Extend it to also return `channelId`, `author`, and `handle` from the same data — and whether this is a new streamer.

**Files:**
- Modify: `app/api/admin/discover/route.ts`
- Modify: `lib/admin/youtube.ts` (add `channelId`/`author` to `VideoInfo`)

**Step 1: Extend `VideoInfo` to include channel info**

In `lib/admin/youtube.ts`, update the `VideoInfo` interface:

```typescript
export interface VideoInfo {
  videoId: string;
  title: string;
  date: string;
  description: string;
  durationSeconds: number;
  channelId: string;
  channelName: string;
  channelHandle: string | null;
}
```

Update `parseVideoInfo`:

```typescript
export function parseVideoInfo(data: Record<string, unknown>): VideoInfo {
  const details = (data as any).videoDetails || {};
  const microformat = (data as any).microformat?.playerMicroformatRenderer || {};

  const rawDate = microformat.uploadDate || microformat.publishDate || '';
  const date = rawDate.slice(0, 10);

  let handle: string | null = null;
  const ownerUrl = microformat.ownerProfileUrl || '';
  const handleMatch = ownerUrl.match(/@([A-Za-z0-9_.-]+)/);
  if (handleMatch) handle = `@${handleMatch[1]}`;

  return {
    videoId: details.videoId || '',
    title: details.title || '',
    date,
    description: details.shortDescription || '',
    durationSeconds: parseInt(details.lengthSeconds || '0', 10),
    channelId: details.channelId || '',
    channelName: details.author || '',
    channelHandle: handle,
  };
}
```

**Step 2: Update discover API to check for new streamer**

In `app/api/admin/discover/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { extractVideoId, fetchVideoPage, parseVideoInfo } from '@/lib/admin/youtube';
import { readStreamers, findStreamerByChannelId } from '@/lib/admin/data-writer';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const pageData = await fetchVideoPage(videoId);
    const videoInfo = parseVideoInfo(pageData);

    // Check if this channel is already known
    const streamers = readStreamers(DATA_DIR);
    const existingStreamer = findStreamerByChannelId(streamers, videoInfo.channelId);

    return NextResponse.json({
      ...videoInfo,
      isNewStreamer: !existingStreamer,
      existingStreamer: existingStreamer || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch video info: ${err}` },
      { status: 500 }
    );
  }
}
```

**Step 3: Update existing youtube unit tests for new VideoInfo fields**

In `lib/admin/__tests__/youtube.test.ts`, update the `parseVideoInfo` test to include `channelId`, `channelName`, `channelHandle`:

```typescript
describe('parseVideoInfo', () => {
  it('parses ytInitialData into VideoInfo', () => {
    const mockData = {
      videoDetails: {
        videoId: 'lVAiHsvF8z8',
        title: '【午後歌枠】不開心要唱歌',
        shortDescription: 'Song list:\n0:04:23 誰 / 李友廷',
        lengthSeconds: '7200',
        channelId: 'UCxxxxxx',
        author: '浠Mizuki',
      },
      microformat: {
        playerMicroformatRenderer: {
          uploadDate: '2025-03-26',
          publishDate: '2025-03-26',
          ownerProfileUrl: 'http://www.youtube.com/@Mizuki',
        },
      },
    };

    const info = parseVideoInfo(mockData);
    expect(info).toEqual({
      videoId: 'lVAiHsvF8z8',
      title: '【午後歌枠】不開心要唱歌',
      date: '2025-03-26',
      description: 'Song list:\n0:04:23 誰 / 李友廷',
      durationSeconds: 7200,
      channelId: 'UCxxxxxx',
      channelName: '浠Mizuki',
      channelHandle: '@Mizuki',
    });
  });
});
```

**Step 4: Run unit tests**

```bash
npm run test:unit
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add lib/admin/youtube.ts lib/admin/__tests__/youtube.test.ts app/api/admin/discover/route.ts
git commit -m "feat: extend discover API with channel info and new-streamer detection"
```

---

### Task 5: Add streamer profile API route

New API route for fetching and saving a streamer's profile from YouTube.

**Files:**
- Create: `app/api/admin/streamer/route.ts`

**Step 1: Create the API route**

```typescript
// app/api/admin/streamer/route.ts
// Fetch channel profile from YouTube and optionally save to streamer.json

import { NextRequest, NextResponse } from 'next/server';
import { fetchChannelProfile } from '@/lib/admin/youtube';
import { addStreamer, readStreamers, findStreamerByChannelId } from '@/lib/admin/data-writer';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// GET: Check if a streamer exists
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  const streamers = readStreamers(DATA_DIR);
  const streamer = findStreamerByChannelId(streamers, channelId);
  return NextResponse.json({ exists: !!streamer, streamer });
}

// POST: Fetch profile from YouTube and/or save streamer
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { channelId, action } = body;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    // Action: fetch — scrape YouTube channel page for profile
    if (action === 'fetch') {
      const profile = await fetchChannelProfile(channelId);
      return NextResponse.json(profile);
    }

    // Action: save — save curator-approved profile to streamer.json
    if (action === 'save') {
      const { handle, displayName, avatarUrl, description, socialLinks } = body;
      addStreamer(DATA_DIR, {
        channelId,
        handle: handle || '',
        displayName: displayName || '',
        avatarUrl: avatarUrl || '',
        description: description || '',
        socialLinks: socialLinks || {},
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action. Use "fetch" or "save".' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: `Streamer operation failed: ${err}` },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

```bash
npm run build
```

Expected: No errors.

**Step 3: Commit**

```bash
git add app/api/admin/streamer/route.ts
git commit -m "feat: add streamer profile API route"
```

---

### Task 6: Update import API and data-writer to include `channelId` on streams

**Files:**
- Modify: `lib/admin/data-writer.ts` (`ImportRequest` + `addStreamAndSongs`)
- Modify: `app/api/admin/import/route.ts`

**Step 1: Update `ImportRequest` to include `channelId`**

In `lib/admin/data-writer.ts`, update `ImportRequest`:

```typescript
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
```

In `addStreamAndSongs`, add `channelId` to the new stream object:

```typescript
  const newStream: Stream = {
    id: streamId,
    channelId: request.channelId || '',
    title: request.title,
    date: request.date,
    videoId: request.videoId,
    youtubeUrl: request.youtubeUrl,
  };
```

Also update the local `Stream` interface in `data-writer.ts` to include `channelId`:

```typescript
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
```

**Step 2: Update import API to accept `channelId`**

In `app/api/admin/import/route.ts`, add `channelId` to the destructured body:

```typescript
    const { videoId, title, date, youtubeUrl, channelId, songs, credit } = body;
```

And pass it through:

```typescript
    const result = addStreamAndSongs(DATA_DIR, {
      videoId,
      title,
      date,
      youtubeUrl,
      channelId,
      songs: songs.map((s: any) => ({
        songName: s.songName,
        artist: s.artist,
        startSeconds: s.startSeconds,
        endSeconds: s.endSeconds ?? null,
        note: s.note || '',
      })),
      credit,
    });
```

**Step 3: Run unit tests**

```bash
npm run test:unit
```

Expected: ALL PASS (channelId is optional, existing tests don't provide it).

**Step 4: Commit**

```bash
git add lib/admin/data-writer.ts app/api/admin/import/route.ts
git commit -m "feat: add channelId to import flow and stream creation"
```

---

### Task 7: Migrate existing data

One-time migration: add `channelId` to the two existing streams in `streams.json` and populate `streamer.json` with the two streamer profiles.

**Files:**
- Modify: `data/streams.json`
- Modify: `data/streamer.json`

**Step 1: Fetch channel IDs for existing streams**

Run a one-time script to get channelIds:

```bash
curl -s "https://www.youtube.com/watch?v=lVAiHsvF8z8" | grep -oP '"channelId":"[^"]+' | head -1
curl -s "https://www.youtube.com/watch?v=gOdBkLapyLo" | grep -oP '"channelId":"[^"]+' | head -1
```

Use the returned channel IDs to update the data files.

**Step 2: Update `data/streams.json`**

Add `channelId` to each stream entry (actual channel IDs from Step 1).

**Step 3: Populate `data/streamer.json`**

Fetch each channel's profile via the new `/api/admin/streamer` endpoint (dev server must be running), or scrape manually. Write the resulting array to `data/streamer.json`.

**Step 4: Verify the data**

```bash
cat data/streams.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(s['id'], s.get('channelId','MISSING')) for s in d]"
cat data/streamer.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(s['channelId'], s['displayName']) for s in d]"
```

Expected: All streams have channelId. Two streamers present.

**Step 5: Commit**

```bash
git add data/streams.json data/streamer.json
git commit -m "feat: migrate existing data with channelId and streamer profiles"
```

---

### Task 8: Update discover page — new streamer confirmation step

**Files:**
- Modify: `app/admin/discover/page.tsx`

**Step 1: Add streamer state and confirmation UI**

Add new state variables:

```typescript
const [isNewStreamer, setIsNewStreamer] = useState(false);
const [streamerProfile, setStreamerProfile] = useState<any>(null);
const [showStreamerConfirm, setShowStreamerConfirm] = useState(false);
const [channelId, setChannelId] = useState<string>('');
```

**Step 2: Update `handleFetchVideo` to check for new streamer**

After fetching video info, check `isNewStreamer` from the response:

```typescript
async function handleFetchVideo() {
  setError(null);
  try {
    const res = await fetch('/api/admin/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setVideoInfo(data);
    setChannelId(data.channelId || '');

    if (data.isNewStreamer && data.channelId) {
      // Fetch channel profile for confirmation
      const profileRes = await fetch('/api/admin/streamer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: data.channelId, action: 'fetch' }),
      });
      const profile = await profileRes.json();
      setStreamerProfile(profile);
      setShowStreamerConfirm(true);
    } else {
      setStep('extracting');
      handleExtract(data.videoId);
    }
  } catch (err) {
    setError(String(err));
  }
}
```

**Step 3: Add confirmation handler**

```typescript
async function handleConfirmStreamer() {
  try {
    await fetch('/api/admin/streamer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...streamerProfile, action: 'save' }),
    });
    setShowStreamerConfirm(false);
    setStep('extracting');
    handleExtract(videoInfo!.videoId);
  } catch (err) {
    setError(String(err));
  }
}
```

**Step 4: Add confirmation UI**

Between the input step and the extraction step, when `showStreamerConfirm` is true, render:

```tsx
{showStreamerConfirm && streamerProfile && (
  <div data-testid="new-streamer-confirm" className="...">
    <h3>偵測到新的直播主</h3>
    <div className="flex items-center gap-4">
      <img
        data-testid="streamer-avatar-preview"
        src={streamerProfile.avatarUrl}
        alt={streamerProfile.displayName}
        className="w-16 h-16 rounded-full"
      />
      <div>
        <input
          data-testid="streamer-name-input"
          value={streamerProfile.displayName}
          onChange={(e) => setStreamerProfile({ ...streamerProfile, displayName: e.target.value })}
        />
        <p>{streamerProfile.handle}</p>
      </div>
    </div>
    <div className="flex gap-2 mt-4">
      <button data-testid="confirm-streamer-button" onClick={handleConfirmStreamer}>
        確認新增
      </button>
      <button data-testid="skip-streamer-button" onClick={() => {
        setShowStreamerConfirm(false);
        setStep('extracting');
        handleExtract(videoInfo!.videoId);
      }}>
        跳過
      </button>
    </div>
  </div>
)}
```

**Step 5: Update `handleImport` to pass `channelId`**

In the import body, add `channelId`:

```typescript
body: JSON.stringify({
  videoId: videoInfo.videoId,
  title: videoInfo.title,
  date: videoInfo.date,
  youtubeUrl: `https://www.youtube.com/watch?v=${videoInfo.videoId}`,
  channelId,
  songs: songs.map((s) => ({
    songName: s.songName,
    artist: s.artist,
    startSeconds: s.startSeconds,
    endSeconds: s.endSeconds,
  })),
  credit: commentAuthor ? { author: commentAuthor, authorUrl: '' } : undefined,
}),
```

**Step 6: Verify build**

```bash
npm run build
```

Expected: No errors.

**Step 7: Commit**

```bash
git add app/admin/discover/page.tsx
git commit -m "feat: add new-streamer confirmation step in discover page"
```

---

### Task 9: Update fan-facing page for multi-streamer

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update streamer data import**

Change:

```typescript
import streamerData from '@/data/streamer.json';
```

To:

```typescript
import streamersData from '@/data/streamer.json';
import streamsData from '@/data/streams.json';
```

**Step 2: Add streamer switcher state**

```typescript
const [selectedStreamers, setSelectedStreamers] = useState<string[]>([]);
// empty array = "All"
```

**Step 3: Build streamer lookup and filter logic**

```typescript
// Build channelId → streamer map
const streamerMap = useMemo(() => {
  const map = new Map<string, typeof streamersData[0]>();
  for (const s of streamersData) map.set(s.channelId, s);
  return map;
}, []);

// Build streamId → channelId map from streams data
const streamChannelMap = useMemo(() => {
  const map = new Map<string, string>();
  for (const s of streamsData) {
    if (s.channelId) map.set(s.id, s.channelId);
  }
  return map;
}, []);

// Filter performances by selected streamers
const filteredSongs = useMemo(() => {
  if (selectedStreamers.length === 0) return songs; // all
  return songs.map((song) => ({
    ...song,
    performances: song.performances.filter((p) => {
      const chId = streamChannelMap.get(p.streamId);
      return chId && selectedStreamers.includes(chId);
    }),
  })).filter((song) => song.performances.length > 0);
}, [songs, selectedStreamers, streamChannelMap]);
```

**Step 4: Add streamer switcher UI in the filter bar**

Add before or after the existing search input:

```tsx
<div data-testid="streamer-switcher" className="flex items-center gap-1">
  <button
    data-testid="streamer-filter-all"
    onClick={() => setSelectedStreamers([])}
    className={selectedStreamers.length === 0 ? 'active' : ''}
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
      className={selectedStreamers.includes(s.channelId) ? 'active' : ''}
    >
      <img src={s.avatarUrl} alt={s.displayName} className="w-5 h-5 rounded-full" />
      {s.displayName}
    </button>
  ))}
</div>
```

**Step 5: Update profile header for multi-streamer**

```tsx
{/* Profile header */}
{selectedStreamers.length === 1 ? (
  // Single streamer: full profile
  (() => {
    const streamer = streamerMap.get(selectedStreamers[0]);
    if (!streamer) return null;
    return (
      <>
        {/* Existing full profile header using streamer.avatarUrl, streamer.displayName, etc. */}
      </>
    );
  })()
) : (
  // All or multiple: compact multi-avatar row
  <div data-testid="multi-streamer-header" className="flex items-center gap-3">
    {(selectedStreamers.length === 0 ? streamersData : streamersData.filter((s) => selectedStreamers.includes(s.channelId)))
      .map((s) => (
        <div key={s.channelId} className="flex items-center gap-2">
          <img src={s.avatarUrl} alt={s.displayName} className="w-10 h-10 rounded-full" />
          <span>{s.displayName}</span>
        </div>
      ))}
  </div>
)}
```

**Step 6: Replace all `streamerData.xxx` references**

Replace every `streamerData.name`, `streamerData.avatarUrl`, `streamerData.description`, `streamerData.socialLinks.xxx` with the appropriate lookup from the selected streamer or multi-streamer header. There are ~15 references to find and update.

**Step 7: Verify build**

```bash
npm run build
```

Expected: No errors.

**Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add multi-streamer switcher and profile header to fan-facing page"
```

---

### Task 10: E2E tests

**Files:**
- Create: `tests/multi-streamer.spec.ts`

**Step 1: Write E2E test for new-streamer import flow**

```typescript
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const PROJECT_ROOT = process.cwd();

function restoreDataFiles() {
  execSync('git checkout -- data/songs.json data/streams.json data/streamer.json data/metadata/', {
    cwd: PROJECT_ROOT,
  });
}

test.afterEach(() => restoreDataFiles());

test('Import from new streamer shows confirmation step', async ({ page }) => {
  // 1. Login
  await page.goto('/admin/login');
  await page.getByTestId('username-input').fill('curator');
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin');

  // 2. Navigate to discover
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover');

  // 3. Enter a YouTube URL from a streamer NOT in streamer.json
  // (Use a video from a channel not already in our test data)
  await page.getByTestId('discover-url-input').fill('https://www.youtube.com/watch?v=TEST_VIDEO_ID');
  await page.getByTestId('discover-fetch-button').click();

  // 4. New streamer confirmation should appear
  await expect(page.getByTestId('new-streamer-confirm')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('streamer-avatar-preview')).toBeVisible();
  await expect(page.getByTestId('streamer-name-input')).toBeVisible();

  // 5. Confirm the streamer
  await page.getByTestId('confirm-streamer-button').click();

  // 6. Should proceed to extraction
  await expect(page.getByTestId('new-streamer-confirm')).not.toBeVisible();
});

test('Import from existing streamer skips confirmation', async ({ page }) => {
  // 1. Login
  await page.goto('/admin/login');
  await page.getByTestId('username-input').fill('curator');
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin');

  // 2. Navigate to discover
  await page.getByTestId('discover-nav-button').click();
  await page.waitForURL('**/admin/discover');

  // 3. Enter a YouTube URL from a streamer already in streamer.json
  // (Use a video from an already-migrated channel)
  await page.getByTestId('discover-url-input').fill('https://www.youtube.com/watch?v=gOdBkLapyLo');
  await page.getByTestId('discover-fetch-button').click();

  // 4. Should skip straight to extraction (no confirmation)
  await expect(page.getByTestId('new-streamer-confirm')).not.toBeVisible();
  await expect(page.getByTestId('extracted-song-0')).toBeVisible({ timeout: 30000 });
});
```

**Step 2: Write E2E test for fan-facing streamer switcher**

```typescript
test('Fan-facing streamer switcher filters songs', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid="performance-row"]', { timeout: 10000 });

  // Switcher should be visible with "All" active
  await expect(page.getByTestId('streamer-switcher')).toBeVisible();
  await expect(page.getByTestId('streamer-filter-all')).toBeVisible();

  // Click a specific streamer filter
  const firstStreamerButton = page.getByTestId('streamer-switcher').locator('button').nth(1);
  await firstStreamerButton.click();

  // Song list should update (still has rows)
  await page.waitForTimeout(500);
  const rows = page.getByTestId('performance-row');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  // Click "All" to reset
  await page.getByTestId('streamer-filter-all').click();
  await page.waitForTimeout(500);
  const allCount = await page.getByTestId('performance-row').count();
  expect(allCount).toBeGreaterThanOrEqual(count);
});
```

**Step 3: Run E2E tests**

```bash
npx playwright test tests/multi-streamer.spec.ts
```

Expected: ALL PASS.

**Step 4: Export videos and verify**

```bash
cp test-results/*/video.webm videos/verify-multi-streamer-import.webm
cp test-results/*/video.webm videos/verify-multi-streamer-filter.webm
```

Use `/verify-video` on each recording.
Use `/compare-before-after-with-video` to compare fan-facing page before and after the change.

**Step 5: Commit**

```bash
git add tests/multi-streamer.spec.ts
git commit -m "test: add E2E tests for multi-streamer import and filtering"
```

---

Plan complete and saved to `docs/plans/2026-03-01-multi-streamer-support.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open a new session with executing-plans, batch execution with checkpoints

Which approach?