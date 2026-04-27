import { CheckCircle, XCircle, Loader2, Clock, Video, Radio } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface ChannelProgress {
  channelId: string;
  channelName: string;
  status: 'pending' | 'processing' | 'success' | 'partial' | 'failed';
  videosFetched?: number;
  videosRequested?: number;
  streamsFound?: number;
  errorMessage?: string | null;
}

interface ScanProgressPanelProps {
  channels: ChannelProgress[];
  scanType: 'vod' | 'live';
  totalProcessed: number;
  totalChannels: number;
  totalItems: number;
}

function getStatusIcon(status: ChannelProgress['status']) {
  switch (status) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'partial':
      return <CheckCircle className="h-4 w-4 text-amber-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusLabel(status: ChannelProgress['status'], channel: ChannelProgress, scanType: 'vod' | 'live') {
  if (status === 'pending') return 'pending';
  if (status === 'processing') return 'processing...';
  
  if (scanType === 'vod') {
    if (status === 'failed') return channel.errorMessage || 'failed';
    return `${channel.videosFetched || 0} videos`;
  } else {
    if (status === 'failed') return channel.errorMessage || 'failed';
    return `${channel.streamsFound || 0} streams`;
  }
}

export function ScanProgressPanel({
  channels,
  scanType,
  totalProcessed,
  totalChannels,
  totalItems,
}: ScanProgressPanelProps) {
  const itemLabel = scanType === 'vod' ? 'videos' : 'streams';
  const ItemIcon = scanType === 'vod' ? Video : Radio;
  
  // Show starting state when no channels loaded yet
  if (channels.length === 0) {
    return (
      <div className="mt-3 rounded-lg border bg-card/50 overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Starting scan...</span>
        </div>
      </div>
    );
  }

  // Sort: processing first, then success/partial, then pending, then failed
  const sortedChannels = [...channels].sort((a, b) => {
    const order = { processing: 0, success: 1, partial: 1, pending: 2, failed: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  return (
    <div className="mt-3 rounded-lg border bg-card/50 overflow-hidden">
      {/* Summary header */}
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
        <span className="text-sm font-medium">Channel Progress</span>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ItemIcon className="h-3.5 w-3.5" />
          <span>{totalItems} {itemLabel}</span>
        </div>
      </div>
      
      {/* Channel list */}
      <ScrollArea className="max-h-[200px]">
        <div className="divide-y">
          {sortedChannels.map((channel) => (
            <div
              key={channel.channelId}
              className={cn(
                "px-4 py-2 flex items-center justify-between text-sm",
                channel.status === 'processing' && "bg-primary/5"
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {getStatusIcon(channel.status)}
                <span className="truncate">{channel.channelName}</span>
              </div>
              <span className={cn(
                "text-xs shrink-0 ml-2",
                channel.status === 'failed' ? "text-destructive" : 
                channel.status === 'pending' ? "text-muted-foreground" :
                channel.status === 'processing' ? "text-primary" :
                "text-foreground"
              )}>
                {getStatusLabel(channel.status, channel, scanType)}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
