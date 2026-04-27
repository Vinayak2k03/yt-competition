/**
 * useScanProgress — polls backend /api/scan-progress instead of Supabase directly.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChannelProgress } from '@/components/ScanProgressPanel';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface UseScanProgressOptions {
  scanId: string | null;
  isScanning: boolean;
  scanType: 'vod' | 'live';
  pollInterval?: number;
  autoDetect?: boolean;
}

interface ScanProgressData {
  channels: ChannelProgress[];
  totalProcessed: number;
  totalItems: number;
  isLoading: boolean;
  detectedScanId: string | null;
}

export function useScanProgress({
  scanId,
  isScanning,
  scanType,
  pollInterval = 2000,
  autoDetect = false,
}: UseScanProgressOptions): ScanProgressData {
  const [channels, setChannels] = useState<ChannelProgress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [detectedScanId, setDetectedScanId] = useState<string | null>(null);
  const scanStartTimestampRef = useRef<string | null>(null);

  const effectiveScanId = scanId || detectedScanId;

  // Auto-detect: poll for a new scan created after we started scanning
  useEffect(() => {
    if (!autoDetect || !isScanning || scanId) return;
    if (!scanStartTimestampRef.current) {
      scanStartTimestampRef.current = new Date().toISOString();
    }

    const detect = async () => {
      const params = new URLSearchParams({ scanType, since: scanStartTimestampRef.current! });
      const res = await fetch(`${API_URL}/api/scan-progress?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.detectedScanId) setDetectedScanId(data.detectedScanId);
    };

    detect();
    const interval = setInterval(detect, 1000);
    return () => clearInterval(interval);
  }, [autoDetect, isScanning, scanId, scanType]);

  // Reset when scanning stops
  useEffect(() => {
    if (!isScanning) scanStartTimestampRef.current = null;
  }, [isScanning]);

  const fetchProgress = useCallback(async () => {
    if (!effectiveScanId) return;
    try {
      const params = new URLSearchParams({ scanId: effectiveScanId, scanType });
      const res = await fetch(`${API_URL}/api/scan-progress?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch (err) {
      console.error('Error fetching scan progress:', err);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveScanId, scanType]);

  // Initial fetch
  useEffect(() => {
    if (effectiveScanId && isScanning) {
      setIsLoading(true);
      fetchProgress();
    }
  }, [effectiveScanId, isScanning, fetchProgress]);

  // Poll while scanning
  useEffect(() => {
    if (!effectiveScanId || !isScanning) return;
    const interval = setInterval(fetchProgress, pollInterval);
    return () => clearInterval(interval);
  }, [effectiveScanId, isScanning, pollInterval, fetchProgress]);

  // Clear state after scan stops (with delay to show final state)
  useEffect(() => {
    if (!isScanning) {
      const timeout = setTimeout(() => {
        if (!isScanning) { setChannels([]); setDetectedScanId(null); }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isScanning]);

  const totalProcessed = channels.filter(
    (c) => c.status === 'success' || c.status === 'partial' || c.status === 'failed',
  ).length;

  const totalItems =
    scanType === 'vod'
      ? channels.reduce((sum, c) => sum + (c.videosFetched || 0), 0)
      : channels.reduce((sum, c) => sum + (c.streamsFound || 0), 0);

  return { channels, totalProcessed, totalItems, isLoading, detectedScanId };
}
