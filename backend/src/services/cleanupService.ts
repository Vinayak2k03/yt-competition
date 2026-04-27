import { prisma } from '../db.js';

const RETENTION_DAYS = 30;

export async function cleanupOldData() {
  console.log(`[Cleanup] Starting automatic cleanup of data older than ${RETENTION_DAYS} days...`);
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    // Delete old Live Scans. 
    // Due to 'onDelete: Cascade' in the Prisma schema, this will automatically delete all associated:
    // - YtStreamScanMetric
    // - YtScanChannelSummary
    // - YtScanKeywordStat
    // - YtScanTagStat
    // - YtScanChannelStatus
    const deletedLiveScans = await prisma.ytScan.deleteMany({
      where: { createdAt: { lt: cutoffDate } }
    });
    
    // Delete old VOD Scans.
    // Due to 'onDelete: Cascade' in the Prisma schema, this will automatically delete all associated:
    // - YtVodMetric
    // - YtVodScanChannelStatus
    // - YtVodScanVideoStatus
    // - YtVodKeywordStat
    // - YtVodTagStat
    const deletedVodScans = await prisma.ytVodScan.deleteMany({
      where: { createdAt: { lt: cutoffDate } }
    });

    console.log(`[Cleanup] Deleted ${deletedLiveScans.count} old Live Scans and ${deletedVodScans.count} old VOD Scans.`);
    console.log(`[Cleanup] Cleanup completed successfully.`);
  } catch (error) {
    console.error(`[Cleanup] Error during automatic cleanup:`, error);
  }
}

// Start a background interval to run cleanup daily
export function startCleanupJob() {
  // Run once on startup
  cleanupOldData();
  
  // Then run every 24 hours
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(cleanupOldData, ONE_DAY_MS);
}
