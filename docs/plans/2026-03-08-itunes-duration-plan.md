# iTunes Duration Detection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace MusicBrainz with iTunes as primary duration API in the discover page, with MusicBrainz fallback and provenance tags.

**Architecture:** Add `fetchItunesDuration()` to `lib/supabase-admin.ts` (simplified version of existing `fetchItunesMetadata` in `lib/admin/metadata.ts`). Update discover page's extraction loop to try iTunes first → MusicBrainz fallback. Add `durationSource` field to `ExtractedSong` interface and render colored provenance badges in the review table.

**Tech Stack:** iTunes Search API, MusicBrainz API, React, Tailwind CSS

---

### Task 1: Add `fetchItunesDuration()` to supabase-admin.ts

**Files:**
- Modify: `lib/supabase-admin.ts:98-116` (after MusicBrainz function)

**Step 1: Add the function after `fetchMusicBrainzDuration`**

Insert after line 116 (closing brace of `fetchMusicBrainzDuration`), before the `importStreamWithSongs` comment:

```typescript
// ---- iTunes Duration (browser-safe, CORS-friendly, no API key) ----

let lastItunesCallTime = 0;
const ITUNES_RATE_LIMIT_MS = 3000;

export async function fetchItunesDuration(artist: string, title: string): Promise<number | null> {
  try {
    // Rate limit: 3s between calls
    const elapsed = Date.now() - lastItunesCallTime;
    if (elapsed < ITUNES_RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, ITUNES_RATE_LIMIT_MS - elapsed));
    }
    lastItunesCallTime = Date.now();

    const params = new URLSearchParams({
      term: `${artist} ${title}`,
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
        return Math.round(r.trackTimeMillis / 1000);
      }
    }
    return null;
  } catch {
    return null;
  }
}
```

**Step 2: Verify it compiles**

Run: `cd /home/chihmin/MizukiPrism && npx tsc --noEmit lib/supabase-admin.ts 2>&1 | head -20`

If tsc doesn't work standalone, run: `npm run lint`

Expected: No new errors.

**Step 3: Commit**

```bash
git add lib/supabase-admin.ts
git commit -m "feat: add fetchItunesDuration for discover page duration detection"
```

---

### Task 2: Add `durationSource` to `ExtractedSong` interface

**Files:**
- Modify: `app/admin/discover/page.tsx:26-35`

**Step 1: Add the field to the interface**

Change the `ExtractedSong` interface (line 26-35) to add `durationSource`:

```typescript
interface ExtractedSong {
  orderIndex: number;
  songName: string;
  artist: string;
  startSeconds: number;
  endSeconds: number | null;
  startTimestamp: string;
  endTimestamp: string | null;
  suspicious: boolean;
  durationSource: 'iTunes' | 'MusicBrainz' | 'comment' | 'none';
}
```

**Step 2: No commit yet — continue to Task 3**

---

### Task 3: Update extraction loop to use iTunes → MusicBrainz fallback

**Files:**
- Modify: `app/admin/discover/page.tsx:9` (import)
- Modify: `app/admin/discover/page.tsx:141-181` (`handleExtract` function)

**Step 1: Update import to include `fetchItunesDuration`**

Change line 9 from:
```typescript
import { isAuthenticated, importStreamWithSongs, saveStreamer, fetchMusicBrainzDuration } from '@/lib/supabase-admin';
```
To:
```typescript
import { isAuthenticated, importStreamWithSongs, saveStreamer, fetchItunesDuration, fetchMusicBrainzDuration } from '@/lib/supabase-admin';
```

**Step 2: Replace the duration enrichment loop in `handleExtract`**

Replace lines 154-168 (inside `handleExtract`, the `if (candidate)` block) with:

