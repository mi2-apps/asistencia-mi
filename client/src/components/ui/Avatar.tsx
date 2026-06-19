import { cn, iniciales } from "@client/lib/utils";

interface AvatarProps {
  nombre: string;
  apellido?: string;
  fotoPerfil?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm:  "w-9 h-9 text-sm",
  md:  "w-11 h-11 text-base",
  lg:  "w-14 h-14 text-xl",
};

export function Avatar({ nombre, apellido, fotoPerfil, size = "md", className }: AvatarProps) {
  if (fotoPerfil) {
    return (
      <img
        src={`/uploads/${fotoPerfil}`}
        alt={`${nombre} ${apellido ?? ""}`}
        className={cn("rounded-full object-cover flex-shrink-0", sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-primary text-primary-foreground font-semibold",
        "flex items-center justify-center flex-shrink-0 select-none",
        sizes[size],
        className
      )}
    >
      {iniciales(nombre, apellido)}
    </div>
  );
}
