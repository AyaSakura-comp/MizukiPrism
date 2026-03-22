# Streamer Lazy Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load songs/performances per-streamer on demand instead of all at once on page mount.

**Architecture:** Add `loadSongsByChannel()` to `lib/supabase-data.ts`. Modify `app/page.tsx` to defer song loading until a streamer is selected (or auto-load for single-streamer). Songs accumulate in memory across selections. All filtering remains in-memory.

**Tech Stack:** Next.js, React, TypeScript, Supabase, Playwright, Gemini CLI

**Spec:** `docs/superpowers/specs/2026-03-22-streamer-lazy-load-design.md`

---

### Task 1: Add `loadSongsByChannel()` to supabase-data.ts

**Files:**
- Modify: `lib/supabase-data.ts`

- [ ] **Step 1: Add the `loadSongsByChannel` function**

Add after the existing `loadSongs()` function (after line 54):

```typescript
/** Load songs for a specific streamer channel, with performances grouped by song */
export async function loadSongsByChannel(channelId: string): Promise<Song[]> {
  // Step 1: Get stream IDs for this channel
  const { data: streamRows, error: streamError } = await supabase
    .from('streams')
    .select('id')
    .eq('channel_id', channelId);
  if (streamError) throw new Error(`Supabase error: ${streamError.message}`);
  const streamIds = (streamRows ?? []).map(r => r.id);
  if (streamIds.length === 0) return [];

  // Step 2: Fetch performances in batches of 50 stream IDs
  const allPerformances: any[] = [];
  for (let i = 0; i < streamIds.length; i += 50) {
    const batch = streamIds.slice(i, i + 50);
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
      .in('stream_id', batch)
      .order('date', { ascending: false });
    if (error) throw new Error(`Supabase error: ${error.message}`);
    allPerformances.push(...(data ?? []));
  }

  // Step 3: Group by song (same logic as loadSongs)
  const songMap = new Map<string, Song>();
  for (const row of allPerformances) {
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors (pre-existing sheets test errors are OK)

- [ ] **Step 3: Commit**

```bash
git add lib/supabase-data.ts
git commit -m "feat: add loadSongsByChannel for per-streamer lazy loading"
```

---

### Task 2: Fix streams state type to include channelId

**Files:**
- Modify: `app/page.tsx:62` — streams state type
- Modify: `app/page.tsx:147` — streams `.then()` type annotation
- Modify: `app/page.tsx:276-282` — remove `as any` casts in streamChannelMap

- [ ] **Step 1: Update streams state type**

Change line 62 from:
```typescript
const [streams, setStreams] = useState<{id:string;title:string;date:string;videoId:string}[]>([]);
```
to:
```typescript
const [streams, setStreams] = useState<{id:string;title:string;date:string;videoId:string;channelId?:string}[]>([]);
```

- [ ] **Step 2: Update loadStreams `.then()` type**

Change line 147 from:
```typescript
.then((data: {id:string;title:string;date:string;videoId:string}[]) => {
```
to:
```typescript
.then((data: {id:string;title:string;date:string;videoId:string;channelId?:string}[]) => {
```

- [ ] **Step 3: Remove `as any` casts in streamChannelMap**

Change lines 276-282 from:
```typescript
const streamChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of streams) {
      if ((s as any).channelId) map.set(s.id, (s as any).channelId);
    }
    return map;
  }, [streams]);
```
to:
```typescript
const streamChannelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of streams) {
      if (s.channelId) map.set(s.id, s.channelId);
    }
    return map;
  }, [streams]);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "fix: add channelId to streams state type, remove as-any casts"
