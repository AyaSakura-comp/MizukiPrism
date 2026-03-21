# Channel Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/admin/channel` page that fetches all karaoke streams from a YouTube channel URL and lets the admin click one to open the existing discover import flow.

**Architecture:** New `app/admin/channel/page.tsx` fetches channel uploads via YouTube Data API v3 (uploads playlist, paginated), filters client-side by karaoke keywords, cross-references Supabase for "already imported" badges, and navigates to `/admin/discover?url=<encoded>` on click. The discover page gains `?url=` auto-trigger support. All browser-safe — no API routes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, YouTube Data API v3, Supabase (via existing `loadStreams`), Vitest (unit tests), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-03-21-channel-browser-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/youtube-api.ts` | Modify | Add `extractChannelInput`, `ChannelVideo` interface, `fetchChannelUploads`, `KARAOKE_KEYWORDS` |
| `lib/admin/__tests__/youtube-api.test.ts` | Modify | Add unit tests for new functions |
| `app/admin/channel/page.tsx` | Create | Channel browser UI |
| `app/admin/discover/page.tsx` | Modify | Read `?url=` param, wrap `handleFetchVideo` in `useCallback`, add auto-trigger effect |
| `app/admin/page.tsx` | Modify | Add "瀏覽頻道" button to streams tab header |

---

## Task 1: Add `extractChannelInput` to `lib/youtube-api.ts`

**Files:**
- Modify: `lib/youtube-api.ts`
- Modify: `lib/admin/__tests__/youtube-api.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `lib/admin/__tests__/youtube-api.test.ts`:

```ts
import { extractChannelInput } from '../../youtube-api';

describe('extractChannelInput', () => {
  it('parses /channel/UC... URL', () => {
    expect(extractChannelInput('https://www.youtube.com/channel/UCjv4bfP_67WLuPheS-Z8Ekg')).toEqual(
      { type: 'id', value: 'UCjv4bfP_67WLuPheS-Z8Ekg' }
    );
  });

  it('parses /@handle URL', () => {
    expect(extractChannelInput('https://www.youtube.com/@mizukiTW')).toEqual(
      { type: 'handle', value: 'mizukiTW' }
    );
  });

  it('parses /@handle URL with trailing slash', () => {
    expect(extractChannelInput('https://www.youtube.com/@mizukiTW/')).toEqual(
      { type: 'handle', value: 'mizukiTW' }
    );
  });

  it('returns null for unrecognized URL', () => {
    expect(extractChannelInput('https://youtube.com/watch?v=abc')).toBeNull();
    expect(extractChannelInput('not a url')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/chihmin/MizukiPrism
npm run test:unit -- --reporter=verbose 2>&1 | grep -A5 "extractChannelInput"
```

Expected: FAIL — `extractChannelInput is not a function`

- [ ] **Step 3: Implement `extractChannelInput` in `lib/youtube-api.ts`**

Add before `fetchVideoInfo`:

```ts
export type ChannelInput =
  | { type: 'id'; value: string }
  | { type: 'handle'; value: string };

/** Parse a YouTube channel URL into a channel input descriptor */
export function extractChannelInput(url: string): ChannelInput | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== 'www.youtube.com' && u.hostname !== 'youtube.com') return null;
    const channelMatch = u.pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };
    const handleMatch = u.pathname.match(/^\/@([\w.-]+)\/?$/);
    if (handleMatch) return { type: 'handle', value: handleMatch[1] };
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -A5 "extractChannelInput"
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/youtube-api.ts lib/admin/__tests__/youtube-api.test.ts
git commit -m "feat: add extractChannelInput to youtube-api"
```

---

## Task 2: Add `fetchChannelUploads` to `lib/youtube-api.ts`

**Files:**
- Modify: `lib/youtube-api.ts`
- Modify: `lib/admin/__tests__/youtube-api.test.ts`

- [ ] **Step 1: Write failing tests**

Update the existing import line added in Task 1 (do NOT add a second import — update the one that already imports `extractChannelInput`):

