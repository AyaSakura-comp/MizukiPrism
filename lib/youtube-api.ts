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

export type ChannelInput =
  | { type: 'id'; value: string }
  | { type: 'handle'; value: string };

/** Parse a YouTube channel URL into a channel input descriptor */
export function extractChannelInput(url: string): ChannelInput | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== 'www.youtube.com' && u.hostname !== 'youtube.com') return null;
    const channelMatch = u.pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };
    const handleMatch = u.pathname.match(/^\/@([\w.-]+)\/?$/);
    if (handleMatch) return { type: 'handle', value: handleMatch[1] };
    return null;
  } catch {
    return null;
  }
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

export const KARAOKE_KEYWORDS = [
  // Japanese
  '歌回', '歌枠', 'カラオケ', '歌ってみた', '歌配信',
  // Chinese
  '卡拉OK', '唱歌', '翻唱',
  // English (only 'karaoke' to avoid false positives)
  'karaoke',
];

export interface ChannelVideo {
  videoId: string;
  title: string;
  date: string;       // YYYY-MM-DD from snippet.publishedAt
  thumbnailUrl: string;
}

export interface ChannelUploadsResult {
  channel: ChannelInfo;
  videos: ChannelVideo[];
  partialError?: string;
}

/**
 * Fetch all uploads from a channel and filter by karaoke keywords.
 * Does NOT reuse fetchChannelInfo — needs contentDetails,snippet in one call.
 */
export async function fetchChannelUploads(
  input: ChannelInput,
  onProgress: (page: number) => void,
  maxPages = 5,
  keywords: string[] = KARAOKE_KEYWORDS,
): Promise<ChannelUploadsResult> {
  // Step 1: Resolve channel → uploadsPlaylistId + channel info
  const idParam = input.type === 'id' ? `id=${input.value}` : `forHandle=${input.value}`;
  const channelUrl = `${YT_BASE}/channels?part=contentDetails,snippet&${idParam}&key=${GOOGLE_API_KEY}`;
  const channelRes = await fetch(channelUrl);
  if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);
  const channelData = await channelRes.json();
  if (!channelData.items?.length) throw new Error('找不到此頻道');

  const item = channelData.items[0];
  const snippet = item.snippet;
  const uploadsPlaylistId: string = item.contentDetails.relatedPlaylists.uploads;
  // item.id is always present in channels API response regardless of parts requested
  const channel: ChannelInfo = {
    channelId: item.id ?? input.value,
    handle: snippet.customUrl || '',
    displayName: snippet.title,
    avatarUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    description: snippet.description || '',
  };

  // Step 2: Paginate uploads playlist, filter by keywords
  const videos: ChannelVideo[] = [];
  let pageToken: string | undefined;
  let page = 0;
  let partialError: string | undefined;

  while (page < maxPages) {
    onProgress(page + 1);
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    const listUrl = `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50${tokenParam}&key=${GOOGLE_API_KEY}`;
    try {
      const listRes = await fetch(listUrl);
      if (!listRes.ok) throw new Error(`YouTube API error: ${listRes.status}`);
      const listData = await listRes.json();

      for (const vi of (listData.items || [])) {
        const s = vi.snippet;
        const title: string = s.title || '';
        const lower = title.toLowerCase();
        if (keywords.some(k => lower.includes(k.toLowerCase()))) {
          videos.push({
            videoId: s.resourceId?.videoId || '',
            title,
            date: (s.publishedAt || '').slice(0, 10),
            thumbnailUrl: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
          });
        }
      }

      pageToken = listData.nextPageToken;
      page++;
      if (!pageToken) break;
    } catch (err) {
      partialError = String(err);
      break;
    }
  }

  // Sort newest-first
  videos.sort((a, b) => b.date.localeCompare(a.date));
  return { channel, videos, ...(partialError ? { partialError } : {}) };
}
