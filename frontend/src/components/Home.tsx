import { useEffect, useState, useRef, useCallback } from "react";
import { Download, Pause, Play, X, ChevronDown, ChevronUp } from "lucide-react";
import {
  AllDownloads,
  PauseDownload,
  ResumeDownload,
  CancelDownload,
} from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import * as models from "../../wailsjs/go/models";

const AppDownloadState = {
  Active: 0,
  Paused: 1,
  Cancelled: 2,
  Completed: 3,
};

interface ChunkUpdateEvent {
  downloadId: number;
  chunkIndex: number;
  chunkId: number;
  written: number;
  size: number;
  state: number;
}

interface DownloadUpdateEvent {
  downloadId: number;
  state: number;
}

interface DownloadStats {
  progress: number;
  speed: number;
  eta: number;
  totalWritten: number;
  lastUpdateTime: number;
  lastTotalWritten: number;
}

const getDownloadStateString = (state: number) => {
  switch (state) {
    case AppDownloadState.Active:
      return "Downloading";
    case AppDownloadState.Paused:
      return "Paused";
    case AppDownloadState.Cancelled:
      return "Cancelled";
    case AppDownloadState.Completed:
      return "Completed";
    default:
      return "Unknown";
  }
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatSpeed = (bytesPerSecond: number) => {
  return formatBytes(bytesPerSecond) + "/s";
};

const formatTime = (seconds: number) => {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "--";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const getStateColor = (state: number) => {
  switch (state) {
    case AppDownloadState.Active:
      return "text-blue-600";
    case AppDownloadState.Paused:
      return "text-yellow-600";
    case AppDownloadState.Cancelled:
      return "text-red-600";
    case AppDownloadState.Completed:
      return "text-green-600";
    default:
      return "text-gray-600";
  }
};

const getProgressColor = (state: number) => {
  switch (state) {
    case AppDownloadState.Active:
      return "bg-blue-500";
    case AppDownloadState.Paused:
      return "bg-yellow-500";
    case AppDownloadState.Cancelled:
      return "bg-red-500";
    case AppDownloadState.Completed:
      return "bg-green-500";
    default:
      return "bg-gray-300";
  }
};

const getChunkStateColor = (state: number, progress: number = 0) => {
  switch (state) {
    case AppDownloadState.Active:
      if (progress > 80) return "bg-blue-500";
      if (progress > 40) return "bg-blue-400";
      if (progress > 0) return "bg-blue-300";
      return "bg-blue-200";
    case AppDownloadState.Paused:
      if (progress > 80) return "bg-yellow-500";
      if (progress > 40) return "bg-yellow-400";
      if (progress > 0) return "bg-yellow-300";
      return "bg-yellow-200";
    case AppDownloadState.Cancelled:
      return "bg-red-400";
    case AppDownloadState.Completed:
      return "bg-green-500";
    default:
      return "bg-gray-200";
  }
};

const getCorrectDownloadState = (download: models.main.Download): number => {
  if (!download.chunk_info || download.chunk_info.length === 0) {
    return download.state;
  }

  const completedChunks = download.chunk_info.filter(
    (chunk) => chunk.state === AppDownloadState.Completed,
  ).length;

  const cancelledChunks = download.chunk_info.filter(
    (chunk) => chunk.state === AppDownloadState.Cancelled,
  ).length;

  const activeChunks = download.chunk_info.filter(
    (chunk) => chunk.state === AppDownloadState.Active,
  ).length;

  if (completedChunks === download.chunks && download.chunks > 0) {
    return AppDownloadState.Completed;
  }

  if (cancelledChunks > 0) {
    return AppDownloadState.Cancelled;
  }

  if (activeChunks > 0) {
    return AppDownloadState.Active;
  }

  const pausedOrCompletedChunks = download.chunk_info.filter(
    (chunk) =>
      chunk.state === AppDownloadState.Paused ||
      chunk.state === AppDownloadState.Completed,
  ).length;

  if (pausedOrCompletedChunks === download.chunk_info.length) {
    return AppDownloadState.Paused;
  }

  return download.state;
};

function updateDownload(
  prev: models.main.Download[],
  downloadId: number,
  updater: (dl: models.main.Download) => models.main.Download,
): models.main.Download[] {
  return prev.map((dl) => {
    if (dl.id === downloadId) {
      return updater(dl);
    }
    return dl;
  });
}

export default function Home() {
  const [downloads, setDownloads] = useState<models.main.Download[]>([]);
  const [expandedDownloads, setExpandedDownloads] = useState<Set<number>>(
    new Set(),
  );
  const [downloadStats, setDownloadStats] = useState<
    Record<number, DownloadStats>
  >({});

  const eventCleanupRef = useRef<(() => void)[]>([]);
  const statsIntervalRef = useRef<number | null>(null);
  const downloadsRef = useRef<models.main.Download[]>([]);
  const statsRef = useRef<Record<number, DownloadStats>>({});

  useEffect(() => {
    downloadsRef.current = downloads;
  }, [downloads]);

  useEffect(() => {
    statsRef.current = downloadStats;
  }, [downloadStats]);

  const calculateDownloadStats = useCallback(
    (download: models.main.Download): DownloadStats => {
      const totalWritten =
        download.chunk_info?.reduce((sum, chunk) => sum + chunk.written, 0) ||
        0;
      const progress =
        download.size > 0 ? (totalWritten / download.size) * 100 : 0;

      const currentTime = Date.now();
      const lastStats = statsRef.current[download.id];

      let speed = 0;
      let eta = 0;

      if (lastStats && download.state === AppDownloadState.Active) {
        const timeDiff = (currentTime - lastStats.lastUpdateTime) / 1000;
        const bytesDiff = totalWritten - lastStats.lastTotalWritten;

        if (timeDiff > 0 && bytesDiff > 0) {
          speed = bytesDiff / timeDiff;
          const remainingBytes = download.size - totalWritten;
          eta = speed > 0 ? remainingBytes / speed : 0;
        } else if (lastStats.speed > 0) {
          speed = lastStats.speed * 0.8;
          const remainingBytes = download.size - totalWritten;
          eta = speed > 0 ? remainingBytes / speed : 0;
        }
      }

      return {
        progress: Math.min(progress, 100),
        speed,
        eta,
        totalWritten,
        lastUpdateTime: currentTime,
        lastTotalWritten: totalWritten,
      };
    },
    [],
  );

  const initializeDownloads = async () => {
    try {
      const data = await AllDownloads();
      const downloadsData = data || [];

      const correctedDownloads = downloadsData.map((dl) => {
        const correctState = getCorrectDownloadState(dl);
        const completedChunks =
          dl.chunk_info?.filter(
            (chunk) => chunk.state === AppDownloadState.Completed,
          ).length || 0;

        return {
          ...dl,
          state: correctState,
          completed_chunks: completedChunks,
        };
      });
      //@ts-ignore
      setDownloads(correctedDownloads);

      const initialStats: Record<number, DownloadStats> = {};
      correctedDownloads.forEach((dl) => {
        //@ts-ignore
        initialStats[dl.id] = calculateDownloadStats(dl);
      });
      setDownloadStats(initialStats);
    } catch (error) {
      console.error("Failed to fetch downloads:", error);
      setDownloads([]);
    }
  };

  const toggleExpanded = (downloadId: number) => {
    setExpandedDownloads((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(downloadId)) {
        newExpanded.delete(downloadId);
      } else {
        newExpanded.add(downloadId);
      }
      return newExpanded;
    });
  };

  const getFileName = (url: string) => {
    return url.split("/").pop() || "Unknown File";
  };

  useEffect(() => {
    eventCleanupRef.current.forEach((cleanup) => cleanup());
    eventCleanupRef.current = [];

    const chunkUpdateCleanup = EventsOn(
      "chunkUpdate",
      (payload: ChunkUpdateEvent) => {
        console.log("Chunk update received:", payload);

        setDownloads((prev) =>
          // @ts-ignore
          updateDownload(prev, payload.downloadId, (dl) => {
            if (!dl.chunk_info) return dl;

            const updatedChunks = dl.chunk_info.map((chunk) => {
              if (
                (payload.chunkId !== 0 && chunk.id === payload.chunkId) ||
                chunk.index === payload.chunkIndex
              ) {
                return {
                  ...chunk,
                  written: payload.written,
                  state: payload.state,
                };
              }
              return chunk;
            });

            const completed = updatedChunks.filter(
              (c) => c.state === AppDownloadState.Completed,
            ).length;

            let newState = dl.state;
            if (completed === dl.chunks && dl.chunks > 0) {
              newState = AppDownloadState.Completed;
            } else if (
              updatedChunks.some((c) => c.state === AppDownloadState.Active)
            ) {
              newState = AppDownloadState.Active;
            } else if (
              updatedChunks.every(
                (c) =>
                  c.state === AppDownloadState.Paused ||
                  c.state === AppDownloadState.Completed,
              )
            ) {
              newState = AppDownloadState.Paused;
            }

            return {
              ...dl,
              chunk_info: updatedChunks,
              completed_chunks: completed,
              state: newState,
            };
          }),
        );
      },
    );

    const downloadUpdateCleanup = EventsOn(
      "downloadUpdate",
      (payload: DownloadUpdateEvent) => {
        console.log("Download update received:", payload);

        setDownloads((prev) =>
          // @ts-ignore
          updateDownload(prev, payload.downloadId, (dl) => {
            const completed =
              dl.chunk_info?.filter(
                (c) => c.state === AppDownloadState.Completed,
              ).length ?? 0;

            return {
              ...dl,
              state: payload.state,
              completed_chunks: completed,
            };
          }),
        );
      },
    );

    eventCleanupRef.current = [chunkUpdateCleanup, downloadUpdateCleanup];

    return () => {
      eventCleanupRef.current.forEach((cleanup) => cleanup());
      eventCleanupRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    statsIntervalRef.current = setInterval(() => {
      const currentDownloads = downloadsRef.current;
      if (currentDownloads.length === 0) return;

      const newStats: Record<number, DownloadStats> = {};
      currentDownloads.forEach((dl) => {
        newStats[dl.id] = calculateDownloadStats(dl);
      });

      setDownloadStats(newStats);
    }, 1000);

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [calculateDownloadStats]);

  useEffect(() => {
    initializeDownloads();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Download className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-800">Download Manager</h1>
        </div>

        {downloads.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="text-gray-400 mb-2">
              <Download className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-gray-500">No active downloads</p>
          </div>
        ) : (
          <div className="space-y-4">
            {downloads.map((dl) => {
              const stats = downloadStats[dl.id] || calculateDownloadStats(dl);
              const isExpanded = expandedDownloads.has(dl.id);

              return (
                <div
                  key={dl.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Main download info */}
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-800 truncate">
                          {getFileName(dl.url)}
                        </h3>
                        <p className="text-sm text-gray-500 truncate mt-1">
                          {dl.url}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{dl.path}</p>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <span
                          className={`text-sm font-medium px-2 py-1 rounded-full ${getStateColor(dl.state)} bg-opacity-10`}
                        >
                          {getDownloadStateString(dl.state)}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">
                          {formatBytes(stats.totalWritten)} /{" "}
                          {formatBytes(dl.size)}
                        </span>
                        <span className="text-gray-600 font-medium">
                          {stats.progress.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ease-out ${getProgressColor(dl.state)}`}
                          style={{ width: `${Math.min(stats.progress, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <span className="text-gray-500 block text-xs">
                          Speed
                        </span>
                        <p className="font-semibold text-lg">
                          {dl.state === AppDownloadState.Active &&
                          stats.speed > 0
                            ? formatSpeed(stats.speed)
                            : "--"}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <span className="text-gray-500 block text-xs">ETA</span>
                        <p className="font-semibold text-lg">
                          {dl.state === AppDownloadState.Active && stats.eta > 0
                            ? formatTime(stats.eta)
                            : "--"}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <span className="text-gray-500 block text-xs">
                          Chunks
                        </span>
                        <p className="font-semibold text-lg">
                          {dl.completed_chunks}/{dl.chunks}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <span className="text-gray-500 block text-xs">
                          Size
                        </span>
                        <p className="font-semibold text-lg">
                          {formatBytes(dl.size)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        {dl.state === AppDownloadState.Active && (
                          <button
                            onClick={() => PauseDownload(dl.id)}
                            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Pause className="w-4 h-4" />
                            Pause
                          </button>
                        )}
                        {dl.state === AppDownloadState.Paused && (
                          <button
                            onClick={() => ResumeDownload(dl.id)}
                            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Play className="w-4 h-4" />
                            Resume
                          </button>
                        )}
                        {dl.state !== AppDownloadState.Completed && (
                          <button
                            onClick={() => CancelDownload(dl.id)}
                            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        )}
                      </div>

                      {dl.chunk_info && dl.chunk_info.length > 0 && (
                        <button
                          onClick={() => toggleExpanded(dl.id)}
                          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              Show Details
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded chunk details */}
                  {isExpanded && dl.chunk_info && dl.chunk_info.length > 0 && (
                    <div className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-6">
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          Chunk Progress Heatmap
                        </h4>

                        {/* Legend */}
                        <div className="flex items-center gap-4 mb-4 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-green-500 rounded"></div>
                            <span>Completed</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-blue-500 rounded"></div>
                            <span>Downloading</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                            <span>Paused</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-gray-200 rounded"></div>
                            <span>Pending</span>
                          </div>
                        </div>

                        {/* Heatmap */}
                        <div className="bg-white p-4 rounded-lg border">
                          <div
                            className="grid gap-1"
                            style={{
                              gridTemplateColumns: `repeat(${Math.min(dl.chunk_info.length, 20)}, 1fr)`,
                            }}
                          >
                            {dl.chunk_info
                              .sort((a, b) => a.index - b.index)
                              .slice(0, 100)
                              .map((chunk) => {
                                const chunkProgress =
                                  // @ts-ignore
                                  chunk.size > 0
                                    ? // @ts-ignore
                                      (chunk.written / chunk.size) * 100
                                    : 0;
                                const stateColor = getChunkStateColor(
                                  chunk.state,
                                  chunkProgress,
                                );

                                return (
                                  <div
                                    key={chunk.id || `chunk-${chunk.index}`}
                                    title={`Chunk ${chunk.index + 1}
State: ${getDownloadStateString(chunk.state)}
Progress: ${chunkProgress.toFixed(1)}%
Written: ${formatBytes(chunk.written)} / ${formatBytes(dl.size / dl.chunks)}`}
                                    className={`${stateColor} aspect-square rounded transition-all duration-300 hover:scale-110 cursor-pointer`}
                                    style={{ minHeight: "16px" }}
                                  >
                                    {chunk.state ===
                                      AppDownloadState.Active && (
                                      <div className="w-full h-full bg-white bg-opacity-30 rounded animate-pulse"></div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>

                          {dl.chunk_info.length > 100 && (
                            <p className="text-xs text-gray-500 mt-3 text-center">
                              Showing first 100 of {dl.chunk_info.length} chunks
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Detailed stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="bg-white p-3 rounded-lg border">
                          <span className="text-gray-500 block text-xs">
                            Active Chunks
                          </span>
                          <p className="font-semibold text-blue-600">
                            {
                              dl.chunk_info.filter(
                                (c) => c.state === AppDownloadState.Active,
                              ).length
                            }
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border">
                          <span className="text-gray-500 block text-xs">
                            Paused Chunks
                          </span>
                          <p className="font-semibold text-yellow-600">
                            {
                              dl.chunk_info.filter(
                                (c) => c.state === AppDownloadState.Paused,
                              ).length
                            }
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border">
                          <span className="text-gray-500 block text-xs">
                            Completed Chunks
                          </span>
                          <p className="font-semibold text-green-600">
                            {
                              dl.chunk_info.filter(
                                (c) => c.state === AppDownloadState.Completed,
                              ).length
                            }
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border">
                          <span className="text-gray-500 block text-xs">
                            Average Chunk Size
                          </span>
                          <p className="font-semibold text-gray-700">
                            {dl.chunks > 0
                              ? formatBytes(dl.size / dl.chunks)
                              : "--"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
