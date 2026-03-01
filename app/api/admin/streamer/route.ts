// app/api/admin/streamer/route.ts
// Fetch channel profile from YouTube and optionally save to streamer.json

import { NextRequest, NextResponse } from 'next/server';
import { fetchChannelProfile } from '@/lib/admin/youtube';
import { addStreamer, readStreamers, findStreamerByChannelId } from '@/lib/admin/data-writer';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// GET: Check if a streamer exists
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  const streamers = readStreamers(DATA_DIR);
  const streamer = findStreamerByChannelId(streamers, channelId);
  return NextResponse.json({ exists: !!streamer, streamer });
}

// POST: Fetch profile from YouTube and/or save streamer
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { channelId, action } = body;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    // Action: fetch — scrape YouTube channel page for profile
    if (action === 'fetch') {
      const profile = await fetchChannelProfile(channelId);
      return NextResponse.json(profile);
    }

    // Action: save — save curator-approved profile to streamer.json
    if (action === 'save') {
      const { handle, displayName, avatarUrl, description, socialLinks } = body;
      addStreamer(DATA_DIR, {
        channelId,
        handle: handle || '',
        displayName: displayName || '',
        avatarUrl: avatarUrl || '',
        description: description || '',
        socialLinks: socialLinks || {},
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action. Use "fetch" or "save".' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: `Streamer operation failed: ${err}` },
      { status: 500 }
    );
  }
}
