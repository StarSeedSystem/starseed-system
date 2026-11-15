// Arnés mínimo para la comprobación con Playwright (sin Next): monta la ventana de acceso y el panel de neuronas reales.
import "@/app/globals.css";
import { createRoot } from "react-dom/client";
import { VentanaAcceso } from "@/components/auth/ventana-acceso";
import { NeuronsPanel } from "@/components/settings/neurons/neurons-panel";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { CapaIdioma } from "@/components/idiomas/capa-idioma";

const vista = new URLSearchParams(location.search).get("vista");
createRoot(document.getElementById("raiz")!).render(
    <AppearanceProvider><ConfirmProvider>
        <CapaIdioma />
        {vista === "ajustes" ? <div className="mx-auto max-w-3xl p-4"><NeuronsPanel /></div> : <VentanaAcceso pasoInicial="acceso" onSaltar={() => undefined} onCerrar={() => undefined} />}
    </ConfirmProvider></AppearanceProvider>,
);