```typescript
      if (candidate) {
        let parsed = parseTextToSongs(stripHtml(candidate.text));
        // Tag songs that already have end timestamps from the comment
        parsed = parsed.map(s => ({
          ...s,
          durationSource: s.endSeconds !== null ? 'comment' : 'none',
        })) as any[];
        // Enrich missing end timestamps: iTunes primary, MusicBrainz fallback
        for (let i = 0; i < parsed.length; i++) {
          const s = parsed[i] as any;
          if (s.durationSource === 'comment') continue;
          // Try iTunes first (3s rate limit built into fetchItunesDuration)
          const itunesDur = await fetchItunesDuration(s.artist, s.songName);
          if (itunesDur) {
            parsed[i] = { ...s, endSeconds: s.startSeconds + itunesDur, endTimestamp: secondsToTimestamp(s.startSeconds + itunesDur), durationSource: 'iTunes' };
            continue;
          }
          // Fallback to MusicBrainz (1.1s rate limit)
          await new Promise(r => setTimeout(r, 1100));
          const mbDur = await fetchMusicBrainzDuration(s.artist, s.songName);
          if (mbDur) {
            parsed[i] = { ...s, endSeconds: s.startSeconds + mbDur, endTimestamp: secondsToTimestamp(s.startSeconds + mbDur), durationSource: 'MusicBrainz' };
          } else if (i === parsed.length - 1 && videoDurationSeconds) {
            // Last song fallback: use video end time
            parsed[i] = { ...s, endSeconds: videoDurationSeconds, endTimestamp: secondsToTimestamp(videoDurationSeconds), durationSource: 'none' };
          }
        }
        setSongs(parsed as any[]);
        setExtractionSource('comment');
        setCommentAuthor(candidate.author ?? null);
        setStep('review');
```

**Step 3: No commit yet — continue to Task 4**

---

### Task 4: Render provenance badges in the song review table

**Files:**
- Modify: `app/admin/discover/page.tsx:496-528` (song list rendering)

**Step 1: Add a badge helper function**

Add this inside the `DiscoverPage` component (before the `return` statement, e.g., after `removeSong` at line ~283):

```typescript
  function durationBadge(source: ExtractedSong['durationSource']) {
    const styles: Record<string, string> = {
      iTunes: 'bg-blue-100 text-blue-700',
      MusicBrainz: 'bg-purple-100 text-purple-700',
      comment: 'bg-green-100 text-green-700',
      none: 'bg-gray-100 text-gray-500',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[source] || styles.none}`}>
        {source}
      </span>
    );
  }
```

**Step 2: Render the badge next to the end timestamp input**

In the song list (around line 506-512), find the end timestamp input and add the badge after it. Change from:

```tsx
                      <input
                        data-testid={`end-timestamp-input-${i}`}
                        value={song.endTimestamp || ''}
                        onChange={(e) => updateSong(i, 'endTimestamp', e.target.value)}
                        placeholder="結束"
                        className="w-16 px-1 py-1 bg-white/50 border border-gray-200 rounded hover:border-gray-300 focus:border-pink-400 focus:outline-none text-sm font-mono text-gray-900 font-bold"
                      />
```

To:

```tsx
                      <input
                        data-testid={`end-timestamp-input-${i}`}
                        value={song.endTimestamp || ''}
                        onChange={(e) => updateSong(i, 'endTimestamp', e.target.value)}
                        placeholder="結束"
                        className="w-16 px-1 py-1 bg-white/50 border border-gray-200 rounded hover:border-gray-300 focus:border-pink-400 focus:outline-none text-sm font-mono text-gray-900 font-bold"
                      />
                      {durationBadge(song.durationSource)}
```

**Step 3: Verify it compiles and lint passes**

Run: `npm run lint`
Expected: No new errors.

**Step 4: Commit**

```bash
git add app/admin/discover/page.tsx
git commit -m "feat: use iTunes API for duration detection with MusicBrainz fallback and provenance tags"
```

---

### Task 5: Manual test with a real YouTube URL

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Navigate to discover page**

Go to `http://localhost:3000/admin/login` → login with `mizuki-admin` → navigate to discover.

**Step 3: Test with a known karaoke stream URL**

Paste a YouTube karaoke stream URL (e.g., one already in the database). Observe:
- Songs are extracted from comments
- Duration enrichment runs (progress should show which API is being tried)
- In the review table, each song shows a colored badge: `iTunes` (blue), `MusicBrainz` (purple), `comment` (green), or `none` (gray)
- End timestamps are populated where the API found durations

**Step 4: Verify badge rendering**

- Songs with timestamps from the comment itself → green `comment` badge
- Songs where iTunes found duration → blue `iTunes` badge
- Songs where only MusicBrainz found it → purple `MusicBrainz` badge
- Songs with no duration found → gray `none` badge

---

### Task 6: Final commit and cleanup

**Step 1: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 2: Run unit tests**

Run: `npm run test:unit`
Expected: All existing tests pass (no unit tests for discover page — it's a UI page)

**Step 3: Run build**

Run: `npm run build`
Expected: All routes are `○` (static). No errors.
