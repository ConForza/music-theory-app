import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AppProvider } from "./state/app";
import { captureInstallPrompt, registerServiceWorker } from "./lib/install";
import "./styles.css";

captureInstallPrompt();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
