import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TagStat, formatNumber } from "@/lib/api";
import { exportHashtagsToCSV } from "@/lib/export";
import { Hash, Download } from "lucide-react";

interface HashtagsTabProps {
  data: TagStat[];
  isLoading: boolean;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-5" />
          <Skeleton className="h-4 w-28" />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-8 ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-20 ml-auto" />
      </TableCell>
    </TableRow>
  );
}

export function HashtagsTab({ data, isLoading }: HashtagsTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="font-semibold">
                  <div className="flex items-center gap-1">
                    <Hash className="h-4 w-4" />
                    Tag
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-right">Usage Count</TableHead>
                <TableHead className="font-semibold text-right">Avg Concurrent Views</TableHead>
                <TableHead className="font-semibold text-right">Total Concurrent Views</TableHead>
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
          onClick={() => exportHashtagsToCSV(data)}
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
              <TableHead className="font-semibold">
                <div className="flex items-center gap-1">
                  <Hash className="h-4 w-4" />
                  Tag
                </div>
              </TableHead>
              <TableHead className="font-semibold text-right">Usage Count</TableHead>
              <TableHead className="font-semibold text-right">Avg Concurrent Views</TableHead>
              <TableHead className="font-semibold text-right">Total Concurrent Views</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                  No hashtag data available from the latest scan
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, index) => (
                <TableRow key={item.tag} className="hover:bg-secondary/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">
                        {index + 1}.
                      </span>
                      <span className="font-medium text-primary">{item.tag}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right number-format">
                    {item.usageCount}
                  </TableCell>
                  <TableCell className="text-right number-format font-medium text-primary">
                    {formatNumber(item.avgConcurrentViews)}
                  </TableCell>
                  <TableCell className="text-right number-format text-muted-foreground">
                    {formatNumber(item.totalConcurrentViews)}
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
