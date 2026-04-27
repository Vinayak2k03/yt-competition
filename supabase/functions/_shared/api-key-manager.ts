/**
 * API Key Manager for YouTube Data API v3.
 * 
 * Handles rotation of multiple API keys with:
 * - Round-robin load balancing across available keys
 * - Automatic quota exhaustion detection and key exclusion
 * - Error categorization (quota, invalid, rate limit, network, forbidden)
 * - Persistence of key status to database
 * - 24-hour automatic quota reset
 * 
 * Usage:
 * ```typescript
 * const keyManager = new ApiKeyManager(supabase);
 * await keyManager.loadKeys();
 * 
 * // Use with fetchWithRetry for automatic rotation
 * const { response, error } = await fetchWithRetry(url, keyManager);
 * ```
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Types of errors that can occur with YouTube API */
export type ErrorType = "quota" | "invalid" | "rate_limit" | "network" | "forbidden" | "other";

/** API key information from database */
export interface ApiKeyInfo {
  id: string;
  api_key: string;
  name: string;
  daily_quota: number;
}

/**
 * Categorizes HTTP errors into error types for appropriate handling.
 * 
 * @param status - HTTP status code
 * @param errorText - Error response body text
 * @returns Categorized error type
 */
export function categorizeError(status: number, errorText: string): ErrorType {
  if (status === 403 && errorText.includes("quotaExceeded")) return "quota";
  if (status === 403) return "forbidden";
  if (status === 400 || status === 401) return "invalid";
  if (status === 429) return "rate_limit";
  if (status === 0 || errorText.includes("network") || errorText.includes("fetch")) return "network";
  return "other";
}

/**
 * Manages a pool of YouTube API keys with automatic rotation and error handling.
 * 
 * Features:
 * - Loads keys from yt_api_keys table (falls back to env var)
 * - Tracks usage count per key for monitoring
 * - Excludes exhausted keys from rotation
 * - Records errors to database for debugging
 * - Auto-clears quota_exceeded after 24 hours (Pacific Time reset)
 */
export class ApiKeyManager {
  private keys: ApiKeyInfo[] = [];
  private requestCounter = 0;
  private supabase: SupabaseClient;
  private exhaustedKeys: Set<string> = new Set();
  private keyUsageCount: Map<string, number> = new Map();
  private weightedSlots: number[] = [];
  private keyErrors: Map<string, { errorType: ErrorType; message: string }> = new Map();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Loads available API keys from database.
   * Automatically resets quota for keys that exceeded 24+ hours ago.
   * Falls back to YOUTUBE_API_KEY environment variable if no DB keys.
   * 
   * @throws Error if no API keys are available
   */
  async loadKeys(): Promise<void> {
    // Reset quota for keys that exceeded more than 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await this.supabase
      .from("yt_api_keys")
      .update({ quota_exceeded_at: null, error_type: null, consecutive_errors: 0 })
      .eq("is_active", true)
      .not("quota_exceeded_at", "is", null)
      .lt("quota_exceeded_at", twentyFourHoursAgo);

    // Load active keys without quota issues
    const { data: dbKeys } = await this.supabase
      .from("yt_api_keys")
      .select("id, api_key, name, daily_quota")
      .eq("is_active", true)
      .is("quota_exceeded_at", null)
      .order("created_at", { ascending: true });

    if (dbKeys && dbKeys.length > 0) {
      this.keys = dbKeys.map(k => ({ ...k, daily_quota: k.daily_quota || 10000 }));
      console.log(`[ApiKeyManager] Loaded ${this.keys.length} keys: ${this.keys.map(k => `${k.name}(${k.daily_quota})`).join(", ")}`);
    } else {
      // Fallback to environment variable
      const envKey = Deno.env.get("YOUTUBE_API_KEY");
      if (envKey) {
        this.keys = [{ id: "env", api_key: envKey, name: "Environment Key", daily_quota: 10000 }];
        console.log("[ApiKeyManager] Using API key from environment variable");
      }
    }

    if (this.keys.length === 0) {
      throw new Error("No YouTube API keys available");
    }

    // Initialize usage counters
    this.keys.forEach(k => this.keyUsageCount.set(k.id, 0));

    // Build weighted slots
    this.rebuildWeightedSlots();
  }

