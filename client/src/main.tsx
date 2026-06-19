import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

function App() {
  return (
    <main className="min-h-screen flex items-center justify-center font-sans">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Control de Asistencia</h1>
        <p className="text-muted-foreground text-sm mt-1">MI Technologies</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
