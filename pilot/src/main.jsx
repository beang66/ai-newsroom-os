import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PilotApp from "./PilotApp.jsx";
import "./tokens.css";
import "./app.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PilotApp />
  </StrictMode>,
);
