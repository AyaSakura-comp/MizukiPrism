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
