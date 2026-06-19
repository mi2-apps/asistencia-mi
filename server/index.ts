import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) =>
  res.json({ success: true, status: "ok", app: "asistencia-mi" })
);

// Serve the built Vite client.
const clientDir = path.resolve(__dirname, "../client");
app.use(express.static(clientDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[asistencia-mi] listening on :${PORT}`);
});