```ts
import { extractChannelInput, fetchChannelUploads, KARAOKE_KEYWORDS } from '../../youtube-api';

describe('KARAOKE_KEYWORDS', () => {
  it('includes Japanese, Chinese, and English keywords', () => {
    expect(KARAOKE_KEYWORDS).toContain('歌回');
    expect(KARAOKE_KEYWORDS).toContain('カラオケ');
    expect(KARAOKE_KEYWORDS).toContain('卡拉OK');
    expect(KARAOKE_KEYWORDS).toContain('karaoke');
  });
});

describe('fetchChannelUploads', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  function makeChannelsResponse(uploadsPlaylistId: string) {
    return {
      ok: true,
      json: async () => ({
        items: [{
          snippet: {
            title: 'TestChannel',
            customUrl: '@test',
            thumbnails: { high: { url: 'https://example.com/avatar.jpg' } },
            description: '',
          },
          contentDetails: {
            relatedPlaylists: { uploads: uploadsPlaylistId },
          },
        }],
      }),
    };
  }

  function makePlaylistResponse(titles: string[], nextPageToken?: string) {
    return {
      ok: true,
      json: async () => ({
        items: titles.map((title, i) => ({
          snippet: {
            title,
            publishedAt: `2025-0${i + 1}-01T00:00:00Z`,
            resourceId: { videoId: `vid${i}` },
            thumbnails: { medium: { url: `https://example.com/thumb${i}.jpg` } },
          },
        })),
        nextPageToken,
      }),
    };
  }

  it('filters videos by karaoke keywords', async () => {
    mockFetch
      .mockResolvedValueOnce(makeChannelsResponse('PLtest'))
      .mockResolvedValueOnce(makePlaylistResponse(['秋日歌回 #3', 'Gaming Video', '【カラオケ】夏夜']));

    const onProgress = vi.fn();
    const result = await fetchChannelUploads({ type: 'id', value: 'UCtest' }, onProgress);

    expect(result.videos).toHaveLength(2);
    expect(result.videos[0].title).toBe('秋日歌回 #3');
    expect(result.videos[1].title).toBe('【カラオケ】夏夜');
    expect(result.channel.displayName).toBe('TestChannel');
  });

  it('calls onProgress for each page', async () => {
    mockFetch
      .mockResolvedValueOnce(makeChannelsResponse('PLtest'))
      .mockResolvedValueOnce(makePlaylistResponse(['歌回 1'], 'page2token'))
      .mockResolvedValueOnce(makePlaylistResponse(['歌回 2']));

    const onProgress = vi.fn();
    await fetchChannelUploads({ type: 'id', value: 'UCtest' }, onProgress);

    expect(onProgress).toHaveBeenCalledWith(1);
    expect(onProgress).toHaveBeenCalledWith(2);
  });

  it('uses forHandle when input type is handle', async () => {
    mockFetch
      .mockResolvedValueOnce(makeChannelsResponse('PLtest'))
      .mockResolvedValueOnce(makePlaylistResponse([]));

    await fetchChannelUploads({ type: 'handle', value: 'mizukiTW' }, vi.fn());

    const channelUrl = mockFetch.mock.calls[0][0] as string;
    expect(channelUrl).toContain('forHandle=mizukiTW');
    expect(channelUrl).not.toContain('&id=');
  });

  it('throws when channel not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    await expect(fetchChannelUploads({ type: 'id', value: 'UCbad' }, vi.fn())).rejects.toThrow('找不到此頻道');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -E "(FAIL|fetchChannelUploads|KARAOKE)"
```

Expected: FAIL — not yet implemented

- [ ] **Step 3: Implement in `lib/youtube-api.ts`**

Add after `fetchChannelInfo`:

```ts
export const KARAOKE_KEYWORDS = [
  // Japanese
  '歌回', '歌枠', 'カラオケ', '歌ってみた', '歌配信',
  // Chinese
  '卡拉OK', '唱歌', '翻唱',
  // English (only 'karaoke' to avoid false positives)
  'karaoke',
];

export interface ChannelVideo {
  videoId: string;
  title: string;
  date: string;       // YYYY-MM-DD from snippet.publishedAt
  thumbnailUrl: string;
}

export interface ChannelUploadsResult {
  channel: ChannelInfo;
  videos: ChannelVideo[];
  partialError?: string;
}

/**
 * Fetch all uploads from a channel and filter by karaoke keywords.
 * Does NOT reuse fetchChannelInfo — needs contentDetails,snippet in one call.
 */
export async function fetchChannelUploads(
  input: ChannelInput,
  onProgress: (page: number) => void,
  maxPages = 5,
  keywords: string[] = KARAOKE_KEYWORDS,
): Promise<ChannelUploadsResult> {
  // Step 1: Resolve channel → uploadsPlaylistId + channel info
  const idParam = input.type === 'id' ? `id=${input.value}` : `forHandle=${input.value}`;
  const channelUrl = `${YT_BASE}/channels?part=contentDetails,snippet&${idParam}&key=${GOOGLE_API_KEY}`;
  const channelRes = await fetch(channelUrl);
  if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);
  const channelData = await channelRes.json();
  if (!channelData.items?.length) throw new Error('找不到此頻道');

  const item = channelData.items[0];
  const snippet = item.snippet;
  const uploadsPlaylistId: string = item.contentDetails.relatedPlaylists.uploads;
  const channel: ChannelInfo = {
    channelId: item.id ?? input.value,
    handle: snippet.customUrl || '',
    displayName: snippet.title,
    avatarUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    description: snippet.description || '',
  };

  // Step 2: Paginate uploads playlist, filter by keywords
  const videos: ChannelVideo[] = [];
  let pageToken: string | undefined;
  let page = 0;
  let partialError: string | undefined;

  while (page < maxPages) {
    onProgress(page + 1);
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    const listUrl = `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50${tokenParam}&key=${GOOGLE_API_KEY}`;
    try {
      const listRes = await fetch(listUrl);
      if (!listRes.ok) throw new Error(`YouTube API error: ${listRes.status}`);
      const listData = await listRes.json();

      for (const vi of (listData.items || [])) {
        const s = vi.snippet;
        const title: string = s.title || '';
        const lower = title.toLowerCase();
        if (keywords.some(k => lower.includes(k.toLowerCase()))) {
          videos.push({
            videoId: s.resourceId?.videoId || '',
            title,
            date: (s.publishedAt || '').slice(0, 10),
            thumbnailUrl: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
          });
        }
      }

      pageToken = listData.nextPageToken;
      page++;
      if (!pageToken) break;
    } catch (err) {
      partialError = String(err);
      break;
    }
  }

  // Sort newest-first
  videos.sort((a, b) => b.date.localeCompare(a.date));
  return { channel, videos, ...(partialError ? { partialError } : {}) };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:unit -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|fetchChannelUploads|KARAOKE)"
