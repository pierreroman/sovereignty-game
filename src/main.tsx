import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CatalogueApp } from "./CatalogueApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CatalogueApp />
  </StrictMode>,
);
