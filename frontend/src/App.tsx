import { BrowserRouter as Router, Routes, Route } from "react-router";
import Navbar from "./components/Navbar";
import Home from "./components/Home";
import Download from "./components/Download";

function App() {
  return (
    <Router>
      <Navbar />
      <div className="p-4"></div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<Download />} />
      </Routes>
    </Router>
  );
}

export default App;
