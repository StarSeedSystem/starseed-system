"use client";

/**
 * AstrauraConfigDrawer — DRAWER GLOBAL de sistemas de Astraura en esta neurona
 * (Adenda 132 · pestañas de sistemas y personalidad preseleccionada en la 149).
 * ============================================================================
 * Se monta UNA sola vez (en `app-globals.tsx`) y escucha `ASTRAURA_CONFIG_EVENT`.
 * Al recibirlo abre un Sheet lateral (shadcn) con `<AstrauraOmniVoiceConfig
 * variant="drawer" />`, pasando `detail.section` como `initialSection` (admite
 * sinónimos históricos) y `detail.personalityId` como personalidad
 * preseleccionada. Así, cualquier parte del OS puede abrir esta configuración
 * con `openAstrauraConfig("senales", { personalityId })` sin acoplarse a /agent.
 *
 * SSR-safe: el efecto de suscripción solo corre en cliente. Nunca lanza.
 */

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AstrauraOmniVoiceConfig } from "@/components/astraura/astraura-omnivoice-config";
import { ASTRAURA_CONFIG_EVENT, type AstrauraConfigOpenDetail } from "@/lib/astraura/config-ui";

export function AstrauraConfigDrawer() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | undefined>(undefined);
  const [personalityId, setPersonalityId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as AstrauraConfigOpenDetail | undefined;
      setSection(typeof detail?.section === "string" ? detail.section : undefined);
      setPersonalityId(typeof detail?.personalityId === "string" ? detail.personalityId : undefined);
      setOpen(true);
    };
    window.addEventListener(ASTRAURA_CONFIG_EVENT, handler);
    return () => window.removeEventListener(ASTRAURA_CONFIG_EVENT, handler);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 border-white/10 p-0 sm:max-w-md">
        {/* Títulos accesibles (Radix Dialog): el encabezado visible lo pinta el componente. */}
        <SheetTitle className="sr-only">Configuración de sistemas de Astraura en esta neurona</SheetTitle>
        <SheetDescription className="sr-only">
          Configura por personalidad los sistemas de esta neurona: modelo LLM, motor Astraura, voz OpenVoice,
          cerebros y memorias, y señales/antenas — con selección automática y todo editable.
        </SheetDescription>
        {open && (
          <AstrauraOmniVoiceConfig
            variant="drawer"
            compact
            initialSection={section}
            initialPersonalityId={personalityId}
            onDismiss={() => setOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

export default AstrauraConfigDrawer;
