import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch, Redirect } from "wouter";
import { AppLayout } from "@client/components/layout/AppLayout";
import { useAuthStore } from "@client/stores/authStore";
import "./index.css";

// Lazy-load pages
const Asistencia         = React.lazy(() => import("@client/pages/Asistencia"));
const Historial          = React.lazy(() => import("@client/pages/Historial"));
const Usuarios           = React.lazy(() => import("@client/pages/Usuarios"));
const Colaboradores      = React.lazy(() => import("@client/pages/Colaboradores"));
const AgregarColaborador = React.lazy(() => import("@client/pages/AgregarColaborador"));
const Bajas              = React.lazy(() => import("@client/pages/Bajas"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    fetch("/api/v1/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = "/auth/login";
    return null;
  }

  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== "admin") return <Redirect to="/asistencia" />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthGate>
      <AppLayout>
        <React.Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Cargando módulo...</div>}>
          <Router>
            <Switch>
              <Route path="/"                      component={() => <Redirect to="/asistencia" />} />
              <Route path="/asistencia"            component={Asistencia} />
              <Route path="/historial"             component={Historial} />
              <Route path="/usuarios"              component={() => <AdminGuard><Usuarios /></AdminGuard>} />
              <Route path="/colaboradores"         component={() => <AdminGuard><Colaboradores /></AdminGuard>} />
              <Route path="/agregar-colaborador"   component={() => <AdminGuard><AgregarColaborador /></AdminGuard>} />
              <Route path="/bajas"                 component={() => <AdminGuard><Bajas /></AdminGuard>} />
              <Route                               component={() => <Redirect to="/asistencia" />} />
            </Switch>
          </Router>
        </React.Suspense>
      </AppLayout>
    </AuthGate>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
