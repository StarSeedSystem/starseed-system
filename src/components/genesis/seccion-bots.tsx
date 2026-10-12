"use client";
/**
 * Sección «Mis bots» dentro de Mi Genesis (BOT1011I1 · contrato §3.3, §13 y
 * §18 F1: el panel de bots vive en Genesis). Resuelve la identidad de la
 * cuenta en cliente: con sesión usa el id del usuario; sin sesión es solo
 * este dispositivo (`local`), igual que el resto del almacén de bots.
 * Se carga con `next/dynamic` desde MiGenesis para no pesar en el arranque.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { PanelBots } from "@/components/astraura-bots/panel-bots";

const SIN_SESION = "local";

export function SeccionBotsGenesis() {
  const [ids, setIds] = useState<{ perfilId: string; cuentaId: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        const id = data.user?.id ?? SIN_SESION;
        if (vivo) setIds({ perfilId: id, cuentaId: id });
      } catch {
        if (vivo) setIds({ perfilId: SIN_SESION, cuentaId: SIN_SESION });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!ids) return null;
  return <PanelBots perfilId={ids.perfilId} cuentaId={ids.cuentaId} />;
}
