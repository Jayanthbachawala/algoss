import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LiveOpportunitiesPage } from "./pages/LiveOpportunities";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <main className="mx-auto max-w-6xl p-4">
      <LiveOpportunitiesPage />
    </main>
  </StrictMode>,
);
