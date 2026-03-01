# Integrated Admin Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the MizukiLens curator pipeline into the Next.js web app as an admin panel, replacing the CLI/TUI workflow with a browser-based interface that reads/writes data files directly.

**Architecture:** The existing Next.js app gains new admin pages and API routes that handle YouTube video parsing, song extraction, metadata fetching, and git deployment. Admin features only work in dev mode (`npm run dev`); the production static export for GitHub Pages is unaffected. No staging database — discovered data lives in React state, approved data writes directly to `data/` JSON files.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest (unit tests), Playwright (E2E), YouTube innertube API (no API key), iTunes Search API, LRCLIB API

**Key architectural constraints:**
- All `lib/admin/*.ts` service files that use Node.js APIs (`fs`, `child_process`) MUST have `'use server'` at the top to prevent Next.js from bundling them into client code.
- All `app/api/admin/*/route.ts` files MUST guard with `if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'Not found' }, { status: 404 })` so routes are inert even if accidentally deployed.
- YouTube HTML parsing is inherently brittle. When it fails, return specific error messages (e.g., "YouTube data structure changed. Please use the manual paste text method.") so the curator knows to use the paste fallback.

---

### Task 1: Set up Vitest and admin service directory

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/admin/.gitkeep` (placeholder)
- Modify: `package.json` (add vitest)
- Modify: `.gitignore` (add staging artifacts)

**Step 1: Install Vitest**

```bash
npm install --save-dev vitest
```

**Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/admin/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
```

Save to `/home/family/large_disk/MizukiPrism/vitest.config.ts`

**Step 3: Add test script to package.json**

Add to `"scripts"`:
```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

**Step 4: Create lib/admin/ directory**

```bash
mkdir -p lib/admin/__tests__
```

**Step 5: Update .gitignore**

Append:
```
# Admin staging
data/.staging.json
```

**Step 6: Verify setup with a smoke test**

Create `lib/admin/__tests__/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('admin test setup', () => {
  it('vitest is working', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 7: Run test to verify it passes**

```bash
npm run test:unit
```

Expected: 1 test passed.

**Step 8: Commit**

```bash
git add vitest.config.ts lib/admin/ package.json package-lock.json .gitignore
git commit -m "chore: add vitest and admin service directory"
```

---

### Task 2: Timestamp extraction service

Port the Python extraction logic (`tools/mizukilens/src/mizukilens/extraction.py`) to TypeScript. This is the core algorithm that parses song timestamps from comment/description text.

**Files:**
- Create: `lib/admin/extraction.ts`
- Create: `lib/admin/__tests__/extraction.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseTimestamp,
  parseSongLine,
  parseTextToSongs,
  findCandidateComment,
  secondsToTimestamp,
  countTimestamps,
} from '../extraction';

describe('parseTimestamp', () => {
  it('parses MM:SS', () => {
    expect(parseTimestamp('4:23')).toBe(263);
  });

  it('parses HH:MM:SS', () => {
    expect(parseTimestamp('1:23:45')).toBe(5025);
  });

  it('parses 0:00', () => {
    expect(parseTimestamp('0:00')).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(parseTimestamp('abc')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });
});

describe('secondsToTimestamp', () => {
  it('formats seconds as MM:SS', () => {
    expect(secondsToTimestamp(263)).toBe('4:23');
  });

  it('formats seconds as H:MM:SS when >= 1 hour', () => {
    expect(secondsToTimestamp(5025)).toBe('1:23:45');
  });

  it('formats 0 seconds', () => {
    expect(secondsToTimestamp(0)).toBe('0:00');
  });
});

describe('parseSongLine', () => {
  it('parses "timestamp songname / artist"', () => {
    const result = parseSongLine('4:23 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('parses "timestamp - songname - artist"', () => {
    const result = parseSongLine('0:30 - Shape of You - Ed Sheeran');
    expect(result).toEqual({
      startSeconds: 30,
      songName: 'Shape of You',
      artist: 'Ed Sheeran',
    });
  });

  it('strips numbering prefixes', () => {
    const result = parseSongLine('01. 4:23 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('strips box-drawing characters', () => {
    const result = parseSongLine('├── 4:23 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('parses range end timestamp', () => {
    const result = parseSongLine('4:23 ~ 8:26 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      endSeconds: 506,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('returns null for empty or non-timestamp lines', () => {
    expect(parseSongLine('')).toBeNull();
    expect(parseSongLine('Just some text')).toBeNull();
    expect(parseSongLine('   ')).toBeNull();
  });
});

describe('parseTextToSongs', () => {
  it('parses multi-line comment into song list', () => {
    const text = `4:23 誰 / 李友廷
8:26 Shape of You / Ed Sheeran
12:00 夜曲 / 周杰倫`;

    const songs = parseTextToSongs(text);
    expect(songs).toHaveLength(3);
    expect(songs[0]).toMatchObject({
      orderIndex: 0,
      songName: '誰',
      artist: '李友廷',
      startSeconds: 263,
      endSeconds: 506,  // inferred from next song
      suspicious: false,
    });
    expect(songs[2].endSeconds).toBeNull();  // last song
  });

  it('skips non-timestamp lines', () => {
    const text = `歌單 Songlist
4:23 誰 / 李友廷
This is a comment
8:26 Shape of You / Ed Sheeran`;

    const songs = parseTextToSongs(text);
    expect(songs).toHaveLength(2);
  });

  it('flags suspicious timestamps (>12 hours)', () => {
    const text = `13:00:00 Some Song / Artist`;
    const songs = parseTextToSongs(text);
    expect(songs[0].suspicious).toBe(true);
  });

  it('returns empty array for no timestamps', () => {
    expect(parseTextToSongs('no timestamps here')).toEqual([]);
  });
});

describe('countTimestamps', () => {
  it('counts timestamp patterns in text', () => {
    expect(countTimestamps('4:23 song\n8:26 song2\n12:00 song3')).toBe(3);
  });

  it('returns 0 for no timestamps', () => {
    expect(countTimestamps('no timestamps here')).toBe(0);
  });
});

describe('findCandidateComment', () => {
  it('selects pinned comment over high-vote comment', () => {
    const comments = [
      { text: '1:00 a\n2:00 b\n3:00 c', votes: '100', isPinned: false },
      { text: '1:00 a\n2:00 b\n3:00 c', votes: '10', isPinned: true },
    ];
    const best = findCandidateComment(comments);
    expect(best?.isPinned).toBe(true);
  });

  it('selects highest votes when no pinned comment', () => {
    const comments = [
      { text: '1:00 a\n2:00 b\n3:00 c', votes: '50' },
      { text: '1:00 a\n2:00 b\n3:00 c', votes: '1.2K' },
    ];
    const best = findCandidateComment(comments);
    expect(best?.votes).toBe('1.2K');
  });

  it('returns null when no comment has >= 3 timestamps', () => {
    const comments = [
      { text: '1:00 a\n2:00 b', votes: '10' },
    ];
    expect(findCandidateComment(comments)).toBeNull();
  });
});
```

Save to `lib/admin/__tests__/extraction.test.ts`

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- extraction
```

Expected: ALL FAIL (module not found).

**Step 3: Write the extraction service**

```typescript
// lib/admin/extraction.ts
'use server';
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
  // Try " / " variants
  let m = songInfo.match(/\s*\/\s+|\s+\/\s*/);
  if (m && m.index !== undefined) {
    const name = songInfo.slice(0, m.index).trim();
    const artist = songInfo.slice(m.index + m[0].length).trim();
    return [name, artist];
  }

  // Try " - " (em-dash and en-dash too)
  m = songInfo.match(/\s+-\s+/);
  if (m && m.index !== undefined) {
    const name = songInfo.slice(0, m.index).trim();
    const artist = songInfo.slice(m.index + m[0].length).trim();
    return [name, artist];
  }

  // Try bare "/"
  const slashIdx = songInfo.indexOf('/');
  if (slashIdx !== -1) {
    const name = songInfo.slice(0, slashIdx).trim();
    const artist = songInfo.slice(slashIdx + 1).trim();
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

  // Strip common numbering prefixes: "01. ", "1) ", "#3 "
  line = line.replace(/^(?:\d+\.\s*|\d+\)\s+|#\d+\s+)/, '');

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
  for (const line of text.split('\n')) {
    const parsed = parseSongLine(line);
    if (parsed) rawSongs.push(parsed);
  }

  if (rawSongs.length === 0) return [];

  const result: ParsedSong[] = [];
  for (let i = 0; i < rawSongs.length; i++) {
    const song = rawSongs[i];
    const startSec = song.startSeconds;

    let endSec: number | null;
    if (song.endSeconds !== undefined) {
      endSec = song.endSeconds;
    } else if (i + 1 < rawSongs.length) {
      endSec = rawSongs[i + 1].startSeconds;
    } else {
      endSec = null;
    }

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
```

Save to `lib/admin/extraction.ts`

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- extraction
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add lib/admin/extraction.ts lib/admin/__tests__/extraction.test.ts
git commit -m "feat: add timestamp extraction service (ported from Python)"
```

---

### Task 3: YouTube client service

Fetch video info (title, date, description) and comments from YouTube without an API key. Uses YouTube's public innertube API and page scraping.

**Files:**
- Create: `lib/admin/youtube.ts`
- Create: `lib/admin/__tests__/youtube.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractVideoId,
  parseYtInitialData,
  parseVideoInfo,
  parseComments,
  VideoInfo,
} from '../youtube';

describe('extractVideoId', () => {
  it('extracts from standard URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('extracts from short URL', () => {
    expect(extractVideoId('https://youtu.be/lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('extracts from embed URL', () => {
    expect(extractVideoId('https://www.youtube.com/embed/lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('extracts bare video ID', () => {
    expect(extractVideoId('lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('returns null for invalid input', () => {
    expect(extractVideoId('not-a-url')).toBeNull();
    expect(extractVideoId('')).toBeNull();
  });
});

describe('parseVideoInfo', () => {
  it('parses ytInitialData into VideoInfo', () => {
    // Minimal mock of YouTube's embedded data structure
    const mockData = {
      videoDetails: {
        videoId: 'lVAiHsvF8z8',
        title: '【午後歌枠】不開心要唱歌',
        shortDescription: 'Song list:\n0:04:23 誰 / 李友廷\n0:08:26 Shape of You / Ed Sheeran',
        lengthSeconds: '7200',
      },
      microformat: {
        playerMicroformatRenderer: {
          uploadDate: '2025-03-26',
          publishDate: '2025-03-26',
        },
      },
    };

    const info = parseVideoInfo(mockData);
    expect(info).toEqual({
      videoId: 'lVAiHsvF8z8',
      title: '【午後歌枠】不開心要唱歌',
      date: '2025-03-26',
      description: 'Song list:\n0:04:23 誰 / 李友廷\n0:08:26 Shape of You / Ed Sheeran',
      durationSeconds: 7200,
    });
  });
});

describe('parseComments', () => {
  it('parses innertube comment response into Comment objects', () => {
    // Minimal mock of YouTube's comment continuation response
    const mockResponse = {
      onResponseReceivedEndpoints: [
        {
          reloadContinuationItemsCommand: {
            continuationItems: [
              {
                commentThreadRenderer: {
                  comment: {
                    commentRenderer: {
                      commentId: 'abc123',
                      authorText: { simpleText: '@hydai' },
                      authorEndpoint: {
                        browseEndpoint: { browseId: 'UCL96VcILiOIp4PAYIPzotoQ' },
                      },
                      contentText: {
                        runs: [
                          { text: '0:04:23 誰 / 李友廷\n0:08:26 Shape of You / Ed Sheeran\n0:12:00 夜曲 / 周杰倫' },
                        ],
                      },
                      voteCount: { simpleText: '345' },
                      pinnedCommentBadge: {},
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    };

    const comments = parseComments(mockResponse);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      cid: 'abc123',
      author: '@hydai',
      text: expect.stringContaining('0:04:23 誰 / 李友廷'),
      votes: '345',
      isPinned: true,
    });
  });
});
```

Save to `lib/admin/__tests__/youtube.test.ts`

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- youtube
```

Expected: ALL FAIL.

**Step 3: Write the YouTube client**

```typescript
// lib/admin/youtube.ts
'use server';
// YouTube video info and comment fetching via innertube API (no API key needed)

export interface VideoInfo {
  videoId: string;
  title: string;
  date: string;        // YYYY-MM-DD
  description: string;
  durationSeconds: number;
}

export interface Comment {
  cid: string;
  author: string;
  authorUrl?: string;
  text: string;
  votes: string;
  isPinned: boolean;
}

// ---------------------------------------------------------------------------
// Video ID extraction
// ---------------------------------------------------------------------------

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Bare video ID
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);

    // youtube.com/watch?v=ID
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && VIDEO_ID_RE.test(v)) return v;

      // youtube.com/embed/ID
      const embedMatch = url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    }

    // youtu.be/ID
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      if (VIDEO_ID_RE.test(id)) return id;
    }
  } catch {
    // Not a URL
  }

  return null;
}

