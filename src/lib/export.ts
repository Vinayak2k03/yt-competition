import { OverviewItem, TopStream, KeywordStat, TagStat, formatNumber } from "./api";

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function escapeCSV(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportOverviewToCSV(data: OverviewItem[], filename = "overview.csv") {
  const headers = ["Channel Name", "Network Group", "Brand Cluster", "Total Concurrent Views", "Highest Concurrent", "Number of Streams", "Avg Peak Per Stream"];
  const rows = data.map(item => [
    escapeCSV(item.channelName),
    escapeCSV(item.networkGroup),
    escapeCSV(item.brandCluster),
    item.totalConcurrentViews,
    item.highestConcurrent,
    item.numberOfStreams,
    item.averagePeakPerStream,
  ].join(","));
  
  const csv = [headers.join(","), ...rows].join("\n");
  downloadCSV(csv, filename);
}

export function exportTopStreamsToCSV(data: TopStream[], filename = "top-streams.csv") {
  const headers = ["Stream Title", "Video ID", "Channel Name", "Network Group", "Brand Cluster", "Concurrent Viewers", "View Count", "Like Count", "Is Live", "First Seen At"];
  const rows = data.map(item => [
    escapeCSV(item.streamTitle),
    escapeCSV(item.videoId),
    escapeCSV(item.channelName),
    escapeCSV(item.networkGroup),
    escapeCSV(item.brandCluster),
    item.concurrentViewers,
    item.viewCount ?? "",
    item.likeCount ?? "",
    item.isLive,
    escapeCSV(item.firstSeenAt ?? ""),
  ].join(","));
  
  const csv = [headers.join(","), ...rows].join("\n");
  downloadCSV(csv, filename);
}

export function exportKeywordsToCSV(data: KeywordStat[], filename = "keywords.csv") {
  const headers = ["Keyword", "Usage Count", "Avg Concurrent Views", "Total Concurrent Views"];
  const rows = data.map(item => [
    escapeCSV(item.keyword),
    item.usageCount,
    item.avgConcurrentViews,
    item.totalConcurrentViews,
  ].join(","));
  
  const csv = [headers.join(","), ...rows].join("\n");
  downloadCSV(csv, filename);
}

export function exportHashtagsToCSV(data: TagStat[], filename = "hashtags.csv") {
  const headers = ["Tag", "Usage Count", "Avg Concurrent Views", "Total Concurrent Views"];
  const rows = data.map(item => [
    escapeCSV(item.tag),
    item.usageCount,
    item.avgConcurrentViews,
    item.totalConcurrentViews,
  ].join(","));
  
  const csv = [headers.join(","), ...rows].join("\n");
  downloadCSV(csv, filename);
}
