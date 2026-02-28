// app/api/admin/discover/route.ts
// Fetch video info from YouTube by URL or video ID

import { NextRequest, NextResponse } from 'next/server';
import { extractVideoId, fetchVideoPage, parseVideoInfo } from '@/lib/admin/youtube';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const pageData = await fetchVideoPage(videoId);
    const videoInfo = parseVideoInfo(pageData);

    return NextResponse.json(videoInfo);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch video info: ${err}` },
      { status: 500 }
    );
  }
}
