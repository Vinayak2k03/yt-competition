import { Video, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VODEmptyStateProps {
  isScanning: boolean;
  onRunScan: () => void;
}

export function VODEmptyState({ isScanning, onRunScan }: VODEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Video className="h-16 w-16 text-muted-foreground mb-4" />
      <h2 className="text-2xl font-semibold mb-2">No VOD Data Yet</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Run your first VOD scan to analyze past videos from your tracked channels. 
        This will fetch video metadata, views, engagement metrics, and more.
      </p>
      <Button onClick={onRunScan} disabled={isScanning} size="lg">
        <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? "animate-spin" : ""}`} />
        {isScanning ? "Scanning..." : "Run First VOD Scan"}
      </Button>
      <p className="text-sm text-muted-foreground mt-4">
        Estimated: ~3 API units per channel (for 50 videos each)
      </p>
    </div>
  );
}
