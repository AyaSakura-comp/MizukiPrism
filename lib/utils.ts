export function extractVideoId(youtubeUrl: string): string | null {
  const watchMatch = youtubeUrl.match(/youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]+)/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = youtubeUrl.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) return shortMatch[1];
  const liveMatch = youtubeUrl.match(/youtube\.com\/live\/([a-zA-Z0-9_-]+)/);
  if (liveMatch) return liveMatch[1];
  return null;
}

export function validateYoutubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|live\/)|youtu\.be\/)[a-zA-Z0-9_-]+/.test(url);
}

export function validateTimestamp(ts: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(ts);
}

export function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

export function secondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