// ---------------------------------------------------------------------------
// YouTube page fetching
// ---------------------------------------------------------------------------

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20240101.00.00',
  hl: 'zh-TW',
  gl: 'TW',
};

/**
 * Fetch a YouTube video page and extract the embedded ytInitialData JSON.
 * Runs server-side only (uses Node.js fetch, no CORS restrictions).
 */
export async function fetchVideoPage(videoId: string): Promise<Record<string, unknown>> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });
  const html = await res.text();
  return parseYtInitialData(html);
}

/**
 * Extract ytInitialData JSON from YouTube HTML page.
 */
export function parseYtInitialData(html: string): Record<string, unknown> {
  const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s)
    || html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!match) throw new Error('YouTube data structure changed. Please use the manual paste text method.');
  return JSON.parse(match[1]);
}

/**
 * Parse ytInitialPlayerResponse into VideoInfo.
 */
export function parseVideoInfo(data: Record<string, unknown>): VideoInfo {
  const details = (data as any).videoDetails || {};
  const microformat = (data as any).microformat?.playerMicroformatRenderer || {};

  const rawDate = microformat.uploadDate || microformat.publishDate || '';
  const date = rawDate.slice(0, 10); // YYYY-MM-DD

  return {
    videoId: details.videoId || '',
    title: details.title || '',
    date,
    description: details.shortDescription || '',
    durationSeconds: parseInt(details.lengthSeconds || '0', 10),
  };
}

// ---------------------------------------------------------------------------
// Comment fetching via innertube API
// ---------------------------------------------------------------------------

/**
 * Fetch comments for a video using YouTube's innertube next endpoint.
 * Returns up to ~20 top comments (first page, sorted by popularity).
 */
