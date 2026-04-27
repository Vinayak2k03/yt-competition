import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { AppNavigation } from "@/components/AppNavigation";
import { VODHeader } from "@/components/vod/VODHeader";
import { VODTabNavigation, VODTabId } from "@/components/vod/VODTabNavigation";
import { VODOverviewTab } from "@/components/vod/VODOverviewTab";
import { VODVideosTab } from "@/components/vod/VODVideosTab";
import { VODKeywordsTab } from "@/components/vod/VODKeywordsTab";
import { VODTagsTab } from "@/components/vod/VODTagsTab";
import { ClusterAnalyticsTab } from "@/components/vod/ClusterAnalyticsTab";
import { VODPublishTimingTab } from "@/components/vod/VODPublishTimingTab";
import { VODEmptyState } from "@/components/vod/VODEmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getLatestVODScan,
  getVODOverview,
  getVODVideos,
  getVODKeywords,
  getVODTags,
  getVODScanHealth,
  runVODScan,
  resumeVODScan,
  VODScan,
  VODChannelOverview,
  VODVideosResponse,
  VODKeywordStat,
  VODTagStat,
  VODScanHealth,
} from "@/lib/vod-api";

export default function VOD() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<VODTabId>("overview");
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [scanStartTime, setScanStartTime] = useState<number | null>(null);
  const cancelScanRef = useRef(false);

  const [latestScan, setLatestScan] = useState<VODScan | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [scanHealth, setScanHealth] = useState<VODScanHealth | null>(null);
  const [overviewData, setOverviewData] = useState<VODChannelOverview[]>([]);
  const [videosData, setVideosData] = useState<VODVideosResponse | null>(null);
  const [keywordsData, setKeywordsData] = useState<VODKeywordStat[]>([]);
  const [tagsData, setTagsData] = useState<VODTagStat[]>([]);

  const [networkFilter, setNetworkFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");

  const activeScanId = selectedScanId || latestScan?.id || null;

  const loadLatestScan = useCallback(async () => {
    try {
      const scan = await getLatestVODScan();
      setLatestScan(scan);
      return scan;
    } catch (error) {
      console.error("Error loading latest VOD scan:", error);
      return null;
    }
  }, []);

  const loadScanData = useCallback(async (scanId: string) => {
    try {
      setIsLoading(true);
      const [overview, videos, keywords, tags, health] = await Promise.all([
        getVODOverview(scanId),
        getVODVideos({ scanId, limit: 50 }),
        getVODKeywords(scanId, 100),
        getVODTags(scanId, 100),
        getVODScanHealth(scanId).catch(() => null),
      ]);

      setOverviewData(overview);
      setVideosData(videos);
      setKeywordsData(keywords);
      setTagsData(tags);
      setScanHealth(health);
    } catch (error) {
      console.error("Error loading VOD scan data:", error);
      toast({
        title: "Error loading data",
        description: "Failed to fetch VOD dashboard data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

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

  useEffect(() => {
    if (activeScanId) {
      loadScanData(activeScanId);
    }
  }, [activeScanId, loadScanData]);

  const handleScanChange = (scanId: string | null) => {
    setSelectedScanId(scanId);
  };

  /**
   * Continues scanning automatically until complete, cancelled, or quota exhausted.
   */
  const autoResumeScan = async (scanId: string): Promise<void> => {
    let continueScanning = true;
    
    while (continueScanning) {
      // Check if scan was cancelled
      if (cancelScanRef.current) {
        toast({ title: "Scan cancelled", description: "Scan stopped by user. You can resume later." });
        cancelScanRef.current = false;
        break;
      }

      const result = await resumeVODScan(scanId);
      const summary = result.summary;
      
      // Reload data after each batch
      const scan = await loadLatestScan();
      if (scan) await loadScanData(scan.id);
      
      if (!result.success) {
        toast({ title: "Scan error", description: result.error || "Unknown error", variant: "destructive" });
        continueScanning = false;
      } else if (result.isComplete) {
        toast({
          title: "VOD Scan completed",
          description: `Fetched ${summary?.videosFetched || 0} videos from ${summary?.channelsProcessed || 0} channels.`,
        });
        continueScanning = false;
      } else if (result.completionReason === "quota_exhausted") {
        toast({
          title: "Scan paused - API quota exhausted",
          description: `Processed ${summary?.channelsProcessed}/${summary?.channelsTotal} channels. Resume tomorrow.`,
        });
        continueScanning = false;
      } else {
        // Timeout - continue automatically (no toast to reduce noise)
      }
    }
  };

  const handleCancelScan = () => {
    cancelScanRef.current = true;
  };

  const handleRunScan = async (videosPerChannel?: number) => {
    try {
      setIsScanning(true);
      setScanStartTime(Date.now());
      toast({
        title: "Daily VOD Scan started",
        description: "Scanning all channels automatically...",
      });

      // Don't specify videosPerChannel - let the API use smart default (500 for daily)
      const result = await runVODScan({ 
        dailyOnly: true,
        scanType: 'daily'
      });

      // Reload scan data regardless of success
      setSelectedScanId(null);
      const scan = await loadLatestScan();
      if (scan) await loadScanData(scan.id);

      if (result.success) {
        // If timed out, automatically continue scanning
        if (result.completionReason === "timeout" && result.scanId) {
          await autoResumeScan(result.scanId);
        } else if (result.completionReason === "quota_exhausted") {
          toast({
            title: "Scan paused - API quota exhausted",
            description: `Processed ${result.summary?.channelsProcessed} channels. Resume tomorrow.`,
          });
        } else {
          toast({
            title: "VOD Scan completed",
            description: `Fetched ${result.summary?.videosFetched || 0} videos from ${result.summary?.channelsProcessed || 0} channels.`,
          });
        }
      } else if (result.canResume) {
        // Server timed out but scan is resumable - try to auto-resume
        toast({ title: "Scan paused", description: "Auto-resuming..." });
        const latestScan = await loadLatestScan();
        if (latestScan?.id && !latestScan.is_complete) {
          await autoResumeScan(latestScan.id);
        }
      } else {
        throw new Error(result.error || "Scan failed");
      }
    } catch (error) {
      console.error("VOD Scan error:", error);
      toast({
        title: "VOD Scan failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
      setScanStartTime(null);
    }
  };

  const handleResumeScan = async () => {
    if (!latestScan?.id) return;
    
    try {
      setIsScanning(true);
      setScanStartTime(Date.now());
      toast({ title: "Resuming VOD Scan...", description: "Auto-continuing until complete..." });
      await autoResumeScan(latestScan.id);
    } catch (error) {
      console.error("Resume scan error:", error);
      toast({ title: "Resume failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsScanning(false);
      setScanStartTime(null);
    }
  };

  const renderTabContent = () => {
    if (!latestScan && !isLoading) {
      return <VODEmptyState isScanning={isScanning} onRunScan={() => handleRunScan(50)} />;
    }

    switch (activeTab) {
      case "overview":
        return (
          <VODOverviewTab
            data={overviewData}
            isLoading={isLoading}
            networkFilter={networkFilter}
            brandFilter={brandFilter}
            onNetworkChange={setNetworkFilter}
            onBrandChange={setBrandFilter}
          />
        );
      case "videos":
        return (
          <VODVideosTab
            data={videosData}
            isLoading={isLoading}
            scanId={activeScanId}
          />
        );
      case "keywords":
        return <VODKeywordsTab data={keywordsData} isLoading={isLoading} />;
      case "tags":
        return <VODTagsTab data={tagsData} isLoading={isLoading} />;
      case "clusters":
        return <ClusterAnalyticsTab scanId={activeScanId} />;
      case "publish-timing":
        return <VODPublishTimingTab scanId={activeScanId} isLoading={isLoading} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNavigation />
      <VODHeader
        lastUpdated={selectedScanId ? null : latestScan?.created_at || null}
        isScanning={isScanning}
        onRunScan={handleRunScan}
        onResumeScan={handleResumeScan}
        selectedScanId={selectedScanId}
        onScanChange={handleScanChange}
        latestScanId={latestScan?.id || null}
        scanHealth={scanHealth}
        isComplete={latestScan?.is_complete}
        completionReason={latestScan?.completion_reason}
        canResume={latestScan?.is_resumable && !latestScan?.is_complete}
        channelsProcessed={latestScan?.last_processed_channel_index}
        channelsTotal={(latestScan?.channels_succeeded || 0) + (latestScan?.channels_failed || 0) + (latestScan?.channels_partial || 0)}
        scanStartTime={scanStartTime}
        onCancelScan={handleCancelScan}
        activeScanId={activeScanId}
      />
      <VODTabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto px-4 md:px-6 py-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          </div>
        ) : (
          renderTabContent()
        )}
      </main>
    </div>
  );
}
