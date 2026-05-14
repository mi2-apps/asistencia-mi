import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

function App() {
  return (
    <main className="min-h-screen flex items-center justify-center font-sans">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">stack-template</h1>
        <p className="text-muted">Replace this with your app.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