export async function fetchComments(videoId: string): Promise<Comment[]> {
  // Step 1: Get the comment section continuation token from the video page
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });
  const html = await pageRes.text();

  // Find ytInitialData (not player response — the page data)
  const dataMatch = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script/s)
    || html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script/s);
  if (!dataMatch) return [];

  const pageData = JSON.parse(dataMatch[1]);

  // Navigate to comment section continuation token
  const token = findCommentContinuationToken(pageData);
  if (!token) return [];

  // Step 2: Fetch comments via innertube next endpoint
  const nextRes = await fetch(
    `https://www.youtube.com/youtubei/v1/next?key=${INNERTUBE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: INNERTUBE_CLIENT },
        continuation: token,
      }),
    }
  );
  const nextData = await nextRes.json();
  return parseComments(nextData);
}

/**
 * Navigate ytInitialData to find the comment section continuation token.
 */
function findCommentContinuationToken(data: any): string | null {
  try {
    const tabs = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
    for (const item of tabs) {
      const section = item?.itemSectionRenderer;
      if (!section) continue;
      const continuations = section.contents?.[0]?.continuationItemRenderer?.continuationEndpoint
        ?.continuationCommand?.token;
      if (continuations) return continuations;
    }
  } catch {
    // Structure mismatch
  }
  return null;
}

/**
 * Parse innertube comment continuation response into Comment objects.
 */
export function parseComments(data: any): Comment[] {
  const comments: Comment[] = [];

  const endpoints = data?.onResponseReceivedEndpoints || [];
  for (const endpoint of endpoints) {
    const items =
      endpoint?.reloadContinuationItemsCommand?.continuationItems ||
      endpoint?.appendContinuationItemsAction?.continuationItems ||
      [];

    for (const item of items) {
      const thread = item?.commentThreadRenderer;
      if (!thread) continue;

      const renderer = thread?.comment?.commentRenderer;
      if (!renderer) continue;

      const text = (renderer.contentText?.runs || [])
        .map((r: any) => r.text || '')
        .join('');

      comments.push({
        cid: renderer.commentId || '',
        author: renderer.authorText?.simpleText || '',
        authorUrl: renderer.authorEndpoint?.browseEndpoint?.browseId || undefined,
        text,
        votes: renderer.voteCount?.simpleText || '0',
        isPinned: !!renderer.pinnedCommentBadge,
      });
    }
  }

  return comments;
}

// ---------------------------------------------------------------------------
// Channel video listing (RSS feed — last 15 videos)
// ---------------------------------------------------------------------------

export interface ChannelVideo {
  videoId: string;
  title: string;
  publishedAt: string; // ISO date
}

/**
 * Fetch recent videos from a YouTube channel via RSS feed.
 * Returns up to 15 most recent videos (YouTube RSS limit).
 */
export async function fetchChannelVideos(channelId: string): Promise<ChannelVideo[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(feedUrl);
  const xml = await res.text();
  return parseChannelFeed(xml);
}

/**
 * Parse YouTube RSS XML feed into ChannelVideo objects.
 */
export function parseChannelFeed(xml: string): ChannelVideo[] {
  const videos: ChannelVideo[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRe.exec(xml)) !== null) {
    const entry = match[1];
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || '';
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1] || '';
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || '';

    if (videoId) {
      videos.push({
        videoId,
        title: decodeXmlEntities(title),
        publishedAt: published.slice(0, 10), // YYYY-MM-DD
      });
    }
  }

  return videos;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
```

Save to `lib/admin/youtube.ts`

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- youtube
```

Expected: ALL PASS (parsing tests use mock data, no real network calls).

**Step 5: Commit**

```bash
git add lib/admin/youtube.ts lib/admin/__tests__/youtube.test.ts
git commit -m "feat: add YouTube client service for video info and comments"
```

---

### Task 4: Metadata service (iTunes + LRCLIB)

Port metadata fetching from `tools/mizukilens/src/mizukilens/metadata.py` to TypeScript. Searches iTunes for album art and LRCLIB for synced lyrics.

**Files:**
- Create: `lib/admin/metadata.ts`
- Create: `lib/admin/__tests__/metadata.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeArtist,
  stripFeaturing,
  cleanTitle,
  buildSearchStrategies,
  parseItunesResult,
  parseLrclibResult,
  MetadataResult,
} from '../metadata';

describe('normalizeArtist', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeArtist('YOASOBI')).toBe('yoasobi');
    expect(normalizeArtist('Ed  Sheeran')).toBe('ed sheeran');
  });
});

describe('stripFeaturing', () => {
  it('removes feat. suffix', () => {
    expect(stripFeaturing('Artist feat. Other')).toBe('Artist');
    expect(stripFeaturing('Artist ft. Other')).toBe('Artist');
  });

  it('returns unchanged if no featuring', () => {
    expect(stripFeaturing('Plain Artist')).toBe('Plain Artist');
  });
});

describe('cleanTitle', () => {
  it('removes CJK punctuation variants', () => {
    expect(cleanTitle('花（feat.明日）')).toBe('花');
  });
});

describe('buildSearchStrategies', () => {
  it('builds ordered search strategies', () => {
    const strategies = buildSearchStrategies('李友廷', '誰');
    expect(strategies[0]).toEqual({
      term: '李友廷 誰',
      confidence: 'exact',
    });
  });

  it('includes cleaned artist strategy when featuring present', () => {
    const strategies = buildSearchStrategies('Artist feat. Other', 'Song');
    expect(strategies.some(s => s.confidence === 'exact_cleaned')).toBe(true);
  });
});

describe('parseItunesResult', () => {
  it('parses iTunes API result into metadata', () => {
    const itunesResult = {
      trackId: 123,
      collectionId: 456,
      collectionName: 'Album Name',
      artworkUrl100: 'https://example.com/100x100bb.jpg',
      trackTimeMillis: 240000,
      artistName: 'YOASOBI',
      artistId: 789,
    };

    const meta = parseItunesResult(itunesResult);
    expect(meta.albumArtUrl).toBe('https://example.com/400x400bb.jpg');
    expect(meta.albumArtUrls).toEqual({
      small: 'https://example.com/60x60bb.jpg',
      medium: 'https://example.com/200x200bb.jpg',
      big: 'https://example.com/400x400bb.jpg',
      xl: 'https://example.com/600x600bb.jpg',
    });
    expect(meta.trackDuration).toBe(240);
    expect(meta.itunesTrackId).toBe(123);
  });
});

describe('parseLrclibResult', () => {
  it('prefers synced lyrics over plain', () => {
    const result = {
      syncedLyrics: '[00:05.00] Hello\n[00:10.00] World',
      plainLyrics: 'Hello\nWorld',
    };
    const lyrics = parseLrclibResult(result);
    expect(lyrics.syncedLyrics).toBe('[00:05.00] Hello\n[00:10.00] World');
    expect(lyrics.plainLyrics).toBe('Hello\nWorld');
  });

  it('returns plain lyrics when no synced available', () => {
    const result = { plainLyrics: 'Hello\nWorld' };
    const lyrics = parseLrclibResult(result);
    expect(lyrics.syncedLyrics).toBeUndefined();
    expect(lyrics.plainLyrics).toBe('Hello\nWorld');
  });
});
```

Save to `lib/admin/__tests__/metadata.test.ts`

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- metadata
```

Expected: ALL FAIL.

**Step 3: Write the metadata service**

