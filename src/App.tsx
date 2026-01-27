import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import UpdatePage from "./pages/UpdatePage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/update/:id" element={<UpdatePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
