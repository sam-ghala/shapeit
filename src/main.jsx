import React from "react";
import ReactDOM from "react-dom/client";
import "./shared/theme.css";
import App from "./platform/App.jsx";
import { flushEvents } from "./shared/activity.js";

window.addEventListener("online", flushEvents);
void flushEvents();
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
