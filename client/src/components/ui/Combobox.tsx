import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@client/lib/utils";
import { ChevronDown, X } from "lucide-react";

interface ComboboxProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({ options, value, onChange, placeholder = "Seleccionar...", disabled, className }: ComboboxProps) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const [focused, setFocused] = useState(0);
  const inputRef            = useRef<HTMLInputElement>(null);
  const listRef             = useRef<HTMLUListElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase())
  );

  const select = useCallback((opt: string) => {
    onChange(opt);
    setQuery("");
    setOpen(false);
  }, [onChange]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setQuery("");
  }, [onChange]);

  useEffect(() => {
    if (!open) setFocused(0);
  }, [open]);

  useEffect(() => {
    if (open) {
      const li = listRef.current?.children[focused] as HTMLElement | undefined;
      li?.scrollIntoView({ block: "nearest" });
    }
  }, [focused, open]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused((f) => Math.min(f + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); if (filtered[focused]) select(filtered[focused]); }
    if (e.key === "Escape")    { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-1 border border-input rounded-md bg-background px-3 h-10",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
          disabled && "opacity-50 pointer-events-none"
        )}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <input
          ref={inputRef}
          value={open ? query : value}
          placeholder={value || placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQuery(e.target.value); setFocused(0); }}
          onKeyDown={handleKey}
          className="flex-1 bg-transparent outline-none text-sm min-w-0"
          readOnly={!open}
          aria-haspopup="listbox"
          aria-expanded={open}
        />
        {value && !disabled
          ? <X size={14} className="shrink-0 text-muted-foreground cursor-pointer hover:text-foreground" onClick={clear} />
          : <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        }
      </div>
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className={cn(
            "absolute z-50 w-full mt-1 max-h-56 overflow-auto",
            "border border-border rounded-md bg-popover shadow-md"
          )}
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              onMouseDown={() => select(opt)}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer",
                i === focused && "bg-accent text-accent-foreground",
                opt === value && "font-medium"
              )}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
