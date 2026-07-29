import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/uploads": "http://localhost:3000",
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
