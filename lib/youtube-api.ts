import { YOUTUBE_API_KEY as GOOGLE_API_KEY } from './config';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/** Parse ISO 8601 duration (PT1H30M5S) to seconds */
export function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) +
         (parseInt(match[2] || '0') * 60) +
         parseInt(match[3] || '0');
}

export interface VideoInfo {
  videoId: string;
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  durationSeconds: number;
  channelId: string;
  channelName: string;
}

/** Fetch video info (title, date, duration, channel) via YouTube Data API v3 */
export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  const url = `${YT_BASE}/videos?part=snippet,contentDetails&id=${videoId}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error(`Video not found: ${videoId}`);

  const item = data.items[0];
  return {
    videoId,
    title: item.snippet.title,
    date: item.snippet.publishedAt.slice(0, 10),
    description: item.snippet.description,
    durationSeconds: parseIsoDuration(item.contentDetails.duration),
    channelId: item.snippet.channelId,
    channelName: item.snippet.channelTitle,
  };
}

export interface YouTubeComment {
  cid: string;
  author: string;
  authorUrl: string;
  text: string;
  likeCount: number;
  isPinned: boolean;
}

/** Fetch top-level comments for a video */
export async function fetchVideoComments(
  videoId: string,
  maxResults = 20,
): Promise<YouTubeComment[]> {
  const url = `${YT_BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube Comments API error: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map((item: any) => {
    const snippet = item.snippet.topLevelComment.snippet;
    return {
      cid: item.snippet.topLevelComment.id,
      author: snippet.authorDisplayName,
      authorUrl: snippet.authorChannelUrl || '',
      text: snippet.textDisplay,
      likeCount: snippet.likeCount || 0,
      isPinned: false, // Data API v3 doesn't expose pinned status
    };
  });
}

export interface ChannelInfo {
  channelId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  description: string;
}

/** Fetch channel profile info */
export async function fetchChannelInfo(channelId: string): Promise<ChannelInfo> {
  const url = `${YT_BASE}/channels?part=snippet&id=${channelId}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube Channels API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new Error(`Channel not found: ${channelId}`);

  const snippet = data.items[0].snippet;
  return {
    channelId,
    handle: snippet.customUrl || '',
    displayName: snippet.title,
    avatarUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    description: snippet.description || '',
  };
}
