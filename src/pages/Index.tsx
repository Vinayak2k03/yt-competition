import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const _API_URL = import.meta.env.VITE_API_URL ?? 'https://watchmonitor.sociofyme.com/yt-competition';
const _authHdr = () => { return { 'Content-Type': 'application/json' }; };
import { AppNavigation } from "@/components/AppNavigation";
import { TabNavigation, TabId } from "@/components/dashboard/TabNavigation";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { TopStreamsTab } from "@/components/dashboard/TopStreamsTab";
import { WordCloudTab } from "@/components/dashboard/WordCloudTab";
import { HashtagsTab } from "@/components/dashboard/HashtagsTab";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { LastUpdatedBadge } from "@/components/dashboard/LastUpdatedBadge";
import { ScanSelector } from "@/components/dashboard/ScanSelector";
import { ScanProgressPanel } from "@/components/ScanProgressPanel";
import { useScanProgress } from "@/hooks/useScanProgress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getLatestScan,
  getOverview,
  getTopStreams,
  getTitleWordCloud,
  getHashtagRanking,
  getScanHealth,
  runScan,
  formatDateTime,
  LatestScan,
  OverviewItem,
  TopStream,
  KeywordStat,
  TagStat,
  ScanHealth,
} from "@/lib/api";

export default function Index() {
  const { toast } = useToast();
  const isAdmin = true;
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [progressExpanded, setProgressExpanded] = useState(false);

  const [latestScan, setLatestScan] = useState<LatestScan | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [scanHealth, setScanHealth] = useState<ScanHealth | null>(null);
  const [overviewData, setOverviewData] = useState<OverviewItem[]>([]);
  const [topStreamsData, setTopStreamsData] = useState<TopStream[]>([]);
  const [wordCloudData, setWordCloudData] = useState<KeywordStat[]>([]);
  const [hashtagsData, setHashtagsData] = useState<TagStat[]>([]);

  const [networkFilter, setNetworkFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");

  // Onboarding status queries
  const { data: apiKeysCount } = useQuery({
    queryKey: ['api-keys-count'],
    queryFn: async () => {
      const res = await fetch(`${_API_URL}/api/yt-api-keys/count`, { headers: _authHdr() });
      if (!res.ok) return 0;
      const data = await res.json();
      return (data.count as number) || 0;
    },
  });

  const { data: channelsCount } = useQuery({
    queryKey: ['channels-count'],
    queryFn: async () => {
      const res = await fetch(`${_API_URL}/api/yt-channels/count`, { headers: _authHdr() });
      if (!res.ok) return 0;
      const data = await res.json();
      return (data.count as number) || 0;
    },
  });

  // The scan ID to use for data fetching (selected or latest)
  const activeScanId = selectedScanId || latestScan?.id || null;

  // Progress tracking for live scans — auto-detect scan ID from DB
  const { channels: progressChannels, totalItems: streamsFound, totalProcessed } = useScanProgress({
    scanId: null,
    isScanning,
    scanType: 'live',
    autoDetect: true,
  });

  const progressTotal = progressChannels.length;
  const progressPercent = progressTotal > 0 ? Math.round((totalProcessed / progressTotal) * 100) : 0;

  const loadLatestScan = useCallback(async () => {
    try {
      const scan = await getLatestScan();
      setLatestScan(scan);
      return scan;
    } catch (error) {
      console.error("Error loading latest scan:", error);
      return null;
    }
  }, []);

  const loadScanData = useCallback(async (scanId: string) => {
    try {
      setIsLoading(true);
      const [overview, streams, wordCloud, hashtags, health] = await Promise.all([
        getOverview(scanId),
        getTopStreams(scanId),
        getTitleWordCloud(scanId),
        getHashtagRanking(scanId),
        getScanHealth(scanId).catch(() => null),
      ]);

      setOverviewData(overview);
      setTopStreamsData(streams);
      setWordCloudData(wordCloud);
      setHashtagsData(hashtags);
      setScanHealth(health);
    } catch (error) {
      console.error("Error loading scan data:", error);
      toast({
        title: "Error loading data",
        description: "Failed to fetch dashboard data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const scan = await loadLatestScan();
      if (scan) {
        await loadScanData(scan.id);
      } else {
        setIsLoading(false);
      }
    };
    init();
  }, [loadLatestScan, loadScanData]);

  // Load data when selected scan changes
  useEffect(() => {
    if (activeScanId) {
      loadScanData(activeScanId);
    }
  }, [activeScanId, loadScanData]);

  const handleScanChange = (scanId: string | null) => {
    setSelectedScanId(scanId);
  };

  const handleRunScan = async () => {
    try {
      setIsScanning(true);
      toast({
        title: "Scan started",
        description: "Scanning YouTube channels for live streams...",
      });

      const result = await runScan();

      if (result.success) {
        toast({
          title: "Scan completed",
          description: `Found ${result.liveStreamsFound || 0} live streams.`,
        });
        // Reset to latest scan and reload
        setSelectedScanId(null);
        const scan = await loadLatestScan();
        if (scan) {
          await loadScanData(scan.id);
        }
      } else {
        throw new Error(result.error || "Scan failed");
      }
    } catch (error) {
      console.error("Scan error:", error);
      toast({
        title: "Scan failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleChannelRefreshComplete = async () => {
    // Reload the current scan data to reflect the refreshed channel
    if (activeScanId) {
      await loadScanData(activeScanId);
    }
  };

  const totalChannels = scanHealth
    ? scanHealth.channelsSucceeded + scanHealth.channelsFailed + scanHealth.channelsPartial
    : 0;
  const hasIssues = scanHealth && (scanHealth.channelsFailed > 0 || scanHealth.channelsPartial > 0);
  const failedChannels = scanHealth?.channels.filter(c => c.status === 'failed') || [];

  const hasApiKeys = (apiKeysCount || 0) > 0;
  const hasChannels = (channelsCount || 0) > 0;
  const hasScans = !!latestScan;
  const showOnboarding = !hasApiKeys || !hasChannels || !hasScans;

  const renderTabContent = () => {
    if (!latestScan && !isLoading) {
      return <EmptyState isScanning={isScanning} onRunScan={handleRunScan} />;
    }

    if (isLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "overview":
        return (
          <OverviewTab
            data={overviewData}
            isLoading={isLoading}
            networkFilter={networkFilter}
            brandFilter={brandFilter}
            onNetworkChange={setNetworkFilter}
            onBrandChange={setBrandFilter}
            onRefreshComplete={handleChannelRefreshComplete}
          />
        );
      case "top-streams":
        return <TopStreamsTab data={topStreamsData} isLoading={isLoading} />;
      case "word-cloud":
        return <WordCloudTab data={wordCloudData} isLoading={isLoading} />;
      case "hashtags":
        return <HashtagsTab data={hashtagsData} isLoading={isLoading} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNavigation />

      {/* Sub-header with scan controls */}
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">Live Streams</h2>

              {latestScan && (
                <LastUpdatedBadge timestamp={latestScan.created_at} />
              )}

              {/* Scan Health Indicator */}
              {scanHealth && totalChannels > 0 && (
                <Collapsible open={healthExpanded} onOpenChange={setHealthExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`gap-2 h-7 ${hasIssues ? 'text-amber-600' : 'text-green-600'}`}
                    >
                      {hasIssues ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      <span className="text-xs font-medium">
                        {scanHealth.channelsSucceeded}/{totalChannels}
                      </span>
                      {hasIssues && (
                        healthExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              )}
            </div>

            <div className="flex items-center gap-2">
              <ScanSelector
                selectedScanId={selectedScanId}
                onScanChange={handleScanChange}
                latestScanId={latestScan?.id || null}
              />

              <Button
                onClick={handleRunScan}
                disabled={isScanning || !hasApiKeys || !hasChannels}
                size="sm"
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isScanning ? 'Scanning...' : 'Run scan'}</span>
              </Button>
            </div>
          </div>

          {/* Progress bar during scanning */}
          {isScanning && progressTotal > 0 && (
            <Collapsible open={progressExpanded} onOpenChange={setProgressExpanded}>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Scanning channels...</span>
                  <div className="flex items-center gap-4">
                    <span>{totalProcessed} / {progressTotal} ({progressPercent}%)</span>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 px-2 gap-1">
                        {progressExpanded ? 'Hide' : 'Details'}
                        <ChevronDown className={`h-3 w-3 transition-transform ${progressExpanded ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <Progress value={progressPercent} className="h-2" />

                <CollapsibleContent>
                  <ScanProgressPanel
                    channels={progressChannels}
                    scanType="live"
                    totalProcessed={totalProcessed}
                    totalChannels={progressTotal}
                    totalItems={streamsFound}
                  />
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
          {/* Expanded scan health details */}
          {scanHealth && healthExpanded && hasIssues && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {scanHealth.channelsSucceeded} succeeded
                </Badge>
                {scanHealth.channelsFailed > 0 && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    {scanHealth.channelsFailed} failed
                  </Badge>
                )}
                {scanHealth.channelsPartial > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-700">
                    {scanHealth.channelsPartial} partial
                  </Badge>
                )}
              </div>
              {failedChannels.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium">Failed channels:</span>{' '}
                  {failedChannels.map(c => c.channelName).join(', ')}
                </div>
              )}
            </div>
          )}


          {latestScan?.hasNewerFailedScans && latestScan?.failedScanCount && latestScan.failedScanCount > 0 && (
            <Alert variant="destructive" className="mt-3 bg-amber-500/10 border-amber-500/30 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Showing data from {formatDateTime(latestScan.created_at)}. {latestScan.failedScanCount} recent scan{latestScan.failedScanCount > 1 ? 's' : ''} returned no data.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="container mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Onboarding Checklist */}
        {showOnboarding && (
          <OnboardingChecklist
            hasApiKeys={hasApiKeys}
            hasChannels={hasChannels}
            hasScans={hasScans}
            isAdmin={isAdmin}
            onRunScan={handleRunScan}
            isScanning={isScanning}
          />
        )}

        {renderTabContent()}
      </main>
    </div>
  );
}
