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
    const { videoId, title, date, youtubeUrl, channelId, songs, credit } = body;

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
      channelId,
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
