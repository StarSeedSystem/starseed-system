"use client";

/**
 * AstrauraConfigDrawer — DRAWER GLOBAL de configuración de Astraura + OmniVoice (Adenda 132).
 * ============================================================================
 * Se monta UNA sola vez (en `app-globals.tsx`) y escucha `ASTRAURA_CONFIG_EVENT`.
 * Al recibirlo abre un Sheet lateral (shadcn) con `<AstrauraOmniVoiceConfig
 * variant="drawer" />`, pasando `detail.section` como `initialSection` para
 * desplazarse al apartado pedido. Así, cualquier parte del OS puede abrir esta
 * configuración con `openAstrauraConfig("orden")` sin acoplarse a /agent.
 *
 * SSR-safe: el efecto de suscripción solo corre en cliente. Nunca lanza.
 */

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AstrauraOmniVoiceConfig } from "@/components/astraura/astraura-omnivoice-config";
import { ASTRAURA_CONFIG_EVENT } from "@/lib/astraura/config-ui";

export function AstrauraConfigDrawer() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { section?: string } | undefined;
      setSection(typeof detail?.section === "string" ? detail.section : undefined);
      setOpen(true);
    };
    window.addEventListener(ASTRAURA_CONFIG_EVENT, handler);
    return () => window.removeEventListener(ASTRAURA_CONFIG_EVENT, handler);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 border-white/10 p-0 sm:max-w-md">
        {/* Títulos accesibles (Radix Dialog): el encabezado visible lo pinta el componente. */}
        <SheetTitle className="sr-only">Configuración de Astraura y OmniVoice</SheetTitle>
        <SheetDescription className="sr-only">
          Ajusta el orden de preferencia de modelos, la voz OmniVoice, la estrategia de la neurona y la auto-actualización.
        </SheetDescription>
        {open && (
          <AstrauraOmniVoiceConfig
            variant="drawer"
            compact
            initialSection={section}
            onDismiss={() => setOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

export default AstrauraConfigDrawer;
