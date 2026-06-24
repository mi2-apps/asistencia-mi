import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "es-MX", label: "ES" },
  { code: "en",    label: "EN" },
  { code: "zh-CN", label: "中文" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const change = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("mi-lang", code);
  };

  return (
    <div className="flex items-center gap-1">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => change(l.code)}
          className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
            i18n.language === l.code
              ? "bg-white/20 text-white font-semibold"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
