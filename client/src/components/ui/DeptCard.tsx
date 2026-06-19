import { cn } from "@client/lib/utils";

interface DeptStats {
  presentes?: number;
  inasistencias?: number;
  sinRegistro?: number;
  total?: number;
  bajas?: number;
}

interface DeptCardProps {
  nombre: string;
  color: string;
  stats?: DeptStats;
  onClick?: () => void;
  className?: string;
}

export function DeptCard({ nombre, color, stats, onClick, className }: DeptCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border border-border bg-card shadow-sm",
        "hover:shadow-md hover:border-primary/30 active:scale-[0.98]",
        "transition-all duration-150 p-4 cursor-pointer",
        className
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-semibold text-sm leading-tight line-clamp-2">{nombre}</span>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-2 mt-1">
          {stats.total !== undefined && (
            <Pill label="Total" value={stats.total} color="bg-muted text-muted-foreground" />
          )}
          {stats.presentes !== undefined && (
            <Pill label="✓" value={stats.presentes} color="bg-green-100 text-green-700" />
          )}
          {stats.inasistencias !== undefined && (
            <Pill label="✗" value={stats.inasistencias} color="bg-red-100 text-red-700" />
          )}
          {stats.sinRegistro !== undefined && (
            <Pill label="—" value={stats.sinRegistro} color="bg-yellow-100 text-yellow-700" />
          )}
          {stats.bajas !== undefined && (
            <Pill label="Bajas" value={stats.bajas} color="bg-gray-100 text-gray-600" />
          )}
        </div>
      )}
    </button>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", color)}>
      {label} <strong>{value}</strong>
    </span>
  );
}
