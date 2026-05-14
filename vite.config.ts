import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "client",
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@client": path.resolve(__dirname, "client/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:7000",
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
