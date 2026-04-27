import { useState } from "react";
import { RefreshCw, AlertTriangle, Video, Play, Clock, Square, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatDateTime } from "@/lib/vod-api";
import { VODScanHealth } from "@/lib/vod-api";
import { VODScanSelector } from "./VODScanSelector";
import { ScanProgressPanel } from "@/components/ScanProgressPanel";
import { useScanProgress } from "@/hooks/useScanProgress";

interface VODHeaderProps {
  lastUpdated: string | null;
  isScanning: boolean;
  onRunScan: (videosPerChannel?: number) => void;
  onResumeScan?: () => void;
  onCancelScan?: () => void;
  selectedScanId: string | null;
  onScanChange: (scanId: string | null) => void;
  latestScanId: string | null;
  scanHealth: VODScanHealth | null;
  isComplete?: boolean;
  completionReason?: string | null;
  canResume?: boolean;
  channelsProcessed?: number;
  channelsTotal?: number;
  scanStartTime?: number | null;
  activeScanId?: string | null;
}

/**
 * Formats seconds into a human-readable time string (e.g., "2m 30s")
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function VODHeader({
  lastUpdated,
  isScanning,
  onRunScan,
  onResumeScan,
  onCancelScan,
  selectedScanId,
  onScanChange,
  latestScanId,
  isComplete,
  completionReason,
  canResume,
  channelsProcessed = 0,
  channelsTotal = 0,
  scanStartTime,
  activeScanId,
}: VODHeaderProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  // Use the scan progress hook - prioritize activeScanId when scanning
  const progressScanId = isScanning ? activeScanId : (activeScanId || latestScanId);
  const { channels: progressChannels, totalItems: videosFetched } = useScanProgress({
    scanId: progressScanId,
    isScanning,
    scanType: 'vod',
    autoDetect: true,
  });
  
  // Calculate progress from real-time data or fallback to props
  const realTimeProcessed = progressChannels.filter(
    c => c.status === 'success' || c.status === 'partial' || c.status === 'failed'
  ).length;
  const realTimeTotalChannels = progressChannels.length;
  
  const displayProcessed = realTimeProcessed > 0 ? realTimeProcessed : channelsProcessed;
  const displayTotal = realTimeTotalChannels > 0 ? realTimeTotalChannels : channelsTotal;
  
  const showProgress = isScanning && displayTotal > 0;
  const progressPercent = displayTotal > 0 ? Math.round((displayProcessed / displayTotal) * 100) : 0;
  const showResume = !isComplete && completionReason === "timeout" && canResume && !isScanning;

  // Calculate ETA based on elapsed time and channels processed
  const getEstimatedTimeRemaining = (): string | null => {
    if (!scanStartTime || displayProcessed <= 0 || displayTotal <= 0) return null;
    
    const elapsedMs = Date.now() - scanStartTime;
    const avgMsPerChannel = elapsedMs / displayProcessed;
    const remainingChannels = displayTotal - displayProcessed;
    const remainingMs = avgMsPerChannel * remainingChannels;
    
    return formatTimeRemaining(remainingMs / 1000);
  };

  const eta = getEstimatedTimeRemaining();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Video className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">VOD Analysis</h1>
            </div>
            <nav className="flex items-center gap-2 ml-6">
              <NavLink to="/">Live Streams</NavLink>
              <NavLink to="/vod">VOD</NavLink>
              <NavLink to="/api-keys">API Keys</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {completionReason === "quota_exhausted" && (
              <div className="flex items-center gap-2 text-warning text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Partial data (quota exhausted)</span>
              </div>
            )}
            {showResume && (
              <div className="flex items-center gap-2 text-amber-500 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Scan incomplete ({channelsProcessed}/{channelsTotal} channels)</span>
              </div>
            )}
            <VODScanSelector
              selectedScanId={selectedScanId}
              onScanChange={onScanChange}
              latestScanId={latestScanId}
            />
            {lastUpdated && (
              <span className="text-sm text-muted-foreground">
                Last scan: {formatDateTime(lastUpdated)}
              </span>
            )}
            {isScanning ? (
              <Button onClick={onCancelScan} size="sm" variant="destructive">
                <Square className="h-4 w-4 mr-2" />
                Stop Scan
              </Button>
            ) : showResume && onResumeScan ? (
              <Button onClick={onResumeScan} size="sm" variant="default">
                <Play className="h-4 w-4 mr-2" />
                Resume Scan
              </Button>
            ) : (
              <Button onClick={() => onRunScan(10)} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Run Daily Scan
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
        
        {/* Progress bar during scanning */}
        {showProgress && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Scanning channels...</span>
                <div className="flex items-center gap-4">
                  {eta && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      ~{eta} remaining
                    </span>
                  )}
                  <span>{displayProcessed} / {displayTotal} ({progressPercent}%)</span>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2 gap-1">
                      {showDetails ? 'Hide' : 'Details'}
                      <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
              <Progress value={progressPercent} className="h-2" />
              
              <CollapsibleContent>
                <ScanProgressPanel
                  channels={progressChannels}
                  scanType="vod"
                  totalProcessed={displayProcessed}
                  totalChannels={displayTotal}
                  totalItems={videosFetched}
                />
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}
      </div>
    </header>
  );
}