```

---

### Task 3: Add lazy load state and modify mount useEffect

**Files:**
- Modify: `app/page.tsx` — add new state vars, update `useEffect`, add `mergeSongs` helper, add `loadChannelSongs` handler

- [ ] **Step 1: Add new state variables and import**

After line 77 (`selectedStreamers` state), add:
```typescript
const [loadedChannels, setLoadedChannels] = useState<Set<string>>(new Set());
const [songsLoading, setSongsLoading] = useState(false);
const [failedChannel, setFailedChannel] = useState<string | null>(null);
```

Add `loadSongsByChannel` to the import from `@/lib/supabase-data` (line 17):
```typescript
import { loadSongs, loadMetadata, loadStreams, loadStreamers, loadSongsByChannel } from '@/lib/supabase-data';
```

- [ ] **Step 2: Add `mergeSongs` helper function**

Add before the `Home` component (after the `formatTime` function, around line 57):
```typescript
function mergeSongs(existing: Song[], incoming: Song[]): Song[] {
  const map = new Map<string, Song>();
  for (const s of existing) map.set(s.id, { ...s, performances: [...s.performances] });
  for (const s of incoming) {
    if (map.has(s.id)) {
      const existingPerfIds = new Set(map.get(s.id)!.performances.map(p => p.id));
      const newPerfs = s.performances.filter(p => !existingPerfIds.has(p.id));
      map.get(s.id)!.performances.push(...newPerfs);
    } else {
      map.set(s.id, { ...s, performances: [...s.performances] });
    }
  }
  return Array.from(map.values());
}
```

- [ ] **Step 3: Add `loadChannelSongs` handler**

Add after the `fetchSongs` function (around line 122). This replaces `fetchSongs` as the primary song-loading mechanism:
```typescript
const loadChannelSongs = async (channelId: string) => {
    if (loadedChannels.has(channelId)) return;
    setSongsLoading(true);
    setFailedChannel(null);
    try {
      const channelSongs = await loadSongsByChannel(channelId);
      // Merge album art from metadata map
      const withArt = channelSongs.map(song => ({
        ...song,
        albumArtUrl: albumArtMapRef.current.get(song.id),
      }));
      setSongs(prev => mergeSongs(prev, withArt));
      setLoadedChannels(prev => new Set(prev).add(channelId));
      setLoadError(false);
    } catch {
      setLoadError(true);
      setFailedChannel(channelId);
    } finally {
      setSongsLoading(false);
    }
  };
```

- [ ] **Step 4: Modify mount useEffect to NOT call fetchSongs**

In the mount `useEffect` (lines 125-161), change the metadata `.finally()` block. Remove the `fetchSongs()` call — metadata still loads on mount, but songs wait for streamer selection.

Change:
```typescript
      .finally(() => {
        fetchSongs();
      });
```
to:
```typescript
      .finally(() => {
        // Songs are loaded lazily per-streamer — no fetchSongs() here
      });
