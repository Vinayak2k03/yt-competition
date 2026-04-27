import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { VODKeywordStat, formatViews, formatNumber } from "@/lib/vod-api";

interface VODKeywordsTabProps {
  data: VODKeywordStat[];
  isLoading: boolean;
}

function SkeletonWordCloud() {
  const sizes = [1.2, 0.9, 1.4, 0.8, 1.1, 1.0, 0.7, 1.3, 0.85, 1.15];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 min-h-[300px]">
      {Array.from({ length: 30 }).map((_, index) => (
        <Skeleton
          key={index}
          className="rounded-full"
          style={{
            width: `${sizes[index % sizes.length] * 60}px`,
            height: `${sizes[index % sizes.length] * 24}px`,
          }}
        />
      ))}
    </div>
  );
}

function SkeletonTableRow() {
  return (
    <tr className="border-b border-border/50">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
      </td>
      <td className="text-right px-4 py-2">
        <Skeleton className="h-4 w-8 ml-auto" />
      </td>
      <td className="text-right px-4 py-2">
        <Skeleton className="h-4 w-16 ml-auto" />
      </td>
      <td className="text-right px-4 py-2">
        <Skeleton className="h-4 w-16 ml-auto" />
      </td>
      <td className="text-right px-4 py-2">
        <Skeleton className="h-4 w-12 ml-auto" />
      </td>
      <td className="text-right px-4 py-2">
        <Skeleton className="h-4 w-12 ml-auto" />
      </td>
    </tr>
  );
}

function exportVODKeywordsToCSV(data: VODKeywordStat[]) {
  const headers = ["Keyword", "Usage Count", "Total Views", "Avg Views", "Avg Likes", "Engagement %"];
  const rows = data.map(item => [
    item.keyword,
    item.usageCount,
    item.totalViews,
    item.avgViews,
    item.avgLikes,
    (item.avgEngagementRate * 100).toFixed(2),
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `vod-keywords-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
}

export function VODKeywordsTab({ data, isLoading }: VODKeywordsTabProps) {
  const processedData = useMemo(() => {
    if (data.length === 0) return [];
    
    const maxViews = Math.max(...data.map(d => d.avgViews));
    const minViews = Math.min(...data.map(d => d.avgViews));
    const range = maxViews - minViews || 1;
    
    return data.slice(0, 50).map(item => ({
      ...item,
      scale: 0.6 + ((item.avgViews - minViews) / range) * 1.4,
      opacity: 0.4 + ((item.avgViews - minViews) / range) * 0.6,
    }));
  }, [data]);

  // Shuffle for visual variety
  const shuffledData = useMemo(() => {
    const arr = [...processedData];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [processedData]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Skeleton Word Cloud */}
        <div className="bg-card border border-border rounded-lg p-8">
          <SkeletonWordCloud />
        </div>

        {/* Skeleton Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-2">Keyword</th>
                  <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Usage Count</th>
                  <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Total Views</th>
                  <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Avg Views</th>
                  <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Avg Likes</th>
                  <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Engagement %</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <SkeletonTableRow key={index} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        No keyword data available from the latest scan
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportVODKeywordsToCSV(data)}
          disabled={data.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Word Cloud Visualization */}
      <div className="bg-card border border-border rounded-lg p-8">
        <div className="flex flex-wrap items-center justify-center gap-3 min-h-[300px]">
          {shuffledData.map((item) => (
            <span
              key={item.keyword}
              className="px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium cursor-default transition-transform hover:scale-110"
              style={{
                fontSize: `${item.scale}rem`,
                opacity: item.opacity,
              }}
              title={`${item.keyword}: ${formatViews(item.avgViews)} avg views (${item.usageCount} videos)`}
            >
              {item.keyword}
            </span>
          ))}
        </div>
      </div>

      {/* Table View */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="font-medium text-sm">Keyword Details</h3>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="text-left text-sm font-medium text-muted-foreground px-4 py-2">Keyword</th>
                <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Usage Count</th>
                <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Total Views</th>
                <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Avg Views</th>
                <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Avg Likes</th>
                <th className="text-right text-sm font-medium text-muted-foreground px-4 py-2">Engagement %</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={item.keyword} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{index + 1}.</span>
                      <span className="font-medium">{item.keyword}</span>
                    </div>
                  </td>
                  <td className="text-right px-4 py-2 number-format">{formatNumber(item.usageCount)}</td>
                  <td className="text-right px-4 py-2 number-format text-muted-foreground">
                    {formatViews(item.totalViews)}
                  </td>
                  <td className="text-right px-4 py-2 number-format font-medium text-primary">
                    {formatViews(item.avgViews)}
                  </td>
                  <td className="text-right px-4 py-2 number-format">
                    {formatViews(item.avgLikes)}
                  </td>
                  <td className="text-right px-4 py-2 number-format">
                    {(item.avgEngagementRate * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
