"use client";

/*
 * AparatosEnVivo — «Tus aparatos ahora» en el panel de Neuronas (2026-10-09).
 * ═══════════════════════════════════════════════════════════════════════════
 * Una tarjeta por APARATO físico (no por fila): su estado en tiempo real (activa ahora, abierta
 * en segundo plano o inactiva), cada MEDIO donde se usa (app nativa, Chrome en Vercel o en
 * localhost, app instalada…) y las señales que mide cada medio abierto (internet, malla P2P,
 * radio LoRa, Bluetooth, puertos serie, Reticulum).
 *
 * Arriba, si la cuenta tiene neuronas repetidas del mismo aparato, propone FUSIONARLAS (con la
 * neurona que se queda a elegir, explicación de qué se mueve y botón de deshacer), y quitar las
 * filas vacías que no guardan nada.
 *
 * Fuente de verdad: filas de `neuron_devices` (latido y medios guardados) + presencia en vivo
 * (`presencia.ts`). Lo que no se puede medir se dice; no se inventa nada.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  AppWindow,
  Bluetooth,
  Cable,
  Globe,
  Laptop,
  Layers,
  Loader2,
  Merge,
  Monitor,
  Network,
  Radio,
  RadioTower,
  Smartphone,
  Trash2,
  Undo2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Neuron } from "@/lib/neurons/neurons";
import { agruparPorAparato, esFichaVacia, normalizarGpu, type GrupoAparato } from "@/lib/neurons/huella";
import type { RegistroMedio, TipoMedio } from "@/lib/neurons/medio";
import { usePresenciaNeuronas, presentesPorNeurona, type PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import { leerFusiones } from "@/lib/neurons/fusion-alias";

/** «hace 3 min» / «hace 2 h» / «hace 4 días». */
export function haceTexto(iso: string | undefined, ahora: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "sin registro";
  const min = Math.max(0, Math.round((ahora - t) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

const ICONO_MEDIO: Record<TipoMedio, typeof Globe> = {
  "app-nativa": AppWindow,
  "app-instalada": Smartphone,
  local: Monitor,
  "navegador-claude": Layers,
  navegador: Globe,
};

function iconoAparato(n: Neuron) {
  const p = String(n.capabilities?.platform ?? "").toLowerCase();
  if (/android|ios|ipad/.test(p) || n.kind === "mobile" || n.kind === "tablet") return Smartphone;
  return Laptop;
}

/** Nombres puestos a mano (prefs sincronizadas), para elegir la neurona que se queda. */
function nombrados(): Set<string> {
  try {
    const raw = window.localStorage.getItem("starseed.neurons.prefs.v1");
    const p = raw ? (JSON.parse(raw) as { names?: Record<string, string> }) : null;
    return new Set(Object.entries(p?.names ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k]) => k));
  } catch {
    return new Set();
  }
}

export interface Aparato {
  /** Id de la neurona principal (la que representa al aparato). */
  id: string;
  principal: Neuron;
  neuronas: Neuron[];
  grupo: GrupoAparato<Neuron> | null;
}

/** Aparatos de la cuenta: los grupos de repetidas cuentan como uno. Pura. */
export function aparatosDe(neuronas: readonly Neuron[], grupos: readonly GrupoAparato<Neuron>[]): Aparato[] {
  const enGrupo = new Map<string, GrupoAparato<Neuron>>();
  for (const g of grupos) for (const n of g.neuronas) enGrupo.set(n.id, g);
  const vistos = new Set<string>();
  const out: Aparato[] = [];
  for (const n of neuronas) {
    if (vistos.has(n.id)) continue;
    const g = enGrupo.get(n.id) ?? null;
    if (g) {
      g.neuronas.forEach((x) => vistos.add(x.id));
      out.push({ id: g.principal.id, principal: g.principal, neuronas: g.neuronas, grupo: g });
    } else {
      vistos.add(n.id);
      out.push({ id: n.id, principal: n, neuronas: [n], grupo: null });
    }
  }
  return out;
}

interface FilaMedio {
  id: string;
  tipo: TipoMedio;
  etiqueta: string;
  presente: PresenciaMedio | null;
  visto?: string;
}

function mediosDelAparato(a: Aparato, presentes: Map<string, PresenciaMedio[]>): FilaMedio[] {
  const filas = new Map<string, FilaMedio>();
  for (const n of a.neuronas) {
    const ms = (n.capabilities?.medios ?? {}) as Record<string, RegistroMedio>;
    for (const [id, r] of Object.entries(ms)) {
      const previo = filas.get(id);
      if (!previo || Date.parse(r.visto) > Date.parse(previo.visto ?? "0")) filas.set(id, { id, tipo: r.tipo, etiqueta: r.etiqueta, presente: null, visto: r.visto });
    }
    if (!Object.keys(ms).length && !esFichaVacia(n)) {
      // Fila anterior a los medios: su navegador es el medio.
      const nav = n.capabilities?.browser;
      const tipo: TipoMedio = n.capabilities?.installedApp ? "app-instalada" : nav ? "navegador" : "app-nativa";
      filas.set(`fila-${n.id}`, {
        id: `fila-${n.id}`,
        tipo,
        etiqueta: tipo === "app-nativa" ? "App nativa StarSeed OS" : `${nav || "Navegador"}${tipo === "app-instalada" ? " · app instalada" : ""}`,
        presente: null,
        visto: n.last_seen_at,
      });
    }
    for (const p of presentes.get(n.id) ?? []) {
      filas.set(p.m, { id: p.m, tipo: p.tipo, etiqueta: p.etiqueta, presente: p, visto: new Date(p.t).toISOString() });
    }
  }
  return [...filas.values()].sort(
    (x, y) => Number(!!y.presente) - Number(!!x.presente) || Date.parse(y.visto ?? "0") - Date.parse(x.visto ?? "0"),
  );
}

function ChipsSenales({ s }: { s: SenalesMedio }) {
  const chip = "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap";
  return (
    <div className="flex flex-wrap gap-1 mt-1.5" aria-label="Señales de este medio">
      <span className={cn(chip, s.internet.enLinea ? "border-emerald-400/30 text-emerald-200" : "border-rose-400/30 text-rose-200")}>
        {s.internet.enLinea ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}
        {s.internet.enLinea
          ? ["Internet", s.internet.tipo, s.internet.efectivo, s.internet.mbps ? `${s.internet.mbps} Mb/s` : null].filter(Boolean).join(" · ")
          : "Sin internet"}
      </span>
      <span className={cn(chip, s.malla.pares > 0 ? "border-cyan-400/30 text-cyan-200" : "border-white/10 text-white/45")}>
        <Network className="h-3 w-3" aria-hidden />
        {`Malla P2P · ${s.malla.pares} ${s.malla.pares === 1 ? "par" : "pares"}`}
        {s.malla.otrasCuentas > 0 ? ` · ${s.malla.otrasCuentas} faros` : ""}
      </span>
      <span className={cn(chip, s.lora.estado === "sin-radio" ? "border-white/10 text-white/45" : "border-violet-400/30 text-violet-200")}>
        <RadioTower className="h-3 w-3" aria-hidden />
        {s.lora.estado === "sin-radio" ? "LoRa · sin radio conectada" : `LoRa · ${s.lora.transporte ?? "radio"} · ${s.lora.estado} · ${s.lora.nodos} nodos`}
      </span>
      <span className={cn(chip, s.bluetooth.disponible ? "border-sky-400/30 text-sky-200" : "border-white/10 text-white/45")}>
        <Bluetooth className="h-3 w-3" aria-hidden />
        {s.bluetooth.disponible === null ? "Bluetooth · este navegador no lo expone" : s.bluetooth.disponible ? "Bluetooth · adaptador listo" : "Bluetooth · apagado o sin adaptador"}
      </span>
      <span className={cn(chip, s.serie.puertos > 0 ? "border-amber-400/30 text-amber-200" : "border-white/10 text-white/45")}>
        <Cable className="h-3 w-3" aria-hidden />
        {s.serie.disponible ? `Serie · ${s.serie.puertos} ${s.serie.puertos === 1 ? "puerto" : "puertos"}` : "Serie · no disponible aquí"}
      </span>
      <span className={cn(chip, "border-white/10 text-white/40")} title={s.reticulum.motivo}>
        <Radio className="h-3 w-3" aria-hidden />
        Reticulum · {s.reticulum.motivo}
      </span>
    </div>
  );
}

function describirHardware(n: Neuron): string {
  const c = n.capabilities ?? ({} as Neuron["capabilities"]);
  const gpu = normalizarGpu(c.gpuRenderer);
  return [
    c.platform,
    gpu.modelo ? gpu.modelo.replace(/\b\w/g, (x) => x.toUpperCase()) : null,
    c.cores ? `${c.cores} núcleos` : null,
    c.memoryGb ? `${c.memoryGb} GB` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface AparatosEnVivoProps {
  neuronas: Neuron[];
  /** Tras fusionar o quitar filas: volver a leer la lista. */
  onCambio: () => void;
  ahora?: number;
}

export function AparatosEnVivo({ neuronas, onCambio, ahora }: AparatosEnVivoProps) {
  const presencia = usePresenciaNeuronas();
  const presentes = useMemo(() => presentesPorNeurona(presencia.medios), [presencia.medios]);
  const grupos = useMemo(() => agruparPorAparato(neuronas, typeof window === "undefined" ? new Set() : nombrados()), [neuronas]);
  const aparatos = useMemo(() => aparatosDe(neuronas, grupos), [neuronas, grupos]);
  const vacias = useMemo(() => neuronas.filter((n) => esFichaVacia(n) && !n.isThisDevice), [neuronas]);
  const [elegida, setElegida] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ultimaFusion, setUltimaFusion] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const r = leerFusiones().respaldos.filter((x) => !x.deshecha && Date.now() - x.ts < 24 * 3600_000).pop();
    return r ? r.ts : null;
  });
  const sobrantes = grupos.reduce((a, g) => a + g.neuronas.length - 1, 0);

  const fusionar = useCallback(
    async (g: GrupoAparato<Neuron>) => {
      const principal = elegida[g.principal.id] ?? g.principal.id;
      const absorbidas = g.neuronas.map((n) => n.id).filter((id) => id !== principal);
      setOcupado(g.principal.id);
      try {
        const { fusionarNeuronas } = await import("@/lib/neurons/fusion");
        const r = await fusionarNeuronas(principal, absorbidas);
        if (r.ok) {
          setUltimaFusion(r.respaldo ?? null);
          toast.success(`Fusionadas: ${absorbidas.length + 1} neuronas son ahora una sola.`);
          onCambio();
        } else toast.error(r.motivo ?? "No se pudo fusionar.");
      } finally {
        setOcupado(null);
        setConfirmando(null);
      }
    },
    [elegida, onCambio],
  );

  const fusionarTodo = useCallback(async () => {
    setOcupado("todo");
    try {
      const { fusionarNeuronas } = await import("@/lib/neurons/fusion");
      let hechas = 0;
      let ultima: number | null = null;
      for (const g of grupos.filter((x) => x.certeza === "mismo")) {
        const principal = elegida[g.principal.id] ?? g.principal.id;
        const r = await fusionarNeuronas(principal, g.neuronas.map((n) => n.id).filter((id) => id !== principal));
        if (r.ok) {
          hechas += 1;
          ultima = r.respaldo ?? ultima;
        } else toast.error(r.motivo ?? "No se pudo fusionar un aparato.");
      }
      if (hechas) {
        setUltimaFusion(ultima);
        toast.success(`${hechas} ${hechas === 1 ? "aparato queda" : "aparatos quedan"} con una sola neurona.`);
      }
      onCambio();
    } finally {
      setOcupado(null);
      setConfirmando(null);
    }
  }, [grupos, elegida, onCambio]);

  const deshacer = useCallback(async () => {
    if (!ultimaFusion) return;
    setOcupado("deshacer");
    try {
      const { deshacerFusion } = await import("@/lib/neurons/fusion");
      const r = await deshacerFusion(ultimaFusion);
      if (r.ok) {
        toast.success("Fusión deshecha: las neuronas vuelven a estar separadas.");
        const prev = leerFusiones().respaldos.filter((x) => !x.deshecha && Date.now() - x.ts < 24 * 3600_000).pop();
        setUltimaFusion(prev ? prev.ts : null);
        onCambio();
      } else toast.error(r.motivo ?? "No se pudo deshacer.");
    } finally {
      setOcupado(null);
    }
  }, [ultimaFusion, onCambio]);

  const quitarVacias = useCallback(async () => {
    setOcupado("vacias");
    try {
      const { quitarFichasVacias } = await import("@/lib/neurons/fusion");
      const r = await quitarFichasVacias(vacias.map((n) => n.id));
      if (r.ok) {
        toast.success(r.quitadas === 1 ? "Fila vacía quitada." : `${r.quitadas} filas vacías quitadas.`);
        onCambio();
      } else toast.error(r.motivo ?? "No se pudieron quitar.");
    } finally {
      setOcupado(null);
    }
  }, [vacias, onCambio]);

  const t0 = ahora ?? Date.now();
  const hayMismos = grupos.some((g) => g.certeza === "mismo");

  return (
    <section className="space-y-3" data-testid="aparatos-en-vivo" aria-label="Tus aparatos ahora">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="h-4 w-4 text-emerald-300" aria-hidden />
        <h4 className="text-sm font-semibold text-emerald-50">Tus aparatos ahora</h4>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] gap-1",
            presencia.conectado ? "border-emerald-400/40 text-emerald-200 bg-emerald-500/10" : "border-amber-400/30 text-amber-200/90 bg-amber-500/5",
          )}
        >
          <Radio className={cn("h-3 w-3", presencia.conectado && "animate-pulse")} aria-hidden />
          {presencia.conectado ? "En vivo" : "Sin conexión en vivo: estado por latido (cada 5 min)"}
        </Badge>
        <span className="text-[11px] text-white/45">
          {aparatos.length} {aparatos.length === 1 ? "aparato" : "aparatos"} · {neuronas.length} {neuronas.length === 1 ? "neurona" : "neuronas"}
        </span>
      </div>

      {(sobrantes > 0 || vacias.length > 0 || ultimaFusion) && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3 space-y-2" data-testid="sugerencia-fusion">
          {sobrantes > 0 && (
            <>
              <p className="text-xs text-amber-50 leading-relaxed">
                <strong>
                  {grupos.length} {grupos.length === 1 ? "aparato tiene" : "aparatos tienen"} neuronas repetidas
                </strong>{" "}
                ({sobrantes} de más). Pasa cuando abres StarSeed desde otro medio del mismo aparato (otro navegador, localhost, la app
                instalada o la nativa): cada medio guardaba su propia identidad. Al fusionar, la que se queda recibe el nombre,
                permisos, ajustes y sistemas por personalidad de las demás, y las filas repetidas se quitan con respaldo para deshacer.
              </p>
              {hayMismos && (
                <Button size="sm" className="cursor-pointer gap-1.5" disabled={ocupado !== null} onClick={() => setConfirmando("todo")}>
                  <Merge className="h-3.5 w-3.5" aria-hidden /> Fusionar las repetidas seguras
                </Button>
              )}
              {confirmando === "todo" && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-amber-100">
                  <span>¿Fusionar ahora los aparatos marcados como «mismo aparato»?</span>
                  <Button size="sm" className="cursor-pointer" disabled={ocupado !== null} onClick={() => void fusionarTodo()}>
                    {ocupado === "todo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Sí, fusionar
                  </Button>
                  <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setConfirmando(null)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </>
          )}
          {vacias.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-100">
              <span>
                {vacias.length === 1 ? "1 fila vacía" : `${vacias.length} filas vacías`} (sin nombre ni datos del aparato): no guardan nada.
              </span>
              <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 border-white/15" disabled={ocupado !== null} onClick={() => void quitarVacias()}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Quitar
              </Button>
            </div>
          )}
          {ultimaFusion && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
              <span>Última fusión: {haceTexto(new Date(ultimaFusion).toISOString(), t0)}.</span>
              <Button size="sm" variant="ghost" className="cursor-pointer gap-1.5" disabled={ocupado !== null} onClick={() => void deshacer()}>
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Deshacer
              </Button>
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {aparatos.map((a) => {
          const medios = mediosDelAparato(a, presentes);
          const abiertos = medios.filter((m) => m.presente);
          const visibles = abiertos.filter((m) => m.presente?.visible);
          const ultimoVisto = a.neuronas.map((n) => n.last_seen_at).filter(Boolean).sort().pop();
          const estadoTxt = visibles.length
            ? "Activa ahora"
            : abiertos.length
              ? "Abierta en segundo plano"
              : a.neuronas.some((n) => n.online)
                ? `Latido ${haceTexto(ultimoVisto, t0)}`
                : `Inactiva · ${haceTexto(ultimoVisto, t0)}`;
          const Icono = iconoAparato(a.principal);
          const g = a.grupo;
          const principalElegida = g ? elegida[g.principal.id] ?? g.principal.id : a.id;
          return (
            <li key={a.id} className="rounded-xl border border-white/10 bg-black/20 p-3" data-testid="aparato">
              <div className="flex items-start gap-2.5">
                <span className="relative mt-0.5 shrink-0">
                  <Icono className="h-5 w-5 text-cyan-200" aria-hidden />
                  <span
                    className={cn(
                      "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-black",
                      visibles.length ? "bg-emerald-400" : abiertos.length ? "bg-amber-300" : "bg-white/25",
                    )}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-semibold text-white">{a.principal.name}</span>
                    {a.neuronas.some((n) => n.isThisDevice) && (
                      <Badge variant="outline" className="text-[9px] border-cyan-400/30 text-cyan-200">
                        Este aparato
                      </Badge>
                    )}
                    <span className={cn("text-[11px]", visibles.length ? "text-emerald-300" : abiertos.length ? "text-amber-200" : "text-white/45")}>
                      {estadoTxt}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-white/45">{describirHardware(a.principal)}</p>
                </div>
              </div>

              <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-3" aria-label={`Medios de ${a.principal.name}`}>
                {medios.length === 0 && <li className="text-[11px] text-white/40">Sin medios registrados todavía.</li>}
                {medios.map((m) => {
                  const IM = ICONO_MEDIO[m.tipo] ?? Globe;
                  return (
                    <li key={m.id} className="text-[11px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <IM className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden />
                        <span className="min-w-0 truncate text-white/80">{m.etiqueta}</span>
                        <span className={m.presente ? (m.presente.visible ? "text-emerald-300" : "text-amber-200") : "text-white/40"}>
                          {m.presente ? (m.presente.visible ? "abierto ahora" : "en segundo plano") : haceTexto(m.visto, t0)}
                        </span>
                      </div>
                      {m.presente && <ChipsSenales s={m.presente.s} />}
                    </li>
                  );
                })}
              </ul>

              {g && (
                <div className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-500/[0.05] p-2.5 space-y-2">
                  <p className="text-[11px] text-amber-100 leading-relaxed">
                    {g.certeza === "mismo" ? "Es el mismo aparato" : "Parece el mismo aparato (revísalo)"} en {g.neuronas.length} neuronas:{" "}
                    {g.motivos.slice(0, 4).join(", ")}. Elige la que se queda:
                  </p>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Neurona que se queda">
                    {g.neuronas.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        role="radio"
                        aria-checked={principalElegida === n.id}
                        onClick={() => setElegida((e) => ({ ...e, [g.principal.id]: n.id }))}
                        className={cn(
                          "cursor-pointer rounded-md border px-2 py-1 text-[11px] transition-colors duration-200",
                          principalElegida === n.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100" : "border-white/10 text-white/60 hover:border-white/25",
                        )}
                      >
                        {n.name}
                        <span className="ml-1 text-white/40">{n.capabilities?.browser || (n.capabilities?.platform ? "app" : "")}</span>
                      </button>
                    ))}
                  </div>
                  {confirmando === g.principal.id ? (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-100">
                      <span>
                        Se queda «{g.neuronas.find((n) => n.id === principalElegida)?.name}» con los ajustes de las otras {g.neuronas.length - 1}.
                      </span>
                      <Button size="sm" className="cursor-pointer h-7" disabled={ocupado !== null} onClick={() => void fusionar(g)}>
                        {ocupado === g.principal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" className="cursor-pointer h-7" onClick={() => setConfirmando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="cursor-pointer h-7 gap-1.5 border-white/15" disabled={ocupado !== null} onClick={() => setConfirmando(g.principal.id)}>
                      <Merge className="h-3.5 w-3.5" aria-hidden /> Fusionar en una
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default AparatosEnVivo;
