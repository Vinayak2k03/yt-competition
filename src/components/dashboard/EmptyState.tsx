import { RefreshCw, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  isScanning: boolean;
  onRunScan: () => void;
}

export function EmptyState({ isScanning, onRunScan }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="p-4 bg-primary/10 rounded-full mb-4">
        <Radar className="h-12 w-12 text-primary" />
      </div>
      <h2 className="text-xl font-semibold mb-2">No Scan Data Available</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Run your first scan to start monitoring YouTube Live streams across Times Network and competitor channels.
      </p>
      <Button onClick={onRunScan} disabled={isScanning} className="gap-2">
        <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
        {isScanning ? 'Scanning...' : 'Run first scan'}
      </Button>
    </div>
  );
}
