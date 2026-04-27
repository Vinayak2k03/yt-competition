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
import { ExternalLink, Users, Eye, Download } from "lucide-react";
import { TopStream, formatNumber, formatDateTime } from "@/lib/api";
import { exportTopStreamsToCSV } from "@/lib/export";

interface TopStreamsTabProps {
  data: TopStream[];
  isLoading: boolean;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-start gap-2">
          <Skeleton className="h-4 w-5 mt-1" />
          <Skeleton className="h-10 w-full" />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-28" />
      </TableCell>
    </TableRow>
  );
}

export function TopStreamsTab({ data, isLoading }: TopStreamsTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="font-semibold w-[40%]">Stream Title</TableHead>
                <TableHead className="font-semibold">Channel</TableHead>
                <TableHead className="font-semibold text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Users className="h-4 w-4" />
                    Concurrent
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Eye className="h-4 w-4" />
                    Views
                  </div>
                </TableHead>
                <TableHead className="font-semibold">First Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, index) => (
                <SkeletonRow key={index} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportTopStreamsToCSV(data)}
          disabled={data.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead className="font-semibold w-[40%]">Stream Title</TableHead>
              <TableHead className="font-semibold">Channel</TableHead>
              <TableHead className="font-semibold text-right">
                <div className="flex items-center justify-end gap-1">
                  <Users className="h-4 w-4" />
                  Concurrent
                </div>
              </TableHead>
              <TableHead className="font-semibold text-right">
                <div className="flex items-center justify-end gap-1">
                  <Eye className="h-4 w-4" />
                  Views
                </div>
              </TableHead>
              <TableHead className="font-semibold">First Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No live streams found in the latest scan
                </TableCell>
              </TableRow>
            ) : (
              data.map((stream, index) => (
                <TableRow key={stream.videoId} className="hover:bg-secondary/30">
                  <TableCell>
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground mt-1 w-5">
                        {index + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={`https://www.youtube.com/watch?v=${stream.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:text-primary transition-colors line-clamp-2 group"
                        >
                          {stream.streamTitle}
                          <ExternalLink className="h-3 w-3 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{stream.channelName}</span>
                      <Badge
                        variant="secondary"
                        className={
                          stream.networkGroup === "TIMES"
                            ? "bg-times/10 text-times border-times/20 text-xs"
                            : "text-xs"
                        }
                      >
                        {stream.networkGroup === "TIMES" ? "T" : "C"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-medium number-format text-primary">
                        {formatNumber(stream.concurrentViewers)}
                      </span>
                      {stream.isLive && (
                        <span className="flex h-2 w-2 rounded-full bg-destructive animate-pulse-slow" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right number-format text-muted-foreground">
                    {stream.viewCount ? formatNumber(stream.viewCount) : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stream.firstSeenAt ? formatDateTime(stream.firstSeenAt) : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
