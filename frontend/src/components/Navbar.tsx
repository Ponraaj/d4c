import { useNavigate, useLocation } from "react-router";
import { Download, Plus } from "lucide-react";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-slate-800 text-white shadow-lg border-b border-slate-700">
      <div className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <h1
            className="text-2xl font-bold text-white cursor-pointer hover:text-blue-400 transition-colors duration-200"
            onClick={() => navigate("/")}
          >
            D4C
          </h1>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate("/")}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                isActive("/")
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Downloads</span>
            </button>

            <button
              onClick={() => navigate("/add")}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                isActive("/add")
                  ? "bg-emerald-600 text-white"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Add New</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
