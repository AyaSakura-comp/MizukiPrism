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
