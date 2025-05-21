import { useState } from "react";
import { AddDownload } from "../../wailsjs/go/main/App";

export default function AddDownloadPage() {
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [chunks, setChunks] = useState(10);
  const [workers, setWorkers] = useState(5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await AddDownload(url, path, chunks, workers);
      alert("Download added!");
      setUrl("");
      setPath("");
    } catch (err) {
      alert("Failed to add download");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 shadow-md rounded">
      <h2 className="text-xl font-bold mb-4">Add New Download</h2>

      <div className="mb-3">
        <label className="block mb-1">Download URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="border p-2 w-full"
          required
        />
      </div>

      <div className="mb-3">
        <label className="block mb-1">Target Path</label>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="border p-2 w-full"
          required
        />
      </div>

      <div className="flex space-x-4 mb-3">
        <div>
          <label className="block mb-1">Chunks</label>
          <input
            type="number"
            value={chunks}
            onChange={(e) => setChunks(Number(e.target.value))}
            className="border p-2 w-full"
          />
        </div>
        <div>
          <label className="block mb-1">Workers</label>
          <input
            type="number"
            value={workers}
            onChange={(e) => setWorkers(Number(e.target.value))}
            className="border p-2 w-full"
          />
        </div>
      </div>

      <button
        type="submit"
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        Start Download
      </button>
    </form>
  );
}