```

- [ ] **Step 5: Add useEffect for single-streamer auto-load**

Add a new `useEffect` after the mount effect:
```typescript
  // Auto-load songs when there's only one streamer
  useEffect(() => {
    if (streamers.length === 1 && loadedChannels.size === 0) {
      loadChannelSongs(streamers[0].channelId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamers]);
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx lib/supabase-data.ts
git commit -m "feat: lazy load songs per streamer instead of all on mount"
```

---

### Task 4: Update streamersWithSongs, streamer handler, and error retry

**Files:**
- Modify: `app/page.tsx:284-294` — `streamersWithSongs` memo
- Modify: `app/page.tsx:1119-1125` — streamer click handler
- Modify: `app/page.tsx:1324-1357` — error retry UI

- [ ] **Step 1: Fix `streamersWithSongs` to derive from streams instead of songs**

Change lines 284-294 from:
```typescript
  const streamersWithSongs = useMemo(() => {
    const channelIdsWithSongs = new Set<string>();
    for (const song of songs) {
      for (const perf of song.performances) {
        const chId = streamChannelMap.get(perf.streamId || '');
        if (chId) channelIdsWithSongs.add(chId);
      }
    }
    return streamers.filter(s => channelIdsWithSongs.has(s.channelId));
  }, [streamers, songs, streamChannelMap]);
```
to:
```typescript
  const streamersWithSongs = useMemo(() => {
    const channelIdsWithStreams = new Set(
      streams.map(s => s.channelId).filter(Boolean)
    );
    return streamers.filter(s => channelIdsWithStreams.has(s.channelId));
  }, [streamers, streams]);
```

- [ ] **Step 2: Update streamer filter click handler at lines 1119-1125**

Change:
```typescript
                  onClick={() => {
                    setSelectedStreamers((prev) =>
                      prev.includes(s.channelId)
                        ? prev.filter((id) => id !== s.channelId)
                        : [...prev, s.channelId]
                    );
                  }}
```
to:
```typescript
                  onClick={() => {
                    const isSelected = selectedStreamers.includes(s.channelId);
                    if (!isSelected) {
                      loadChannelSongs(s.channelId);
                    }
                    setSelectedStreamers((prev) =>
                      prev.includes(s.channelId)
                        ? prev.filter((id) => id !== s.channelId)
                        : [...prev, s.channelId]
                    );
                  }}
```

- [ ] **Step 3: Update error retry button at line 1345**

Change:
```typescript
                  onClick={fetchSongs}
```
to:
```typescript
                  onClick={() => failedChannel ? loadChannelSongs(failedChannel) : null}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: trigger lazy load on streamer selection, fix streamersWithSongs, update retry"
```

---

### Task 5: Update hero carousel song count and landing UI

**Files:**
- Modify: `app/page.tsx:692` — hero song count
- Modify: `app/page.tsx:1322-1358` — add landing/loading states before song list

- [ ] **Step 1: Update hero carousel song count**

Change line 692 from:
```typescript
                    <span style={{ fontWeight: 600 }}>{flattenedSongs.filter(song => streamChannelMap.get(song.streamId || '') === s.channelId).length} Songs</span>
```
to:
```typescript
                    <span style={{ fontWeight: 600 }}>
                      {loadedChannels.has(s.channelId)
                        ? `${flattenedSongs.filter(song => streamChannelMap.get(song.streamId || '') === s.channelId).length} Songs`
                        : `${streams.filter(st => st.channelId === s.channelId).length} Streams`
                      }
                    </span>
```

- [ ] **Step 2: Add landing state and loading state inside the song list container**

At line 1323, inside `<div className="px-4 pb-32 mt-2">`, before the existing `{loadError ? (` conditional (line 1324), insert:

```tsx
            {/* Landing state — multi-streamer, no songs loaded yet */}
            {streamersWithSongs.length > 1 && songs.length === 0 && !songsLoading && !loadError && (
              <div className="text-center py-16" data-testid="lazy-load-landing">
                <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500 }}>
                  選擇頻道來瀏覽歌曲
                </p>
                <div className="mt-4 flex justify-center gap-6" style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                  <span>{streamers.length} 位歌手</span>
                  <span>·</span>
                  <span>{streams.length} 場直播</span>
                  {streams.length > 0 && (
                    <>
                      <span>·</span>
                      <span>最近更新 {streams[0].date}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Loading songs for a streamer */}
            {songsLoading && (
              <div className="text-center py-12" data-testid="songs-loading">
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>載入歌曲中...</p>
              </div>
            )}

            {/* Search hint when no songs loaded */}
            {songs.length === 0 && searchTerm !== '' && !songsLoading && !loadError && (
              <div className="text-center py-12">
                <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>選擇頻道以搜尋歌曲</p>
              </div>
            )}
```

- [ ] **Step 3: Verify TypeScript compiles and dev server renders correctly**

Run: `npx tsc --noEmit`
Then visually check `http://localhost:3000` in the browser.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add landing state UI with stats, loading indicator, and search hint"
```

---

### Task 6: E2E Tests

**Files:**
- Create: `tests/streamer-lazy-load.spec.ts`

- [ ] **Step 1: Write E2E test file with all 5 test cases**

```typescript
/**
 * E2E: Streamer lazy load — songs load per-streamer on demand
 *
 * Note: Tests 1-4 require multiple streamers in the DB.
 * Test 5 covers single-streamer auto-load.
 * If only 1 streamer exists, tests 1-4 will be skipped.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('streamer lazy load', () => {
  test('1: multi-streamer — no songs loaded on mount', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(BASE_URL);
    await expect(page.locator('header h1').first()).toBeVisible({ timeout: 15000 });

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    // Landing state should show prompt
    await expect(page.getByTestId('lazy-load-landing')).toBeVisible({ timeout: 5000 });
    // Song list should NOT be populated
    const songCount = await page.locator('[data-testid^="song-row-"]').count();
    expect(songCount).toBe(0);
    await page.screenshot({ path: 'test-results/lazy-load-01-landing.png' });
  });

  test('2: click streamer — songs load', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(BASE_URL);
    await expect(page.locator('header h1').first()).toBeVisible({ timeout: 15000 });

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    // Click first streamer button (not "All")
    const firstStreamer = streamerSwitcher.locator('button').nth(1); // nth(0) is "All"
    await firstStreamer.click();

    // Loading indicator may appear briefly
    await expect(page.getByTestId('songs-loading')).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Wait for songs to render
    await page.waitForTimeout(3000);
    const songRows = page.locator('[data-testid^="song-row-"]');
    const count = await songRows.count();
    expect(count).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/lazy-load-02-songs-loaded.png' });
  });

  test('3: multi-select — accumulate songs', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(BASE_URL);
    await expect(page.locator('header h1').first()).toBeVisible({ timeout: 15000 });

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    const buttons = streamerSwitcher.locator('button');
    const btnCount = await buttons.count();
    if (btnCount < 3) { test.skip(); return; } // Need at least 2 streamers + "All"

    // Click first streamer
    await buttons.nth(1).click();
    await page.waitForTimeout(3000);
    const countAfterFirst = await page.locator('[data-testid^="song-row-"]').count();

    // Click second streamer (multi-select)
    await buttons.nth(2).click();
    await page.waitForTimeout(3000);
    const countAfterSecond = await page.locator('[data-testid^="song-row-"]').count();

    // Total should have increased (or at least stayed same if streamer B has no unique songs)
    expect(countAfterSecond).toBeGreaterThanOrEqual(countAfterFirst);
    await page.screenshot({ path: 'test-results/lazy-load-03-multi-select.png' });
  });

  test('4: deselect all — return to landing', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(BASE_URL);
    await expect(page.locator('header h1').first()).toBeVisible({ timeout: 15000 });

    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);
    if (!hasMultiple) { test.skip(); return; }

    // Click first streamer → songs load
    const buttons = streamerSwitcher.locator('button');
    await buttons.nth(1).click();
    await page.waitForTimeout(3000);
    const countBefore = await page.locator('[data-testid^="song-row-"]').count();
    expect(countBefore).toBeGreaterThan(0);

    // Click "All" to deselect
    await page.getByTestId('streamer-filter-all').click();
    await page.waitForTimeout(500);

    // Songs should still be visible (accumulated in memory, "All" shows everything)
    const countAfterAll = await page.locator('[data-testid^="song-row-"]').count();
    expect(countAfterAll).toBeGreaterThanOrEqual(countBefore);

    await page.screenshot({ path: 'test-results/lazy-load-04-deselect-all.png' });
  });

  test('5: single streamer — auto-load', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(BASE_URL);
    await expect(page.locator('header h1').first()).toBeVisible({ timeout: 15000 });

    // If streamer switcher is NOT visible, there's only 1 streamer → auto-load
    const streamerSwitcher = page.getByTestId('streamer-switcher');
    const hasMultiple = await streamerSwitcher.isVisible().catch(() => false);

    if (hasMultiple) {
      // Multi-streamer env — this test is about single streamer
      // We can still verify by checking the auto-load behavior isn't triggered
      test.skip();
      return;
    }

    // Single streamer: songs should auto-load without user interaction
    const songRows = page.locator('[data-testid^="song-row-"]');
    await expect(songRows.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'test-results/lazy-load-05-single-auto.png' });
  });
});
```

Note: The `data-testid` selectors for song rows (e.g., `song-row-*`) may need adjusting based on actual testids in the rendered song list. Check `app/page.tsx` for the correct pattern during implementation.

- [ ] **Step 2: Run the tests**

Run: `npx playwright test tests/streamer-lazy-load.spec.ts --project=chromium`
Expected: Tests matching the current DB state PASS; tests requiring missing conditions SKIP.

- [ ] **Step 3: Commit**

```bash
git add tests/streamer-lazy-load.spec.ts
git commit -m "test: add 5 E2E tests for streamer lazy load"
```

---

### Task 7: Visual Verification and Video Export

**Files:**
- Export: `test-results/*.webm` → `videos/`

- [ ] **Step 1: Run E2E tests with video recording**

Run: `npx playwright test tests/streamer-lazy-load.spec.ts --project=chromium`

- [ ] **Step 2: Copy video to videos directory**

```bash
cp test-results/streamer-lazy-load-*/video.webm videos/e2e-streamer-lazy-load.webm 2>/dev/null || cp test-results/*/video.webm videos/e2e-streamer-lazy-load.webm
```

- [ ] **Step 3: Visual verification with Gemini CLI**

Use `/verify-video videos/e2e-streamer-lazy-load.webm — Streamer lazy load. Expected: 1) Fan page loads with hero carousel visible, 2) If multi-streamer: landing state shows "選擇頻道來瀏覽歌曲" with stats (stream count, streamer count, latest date), 3) After clicking streamer button: loading indicator "載入歌曲中..." appears briefly, then songs render in the list, 4) Clicking a second streamer adds more songs (accumulated), 5) Clicking "All" keeps all loaded songs visible. If single streamer: songs auto-load on mount without user interaction.`

- [ ] **Step 4: Send video and verification result to user via Discord**

Attach the `.webm` file and Gemini's PASS/FAIL analysis.

- [ ] **Step 5: Final commit**

```bash
git add videos/e2e-streamer-lazy-load.webm
git commit -m "test: add lazy load E2E video recording"
```
