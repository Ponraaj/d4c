import { useState, useEffect } from "react";
import "../index.css";
import {
  Download,
  FolderOpen,
  Link,
  Settings,
  FileText,
  Globe,
} from "lucide-react";
import {
  AddDownload,
  ShowDirectoryDialog,
  ShowFileDialog,
  GetDefaultDownloadPath,
} from "../../wailsjs/go/main/App";

const fallbackPath = "./Downloads";

const getDefaultDownloadPath = async () => {
  try {
    const path = await GetDefaultDownloadPath();
    return path;
  } catch (error) {
    console.log("Error finding the default download path");
    return;
  }
};

const extractFilenameFromUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split("/").pop();
    return filename?.includes(".") ? filename : "";
  } catch {
    return fallbackPath;
  }
};

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export default function AddDownloadPage() {
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [directory, setDirectory] = useState("");
  const [chunks, setChunks] = useState(10);
  const [workers, setWorkers] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [pathError, setPathError] = useState("");

  useEffect(() => {
    const fetchDefaultPath = async () => {
      const defaultPath = await getDefaultDownloadPath();
      setDirectory(defaultPath || fallbackPath);
    };

    fetchDefaultPath();
  }, []);

  useEffect(() => {
    if (url && isValidUrl(url)) {
      const extracted = extractFilenameFromUrl(url);
      if (extracted && !filename) setFilename(extracted);
      setUrlError("");
    } else if (url) {
      setUrlError("Please enter a valid URL");
    } else {
      setUrlError("");
    }
  }, [url, filename]);

  const openDirectoryDialog = async () => {
    try {
      const selectedDir = await ShowDirectoryDialog(directory);
      if (selectedDir) {
        setDirectory(selectedDir);
        setPathError("");
      }
    } catch (error) {
      console.error("Directory dialog failed:", error);
    }
  };

  const openFileDialog = async () => {
    try {
      const selectedFile = await ShowFileDialog(directory, filename);
      if (selectedFile) {
        const parts = selectedFile.split(/[/\\]/);
        const name = parts.pop() || "";
        const dir = parts.join("/") + "/";
        setFilename(name);
        setDirectory(dir);
        setPathError("");
      }
    } catch (error) {
      console.error("File dialog failed:", error);
    }
  };

  const validateForm = () => {
    let valid = true;
    if (!url || !isValidUrl(url)) {
      setUrlError("Please enter a valid URL");
      valid = false;
    }
    if (!filename.trim()) {
      setPathError("Filename is required");
      valid = false;
    } else if (!directory.trim()) {
      setPathError("Directory is required");
      valid = false;
    }
    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const path =
        directory.endsWith("/") || directory.endsWith("\\")
          ? directory + filename
          : directory + "/" + filename;

      await AddDownload(url, path, chunks, workers);
      alert("Download added successfully!");

      setUrl("");
      setFilename("");

      const defaultPath = await getDefaultDownloadPath();
      setDirectory(defaultPath || fallbackPath);

      setChunks(10);
      setWorkers(3);
    } catch (err) {
      console.error("AddDownload failed:", err);
      alert("Download failed. Check inputs and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getFullPath = () => {
    return directory && filename
      ? (directory.endsWith("/") || directory.endsWith("\\")
          ? directory
          : directory + "/") + filename
      : "";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <div className="flex items-center gap-3">
              <Download className="w-6 h-6 text-white" />
              <h2 className="text-xl font-semibold text-white">
                Add New Download
              </h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* URL Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Globe className="w-4 h-4" />
                Download URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/file.zip"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
                    urlError ? "border-red-300 bg-red-50" : "border-gray-300"
                  }`}
                  required
                />
                <Link className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
              </div>
              {urlError && <p className="text-sm text-red-600">{urlError}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Filename
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="example.zip"
                  className={`flex-1 px-4 py-3 border rounded-lg ${
                    pathError ? "border-red-300 bg-red-50" : "border-gray-300"
                  } focus:ring-2 focus:ring-blue-500 outline-none`}
                  required
                />
                <button
                  type="button"
                  onClick={openFileDialog}
                  className="px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder="Choose directory..."
                  className={`flex-1 px-4 py-3 border rounded-lg ${
                    pathError ? "border-red-300 bg-red-50" : "border-gray-300"
                  } focus:ring-2 focus:ring-blue-500 outline-none`}
                  required
                />
                <button
                  type="button"
                  onClick={openDirectoryDialog}
                  className="px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse
                </button>
              </div>
            </div>

            {getFullPath() && (
              <div className="bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg text-sm font-mono text-gray-700">
                {getFullPath()}
              </div>
            )}
            {pathError && <p className="text-sm text-red-600">{pathError}</p>}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Settings className="w-4 h-4" />
                Advanced Settings
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-600">Chunks</label>
                  <input
                    type="number"
                    value={chunks}
                    min={1}
                    max={32}
                    onChange={(e) =>
                      setChunks(
                        Math.max(1, Math.min(32, Number(e.target.value))),
                      )
                    }
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Workers</label>
                  <input
                    type="number"
                    value={workers}
                    min={1}
                    max={16}
                    onChange={(e) =>
                      setWorkers(
                        Math.max(1, Math.min(16, Number(e.target.value))),
                      )
                    }
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                  isLoading
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Start Download
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
