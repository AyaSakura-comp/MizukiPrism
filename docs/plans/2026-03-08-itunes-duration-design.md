# iTunes Duration Detection in Discover Page

## Problem

MusicBrainz has poor hit rate for Japanese songs and VTuber karaoke content. iTunes with `country: "JP"` has much better coverage for this catalog.

## Decision

Replace MusicBrainz as the primary duration API with iTunes in the discover page. Keep MusicBrainz as a fallback. Add provenance tags so the admin can see where each duration came from.

## Design

### New function: `fetchItunesDuration()`

Location: `lib/supabase-admin.ts`

```
fetchItunesDuration(artist: string, title: string): Promise<number | null>
```

- URL: `https://itunes.apple.com/search?term={artist}+{title}&media=music&entity=song&country=JP&limit=5`
- Extracts `trackTimeMillis` from first result, converts to seconds
- 3s rate limit between calls
- Returns `null` on miss or error

### Duration source tracking

Add `durationSource` field to parsed song objects in the discover page. Values:

- `"iTunes"` — duration found via iTunes API
- `"MusicBrainz"` — iTunes missed, MusicBrainz succeeded
- `"comment"` — end timestamp was already in the YouTube comment
- `"none"` — no duration found from any source

UI-only field, not persisted to Supabase.

### Discover page flow

Old:
```
for each song without endSeconds:
  → fetchMusicBrainzDuration(artist, title)
  → if hit, set endSeconds
```

New:
```
for each song without endSeconds:
  → fetchItunesDuration(artist, title)     [3s rate limit]
  → if hit: set endSeconds, tag "iTunes"
  → if miss: fetchMusicBrainzDuration(artist, title)  [1.1s rate limit]
    → if hit: set endSeconds, tag "MusicBrainz"
    → if miss: tag "none"

songs that already had endSeconds from comment → tag "comment"
```

Progress text updates to show which API is being tried.

### Provenance tags in song review table

Small colored badges next to each song's end timestamp:

| Tag | Color | Meaning |
|-----|-------|---------|
| `iTunes` | Blue | Duration from iTunes |
| `MusicBrainz` | Purple | Fallback from MusicBrainz |
| `comment` | Green | Already in the YouTube comment |
| `none` | Gray | No duration found |

Rendered as `<span>` with Tailwind classes. No new components.

## Files changed

| File | Change |
|------|--------|
| `lib/supabase-admin.ts` | Add `fetchItunesDuration()` function |
| `app/admin/discover/page.tsx` | Replace MusicBrainz-only loop with iTunes→MusicBrainz fallback; add `durationSource` tracking; render provenance tags; update progress text |

`fetchMusicBrainzDuration()` remains unchanged — just demoted to fallback.
