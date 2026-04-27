import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  TrendingUp, 
  TrendingDown, 
  Trophy, 
  Users, 
  Eye, 
  Video,
  Target,
  BarChart3,
  Crown,
} from "lucide-react";
import { formatNumber, formatViews } from "@/lib/formatting";
import {
  getBrandClusters,
  getClusterSummaries,
  getClusterAnalytics,
  type BrandCluster,
  type ClusterSummary,
  type ClusterAnalytics,
} from "@/lib/cluster-api";

interface ClusterAnalyticsTabProps {
  scanId: string | null;
}

export function ClusterAnalyticsTab({ scanId }: ClusterAnalyticsTabProps) {
  const [clusters, setClusters] = useState<BrandCluster[]>([]);
  const [summaries, setSummaries] = useState<ClusterSummary[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [clusterDetails, setClusterDetails] = useState<ClusterAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [clustersData, summariesData] = await Promise.all([
          getBrandClusters(),
          getClusterSummaries(scanId || undefined),
        ]);
        setClusters(clustersData);
        setSummaries(summariesData);
      } catch (error) {
        console.error("Error loading cluster data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [scanId]);

  useEffect(() => {
    if (!selectedCluster) {
      setClusterDetails(null);
      return;
    }

    const loadDetails = async () => {
      setIsLoadingDetails(true);
      try {
        const details = await getClusterAnalytics(selectedCluster, scanId || undefined);
        setClusterDetails(details);
      } catch (error) {
        console.error("Error loading cluster details:", error);
      } finally {
        setIsLoadingDetails(false);
      }
    };
    loadDetails();
  }, [selectedCluster, scanId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Calculate overall stats
  const overallStats = summaries.reduce(
    (acc, s) => ({
      timesViews: acc.timesViews + s.timesViews,
      competitionViews: acc.competitionViews + s.competitionViews,
      timesVideos: acc.timesVideos + s.timesVideos,
      competitionVideos: acc.competitionVideos + s.competitionVideos,
    }),
    { timesViews: 0, competitionViews: 0, timesVideos: 0, competitionVideos: 0 }
  );

  const totalViews = overallStats.timesViews + overallStats.competitionViews;
  const timesMarketShare = totalViews > 0 ? (overallStats.timesViews / totalViews) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overall Market Share */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Times Network Share</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-times">
              {timesMarketShare.toFixed(1)}%
            </div>
            <Progress value={timesMarketShare} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {formatViews(overallStats.timesViews)} views
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Competition Share</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-competition">
              {(100 - timesMarketShare).toFixed(1)}%
            </div>
            <Progress value={100 - timesMarketShare} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {formatViews(overallStats.competitionViews)} views
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clusters</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusters.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Verticals tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(overallStats.timesVideos + overallStats.competitionVideos)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {formatViews(totalViews)} total views
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cluster Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Cluster Performance Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summaries.map((summary) => (
              <ClusterCard
                key={summary.cluster}
                summary={summary}
                isSelected={selectedCluster === summary.cluster}
                onClick={() => setSelectedCluster(
                  selectedCluster === summary.cluster ? null : summary.cluster
                )}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cluster Details */}
      {selectedCluster && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{selectedCluster} - Detailed Analytics</CardTitle>
            <button
              onClick={() => setSelectedCluster(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </CardHeader>
          <CardContent>
            {isLoadingDetails ? (
              <div className="space-y-4">
                <Skeleton className="h-32" />
                <Skeleton className="h-64" />
              </div>
            ) : clusterDetails ? (
              <ClusterDetailsView details={clusterDetails} />
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClusterCard({
  summary,
  isSelected,
  onClick,
}: {
  summary: ClusterSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isTimesLeading = summary.leader === 'TIMES';
  
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{summary.cluster}</h3>
        <Badge variant={isTimesLeading ? "default" : "secondary"}>
          {isTimesLeading ? (
            <Crown className="h-3 w-3 mr-1" />
          ) : null}
          {summary.leader === 'TIE' ? 'Tie' : summary.leader}
        </Badge>
      </div>

      {/* Market Share Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-times font-medium">
            TIMES {summary.timesShare.toFixed(1)}%
          </span>
          <span className="text-competition font-medium">
            COMP {summary.competitionShare.toFixed(1)}%
          </span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
          <div
            className="bg-times transition-all"
            style={{ width: `${summary.timesShare}%` }}
          />
          <div
            className="bg-competition transition-all"
            style={{ width: `${summary.competitionShare}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
        <div>
          <Eye className="h-3 w-3 inline mr-1" />
          {formatViews(summary.totalViews)} views
        </div>
        <div>
          <Video className="h-3 w-3 inline mr-1" />
          {summary.totalVideos} videos
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground truncate">
        Leader: {summary.leaderChannel || 'N/A'}
      </div>
    </button>
  );
}

function ClusterDetailsView({ details }: { details: ClusterAnalytics }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="text-sm text-muted-foreground">Total Views</div>
          <div className="text-xl font-bold">{formatViews(details.summary.totalViews)}</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="text-sm text-muted-foreground">Total Videos</div>
          <div className="text-xl font-bold">{formatNumber(details.summary.totalVideos)}</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="text-sm text-muted-foreground">Avg Engagement</div>
          <div className="text-xl font-bold">{details.summary.avgEngagement.toFixed(2)}%</div>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="text-sm text-muted-foreground">Times Share</div>
          <div className="text-xl font-bold text-times">
            {details.summary.timesMarketShare.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Side by Side Comparison */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Times Performance */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-times" />
            <h4 className="font-semibold">Times Network</h4>
            <Badge variant="outline">{details.timesPerformance.channels.length} channels</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="p-2 rounded bg-muted/30">
              <div className="text-muted-foreground text-xs">Views</div>
              <div className="font-medium">{formatViews(details.timesPerformance.totalViews)}</div>
            </div>
            <div className="p-2 rounded bg-muted/30">
              <div className="text-muted-foreground text-xs">Videos</div>
              <div className="font-medium">{details.timesPerformance.totalVideos}</div>
            </div>
            <div className="p-2 rounded bg-muted/30">
              <div className="text-muted-foreground text-xs">Avg Views</div>
              <div className="font-medium">{formatViews(details.timesPerformance.avgViews)}</div>
            </div>
          </div>

          <div className="max-h-48 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.timesPerformance.channels.map((channel) => (
                  <TableRow key={channel.channelId}>
                    <TableCell className="font-medium">{channel.rank}</TableCell>
                    <TableCell className="truncate max-w-32">{channel.channelName}</TableCell>
                    <TableCell className="text-right">{formatViews(channel.totalViews)}</TableCell>
                  </TableRow>
                ))}
                {details.timesPerformance.channels.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No Times channels in this cluster
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Competition Performance */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-competition" />
            <h4 className="font-semibold">Competition</h4>
            <Badge variant="outline">{details.competitionPerformance.channels.length} channels</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="p-2 rounded bg-muted/30">
              <div className="text-muted-foreground text-xs">Views</div>
              <div className="font-medium">{formatViews(details.competitionPerformance.totalViews)}</div>
            </div>
            <div className="p-2 rounded bg-muted/30">
              <div className="text-muted-foreground text-xs">Videos</div>
              <div className="font-medium">{details.competitionPerformance.totalVideos}</div>
            </div>
            <div className="p-2 rounded bg-muted/30">
              <div className="text-muted-foreground text-xs">Avg Views</div>
              <div className="font-medium">{formatViews(details.competitionPerformance.avgViews)}</div>
            </div>
          </div>

          <div className="max-h-48 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.competitionPerformance.channels.map((channel) => (
                  <TableRow key={channel.channelId}>
                    <TableCell className="font-medium">{channel.rank}</TableCell>
                    <TableCell className="truncate max-w-32">{channel.channelName}</TableCell>
                    <TableCell className="text-right">{formatViews(channel.totalViews)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Top Keywords */}
      {details.topKeywords.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">Top Keywords in {details.cluster}</h4>
          <div className="flex flex-wrap gap-2">
            {details.topKeywords.slice(0, 15).map((kw) => (
              <Badge key={kw.keyword} variant="outline" className="py-1">
                {kw.keyword}
                <span className="ml-1 text-muted-foreground">
                  ({kw.usageCount}x, {formatViews(kw.avgViews)} avg)
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Top Videos */}
      {details.topVideos.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">Top Performing Videos</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Engagement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.topVideos.map((video) => (
                <TableRow key={video.videoId}>
                  <TableCell className="max-w-48 truncate">
                    <a
                      href={`https://youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {video.title}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant={video.networkGroup === 'TIMES' ? 'default' : 'secondary'}>
                      {video.channelName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatViews(video.viewCount)}</TableCell>
                  <TableCell className="text-right">{video.engagementRate.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
