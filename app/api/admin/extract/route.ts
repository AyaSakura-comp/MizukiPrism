// app/api/admin/extract/route.ts
// Extract song timestamps from YouTube comments or pasted text

import { NextRequest, NextResponse } from 'next/server';
import { fetchComments } from '@/lib/admin/youtube';
import { findCandidateComment, parseTextToSongs, enrichMissingEndTimestamps } from '@/lib/admin/extraction';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { videoId, text } = await request.json();

    // Mode 1: Extract from pasted text
    if (text) {
      let songs = parseTextToSongs(text);
      songs = await enrichMissingEndTimestamps(songs);
      return NextResponse.json({
        source: 'text',
        songs,
        rawText: text,
      });
    }

    // Mode 2: Auto-extract from YouTube comments
    if (!videoId) {
      return NextResponse.json({ error: 'videoId or text is required' }, { status: 400 });
    }

    const comments = await fetchComments(videoId);
    const candidate = findCandidateComment(comments);

    if (!candidate) {
      return NextResponse.json({
        source: null,
        songs: [],
        message: 'No comment with >= 3 timestamps found. Try pasting text manually.',
        commentsChecked: comments.length,
      });
    }

    let songs = parseTextToSongs(candidate.text);
    songs = await enrichMissingEndTimestamps(songs);
    return NextResponse.json({
      source: 'comment',
      songs,
      rawText: candidate.text,
      commentAuthor: candidate.author,
      commentAuthorUrl: candidate.authorUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Extraction failed: ${err}` },
      { status: 500 }
    );
  }
}
