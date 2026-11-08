import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Toutes les requêtes /api sont envoyées à l'API PHP (php -S 127.0.0.1:8000 -t public).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": process.env.VITE_BACKEND_PORT ? `http://127.0.0.1:${process.env.VITE_BACKEND_PORT}` : "http://127.0.0.1:8080" },
  },
});