```

Expected: all tests PASS

- [ ] **Step 5: Confirm full test suite still passes**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: no failures

- [ ] **Step 6: Commit**

```bash
git add lib/youtube-api.ts lib/admin/__tests__/youtube-api.test.ts
git commit -m "feat: add fetchChannelUploads and KARAOKE_KEYWORDS to youtube-api"
```

---

## Task 3: Build `/admin/channel` page

**Files:**
- Create: `app/admin/channel/page.tsx`

- [ ] **Step 1: Create the page with auth guard and URL input**

```tsx
// app/admin/channel/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowLeft } from 'lucide-react';
import { isAuthenticated } from '@/lib/supabase-admin';
import { loadStreams } from '@/lib/supabase-data';
import {
  extractChannelInput,
  fetchChannelUploads,
  ChannelInfo,
  ChannelVideo,
} from '@/lib/youtube-api';

export default function ChannelBrowserPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [importedVideoIds, setImportedVideoIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/admin/login'); return; }
    setAuthenticated(true);
    loadStreams().then(streams => {
      setImportedVideoIds(new Set(streams.map(s => s.video_id)));
    }).catch(() => {/* non-critical */});
  }, [router]);

  async function handleSearch() {
    setError(null);
    setPartialError(null);
    setChannel(null);
    setVideos([]);
    const input = extractChannelInput(urlInput.trim());
    if (!input) {
      setError('請輸入有效的 YouTube 頻道網址（例：youtube.com/@handle）');
      return;
    }
    setLoading(true);
    try {
      const result = await fetchChannelUploads(input, page => setLoadingPage(page));
      setChannel(result.channel);
      setVideos(result.videos);
      if (result.partialError) setPartialError(`部分載入失敗：${result.partialError}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadingPage(0);
    }
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fff0f5] via-[#f0f8ff] to-[#e6e6fa]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-white/60 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-slate-700">瀏覽頻道歌回</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* URL input */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 p-6">
          <label className="block text-sm font-medium text-slate-600 mb-2">YouTube 頻道網址</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="https://www.youtube.com/@mizukiTW"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-pink-300 focus:ring-2 focus:ring-pink-100 outline-none bg-white text-slate-700 placeholder-slate-400 text-sm"
              data-testid="channel-url-input"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !urlInput.trim()}
              className="px-4 py-2.5 bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              data-testid="channel-search-button"
            >
              <Search className="w-4 h-4" />
              搜尋
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600" data-testid="channel-error">{error}</p>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-8 text-slate-500 text-sm" data-testid="channel-loading">
            載入中... (第 {loadingPage} 頁)
          </div>
        )}

        {/* Partial error warning */}
        {partialError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700">
            ⚠️ {partialError}（已顯示部分結果）
          </div>
        )}

        {/* Channel header */}
        {channel && (
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 p-4 flex items-center gap-4" data-testid="channel-header">
            {channel.avatarUrl && (
              <img src={channel.avatarUrl} alt={channel.displayName} className="w-14 h-14 rounded-full object-cover" />
            )}
            <div>
              <p className="font-semibold text-slate-800">{channel.displayName}</p>
              {channel.handle && <p className="text-sm text-slate-500">{channel.handle}</p>}
              <p className="text-sm text-slate-500 mt-0.5">找到 {videos.length} 部歌回直播</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {channel && videos.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 text-sm" data-testid="channel-empty">
            此頻道目前沒有符合的歌回直播
          </div>
        )}

        {/* Stream list */}
        {videos.length > 0 && (
          <div className="space-y-3" data-testid="channel-stream-list">
            {videos.map(video => {
              const isImported = importedVideoIds.has(video.videoId);
              const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
              return (
                <div
                  key={video.videoId}
                  className="bg-white/80 backdrop-blur-xl rounded-xl shadow-sm border border-white/60 p-4 flex items-center gap-4"
                  data-testid={`channel-stream-${video.videoId}`}
                >
                  {video.thumbnailUrl && (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-24 h-[54px] object-cover rounded-lg shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{video.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{video.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isImported && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                        已匯入
                      </span>
                    )}
                    <button
                      onClick={() => router.push(`/admin/discover?url=${encodeURIComponent(youtubeUrl)}`)}
                      className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-pink-400 to-blue-400 text-white rounded-lg hover:opacity-90"
                      data-testid={`import-btn-${video.videoId}`}
                    >
                      匯入
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

```bash
npm run build 2>&1 | grep -E "(error|Error|✓|channel)"
```

Expected: `○ /admin/channel` listed as static, no errors

- [ ] **Step 3: Commit**

```bash
git add app/admin/channel/page.tsx
git commit -m "feat: add /admin/channel page for channel stream browser"
```

---

## Task 4: Add `?url=` auto-trigger to discover page

**Files:**
- Modify: `app/admin/discover/page.tsx`

The state variable for the URL input is `url` / `setUrl` (line 45 of discover page). Do NOT use `youtubeUrl` — it does not exist.

- [ ] **Step 1: Add `useSearchParams` and `useCallback` imports**

Update the next/navigation import line:
```ts
import { useRouter, useSearchParams } from 'next/navigation';
```

Add `useCallback` to the React import (it's already importing `useState`, `useEffect`, `useRef`, `useMemo` — add `useCallback` to that list).

- [ ] **Step 2: Read `?url=` param inside component**

After existing state declarations, add:

```ts
const searchParams = useSearchParams();
const urlParam = searchParams.get('url') ? decodeURIComponent(searchParams.get('url')!) : null;
```

- [ ] **Step 3: Add auto-trigger effect**

The correct approach passes the URL directly into `handleFetchVideo` as a parameter to avoid stale closure — do NOT rely on `setUrl` batching before calling the function.

First, update `handleFetchVideo` to accept an optional URL override:

```ts
// Find: async function handleFetchVideo() {
// Replace with:
async function handleFetchVideo(overrideUrl?: string) {
  const targetUrl = overrideUrl ?? url;
  // Then replace ALL references to `url` inside this function body with `targetUrl`
  // (only the URL input variable — not other unrelated uses of the word "url")
```

Then add the auto-trigger effect after the auth `useEffect`:

```ts
// Auto-trigger fetch when navigated from channel browser with ?url= param
useEffect(() => {
  if (!authenticated || !urlParam) return;
  setUrl(urlParam);
  handleFetchVideo(urlParam);
}, [authenticated, urlParam]); // eslint-disable-line react-hooks/exhaustive-deps
// handleFetchVideo excluded — it is redefined on every render; urlParam is stable
```

- [ ] **Step 4: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error|✓)"
```

Expected: clean build, no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add app/admin/discover/page.tsx
git commit -m "feat: auto-trigger discover extraction from ?url= query param"
```

---

## Task 5: Add "瀏覽頻道" button to admin dashboard

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Add button next to "匯入歌曲" in streams tab header**

Find the streams tab header section (search for `data-testid="add-stream-button"`). Add the new button immediately before it:

```tsx
<button
  onClick={() => router.push('/admin/channel')}
  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm transition-all"
  data-testid="channel-nav-button"
>
  <Search className="w-4 h-4" />
  瀏覽頻道
</button>
```

Ensure `Search` is imported from lucide-react (check the existing import line — add if missing).

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "(error|Error|✓)"
```

Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: add 瀏覽頻道 button to admin dashboard"
```

---

## Task 6: E2E test

**Files:**
- Create: `tests/channel-browser.spec.ts`

The test uses the existing YouTube API key (referrer-restricted to `localhost:*/*` — works in Playwright running against `localhost:3000`).

- [ ] **Step 1: Write the E2E test**

```ts
// tests/channel-browser.spec.ts
/**
 * E2E: Channel browser — paste channel URL, see stream list, click import
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
// Use a real small VTuber channel known to have karaoke streams
const TEST_CHANNEL_URL = 'https://www.youtube.com/@mizukilive1105';

test('channel browser: fetch streams and navigate to discover', async ({ page }) => {
  test.setTimeout(60000);

  // Login
  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  // Navigate to channel browser
  await page.goto(`${BASE_URL}/admin/channel`);
  await page.getByTestId('channel-url-input').fill(TEST_CHANNEL_URL);
  await page.getByTestId('channel-search-button').click();

  // Wait for results (API call + pagination)
  await expect(page.getByTestId('channel-header')).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'test-results/channel-01-results.png' });

  // Verify stream list appears (may be empty if channel has no matching streams — that's OK)
  const streamList = page.getByTestId('channel-stream-list');
  const emptyState = page.getByTestId('channel-empty');
  const hasResults = await streamList.isVisible().catch(() => false);
  const hasEmpty = await emptyState.isVisible().catch(() => false);
  expect(hasResults || hasEmpty).toBe(true);

  if (hasResults) {
    // Click first import button
    const firstImportBtn = page.locator('[data-testid^="import-btn-"]').first();
    await firstImportBtn.click();

    // Should navigate to /admin/discover with URL param
    await page.waitForURL('**/admin/discover**', { timeout: 10000 });
    expect(page.url()).toContain('url=');
    await page.screenshot({ path: 'test-results/channel-02-discover.png' });
  }
});

test('channel browser: shows error for invalid URL', async ({ page }) => {
  test.setTimeout(20000);

  await page.goto(`${BASE_URL}/admin/login`);
  await page.getByTestId('password-input').fill('mizuki-admin');
  await page.getByTestId('login-button').click();
  await page.waitForURL('**/admin', { timeout: 10000 });

  await page.goto(`${BASE_URL}/admin/channel`);
  await page.getByTestId('channel-url-input').fill('https://youtube.com/watch?v=abc');
  await page.getByTestId('channel-search-button').click();

  await expect(page.getByTestId('channel-error')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('channel-error')).toContainText('請輸入有效的');
});
```

- [ ] **Step 2: Ensure dev server is running**

```bash
# In a separate terminal:
npm run dev
```

- [ ] **Step 3: Run the E2E test**

```bash
npx playwright test tests/channel-browser.spec.ts --reporter=line 2>&1
```

Expected: both tests PASS (first test result depends on channel content)

- [ ] **Step 4: Copy video for verification**

```bash
find test-results -name "*.webm" | sort -t/ -k1 | tail -2
# Copy to videos/
cp "test-results/<dir>/video.webm" videos/e2e-channel-browser.webm
```

- [ ] **Step 5: Commit**

```bash
git add tests/channel-browser.spec.ts videos/e2e-channel-browser.webm
git commit -m "test: add channel browser E2E test"
```

---

## Task 7: Final build check and push

- [ ] **Step 1: Run full build**

```bash
npm run build 2>&1 | tail -20
```

Expected: all routes `○` (static), no errors

- [ ] **Step 2: Run unit tests**

```bash
npm run test:unit 2>&1 | tail -5
```

Expected: all tests pass

- [ ] **Step 3: Update CLAUDE.md**

Add to the project structure section under `app/admin/`:
```
│   └── channel/page.tsx      Browse YouTube channel for karaoke streams to import
```

Add to the "Known Rabbit Holes" section:
```
### 12. Channel browser 已匯入 Set not refreshed mid-session
`importedVideoIds` in `/admin/channel` is built from `loadStreams()` on mount. If the admin imports a stream then navigates back, the 已匯入 badge won't appear until the page is hard-reloaded. Acceptable in v1.
```

- [ ] **Step 4: Commit and push**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for channel browser feature"
git push
```
