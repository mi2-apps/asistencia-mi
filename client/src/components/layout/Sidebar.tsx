import { Link, useLocation } from "wouter";
import {
  ClipboardCheck,
  History,
  Users,
  UserSquare2,
  UserPlus,
  UserMinus,
  LogOut,
} from "lucide-react";
import { cn } from "@client/lib/utils";
import { useAuthStore } from "@client/stores/authStore";

const NAV_ITEMS = [
  { href: "/asistencia",          label: "Asistencia",          icon: ClipboardCheck, adminOnly: false },
  { href: "/historial",           label: "Historial",           icon: History,        adminOnly: false },
  { href: "/usuarios",            label: "Usuarios",            icon: Users,          adminOnly: true  },
  { href: "/colaboradores",       label: "Colaboradores",       icon: UserSquare2,    adminOnly: true  },
  { href: "/agregar-colaborador", label: "Agregar Colaborador", icon: UserPlus,       adminOnly: true  },
  { href: "/bajas",               label: "Bajas",               icon: UserMinus,      adminOnly: true  },
];

export function Sidebar() {
  const { user, isAuthenticated } = useAuthStore();
  const [location] = useLocation();

  if (!isAuthenticated) return null;

  return (
    <aside className="w-60 min-h-screen bg-brand-navy text-white flex flex-col flex-shrink-0">
      {/* Logo / app name */}
      <div className="px-6 py-5 border-b border-white/10">
        <p className="text-xs text-white/50 uppercase tracking-widest">MI Technologies</p>
        <h1 className="text-sm font-semibold mt-0.5 leading-tight">Control de Asistencia</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin").map((item) => {
          const active = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-white/50 truncate">{user?.username}</p>
        <p className="text-xs text-white/30 capitalize">{user?.role}</p>
        <a
          href="/auth/logout"
          className="mt-3 flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          <LogOut size={14} />
          Cerrar sesión
        </a>
      </div>
    </aside>
  );
}
