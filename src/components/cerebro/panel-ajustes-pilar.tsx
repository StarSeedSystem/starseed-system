"use client";

/**
 * Ajustes por pilar del cerebro (CER1126A · parte 1).
 *
 * Un mismo panel lateral para los siete pilares, con las secciones siempre en el
 * mismo orden: General, Privacidad y permisos, Sincronía y Avanzado. Reutiliza
 * los controles que ya existían (medios, seguridad y sincronización) para no
 * perder ninguna opción, añade búsqueda dentro de los ajustes, «Volver a lo
 * recomendado» por sección con confirmación y enlace directo
 * `?tab=<pilar>&ajustes=<seccion>`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Cog,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getBrain, saveBrain, type Brain } from "@/lib/brains/brains";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
import {
  AJUSTES_POR_DEFECTO,
  APLICACION,
  ajustesEfectivos,
  conAjustes,
  leerAjustes,
  type AjustesCerebro,
  type AjustesObjetivo,
} from "@/lib/cerebros/ajustes";
import { AjustesMedios } from "@/components/cerebro/ajustes-medios";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";
import { PILARES, pilarDesdeUrl, type Pilar } from "@/components/cerebro/pilares";

export type SeccionAjustes = "general" | "privacidad" | "sincronia" | "avanzado";

export interface DefinicionSeccionAjustes {
  id: SeccionAjustes;
  etiqueta: string;
  descripcion: string;
  claves: readonly string[];
  alias: readonly string[];
  Icono: LucideIcon;
}

export const SECCIONES_AJUSTES: readonly DefinicionSeccionAjustes[] = [
  {
    id: "general",
    etiqueta: "General",
    descripcion: "Medios, capacidades y almacenamiento.",
    claves: ["medios", "capacidades", "almacenamiento", "servidor", "neurona", "texto", "imagen", "voz", "video", "embeddings", "agentes"],
    alias: ["medios", "capacidades", "almacenamiento"],
    Icono: Settings2,
  },
  {
    id: "privacidad",
    etiqueta: "Privacidad y permisos",
    descripcion: "Quién ve el cerebro y qué puede hacer.",
    claves: ["privacidad", "permisos", "acceso", "cifrado", "compartir", "lectura", "escritura", "administrar", "seguridad"],
    alias: ["seguridad", "permisos", "privacidad-permisos"],
    Icono: ShieldCheck,
  },
  {
    id: "sincronia",
    etiqueta: "Sincronía",
    descripcion: "Dirección, destinos y vínculos de Telepatía.",
    claves: ["sincronia", "sincronizar", "telepatia", "destinos", "vinculos", "enviar", "recibir", "vinculacion"],
    alias: ["sync", "sincronizacion", "telepatia", "vinculacion"],
    Icono: RefreshCw,
  },
  {
    id: "avanzado",
    etiqueta: "Avanzado",
    descripcion: "A qué se aplican los ajustes y qué se guarda ya.",
    claves: ["aplicar", "herencia", "memoria", "carpeta", "guardar", "recomendado", "restablecer"],
    alias: ["aplicar", "herencia"],
    Icono: Cog,
  },
];

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function seccionAjustesDesdeUrl(valor: string | null | undefined): SeccionAjustes | null {
  const v = normalizar((valor ?? "").trim());
  if (!v) return null;
  const encontrada = SECCIONES_AJUSTES.find((s) => s.id === v || normalizar(s.etiqueta) === v || s.alias.includes(v));
  return encontrada?.id ?? null;
}

export function buscarAjustes(consulta: string): SeccionAjustes[] {
  const tokens = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return SECCIONES_AJUSTES.map((s) => s.id);
  return SECCIONES_AJUSTES.filter((s) => {
    const pajar = normalizar([s.etiqueta, s.descripcion, ...s.claves, ...s.alias].join(" "));
    return tokens.every((t) => pajar.includes(t));
  }).map((s) => s.id);
}

export function enlaceAjustes(pilar: Pilar, seccion: SeccionAjustes): string {
  return `?tab=${pilar}&ajustes=${seccion}`;
}

export function ajustesDesdeBusqueda(busqueda: string): { pilar: Pilar | null; seccion: SeccionAjustes | null } {
  const p = new URLSearchParams(busqueda.startsWith("?") ? busqueda.slice(1) : busqueda);
  return { pilar: pilarDesdeUrl(p.get("tab")), seccion: seccionAjustesDesdeUrl(p.get("ajustes")) };
}

export function privacidadRecomendada(scope: string | null | undefined): AjustesObjetivo["privacidad"] {
  const s = String(scope ?? "").trim().toLowerCase();
  return s === "group" || s === "community" || s === "page" ? "grupo" : "privado";
}

export function ajustesRecomendados(seccion: SeccionAjustes, scope?: string | null): Partial<AjustesObjetivo> {
  switch (seccion) {
    case "general":
      return { medios: AJUSTES_POR_DEFECTO.medios };
    case "privacidad":
      return {
        privacidad: privacidadRecomendada(scope),
        cifradoLocal: AJUSTES_POR_DEFECTO.cifradoLocal,
        acceso: AJUSTES_POR_DEFECTO.acceso,
      };
    case "sincronia":
      return { sync: AJUSTES_POR_DEFECTO.sync };
    case "avanzado":
      return {};
  }
}

type Objetivo = { tipo: "cerebro" } | { tipo: "memoria" | "carpeta"; id: string };
type Carpeta = { id: string; nombre: string };
type Nivel = Objetivo["tipo"];

const SELECT = "h-9 w-full cursor-pointer rounded-md border border-white/15 bg-black/40 px-2 text-sm text-white";

function objetivoDe(destino: string): Objetivo {
  const [tipo, ...resto] = destino.split(":");
  const id = resto.join(":");
  return (tipo === "memoria" || tipo === "carpeta") && id ? { tipo, id } : { tipo: "cerebro" };
}

function leerCarpetas(brainId: string): Carpeta[] {
  if (typeof window === "undefined") return [];
  try {
    const ids = JSON.parse(window.localStorage.getItem(`starseed.brain.${brainId}.memoryRoots`) ?? "[]") as unknown;
    const raices = JSON.parse(window.localStorage.getItem("starseed.memory.roots.v1") ?? "[]") as unknown;
    const nombres = new Map<string, string>();
    if (Array.isArray(raices)) {
      for (const r of raices) {
        if (!r || typeof r !== "object" || !("id" in r)) continue;
        const f = r as { id: unknown; name?: unknown };
        nombres.set(String(f.id), typeof f.name === "string" && f.name ? f.name : String(f.id));
      }
    }
    return Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === "string").map((id) => ({ id, nombre: nombres.get(id) ?? id }))
      : [];
  } catch {
    return [];
  }
}

function combinar(base: AjustesObjetivo, parcial: Partial<AjustesObjetivo>): AjustesObjetivo {
  return {
    ...base,
    ...parcial,
    medios: {
      capacidades: { ...base.medios.capacidades, ...(parcial.medios?.capacidades ?? {}) },
      almacenamiento: parcial.medios?.almacenamiento ?? base.medios.almacenamiento,
    },
    sync: parcial.sync ?? base.sync,
    acceso: parcial.acceso ?? base.acceso,
  };
}

function juntar(a: Partial<AjustesObjetivo>, b: Partial<AjustesObjetivo>): Partial<AjustesObjetivo> {
  return { ...a, ...b, medios: b.medios ?? a.medios, sync: b.sync ?? a.sync, acceso: b.acceso ?? a.acceso };
}

function ResumenAvanzado({ nivel }: { nivel: Nivel }) {
  const filas = [
    { etiqueta: "Medios y almacenamiento", estado: nivel === "cerebro" ? APLICACION["medios.almacenamiento"] : "solo-se-guarda" },
    { etiqueta: "Privacidad", estado: nivel === "cerebro" ? APLICACION.privacidad : "solo-se-guarda" },
    { etiqueta: "Lista de acceso", estado: APLICACION.acceso },
    { etiqueta: "Cifrado local", estado: APLICACION.cifradoLocal },
    { etiqueta: "Sincronía", estado: APLICACION.sync },
    { etiqueta: "Capacidades", estado: APLICACION["medios.capacidades"] },
  ] as const;
  return (
    <div className="space-y-3 text-white">
      <p className="text-xs leading-relaxed text-white/60">
        Lo que se aplica ya y lo que solo se guarda. El destino de arriba decide si los ajustes son del cerebro entero o
        solo de una memoria o carpeta.
      </p>
      <ul className="space-y-1.5">
        {filas.map((f) => (
          <li key={f.etiqueta} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm">
            <span className="break-words">{f.etiqueta}</span>
            <span className="text-xs text-white/60">{f.estado === "se-aplica" ? "Se aplica ya" : "Solo se guarda por ahora"}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-white/60">En una memoria o carpeta, lo que no cambies se hereda del cerebro.</p>
    </div>
  );
}

export interface ContenidoAjustesPilarProps {
  cerebro: Brain;
  onHecho?: () => void;
  onCerrar: () => void;
  seccionInicial?: SeccionAjustes;
  onSeccionChange?: (seccion: SeccionAjustes) => void;
}

export function ContenidoAjustesPilar({ cerebro, onHecho, onCerrar, seccionInicial = "general", onSeccionChange }: ContenidoAjustesPilarProps) {
  const confirm = useConfirm();
  const [destino, setDestino] = useState("cerebro");
  const [ajustes, setAjustes] = useState<AjustesCerebro>(() => leerAjustes(cerebro));
  const [cambios, setCambios] = useState<Record<string, Partial<AjustesObjetivo>>>({});
  const [memorias, setMemorias] = useState<string[]>([]);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [seccion, setSeccion] = useState<SeccionAjustes>(seccionInicial);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setAjustes(leerAjustes(cerebro));
    setCambios({});
    setDestino("cerebro");
    setCarpetas(leerCarpetas(cerebro.id));
    let vivo = true;
    void listMemoryFiles(cerebro.id)
      .then((f) => { if (vivo) setMemorias(f.map((x) => x.name)); })
      .catch(() => { if (vivo) setMemorias([]); });
    return () => { vivo = false; };
  }, [cerebro.id]);

  const objetivo = objetivoDe(destino);
  const parcial = cambios[destino] ?? {};
  const valor = combinar(ajustesEfectivos(ajustes, objetivo), parcial);
  const nivel = objetivo.tipo;
  const cambiar = useCallback(
    (p: Partial<AjustesObjetivo>) => setCambios((prev) => ({ ...prev, [destino]: juntar(prev[destino] ?? {}, p) })),
    [destino],
  );
  const seccionesVisibles = useMemo(() => buscarAjustes(busqueda), [busqueda]);
  const definicion = SECCIONES_AJUSTES.find((s) => s.id === seccion) ?? SECCIONES_AJUSTES[0];

  useEffect(() => {
    if (seccionesVisibles.length > 0 && !seccionesVisibles.includes(seccion)) {
      setSeccion(seccionesVisibles[0]);
      onSeccionChange?.(seccionesVisibles[0]);
    }
  }, [seccionesVisibles, seccion, onSeccionChange]);

  const elegirSeccion = (s: SeccionAjustes) => {
    setSeccion(s);
    onSeccionChange?.(s);
  };

  const reiniciarSeccion = async () => {
    const ok = await confirm({
      title: "¿Volver a lo recomendado?",
      description: `Se restablecerán solo los ajustes de «${definicion.etiqueta}». Los demás no cambian.`,
      confirmText: "Restablecer",
      destructive: true,
    });
    if (!ok) return;
    if (seccion === "avanzado") {
      setDestino("cerebro");
      return;
    }
    cambiar(ajustesRecomendados(seccion, cerebro.scope));
  };

  const guardar = async () => {
    if (Object.keys(parcial).length === 0) { onCerrar(); return; }
    setGuardando(true);
    setAviso(null);
    try {
      const fresco = (await getBrain(cerebro.id)) ?? cerebro;
      const guardado = await saveBrain({ ...fresco, config: conAjustes(fresco.config, objetivo, parcial) });
      if (!guardado) throw new Error("No se pudo guardar el cerebro.");
      onHecho?.();
      onCerrar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4 text-white">
      <div className="space-y-1.5">
        <label htmlFor="aplicar-a-pilar" className="text-sm font-semibold">Aplicar a</label>
        <select id="aplicar-a-pilar" className={SELECT} value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="cerebro">Cerebro completo</option>
          {memorias.length > 0 && (
            <optgroup label="Una memoria">
              {memorias.map((m) => <option key={m} value={`memoria:${m}`}>{m}</option>)}
            </optgroup>
          )}
          {carpetas.length > 0 && (
            <optgroup label="Una carpeta">
              {carpetas.map((c) => <option key={c.id} value={`carpeta:${c.id}`}>{c.nombre}</option>)}
            </optgroup>
          )}
        </select>
        <p className="text-xs leading-relaxed text-white/60">
          {nivel === "cerebro"
            ? "El cerebro entero; memorias y carpetas heredan lo que no cambien."
            : "Solo esta parte; lo que no cambies se hereda del cerebro."}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="buscar-ajustes-pilar" className="text-sm font-semibold">Buscar en los ajustes</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-white/40" aria-hidden />
          <Input
            id="buscar-ajustes-pilar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Cifrado, telepatía, almacenamiento…"
            className="h-9 cursor-text border-white/15 bg-black/40 pl-8"
          />
        </div>
      </div>

      <div role="group" aria-label="Secciones de ajustes" className="flex flex-wrap gap-2">
        {SECCIONES_AJUSTES.filter((s) => seccionesVisibles.includes(s.id)).map((s) => {
          const Icono = s.Icono;
          return (
            <Button
              key={s.id}
              type="button"
              size="sm"
              variant={seccion === s.id ? "default" : "outline"}
              className="h-auto cursor-pointer gap-1.5 whitespace-normal py-1.5"
              aria-pressed={seccion === s.id}
              title={s.descripcion}
              onClick={() => elegirSeccion(s.id)}
            >
              <Icono className="h-3.5 w-3.5" aria-hidden />
              {s.etiqueta}
            </Button>
          );
        })}
      </div>

      {seccionesVisibles.length === 0 ? (
        <p role="status" className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-white/60">
          No hay ajustes que coincidan con «{busqueda}».
        </p>
      ) : (
        <section aria-label={definicion.etiqueta} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{definicion.etiqueta}</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-auto cursor-pointer gap-1.5 whitespace-normal py-1 text-xs"
              onClick={() => void reiniciarSeccion()}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Volver a lo recomendado
            </Button>
          </div>
          {seccion === "general" && (
            <AjustesMedios valor={valor} onCambio={cambiar} cerebro={cerebro} privacidad={valor.privacidad} nivel={nivel} />
          )}
          {seccion === "privacidad" && <AjustesSeguridad valor={valor} onCambio={cambiar} nivel={nivel} />}
          {seccion === "sincronia" && <AjustesSync valor={valor} onCambio={cambiar} cerebro={cerebro} />}
          {seccion === "avanzado" && <ResumenAvanzado nivel={nivel} />}
        </section>
      )}

      {aviso && <p className="text-sm text-amber-200">{aviso}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-auto cursor-pointer whitespace-normal" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button type="button" className="h-auto cursor-pointer whitespace-normal" onClick={() => void guardar()} disabled={guardando}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

export interface PanelAjustesPilarProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  pilar: Pilar;
  cerebro: Brain;
  onHecho?: () => void;
  seccionInicial?: SeccionAjustes | null;
  onSeccionChange?: (seccion: SeccionAjustes) => void;
}

export default function PanelAjustesPilar({
  open,
  onOpenChange,
  pilar,
  cerebro,
  onHecho,
  seccionInicial,
  onSeccionChange,
}: PanelAjustesPilarProps) {
  const definicion = PILARES.find((p) => p.id === pilar) ?? PILARES[0];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-white/10 bg-black/85 backdrop-blur-2xl sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-cyan-300" aria-hidden />
            Ajustes · {definicion.etiqueta}
          </SheetTitle>
          <SheetDescription>
            Los mismos apartados en todos los pilares. Busca, ajusta y guarda sin perder ninguna opción.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <ContenidoAjustesPilar
            cerebro={cerebro}
            onHecho={onHecho}
            onCerrar={() => onOpenChange(false)}
            seccionInicial={seccionInicial ?? "general"}
            onSeccionChange={onSeccionChange}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
