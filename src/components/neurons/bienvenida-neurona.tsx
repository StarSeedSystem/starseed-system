"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * BienvenidaNeurona — «Esta neurona» tras iniciar sesión (NEU1107B · 2026-11-07).
 * Contrato: architecture/neurona-bienvenida.md.
 *
 * Alex: «en las versiones instaladas, después de iniciar sesión falta una ventana: que detecte si el
 * aparato ya tiene un registro de neurona de otro medio donde inició sesión y sugiera fusionarlas, y
 * que ofrezca editar los ajustes básicos de la neurona».
 *
 *   1 · «Este aparato ya tenía neurona(s)»: las candidatas ordenadas por confianza, con su razón; la
 *       fusión sugerida viene PRESELECCIONADA (un toque en «Fusionar» la aplica) y se elige qué id y qué
 *       nombre se quedan. Nunca se fusiona sin ese toque. Nada se borra (filas con marca y alias).
 *   2 · Ajustes básicos: nombre, función principal, capas de conciencia, medios de transmisión
 *       preferidos (en orden) y «más» (escucha de fondo, compartir recursos, NAS, actualizaciones, icono).
 *   3 · Resumen de lo que se hizo y de lo que cambia; «Aplicar y terminar». Deshacer la fusión, aquí.
 *
 * La abre sola el orquestador del primer arranque (una vez por cuenta × aparato, solo en las apps
 * instaladas) y a mano Ajustes › Neuronas › Esta neurona. Estilo Trinity Liquid Crystal: Horizon
 * (verde) para la fusión, Logic (ámbar) para los ajustes, Zenith (azur) para las capas.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Brain, Check, ChevronDown, ChevronLeft, ChevronRight, Cloud, Cpu, GitMerge, Layers, Loader2, RadioTower, Route, Settings2, Undo2, Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PasoAnimado, useDireccionPaso } from "@/components/movimiento/paso-animado";
import { IconoStarSeed } from "@/components/onboarding/icono-starseed";
import { PreferenciasMedioForm } from "@/components/messages/medios/bloque-medio";
import { INFO_MEDIOS, MEDIOS_TRANSMISION, type MedioTransmision } from "@/lib/mensajeria/medios/tipos";
import { CAPAS, ETIQUETA_CAPA, type CapaConciencia } from "@/lib/astraura/capas-conciencia";
import type { CandidataDuplicada, Confianza } from "@/lib/neurons/duplicadas-aparato";
import {
  FUNCIONES,
  ICONOS,
  NOMBRE_MAX,
  idCorto,
  planFusionBienvenida,
  resumenCambios,
  type BorradorAjustes,
  type PasoBienvenida,
  type PlanFusionBienvenida,
} from "@/lib/neurons/neurona-bienvenida";
import {
  aplicarAjustesBienvenida,
  aplicarFusionBienvenida,
  borradorInicial,
  leerNasNativo,
  marcarBienvenidaVista,
  reunirDatosBienvenida,
  type DatosBienvenida,
} from "@/lib/neurons/neurona-bienvenida-acciones";
import { posponerNeuronaEnCuenta } from "@/lib/onboarding/primer-arranque";

/** Pantalla completa en el móvil; centrada en tableta y ordenador (la misma forma que las demás ventanas de arranque). */
const CLASES_VENTANA =
  "max-w-xl md:max-w-2xl sm:max-h-[92dvh] max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:pt-[max(1.5rem,env(safe-area-inset-top))] max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]";

/** Trinity: Horizon (creación, fusión), Logic (ajustes), Zenith (IA). */
const HORIZON = "#39FF14";
const LOGIC = "#FFBF00";
const ZENITH = "#007FFF";

const ETIQUETA_PASO: Record<PasoBienvenida, string> = { fusion: "Fusión", ajustes: "Ajustes", resumen: "Resumen" };

const CONFIANZA: Record<Confianza, { texto: string; clase: string }> = {
  alta: { texto: "Muy probable", clase: "border-[#39FF14]/40 bg-[#39FF14]/10 text-[#b9ffa8]" },
  media: { texto: "Probable", clase: "border-[#FFBF00]/40 bg-[#FFBF00]/10 text-[#ffe08a]" },
  baja: { texto: "Poco probable", clase: "border-white/20 bg-white/[0.04] text-white/60" },
};

const ICONO_CAPA: Record<CapaConciencia, LucideIcon> = { local: Cpu, mesh: RadioTower, nube: Cloud, colectiva: Users };

