

## Upgrade Publish Timing to a Premium Analytics Hub

### What We're Building
Transform the current "Publish Timing" tab into a comprehensive **5-sub-tab analytics module** inspired by the reference design, while keeping all existing functionality. This creates a rich, competitive-intelligence dashboard that rivals dedicated analytics tools.

### Reference Analysis — What to Adopt

| Reference Feature | Our Current State | Action |
|---|---|---|
| Date range presets (7/14/30/60d) + custom | We have 7d/30d/90d/All + custom | Add 14d and 60d presets |
| Summary cards (Total Videos, Total Views, Avg Views/Video, Avg Engagement) | We have Peak Hour, Best Day, Top Slot, Channels | Replace with the 4 aggregate summary cards |
| Sub-tabs: Heatmap, Channels, Competition, Performance, Frequency | Single flat layout with everything mixed | Split into 5 sub-tabs |
| Heatmap metric toggle (Video Count / Total Views / Avg Views) | Heatmap only shows avg views | Add 3-way toggle |
| Multi-color heatmap (green→yellow→orange→red) | Single-color heatmap (primary opacity) | Rich multi-color gradient |
| Per-channel individual heatmaps (Channels sub-tab) | Channel patterns as a table | Individual heatmap cards per channel |
| Competition Intensity Map (# channels posting per slot) | Not available | New heatmap + ranked time slots |
| Time vs Performance bar chart (avg views by publishing hour) | We have "Avg Views by Hour" chart | Keep, move to Performance sub-tab |
| Channel Strategy Analysis (prime-time %, morning %) | Not available | Compute from existing data |
| Upload Frequency Tracker (daily line chart per channel) | Not available | New multi-line chart |
| Channel filter pills (top of page) | Network dropdown only | Add colored channel pills |

### Plan

**1. Restructure `VODPublishTimingTab.tsx` with sub-tabs**
- Add internal sub-tab navigation: Heatmap | Channels | Competition | Performance | Frequency
- Move date presets and channel filter pills to the top (shared across sub-tabs)
- Replace 4 summary cards with: Total Videos, Total Views, Avg Views/Video, Avg Engagement (computed client-side from existing data)

**2. Enhance the Heatmap sub-tab**
- Add 3-way metric toggle: `# Video Count` | `Total Views` | `Avg Views`
- Replace single-color gradient with multi-color scale (green→yellow→orange→red) matching reference
- Add side-by-side comparison toggle (TIMES vs COMPETITION heatmaps)
- Keep the heatmap component but extend it to accept a `metric` prop

**3. New Channels sub-tab**
- Render individual heatmap cards in a 2-column grid, one per channel
- Each card shows channel name, video count, and a mini heatmap
- Add color legend (Less → More)
- Reuse the same `HeatmapGrid` component with per-channel data

**4. New Competition sub-tab**
- Competition Intensity Map: heatmap where cell value = number of channels posting in that slot
- "Highest View Time Slots" ranked list: top 10 day+hour combos by total views, showing avg views and competitor count
- Uses same data, just aggregated differently

**5. New Performance sub-tab**
- "Time vs Performance" bar chart: avg views by publishing hour (already exists, relocate)
- "Channel Strategy Analysis" list: each channel with prime-time % (18-23h), morning % (6-11h), video count
- Computed client-side from `channelPatterns` data

**6. New Frequency sub-tab**
- "Upload Frequency Tracker": multi-line chart showing daily video count per channel over the selected date range
- Requires a new backend endpoint or extending `/publish-timing` to return per-date-per-channel video counts
- Channel filter pills at top to toggle channel visibility

**7. Backend: extend `/publish-timing` response** (`supabase/functions/vod-api/index.ts`)
- Add `perChannelHeatmap`: `Record<channelId, { day, hour, count, totalViews, avgViews }[]>` — per-channel heatmap data
- Add `competitionIntensity`: `{ day, hour, channelCount, totalViews, avgViews }[]` — # channels per slot
- Add `dailyFrequency`: `{ date: string, channelId: string, channelName: string, count: number }[]` — daily upload counts
- Add aggregate stats: `totalVideos`, `totalViews`, `avgViewsPerVideo`, `avgEngagement` to the response
- All computed from existing filtered video data in the same loop (minimal extra cost)

**8. Update channel filter to pill-style** (`VODPublishTimingTab.tsx`)
- Replace network dropdown with colored channel pills ("All Channels", then individual channel names)
- Each pill toggles that channel on/off for filtering
- Colors match reference (green for "All", distinct colors per channel)

### Files Modified

| File | Change |
|---|---|
| `supabase/functions/vod-api/index.ts` | Extend `/publish-timing` response with per-channel heatmaps, competition intensity, daily frequency, aggregate stats |
| `src/lib/vod-api.ts` | Update `PublishTimingData` type to include new fields |
| `src/components/vod/VODPublishTimingTab.tsx` | Full rewrite: 5 sub-tabs, summary cards, channel pills, metric toggle, multi-color heatmap |

### Technical Details

**Heatmap color scale** (matching reference):
```text
0 videos     → transparent/muted
low value    → dark green
medium-low   → green  
medium       → yellow-green
medium-high  → orange
high         → red
```

**Competition intensity** is computed by counting distinct channels per (day, hour) slot from the same video data already in memory.

**Daily frequency** groups videos by `published_at` date (IST-adjusted) and channel, counting per day. This powers the multi-line time-series chart.

**Prime-time / Morning classification** for Channel Strategy:
- Morning: 6:00-11:59 IST
- Prime-time: 18:00-23:59 IST
- Computed from each channel's hourly distribution

