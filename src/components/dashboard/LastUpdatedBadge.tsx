import { Clock, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, differenceInHours } from 'date-fns';

interface LastUpdatedBadgeProps {
  timestamp: string | null;
  staleThresholdHours?: number;
  showRelative?: boolean;
}

export function LastUpdatedBadge({ 
  timestamp, 
  staleThresholdHours = 2,
  showRelative = true 
}: LastUpdatedBadgeProps) {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  const hoursAgo = differenceInHours(new Date(), date);
  const isStale = hoursAgo >= staleThresholdHours;
  const relativeTime = formatDistanceToNow(date, { addSuffix: true });
  
  const formattedDate = date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant={isStale ? 'destructive' : 'secondary'} 
          className={`gap-1 font-normal ${isStale ? 'bg-amber-500/20 text-amber-700 hover:bg-amber-500/30 border-amber-500/30' : ''}`}
        >
          {isStale ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {showRelative ? relativeTime : formattedDate}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{formattedDate}</p>
        {isStale && (
          <p className="text-xs text-amber-500">Data may be stale. Consider running a new scan.</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