const NOMBRES_MEDIO = Object.fromEntries(MEDIOS_TRANSMISION.map((m) => [m, INFO_MEDIOS[m].corto])) as Record<MedioTransmision, string>;

/** «hace 3 días», «hace 2 h», «ahora». Pura. */
export function haceCuanto(iso: string | null | undefined, ahora: number = Date.now()): string {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "sin fecha";
  const min = Math.max(0, Math.round((ahora - t) / 60_000));
  if (min < 2) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 60) return `hace ${d} días`;
  return `hace ${Math.round(d / 30)} meses`;
}

export interface BienvenidaNeuronaProps {
  /** Se cierra por cualquier vía (lo aplicado ya está guardado). */
  onClose: () => void;
  /** La abrió la persona desde un botón. */
  manual?: boolean;
  /** Datos ya reunidos por el orquestador; si faltan, se leen al abrir. */
  datos?: DatosBienvenida | null;
  /** Recarga la página cuando este medio cambió de id (solo las pruebas la sustituyen). */
  recargar?: () => void;
}

interface EstadoFusion {
  estado: "pendiente" | "aplicando" | "hecha" | "omitida";
  plan?: PlanFusionBienvenida;
  respaldo?: number;
  cambioDeId?: boolean;
}

/* ───────────────────────────── Piezas ───────────────────────────── */

function Seccion({ titulo, icono: Icono, color, children, nota }: { titulo: string; icono: LucideIcon; color: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:p-4"
      aria-label={titulo}
    >
      <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-white/90">
        <Icono className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
        {titulo}
      </h3>
      {children}
      {nota && <p className="mt-2 text-[11.5px] leading-relaxed text-white/50">{nota}</p>}
    </section>
  );
}

function FilaInterruptor({ id, titulo, texto, valor, onCambiar, disabled }: { id: string; titulo: string; texto?: string; valor: boolean; onCambiar: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl px-1 py-1.5", disabled && "opacity-60")}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[13px] font-medium text-white/90">{titulo}</span>
        {texto && <span className="block text-[11.5px] leading-snug text-white/50">{texto}</span>}
      </label>
      <Switch id={id} checked={valor} onCheckedChange={onCambiar} disabled={disabled} aria-label={titulo} />
    </div>
  );
}

