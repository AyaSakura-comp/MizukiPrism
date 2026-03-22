# Streamer Lazy Load Design

## Problem

The fan-facing homepage (`app/page.tsx`) loads all songs, performances, streams, streamers, and metadata on mount — 4 simultaneous Supabase API calls. As the catalog grows with multiple streamers, this becomes unnecessarily heavy. Users typically care about one streamer at a time.

## Design

### Behavior

1. **On mount**: Load `streamers`, `streams`, and `metadata` (all lightweight, full table). Do NOT load songs/performances.
2. **Single streamer**: Auto-load that streamer's songs immediately (same UX as today).
3. **Multiple streamers**: Show streamer cards + hero carousel + summary stats (total streams, total streamers, latest update date). Song list area shows a prompt: "選擇頻道來瀏覽歌曲".
4. **On streamer click**: Fetch that streamer's performances + songs from Supabase. Accumulate in memory.
5. **Multi-select**: Already-loaded streamers display from cache. Unloaded streamers trigger a fetch. All filtering is in-memory.

### Data Flow

```
Mount
  → loadStreamers()      (full table, small)
  → loadStreams()         (full table, moderate)
  → loadMetadata()       (full table, moderate — album art URLs only)
  ↓
Single streamer?
  → YES: auto-call loadSongsByChannel(channelId)
  → NO:  show streamer cards + stats, wait for selection
  ↓
User clicks streamer
  → Is channelId in loadedChannels set?
    → YES: skip fetch, filter in-memory
    → NO:  loadSongsByChannel(channelId), add to songs state, mark as loaded
  ↓
Filter/search
  → All in-memory (unchanged from current behavior)
```

### New Function: `loadSongsByChannel(channelId: string)`

Location: `lib/supabase-data.ts`

```typescript
export async function loadSongsByChannel(channelId: string): Promise<Song[]> {
  // Step 1: Get stream IDs for this channel
  const { data: streamRows } = await supabase
    .from('streams')
    .select('id')
    .eq('channel_id', channelId);
  const streamIds = (streamRows ?? []).map(r => r.id);
  if (streamIds.length === 0) return [];

  // Step 2: Fetch performances in batches of 50 stream IDs
  // (Supabase .in() has URL length limits with large arrays)
  const allPerformances: any[] = [];
  for (let i = 0; i < streamIds.length; i += 50) {
    const batch = streamIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from('performances')
      .select(`id, stream_id, date, stream_title, video_id, timestamp_sec, end_timestamp_sec, note,
               songs (id, title, original_artist, tags)`)
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
        id: song.id, title: song.title,
        originalArtist: song.original_artist, tags: song.tags ?? [],
        performances: [],
      });
    }
    songMap.get(song.id)!.performances.push({
      id: row.id, streamId: row.stream_id,
      date: row.date, streamTitle: row.stream_title ?? '',
      videoId: row.video_id, timestamp: row.timestamp_sec,
      endTimestamp: row.end_timestamp_sec ?? null, note: row.note ?? '',
    });
  }
  return Array.from(songMap.values());
}
```

### State Changes in `app/page.tsx`

New state:
- `loadedChannels: Set<string>` — tracks which streamer channel IDs have been fetched
- `songsLoading: boolean` — loading indicator when fetching a streamer's songs

Modified behavior:
- `useEffect` on mount: no longer calls `loadSongs()`. Instead, after `loadStreamers()` resolves, checks if single streamer → auto-load.
- `selectedStreamers` change handler: for each newly selected streamer, if not in `loadedChannels`, call `loadSongsByChannel()`, merge results into `songs` state, add to `loadedChannels`.
- Songs state accumulates across streamer selections.

#### Song Merge Logic

When `loadSongsByChannel()` returns new songs, merge into existing `songs` state:

```typescript
function mergeSongs(existing: Song[], incoming: Song[]): Song[] {
  const map = new Map<string, Song>();
  // Add all existing songs
  for (const s of existing) map.set(s.id, { ...s });
  // Merge incoming
  for (const s of incoming) {
    if (map.has(s.id)) {
      // Song exists — append new performances (deduplicate by performance ID)
      const existingPerfIds = new Set(map.get(s.id)!.performances.map(p => p.id));
      const newPerfs = s.performances.filter(p => !existingPerfIds.has(p.id));
      map.get(s.id)!.performances.push(...newPerfs);
    } else {
      map.set(s.id, { ...s });
    }
  }
  return Array.from(map.values());
}
```

#### Streamer Buttons (fixing chicken-and-egg problem)

Current `streamersWithSongs` memo derives visible streamers from loaded songs — this breaks with lazy loading since songs are empty before selection.

**Fix**: Derive "streamers with songs" from the `streams` table instead. Any streamer that has at least one stream is shown. Since `streams` is fully loaded on mount, this works immediately:

```typescript
const streamersWithSongs = useMemo(() => {
  const channelIdsWithStreams = new Set(
    streams.map(s => (s as any).channelId).filter(Boolean)
  );
  return streamers.filter(s => channelIdsWithStreams.has(s.channelId));
}, [streamers, streams]);
```

Also fix the `streams` state type to properly include `channelId` instead of using `as any` casts.

#### Hero Carousel Song Count

Before a streamer's songs are loaded, the hero carousel shows **stream count** instead of song count. Once loaded, it switches to the actual song count:

```typescript
const songCount = loadedChannels.has(s.channelId)
  ? flattenedSongs.filter(song => streamChannelMap.get(song.streamId || '') === s.channelId).length
  : streams.filter(st => st.channelId === s.channelId).length; // stream count fallback
const countLabel = loadedChannels.has(s.channelId) ? 'Songs' : 'Streams';
```

### Loading & Error States

**Loading UI**: When `songsLoading` is true, show a centered spinner/text below the streamer cards: "載入歌曲中...". The `songsLoading` state is global (not per-streamer) since only one fetch happens at a time.

**Error handling**: If `loadSongsByChannel()` fails:
- Show an error message in the song list area: "載入失敗，請重試"
- Include a retry button that re-calls `loadSongsByChannel()` for the failed channel
- Do NOT add the channel to `loadedChannels` on failure
- Use existing `loadError` pattern from the current codebase

### Summary Stats Component

When no streamer is selected (multi-streamer mode, before any selection):
- Total streams count (from `streams.length`)
- Total streamers count (from `streamers.length`)
- Latest stream date (from `streams[0].date`, already sorted newest-first)
- All derived from already-loaded data — no extra API call needed.

Note: "Total songs" is intentionally excluded — it would require loading all songs or a separate count query, defeating the purpose of lazy loading.

### Search with No Streamer Selected

When searching with no loaded songs, show a hint: "選擇頻道以搜尋歌曲". If songs are loaded (from previously selected streamers), search across all loaded songs as usual.

### What Doesn't Change

- Search, year, stream, artist filter logic (all in-memory)
- `loadMetadata()` — still full table on mount
- `loadStreams()` — still full table on mount
- `loadStreamers()` — still full table on mount
- Player, queue, playlist, liked songs, recently played
- Album art merge logic (metadata map applied when songs load)
- Supabase schema — no changes needed

### Edge Cases

- **Song shared across streamers**: Handled by `mergeSongs()` — deduplicates by performance ID, appends new performances to existing song entries.
- **Deselecting all streamers**: Shows the streamer cards + stats again. Already-loaded songs remain in memory for instant re-display.
- **Supabase `.in()` with many stream IDs**: Batched in groups of 50 to avoid URL length limits.
- **Streams state type**: Fix to include `channelId` properly (currently uses `as any` cast).
