import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Download, Pause, Play, X } from "lucide-react";
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

interface ChunkUpdateEventPayload {
  downloadId: number;
  chunkIndex: number;
  chunkId: number;
  written: number;
  size: number;
  state: number;
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
  if (!seconds || !isFinite(seconds)) return "--";

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
      return "bg-gray-500";
  }
};

export default function Home() {
  const [downloads, setDownloads] = useState<models.main.Download[]>([]);
  const [expandedDownloads, setExpandedDownloads] = useState<Set<number>>(
    new Set(),
  );
  const [downloadStats, setDownloadStats] = useState<Record<number, any>>({});
  const [lastUpdateTime, setLastUpdateTime] = useState<Record<number, number>>(
    {},
  );

  const initializeDownloads = async () => {
    try {
      const data = await AllDownloads();
      setDownloads(data || []);
    } catch (error) {
      console.error("Failed to fetch downloads:", error);
      setDownloads([]);
    }
  };

  const toggleExpanded = (downloadId: number) => {
    const newExpanded = new Set(expandedDownloads);
    if (newExpanded.has(downloadId)) {
      newExpanded.delete(downloadId);
    } else {
      newExpanded.add(downloadId);
    }
    setExpandedDownloads(newExpanded);
  };

  const calculateDownloadStats = (download: models.main.Download) => {
    const totalWritten =
      download.chunk_info?.reduce((sum, chunk) => sum + chunk.written, 0) || 0;
    const progress =
      download.size > 0 ? (totalWritten / download.size) * 100 : 0;

    const currentTime = Date.now();
    const lastTime = lastUpdateTime[download.id];
    const lastStats = downloadStats[download.id];

    let speed = 0;
    if (lastTime && lastStats && download.state === AppDownloadState.Active) {
      const timeDiff = (currentTime - lastTime) / 1000; // seconds
      const bytesDiff = totalWritten - (lastStats.totalWritten || 0);
      if (timeDiff > 0) {
        speed = bytesDiff / timeDiff;
      }
    }

    const remainingBytes = download.size - totalWritten;
    const eta = speed > 0 ? remainingBytes / speed : 0;

    return { progress, speed, eta, totalWritten };
  };

  const getFileName = (url: string) => {
    return url.split("/").pop() || "Unknown File";
  };

  useEffect(() => {
    initializeDownloads();
  }, []);

  useEffect(() => {
    const cleanupChunkUpdate = EventsOn(
      "chunkUpdate",
      (payload: ChunkUpdateEventPayload) => {
        setDownloads((prevDownloads) =>
          prevDownloads.map((dl) => {
            if (dl.id === payload.downloadId) {
              const updatedChunkInfo = dl.chunk_info.map((chunk) => {
                if (payload.chunkId !== 0 && chunk.id === payload.chunkId) {
                  return {
                    ...chunk,
                    written: payload.written,
                    state: payload.state,
                  };
                } else if (chunk.index === payload.chunkIndex) {
                  return {
                    ...chunk,
                    written: payload.written,
                    state: payload.state,
                  };
                }
                return chunk;
              });

              const completedChunksCount = updatedChunkInfo.filter(
                (c) => c.state === AppDownloadState.Completed,
              ).length;

              let overallState = dl.state;
              if (completedChunksCount === dl.chunks && dl.chunks > 0) {
                overallState = AppDownloadState.Completed;
              } else if (
                updatedChunkInfo.some(
                  (c) => c.state === AppDownloadState.Active,
                )
              ) {
                overallState = AppDownloadState.Active;
              } else if (
                updatedChunkInfo.every(
                  (c) =>
                    c.state === AppDownloadState.Paused ||
                    c.state === AppDownloadState.Completed,
                ) &&
                updatedChunkInfo.some(
                  (c) => c.state === AppDownloadState.Paused,
                )
              ) {
                overallState = AppDownloadState.Paused;
              }

              const updatedDownloadData = {
                ...dl,
                chunk_info: updatedChunkInfo,
                completed_chunks: completedChunksCount,
                state: overallState,
              };

              // Update stats for speed calculation
              setLastUpdateTime((prev) => ({ ...prev, [dl.id]: Date.now() }));

              return models.main.Download.createFrom(updatedDownloadData);
            }
            return dl;
          }),
        );
      },
    );

    const cleanupDownloadUpdate = EventsOn(
      "downloadUpdate",
      (payload: { downloadId: number; state: number }) => {
        setDownloads((prevDownloads) =>
          prevDownloads.map((dl) =>
            dl.id === payload.downloadId
              ? models.main.Download.createFrom({
                  ...dl,
                  state: payload.state,
                })
              : dl,
          ),
        );
      },
    );

    return () => {
      cleanupChunkUpdate();
      cleanupDownloadUpdate();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const newStats: Record<number, any> = {};
      downloads.forEach((dl) => {
        newStats[dl.id] = calculateDownloadStats(dl);
      });
      setDownloadStats(newStats);
    }, 1000);

    return () => clearInterval(interval);
  }, [downloads, lastUpdateTime]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
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
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
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
                          className={`text-sm font-medium ${getStateColor(dl.state)}`}
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
                        <span className="text-gray-600">
                          {stats.progress.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(dl.state)}`}
                          style={{ width: `${Math.min(stats.progress, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                      <div>
                        <span className="text-gray-500">Speed:</span>
                        <p className="font-medium">
                          {dl.state === AppDownloadState.Active
                            ? formatSpeed(stats.speed)
                            : "--"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">ETA:</span>
                        <p className="font-medium">
                          {dl.state === AppDownloadState.Active
                            ? formatTime(stats.eta)
                            : "--"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Chunks:</span>
                        <p className="font-medium">
                          {dl.completed_chunks}/{dl.chunks}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Size:</span>
                        <p className="font-medium">{formatBytes(dl.size)}</p>
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
                          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              Hide Chunks
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              Show Chunks
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && dl.chunk_info && dl.chunk_info.length > 0 && (
                    <div className="border-t bg-gray-50 p-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-4">
                        Chunk Progress Details
                      </h4>
                      <div className="space-y-3">
                        {dl.chunk_info
                          .sort((a, b) => a.index - b.index)
                          .map((chunk) => {
                            const chunkTotalSize =
                              chunk.end_byte - chunk.start_byte + 1;
                            const chunkProgress =
                              chunkTotalSize > 0
                                ? (chunk.written / chunkTotalSize) * 100
                                : chunk.state === AppDownloadState.Completed
                                  ? 100
                                  : 0;

                            return (
                              <div
                                key={chunk.id || `chunk-${chunk.index}`}
                                className="bg-white p-4 rounded-lg border border-gray-200"
                              >
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    Chunk {chunk.index + 1}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-xs font-medium ${getStateColor(chunk.state)}`}
                                    >
                                      {getDownloadStateString(chunk.state)}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {chunkProgress.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>

                                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(chunk.state)}`}
                                    style={{
                                      width: `${Math.min(chunkProgress, 100)}%`,
                                    }}
                                  />
                                </div>

                                <div className="text-xs text-gray-500">
                                  {formatBytes(chunk.written)} /{" "}
                                  {formatBytes(chunkTotalSize)}
                                  <span className="ml-2">
                                    ({formatBytes(chunk.start_byte)} -{" "}
                                    {formatBytes(chunk.end_byte)})
                                  </span>
                                </div>
                              </div>
                            );
                          })}
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
