import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, History, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getVODScans, VODScan, formatDateTime } from "@/lib/vod-api";

interface VODScanSelectorProps {
  selectedScanId: string | null;
  onScanChange: (scanId: string | null) => void;
  latestScanId: string | null;
}

export function VODScanSelector({ selectedScanId, onScanChange, latestScanId }: VODScanSelectorProps) {
  const [scans, setScans] = useState<VODScan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);

  const loadScans = async () => {
    try {
      setIsLoading(true);
      const data = await getVODScans(50);
      
      // Filter by date if selected
      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        
        const filtered = data.filter(scan => {
          const scanDate = new Date(scan.created_at);
          return scanDate >= startOfDay && scanDate <= endOfDay;
        });
        setScans(filtered);
      } else {
        setScans(data);
      }
    } catch (error) {
      console.error("Error loading VOD scans:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScans();
  }, [date]);

  const handleDateSelect = (newDate: Date | undefined) => {
    setDate(newDate);
  };

  const handleScanSelect = (scanId: string) => {
    if (scanId === "latest") {
      onScanChange(null);
    } else {
      onScanChange(scanId);
    }
    setIsOpen(false);
  };

  const handleViewLatest = () => {
    setDate(undefined);
    onScanChange(null);
    setIsOpen(false);
  };

  const selectedScan = scans.find(s => s.id === selectedScanId);
  const isViewingLatest = !selectedScanId || selectedScanId === latestScanId;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 min-w-[180px] justify-between",
            !isViewingLatest && "border-primary text-primary"
          )}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {isViewingLatest ? (
              <span>Latest Scan</span>
            ) : selectedScan ? (
              <span>{formatDateTime(selectedScan.created_at)}</span>
            ) : (
              <span>Select Scan</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-popover border border-border shadow-lg z-50" align="end">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between gap-4 mb-3">
            <span className="text-sm font-medium">View Historical Data</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewLatest}
              className="h-7 text-xs"
            >
              View Latest
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-[160px] justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "MMM d, yyyy") : "Filter by date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover border border-border shadow-lg z-50" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={handleDateSelect}
                  disabled={(d) => d > new Date()}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {date && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDateSelect(undefined)}
                className="h-8 px-2"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              Loading scans...
            </div>
          ) : scans.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              No scans found for this date
            </div>
          ) : (
            <div className="space-y-1">
              {scans.map((scan) => (
                <button
                  key={scan.id}
                  onClick={() => handleScanSelect(scan.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                    "hover:bg-secondary",
                    selectedScanId === scan.id && "bg-primary/10 text-primary"
                  )}
                >
                  <span>{formatDateTime(scan.created_at)}</span>
                  <span className="text-xs text-muted-foreground">
                    {scan.total_videos_fetched} videos
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