```typescript
// lib/admin/metadata.ts
'use server';
// Port of tools/mizukilens/src/mizukilens/metadata.py

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchStrategy {
  term: string;
  confidence: 'exact' | 'exact_cleaned' | 'fuzzy' | 'fuzzy_cleaned';
}

export interface AlbumArtUrls {
  small: string;
  medium: string;
  big: string;
  xl: string;
}

export interface ItunesMetadata {
  albumArtUrl: string;
  albumArtUrls: AlbumArtUrls;
  albumTitle: string;
  itunesTrackId: number;
  itunesCollectionId: number;
  trackDuration: number; // seconds
  artistName: string;
  artistId: number;
}

export interface LyricsResult {
  syncedLyrics?: string;
  plainLyrics?: string;
}

export interface MetadataResult {
  songId: string;
  artStatus: 'matched' | 'no_match' | 'error';
  lyricsStatus: 'matched' | 'no_match' | 'error';
  artConfidence: string | null;
  artData?: ItunesMetadata;
  lyricsData?: LyricsResult;
  artError?: string;
  lyricsError?: string;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

let lastItunesCall = 0;
let lastLrclibCall = 0;
const ITUNES_DELAY_MS = 3000;
const LRCLIB_DELAY_MS = 200;

async function rateLimitItunes(): Promise<void> {
  const elapsed = Date.now() - lastItunesCall;
  if (elapsed < ITUNES_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, ITUNES_DELAY_MS - elapsed));
  }
  lastItunesCall = Date.now();
}

async function rateLimitLrclib(): Promise<void> {
  const elapsed = Date.now() - lastLrclibCall;
  if (elapsed < LRCLIB_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, LRCLIB_DELAY_MS - elapsed));
  }
  lastLrclibCall = Date.now();
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

export function normalizeArtist(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function stripFeaturing(artist: string): string {
  return artist.replace(/\s*(feat\.|ft\.)\s*.*/i, '').trim();
}

export function cleanTitle(title: string): string {
  // Remove content in CJK brackets and special punctuation
  return title
    .replace(/[（(].+?[）)]/g, '')
    .replace(/[【\[].+?[】\]]/g, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Search strategies
// ---------------------------------------------------------------------------

export function buildSearchStrategies(artist: string, title: string): SearchStrategy[] {
  const strategies: SearchStrategy[] = [];

  // Strategy 1: exact — "{artist} {title}"
  strategies.push({ term: `${artist} ${title}`, confidence: 'exact' });

  // Strategy 2: exact_cleaned — remove featuring
  const cleaned = stripFeaturing(artist);
  if (cleaned !== artist) {
    strategies.push({ term: `${cleaned} ${title}`, confidence: 'exact_cleaned' });
  }

  // Strategy 3: fuzzy — title only
  strategies.push({ term: title, confidence: 'fuzzy' });

  // Strategy 4: fuzzy_cleaned — cleaned title
  const cleanedTitle = cleanTitle(title);
  if (cleanedTitle !== title) {
    strategies.push({ term: cleanedTitle, confidence: 'fuzzy_cleaned' });
  }

  return strategies;
}

// ---------------------------------------------------------------------------
// iTunes API
// ---------------------------------------------------------------------------

function rewriteArtworkUrl(url100: string, size: string): string {
  return url100.replace(/100x100bb/, `${size}bb`);
}

export function parseItunesResult(result: any): ItunesMetadata {
  const url100 = result.artworkUrl100 || '';
  return {
    albumArtUrl: rewriteArtworkUrl(url100, '400x400'),
    albumArtUrls: {
      small: rewriteArtworkUrl(url100, '60x60'),
      medium: rewriteArtworkUrl(url100, '200x200'),
      big: rewriteArtworkUrl(url100, '400x400'),
      xl: rewriteArtworkUrl(url100, '600x600'),
    },
    albumTitle: result.collectionName || '',
    itunesTrackId: result.trackId,
    itunesCollectionId: result.collectionId,
    trackDuration: Math.round((result.trackTimeMillis || 0) / 1000),
    artistName: result.artistName || '',
    artistId: result.artistId || 0,
  };
}

/**
 * Search iTunes for a song and return metadata.
 * Tries multiple search strategies in order, returns first match.
 */
export async function fetchItunesMetadata(
  artist: string,
  title: string,
): Promise<{ data: ItunesMetadata; confidence: string } | null> {
  const strategies = buildSearchStrategies(artist, title);

  for (const strategy of strategies) {
    await rateLimitItunes();

    const params = new URLSearchParams({
      term: strategy.term,
      media: 'music',
      entity: 'song',
      country: 'JP',
      limit: '10',
    });

    try {
      const res = await fetch(`https://itunes.apple.com/search?${params}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        return {
          data: parseItunesResult(data.results[0]),
          confidence: strategy.confidence,
        };
      }
    } catch {
      // Continue to next strategy
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// LRCLIB API
// ---------------------------------------------------------------------------

export function parseLrclibResult(result: any): LyricsResult {
  const lyrics: LyricsResult = {};
  if (result.syncedLyrics) lyrics.syncedLyrics = result.syncedLyrics;
  if (result.plainLyrics) lyrics.plainLyrics = result.plainLyrics;
  return lyrics;
}

/**
 * Search LRCLIB for lyrics.
 */
export async function fetchLrclibLyrics(
  artist: string,
  title: string,
): Promise<LyricsResult | null> {
  await rateLimitLrclib();

  const params = new URLSearchParams({
    artist_name: artist,
    track_name: title,
  });

  try {
    const res = await fetch(`https://lrclib.net/api/search?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      // Prefer result with synced lyrics
      const withSynced = data.find((r: any) => r.syncedLyrics);
      return parseLrclibResult(withSynced || data[0]);
    }
  } catch {
    // Network error
  }

  return null;
}

// ---------------------------------------------------------------------------
// Combined metadata fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch both album art and lyrics for a song.
 */
export async function fetchSongMetadata(
  songId: string,
  artist: string,
  title: string,
): Promise<MetadataResult> {
  const result: MetadataResult = {
    songId,
    artStatus: 'no_match',
    lyricsStatus: 'no_match',
    artConfidence: null,
  };

  // Fetch album art from iTunes
  try {
    const art = await fetchItunesMetadata(artist, title);
    if (art) {
      result.artStatus = 'matched';
      result.artConfidence = art.confidence;
      result.artData = art.data;
    }
  } catch (err) {
    result.artStatus = 'error';
    result.artError = String(err);
  }

  // Fetch lyrics from LRCLIB
  try {
    const lyrics = await fetchLrclibLyrics(artist, title);
    if (lyrics) {
      result.lyricsStatus = 'matched';
      result.lyricsData = lyrics;
    }
  } catch (err) {
    result.lyricsStatus = 'error';
    result.lyricsError = String(err);
  }

  return result;
}
```

Save to `lib/admin/metadata.ts`

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- metadata
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add lib/admin/metadata.ts lib/admin/__tests__/metadata.test.ts
git commit -m "feat: add metadata service for iTunes album art and LRCLIB lyrics"
```

---

### Task 5: Data writer service

Service to merge new streams and songs into the `data/` JSON files. Extends the existing `lib/data.ts` with admin-specific merge logic.

**Files:**
- Create: `lib/admin/data-writer.ts`
- Create: `lib/admin/__tests__/data-writer.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  addStreamAndSongs,
  updateMetadataFiles,
  generateSongId,
  generatePerformanceId,
  findExistingSong,
} from '../data-writer';

// Helper: create a temp data directory with initial files
function createTempData() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuki-test-'));
  const metaDir = path.join(tmpDir, 'metadata');
  fs.mkdirSync(metaDir);

  fs.writeFileSync(
    path.join(tmpDir, 'songs.json'),
    JSON.stringify([
      {
        id: 'song-1',
        title: '誰',
        originalArtist: '李友廷',
        tags: [],
        performances: [
          {
            id: 'p1-1',
            streamId: 'stream-2025-03-26',
            date: '2025-03-26',
            streamTitle: '午後歌枠',
            videoId: 'lVAiHsvF8z8',
            timestamp: 263,
            endTimestamp: 506,
            note: '',
          },
        ],
      },
    ])
  );

  fs.writeFileSync(
    path.join(tmpDir, 'streams.json'),
    JSON.stringify([
      {
        id: 'stream-2025-03-26',
        title: '午後歌枠',
        date: '2025-03-26',
        videoId: 'lVAiHsvF8z8',
        youtubeUrl: 'https://www.youtube.com/watch?v=lVAiHsvF8z8',
      },
    ])
  );

  fs.writeFileSync(path.join(metaDir, 'song-metadata.json'), '[]');
  fs.writeFileSync(path.join(metaDir, 'song-lyrics.json'), '[]');
  fs.writeFileSync(path.join(metaDir, 'artist-info.json'), '[]');

  return tmpDir;
}

describe('findExistingSong', () => {
  it('finds song by title + artist match', () => {
    const songs = [
      { id: 'song-1', title: '誰', originalArtist: '李友廷', tags: [], performances: [] },
    ];
    expect(findExistingSong(songs, '誰', '李友廷')).toBe('song-1');
  });

  it('returns null for no match', () => {
    const songs = [
      { id: 'song-1', title: '誰', originalArtist: '李友廷', tags: [], performances: [] },
    ];
    expect(findExistingSong(songs, 'Unknown', 'Artist')).toBeNull();
  });
});

describe('generateSongId', () => {
  it('generates next sequential ID', () => {
    const songs = [
      { id: 'song-1' }, { id: 'song-3' }, { id: 'song-2' },
    ] as any[];
    expect(generateSongId(songs)).toBe('song-4');
  });

  it('starts at song-1 for empty list', () => {
    expect(generateSongId([])).toBe('song-1');
  });
});

describe('addStreamAndSongs', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempData(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('adds new stream and new songs', () => {
    const result = addStreamAndSongs(tmpDir, {
      videoId: 'newVideo123',
      title: '新歌枠',
      date: '2026-02-28',
      youtubeUrl: 'https://www.youtube.com/watch?v=newVideo123',
      songs: [
        { songName: 'New Song', artist: 'New Artist', startSeconds: 100, endSeconds: 300 },
      ],
      credit: { author: '@curator', authorUrl: 'UC123' },
    });

    expect(result.newSongs).toBe(1);
    expect(result.newPerformances).toBe(1);
    expect(result.existingSongMatches).toBe(0);

    // Verify files
    const songs = JSON.parse(fs.readFileSync(path.join(tmpDir, 'songs.json'), 'utf-8'));
    expect(songs).toHaveLength(2);
    expect(songs[1].title).toBe('New Song');

    const streams = JSON.parse(fs.readFileSync(path.join(tmpDir, 'streams.json'), 'utf-8'));
    expect(streams).toHaveLength(2);
    expect(streams[1].videoId).toBe('newVideo123');
  });

  it('adds performance to existing song when title+artist matches', () => {
    const result = addStreamAndSongs(tmpDir, {
      videoId: 'newVideo456',
      title: '新歌枠2',
      date: '2026-03-01',
      youtubeUrl: 'https://www.youtube.com/watch?v=newVideo456',
      songs: [
        { songName: '誰', artist: '李友廷', startSeconds: 200, endSeconds: 500 },
      ],
    });

    expect(result.newSongs).toBe(0);
    expect(result.existingSongMatches).toBe(1);
    expect(result.newPerformances).toBe(1);

    const songs = JSON.parse(fs.readFileSync(path.join(tmpDir, 'songs.json'), 'utf-8'));
    expect(songs).toHaveLength(1); // Still 1 song
    expect(songs[0].performances).toHaveLength(2); // But 2 performances
  });
});
```

Save to `lib/admin/__tests__/data-writer.test.ts`

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- data-writer
```

Expected: ALL FAIL.

**Step 3: Write the data writer service**

```typescript
// lib/admin/data-writer.ts
'use server';
// Merge new streams and songs into data/ JSON files

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
```

Save to `lib/admin/data-writer.ts`

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- data-writer
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add lib/admin/data-writer.ts lib/admin/__tests__/data-writer.test.ts
git commit -m "feat: add data writer service for merging songs into data files"
```

---

### Task 6: Git service

Thin wrapper around `child_process` for git operations.

**Files:**
- Create: `lib/admin/git.ts`
- Create: `lib/admin/__tests__/git.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildCommitMessage, parseGitStatus, GitFileStatus } from '../git';

describe('buildCommitMessage', () => {
  it('builds conventional commit message for single stream', () => {
    const msg = buildCommitMessage({
      streamDate: '2026-02-28',
      streamTitle: '午後歌枠',
      songCount: 18,
    });
    expect(msg).toBe('feat: add February 28th karaoke stream with 18 songs');
  });
});

describe('parseGitStatus', () => {
  it('parses git status --porcelain output', () => {
    const output = ` M data/songs.json
 M data/streams.json
 M data/metadata/song-metadata.json
?? new-file.txt`;

    const files = parseGitStatus(output);
    expect(files).toHaveLength(4);
    expect(files[0]).toEqual({ status: 'M', path: 'data/songs.json' });
    expect(files[3]).toEqual({ status: '??', path: 'new-file.txt' });
  });

  it('returns empty array for clean status', () => {
    expect(parseGitStatus('')).toEqual([]);
  });
});
```

Save to `lib/admin/__tests__/git.test.ts`

**Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- git
```

Expected: ALL FAIL.

**Step 3: Write the git service**

```typescript
// lib/admin/git.ts
'use server';
// Git operations via child_process

import { execSync } from 'child_process';
import path from 'path';

export interface GitFileStatus {
  status: string;
  path: string;
}

export interface CommitInfo {
  streamDate: string;
  streamTitle: string;
  songCount: number;
}

// ---------------------------------------------------------------------------
// Status parsing
// ---------------------------------------------------------------------------

export function parseGitStatus(output: string): GitFileStatus[] {
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({
      status: line.slice(0, 2).trim() || line.slice(0, 2),
      path: line.slice(3),
    }));
}

// ---------------------------------------------------------------------------
// Commit message building
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export function buildCommitMessage(info: CommitInfo): string {
  const [, month, day] = info.streamDate.split('-').map(Number);
  const monthName = MONTH_NAMES[month - 1];
  const dayStr = `${day}${ordinalSuffix(day)}`;
  return `feat: add ${monthName} ${dayStr} karaoke stream with ${info.songCount} songs`;
}

// ---------------------------------------------------------------------------
// Git operations (all synchronous, run in project root)
// ---------------------------------------------------------------------------

function runGit(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 30000 }).trim();
}

/**
 * Get git status for the data/ directory.
 */
export function getDataStatus(projectRoot: string): GitFileStatus[] {
  const output = runGit('status --porcelain data/', projectRoot);
  return parseGitStatus(output);
}

/**
 * Get git diff for data/ files (staged + unstaged).
 */
export function getDataDiff(projectRoot: string): string {
  return runGit('diff data/', projectRoot);
}

/**
 * Stage all data/ files, commit with the given message, and optionally push.
 */
export function commitDataChanges(
  projectRoot: string,
  message: string,
  push: boolean = false,
): { success: boolean; output: string } {
  try {
    runGit('add data/', projectRoot);
    const output = runGit(`commit -m "${message}"`, projectRoot);
    if (push) {
      runGit('push', projectRoot);
    }
    return { success: true, output };
  } catch (err) {
    return { success: false, output: String(err) };
  }
}
```

Save to `lib/admin/git.ts`

**Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- git
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add lib/admin/git.ts lib/admin/__tests__/git.test.ts
git commit -m "feat: add git service for commit and deploy operations"
```

---

### Task 7: Admin API routes

Create API routes that connect the admin UI to the TypeScript services. These routes only work in dev mode (they use Node.js APIs like `fs` and `child_process`).

**Files:**
- Create: `app/api/admin/discover/route.ts`
- Create: `app/api/admin/extract/route.ts`
- Create: `app/api/admin/import/route.ts`
- Create: `app/api/admin/metadata/route.ts`
- Create: `app/api/admin/deploy/route.ts`

**Step 1: Create the discover route**

```typescript
// app/api/admin/discover/route.ts
// Fetch video info from YouTube by URL or video ID

import { NextRequest, NextResponse } from 'next/server';
import { extractVideoId, fetchVideoPage, parseVideoInfo } from '@/lib/admin/youtube';

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

    return NextResponse.json(videoInfo);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch video info: ${err}` },
      { status: 500 }
    );
  }
}
```

**Step 2: Create the extract route**

```typescript
// app/api/admin/extract/route.ts
// Extract song timestamps from YouTube comments or pasted text

import { NextRequest, NextResponse } from 'next/server';
import { fetchComments } from '@/lib/admin/youtube';
import { findCandidateComment, parseTextToSongs } from '@/lib/admin/extraction';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { videoId, text } = await request.json();

    // Mode 1: Extract from pasted text
    if (text) {
      const songs = parseTextToSongs(text);
      return NextResponse.json({
        source: 'text',
        songs,
        rawText: text,
      });
    }

    // Mode 2: Auto-extract from YouTube comments
    if (!videoId) {
      return NextResponse.json({ error: 'videoId or text is required' }, { status: 400 });
    }

    const comments = await fetchComments(videoId);
    const candidate = findCandidateComment(comments);

    if (!candidate) {
      return NextResponse.json({
        source: null,
        songs: [],
        message: 'No comment with >= 3 timestamps found. Try pasting text manually.',
        commentsChecked: comments.length,
      });
    }

    const songs = parseTextToSongs(candidate.text);
    return NextResponse.json({
      source: 'comment',
      songs,
      rawText: candidate.text,
      commentAuthor: candidate.author,
      commentAuthorUrl: candidate.authorUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Extraction failed: ${err}` },
      { status: 500 }
    );
  }
}
```

**Step 3: Create the import route**

```typescript
// app/api/admin/import/route.ts
// Import a stream and its extracted songs into data/ files

