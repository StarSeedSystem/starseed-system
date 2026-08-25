"use client";

/**
 * ser-ficha.tsx — la ficha de un ser: TODO lo que el contrato expone se
 * configura aquí (punto 2 del encargo): personalidades, cerebros,
 * habilidades, herramientas, reglas, soberanía, enrutado de modelos,
 * imaginación, recursos, comunidades y espacio hogar. Además: identidad
 * básica, linaje (de lectura) y ADN (de lectura, con recalcular).
 *
 * Cada campo se guarda en el momento en que el usuario termina de tocarlo
 * (blur/change) con un PATCH mínimo — no hay un botón único de "guardar
 * todo": así, si algo falla a mitad de una sesión larga de ajustes, solo se
 * pierde ESE campo, nunca el resto.
 *
 * Vínculos (`/api/genesis/vinculos`) tienen cliente completo en
 * `genesis-client.ts` pero NO tienen editor aquí: el punto 2 del encargo
 * enumera explícitamente lo que la ficha debe configurar, y vínculos no
 * está en esa lista — se deja fuera a propósito, no por olvido.
 */
import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft, Brain, CircleUserRound, Dna, Gauge, GitFork, Globe, Network, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, User, Users, Cpu as CpuIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { fetchAstraura158Manifest } from "@/lib/astraura/astraura-158-client";
import type { CapacidadInternet, CerebroSer, EnrutadoCognitivo, FuenteAvatar, Ser, Soberania } from "@/lib/astraura/genesis-types";
import {
  createGenesisComunidad, createGenesisEspacio, deleteGenesisSer, fetchGenesisComunidades, fetchGenesisEspacios,
  fetchGenesisLinaje, fetchGenesisModelos, fetchGenesisSer, recomputeGenesisAdn, updateGenesisSer,
  type GenesisTarget, type SerPatch,
} from "@/lib/astraura/genesis-client";
// OLA 2 (`genesis-client-ola2.ts`): internet/herramientas/cerebros propios y
// avatar de UN ser, más el catálogo global de herramientas del sistema.
// Mismo `GenesisResponse`/`useS158Load` que el resto — se integran aquí con
// el mismo patrón `commit*Core`/`commit*` que ya usa el resto de la ficha.
import {
  fetchGenesisHerramientas, setGenesisSerAvatar, updateGenesisSerCerebros, updateGenesisSerInternet,
} from "@/lib/astraura/genesis-client-ola2";
import {
  BTN, BTN_DANGER, BusyIcon, CARD, Empty, Field, INPUT, LABEL, MONO, PERMISSION_LABEL, PERMISSION_LEVEL_IDS,
  PILL, PILL_ON, PILL_OFF, SELECT, SUB, Stat, SectionTitle, TEXTAREA, clampInt, fmtTs, runS158, useBusy, useS158Load,
} from "../s158/shared";
import { adnDeSer, joinLineList, nivelEvolutivoLabel, nombreEnLinaje, parseLineList } from "./genesis-logic";
import { EstadoSerBadge } from "./genesis-shared";
import { SoberaniaPanel } from "./soberania-panel";
import { EnrutadoPanel } from "./enrutado-panel";
// OLA 2, en paralelo: catálogo de herramientas + acceso a internet + cerebros
// propios de ESTE ser (leen/mutan por `serId`, así que son "de un ser" — su
// sitio es la ficha). Los bots predeterminados (el otro panel de esa misma
// ola) NO están aquí a propósito: son de fábrica, no de un ser en concreto —
// viven en `genesis-section.tsx`, junto al censo completo.
import { CerebrosPanel, HerramientasLista, InternetPanel } from "./herramientas";

// Igual que en seres-lista.tsx: el avatar monta un <Canvas> WebGL y no es SSR-safe.
const SerAvatarSlot = dynamic(() => import("./ser-avatar-slot"), {
  ssr: false,
  loading: () => <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-white/10" aria-hidden="true" />,
});
// El selector de cuerpo reutiliza `AvatarAutonomo` en su pestaña procedural
// (mismo Canvas WebGL) — se difiere exactamente igual, y aparte de
// `SerAvatarSlot`: es una pieza bastante más grande (tres pestañas,
// buscador en línea) que no debe descargarse hasta que la ficha llegue a
// pintar su sección "Cuerpo", ni bloquear el resto de esta si three.js
// tarda en cargar.
const SelectorCuerpoSer = dynamic(() => import("./avatar").then((m) => m.SelectorCuerpoSer), {
  ssr: false,
  loading: () => <div className="h-40 w-full animate-pulse rounded-xl border border-white/10 bg-white/[0.02]" aria-hidden="true" />,
});

