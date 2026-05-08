import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PublicLayout } from "./layouts/PublicLayout";
import { AdmGateLayout } from "./pages/adm/AdmGateLayout";
import { AdmFundsRescuePage } from "./pages/adm/AdmFundsRescuePage";
import { AdmHomePage } from "./pages/adm/AdmHomePage";
import { AdmSwapsPage } from "./pages/adm/AdmSwapsPage";
import { AdmWithdrawPage } from "./pages/adm/AdmWithdrawPage";
import { ClientAreaPage } from "./pages/ClientAreaPage";
import { NodeToolsPage } from "./pages/NodeToolsPage";

function routerBasename(): string | undefined {
  const raw = import.meta.env.BASE_URL ?? "/";
  if (raw === "/" || raw === "") {
    return undefined;
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<ClientAreaPage />} />
          <Route path="/cliente" element={<ClientAreaPage />} />
          <Route path="/cliente/:orderId" element={<ClientAreaPage />} />
          <Route path="/cliente-homologacao" element={<ClientAreaPage />} />
          <Route path="/cliente-homologacao/:orderId" element={<ClientAreaPage />} />
        </Route>

        <Route path="/adm" element={<AdmGateLayout />}>
          <Route index element={<AdmHomePage />} />
          <Route path="node" element={<NodeToolsPage />} />
          <Route path="swaps" element={<AdmSwapsPage />} />
          <Route path="funds-rescue" element={<AdmFundsRescuePage />} />
          <Route path="withdraw" element={<AdmWithdrawPage />} />
        </Route>

        <Route path="/tools/node" element={<Navigate to="/adm/node" replace />} />
        <Route path="/lab/rpc" element={<Navigate to="/adm/node" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
