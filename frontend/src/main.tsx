import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import "./i18n"; // initialise les langues (doit être importé avant l'app)
import "./styles/index.css";
import App from "./app/App";
import { ThemeProvider } from "./theme/ThemeContext";
import { AuthProvider } from "./core/auth";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {/* reducedMotion="user" : respecte le réglage « réduire les animations » du système */}
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </MotionConfig>
  </StrictMode>,
);