import { NextRequest, NextResponse } from 'next/server';
import { addStreamAndSongs } from '@/lib/admin/data-writer';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { videoId, title, date, youtubeUrl, songs, credit } = body;

    if (!videoId || !title || !date || !youtubeUrl || !songs?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, title, date, youtubeUrl, songs' },
        { status: 400 }
      );
    }

    const result = addStreamAndSongs(DATA_DIR, {
      videoId,
      title,
      date,
      youtubeUrl,
      songs: songs.map((s: any) => ({
        songName: s.songName,
        artist: s.artist,
        startSeconds: s.startSeconds,
        endSeconds: s.endSeconds ?? null,
        note: s.note || '',
      })),
      credit,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Import failed: ${err}` },
      { status: 500 }
    );
  }
}
```

**Step 4: Create the metadata route**

```typescript
// app/api/admin/metadata/route.ts
// Fetch and update metadata (album art + lyrics) for songs

import { NextRequest, NextResponse } from 'next/server';
import { fetchSongMetadata } from '@/lib/admin/metadata';
import { updateMetadataFiles } from '@/lib/admin/data-writer';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// POST: Fetch metadata for a single song
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { songId, artist, title } = await request.json();

    if (!songId || !artist || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: songId, artist, title' },
        { status: 400 }
      );
    }

    const result = await fetchSongMetadata(songId, artist, title);
    const now = new Date().toISOString();

    // Write to metadata files
    if (result.artData) {
      updateMetadataFiles(DATA_DIR, {
        songId,
        fetchStatus: result.artStatus,
        matchConfidence: result.artConfidence,
        albumArtUrl: result.artData.albumArtUrl,
        albumArtUrls: result.artData.albumArtUrls,
        albumTitle: result.artData.albumTitle,
        itunesTrackId: result.artData.itunesTrackId,
        itunesCollectionId: result.artData.itunesCollectionId,
        trackDuration: result.artData.trackDuration,
        fetchedAt: now,
      });
    } else {
      updateMetadataFiles(DATA_DIR, {
        songId,
        fetchStatus: result.artStatus,
        matchConfidence: null,
        fetchedAt: now,
        lastError: result.artError,
      });
    }

    if (result.lyricsData) {
      updateMetadataFiles(DATA_DIR, undefined, {
        songId,
        fetchStatus: result.lyricsStatus,
        syncedLyrics: result.lyricsData.syncedLyrics,
        plainLyrics: result.lyricsData.plainLyrics,
        fetchedAt: now,
      });
    } else {
      updateMetadataFiles(DATA_DIR, undefined, {
        songId,
        fetchStatus: result.lyricsStatus,
        fetchedAt: now,
        lastError: result.lyricsError,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Metadata fetch failed: ${err}` },
      { status: 500 }
    );
  }
}
```

**Step 5: Create the deploy route**

```typescript
// app/api/admin/deploy/route.ts
// Git status, diff, commit, and push operations

