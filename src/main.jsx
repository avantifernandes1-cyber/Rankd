import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../rankd-app.jsx";
import MarketingPage from "./MarketingPage.jsx";

const path = window.location.pathname;

// "/" → public marketing site
// "/app", "/login", or any other path → authenticated app
const isMarketing = path === "/" || path === "";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isMarketing ? <MarketingPage /> : <App />}
  </StrictMode>
);
