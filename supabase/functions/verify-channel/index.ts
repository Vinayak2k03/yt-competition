import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface YouTubeChannelInfo {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  customUrl?: string;
}

async function getActiveApiKey(supabase: any): Promise<string | null> {
  const { data, error } = await supabase
    .from("yt_api_keys")
    .select("api_key")
    .eq("is_active", true)
    .is("quota_exceeded_at", null)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .single();

  if (error || !data) {
    console.error("No active API key found:", error);
    return null;
  }

  return (data as { api_key: string }).api_key;
}

async function resolveChannelId(input: string, apiKey: string): Promise<string | null> {
  // Already a channel ID
  if (/^UC[\w-]{22}$/.test(input)) {
    return input;
  }

  // Extract handle or username from URL
  let identifier: string | null = null;
  let searchType: "forHandle" | "forUsername" = "forHandle";

  // Handle format: @username
  const handleMatch = input.match(/@([\w-]+)/);
  if (handleMatch) {
    identifier = handleMatch[1];
    searchType = "forHandle";
  }

  // /channel/UCxxxx format
  const channelMatch = input.match(/\/channel\/(UC[\w-]{22})/);
  if (channelMatch) {
    return channelMatch[1];
  }

  // /c/customname or /user/username format
  const customMatch = input.match(/\/(c|user)\/([\w-]+)/);
  if (customMatch) {
    identifier = customMatch[2];
    searchType = customMatch[1] === "user" ? "forUsername" : "forHandle";
  }

  if (!identifier) {
    // Try treating the whole input as a handle
    identifier = input.replace(/^@/, "");
    searchType = "forHandle";
  }

  // Use YouTube API to resolve handle/username to channel ID
  const url = `https://www.googleapis.com/youtube/v3/channels?part=id&${searchType}=@${identifier}&key=${apiKey}`;
  console.log(`Resolving channel: ${searchType}=@${identifier}`);

  const response = await fetch(url);
  const data = await response.json();

  if (data.items && data.items.length > 0) {
    return data.items[0].id;
  }

  // Fallback: try search API
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(identifier)}&maxResults=1&key=${apiKey}`;
  const searchResponse = await fetch(searchUrl);
  const searchData = await searchResponse.json();

  if (searchData.items && searchData.items.length > 0) {
    return searchData.items[0].snippet.channelId;
  }

  return null;
}

async function getChannelInfo(channelId: string, apiKey: string): Promise<YouTubeChannelInfo | null> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`;
  
  console.log(`Fetching channel info for: ${channelId}`);
  const response = await fetch(url);
  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    console.error("Channel not found:", channelId);
    return null;
  }

  const channel = data.items[0];
  const snippet = channel.snippet;
  const statistics = channel.statistics;

  return {
    channelId: channel.id,
    title: snippet.title,
    description: snippet.description?.substring(0, 200) || "",
    thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
    subscriberCount: statistics.subscriberCount || "0",
    videoCount: statistics.videoCount || "0",
    viewCount: statistics.viewCount || "0",
    customUrl: snippet.customUrl,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { youtube_url } = await req.json();

    if (!youtube_url) {
      return new Response(
        JSON.stringify({ error: "youtube_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Verifying channel: ${youtube_url}`);

    // Get an active API key
    const apiKey = await getActiveApiKey(supabase);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No active YouTube API key available" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve the channel ID
    const channelId = await resolveChannelId(youtube_url, apiKey);
    if (!channelId) {
      return new Response(
        JSON.stringify({ error: "Could not resolve YouTube channel. Please check the URL." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get channel info
    const channelInfo = await getChannelInfo(channelId, apiKey);
    if (!channelInfo) {
      return new Response(
        JSON.stringify({ error: "Channel not found on YouTube" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Channel verified: ${channelInfo.title} (${channelInfo.channelId})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        channel: channelInfo 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error verifying channel:", error);
    const message = error instanceof Error ? error.message : "Failed to verify channel";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
