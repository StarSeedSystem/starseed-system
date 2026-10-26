"use client";
/**
 * Ficha del agente del mundo (Ola 1025U · U2). El mundo (U1) la abre al elegir un habitante.
 * Contrato: architecture/ficha-agente-mundo.md. Las props NO cambian respecto al esqueleto del contrato.
 *
 * Siete pestañas: Identidad (con Desarrollo) · Cerebro · Capas · Percepción · Motores · Herramientas · Perfil y red.
 * La chapa «Bot de IA» está siempre visible en la cabecera. Cada ajuste dice si está aplicado (lo lee ya un motor del
 * OS) o guardado en la ficha. Todo se guarda en este aparato, por agente.
 */
import { useEffect, useState } from "react";
import { Brain, Cpu, Eye, Fingerprint, Globe2, Layers, RotateCcw, Wrench, X } from "lucide-react";
import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";
import { PerfilAgenteRed } from "@/components/agentes-red/perfil-agente-red";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { useConfigAgente } from "@/lib/avatares/agente/almacen-agente";
import { TabCapas } from "./tab-capas";
import { TabCerebro } from "./tab-cerebro";
import { TabHerramientas } from "./tab-herramientas";
import { TabIdentidad, describirOrigen } from "./tab-identidad";
import { TabMotores } from "./tab-motores";
import { TabPercepcion } from "./tab-percepcion";
import { BotonFicha, InsigniaBotIA } from "./ui-ficha";

export interface FichaAgenteProps {
  agente: AgenteMundoRef;
  alCerrar?: () => void;
}

export const PESTANAS_FICHA = ["identidad", "cerebro", "capas", "percepcion", "motores", "herramientas", "red"] as const;
export type PestanaFicha = (typeof PESTANAS_FICHA)[number];

const ITEMS: SectionTabItem[] = [
  { value: "identidad", label: "Identidad", icon: Fingerprint },
  { value: "cerebro", label: "Cerebro", icon: Brain },
  { value: "capas", label: "Capas", icon: Layers },
  { value: "percepcion", label: "Percepción", icon: Eye },
  { value: "motores", label: "Motores", icon: Cpu },
  { value: "herramientas", label: "Herramientas", icon: Wrench },
  { value: "red", label: "Perfil y red", icon: Globe2 },
];

/** Reloj de la ficha: se refresca cada minuto para que «hace 3 min» y el cupo del día no se queden viejos. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return ahora;
}

export function FichaAgente({ agente, alCerrar }: FichaAgenteProps) {
  const [pestana, setPestana] = useState<PestanaFicha>("identidad");
  const [confirmando, setConfirmando] = useState(false);
  const { config, recuerdos, actualizar, deshacer, restablecer } = useConfigAgente(agente);
  const ahora = useAhora();
  const inicial = agente.nombre.trim().charAt(0).toUpperCase() || "?";

  return (
    <section
      aria-label={`Ficha de ${agente.nombre}`}
      data-testid="ficha-agente"
      className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3 overflow-x-hidden text-sm text-foreground"
    >
      <header className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 shadow-lg backdrop-blur-md">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 font-headline text-lg font-semibold text-primary"
        >
          {inicial}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-headline text-base font-semibold leading-tight text-foreground">{agente.nombre}</h2>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <InsigniaBotIA />
            <span className="min-w-0 break-words text-xs text-muted-foreground">{describirOrigen(agente)}</span>
          </p>
        </div>
        {alCerrar && (
          <BotonFicha icono={X} aria-label="Cerrar la ficha" onClick={alCerrar} className="shrink-0 border-transparent" />
        )}
      </header>

      <SectionTabs items={ITEMS} value={pestana} onValueChange={(v) => setPestana(v as PestanaFicha)} ariaLabel="Secciones de la ficha del agente" size="md" />

      <div role="tabpanel" aria-label={ITEMS.find((i) => i.value === pestana)?.label} data-testid={`ficha-panel-${pestana}`} className="min-w-0">
        {pestana === "identidad" && <TabIdentidad agente={agente} config={config} recuerdos={recuerdos} ahora={ahora} alDeshacer={deshacer} />}
        {pestana === "cerebro" && <TabCerebro agente={agente} config={config} recuerdos={recuerdos} actualizar={actualizar} ahora={ahora} />}
        {pestana === "capas" && <TabCapas config={config} actualizar={actualizar} />}
        {pestana === "percepcion" && <TabPercepcion config={config} actualizar={actualizar} />}
        {pestana === "motores" && <TabMotores config={config} actualizar={actualizar} />}
        {pestana === "herramientas" && <TabHerramientas config={config} actualizar={actualizar} />}
        {pestana === "red" && <PerfilAgenteRed agente={agente} />}
      </div>

      {pestana !== "red" && (
        <footer className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-3">
          {confirmando ? (
            <div className="space-y-2">
              <p className="break-words text-xs text-muted-foreground">
                ¿Restablecer esta ficha? Se borra lo guardado de este agente y vuelve a heredar las capas y el sistema de la personalidad o de tu cuenta. No borra sus recuerdos.
              </p>
              <div className="flex flex-wrap gap-2">
                <BotonFicha variante="peligro" icono={RotateCcw} onClick={() => { restablecer(); setConfirmando(false); }}>Sí, restablecer</BotonFicha>
                <BotonFicha onClick={() => setConfirmando(false)}>Cancelar</BotonFicha>
              </div>
            </div>
          ) : (
            <BotonFicha icono={RotateCcw} onClick={() => setConfirmando(true)}>Restablecer la ficha</BotonFicha>
          )}
        </footer>
      )}
    </section>
  );
}