  /**
   * Builds weighted slot array for proportional key selection.
   * Keys with higher daily_quota get more slots.
   * Minimum weight is 1 per 10,000 units of quota.
   */
  private rebuildWeightedSlots(): void {
    const availableKeys = this.keys.filter(k => !this.exhaustedKeys.has(k.id));
    if (availableKeys.length === 0) {
      this.weightedSlots = [];
      return;
    }

    const minQuota = 10000;
    this.weightedSlots = [];
    availableKeys.forEach((key, idx) => {
      const weight = Math.max(1, Math.round(key.daily_quota / minQuota));
      for (let i = 0; i < weight; i++) {
        this.weightedSlots.push(idx);
      }
    });
    console.log(`[ApiKeyManager] Weighted slots: ${this.weightedSlots.length} total across ${availableKeys.length} keys`);
  }

  /**
   * Gets the next available API key using round-robin selection.
   * Skips any keys that have been marked as exhausted.
   * 
   * @returns API key info or null if all keys exhausted
   */
  getCurrentKeyInfo(): ApiKeyInfo | null {
    if (this.weightedSlots.length === 0) return null;

    const availableKeys = this.keys.filter((k) => !this.exhaustedKeys.has(k.id));
    if (availableKeys.length === 0) return null;

    const slotIndex = this.requestCounter % this.weightedSlots.length;
    this.requestCounter++;

    const keyIndex = this.weightedSlots[slotIndex];
    const selectedKey = availableKeys[keyIndex];
    const currentCount = this.keyUsageCount.get(selectedKey.id) || 0;
    this.keyUsageCount.set(selectedKey.id, currentCount + 1);

    return selectedKey;
  }

  /**
   * Marks a key as exhausted due to an error.
   * Updates database with error details and increments consecutive error count.
   * 
   * @param keyId - The key ID to mark as exhausted
   * @param errorType - Category of error
   * @param errorMessage - Detailed error message
   */
  async markKeyExhausted(keyId: string, errorType: ErrorType, errorMessage: string): Promise<void> {
    this.exhaustedKeys.add(keyId);
    this.keyErrors.set(keyId, { errorType, message: errorMessage });
    this.rebuildWeightedSlots();
    console.log(`[ApiKeyManager] Key ${keyId} exhausted: ${errorType}`);

    if (keyId !== "env") {
      const updateData: Record<string, unknown> = {
        last_error: errorMessage,
        last_error_at: new Date().toISOString(),
        error_type: errorType,
      };

      // Set quota_exceeded_at for quota errors (enables 24h auto-reset)
      if (errorType === "quota") {
        updateData.quota_exceeded_at = new Date().toISOString();
      }

      // Increment consecutive error counter
      const { data: currentKey } = await this.supabase
        .from("yt_api_keys")
        .select("consecutive_errors")
        .eq("id", keyId)
        .maybeSingle();

      updateData.consecutive_errors = (currentKey?.consecutive_errors || 0) + 1;

      await this.supabase.from("yt_api_keys").update(updateData).eq("id", keyId);
    }
  }

  /**
   * Clears error status for a key after successful use.
   * Resets consecutive_errors to 0.
   * 
   * @param keyId - The key ID to clear errors for
   */
  async clearKeyError(keyId: string): Promise<void> {
    if (keyId !== "env") {
      await this.supabase
        .from("yt_api_keys")
        .update({
          last_error: null,
          last_error_at: null,
          error_type: null,
          consecutive_errors: 0,
        })
        .eq("id", keyId);
    }
  }

