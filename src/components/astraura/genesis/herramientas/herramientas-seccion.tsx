"use client";

/**
 * herramientas-seccion.tsx — contenedor autosuficiente que junta los cuatro
 * paneles de OLA 2 (internet, herramientas, cerebros propios, bots
 * predeterminados) para un ser concreto.
 * ----------------------------------------------------------------------------
 * Mismo rol, a menor escala, que `ser-ficha.tsx`: carga sus propios datos
 * (`useS158Load`) y envuelve sus propias mutaciones (`useBusy` + `runS158`),
 * en vez de esperar props ya resueltas — porque, a diferencia de
 * `SoberaniaPanel`/`EnrutadoPanel`, nadie más en esta ola monta estos
 * paneles todavía. `InternetPanel` y `CerebrosPanel` son paneles-hoja
 * (mismo criterio que `SoberaniaPanel`: reciben `value`+`onCommit`, sin
 * título propio) y aquí reciben su tarjeta y su `SectionTitle`, igual que
 * `ser-ficha.tsx` hace con ellos. `HerramientasLista` y
 * `BotsPredeterminadosPanel` son catálogos GLOBALES (el contrato no los ata
 * a ningún `serId`) y ya traen su propia tarjeta — aquí solo se apilan.
 *
 * Pensado para poder incrustarse tal cual dentro de `ser-ficha.tsx` en una
 * ola de integración futura (fuera del alcance de esta): esta ola no toca
 * `ser-ficha.tsx`, así que este componente es, por ahora, la manera de usar
 * de verdad los cuatro paneles nuevos.
 */
import { useCallback } from "react";
import { Brain, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchGenesisSer, type GenesisTarget } from "@/lib/astraura/genesis-client";
import {
  fetchGenesisBotsPredeterminados,
  fetchGenesisHerramientas,
  updateGenesisSerCerebros,
  updateGenesisSerInternet,
} from "@/lib/astraura/genesis-client-ola2";
import type { CapacidadInternet, CerebroSer } from "@/lib/astraura/genesis-types";
import { CARD, Empty, SectionTitle, runS158, useBusy, useS158Load } from "../../s158/shared";
import { BotsPredeterminadosPanel } from "./bots-predeterminados-panel";
import { CerebrosPanel } from "./cerebros-panel";
import { HerramientasLista } from "./herramientas-lista";
import { InternetPanel } from "./internet-panel";

export interface HerramientasSeccionProps {
  target: GenesisTarget;
  serId: string;
  /** El ser cambió algo visible fuera de este panel (para que un contenedor externo recargue si hace falta). */
  onCambiado?: () => void;
}

export function HerramientasSeccion({ target, serId, onCambiado }: HerramientasSeccionProps) {
  const { busy, wrap } = useBusy();

  const loadSer = useCallback((t: GenesisTarget) => fetchGenesisSer(t, serId), [serId]);
  const ser = useS158Load(loadSer, target, 15_000);
  const herramientas = useS158Load(fetchGenesisHerramientas, target, 60_000);
  const bots = useS158Load(fetchGenesisBotsPredeterminados, target, 60_000);

  const s = ser.data;
  const reloadSer = ser.reload;

  const commitInternetCore = useCallback(
    (patch: Partial<CapacidadInternet>) =>
      runS158("Acceso a internet actualizado", () => updateGenesisSerInternet(target, serId, patch), {
        after: async () => { await reloadSer(true); onCambiado?.(); },
      }),
    [target, serId, reloadSer, onCambiado],
  );
  const commitInternet = useCallback(
    (patch: Partial<CapacidadInternet>) => { void wrap("internet", () => commitInternetCore(patch)); },
    [wrap, commitInternetCore],
  );

  const commitCerebrosCore = useCallback(
    (next: CerebroSer[]) =>
      runS158("Cerebros propios actualizados", () => updateGenesisSerCerebros(target, serId, next), {
        after: async () => { await reloadSer(true); onCambiado?.(); },
      }),
    [target, serId, reloadSer, onCambiado],
  );
  const commitCerebros = useCallback(
    (next: CerebroSer[]) => { void wrap("cerebros", () => commitCerebrosCore(next)); },
    [wrap, commitCerebrosCore],
  );

  return (
    <div className="space-y-3">
      {!s && (
        <div className={cn(CARD, "p-3")}>
          <Empty loading={ser.loading} error={ser.error} text="No se encontró este ser." />
        </div>
      )}

      {s && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle
            icon={Globe}
            title="Internet y herramientas"
            tone="text-cyan-300"
            hint='Alex: "una opción de acceso a internet que use todas las herramientas de la librería en línea del os y la biblioteca del usuario y las carpetas y archivos de dispositivo".'
          />
          <div className="mt-2">
            <InternetPanel key={s.id} value={s.internet} disabled={busy !== ""} onCommit={commitInternet} />
          </div>
        </div>
      )}

      <HerramientasLista lista={herramientas.data} loading={herramientas.loading} error={herramientas.error} />

      {s && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle
            icon={Brain}
            title="Cerebros propios"
            tone="text-violet-300"
            hint='Alex: "memorias en cerebros propios configurables y enrutables y sincronizables".'
          />
          <div className="mt-2">
            <CerebrosPanel key={s.id} value={s.cerebrosPropios} disabled={busy !== ""} onCommit={commitCerebros} />
          </div>
        </div>
      )}

      <BotsPredeterminadosPanel target={target} lista={bots.data} loading={bots.loading} error={bots.error} onInstalado={() => bots.reload(true)} />
    </div>
  );
}

export default HerramientasSeccion;
