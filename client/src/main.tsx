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
const Changelog          = React.lazy(() => import("@client/pages/Changelog").then((m) => ({ default: m.default })));
const UserManual         = React.lazy(() => import("@client/pages/UserManual"));
const TiempoExtra        = React.lazy(() => import("@client/pages/TiempoExtra"));
const DeveloperManual    = React.lazy(() => import("@client/pages/DeveloperManual"));
import { WhatsNewModal } from "@client/pages/Changelog";

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

function PermGuard({ modulo, children }: { modulo: string; children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return null;
  if (user.role === "admin") return <>{children}</>;
  if (modulo === "admin") return <Redirect to="/asistencia" />;
  if (!user.permisos?.[modulo]) return <Redirect to="/asistencia" />;
  return <>{children}</>;
}

function App() {
  return (
    <AuthGate>
      <AppLayout>
        <WhatsNewModal />
        <React.Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Cargando módulo...</div>}>
          <Router>
            <Switch>
              <Route path="/"                      component={() => <Redirect to="/asistencia" />} />
              <Route path="/asistencia"            component={Asistencia} />
              <Route path="/historial"             component={Historial} />
              <Route path="/usuarios"              component={() => <PermGuard modulo="admin"><Usuarios /></PermGuard>} />
              <Route path="/colaboradores"         component={() => <PermGuard modulo="colaboradores"><Colaboradores /></PermGuard>} />
              <Route path="/agregar-colaborador"   component={() => <PermGuard modulo="colaboradores"><AgregarColaborador /></PermGuard>} />
              <Route path="/bajas"                 component={() => <PermGuard modulo="colaboradores"><Bajas /></PermGuard>} />
              <Route path="/tiempo-extra"          component={() => <PermGuard modulo="tiempo_extra"><TiempoExtra /></PermGuard>} />
              <Route path="/changelog"             component={Changelog} />
              <Route path="/manual"               component={UserManual} />
              <Route path="/developer-manual"     component={() => <PermGuard modulo="admin"><DeveloperManual /></PermGuard>} />
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
