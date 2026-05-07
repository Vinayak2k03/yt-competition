import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Filters } from "./Filters";
import { OverviewItem, formatNumber, refreshChannel } from "@/lib/api";
import { exportOverviewToCSV } from "@/lib/export";
import { TrendingUp, Users, Video, Download, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface OverviewTabProps {
  data: OverviewItem[];
  isLoading: boolean;
  networkFilter: string;
  brandFilter: string;
  onNetworkChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onRefreshComplete?: () => void;
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-5" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-20 ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-8 ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </TableCell>
    </TableRow>
  );
}

export function OverviewTab({
  data,
  isLoading,
  networkFilter,
  brandFilter,
  onNetworkChange,
  onBrandChange,
  onRefreshComplete,
}: OverviewTabProps) {
  const normalizeNetworkGroup = (value?: string) => (value ?? "").trim().toUpperCase();
  const matchesNetworkFilter = (value: string, filter: string) => {
    if (filter === "all") return true;
    const normalizedValue = normalizeNetworkGroup(value);
    const normalizedFilter = normalizeNetworkGroup(filter);
    if (!normalizedValue) return false;
    if (normalizedValue === normalizedFilter) return true;
    if (normalizedFilter === "TIMES" && normalizedValue.startsWith("TIMES")) return true;
    return false;
  };

  const uniqueData = useMemo(() => {
    const map = new Map<string, OverviewItem>();
    data.forEach((item) => {
      map.set(item.channelId, item);
    });
    return Array.from(map.values());
  }, [data]);

  const [refreshingChannels, setRefreshingChannels] = useState<Set<string>>(new Set());

  const handleRefreshChannel = async (channelId: string, channelName: string) => {
    setRefreshingChannels(prev => new Set(prev).add(channelId));
    try {
      const result = await refreshChannel(channelId);
      if (result.success) {
        toast.success(`${channelName} refreshed successfully`);
        onRefreshComplete?.();
      } else {
        toast.error(`Failed to refresh ${channelName}: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      toast.error(`Failed to refresh ${channelName}`);
    } finally {
      setRefreshingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  };

  const brandClusters = useMemo(() => {
    const clusters = new Set(uniqueData.map((item) => item.brandCluster));
    return Array.from(clusters).sort();
  }, [uniqueData]);

  const filteredData = useMemo(() => {
    return uniqueData.filter((item) => {
      if (!matchesNetworkFilter(item.networkGroup, networkFilter)) return false;
      if (brandFilter !== "all" && item.brandCluster !== brandFilter) return false;
      return true;
    });
  }, [uniqueData, networkFilter, brandFilter]);

  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, item) => ({
        totalViews: acc.totalViews + item.totalConcurrentViews,
        totalStreams: acc.totalStreams + item.numberOfStreams,
      }),
      { totalViews: 0, totalStreams: 0 }
    );
  }, [filteredData]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Skeleton Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        {/* Skeleton Filters */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Skeleton Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="font-semibold">Channel Name</TableHead>
                <TableHead className="font-semibold text-right">Total Concurrent Views</TableHead>
                <TableHead className="font-semibold text-right">Highest Concurrent</TableHead>
                <TableHead className="font-semibold text-right">Number of Streams</TableHead>
                <TableHead className="font-semibold text-right">Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonRow key={index} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Concurrent</p>
              <p className="text-2xl font-semibold number-format">
                {formatNumber(totals.totalViews)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-lg">
              <Video className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Live Streams</p>
              <p className="text-2xl font-semibold number-format">
                {totals.totalStreams}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-warning/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Channels Active</p>
              <p className="text-2xl font-semibold number-format">
                {filteredData.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <Filters
          networkFilter={networkFilter}
          brandFilter={brandFilter}
          brandClusters={brandClusters}
          onNetworkChange={onNetworkChange}
          onBrandChange={onBrandChange}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportOverviewToCSV(filteredData)}
          disabled={filteredData.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="font-semibold">Channel Name</TableHead>
                <TableHead className="font-semibold text-right">Total Concurrent Views</TableHead>
                <TableHead className="font-semibold text-right">Highest Concurrent</TableHead>
                <TableHead className="font-semibold text-right">Number of Streams</TableHead>
                <TableHead className="font-semibold text-right">Last Updated</TableHead>
                <TableHead className="font-semibold text-center w-[60px]"></TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No live streams found in the latest scan
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((item, index) => (
                <TableRow key={item.channelId} className="hover:bg-secondary/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5">
                          {index + 1}.
                        </span>
                        <span className="font-medium">{item.channelName}</span>
                      </div>
                      <Badge
                        variant={item.networkGroup === "TIMES" ? "default" : "secondary"}
                        className={
                          item.networkGroup === "TIMES"
                            ? "bg-times/10 text-times border-times/20"
                            : "bg-secondary text-muted-foreground"
                        }
                      >
                        {item.networkGroup === "TIMES" ? "Times" : "Competition"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium number-format">
                    {formatNumber(item.totalConcurrentViews)}
                  </TableCell>
                  <TableCell className="text-right number-format">
                    {formatNumber(item.highestConcurrent)}
                  </TableCell>
                  <TableCell className="text-right number-format">
                    {item.numberOfStreams}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.lastSuccessfulScan ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`flex items-center justify-end gap-1 text-xs cursor-help ${item.isStaleData ? 'text-warning' : 'text-muted-foreground'}`}>
                            {item.isStaleData ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                            {formatDistanceToNow(new Date(item.lastSuccessfulScan), { addSuffix: true })}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            {item.isStaleData && (
                              <p className="text-warning font-medium mb-1">⚠️ Data may be stale (failed to update in current scan)</p>
                            )}
                            <p>Last successful update: {new Date(item.lastSuccessfulScan).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleRefreshChannel(item.channelId, item.channelName)}
                          disabled={refreshingChannels.has(item.channelId)}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${refreshingChannels.has(item.channelId) ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Refresh this channel</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
    </TooltipProvider>
  );
}