import { NextRequest, NextResponse } from 'next/server';
import { getDataStatus, getDataDiff, commitDataChanges, buildCommitMessage } from '@/lib/admin/git';

const PROJECT_ROOT = process.cwd();

// GET: Return current git status for data/ files
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const status = getDataStatus(PROJECT_ROOT);
    const diff = getDataDiff(PROJECT_ROOT);
    return NextResponse.json({ status, diff, hasChanges: status.length > 0 });
  } catch (err) {
    return NextResponse.json({ error: `Git status failed: ${err}` }, { status: 500 });
  }
}

// POST: Commit and optionally push
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { message, push } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'Commit message is required' }, { status: 400 });
    }

    const result = commitDataChanges(PROJECT_ROOT, message, push);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Commit failed: ${err}` }, { status: 500 });
  }
}
```

**Step 6: Verify build doesn't break**

```bash
npm run build
```

Expected: Build succeeds. Admin routes (POST/PUT) are excluded from static export automatically.

**Step 7: Commit**

```bash
git add app/api/admin/
git commit -m "feat: add admin API routes for discover, extract, import, metadata, deploy"
```

---

### Task 8: Discover & Import page

The main admin workflow page: paste a YouTube URL → auto-extract songs → review/edit → add to catalog.

**Files:**
- Create: `app/admin/discover/page.tsx`
- Modify: `app/admin/page.tsx` (add navigation link)

**Step 1: Create the discover page**

