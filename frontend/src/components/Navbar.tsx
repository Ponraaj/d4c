import { Link } from "react-router";

export default function Navbar() {
  return (
    <nav className="bg-gray-900 text-white px-4 py-3 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold">Download Manager</h1>
        <div className="space-x-4">
          <Link to="/" className="hover:underline">
            Downloads
          </Link>
          <Link to="/add" className="hover:underline">
            Add New
          </Link>
        </div>
      </div>
    </nav>
  );
}
