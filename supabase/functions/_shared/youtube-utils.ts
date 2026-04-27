/**
 * YouTube-specific utility functions for data processing.
 * 
 * Contains helpers for:
 * - Keyword extraction from video titles
 * - Tag/hashtag extraction
 * - Duration parsing
 * - URL/ID resolution
 */

/**
 * Common English stop words to filter from keyword extraction.
 * Includes YouTube-specific terms that add noise (live, watch, video, etc.)
 */
export const STOP_WORDS = new Set([
  // Common English stop words
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "up", "about", "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "again", "further", "then", "once", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "it",
  "its", "this", "that", "these", "those", "i", "me", "my", "myself", "we", "our", "ours",
  "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his",
  "himself", "she", "her", "hers", "herself", "they", "them", "their", "theirs",
  "themselves", "what", "which", "who", "whom", "when", "where", "why", "how", "all",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only",
  "own", "same", "so", "than", "too", "very", "s", "t", "just", "don", "now",
  // YouTube-specific noise terms
  "live", "watch", "video", "news", "breaking", "latest", "update", "updates",
  "hindi", "english", "india", "indian", "full", "new", "official",
]);

/**
 * Extracts meaningful keywords from a video title.
 * Filters out stop words, short words, and hashtags.
 * 
 * @param title - Video title to extract keywords from
 * @returns Array of lowercase keywords (3+ characters, non-stop words)
 */
export function extractKeywords(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !word.startsWith("#"));
  
  return [...new Set(words)]; // Remove duplicates
}

/**
 * Extracts hashtags from video title and description.
 * Hashtags are words starting with # symbol.
 * 
 * @param title - Video title
 * @param description - Video description (optional)
 * @returns Array of hashtags (including # prefix, lowercase)
 */
export function extractHashtags(title: string, description?: string): string[] {
  const text = description ? `${title} ${description}` : title;
  const hashtags = text.match(/#[\w\u0900-\u097F]+/g) || [];
  return [...new Set(hashtags.map(tag => tag.toLowerCase()))];
}

/**
 * Parses ISO 8601 duration (PT#H#M#S) to seconds.
 * 
 * Examples:
 * - "PT1H30M45S" → 5445
 * - "PT5M30S" → 330
 * - "PT45S" → 45
 * 
 * @param duration - ISO 8601 duration string
 * @returns Duration in seconds (0 if invalid)
 */
export function parseDuration(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Extracts YouTube channel ID from various URL formats.
 * 
 * Supported formats:
 * - https://youtube.com/channel/UC... → UC...
 * - https://youtube.com/@handle → requires API call
 * - https://youtube.com/c/CustomName → requires API call
 * - https://youtube.com/user/Username → requires API call
 * - UC... (direct ID) → UC...
 * 
 * @param youtubeUrl - YouTube channel URL or ID
 * @returns Object with parsed data and resolution method needed
 */
export function parseChannelUrl(youtubeUrl: string): {
  channelId: string | null;
  needsResolution: boolean;
  identifier: string | null;
  searchType: "forHandle" | "forUsername" | null;
} {
  // Direct channel ID
  if (/^UC[\w-]{22}$/.test(youtubeUrl)) {
    return { channelId: youtubeUrl, needsResolution: false, identifier: null, searchType: null };
  }

  try {
    const url = new URL(youtubeUrl);
    const pathname = url.pathname;

    // Direct /channel/UC... URL
    if (pathname.startsWith("/channel/")) {
      const channelId = pathname.split("/")[2];
      if (channelId?.startsWith("UC")) {
        return { channelId, needsResolution: false, identifier: null, searchType: null };
      }
    }

    // Handle (@username) format
    if (pathname.startsWith("/@")) {
      const identifier = pathname.substring(2).split("/")[0];
      return { channelId: null, needsResolution: true, identifier, searchType: "forHandle" };
    }

    // Custom URL format (/c/name)
    if (pathname.startsWith("/c/")) {
      const identifier = pathname.split("/")[2];
      return { channelId: null, needsResolution: true, identifier, searchType: "forHandle" };
    }

    // Legacy username format (/user/name)
    if (pathname.startsWith("/user/")) {
      const identifier = pathname.split("/")[2];
      return { channelId: null, needsResolution: true, identifier, searchType: "forUsername" };
    }
  } catch {
    // Not a valid URL, might be a channel ID
    if (youtubeUrl.startsWith("UC")) {
      return { channelId: youtubeUrl, needsResolution: false, identifier: null, searchType: null };
    }
  }

  return { channelId: null, needsResolution: false, identifier: null, searchType: null };
}

/**
 * CORS headers for Supabase Edge Functions.
 * Allows cross-origin requests from any domain.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
