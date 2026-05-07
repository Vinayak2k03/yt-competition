import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VODVideosResponse, VODVideo, getVODVideos, formatViews, formatDuration, formatDate } from "@/lib/vod-api";
import { ExternalLink, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface VODVideosTabProps {
  data: VODVideosResponse | null;
  isLoading: boolean;
  scanId: string | null;
}

type SortField = "viewCount" | "likeCount" | "engagementRate" | "publishedAt" | "durationSeconds";
type SortOrder = "asc" | "desc";

export function VODVideosTab({ data, isLoading: initialLoading, scanId }: VODVideosTabProps) {
  const [videos, setVideos] = useState<VODVideo[]>(data?.videos || []);
  const [total, setTotal] = useState(data?.total || 0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [networkFilter, setNetworkFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("viewCount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const limit = 50;

  // Get unique channels and networks from initial data
  const channels = [...new Set(data?.videos?.map(v => v.channelName) || [])].sort();
  const networks = [...new Set(data?.videos?.map(v => v.networkGroup) || [])].sort();

  useEffect(() => {
    if (data) {
      setVideos(data.videos);
      setTotal(data.total);
    }
  }, [data]);

  // Map internal sort field names to API sort field names
  const sortFieldMap: Record<SortField, string> = {
    viewCount: 'views',
    likeCount: 'likes',
    engagementRate: 'engagement',
    publishedAt: 'published',
    durationSeconds: 'duration',
  };

  const fetchVideos = async () => {
    if (!scanId) return;
    
    setIsLoading(true);
    try {
      const response = await getVODVideos({
        scanId,
        sortBy: sortFieldMap[sortBy] as 'views' | 'likes' | 'engagement' | 'published' | 'duration',
        sortOrder,
        page,
        limit,
      });
      
      // Apply client-side filters since API may not support all filters
      let filtered = response.videos;
      if (channelFilter !== "all") {
        filtered = filtered.filter(v => v.channelName === channelFilter);
      }
      if (networkFilter !== "all") {
        filtered = filtered.filter(v => v.networkGroup === networkFilter);
      }
      
      setVideos(filtered);
      setTotal(response.total);
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (scanId) {
      fetchVideos();
    }
  }, [scanId, sortBy, sortOrder, page]);

  // Apply client-side filtering when filter changes
  useEffect(() => {
    if (!data?.videos) return;
    
    let filtered = [...data.videos];
    
    if (channelFilter !== "all") {
      filtered = filtered.filter(v => v.channelName === channelFilter);
    }
    if (networkFilter !== "all") {
      filtered = filtered.filter(v => v.networkGroup === networkFilter);
    }
    
    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      
      if (sortBy === "publishedAt") {
        const aDate = new Date(aVal as string).getTime();
        const bDate = new Date(bVal as string).getTime();
        return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
      }
      
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      
      return 0;
    });
    
    setVideos(filtered);
  }, [channelFilter, networkFilter, sortBy, sortOrder, data?.videos]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortOrder === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const totalPages = Math.ceil(total / limit);

  if (initialLoading && !data) {
    return (
      <div className="space-y-4">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Network:</span>
          <Select value={networkFilter} onValueChange={setNetworkFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="All Networks" />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border shadow-lg z-50">
              <SelectItem value="all">All Networks</SelectItem>
              {networks.map((network) => {
                const val = network || 'unknown';
                return (
                  <SelectItem key={val} value={val}>
                    {network || 'Unknown Network'}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Channel:</span>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border shadow-lg z-50 max-h-[300px]">
              <SelectItem value="all">All Channels</SelectItem>
              {channels.map((channel) => {
                const val = channel || 'unknown';
                return (
                  <SelectItem key={val} value={val}>
                    {channel || 'Unknown Channel'}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortField); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border shadow-lg z-50">
              <SelectItem value="viewCount">Views</SelectItem>
              <SelectItem value="likeCount">Likes</SelectItem>
              <SelectItem value="engagementRate">Engagement</SelectItem>
              <SelectItem value="publishedAt">Published Date</SelectItem>
              <SelectItem value="durationSeconds">Duration</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="h-9 px-2"
          >
            {sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </Button>
        </div>

        <div className="ml-auto text-sm text-muted-foreground">
          Showing {videos.length} of {total} videos
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">Video</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead 
                className={cn("text-right cursor-pointer hover:text-foreground", sortBy === "viewCount" && "text-primary")}
                onClick={() => handleSort("viewCount")}
              >
                <div className="flex items-center justify-end">
                  Views <SortIcon field="viewCount" />
                </div>
              </TableHead>
              <TableHead 
                className={cn("text-right cursor-pointer hover:text-foreground", sortBy === "likeCount" && "text-primary")}
                onClick={() => handleSort("likeCount")}
              >
                <div className="flex items-center justify-end">
                  Likes <SortIcon field="likeCount" />
                </div>
              </TableHead>
              <TableHead 
                className={cn("text-right cursor-pointer hover:text-foreground", sortBy === "engagementRate" && "text-primary")}
                onClick={() => handleSort("engagementRate")}
              >
                <div className="flex items-center justify-end">
                  Engagement <SortIcon field="engagementRate" />
                </div>
              </TableHead>
              <TableHead 
                className={cn("text-right cursor-pointer hover:text-foreground", sortBy === "durationSeconds" && "text-primary")}
                onClick={() => handleSort("durationSeconds")}
              >
                <div className="flex items-center justify-end">
                  Duration <SortIcon field="durationSeconds" />
                </div>
              </TableHead>
              <TableHead 
                className={cn("cursor-pointer hover:text-foreground", sortBy === "publishedAt" && "text-primary")}
                onClick={() => handleSort("publishedAt")}
              >
                <div className="flex items-center">
                  Published <SortIcon field="publishedAt" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : videos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No videos found.
                </TableCell>
              </TableRow>
            ) : (
              videos.map((video) => (
                <TableRow key={video.id}>
                  <TableCell>
                    <a
                      href={`https://youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 hover:text-primary"
                    >
                      <span className="line-clamp-2 text-sm">{video.title}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1" />
                    </a>
                  </TableCell>
                  <TableCell className="text-sm">{video.channelName}</TableCell>
                  <TableCell className="text-right font-medium">{formatViews(video.viewCount)}</TableCell>
                  <TableCell className="text-right">{formatViews(video.likeCount)}</TableCell>
                  <TableCell className="text-right">{video.engagementRate.toFixed(2)}%</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDuration(video.durationSeconds)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(video.publishedAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
