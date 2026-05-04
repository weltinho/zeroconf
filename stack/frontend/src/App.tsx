import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { RpcLabPage } from "./pages/RpcLabPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lab/rpc" element={<RpcLabPage />} />
      </Routes>
    </BrowserRouter>
  );
}