function IndicadorPasos({ pasos, actual }: { pasos: readonly PasoBienvenida[]; actual: number }) {
  return (
    <ol className="mt-1 flex items-center justify-center gap-1.5" aria-label={`Paso ${actual + 1} de ${pasos.length}: ${ETIQUETA_PASO[pasos[actual]]}`}>
      {pasos.map((p, i) => (
        <li
          key={p}
          aria-current={i === actual ? "step" : undefined}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium tracking-wide transition-colors motion-reduce:transition-none",
            i === actual ? "border-[#FFBF00]/50 bg-[#FFBF00]/15 text-[#ffe08a]" : i < actual ? "border-[#39FF14]/30 text-[#b9ffa8]/80" : "border-white/10 text-white/40",
          )}
        >
          {i < actual ? <Check className="mr-1 inline h-3 w-3" aria-hidden /> : null}
          {ETIQUETA_PASO[p]}
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────────── Ventana ───────────────────────────── */

export function BienvenidaNeurona({ onClose, manual = false, datos: datosIniciales = null, recargar }: BienvenidaNeuronaProps) {
  const sufijo = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [datos, setDatos] = useState<DatosBienvenida | null>(datosIniciales);
  const [errorCarga, setErrorCarga] = useState(false);
  const [indice, setIndice] = useState(0);
  const direccion = useDireccionPaso(indice);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(datosIniciales?.sugerencia.seleccionadas ?? []));
  const [principal, setPrincipal] = useState<string>(datosIniciales?.sugerencia.principal ?? "");
  const [nombreFusion, setNombreFusion] = useState<string>(datosIniciales?.sugerencia.nombre ?? "");
  const [fusion, setFusion] = useState<EstadoFusion>({ estado: "pendiente" });
  const [base, setBase] = useState<BorradorAjustes | null>(null);
  const [borrador, setBorrador] = useState<BorradorAjustes | null>(null);
  const [nas, setNas] = useState<boolean | null>(null);
  const [verMas, setVerMas] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Datos: los del orquestador o, a mano, se leen ahora.
  useEffect(() => {
    if (datos) return;
    let vivo = true;
    reunirDatosBienvenida()
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setSeleccion(new Set(d.sugerencia.seleccionadas));
        setPrincipal(d.sugerencia.principal);
        setNombreFusion(d.sugerencia.nombre);
      })
      .catch(() => vivo && setErrorCarga(true));
    return () => {
      vivo = false;
    };
  }, [datos]);

  useEffect(() => {
    let vivo = true;
    void leerNasNativo().then((v) => vivo && setNas(v));
    return () => {
      vivo = false;
    };
  }, []);

  const candidatas: CandidataDuplicada[] = datos?.resultado.candidatas ?? [];
  const pasos: PasoBienvenida[] = useMemo(() => (candidatas.length ? ["fusion", "ajustes", "resumen"] : ["ajustes", "resumen"]), [candidatas.length]);
  const paso = pasos[Math.min(indice, pasos.length - 1)];
  const yoId = datos?.yo.id ?? "";
  /** La neurona cuyos ajustes se editan: la que se quedó tras fusionar, o esta. */
  const idAjustes = fusion.estado === "hecha" && fusion.plan ? fusion.plan.principal : yoId;

  // Borrador de ajustes: se (re)lee al llegar los datos y cuando cambia la neurona que se edita (tras
  // fusionar o deshacer cambian el id y el nombre). El NAS llega aparte y solo toca su campo.
  const nombreFusionado = fusion.estado === "hecha" && fusion.plan ? fusion.plan.nombre : null;
  useEffect(() => {
    if (!datos || !idAjustes) return;
    const fila = idAjustes === yoId ? datos.yo : datos.todas.find((f) => f.id === idAjustes);
    const nombre = nombreFusionado ?? String(fila?.name ?? datos.yo.name ?? "");
    const b = borradorInicial(idAjustes, nombre, fila?.kind ?? datos.yo.kind, null);
    setBase(b);
    setBorrador(b);
  }, [datos, idAjustes, yoId, nombreFusionado]);
  useEffect(() => {
    if (nas === null) return;
    setBase((b) => (b && b.nas === null ? { ...b, nas } : b));
    setBorrador((b) => (b && b.nas === null ? { ...b, nas } : b));
  }, [nas, base]);

  const cambiar = useCallback((parcial: Partial<BorradorAjustes>) => setBorrador((b) => (b ? { ...b, ...parcial } : b)), []);

  const cerrar = useCallback(
    (cambioDeId: boolean) => {
      if (cambioDeId) (recargar ?? (() => window.location.reload()))();
      else onClose();
    },
    [onClose, recargar],
  );

  const ahoraNo = useCallback(() => {
    if (datos) {
      marcarBienvenidaVista(datos.uid, idAjustes || yoId, "omitida");
      if (!manual && yoId) posponerNeuronaEnCuenta(yoId);
    }
    cerrar(!!fusion.cambioDeId);
  }, [datos, idAjustes, yoId, manual, cerrar, fusion.cambioDeId]);

  const siguiente = useCallback(() => setIndice((i) => Math.min(i + 1, pasos.length - 1)), [pasos.length]);
  const atras = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);

  /* ── Paso 1: fusión ── */
  const grupo = useMemo(() => {
    if (!datos) return [];
    const elegidas = candidatas.filter((c) => seleccion.has(c.id));
    return [{ id: yoId, nombre: String(datos.yo.name || "Esta neurona"), esta: true }, ...elegidas.map((c) => ({ id: c.id, nombre: c.nombre, esta: false }))];
  }, [datos, candidatas, seleccion, yoId]);
  const nombresPosibles = useMemo(() => Array.from(new Set(grupo.map((g) => g.nombre.trim()).filter(Boolean))), [grupo]);

  // Si se desmarca la que iba a quedarse, se queda esta.
  useEffect(() => {
    if (principal && !grupo.some((g) => g.id === principal)) setPrincipal(yoId);
  }, [grupo, principal, yoId]);

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const fusionar = useCallback(async () => {
    if (!datos) return;
    const r = planFusionBienvenida({
      yo: yoId,
      seleccionadas: [...seleccion],
      principal: principal || yoId,
      nombre: nombreFusion,
      ofrecidas: candidatas.map((c) => c.id),
    });
    if (!r.ok) {
      setMensaje({ tono: "error", texto: r.motivo });
      return;
    }
    setMensaje(null);
    setFusion({ estado: "aplicando", plan: r.plan });
    const hecho = await aplicarFusionBienvenida(r.plan);
    if (!hecho.ok) {
      setFusion({ estado: "pendiente" });
      setMensaje({ tono: "error", texto: hecho.motivo ?? "No se pudo fusionar. No se cambió nada." });
      return;
    }
    setFusion({ estado: "hecha", plan: r.plan, respaldo: hecho.respaldo, cambioDeId: hecho.cambioDeId });
    setMensaje({ tono: "ok", texto: `Fusionadas: «${r.plan.nombre}» es ahora una sola neurona.` });
    siguiente();
  }, [datos, yoId, seleccion, principal, nombreFusion, candidatas, siguiente]);

  const noFusionar = useCallback(() => {
    setFusion({ estado: "omitida" });
    setMensaje(null);
    siguiente();
  }, [siguiente]);

  const deshacer = useCallback(async () => {
    if (fusion.estado !== "hecha" || !fusion.respaldo) return;
    setOcupado(true);
    try {
      const { deshacerFusion } = await import("@/lib/neurons/fusion");
      const r = await deshacerFusion(fusion.respaldo);
      if (!r.ok) {
        setMensaje({ tono: "error", texto: r.motivo ?? "No se pudo deshacer." });
        return;
      }
      // Este medio vuelve a su propia neurona si la había dejado por la que se quedó.
      if (fusion.cambioDeId && yoId) {
        const { adoptarNeurona } = await import("@/lib/network/identidad-dispositivo");
        adoptarNeurona(yoId);
      }
      setMensaje({ tono: "ok", texto: "Fusión deshecha: cada neurona vuelve a ser la de antes." });
      setFusion({ estado: "omitida", cambioDeId: fusion.cambioDeId });
    } finally {
      setOcupado(false);
    }
  }, [fusion, yoId]);

  /* ── Paso 3: aplicar ── */
  const terminar = useCallback(async () => {
    if (!datos || !base || !borrador) return;
    setOcupado(true);
    const r = await aplicarAjustesBienvenida(idAjustes, base, borrador);
    marcarBienvenidaVista(datos.uid, idAjustes, "completada");
    setOcupado(false);
    if (!r.ok) {
      setMensaje({ tono: "error", texto: `Se guardó todo menos: ${r.avisos.join(", ")}. Puedes cambiarlo en Ajustes › Neuronas.` });
      setBase(borrador);
      return;
    }
    cerrar(!!fusion.cambioDeId);
  }, [datos, base, borrador, idAjustes, cerrar, fusion.cambioDeId]);

  const cambios = base && borrador ? resumenCambios(base, borrador, NOMBRES_MEDIO) : [];
  const idDesc = `bienvenida-neurona-desc-${sufijo}`;

  const titulo =
    paso === "fusion" ? (candidatas.length === 1 ? "Este aparato ya tenía una neurona" : "Este aparato ya tenía neuronas") : paso === "ajustes" ? "Ajustes básicos de esta neurona" : "Resumen";
  const texto =
    paso === "fusion"
      ? "Encontré en tu cuenta neuronas que parecen este mismo aparato abierto desde otro medio (otra app, otro navegador o una instalación anterior). Fusionarlas deja UNA sola neurona con todos sus ajustes, medios e historial."
      : paso === "ajustes"
        ? "Cómo se llama, para qué sirve y por dónde se comunica. Todo se puede cambiar después en Ajustes › Neuronas."
        : "Esto es lo que queda hecho al terminar.";

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && fusion.estado !== "aplicando" && ahoraNo()}>
      <DialogContent className={CLASES_VENTANA} aria-describedby={idDesc} data-testid="bienvenida-neurona">
        <DialogHeader className="items-center text-center">
          <IconoStarSeed className="mx-auto" size={40} />
          <DialogTitle className="text-xl font-light tracking-wide">{datos ? titulo : "Esta neurona"}</DialogTitle>
          <DialogDescription id={idDesc} className="max-w-prose text-[13px] leading-relaxed">
            {datos ? texto : errorCarga ? "No se pudieron leer las neuronas de tu cuenta ahora." : "Buscando las neuronas de tu cuenta…"}
          </DialogDescription>
          {datos && <IndicadorPasos pasos={pasos} actual={Math.min(indice, pasos.length - 1)} />}
        </DialogHeader>

        {!datos ? (
          <div className="flex flex-col items-center gap-3 py-8" role="status">
            {errorCarga ? (
              <Button variant="outline" className="cursor-pointer rounded-full" onClick={onClose}>
                Cerrar
              </Button>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-white/50 motion-reduce:animate-none" aria-hidden />
            )}
          </div>
        ) : (
          <PasoAnimado clave={paso} direccion={direccion} className="mt-3 space-y-3">
            {paso === "fusion" && (
              <PasoFusion
                sufijo={sufijo}
                datos={datos}
                candidatas={candidatas}
                seleccion={seleccion}
                alternar={alternar}
                grupo={grupo}
                principal={principal || yoId}
                setPrincipal={setPrincipal}
                nombre={nombreFusion}
                setNombre={setNombreFusion}
                nombresPosibles={nombresPosibles}
              />
            )}
            {paso === "ajustes" && borrador && (
              <PasoAjustes sufijo={sufijo} borrador={borrador} cambiar={cambiar} verMas={verMas} setVerMas={setVerMas} fusion={fusion} />
            )}
            {paso === "resumen" && (
              <section className="space-y-3" aria-label="Resumen">
                {fusion.estado === "hecha" && fusion.plan && (
                  <div className="rounded-2xl border border-[#39FF14]/30 bg-[#39FF14]/[0.06] p-3.5 text-[13px] text-white/90" data-testid="resumen-fusion">
                    <p className="flex items-center gap-2 font-semibold">
                      <GitMerge className="h-4 w-4" style={{ color: HORIZON }} aria-hidden /> Fusión hecha
                    </p>
                    <p className="mt-1 text-white/70">
                      «{fusion.plan.nombre}» (id {idCorto(fusion.plan.principal)}) reúne {fusion.plan.absorbidas.length + 1} registros de este aparato. Los demás quedan
                      como historial con su alias: nada se borró.
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2 cursor-pointer gap-1.5 rounded-full" disabled={ocupado} onClick={() => void deshacer()}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden /> Deshacer la fusión
                    </Button>
                  </div>
                )}
                {fusion.estado === "omitida" && candidatas.length > 0 && (
                  <p className="text-[12.5px] text-white/60">Sin fusionar: cada neurona sigue por su lado. Puedes fusionarlas cuando quieras en Ajustes › Neuronas.</p>
                )}
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5" data-testid="resumen-ajustes">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
                    <Settings2 className="h-4 w-4" style={{ color: LOGIC }} aria-hidden /> Ajustes
                  </p>
                  {cambios.length ? (
                    <ul className="mt-1.5 space-y-1 text-[12.5px] text-white/75">
                      {cambios.map((c) => (
                        <li key={c} className="flex gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: HORIZON }} aria-hidden />
                          {c}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-white/60">Sin cambios: esta neurona se queda como estaba.</p>
                  )}
                </div>
                {fusion.cambioDeId && (
                  <p className="text-[12px] text-[#ffe08a]/90">Este aparato pasa a usar la neurona que se queda: al terminar, la app se recarga.</p>
                )}
              </section>
            )}
          </PasoAnimado>
        )}

        {mensaje && (
          <p
            role={mensaje.tono === "error" ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "mt-3 rounded-xl border px-3 py-2 text-[12.5px]",
              mensaje.tono === "error" ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-[#39FF14]/30 bg-[#39FF14]/[0.07] text-[#d8ffcf]",
            )}
          >
            {mensaje.texto}
          </p>
        )}

        {datos && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <Button variant="ghost" size="sm" className="cursor-pointer rounded-full" onClick={ahoraNo} disabled={ocupado || fusion.estado === "aplicando"}>
              Ahora no
            </Button>
            <div className="flex flex-wrap justify-end gap-2">
              {indice > 0 && (
                <Button variant="outline" size="sm" className="cursor-pointer gap-1 rounded-full border-white/15" onClick={atras} disabled={ocupado}>
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
                </Button>
              )}
              {paso === "fusion" && fusion.estado !== "hecha" && (
                <>
                  <Button variant="outline" size="sm" className="cursor-pointer rounded-full border-white/15" onClick={noFusionar} disabled={fusion.estado === "aplicando"}>
                    No fusionar
                  </Button>
                  <Button
                    size="sm"
                    className="cursor-pointer gap-1.5 rounded-full"
                    onClick={() => void fusionar()}
                    disabled={seleccion.size === 0 || fusion.estado === "aplicando"}
                    data-testid="boton-fusionar"
                  >
                    {fusion.estado === "aplicando" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <GitMerge className="h-3.5 w-3.5" aria-hidden />}
                    {seleccion.size > 0 ? `Fusionar (${seleccion.size + 1})` : "Fusionar"}
                  </Button>
                </>
              )}
              {paso === "fusion" && fusion.estado === "hecha" && (
                <Button size="sm" className="cursor-pointer gap-1 rounded-full" onClick={siguiente}>
                  Siguiente <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
              {paso === "ajustes" && (
                <Button size="sm" className="cursor-pointer gap-1 rounded-full" onClick={siguiente} disabled={!borrador}>
                  Siguiente <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
              {paso === "resumen" && (
                <Button size="sm" className="cursor-pointer gap-1.5 rounded-full" onClick={() => void terminar()} disabled={ocupado || !borrador} data-testid="boton-terminar">
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                  Aplicar y terminar
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Paso 1 ───────────────────────────── */

function PasoFusion({
  sufijo,
  datos,
  candidatas,
  seleccion,
  alternar,
  grupo,
  principal,
  setPrincipal,
  nombre,
  setNombre,
  nombresPosibles,
}: {
  sufijo: string;
  datos: DatosBienvenida;
  candidatas: CandidataDuplicada[];
  seleccion: Set<string>;
  alternar: (id: string) => void;
  grupo: { id: string; nombre: string; esta: boolean }[];
  principal: string;
  setPrincipal: (id: string) => void;
  nombre: string;
  setNombre: (n: string) => void;
  nombresPosibles: string[];
}) {
  const idNombre = `bn-nombre-fusion-${sufijo}`;
  return (
    <>
      <fieldset className="space-y-2" data-testid="lista-candidatas">
        <legend className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">Parecen este aparato</legend>
        {candidatas.map((c) => {
          const marcada = seleccion.has(c.id);
          const conf = CONFIANZA[c.confianza];
          const idCheck = `bn-cand-${sufijo}-${c.id}`;
          return (
            <div
              key={c.id}
              data-testid={`candidata-${c.id}`}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3 transition-colors motion-reduce:transition-none",
                marcada ? "border-[#39FF14]/40 bg-[#39FF14]/[0.06]" : "border-white/10 bg-white/[0.03]",
              )}
            >
              <input
                id={idCheck}
                type="checkbox"
                checked={marcada}
                onChange={() => alternar(c.id)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#39FF14]"
              />
              <label htmlFor={idCheck} className="min-w-0 flex-1 cursor-pointer">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[14px] font-semibold text-white">{c.nombre}</span>
                  <span className={cn("rounded-full border px-2 py-px text-[10.5px] font-medium", conf.clase)}>{conf.texto}</span>
                  {c.enLineaAhora && <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-px text-[10.5px] text-sky-100">En línea ahora</span>}
                </span>
                {c.razon && <span className="mt-0.5 block text-[12px] leading-snug text-white/65">{c.razon}</span>}
                <span className="mt-0.5 block text-[11px] text-white/40">
                  Última vez {haceCuanto(c.ultimaVez, datos.ahora)} · id <span className="font-mono">{idCorto(c.id)}</span>
                </span>
              </label>
            </div>
          );
        })}
      </fieldset>

      {seleccion.size > 0 && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">Qué neurona se queda</legend>
            <div role="radiogroup" aria-label="Qué neurona se queda" className="grid gap-1.5 sm:grid-cols-2">
              {grupo.map((g) => {
                const idRadio = `bn-principal-${sufijo}-${g.id}`;
                const activa = principal === g.id;
                return (
                  <label
                    key={g.id}
                    htmlFor={idRadio}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[12.5px] transition-colors motion-reduce:transition-none",
                      activa ? "border-[#FFBF00]/50 bg-[#FFBF00]/10" : "border-white/10 bg-white/[0.03] hover:border-white/25",
                    )}
                  >
                    <input
                      id={idRadio}
                      type="radio"
                      name={`bn-principal-${sufijo}`}
                      checked={activa}
                      onChange={() => setPrincipal(g.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[#FFBF00]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-white/90">{g.esta ? `Esta · ${g.nombre}` : g.nombre}</span>
                      <span className="block font-mono text-[10.5px] text-white/40">{idCorto(g.id)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor={idNombre} className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
              Nombre que se queda
            </label>
            <input
              id={idNombre}
              value={nombre}
              maxLength={NOMBRE_MAX}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
              placeholder="Por ejemplo: MaggaBook"
            />
            {nombresPosibles.length > 1 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Nombres que ya tenía">
                {nombresPosibles.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={nombre.trim() === n}
                    onClick={() => setNombre(n)}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00] motion-reduce:transition-none",
                      nombre.trim() === n ? "border-[#FFBF00]/50 bg-[#FFBF00]/15 text-[#ffe08a]" : "border-white/15 text-white/70 hover:border-white/30",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
          {principal && principal !== datos.yo.id && (
            <p className="text-[12px] text-[#ffe08a]/90">Este aparato pasará a usar esa neurona: al terminar, la app se recarga.</p>
          )}
        </>
      )}
      <p className="text-[11.5px] leading-relaxed text-white/50">
        Nada se borra: las neuronas fusionadas quedan como historial con su alias, sus ajustes pasan a la que se queda y se puede deshacer.
        {datos.resultado.descartadas.length > 0 ? ` ${datos.resultado.descartadas.length} neurona(s) de tu cuenta son otros aparatos y no se tocan.` : ""}
      </p>
    </>
  );
}

/* ───────────────────────────── Paso 2 ───────────────────────────── */

function PasoAjustes({
  sufijo,
  borrador,
  cambiar,
  verMas,
  setVerMas,
  fusion,
}: {
  sufijo: string;
  borrador: BorradorAjustes;
  cambiar: (p: Partial<BorradorAjustes>) => void;
  verMas: boolean;
  setVerMas: (v: boolean) => void;
  fusion: EstadoFusion;
}) {
  const idNombre = `bn-nombre-${sufijo}`;
  const idMas = `bn-mas-${sufijo}`;
  return (
    <>
      {fusion.estado === "hecha" && fusion.plan && (
        <p className="rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/[0.06] px-3 py-2 text-[12.5px] text-[#d8ffcf]" role="status">
          <GitMerge className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          «{fusion.plan.nombre}» ya es una sola neurona. Ahora, sus ajustes.
        </p>
      )}
      <Seccion titulo="Nombre" icono={Settings2} color={LOGIC}>
        <label htmlFor={idNombre} className="sr-only">
          Nombre de esta neurona
        </label>
        <input
          id={idNombre}
          value={borrador.nombre}
          maxLength={NOMBRE_MAX}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
          placeholder="Por ejemplo: Portátil de casa"
        />
      </Seccion>

      <Seccion titulo="Función principal" icono={Brain} color={LOGIC}>
        <div role="radiogroup" aria-label="Función principal" className="grid gap-1.5 sm:grid-cols-3">
          {FUNCIONES.map((f) => {
            const idR = `bn-funcion-${sufijo}-${f.id}`;
            const activa = borrador.funcion === f.id;
            return (
              <label
                key={f.id}
                htmlFor={idR}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-xl border p-2.5 transition-colors motion-reduce:transition-none",
                  activa ? "border-[#FFBF00]/50 bg-[#FFBF00]/10" : "border-white/10 bg-white/[0.03] hover:border-white/25",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
                  <input
                    id={idR}
                    type="radio"
                    name={`bn-funcion-${sufijo}`}
                    checked={activa}
                    onChange={() => cambiar({ funcion: f.id })}
                    className="h-4 w-4 cursor-pointer accent-[#FFBF00]"
                  />
                  {f.titulo}
                </span>
                <span className="text-[11.5px] leading-snug text-white/55">{f.texto}</span>
              </label>
            );
          })}
        </div>
      </Seccion>

      <Seccion
        titulo="Capas de conciencia de Astraura"
        icono={Layers}
        color={ZENITH}
        nota="Las cuatro capas son de tu cuenta: valen en todas tus neuronas. El motor local es solo de este aparato."
      >
        <div className="space-y-0.5">
          {CAPAS.map((c) => {
            const Icono = ICONO_CAPA[c];
            const idS = `bn-capa-${sufijo}-${c}`;
            return (
              <div key={c} className="flex items-center gap-2.5 px-1 py-1">
                <Icono className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden />
                <label htmlFor={idS} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-[13px] font-medium text-white/90">{ETIQUETA_CAPA[c].nombre}</span>
                  <span className="block truncate text-[11.5px] text-white/50">{ETIQUETA_CAPA[c].descripcion}</span>
                </label>
                <Switch id={idS} checked={borrador.capas[c]} onCheckedChange={(v) => cambiar({ capas: { ...borrador.capas, [c]: v } })} aria-label={`Capa ${ETIQUETA_CAPA[c].nombre}`} />
              </div>
            );
          })}
          <div className="mt-1 border-t border-white/10 pt-1.5">
            <FilaInterruptor
              id={`bn-motor-${sufijo}`}
              titulo="Motor 1.58 local en esta neurona"
              texto="Apágalo si este aparato no debe correr BitNet aunque la capa local esté encendida."
              valor={borrador.motorLocal}
              onCambiar={(v) => cambiar({ motorLocal: v })}
            />
          </div>
        </div>
      </Seccion>

      <Seccion
        titulo="Medios de transmisión preferidos"
        icono={Route}
        color={HORIZON}
        nota="Lo que salga de esta neurona usa este orden; un chat con su propio medio manda sobre esto."
      >
        <FilaInterruptor
          id={`bn-medios-${sufijo}`}
          titulo="Usar los generales de Mensajería"
          valor={!borrador.mediosPropios}
          onCambiar={(v) => cambiar({ mediosPropios: !v })}
        />
        {borrador.mediosPropios && (
          <div className="pt-2">
            <PreferenciasMedioForm ambito="global" preferencias={borrador.medios} onCambiar={(p) => cambiar({ medios: p })} />
          </div>
        )}
      </Seccion>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035]">
        <button
          type="button"
          aria-expanded={verMas}
          aria-controls={idMas}
          onClick={() => setVerMas(!verMas)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 text-left text-[13px] font-semibold text-white/85 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00] motion-reduce:transition-none"
        >
          <span>Más: fondo, recursos, NAS, actualizaciones e icono</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none", verMas && "rotate-180")} aria-hidden />
        </button>
        {verMas && (
          <div id={idMas} className="space-y-0.5 px-3 pb-3">
            <FilaInterruptor
              id={`bn-fondo-${sufijo}`}
              titulo="Escucha de fondo de Aurora"
              texto="Solo funciona en las apps instaladas."
              valor={borrador.escuchaFondo}
              onCambiar={(v) => cambiar({ escuchaFondo: v })}
            />
            <FilaInterruptor
              id={`bn-computo-${sufijo}`}
              titulo="Prestar su procesador"
              texto="A Aurora y a tus otras neuronas cuando está libre."
              valor={borrador.compartirComputo}
              onCambiar={(v) => cambiar({ compartirComputo: v })}
            />
            <FilaInterruptor
              id={`bn-almacen-${sufijo}`}
              titulo="Guardar copias para tus neuronas"
              texto="Archivos y memorias que no dependan de un solo sitio."
              valor={borrador.compartirAlmacen}
              onCambiar={(v) => cambiar({ compartirAlmacen: v })}
            />
            <FilaInterruptor
              id={`bn-archivos-${sufijo}`}
              titulo="Aceptar solicitudes de archivos"
              valor={borrador.solicitudesArchivos}
              onCambiar={(v) => cambiar({ solicitudesArchivos: v })}
            />
            {borrador.nas !== null && (
              <FilaInterruptor
                id={`bn-nas-${sufijo}`}
                titulo="Compartir carpetas (NAS) con tus neuronas"
                texto="Las carpetas que concedas en esta app, solo para tu cuenta."
                valor={borrador.nas}
                onCambiar={(v) => cambiar({ nas: v })}
              />
            )}
            <FilaInterruptor
              id={`bn-actualiza-${sufijo}`}
              titulo="Recibir primero las actualizaciones automáticas"
              texto="Las capas en «Automática solo en esta neurona» se aplican aquí."
              valor={borrador.actualizaPrimero}
              onCambiar={(v) => cambiar({ actualizaPrimero: v })}
            />
            <fieldset className="pt-2">
              <legend className="mb-1.5 px-1 text-[13px] font-medium text-white/90">Icono</legend>
              <div role="radiogroup" aria-label="Icono" className="flex flex-wrap gap-1.5">
                {ICONOS.map((i) => {
                  const idI = `bn-icono-${sufijo}-${i.id}`;
                  const activo = borrador.icono === i.id;
                  return (
                    <label
                      key={i.id}
                      htmlFor={idI}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1 text-[12px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#FFBF00] motion-reduce:transition-none",
                        activo ? "border-[#FFBF00]/50 bg-[#FFBF00]/15 text-[#ffe08a]" : "border-white/15 text-white/70 hover:border-white/30",
                      )}
                    >
                      <input id={idI} type="radio" name={`bn-icono-${sufijo}`} checked={activo} onChange={() => cambiar({ icono: i.id })} className="sr-only" />
                      {i.titulo}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}
      </div>
    </>
  );
}

export default BienvenidaNeurona;
