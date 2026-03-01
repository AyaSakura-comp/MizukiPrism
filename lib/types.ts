export interface Performance {
  id: string;
  streamId: string;
  date: string;
  streamTitle: string;
  videoId: string;
  timestamp: number;
  endTimestamp: number | null;
  note: string;
}

export interface Song {
  id: string;
  title: string;
  originalArtist: string;
  tags: string[];
  performances: Performance[];
}

export interface Stream {
  id: string;
  channelId?: string;
  title: string;
  date: string;
  videoId: string;
  youtubeUrl: string;
}

export interface Streamer {
  channelId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  description: string;
  socialLinks: Record<string, string>;
}

export interface SongMetadata {
  songId: string;
  fetchStatus: 'matched' | 'no_match' | 'error' | 'manual';
  matchConfidence: 'exact' | 'fuzzy' | 'manual' | null;
  albumArtUrl?: string;
  albumArtUrls?: {
    small: string;
    medium: string;
    big: string;
    xl: string;
  };
  albumTitle?: string;
  deezerTrackId?: number;    // Legacy (Deezer matches)
  deezerArtistId?: number;   // Legacy (Deezer matches)
  itunesTrackId?: number;
  itunesCollectionId?: number;
  trackDuration?: number;
  fetchedAt: string;
  lastError?: string;
}

export interface SongLyrics {
  songId: string;
  fetchStatus: 'matched' | 'no_match' | 'error' | 'manual';
  syncedLyrics?: string;
  plainLyrics?: string;
  fetchedAt: string;
  lastError?: string;
}

export interface ArtistInfo {
  normalizedArtist: string;
  originalName: string;
  deezerArtistId?: number;   // Legacy (Deezer matches)
  itunesArtistId?: number;
  pictureUrls?: {
    medium: string;
    big: string;
    xl: string;
  };
  fetchedAt: string;
}

export interface LyricLine {
  time: number;
  text: string;
}
