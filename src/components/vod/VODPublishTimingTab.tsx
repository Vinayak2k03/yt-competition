import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { Clock, TrendingUp, Calendar, Users, CalendarIcon, Video, Eye, BarChart3, Activity } from "lucide-react";
import { formatViews } from "@/lib/formatting";
import { getPublishTimingData, PublishTimingData } from "@/lib/vod-api";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHANNEL_COLORS = [
  "hsl(142, 71%, 45%)", "hsl(217, 91%, 60%)", "hsl(0, 84%, 60%)",
  "hsl(45, 93%, 47%)", "hsl(280, 67%, 55%)", "hsl(190, 80%, 45%)",
  "hsl(25, 95%, 53%)", "hsl(330, 80%, 55%)", "hsl(160, 60%, 45%)",
  "hsl(200, 70%, 50%)", "hsl(60, 70%, 45%)", "hsl(350, 70%, 50%)",
];

type SubTab = "heatmap" | "channels" | "competition" | "performance" | "frequency";
type HeatmapMetric = "count" | "totalViews" | "avgViews";

interface VODPublishTimingTabProps {
  scanId: string | null;
  isLoading?: boolean;
}

export function VODPublishTimingTab({ scanId, isLoading: parentLoading }: VODPublishTimingTabProps) {
  const [data, setData] = useState<PublishTimingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkFilter, setNetworkFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("heatmap");

  const handlePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const map: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "60d": 60, "90d": 90 };
    if (map[preset]) {
      setDateFrom(subDays(now, map[preset]));
      setDateTo(now);
    } else {
      setDateFrom(undefined);
      setDateTo(undefined);
    }
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await getPublishTimingData(
          scanId || undefined,
          networkFilter === "all" ? undefined : networkFilter,
          dateFrom ? dateFrom.toISOString() : undefined,
          dateTo ? dateTo.toISOString() : undefined
        );
        setData(result);
      } catch (e) {
        console.error("Failed to load publish timing data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scanId, networkFilter, dateFrom, dateTo]);

  if (parentLoading || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data) return <div className="text-muted-foreground text-center py-12">No publish timing data available.</div>;

  const stats = data.aggregateStats || {
    totalVideos: data.hourly.reduce((s, h) => s + h.count, 0),
    totalViews: data.hourly.reduce((s, h) => s + h.totalViews, 0),
    avgViewsPerVideo: 0,
    avgEngagement: 0,
  };
  if (!stats.avgViewsPerVideo && stats.totalVideos > 0) {
    stats.avgViewsPerVideo = Math.round(stats.totalViews / stats.totalVideos);
  }

  const subTabs: { id: SubTab; label: string }[] = [
    { id: "heatmap", label: "Heatmap" },
    { id: "channels", label: "Channels" },
    { id: "competition", label: "Competition" },
    { id: "performance", label: "Performance" },
    { id: "frequency", label: "Frequency" },
  ];

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={networkFilter} onValueChange={setNetworkFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Network Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Networks</SelectItem>
            <SelectItem value="TIMES">TIMES</SelectItem>
            <SelectItem value="COMPETITION">COMPETITION</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 border rounded-md p-0.5">
          {[
            { key: "7d", label: "7d" },
            { key: "14d", label: "14d" },
            { key: "30d", label: "30d" },
            { key: "60d", label: "60d" },
            { key: "90d", label: "90d" },
            { key: "all", label: "All" },
          ].map(p => (
            <Button
              key={p.key}
              variant={datePreset === p.key ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => handlePreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", datePreset === "custom" && "border-primary")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom && dateTo
                ? `${format(dateFrom, "MMM d")} – ${format(dateTo, "MMM d, yyyy")}`
                : "Custom range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex gap-2 p-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1 font-medium">From</div>
                <CalendarComponent
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => { setDateFrom(d); setDatePreset("custom"); }}
                  disabled={(d) => d > new Date()}
                  className="p-2 pointer-events-auto"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1 font-medium">To</div>
                <CalendarComponent
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => { setDateTo(d); setDatePreset("custom"); }}
                  disabled={(d) => d > new Date()}
                  className="p-2 pointer-events-auto"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Video className="h-4 w-4" /> Total Videos
            </div>
            <div className="text-2xl font-bold">{stats.totalVideos.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Eye className="h-4 w-4" /> Total Views
            </div>
            <div className="text-2xl font-bold">{formatViews(stats.totalViews)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <BarChart3 className="h-4 w-4" /> Avg Views/Video
            </div>
            <div className="text-2xl font-bold">{formatViews(stats.avgViewsPerVideo)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Activity className="h-4 w-4" /> Avg Engagement
            </div>
            <div className="text-2xl font-bold">{stats.avgEngagement.toFixed(2)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tab navigation */}
      <div className="border-b">
        <nav className="flex gap-4">
          {subTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                "pb-2 text-sm font-medium border-b-2 transition-colors",
                activeSubTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Sub-tab content */}
      {activeSubTab === "heatmap" && <HeatmapSubTab data={data} />}
      {activeSubTab === "channels" && <ChannelsSubTab data={data} />}
      {activeSubTab === "competition" && <CompetitionSubTab data={data} />}
      {activeSubTab === "performance" && <PerformanceSubTab data={data} />}
      {activeSubTab === "frequency" && <FrequencySubTab data={data} />}
    </div>
  );
}

// ============================================================
// HEATMAP SUB-TAB
// ============================================================

function HeatmapSubTab({ data }: { data: PublishTimingData }) {
  const [metric, setMetric] = useState<HeatmapMetric>("avgViews");

  const metricLabel: Record<HeatmapMetric, string> = {
    count: "# Video Count",
    totalViews: "Total Views",
    avgViews: "Avg Views",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["count", "totalViews", "avgViews"] as HeatmapMetric[]).map(m => (
          <Button
            key={m}
            variant={metric === m ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMetric(m)}
          >
            {metricLabel[m]}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publishing Heatmap — {metricLabel[metric]} by Day & Hour (IST)</CardTitle>
        </CardHeader>
        <CardContent>
          <HeatmapGrid heatmap={data.heatmap} metric={metric} />
        </CardContent>
      </Card>

      {/* Top time slots */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Performing Time Slots</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Time Slot</th>
                  <th className="text-right py-2 px-4">Videos</th>
                  <th className="text-right py-2 px-4">Avg Views</th>
                  <th className="text-right py-2 pl-4">Total Views</th>
                </tr>
              </thead>
              <tbody>
                {data.topSlots.map((slot, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{slot.label}</td>
                    <td className="text-right py-2 px-4">{slot.count}</td>
                    <td className="text-right py-2 px-4">{formatViews(slot.avgViews)}</td>
                    <td className="text-right py-2 pl-4">{formatViews(slot.totalViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// CHANNELS SUB-TAB
// ============================================================

function ChannelsSubTab({ data }: { data: PublishTimingData }) {
  const perChannel = data.perChannelHeatmap || {};
  const channelInfo = data.channelPatterns || [];

  if (channelInfo.length === 0) {
    return <div className="text-muted-foreground text-center py-12">No channel data available.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Individual publishing heatmaps per channel — darker = more activity</p>
      <div className="grid gap-4 md:grid-cols-2">
        {channelInfo.slice(0, 20).map((ch, idx) => {
          const chHeatmap = perChannel[ch.channelId] || [];
          return (
            <Card key={ch.channelId}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{ch.channelName}</CardTitle>
                  <Badge variant={ch.networkGroup === "TIMES" ? "default" : "secondary"} className="text-[10px]">
                    {ch.networkGroup}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{ch.videoCount} videos · {formatViews(ch.avgViews)} avg views</p>
              </CardHeader>
              <CardContent className="pt-0">
                <MiniHeatmap heatmap={chHeatmap} color={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// COMPETITION SUB-TAB
// ============================================================

function CompetitionSubTab({ data }: { data: PublishTimingData }) {
  const intensity = data.competitionIntensity || [];

  // Build ranked slots sorted by channelCount desc then totalViews desc
  const rankedSlots = useMemo(() => {
    return [...intensity]
      .sort((a, b) => b.channelCount - a.channelCount || b.totalViews - a.totalViews)
      .slice(0, 15);
  }, [intensity]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Competition Intensity Map — Channels per Time Slot (IST)</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionHeatmapGrid data={intensity} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Most Competitive Time Slots</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Time Slot</th>
                  <th className="text-right py-2 px-4">Channels</th>
                  <th className="text-right py-2 px-4">Avg Views</th>
                  <th className="text-right py-2 pl-4">Total Views</th>
                </tr>
              </thead>
              <tbody>
                {rankedSlots.map((s, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{DAY_NAMES_SHORT[s.day]} {s.hour.toString().padStart(2, '0')}:00</td>
                    <td className="text-right py-2 px-4">{s.channelCount}</td>
                    <td className="text-right py-2 px-4">{formatViews(s.avgViews)}</td>
                    <td className="text-right py-2 pl-4">{formatViews(s.totalViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PERFORMANCE SUB-TAB
// ============================================================

function PerformanceSubTab({ data }: { data: PublishTimingData }) {
  // Channel strategy analysis
  const strategies = useMemo(() => {
    return data.channelPatterns.map(ch => {
      const totalVids = ch.videoCount;
      // We need hourly breakdown from perChannelHeatmap
      const chHeatmap = data.perChannelHeatmap?.[ch.channelId] || [];
      let morningVids = 0;
      let primeTimeVids = 0;
      chHeatmap.forEach(cell => {
        if (cell.hour >= 6 && cell.hour <= 11) morningVids += cell.count;
        if (cell.hour >= 18 && cell.hour <= 23) primeTimeVids += cell.count;
      });
      return {
        ...ch,
        morningPct: totalVids > 0 ? +(morningVids / totalVids * 100).toFixed(1) : 0,
        primeTimePct: totalVids > 0 ? +(primeTimeVids / totalVids * 100).toFixed(1) : 0,
      };
    });
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Hourly + day charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Time vs Performance (IST)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.hourly}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={h => `${h}:00`} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatViews(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  labelFormatter={h => `${h}:00 IST`}
                  formatter={(value: number) => [formatViews(value), 'Avg Views']}
                />
                <Bar dataKey="avgViews" name="Avg Views" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Day-of-Week Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="dayName" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => formatViews(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  formatter={(value: number, name: string) => [name === 'count' ? value : formatViews(value), name === 'count' ? 'Videos' : 'Avg Views']}
                />
                <Bar yAxisId="left" dataKey="count" name="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="avgViews" name="avgViews" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Channel Strategy Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channel Strategy Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Channel</th>
                  <th className="text-left py-2 px-4">Network</th>
                  <th className="text-right py-2 px-4">Videos</th>
                  <th className="text-right py-2 px-4">Avg Views</th>
                  <th className="text-right py-2 px-4">Peak Hour (IST)</th>
                  <th className="text-right py-2 px-4">Morning %</th>
                  <th className="text-right py-2 pl-4">Prime-time %</th>
                </tr>
              </thead>
              <tbody>
                {strategies.slice(0, 30).map((ch, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{ch.channelName}</td>
                    <td className="py-2 px-4">
                      <Badge variant={ch.networkGroup === "TIMES" ? "default" : "secondary"} className="text-xs">
                        {ch.networkGroup}
                      </Badge>
                    </td>
                    <td className="text-right py-2 px-4">{ch.videoCount}</td>
                    <td className="text-right py-2 px-4">{formatViews(ch.avgViews)}</td>
                    <td className="text-right py-2 px-4">{ch.peakHour !== null ? `${ch.peakHour.toString().padStart(2, '0')}:00` : "—"}</td>
                    <td className="text-right py-2 px-4">{ch.morningPct}%</td>
                    <td className="text-right py-2 pl-4">{ch.primeTimePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// FREQUENCY SUB-TAB
// ============================================================

function FrequencySubTab({ data }: { data: PublishTimingData }) {
  const freq = data.dailyFrequency || [];

  const chartData = useMemo(() => {
    // Group by date, each channel as a key
    const dateMap: Record<string, Record<string, number>> = {};
    const channelNames: Record<string, string> = {};

    freq.forEach(f => {
      if (!dateMap[f.date]) dateMap[f.date] = {};
      dateMap[f.date][f.channelId] = (dateMap[f.date][f.channelId] || 0) + f.count;
      channelNames[f.channelId] = f.channelName;
    });

    const dates = Object.keys(dateMap).sort();
    // Limit to top 10 channels by total uploads
    const channelTotals: Record<string, number> = {};
    freq.forEach(f => { channelTotals[f.channelId] = (channelTotals[f.channelId] || 0) + f.count; });
    const topChannels = Object.entries(channelTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    const rows = dates.map(date => {
      const row: Record<string, any> = { date };
      topChannels.forEach(chId => {
        row[chId] = dateMap[date]?.[chId] || 0;
      });
      return row;
    });

    return { rows, topChannels, channelNames };
  }, [freq]);

  if (chartData.rows.length === 0) {
    return <div className="text-muted-foreground text-center py-12">No frequency data available.</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Frequency Tracker — Daily Video Uploads per Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData.rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                labelFormatter={d => `${d} (IST)`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chartData.topChannels.map((chId, i) => (
                <Line
                  key={chId}
                  type="monotone"
                  dataKey={chId}
                  name={chartData.channelNames[chId] || chId}
                  stroke={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// HEATMAP COMPONENTS
// ============================================================

function getMultiColorScale(value: number, max: number): string {
  if (value === 0 || max === 0) return "hsl(var(--muted))";
  const ratio = Math.min(value / max, 1);
  // green→yellow→orange→red
  if (ratio < 0.25) return `hsl(142, 71%, ${65 - ratio * 80}%)`;
  if (ratio < 0.5) return `hsl(${142 - (ratio - 0.25) * 388}, 80%, 50%)`;
  if (ratio < 0.75) return `hsl(${45 - (ratio - 0.5) * 80}, 90%, 50%)`;
  return `hsl(${25 - (ratio - 0.75) * 100}, 85%, ${55 - (ratio - 0.75) * 20}%)`;
}

function HeatmapGrid({ heatmap, metric }: { heatmap: PublishTimingData['heatmap']; metric: HeatmapMetric }) {
  const lookup = new Map(heatmap.map(h => [`${h.day}-${h.hour}`, h]));
  const maxVal = Math.max(...heatmap.map(h => h[metric] || 0), 1);

  const metricLabels: Record<HeatmapMetric, string> = {
    count: "videos",
    totalViews: "total views",
    avgViews: "avg views",
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="flex gap-0.5 mb-1">
          <div className="w-12 shrink-0" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
              {h % 3 === 0 ? `${h}` : ""}
            </div>
          ))}
        </div>
        {Array.from({ length: 7 }, (_, day) => (
          <div key={day} className="flex gap-0.5 mb-0.5">
            <div className="w-12 shrink-0 text-xs text-muted-foreground flex items-center">
              {DAY_NAMES_SHORT[day]}
            </div>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = lookup.get(`${day}-${hour}`);
              const val = cell ? (cell[metric] || 0) : 0;
              return (
                <div
                  key={hour}
                  className="flex-1 aspect-square rounded-sm cursor-default transition-colors"
                  style={{ backgroundColor: getMultiColorScale(val, maxVal), minHeight: 20 }}
                  title={`${DAY_NAMES_SHORT[day]} ${hour}:00 — ${cell?.count || 0} videos, ${formatViews(cell?.avgViews || 0)} avg views, ${formatViews(cell?.totalViews || 0)} total views`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span>Low</span>
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.5, 0.7, 1.0].map((r, i) => (
              <div key={i} className="w-5 h-3 rounded-sm" style={{ backgroundColor: getMultiColorScale(r * maxVal, maxVal) }} />
            ))}
          </div>
          <span>High {metricLabels[metric]}</span>
        </div>
      </div>
    </div>
  );
}

function MiniHeatmap({ heatmap, color }: { heatmap: { day: number; hour: number; count: number }[]; color: string }) {
  const lookup = new Map(heatmap.map(h => [`${h.day}-${h.hour}`, h]));
  const maxCount = Math.max(...heatmap.map(h => h.count), 1);

  return (
    <div className="min-w-0">
      {Array.from({ length: 7 }, (_, day) => (
        <div key={day} className="flex gap-px mb-px">
          <div className="w-8 shrink-0 text-[9px] text-muted-foreground flex items-center">
            {DAY_NAMES_SHORT[day]}
          </div>
          {Array.from({ length: 24 }, (_, hour) => {
            const cell = lookup.get(`${day}-${hour}`);
            const count = cell?.count || 0;
            const opacity = count === 0 ? 0.05 : 0.15 + (count / maxCount) * 0.85;
            return (
              <div
                key={hour}
                className="flex-1 rounded-[2px]"
                style={{ backgroundColor: color, opacity, minHeight: 10, aspectRatio: "1" }}
                title={`${DAY_NAMES_SHORT[day]} ${hour}:00 — ${count} videos`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CompetitionHeatmapGrid({ data }: { data: PublishTimingData['competitionIntensity'] }) {
  const lookup = new Map(data.map(d => [`${d.day}-${d.hour}`, d]));
  const maxChannels = Math.max(...data.map(d => d.channelCount), 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="flex gap-0.5 mb-1">
          <div className="w-12 shrink-0" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
              {h % 3 === 0 ? `${h}` : ""}
            </div>
          ))}
        </div>
        {Array.from({ length: 7 }, (_, day) => (
          <div key={day} className="flex gap-0.5 mb-0.5">
            <div className="w-12 shrink-0 text-xs text-muted-foreground flex items-center">
              {DAY_NAMES_SHORT[day]}
            </div>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = lookup.get(`${day}-${hour}`);
              const count = cell?.channelCount || 0;
              return (
                <div
                  key={hour}
                  className="flex-1 aspect-square rounded-sm cursor-default transition-colors"
                  style={{ backgroundColor: getMultiColorScale(count, maxChannels), minHeight: 20 }}
                  title={`${DAY_NAMES_SHORT[day]} ${hour}:00 — ${count} channels competing, ${formatViews(cell?.avgViews || 0)} avg views`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span>Low competition</span>
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.5, 0.7, 1.0].map((r, i) => (
              <div key={i} className="w-5 h-3 rounded-sm" style={{ backgroundColor: getMultiColorScale(r * maxChannels, maxChannels) }} />
            ))}
          </div>
          <span>High competition</span>
        </div>
      </div>
    </div>
  );
}