/** Vocabulario de frecuencia de imaginación ya establecido en `agentes-tab.tsx`; repetido aquí porque no se exporta desde allí. */
const IMAG_FREQ = ["cada_ciclo", "frecuente", "normal", "ocasional", "solo_manual"] as const;

function soberaniaLabel(patch: Partial<Soberania>): string {
  const etiquetas: Partial<Record<keyof Soberania, string>> = {
    dominio: "Dominio actualizado", exploracion: "Exploración actualizada", medios: "Medios actualizados",
    cerebros: "Cerebros de soberanía actualizados", puedeProponerFuera: "Permiso de proponer fuera actualizado",
    prefijoRamaVariante: "Prefijo de rama actualizado", limitesDuros: "Límites duros actualizados",
  };
  const clave = Object.keys(patch)[0] as keyof Soberania | undefined;
  return (clave && etiquetas[clave]) || "Soberanía actualizada";
}

function enrutadoLabel(patch: Partial<EnrutadoCognitivo>): string {
  if ("escalera" in patch) return "Escalera de modelos actualizada";
  if ("soloGratuitos" in patch) return `Solo gratuitos: ${patch.soloGratuitos ? "activado" : "desactivado"}`;
  return "Enrutado actualizado";
}

/** Chips de catálogo (personalidades/cerebros reales del backend 1.58, no inventados aquí). */
function CatalogoChips<T extends { id: string; nombre: string; color?: string | null }>({
  items, seleccionIds, disabled, onToggle,
}: {
  items: T[];
  seleccionIds: string[];
  disabled: boolean;
  onToggle: (item: T, activo: boolean) => void;
}) {
  if (items.length === 0) return <p className="text-[10px] text-white/40">Sin catálogo disponible desde el backend 1.58 todavía.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const activo = seleccionIds.includes(it.id);
        return (
          <button key={it.id} type="button" disabled={disabled} aria-pressed={activo} className={cn(PILL, activo ? PILL_ON : PILL_OFF)} onClick={() => onToggle(it, !activo)}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.color || "#94a3b8" }} aria-hidden="true" />
            {it.nombre}
          </button>
        );
      })}
    </div>
  );
}

export interface SerFichaProps {
  target: GenesisTarget;
  serId: string;
  onVolver: () => void;
  onBorrado: () => void;
  onEngendrar: (progenitorId: string, nombreProgenitor: string) => void;
  /** Algo visible desde la lista cambió (nombre, estado, generación…): pide que se recargue. */
  onCambiado: () => void;
}

