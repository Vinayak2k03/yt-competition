import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { VODTagStat, formatViews, formatNumber } from "@/lib/vod-api";

interface VODTagsTabProps {
  data: VODTagStat[];
  isLoading: boolean;
}

export function VODTagsTab({ data, isLoading }: VODTagsTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead className="text-right">Usage Count</TableHead>
            <TableHead className="text-right">Total Views</TableHead>
            <TableHead className="text-right">Avg Views</TableHead>
            <TableHead className="text-right">Engagement %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No tag data found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, index) => (
              <TableRow key={`${item.tag}-${index}`}>
                <TableCell className="font-medium text-primary">{item.tag}</TableCell>
                <TableCell className="text-right">{formatNumber(item.usageCount)}</TableCell>
                <TableCell className="text-right">{formatViews(item.totalViews)}</TableCell>
                <TableCell className="text-right">{formatViews(item.avgViews)}</TableCell>
                <TableCell className="text-right">{(item.avgEngagementRate * 100).toFixed(2)}%</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
