import { describe, it, expect } from 'vitest';
import { extractVideoId, fetchComments } from '../youtube';
import { findCandidateComment, parseTextToSongs, enrichMissingEndTimestamps } from '../extraction';

describe('Live YouTube Extraction & Enrichment', () => {
  it('extracts songs from youtu.be/gOdBkLapyLo and enriches duration', async () => {
    // 1. Extract video ID
    const url = 'https://youtu.be/gOdBkLapyLo';
    const videoId = extractVideoId(url);
    expect(videoId).toBe('gOdBkLapyLo');

    // 2. Fetch comments from real YouTube
    const comments = await fetchComments(videoId!);
    expect(comments.length).toBeGreaterThan(0);

    // 3. Find candidate comment with the song list
    const candidate = findCandidateComment(comments);
    expect(candidate).not.toBeNull();
    
    // 4. Parse text to songs
    const parsedSongs = parseTextToSongs(candidate!.text);
    expect(parsedSongs.length).toBeGreaterThan(0);

    // Verify that the last song initially has no endSeconds
    const lastParsedSong = parsedSongs[parsedSongs.length - 1];
    expect(lastParsedSong.endSeconds).toBeNull();

    // 5. Enrich missing end timestamps using iTunes API
    const enrichedSongs = await enrichMissingEndTimestamps(parsedSongs);

    // 6. Assertions to ensure every song has a valid duration
    for (const song of enrichedSongs) {
      expect(song.startSeconds).toBeGreaterThanOrEqual(0);
      // Ensure the end timestamp exists and is greater than the start timestamp
      expect(song.endSeconds).not.toBeNull();
      expect(song.endSeconds).toBeGreaterThan(song.startSeconds);
    }
    
    // Log the result to see the inferred duration
    console.log('\n--- Extracted Song List ---');
    for (const s of enrichedSongs) {
      console.log(`[${s.startTimestamp} - ${s.endTimestamp}] ${s.songName} / ${s.artist}`);
    }
    console.log('---------------------------\n');
  }, 60000); // 60-second timeout to allow real network requests
});