export function SerFicha({ target, serId, onVolver, onBorrado, onEngendrar, onCambiado }: SerFichaProps) {
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();

  const loadSer = useCallback((t: GenesisTarget) => fetchGenesisSer(t, serId), [serId]);
  const ser = useS158Load(loadSer, target, 15_000);
  const comunidades = useS158Load(fetchGenesisComunidades, target, 60_000);
  const espacios = useS158Load(fetchGenesisEspacios, target, 60_000);
  const modelos = useS158Load(fetchGenesisModelos, target, 60_000);
  const linaje = useS158Load(fetchGenesisLinaje, target, 60_000);
  const manifest = useS158Load(fetchAstraura158Manifest, target, 60_000);
  // OLA 2: catálogo global de herramientas del sistema (no por ser — mismo
  // criterio de poll que el resto de catálogos de arriba).
  const herramientas = useS158Load(fetchGenesisHerramientas, target, 60_000);

  const [nuevaComunidad, setNuevaComunidad] = useState({ nombre: "", proposito: "" });
  const [nuevoEspacio, setNuevoEspacio] = useState({ nombre: "", arquetipo: "" });

  const s = ser.data;
  const reloadSer = ser.reload;

  const commitCore = useCallback(
    (label: string, patch: SerPatch) => runS158(label, () => updateGenesisSer(target, serId, patch), { after: async () => { await reloadSer(true); onCambiado(); } }),
    [target, serId, reloadSer, onCambiado],
  );
  const commit = useCallback((label: string, patch: SerPatch) => { void wrap(label, () => commitCore(label, patch)); }, [wrap, commitCore]);

  // OLA 2 — internet, cerebros propios y avatar: endpoints DEDICADOS
  // (`/seres/{id}/internet`, `/cerebros`, `/avatar`), no el PATCH genérico
  // de arriba, así que cada uno lleva su propio `commit*Core`/`commit*` —
  // mismo patrón que `commitCore`/`commit`, mismo `runS158`, mismo `busy`
  // compartido de toda la ficha (deshabilita el resto mientras cualquiera
  // de estos guarda, igual que ya hace cada campo de arriba).
  const commitInternetCore = useCallback(
    (patch: Partial<CapacidadInternet>) =>
      runS158("Acceso a internet actualizado", () => updateGenesisSerInternet(target, serId, patch), { after: async () => { await reloadSer(true); onCambiado(); } }),
    [target, serId, reloadSer, onCambiado],
  );
  const commitInternet = useCallback((patch: Partial<CapacidadInternet>) => { void wrap("internet", () => commitInternetCore(patch)); }, [wrap, commitInternetCore]);

  const commitCerebrosCore = useCallback(
    (next: CerebroSer[]) =>
      runS158("Cerebros propios actualizados", () => updateGenesisSerCerebros(target, serId, next), { after: async () => { await reloadSer(true); onCambiado(); } }),
    [target, serId, reloadSer, onCambiado],
  );
  const commitCerebros = useCallback((next: CerebroSer[]) => { void wrap("cerebros", () => commitCerebrosCore(next)); }, [wrap, commitCerebrosCore]);

  const commitAvatarCore = useCallback(
    (fuente: FuenteAvatar) =>
      runS158(fuente.modo === "procedural" ? "Cuerpo procedural restaurado" : "Cuerpo del avatar actualizado", () => setGenesisSerAvatar(target, serId, fuente), { after: async () => { await reloadSer(true); onCambiado(); } }),
    [target, serId, reloadSer, onCambiado],
  );
  const commitAvatar = useCallback((fuente: FuenteAvatar) => { void wrap("avatar", () => commitAvatarCore(fuente)); }, [wrap, commitAvatarCore]);

  const handleDelete = () => {
    if (!s) return;
    const nombre = s.nombre;
    void wrap("delete", async () => {
      const ok = await confirm({
        title: `¿Eliminar a «${nombre}»?`,
        description: "Se borra del backend de Génesis. Esta acción no se puede deshacer.",
        confirmText: "Eliminar", cancelText: "Cancelar", destructive: true,
      });
      if (!ok) return;
      await runS158(`${nombre} eliminado`, () => deleteGenesisSer(target, serId), { after: () => { onBorrado(); onCambiado(); } });
    });
  };

  const handleRecalcular = () => {
    if (!s) return;
    void wrap("recalcular", () => runS158(`ADN de ${s.nombre} recalculado`, () => recomputeGenesisAdn(target, serId), { after: () => reloadSer(true) }));
  };

  const crearYUnirComunidad = () => {
    const nombre = nuevaComunidad.nombre.trim();
    const proposito = nuevaComunidad.proposito.trim();
    if (!nombre || !proposito || !s) return;
    void wrap("crear-comunidad", async () => {
      const r = await createGenesisComunidad(target, { nombre, proposito });
      if (!r.ok) { toast.error(`Crear comunidad: ${r.error}`); return; }
      toast.success(`Comunidad «${r.data.nombre}» creada`);
      setNuevaComunidad({ nombre: "", proposito: "" });
      await comunidades.reload(true);
      await commitCore(`${s.nombre} se unió a ${r.data.nombre}`, { comunidades: [...s.comunidades, r.data.id] });
    });
  };

  const crearYAsignarEspacio = () => {
    const nombre = nuevoEspacio.nombre.trim();
    const arquetipo = nuevoEspacio.arquetipo.trim();
    if (!nombre || !arquetipo || !s) return;
    void wrap("crear-espacio", async () => {
      const r = await createGenesisEspacio(target, { nombre, arquetipo });
      if (!r.ok) { toast.error(`Crear espacio: ${r.error}`); return; }
      toast.success(`Espacio «${r.data.nombre}» creado`);
      setNuevoEspacio({ nombre: "", arquetipo: "" });
      await espacios.reload(true);
      await commitCore(`Espacio hogar: ${r.data.nombre}`, { espacioHogarId: r.data.id });
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={BTN} onClick={onVolver} aria-label="Volver a la lista de seres">
          <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Volver
        </button>
        <button type="button" className={BTN} onClick={() => { void ser.reload(); }} aria-label="Recargar ficha">
          <RefreshCw className={cn("h-3 w-3", ser.loading && "animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {!s && (
        <div className={cn(CARD, "p-3")}>
          <Empty loading={ser.loading} error={ser.error} text="No se encontró este ser." />
        </div>
      )}

      {s && (
        <>
          {/* Cabecera: avatar, identidad de un vistazo, acciones de riesgo */}
          <div className={cn(CARD, "p-3")}>
            <div className="flex flex-wrap items-center gap-3">
              <SerAvatarSlot ser={s} tamano={72} avatarFuente={s.avatarFuente} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[15px] font-semibold text-white/95">{s.nombre}</h2>
                  <EstadoSerBadge estado={s.estado} />
                </div>
                <p className="truncate text-[11px] text-white/55">{s.rol || "sin rol definido"}{s.esencia ? ` — "${s.esencia}"` : ""}</p>
                <p className={MONO}>gen. {s.linaje.generacion} · {s.experiencia} exp · creado {fmtTs(s.creadoEn)} · actualizado {fmtTs(s.actualizadoEn)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className={BTN} disabled={busy !== ""} onClick={() => onEngendrar(s.id, s.nombre)} aria-label={`${s.nombre} engendra un descendiente`}>
                  <GitFork className="h-3 w-3" aria-hidden="true" /> Engendrar
                </button>
                <button type="button" className={BTN_DANGER} disabled={busy !== ""} onClick={handleDelete} aria-label={`Eliminar a ${s.nombre}`}>
                  <BusyIcon busy={busy === "delete"} icon={Trash2} /> Eliminar
                </button>
              </div>
            </div>
          </div>

          {/* Identidad básica */}
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={User} title="Identidad" hint="Cómo se llama y se presenta este ser." />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Nombre">
                <input className={INPUT} defaultValue={s.nombre} disabled={busy !== ""} aria-label="Nombre"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.nombre) commit(`Nombre: ${v}`, { nombre: v }); }} />
              </Field>
              <Field label="Rol">
                <input className={INPUT} defaultValue={s.rol} disabled={busy !== ""} aria-label="Rol"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== s.rol) commit("Rol actualizado", { rol: v }); }} />
              </Field>
              <Field label="Esencia — cómo se describe a sí mismo" className="sm:col-span-2">
                <input className={INPUT} defaultValue={s.esencia ?? ""} disabled={busy !== ""} aria-label="Esencia"
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (s.esencia ?? null)) commit("Esencia actualizada", { esencia: v }); }} />
              </Field>
              <Field label="Color">
                <div className="flex items-center gap-2">
                  <input className={cn(INPUT, "flex-1")} defaultValue={s.color ?? ""} placeholder="#7dd3fc" disabled={busy !== ""} aria-label="Color"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (s.color ?? null)) commit("Color actualizado", { color: v }); }} />
                  <span className="h-6 w-6 shrink-0 rounded-full border border-white/20" style={{ background: s.color || "transparent" }} aria-hidden="true" />
                </div>
              </Field>
              <Field label="Estado">
                <select className={SELECT} value={s.estado} disabled={busy !== ""} aria-label="Estado"
                  onChange={(e) => commit(`Estado: ${e.target.value}`, { estado: e.target.value as Ser["estado"] })}>
                  <option value="activo">Activo</option>
                  <option value="durmiendo">Durmiendo</option>
                  <option value="suspendido">Suspendido</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Cuerpo — OLA 2: procedural (del ADN), en línea o subido.
              `SelectorCuerpoSer` trae su propia tarjeta pero no un título
              como el resto de la ficha, así que aquí se le antepone uno,
              sin envolverlo en una segunda tarjeta (evita el doble borde). */}
          <div>
            <SectionTitle
              icon={CircleUserRound}
              title="Cuerpo"
              tone="text-cyan-300"
              hint="De dónde sale su forma: procedural (derivada del ADN), encontrada en línea o subida a mano."
            />
            <div className="mt-2">
              <SelectorCuerpoSer key={s.id} ser={s} avatarFuente={s.avatarFuente} onElegir={commitAvatar} guardando={busy !== ""} />
            </div>
          </div>

          {/* Personalidades y cerebros — catálogo real del backend 1.58 */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className={cn(CARD, "p-3")}>
              <SectionTitle icon={Sparkles} title={`Personalidades (${s.personalidades.length})`} tone="text-fuchsia-300" hint="Del catálogo real de Astraura 1.58 — no se inventan aquí." />
              <div className="mt-2">
                <CatalogoChips
                  items={(manifest.data?.personalities ?? []).map((p) => ({ id: p.id, nombre: p.name, color: p.color ?? null }))}
                  seleccionIds={s.personalidades.map((p) => p.id)}
                  disabled={busy !== ""}
                  onToggle={(p, activo) => {
                    const siguiente = activo ? [...s.personalidades, { id: p.id, nombre: p.nombre, color: p.color }] : s.personalidades.filter((x) => x.id !== p.id);
                    commit(`Personalidades: ${p.nombre} ${activo ? "añadida" : "quitada"}`, { personalidades: siguiente });
                  }}
                />
              </div>
            </div>
            <div className={cn(CARD, "p-3")}>
              <SectionTitle icon={CpuIcon} title={`Cerebros (${s.cerebros.length})`} tone="text-violet-300" hint="Cerebros con los que este ser piensa (pestaña Cerebros del panel 1.58)." />
              <div className="mt-2">
                <CatalogoChips
                  items={(manifest.data?.brains ?? []).map((b) => ({ id: b.id, nombre: b.name, color: b.color ?? null }))}
                  seleccionIds={s.cerebros.map((c) => c.id)}
                  disabled={busy !== ""}
                  onToggle={(b, activo) => {
                    const siguiente = activo ? [...s.cerebros, { id: b.id, nombre: b.nombre, color: b.color }] : s.cerebros.filter((x) => x.id !== b.id);
                    commit(`Cerebros: ${b.nombre} ${activo ? "añadido" : "quitado"}`, { cerebros: siguiente });
                  }}
                />
              </div>
            </div>
          </div>

          {/* Habilidades, herramientas y reglas — texto libre, en el idioma del ser */}
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={ShieldCheck} title="Habilidades, herramientas y reglas" hint="Una por línea, cada una en su propio recuadro." />
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Field label={`Habilidades (${s.habilidades.length})`}>
                <textarea className={cn(TEXTAREA, "min-h-[70px]")} defaultValue={joinLineList(s.habilidades)} disabled={busy !== ""} aria-label="Habilidades"
                  onBlur={(e) => { const v = parseLineList(e.target.value); if (JSON.stringify(v) !== JSON.stringify(s.habilidades)) commit("Habilidades actualizadas", { habilidades: v }); }} />
              </Field>
              <Field label={`Herramientas (${s.herramientas.length})`}>
                <textarea className={cn(TEXTAREA, "min-h-[70px]")} defaultValue={joinLineList(s.herramientas)} disabled={busy !== ""} aria-label="Herramientas"
                  onBlur={(e) => { const v = parseLineList(e.target.value); if (JSON.stringify(v) !== JSON.stringify(s.herramientas)) commit("Herramientas actualizadas", { herramientas: v }); }} />
              </Field>
              <Field label={`Reglas (${s.reglas.length})`} hint="En el idioma del propio ser.">
                <textarea className={cn(TEXTAREA, "min-h-[70px]")} defaultValue={joinLineList(s.reglas)} disabled={busy !== ""} aria-label="Reglas"
                  onBlur={(e) => { const v = parseLineList(e.target.value); if (JSON.stringify(v) !== JSON.stringify(s.reglas)) commit("Reglas actualizadas", { reglas: v }); }} />
              </Field>
            </div>
          </div>

          {/* Acceso a internet y cerebros propios — OLA 2: capacidades reales
              y concedidas a conciencia, distintas del campo de texto libre
              "Herramientas" de arriba (ese es del contrato original; estas
              son estructuradas y con endpoint propio). Mismo idioma de
              agrupar-en-grid que "Personalidades y cerebros" / "Imaginación
              y recursos" arriba, para no sumar dos tarjetas sueltas más. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className={cn(CARD, "p-3")}>
              <SectionTitle
                icon={Globe}
                title="Acceso a internet"
                tone="text-cyan-300"
                hint='Alex: "una opción de acceso a internet que use todas las herramientas de la librería en línea del os y la biblioteca del usuario y las carpetas y archivos de dispositivo".'
              />
              <div className="mt-2">
                <InternetPanel key={s.id} value={s.internet} disabled={busy !== ""} onCommit={commitInternet} />
              </div>
            </div>
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
          </div>

          {/* Catálogo real de herramientas del sistema — global (no por ser),
              trae su propia tarjeta y su propio título: se monta tal cual,
              sin envolverlo en otra (mismo criterio que `propuestas-bandeja.tsx`
              en `genesis-section.tsx`). Útil aquí, junto al interruptor de
              arriba, para saber qué habilita de verdad conceder acceso. */}
          <HerramientasLista lista={herramientas.data} loading={herramientas.loading} error={herramientas.error} />

          {/* Soberanía — explicada, no solo editable */}
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={ShieldCheck} title="Soberanía" tone="text-emerald-300" hint='Alex: "libertad total en carpetas, medios y cerebros asignados y libertad de explorar total con sugerencias en ramas de variantes de versiones".' />
            <div className="mt-2">
              <SoberaniaPanel key={s.id} value={s.soberania} disabled={busy !== ""} onCommit={(patch) => commit(soberaniaLabel(patch), { soberania: patch })} />
            </div>
          </div>

          {/* Enrutado de modelos — la verdad delante */}
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={CpuIcon} title="Enrutado de modelos" tone="text-cyan-300" hint="Del más barato al más capaz — con la verdad de si pensó de verdad o salió una plantilla." />
            <div className="mt-2">
              <EnrutadoPanel
                key={s.id}
                target={target}
                value={s.enrutado}
                catalogo={modelos.data ?? []}
                catalogoLoading={modelos.loading}
                catalogoError={modelos.error}
                disabled={busy !== ""}
                onCommit={(patch) => commit(enrutadoLabel(patch), { enrutado: patch })}
              />
            </div>
          </div>

          {/* Imaginación y recursos */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className={cn(CARD, "p-3")}>
              <SectionTitle icon={Sparkles} title="Imaginación de fondo" tone="text-fuchsia-300" hint="Si este ser piensa por su cuenta cuando nadie le habla, y cada cuánto." />
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-[11px] text-white/80">
                  <Switch checked={s.imaginacion.activa} disabled={busy !== ""} aria-label="Imaginación activa"
                    onCheckedChange={(v) => commit(`Imaginación ${v ? "activada" : "desactivada"}`, { imaginacion: { ...s.imaginacion, activa: v } })} />
                  activa
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Frecuencia">
                    <select className={SELECT} value={s.imaginacion.frecuencia} disabled={busy !== ""} aria-label="Frecuencia de imaginación"
                      onChange={(e) => commit(`Frecuencia: ${e.target.value.replace(/_/g, " ")}`, { imaginacion: { ...s.imaginacion, frecuencia: e.target.value } })}>
                      {IMAG_FREQ.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
                      {!IMAG_FREQ.includes(s.imaginacion.frecuencia as (typeof IMAG_FREQ)[number]) && <option value={s.imaginacion.frecuencia}>{s.imaginacion.frecuencia}</option>}
                    </select>
                  </Field>
                  <Field label="Nivel de permiso">
                    <select
                      className={SELECT}
                      value={PERMISSION_LEVEL_IDS.includes(s.imaginacion.nivelPermiso as (typeof PERMISSION_LEVEL_IDS)[number]) ? s.imaginacion.nivelPermiso : "always_ask"}
                      disabled={busy !== ""}
                      aria-label="Nivel de permiso de imaginación"
                      onChange={(e) => commit(`Permiso: ${PERMISSION_LABEL[e.target.value] ?? e.target.value}`, { imaginacion: { ...s.imaginacion, nivelPermiso: e.target.value } })}
                    >
                      {PERMISSION_LEVEL_IDS.map((id) => <option key={id} value={id}>{PERMISSION_LABEL[id] ?? id}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            </div>
            <div className={cn(CARD, "p-3")}>
              <SectionTitle icon={Gauge} title="Recursos" tone="text-amber-300" hint="Cuotas reales de máquina para este ser." />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Field label="Concurrencia">
                  <input type="number" min={1} max={32} defaultValue={s.recursos.concurrencia} disabled={busy !== ""} aria-label="Concurrencia"
                    onBlur={(e) => { const v = clampInt(e.target.value, 1, 32, s.recursos.concurrencia); if (v !== s.recursos.concurrencia) commit(`Concurrencia: ${v}`, { recursos: { ...s.recursos, concurrencia: v } }); }} className={INPUT} />
                </Field>
                <Field label="CPU %">
                  <input type="number" min={1} max={100} defaultValue={s.recursos.cpuPorcentaje} disabled={busy !== ""} aria-label="Porcentaje de CPU"
                    onBlur={(e) => { const v = clampInt(e.target.value, 1, 100, s.recursos.cpuPorcentaje); if (v !== s.recursos.cpuPorcentaje) commit(`CPU: ${v}%`, { recursos: { ...s.recursos, cpuPorcentaje: v } }); }} className={INPUT} />
                </Field>
                <Field label="RAM (MB)">
                  <input type="number" min={64} max={65_536} defaultValue={s.recursos.ramMb} disabled={busy !== ""} aria-label="RAM en megabytes"
                    onBlur={(e) => { const v = clampInt(e.target.value, 64, 65_536, s.recursos.ramMb); if (v !== s.recursos.ramMb) commit(`RAM: ${v} MB`, { recursos: { ...s.recursos, ramMb: v } }); }} className={INPUT} />
                </Field>
              </div>
            </div>
          </div>

          {/* Comunidades y espacio hogar */}
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Users} title="Comunidades y espacio hogar" tone="text-violet-300" hint="A qué comunidades pertenece y en qué espacio 3D vive por defecto." />
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <div>
                <p className={LABEL}>Comunidades ({s.comunidades.length})</p>
                <div className="mt-1">
                  {comunidades.data && comunidades.data.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {comunidades.data.map((c) => {
                        const activo = s.comunidades.includes(c.id);
                        return (
                          <button key={c.id} type="button" disabled={busy !== ""} aria-pressed={activo} className={cn(PILL, activo ? PILL_ON : PILL_OFF)}
                            onClick={() => { const siguiente = activo ? s.comunidades.filter((id) => id !== c.id) : [...s.comunidades, c.id]; commit(`Comunidad: ${c.nombre} ${activo ? "abandonada" : "unida"}`, { comunidades: siguiente }); }}>
                            {c.nombre}
                          </button>
                        );
                      })}
                    </div>
                  ) : <Empty loading={comunidades.loading} error={comunidades.error} text="Todavía no hay comunidades — crea una abajo." />}
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-1.5">
                  <input className={cn(INPUT, "min-w-[110px] flex-1")} placeholder="Nombre" value={nuevaComunidad.nombre} disabled={busy !== ""} aria-label="Nombre de la nueva comunidad"
                    onChange={(e) => setNuevaComunidad((v) => ({ ...v, nombre: e.target.value }))} />
                  <input className={cn(INPUT, "min-w-[130px] flex-1")} placeholder="Propósito" value={nuevaComunidad.proposito} disabled={busy !== ""} aria-label="Propósito de la nueva comunidad"
                    onChange={(e) => setNuevaComunidad((v) => ({ ...v, proposito: e.target.value }))} />
                  <button type="button" className={BTN} disabled={busy !== "" || !nuevaComunidad.nombre.trim() || !nuevaComunidad.proposito.trim()} aria-label="Crear una comunidad y unir a este ser" onClick={crearYUnirComunidad}>
                    <BusyIcon busy={busy === "crear-comunidad"} icon={Plus} /> Crear y unirse
                  </button>
                </div>
              </div>
              <div>
                <p className={LABEL}>Espacio hogar</p>
                <div className="mt-1">
                  {espacios.data && espacios.data.length > 0 ? (
                    <select className={cn(SELECT, "w-full")} value={s.espacioHogarId ?? ""} disabled={busy !== ""} aria-label="Espacio hogar"
                      onChange={(e) => commit("Espacio hogar actualizado", { espacioHogarId: e.target.value || null })}>
                      <option value="">sin espacio asignado</option>
                      {espacios.data.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.arquetipo})</option>)}
                    </select>
                  ) : <Empty loading={espacios.loading} error={espacios.error} text="Todavía no hay espacios — crea uno abajo." />}
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-1.5">
                  <input className={cn(INPUT, "min-w-[110px] flex-1")} placeholder="Nombre" value={nuevoEspacio.nombre} disabled={busy !== ""} aria-label="Nombre del nuevo espacio"
                    onChange={(e) => setNuevoEspacio((v) => ({ ...v, nombre: e.target.value }))} />
                  <input className={cn(INPUT, "min-w-[120px]")} placeholder="taller / ágora / jardín…" list="genesis-arquetipos" value={nuevoEspacio.arquetipo} disabled={busy !== ""} aria-label="Arquetipo del nuevo espacio"
                    onChange={(e) => setNuevoEspacio((v) => ({ ...v, arquetipo: e.target.value }))} />
                  <button type="button" className={BTN} disabled={busy !== "" || !nuevoEspacio.nombre.trim() || !nuevoEspacio.arquetipo.trim()} aria-label="Crear un espacio y asignarlo como hogar" onClick={crearYAsignarEspacio}>
                    <BusyIcon busy={busy === "crear-espacio"} icon={Plus} /> Crear y asignar
                  </button>
                  <datalist id="genesis-arquetipos">
                    <option value="taller" /><option value="agora" /><option value="biblioteca" /><option value="jardin" /><option value="laboratorio" />
                  </datalist>
                </div>
              </div>
            </div>
          </div>

          {/* Linaje — lectura */}
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Network} title="Linaje" tone="text-white/70" hint="De dónde viene y a quién ha engendrado." />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Stat label="Progenitor" value={nombreEnLinaje(s.linaje.progenitorId, linaje.data ?? []) ?? "creado por ti"} />
              <Stat label="Generación" value={s.linaje.generacion} hint={s.linaje.origen === "usuario" ? "creado por ti directamente" : "engendrado por otro ser"} />
              <Stat
                label={`Descendientes (${s.linaje.descendientes.length})`}
                value={s.linaje.descendientes.length || "ninguno todavía"}
                hint={s.linaje.descendientes.map((id) => nombreEnLinaje(id, linaje.data ?? [])).filter(Boolean).join(" · ") || undefined}
                className="sm:col-span-2"
              />
            </div>
          </div>

          {/* ADN — lectura, con recalcular */}
          <div className={cn(CARD, "p-3")}>
            <SectionTitle
              icon={Dna} title="ADN" tone="text-white/70" hint="Se deriva de quién es este ser; no se edita a mano aquí."
              right={<button type="button" className={BTN} disabled={busy !== ""} onClick={handleRecalcular} aria-label="Recalcular el ADN"><BusyIcon busy={busy === "recalcular"} icon={RefreshCw} /> Recalcular</button>}
            />
            {(() => {
              const adn = adnDeSer(s);
              return (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Sólido" value={adn.solido} />
                    <Stat label="Frecuencia" value={`${adn.frecuencia} Hz`} />
                    <Stat label="Evolución" value={nivelEvolutivoLabel(adn.evolucion)} hint={`${Math.round(adn.evolucion * 100)}%`} />
                    <Stat label="Órbitas" value={adn.orbitas} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    {[adn.paleta.primario, adn.paleta.secundario, adn.paleta.acento].map((c, i) => (
                      <span key={i} className="h-4 w-4 rounded-full border border-white/20" style={{ background: c }} aria-hidden="true" />
                    ))}
                    <span className="text-[10px] text-white/40">paleta{s.adn ? "" : " (derivada — el backend todavía no guardó una propia)"}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

export default SerFicha;
