import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ClipboardCheck,
  History,
  Users,
  UserSquare2,
  UserPlus,
  UserMinus,
  Timer,
  Sparkles,
  BookOpen,
  FileCode,
  LogOut,
} from "lucide-react";
import { cn } from "@client/lib/utils";
import { useAuthStore } from "@client/stores/authStore";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@client/components/ui/LanguageSwitcher";

const NAV_ITEMS = [
  { href: "/asistencia",          tKey: "nav:asistencia",    icon: ClipboardCheck, modulo: "asistencia"          },
  { href: "/historial",           tKey: "nav:historial",     icon: History,        modulo: "historial"           },
  { href: "/usuarios",            tKey: "nav:usuarios",      icon: Users,          modulo: "admin"               },
  { href: "/colaboradores",       tKey: "nav:colaboradores", icon: UserSquare2,    modulo: "colaboradores"       },
  { href: "/agregar-colaborador", tKey: "nav:addEmployee",   icon: UserPlus,       modulo: "agregar_colaborador" },
  { href: "/bajas",               tKey: "nav:bajas",         icon: UserMinus,      modulo: "bajas"               },
  { href: "/tiempo-extra",        tKey: "nav:overtime",      icon: Timer,          modulo: "tiempo_extra"        },
  { href: "/changelog",           tKey: "nav:whatsNew",      icon: Sparkles,       modulo: null                  },
  { href: "/manual",              tKey: "nav:manual",        icon: BookOpen,       modulo: null                  },
  { href: "/developer-manual",    tKey: "nav:devManual",     icon: FileCode,       modulo: "admin"               },
] as const;

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, isAuthenticated, canAccess } = useAuthStore();
  const [location] = useLocation();
  const { t } = useTranslation();

  // Auto-cierra al navegar en móvil
  useEffect(() => {
    onClose();
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return null;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.modulo === null) return true;
    if (item.modulo === "admin") return user?.role === "admin";
    return canAccess(item.modulo);
  });

  return (
    <>
      {/* Backdrop oscuro en móvil */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <aside className={cn(
        "w-60 bg-brand-navy text-white flex flex-col flex-shrink-0",
        // Móvil: overlay fijo que entra/sale desde la izquierda
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200",
        // Desktop: vuelve al flujo normal del flex
        "md:relative md:h-full md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Logo / app name */}
        <div className="px-6 py-5 border-b border-white/10">
          <p className="text-xs text-white/50 uppercase tracking-widest">MI Technologies</p>
          <h1 className="text-sm font-semibold mt-0.5 leading-tight">Control de Asistencia</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
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
                {t(item.tKey)}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-xs text-white/50 truncate">{user?.username}</p>
          <p className="text-xs text-white/30 capitalize">{user?.role}</p>
          <LanguageSwitcher />
          <a
            href="/auth/logout"
            className="mt-3 flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            <LogOut size={14} />
            {t("nav:logout")}
          </a>
        </div>
      </aside>
    </>
  );
}
