import { useEffect, useState } from "react";
import {
  AllDownloads,
  PauseDownload,
  ResumeDownload,
  CancelDownload,
} from "../../wailsjs/go/main/App";

export default function Home() {
  const [downloads, setDownloads] = useState<any[]>([]);

  const fetchDownloads = async () => {
    const data = await AllDownloads();
    setDownloads(data);
  };

  useEffect(() => {
    fetchDownloads();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Active Downloads</h1>
      {downloads.map((dl) => (
        <div key={dl.id} className="p-4 border rounded mb-3 bg-white shadow">
          <div className="font-semibold">{dl.url}</div>
          <div className="text-sm text-gray-500">{dl.path}</div>
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => PauseDownload(dl.id)}
              className="bg-yellow-500 text-white px-3 py-1 rounded"
            >
              Pause
            </button>
            <button
              onClick={() => ResumeDownload(dl.id)}
              className="bg-blue-500 text-white px-3 py-1 rounded"
            >
              Resume
            </button>
            <button
              onClick={() => CancelDownload(dl.id)}
              className="bg-red-500 text-white px-3 py-1 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
