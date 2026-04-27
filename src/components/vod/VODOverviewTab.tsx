import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { VODChannelOverview, formatNumber, formatViews } from "@/lib/vod-api";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface VODOverviewTabProps {
  data: VODChannelOverview[];
  isLoading: boolean;
  networkFilter: string;
  brandFilter: string;
  onNetworkChange: (value: string) => void;
  onBrandChange: (value: string) => void;
}

export function VODOverviewTab({ data, isLoading }: VODOverviewTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
      case "partial": return <AlertTriangle className="h-4 w-4 text-warning" />;
      default: return null;
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead>Network</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Videos</TableHead>
            <TableHead className="text-right">Total Views</TableHead>
            <TableHead className="text-right">Avg Views</TableHead>
            <TableHead className="text-right">Engagement %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No VOD data found. Run a VOD scan to get started.
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => (
              <TableRow key={item.channelId}>
                <TableCell className="font-medium">{item.channelName}</TableCell>
                <TableCell>
                  <Badge variant={item.networkGroup === "TIMES" ? "default" : "secondary"}>
                    {item.networkGroup}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span className="text-sm">{item.videosFetched}/{item.videosRequested}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatNumber(item.totalVideos)}</TableCell>
                <TableCell className="text-right">{formatViews(item.totalViews)}</TableCell>
                <TableCell className="text-right">{formatViews(item.avgViews)}</TableCell>
                <TableCell className="text-right">{item.engagementRate.toFixed(2)}%</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
