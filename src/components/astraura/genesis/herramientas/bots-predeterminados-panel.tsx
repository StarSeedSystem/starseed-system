"use client";

/**
 * bots-predeterminados-panel.tsx — `BotPredeterminado[]` (punto 5 del
 * encargo de OLA 2).
 *
 * "Los 7 procesos de Imaginación Intuitiva pasan a ser los 7 bots de
 * fábrica, cada uno con el agente y la personalidad que YA le corresponden
 * en el motor" (comentario del propio contrato, `genesis-types.ts`). No son
 * bots inventados aquí: la lista, su personalidad y su agente reales los
 * manda el backend — este panel solo los enseña y ofrece instalarlos.
 *
 * "Los ya instalados se ven como instalados; instalar no debe poder
 * duplicar": un bot con `instalado === true` se pinta como instalado y sin
 * botón de instalar; el botón de "instalar todos" manda SOLO los ids
 * pendientes de verdad (`idsPendientesDeInstalar`), y se deshabilita
 * mientras una instalación está en curso para que un doble clic no dispare
 * dos altas.
 *
 * Global, no por ser: el contrato no ata `/bots_predeterminados` a ningún
 * `serId` (son bots de fábrica del sistema, no de un ser en concreto), así
 * que este panel solo necesita `target`. Por lo mismo — igual que
 * `propuestas-bandeja.tsx` — se planta con su propia tarjeta y su propio
 * título: se puede montar directamente, sin depender de un contenedor.
 */
import { Bot, CircleCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BotPredeterminado } from "@/lib/astraura/genesis-types";
import { installGenesisBotsPredeterminados, type GenesisTarget } from "@/lib/astraura/genesis-client-ola2";
import { BTN, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, MONO, SUB, SectionTitle, useBusy } from "../../s158/shared";
import { idsPendientesDeInstalar, resumirBots } from "./herramientas-logic";

function BotRow({ bot, busy, onInstalar }: { bot: BotPredeterminado; busy: string; onInstalar: (bot: BotPredeterminado) => void }) {
  return (
    <div className={cn(SUB, "flex items-start gap-2 px-3 py-2")}>
      <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-white/90">{bot.nombre || "(sin nombre)"}</p>
        <p className="truncate text-[10px] text-white/55">{bot.rol || "sin rol definido"}</p>
        {bot.descripcion && <p className="mt-0.5 text-[10px] leading-snug text-white/50">{bot.descripcion}</p>}
        <p className={MONO}>
          proceso {bot.procesoTipoId}
          {bot.personalidadId ? ` · personalidad ${bot.personalidadId}` : " · sin personalidad asignada todavía"}
          {bot.agenteId ? ` · agente ${bot.agenteId}` : " · sin agente asignado todavía"}
        </p>
      </div>
      {bot.instalado ? (
        <Badge tone="border-emerald-400/30 bg-emerald-500/10 text-emerald-100" className="gap-1 shrink-0">
          <CircleCheck className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> instalado
        </Badge>
      ) : (
        <button
          type="button"
          className={cn(BTN, "shrink-0")}
          disabled={busy !== ""}
          onClick={() => onInstalar(bot)}
          aria-label={`Instalar el bot ${bot.nombre}`}
        >
          <BusyIcon busy={busy === `instalar:${bot.id}`} icon={Download} /> Instalar
        </button>
      )}
    </div>
  );
}

export interface BotsPredeterminadosPanelProps {
  target: GenesisTarget;
  lista: BotPredeterminado[] | null | undefined;
  loading?: boolean;
  error?: string;
  /** Se llama tras una instalación que sí creó algo, para que el padre recargue la lista. */
  onInstalado?: () => void;
}

export function BotsPredeterminadosPanel({ target, lista, loading, error, onInstalado }: BotsPredeterminadosPanelProps) {
  const seguros = Array.isArray(lista) ? lista : [];
  const resumen = resumirBots(seguros);
  const pendientesIds = idsPendientesDeInstalar(seguros);
  const { busy, wrap } = useBusy();

  function instalar(ids: string[], etiquetaBusy: string) {
    if (ids.length === 0) return; // defensa extra: nunca dispara una instalación vacía, aunque el botón ya venga deshabilitado
    void wrap(etiquetaBusy, async () => {
      const r = await installGenesisBotsPredeterminados(target, ids);
      if (!r.ok) { toast.error("No se pudieron instalar los bots", { description: r.error }); return; }
      if (r.data.length === 0) toast.message("Nada nuevo que instalar", { description: "El backend no creó ningún bot — puede que ya estuvieran todos instalados." });
      else toast.success(`${r.data.length} bot${r.data.length === 1 ? "" : "s"} instalado${r.data.length === 1 ? "" : "s"}`, { description: r.data.join(", ") });
      onInstalado?.();
    });
  }

  return (
    <div className={cn(CARD, "space-y-2 p-3")}>
      <SectionTitle
        icon={Bot}
        title={`Bots predeterminados (${resumen.instalados} de ${resumen.total} instalados)`}
        tone="text-fuchsia-300"
        hint="Los procesos de Imaginación Intuitiva, con su personalidad y su agente reales — instalar los crea como seres."
        right={
          seguros.length > 0 ? (
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy !== "" || pendientesIds.length === 0}
              onClick={() => instalar(pendientesIds, "instalar:todos")}
              aria-label="Instalar todos los bots predeterminados pendientes"
            >
              <BusyIcon busy={busy === "instalar:todos"} icon={Download} />
              {pendientesIds.length === 0 ? "Todos instalados" : `Instalar los ${pendientesIds.length} pendientes`}
            </button>
          ) : undefined
        }
      />

      {seguros.length === 0 && <Empty loading={loading} error={error} text="El backend no expone bots predeterminados todavía." />}

      <div className="space-y-1.5">
        {seguros.map((bot) => (
          <BotRow key={bot.id} bot={bot} busy={busy} onInstalar={(b) => instalar([b.id], `instalar:${b.id}`)} />
        ))}
      </div>
    </div>
  );
}

export default BotsPredeterminadosPanel;
