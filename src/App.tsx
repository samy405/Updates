import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import UpdatePage from "./pages/UpdatePage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <header className="app-header">
        <div className="app-header-content">
          <Link to="/" className="logo-link">
            <img 
              src="/brand/fountain-logo.png" 
              alt="Fountain" 
              className="fountain-logo"
            />
          </Link>
          <span className="header-title">CS Updates</span>
        </div>
      </header>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/update/:id" element={<UpdatePage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
