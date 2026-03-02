import { describe, it, expect } from 'vitest';
import { searchDict } from '../youtube';

describe('YouTube Search Scraping Test', () => {
  it('searches youtube and extracts top result duration', async () => {
    const query = encodeURIComponent('林宥嘉 浪費 official');
    const url = `https://www.youtube.com/results?search_query=${query}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
    });
    const html = await res.text();
    const dataMatch = html.match(/var ytInitialData\s*=\s*(\{.+?\});/s)
      || html.match(/ytInitialData\s*=\s*(\{.+?\});/s);
    
    if (!dataMatch) return;

    const data = JSON.parse(dataMatch[1]);
    const videoRenderers = [...searchDict(data, 'videoRenderer')] as any[];
    
    if (videoRenderers.length > 0) {
      const first = videoRenderers[0];
      // console.log('Video Renderer Keys:', Object.keys(first));
      // lengthText: { simpleText: '5:06', accessibility: { accessibilityData: { label: '5 分鐘 6 秒' } } }
      // thumbnailOverlays contains thumbnailOverlayTimeStatusRenderer which has lengthInSeconds
      const overlays = first.thumbnailOverlays || [];
      const timeOverlay = overlays.find((o: any) => o.thumbnailOverlayTimeStatusRenderer);
      const seconds = timeOverlay?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;
      console.log('Seconds from overlay:', seconds);
      
      // Let's see if there is an actual numeric seconds field
      // Usually it's not in the renderer directly, but we can parse the simpleText
    }
  });
});
