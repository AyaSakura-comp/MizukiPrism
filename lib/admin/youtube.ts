'use server';
// YouTube video info and comment fetching via innertube API (no API key needed)

export interface VideoInfo {
  videoId: string;
  title: string;
  date: string;        // YYYY-MM-DD
  description: string;
  durationSeconds: number;
}

export interface Comment {
  cid: string;
  author: string;
  authorUrl?: string;
  text: string;
  votes: string;
  isPinned: boolean;
}

// ---------------------------------------------------------------------------
// Video ID extraction
// ---------------------------------------------------------------------------

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Bare video ID
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);

    // youtube.com/watch?v=ID
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && VIDEO_ID_RE.test(v)) return v;

      // youtube.com/embed/ID
      const embedMatch = url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    }

    // youtu.be/ID
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      if (VIDEO_ID_RE.test(id)) return id;
    }
  } catch {
    // Not a URL
  }

  return null;
}

// ---------------------------------------------------------------------------
// YouTube page fetching
// ---------------------------------------------------------------------------

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20240101.00.00',
  hl: 'zh-TW',
  gl: 'TW',
};

/**
 * Fetch a YouTube video page and extract the embedded ytInitialData JSON.
 * Runs server-side only (uses Node.js fetch, no CORS restrictions).
 */
export async function fetchVideoPage(videoId: string): Promise<Record<string, unknown>> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });
  const html = await res.text();
  return parseYtInitialData(html);
}

/**
 * Extract ytInitialData JSON from YouTube HTML page.
 */
export function parseYtInitialData(html: string): Record<string, unknown> {
  const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s)
    || html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!match) throw new Error('YouTube data structure changed. Please use the manual paste text method.');
  return JSON.parse(match[1]);
}

/**
 * Parse ytInitialPlayerResponse into VideoInfo.
 */
export function parseVideoInfo(data: Record<string, unknown>): VideoInfo {
  const details = (data as any).videoDetails || {};
  const microformat = (data as any).microformat?.playerMicroformatRenderer || {};

  const rawDate = microformat.uploadDate || microformat.publishDate || '';
  const date = rawDate.slice(0, 10); // YYYY-MM-DD

  return {
    videoId: details.videoId || '',
    title: details.title || '',
    date,
    description: details.shortDescription || '',
    durationSeconds: parseInt(details.lengthSeconds || '0', 10),
  };
}

// ---------------------------------------------------------------------------
// Comment fetching via innertube API
// ---------------------------------------------------------------------------

/**
 * Fetch comments for a video using YouTube's innertube next endpoint.
 * Returns up to ~20 top comments (first page, sorted by popularity).
 */
export async function fetchComments(videoId: string): Promise<Comment[]> {
  // Step 1: Get the comment section continuation token from the video page
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
  });
  const html = await pageRes.text();

  // Find ytInitialData (not player response — the page data)
  const dataMatch = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script/s)
    || html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script/s);
  if (!dataMatch) return [];

  const pageData = JSON.parse(dataMatch[1]);

  // Navigate to comment section continuation token
  const token = findCommentContinuationToken(pageData);
  if (!token) return [];

  // Step 2: Fetch comments via innertube next endpoint
  const nextRes = await fetch(
    `https://www.youtube.com/youtubei/v1/next?key=${INNERTUBE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: INNERTUBE_CLIENT },
        continuation: token,
      }),
    }
  );
  const nextData = await nextRes.json();
  return parseComments(nextData);
}

/**
 * Navigate ytInitialData to find the comment section continuation token.
 */
function findCommentContinuationToken(data: any): string | null {
  try {
    const tabs = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
    for (const item of tabs) {
      const section = item?.itemSectionRenderer;
      if (!section) continue;
      const continuations = section.contents?.[0]?.continuationItemRenderer?.continuationEndpoint
        ?.continuationCommand?.token;
      if (continuations) return continuations;
    }
  } catch {
    // Structure mismatch
  }
  return null;
}

/**
 * Parse innertube comment continuation response into Comment objects.
 */
export function parseComments(data: any): Comment[] {
  const comments: Comment[] = [];

  const endpoints = data?.onResponseReceivedEndpoints || [];
  for (const endpoint of endpoints) {
    const items =
      endpoint?.reloadContinuationItemsCommand?.continuationItems ||
      endpoint?.appendContinuationItemsAction?.continuationItems ||
      [];

    for (const item of items) {
      const thread = item?.commentThreadRenderer;
      if (!thread) continue;

      const renderer = thread?.comment?.commentRenderer;
      if (!renderer) continue;

      const text = (renderer.contentText?.runs || [])
        .map((r: any) => r.text || '')
        .join('');

      comments.push({
        cid: renderer.commentId || '',
        author: renderer.authorText?.simpleText || '',
        authorUrl: renderer.authorEndpoint?.browseEndpoint?.browseId || undefined,
        text,
        votes: renderer.voteCount?.simpleText || '0',
        isPinned: !!renderer.pinnedCommentBadge,
      });
    }
  }

  return comments;
}

// ---------------------------------------------------------------------------
// Channel video listing (RSS feed — last 15 videos)
// ---------------------------------------------------------------------------

export interface ChannelVideo {
  videoId: string;
  title: string;
  publishedAt: string; // ISO date
}

/**
 * Fetch recent videos from a YouTube channel via RSS feed.
 * Returns up to 15 most recent videos (YouTube RSS limit).
 */
export async function fetchChannelVideos(channelId: string): Promise<ChannelVideo[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(feedUrl);
  const xml = await res.text();
  return parseChannelFeed(xml);
}

/**
 * Parse YouTube RSS XML feed into ChannelVideo objects.
 */
export function parseChannelFeed(xml: string): ChannelVideo[] {
  const videos: ChannelVideo[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRe.exec(xml)) !== null) {
    const entry = match[1];
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || '';
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1] || '';
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || '';

    if (videoId) {
      videos.push({
        videoId,
        title: decodeXmlEntities(title),
        publishedAt: published.slice(0, 10), // YYYY-MM-DD
      });
    }
  }

  return videos;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