```typescript
// app/admin/discover/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Download, Check, Edit2, Trash2, Plus, AlertCircle } from 'lucide-react';

interface VideoInfo {
  videoId: string;
  title: string;
  date: string;
  description: string;
  durationSeconds: number;
}

interface ExtractedSong {
  orderIndex: number;
  songName: string;
  artist: string;
  startSeconds: number;
  endSeconds: number | null;
  startTimestamp: string;
  endTimestamp: string | null;
  suspicious: boolean;
}

type Step = 'input' | 'extracting' | 'review' | 'importing' | 'done';

export default function DiscoverPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [songs, setSongs] = useState<ExtractedSong[]>([]);
  const [extractionSource, setExtractionSource] = useState<string | null>(null);
  const [commentAuthor, setCommentAuthor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  // Auth check
  useEffect(() => {
    fetch('/api/auth/check', { method: 'POST' })
      .then((res) => {
        if (!res.ok) router.replace('/admin/login');
        else setAuthenticated(true);
      });
  }, [router]);

  // Step 1: Fetch video info
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
      setStep('extracting');
      handleExtract(data.videoId);
    } catch (err) {
      setError(String(err));
    }
  }

  // Step 2: Extract songs from comments
  async function handleExtract(videoId: string) {
    try {
      const res = await fetch('/api/admin/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSongs(data.songs || []);
      setExtractionSource(data.source);
      setCommentAuthor(data.commentAuthor || null);

      if (data.songs?.length > 0) {
        setStep('review');
      } else {
        setPasteMode(true);
        setStep('review');
      }
    } catch (err) {
      setError(String(err));
      setPasteMode(true);
      setStep('review');
    }
  }

  // Extract from pasted text
  async function handlePasteExtract() {
    try {
      const res = await fetch('/api/admin/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedText }),
      });
      const data = await res.json();
      setSongs(data.songs || []);
      setExtractionSource('text');
      setPasteMode(false);
    } catch (err) {
      setError(String(err));
    }
  }

  // Step 3: Import approved songs
  async function handleImport() {
    if (!videoInfo) return;
    setStep('importing');
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: videoInfo.videoId,
          title: videoInfo.title,
          date: videoInfo.date,
          youtubeUrl: `https://www.youtube.com/watch?v=${videoInfo.videoId}`,
          songs: songs.map((s) => ({
            songName: s.songName,
            artist: s.artist,
            startSeconds: s.startSeconds,
            endSeconds: s.endSeconds,
          })),
          credit: commentAuthor ? {
            author: commentAuthor,
            authorUrl: '',
          } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportResult(data);
      setStep('done');

      // Auto-fetch metadata for new songs (fire and forget)
      fetchMetadataForNewSongs(songs);
    } catch (err) {
      setError(String(err));
      setStep('review');
    }
  }

  // Background metadata fetch
  async function fetchMetadataForNewSongs(songList: ExtractedSong[]) {
    for (const song of songList) {
      try {
        await fetch('/api/admin/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: '', // Will be matched by title+artist in the API
            artist: song.artist,
            title: song.songName,
          }),
        });
      } catch {
        // Non-critical, continue with next song
      }
    }
  }

  // Edit song inline
  function updateSong(index: number, field: string, value: string) {
    setSongs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function removeSong(index: number) {
    setSongs((prev) => prev.filter((_, i) => i !== index));
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-blue-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-blue-400 bg-clip-text text-transparent">
            匯入歌曲
          </h1>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Step 1: URL Input */}
        {step === 'input' && (
          <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
            <h2 className="text-lg font-semibold mb-4">貼上 YouTube 影片連結</h2>
            <div className="flex gap-2">
              <input
                data-testid="discover-url-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchVideo()}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
              <button
                data-testid="discover-fetch-button"
                onClick={handleFetchVideo}
                className="px-6 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90 flex items-center gap-2"
              >
                <Search size={16} />
                取得資訊
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Extracting */}
        {step === 'extracting' && videoInfo && (
          <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
            <h2 className="text-lg font-semibold mb-2">{videoInfo.title}</h2>
            <p className="text-gray-500 mb-4">{videoInfo.date}</p>
            <div className="flex items-center gap-2 text-gray-500">
              <div className="animate-spin h-4 w-4 border-2 border-pink-400 border-t-transparent rounded-full" />
              正在從留言中擷取歌曲...
            </div>
          </div>
        )}

        {/* Step 3: Review extracted songs */}
        {step === 'review' && videoInfo && (
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
              <h2 className="text-lg font-semibold mb-1">{videoInfo.title}</h2>
              <p className="text-gray-500 text-sm mb-3">{videoInfo.date}</p>
              {extractionSource && (
                <p className="text-sm text-gray-400">
                  來源：{extractionSource === 'comment' ? `留言 (${commentAuthor || '未知'})` : '手動貼上'}
                </p>
              )}
            </div>

            {/* Paste mode */}
            {pasteMode && (
              <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
                <h3 className="font-semibold mb-2">手動貼上歌單</h3>
                <p className="text-sm text-gray-500 mb-3">未找到含有時間戳的留言。請手動貼上歌單文字。</p>
                <textarea
                  data-testid="paste-text-input"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="0:04:23 誰 / 李友廷&#10;0:08:26 Shape of You / Ed Sheeran&#10;..."
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 font-mono text-sm"
                />
                <button
                  data-testid="paste-extract-button"
                  onClick={handlePasteExtract}
                  className="mt-2 px-4 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
                >
                  擷取歌曲
                </button>
              </div>
            )}

            {/* Song list */}
            {songs.length > 0 && (
              <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">擷取到 {songs.length} 首歌曲</h3>
                  <button
                    onClick={() => setPasteMode(!pasteMode)}
                    className="text-sm text-pink-500 hover:text-pink-700"
                  >
                    {pasteMode ? '隱藏手動輸入' : '手動貼上歌單'}
                  </button>
                </div>

                <div className="space-y-2">
                  {songs.map((song, i) => (
                    <div
                      key={i}
                      data-testid={`extracted-song-${i}`}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        song.suspicious ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                      }`}
                    >
                      <span className="text-gray-400 text-sm font-mono w-16">{song.startTimestamp}</span>
                      <input
                        value={song.songName}
                        onChange={(e) => updateSong(i, 'songName', e.target.value)}
                        className="flex-1 px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-pink-400 focus:outline-none"
                      />
                      <span className="text-gray-400">/</span>
                      <input
                        value={song.artist}
                        onChange={(e) => updateSong(i, 'artist', e.target.value)}
                        className="flex-1 px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-pink-400 focus:outline-none"
                      />
                      <button onClick={() => removeSong(i)} className="text-gray-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    data-testid="import-button"
                    onClick={handleImport}
                    className="px-6 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90 flex items-center gap-2"
                  >
                    <Download size={16} />
                    匯入到歌曲庫
                  </button>
                  <button
                    onClick={() => { setStep('input'); setVideoInfo(null); setSongs([]); }}
                    className="px-4 py-2 text-gray-500 hover:text-gray-700"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Import complete */}
        {step === 'done' && importResult && (
          <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/60 p-6">
            <div className="flex items-center gap-2 text-green-600 mb-4">
              <Check size={20} />
              <h2 className="text-lg font-semibold">匯入完成！</h2>
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              <p>新歌曲：{importResult.newSongs}</p>
              <p>已有歌曲（新增版本）：{importResult.existingSongMatches}</p>
              <p>總演出數：{importResult.newPerformances}</p>
            </div>
            <p className="mt-3 text-sm text-gray-400">專輯封面和歌詞正在背景中自動取得...</p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setStep('input'); setUrl(''); setVideoInfo(null); setSongs([]); setImportResult(null); }}
                className="px-4 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
              >
                匯入另一個直播
              </button>
              <button
                onClick={() => router.push('/admin')}
                className="px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                返回管理面板
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Save to `app/admin/discover/page.tsx`

**Step 2: Add navigation link to admin dashboard**

In `app/admin/page.tsx`, add a "匯入歌曲" button in the header area, next to the existing logout button:

```tsx
<button
  data-testid="discover-nav-button"
  onClick={() => router.push('/admin/discover')}
  className="px-4 py-2 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90 flex items-center gap-2 text-sm"
>
  <Plus size={16} />
  匯入歌曲
</button>
```

**Step 3: Verify in browser**

```bash
npm run dev
```

Navigate to `http://localhost:3000/admin/discover`. Verify:
- URL input field is visible
- Pasting a YouTube URL and clicking fetch triggers the workflow
- Extracted songs appear for review
- Songs can be edited inline
- Import button writes to data files

**Step 4: Commit**

```bash
git add app/admin/discover/ app/admin/page.tsx
git commit -m "feat: add discover/import page for extracting songs from YouTube"
```

---

### Task 9: Stamp page (port from Flask)

Port the Flask stamp UI (`tools/mizukilens/src/mizukilens/stamp.py` + `stamp_static/stamp.js`) to a Next.js page. Key features: YouTube player, keyboard shortcuts, inline timestamp editing.

**Files:**
- Create: `app/admin/stamp/page.tsx`

**Step 1: Create the stamp page**

This page lists all streams with their songs and allows marking start/end timestamps using a YouTube embedded player. The existing `app/api/versions/manage/route.ts` already supports PUT for updating timestamps.

The page should include:
- Left sidebar: stream list (filtered by those with songs missing end timestamps)
- Center: YouTube IFrame player
- Right: song list with timestamp controls
- Keyboard shortcuts: `m` (mark end), `t` (set start), `s` (seek to start), `e` (seek to end), `n`/`p` (next/prev song), `←`/`→` (seek ±5s)
- Uses existing `/api/songs` and `/api/streams` endpoints for reading
- Uses existing `/api/versions/manage` PUT endpoint for updating timestamps

**Implementation pattern**: Port the event handlers and keyboard shortcuts from `stamp_static/stamp.js` (670 lines of vanilla JS) into React hooks. The YouTube IFrame API integration follows the same pattern as the fan-facing player in `page.tsx`.

Data-testid attributes: `stamp-stream-list`, `stamp-song-list`, `stamp-player`, `stamp-mark-end-button`, `stamp-set-start-button`

**Step 2: Verify in browser**

```bash
npm run dev
```

Navigate to `http://localhost:3000/admin/stamp`. Verify:
- Stream list loads on the left
- Clicking a stream loads its songs and embeds the YouTube player
- Keyboard shortcuts work for marking timestamps
- Timestamps save via the existing API

**Step 3: Add navigation link from admin dashboard**

Add a "時間戳標記" link in the admin dashboard header.

**Step 4: Commit**

```bash
git add app/admin/stamp/
git commit -m "feat: add stamp page for marking song timestamps"
```

---

### Task 10: Metadata management page

A page to view metadata coverage and trigger fetches for songs missing album art or lyrics.

**Files:**
- Create: `app/admin/metadata/page.tsx`

**Step 1: Create the metadata page**

The page should show:
- **Summary stats**: total songs, matched, no_match, error, pending counts
- **Song table**: sortable by status, showing song title, artist, album art thumbnail, lyrics status
- **Actions**: "Fetch Missing" button to batch-fetch metadata for all songs without metadata
- **Per-song actions**: "Refetch" button, "Manual Override" button

Uses existing `/api/metadata` GET endpoint for reading, and `/api/admin/metadata` POST for fetching.

Data-testid attributes: `metadata-stats`, `metadata-song-table`, `metadata-fetch-missing-button`

**Step 2: Verify in browser and commit**

```bash
git add app/admin/metadata/
git commit -m "feat: add metadata management page"
```

---

### Task 11: Deploy page

A page to review pending data changes and commit/push to git.

**Files:**
- Create: `app/admin/deploy/page.tsx`

**Step 1: Create the deploy page**

The page should show:
- **Git status**: list of modified files in `data/`
- **Diff preview**: formatted diff of changes
- **Auto-generated commit message**: based on recent stream additions (uses `buildCommitMessage`)
- **Editable commit message**: curator can customize
- **Buttons**: "Commit" (local only) and "Commit & Push" (deploy to GitHub Pages)
- **Confirmation dialog**: before push, show warning that this will deploy to the live site

Data-testid attributes: `deploy-status`, `deploy-diff`, `deploy-commit-message`, `deploy-commit-button`, `deploy-push-button`

**Step 2: Verify in browser and commit**

```bash
git add app/admin/deploy/
git commit -m "feat: add deploy page for git commit and push"
```

---

### Task 12: Update admin dashboard navigation

Add navigation to all new pages from the admin dashboard.

**Files:**
- Modify: `app/admin/page.tsx`

**Step 1: Add navigation bar**

Add a nav section at the top of the admin page with links to:
- 匯入歌曲 (`/admin/discover`)
- 時間戳標記 (`/admin/stamp`)
- 歌曲資訊 (`/admin/metadata`)
- 部署 (`/admin/deploy`)

Each link uses the same frosted-glass card style as the existing admin UI.

Data-testid attributes: `admin-nav`, `admin-nav-discover`, `admin-nav-stamp`, `admin-nav-metadata`, `admin-nav-deploy`

**Step 2: Verify all navigation links work**

```bash
npm run dev
```

Navigate through all admin pages. Verify each page loads without errors.

**Step 3: Verify production build still works**

```bash
npm run build
```

Expected: Build succeeds. Admin routes with POST are excluded from static export. Admin pages export as client-side rendered pages (they just won't have working API backends in production — which is fine since fans don't use them).

**Step 4: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: add navigation bar to admin dashboard"
```

---

### Task 13: E2E tests with Playwright video recording + verification

All verification uses **Playwright video recordings** of real UI interactions. Tests perform actual browser actions (navigating, clicking, filling forms), and Playwright's `video: 'on'` config records the entire session as a `.webm` file. These recordings are then analyzed by the `/verify-video` and `/compare-before-after-with-video` skills.

**Files:**
- Create: `tests/admin-discover.spec.ts`
- Create: `tests/admin-regression.spec.ts`

**Step 1: Ensure Playwright config has video recording enabled**

In `playwright.config.ts`, verify or add:

```typescript
use: {
  video: 'on',           // Record video for ALL tests
  baseURL: 'http://localhost:3000',
},
```

This produces `.webm` files in `test-results/` for every test run.

**Step 2: Write discover/import workflow test (with video recording)**

The test drives the full admin workflow through the browser. Playwright records every frame.

```typescript
// tests/admin-discover.spec.ts
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SONGS_PATH = path.join(process.cwd(), 'data/songs.json');
const PROJECT_ROOT = process.cwd();

/** Restore data/ files to their last committed state via git checkout.
 *  More robust than fs.writeFileSync — survives OOM, crashes, and timeouts. */
function restoreDataFiles() {
  execSync('git checkout -- data/songs.json data/streams.json data/metadata/', {
    cwd: PROJECT_ROOT,
  });
}

test.describe.serial('Admin Discover & Import', () => {
  test.afterEach(() => {
    restoreDataFiles();
  });

  test('AC1: navigate to discover page from admin dashboard', async ({ page }) => {
    // Login
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');

    // Navigate to discover
    await page.getByTestId('discover-nav-button').click();
    await expect(page).toHaveURL(/.*\/admin\/discover/);
    await expect(page.getByTestId('discover-url-input')).toBeVisible();

    // Brief pause so video captures the final state
    await page.waitForTimeout(1000);
  });

  test('AC2: paste text, extract songs, review inline', async ({ page }) => {
    // Login and navigate
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');
    await page.goto('/admin/discover');

    // Paste song list text
    await page.getByTestId('paste-text-input').fill(
      '0:04:23 誰 / 李友廷\n0:08:26 Shape of You / Ed Sheeran\n0:12:00 夜曲 / 周杰倫'
    );
    await page.getByTestId('paste-extract-button').click();

    // Verify extracted songs appear
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();
    await expect(page.getByTestId('extracted-song-1')).toBeVisible();
    await expect(page.getByTestId('extracted-song-2')).toBeVisible();

    // Edit a song name inline (video captures the interaction)
    const songInput = page.getByTestId('extracted-song-1').locator('input').first();
    await songInput.clear();
    await songInput.fill('Shape of You (Acoustic)');

    // Remove last song
    await page.getByTestId('extracted-song-2').locator('button').click();
    await expect(page.getByTestId('extracted-song-2')).not.toBeVisible();

    await page.waitForTimeout(1000);
  });

  test('AC3: import extracted songs into catalog', async ({ page }) => {
    // Login and navigate
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');
    await page.goto('/admin/discover');

    // Paste and extract
    await page.getByTestId('paste-text-input').fill(
      '0:04:23 TestSong / TestArtist'
    );
    await page.getByTestId('paste-extract-button').click();
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();

    // Click import
    await page.getByTestId('import-button').click();

    // Wait for success state
    await expect(page.getByText('匯入完成')).toBeVisible({ timeout: 10000 });

    // Verify data files were updated
    const songs = JSON.parse(fs.readFileSync(SONGS_PATH, 'utf-8'));
    const newSong = songs.find((s: any) => s.title === 'TestSong');
    expect(newSong).toBeTruthy();
    expect(newSong.originalArtist).toBe('TestArtist');

    await page.waitForTimeout(1000);
  });
});
```

**Step 3: Write regression test — BEFORE vs AFTER video recordings**

This test creates two separate video recordings: one of the fan-facing catalog BEFORE admin changes, and one AFTER. The `/compare-before-after-with-video` skill then analyzes both to confirm no visual regressions.

```typescript
// tests/admin-regression.spec.ts
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const PROJECT_ROOT = process.cwd();

function restoreDataFiles() {
  execSync('git checkout -- data/songs.json data/streams.json data/metadata/', {
    cwd: PROJECT_ROOT,
  });
}

test.describe.serial('Fan-facing regression with video', () => {
  test.afterAll(() => {
    restoreDataFiles();
  });

  test('BEFORE: record fan catalog baseline', async ({ page }) => {
    // Navigate to fan-facing catalog
    await page.goto('/');
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 10000 });

    // Scroll through the catalog so video captures the full layout
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Interact with UI elements to record normal behavior
    // Click first song to show it's playable
    const firstRow = page.getByTestId('performance-row').first();
    await firstRow.click();
    await page.waitForTimeout(2000);

    // Video file: test-results/...-BEFORE-record-fan-catalog-baseline/video.webm
  });

  test('MIDDLE: perform admin import', async ({ page }) => {
    // Login to admin
    await page.goto('/admin/login');
    await page.getByTestId('username-input').fill('curator');
    await page.getByTestId('password-input').fill('mizuki-admin');
    await page.getByTestId('login-button').click();
    await page.waitForURL('**/admin');

    // Navigate to discover and import a test stream
    await page.goto('/admin/discover');
    await page.getByTestId('paste-text-input').fill(
      '0:01:00 RegressionTestSong / RegressionTestArtist'
    );
    await page.getByTestId('paste-extract-button').click();
    await expect(page.getByTestId('extracted-song-0')).toBeVisible();
    await page.getByTestId('import-button').click();
    await expect(page.getByText('匯入完成')).toBeVisible({ timeout: 10000 });
  });

  test('AFTER: record fan catalog post-import', async ({ page }) => {
    // Same interactions as BEFORE test — navigate and scroll the catalog
    await page.goto('/');
    await page.waitForSelector('[data-testid="performance-row"]', { timeout: 10000 });

    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const firstRow = page.getByTestId('performance-row').first();
    await firstRow.click();
    await page.waitForTimeout(2000);

    // Video file: test-results/...-AFTER-record-fan-catalog-post-import/video.webm
  });
});
```

**Step 4: Run E2E tests and collect video recordings**

```bash
npx playwright test tests/admin-discover.spec.ts tests/admin-regression.spec.ts --reporter=list
```

Expected: Tests pass. Video `.webm` files saved under `test-results/` for each test.

```bash
find test-results -name "*.webm" | head -10
```

**Step 5: Verify with video analysis skills**

Use the recorded `.webm` files with the verification skills:

1. **`/verify-video`** — Feed the `admin-discover` test videos. Ask Gemini to verify:
   - Discover page loads with URL input field
   - Pasted text produces extracted song rows
   - Inline editing visually updates the song name
   - Import shows success message with correct counts

2. **`/compare-before-after-with-video`** — Feed the BEFORE and AFTER regression videos. Ask Gemini to verify:
   - Fan-facing catalog layout is unchanged (same grid, same styling)
   - Existing songs still appear in the same positions
   - New song (RegressionTestSong) appears in the list without breaking layout
   - Player interaction (clicking a song) still works the same way

**Step 6: Commit**

```bash
git add tests/admin-discover.spec.ts tests/admin-regression.spec.ts
git commit -m "test: add E2E tests with Playwright video recording for admin workflow and regression"
```

---

## Post-Plan Notes

### MizukiLens Backward Compatibility
- Python CLI remains in `tools/mizukilens/` as backup
- Python tests continue to pass (`cd tools/mizukilens && .venv/bin/python3 -m pytest tests/ -v`)
- README updated to note web admin is primary tool

### YouTube Comment Fetching Robustness
- The innertube API comment fetching may need adjustment if YouTube changes their internal API
- Fallback: the paste-text mode allows manual comment extraction at any time
- Future enhancement: support yt-dlp as fallback for comment fetching

### Static Export Compatibility
- All admin API routes (POST/PUT) are automatically excluded from static export
- Admin pages export as client-side rendered shells (non-functional without dev server)
- Existing fan-facing API routes (GET with `force-static`) are unaffected
- Run `npm run build` after each task to verify no breakage

### Global Requirement Update
As per user request, starting from Task 7, **every** new API route or UI page task MUST include an E2E Playwright test with video recording (`video: 'on'`) as part of its verification step, rather than waiting for Task 13.
