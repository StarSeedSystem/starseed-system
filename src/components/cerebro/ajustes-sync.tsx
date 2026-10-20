"use client";

/**
 * Vinculación y sincronización de un cerebro, una memoria o una carpeta (CB1013T, contrato §8).
 * Controlado por props: enseña `valor.sync` y avisa con `onCambio({ sync })`; no guarda nada.
 * Los destinos salen de `config.memoryDestinations` (memory-destinations.ts) y los vínculos, de
 * `normalizarVinculos(cerebro.config)` (telepatia.ts). Las tres marcas dicen «solo se guarda» (ver MARCA_SYNC).
 */

import { useMemo } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Ban, Link2, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { normalizarVinculos, type VinculoTelepatico } from "@/lib/cerebros/telepatia";
import { normalizeMemoryDestinations } from "@/lib/brains/memory-destinations";
import type { Brain } from "@/lib/brains/brains";
import { MarcaAplicacion } from "@/components/cerebro/ajustes-seguridad";

type Sync = AjustesObjetivo["sync"];
// Nadie lee aún config.ajustes.sync (dirección, auto ni destinos): el cableado va con syncBrainMemoryNow.
const MARCA_SYNC = "solo-se-guarda" as const;

export interface AjustesSyncProps {
  valor: Pick<AjustesObjetivo, "sync">;
  onCambio: (parcial: Partial<AjustesObjetivo>) => void;
  cerebro: Pick<Brain, "config">;
  /** Abre el diálogo de Telepatía; sin él no se enseña el botón. */
  onAbrirTelepatia?: () => void;
}

const DIRECCIONES: { id: Sync["direccion"]; texto: string; ayuda: string; Icono: LucideIcon }[] = [
  { id: "enviar", texto: "Enviar", ayuda: "Manda sus cambios a los destinos.", Icono: ArrowUpFromLine },
  { id: "recibir", texto: "Recibir", ayuda: "Trae los cambios de los destinos.", Icono: ArrowDownToLine },
  { id: "ambas", texto: "Ambas", ayuda: "Manda y trae.", Icono: ArrowLeftRight },
  { id: "ninguna", texto: "Ninguna", ayuda: "No se sincroniza.", Icono: Ban },
];
const TIPO_DESTINO: Record<VinculoTelepatico["destino"]["tipo"], string> = { cerebro: "Cerebro", grupo: "Grupo", comunidad: "Comunidad", pagina: "Página", cuenta: "Cuenta" };
const DIRECCION_VINCULO: Record<VinculoTelepatico["direccion"], string> = { enviar: "envía", recibir: "recibe", ambas: "envía y recibe" };
const ESTADO_VINCULO: Record<VinculoTelepatico["estado"], string> = { activo: "activo", pausado: "en pausa", pendiente: "pendiente" };

function alcanceDe(v: VinculoTelepatico): string {
  if (v.alcance.completo) return "todo el cerebro";
  const { memorias: m, carpetas: c, configuraciones: k } = v.alcance;
  return `${m.length} memorias, ${c.length} carpetas, ${k.length} configuraciones`;
}

function fecha(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? "sin medida" : new Date(t).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

export function AjustesSync({ valor, onCambio, cerebro, onAbrirTelepatia }: AjustesSyncProps) {
  const sync = valor.sync;
  const cambiar = (parcial: Partial<Sync>) => onCambio({ sync: { ...sync, ...parcial } });
  const vinculos = useMemo(() => normalizarVinculos(cerebro.config), [cerebro.config]);
  const destinos = useMemo(() => {
    const d = normalizeMemoryDestinations(cerebro.config?.memoryDestinations);
    return [
      { id: "local", texto: "Este aparato", activo: d.local.enabled },
      { id: "starseed", texto: "StarSeed", activo: d.starseed.enabled },
      ...d.external.map((e) => ({ id: e.id, texto: e.label, activo: true })),
      { id: "p2p", texto: d.p2p.label ? `Syncthing · ${d.p2p.label}` : "Syncthing (P2P)", activo: d.p2p.enabled },
    ];
  }, [cerebro.config]);
  const alternar = (id: string) => cambiar({ destinos: sync.destinos.includes(id) ? sync.destinos.filter((x) => x !== id) : [...sync.destinos, id] });

  return (
    <section className="space-y-5 text-white" aria-label="Vinculación y sincronización">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><RefreshCw className="h-4 w-4 text-white/60" /><h3 className="text-sm font-semibold">Dirección</h3><MarcaAplicacion estado={MARCA_SYNC} /></div>
        <div className="flex flex-wrap gap-2">
          {DIRECCIONES.map(({ id, texto, ayuda, Icono }) => (
            <Button key={id} type="button" size="sm" variant={sync.direccion === id ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" aria-pressed={sync.direccion === id} title={ayuda} onClick={() => cambiar({ direccion: id })}>
              <Icono className="h-4 w-4" />{texto}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Switch id="sync-solo" checked={sync.auto} disabled={sync.direccion === "ninguna"} onCheckedChange={(v) => cambiar({ auto: v })} />
        <label htmlFor="sync-solo" className="cursor-pointer text-sm">Sincronizar solo</label><MarcaAplicacion estado={MARCA_SYNC} />
        <span className="text-xs text-white/60">{sync.direccion === "ninguna" ? "Con «Ninguna» no se sincroniza." : sync.auto ? "Se sincroniza sin pedírtelo." : "Solo cuando lo pidas."}</span>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Destinos</h3><MarcaAplicacion estado={MARCA_SYNC} /></div>
        <p className="text-xs text-white/60">Los destinos de memoria de este cerebro. Elige a cuáles va esta sincronización.</p>
        <div className="flex flex-wrap gap-2">
          {destinos.map((d) => (
            <Button key={d.id} type="button" size="sm" variant={sync.destinos.includes(d.id) ? "default" : "outline"} className="h-auto whitespace-normal py-1.5" aria-pressed={sync.destinos.includes(d.id)} disabled={!d.activo} title={d.activo ? d.texto : `${d.texto}: apagado en los destinos del cerebro`} onClick={() => alternar(d.id)}>
              {d.texto}{d.activo ? "" : " · apagado"}
            </Button>
          ))}
        </div>
        {sync.destinos.length === 0 && <p className="text-xs text-white/50">Ninguno elegido.</p>}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="h-4 w-4 text-white/60" /><h3 className="text-sm font-semibold">Vínculos de Telepatía</h3>
          <span className="text-xs text-white/60">{vinculos.length === 1 ? "1 vínculo" : `${vinculos.length} vínculos`}</span>
          {onAbrirTelepatia && <Button type="button" size="sm" variant="outline" className="ml-auto h-auto whitespace-normal py-1.5" onClick={onAbrirTelepatia}>Abrir Telepatía</Button>}
        </div>
        {vinculos.length === 0 ? <p className="text-xs text-white/50">Este cerebro no tiene vínculos de Telepatía.</p> : (
          <ul className="space-y-1.5">
            {vinculos.map((v) => (
              <li key={v.id} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white/80">
                <span className="break-words font-medium text-white">{TIPO_DESTINO[v.destino.tipo]} · {v.destino.id}</span>
                <span className="block text-white/60">{DIRECCION_VINCULO[v.direccion]} · {v.acceso === "leer" ? "solo lectura" : "lectura y escritura"} · {ESTADO_VINCULO[v.estado]} · {alcanceDe(v)} · última sincronización: {fecha(v.ultimaSync)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
