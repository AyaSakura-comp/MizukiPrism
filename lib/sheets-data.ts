import { fetchSheet } from './sheets';
import type { Song, Performance, Stream, SongMetadata, SongLyrics } from './types';

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
      streamTitle: '',
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
  artistInfo: never[];
}> {
  const metaRows = await fetchSheet('Metadata');
  const songMetadata: SongMetadata[] = metaRows.map((row) => ({
    songId: row.songId,
    fetchStatus: (row.fetchStatus as SongMetadata['fetchStatus']) || 'no_match',
    matchConfidence: (row.matchConfidence as SongMetadata['matchConfidence']) || null,
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

  return { songMetadata, artistInfo: [] };
}

/** Load lyrics from sheet (lazy-loaded) */
export async function loadLyricsFromSheet(): Promise<SongLyrics[]> {
  const rows = await fetchSheet('Lyrics');
  return rows.map((row) => ({
    songId: row.songId,
    fetchStatus: (row.fetchStatus as SongLyrics['fetchStatus']) || 'no_match',
    syncedLyrics: row.syncedLyrics || undefined,
    plainLyrics: row.plainLyrics || undefined,
    fetchedAt: row.fetchedAt || '',
    lastError: row.lastError || undefined,
  }));
}
