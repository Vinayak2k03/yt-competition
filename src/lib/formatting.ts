/**
 * Formatting utilities for displaying numbers, dates, and durations.
 * 
 * Uses Indian number formatting (lakhs, crores) as this is primarily
 * used for Indian YouTube channel analytics.
 */

/**
 * Formats a number using Indian number system (en-IN locale).
 * Example: 1234567 → "12,34,567"
 * 
 * @param num - The number to format
 * @returns Formatted string with Indian number separators
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}

/**
 * Formats large view counts in abbreviated Indian format.
 * Uses Crore (Cr) for 10M+, Lakh (L) for 100K+, and K for 1000+.
 * 
 * Examples:
 * - 15000000 → "1.5Cr"
 * - 250000 → "2.5L"
 * - 5000 → "5.0K"
 * - 500 → "500"
 * 
 * @param num - View count to format
 * @returns Abbreviated string representation
 */
export function formatViews(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Formats a number in compact notation (K, M, B).
 * Used for international-style number abbreviation.
 * 
 * Examples:
 * - 1500000 → "1.5M"
 * - 2500 → "2.5K"
 * 
 * @param num - Number to format
 * @returns Compact abbreviated string
 */
export function formatCompact(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Formats an ISO 8601 duration string (PT#H#M#S) to human-readable format.
 * 
 * Examples:
 * - PT1H30M45S → "1:30:45"
 * - PT5M30S → "5:30"
 * - PT45S → "0:45"
 * 
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formats a timestamp to time-only display (HH:MM AM/PM).
 * Uses Indian locale (en-IN).
 * 
 * @param dateString - ISO date string
 * @returns Time string like "02:30 PM"
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Formats a timestamp to short date + time display.
 * 
 * @param dateString - ISO date string
 * @returns Formatted string like "07 Jan, 02:30 PM"
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Formats a timestamp to full date + time with year.
 * 
 * @param dateString - ISO date string
 * @returns Formatted string like "07 Jan 2024, 02:30 PM"
 */
export function formatFullDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Formats a timestamp to date-only display.
 * 
 * @param dateString - ISO date string
 * @returns Formatted string like "07 Jan 2024"
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Calculates engagement rate as a percentage.
 * Engagement = (likes / views) * 100
 * 
 * @param likes - Number of likes
 * @param views - Number of views
 * @returns Engagement rate percentage (0 if views is 0)
 */
export function calculateEngagementRate(likes: number, views: number): number {
  if (views === 0) return 0;
  return (likes / views) * 100;
}