  /**
   * Updates the last_used_at timestamp for tracking key activity.
   * 
   * @param keyId - The key ID that was used
   */
  async updateLastUsed(keyId: string): Promise<void> {
    if (keyId !== "env") {
      await this.supabase
        .from("yt_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyId);
    }
  }

  /** Checks if there are any non-exhausted keys available */
  hasAvailableKeys(): boolean {
    return this.keys.filter((k) => !this.exhaustedKeys.has(k.id)).length > 0;
  }

  /** Gets the map of key errors for reporting */
  getKeyErrors(): Map<string, { errorType: ErrorType; message: string }> {
    return this.keyErrors;
  }

  /** Gets count of exhausted keys */
  getExhaustedCount(): number {
    return this.exhaustedKeys.size;
  }

  /** Gets total number of loaded keys */
  getTotalKeyCount(): number {
    return this.keys.length;
  }

  /** Logs usage statistics for debugging */
  logUsageStats(): void {
    console.log("=== API Key Usage Statistics ===");
    this.keys.forEach(key => {
      const count = this.keyUsageCount.get(key.id) || 0;
      const error = this.keyErrors.get(key.id);
      const status = error ? ` (${error.errorType}: ${error.message.slice(0, 50)})` : "";
      console.log(`  ${key.name}: ${count} requests${status}`);
    });
    console.log(`  Total requests: ${this.requestCounter}`);
    console.log(`  Keys exhausted: ${this.exhaustedKeys.size}/${this.keys.length}`);
    console.log("================================");
  }
}

/**
 * Fetches a URL with automatic API key rotation and retry logic.
 * 
 * Handles:
 * - Key rotation on quota/auth errors
 * - Exponential backoff for rate limiting
 * - Network error retries
 * 
 * @param url - YouTube API URL (without key parameter)
 * @param keyManager - Initialized ApiKeyManager instance
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Response object and error information
 */
export async function fetchWithRetry(
  url: string,
  keyManager: ApiKeyManager,
  maxRetries = 3
): Promise<{ response: Response | null; error: string | null; allKeysExhausted: boolean }> {
  let lastError: string | null = null;
  let networkRetries = 0;
  const maxNetworkRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyInfo = keyManager.getCurrentKeyInfo();
    if (!keyInfo) {
      return { response: null, error: "All API keys exhausted", allKeysExhausted: true };
    }

    const urlWithKey = new URL(url);
    urlWithKey.searchParams.set("key", keyInfo.api_key);

    try {
      const response = await fetch(urlWithKey.toString());

      if (response.ok) {
        await keyManager.updateLastUsed(keyInfo.id);
        await keyManager.clearKeyError(keyInfo.id);
        return { response, error: null, allKeysExhausted: false };
      }

      const errorText = await response.text();
      const errorType = categorizeError(response.status, errorText);

      // Exhaust key for permanent errors
      if (errorType === "quota" || errorType === "invalid" || errorType === "forbidden") {
        await keyManager.markKeyExhausted(
          keyInfo.id,
          errorType,
          `${response.status}: ${errorText.slice(0, 200)}`
        );

        if (keyManager.hasAvailableKeys()) {
          continue; // Try next key
        } else {
          return { response: null, error: `All API keys exhausted. Last error: ${errorType}`, allKeysExhausted: true };
        }
      }

      // Exponential backoff for rate limiting
      if (errorType === "rate_limit") {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.log(`[fetchWithRetry] Rate limited, waiting ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      lastError = `YouTube API error: ${response.status} - ${errorText.slice(0, 200)}`;
    } catch (networkError) {
      const errorMessage = networkError instanceof Error ? networkError.message : "Network error";
      networkRetries++;

      if (networkRetries < maxNetworkRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, networkRetries - 1), 4000);
        console.log(`[fetchWithRetry] Network error: ${errorMessage}. Retry ${networkRetries}/${maxNetworkRetries}...`);
        await new Promise(r => setTimeout(r, backoffMs));
        attempt--; // Don't count network retries against attempt limit
        continue;
      }

      // Mark key as exhausted after multiple network failures
      console.log(`[fetchWithRetry] Network errors persist, marking key unavailable`);
      await keyManager.markKeyExhausted(keyInfo.id, "network", errorMessage);
      lastError = `Network error: ${errorMessage}`;
      networkRetries = 0;

      if (keyManager.hasAvailableKeys()) {
        continue;
      }
    }
  }

  return { response: null, error: lastError || "Failed to fetch from YouTube API", allKeysExhausted: !keyManager.hasAvailableKeys() };
}
