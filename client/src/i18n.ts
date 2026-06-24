import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: typeof localStorage !== "undefined" ? (localStorage.getItem("mi-lang") ?? "es-MX") : "es-MX",
    fallbackLng: "en",
    ns: ["common", "nav", "asistencia", "historial", "colaboradores", "agregar", "usuarios", "bajas", "tiempoExtra"],
    defaultNS: "common",
    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;
