"use client";
/**
 * Ventana de la Protomolécula · máquina de la petición. Un texto (o una herramienta) se convierte en un PLAN,
 * el gobierno de lo que tienes delante dice quién lo decide (aplicar · proponer · votar · denegar), la persona
 * confirma y solo entonces se ejecuta. Nada se aplica sin que la persona lo confirme, salvo los planes que solo
 * ABREN una vista (no cambian nada de nadie).
 *
 * Economía: una sola petición a la vez (no hay bucles), texto acotado, y un tope de espera; el tope por hora y
 * por agente lo pone el motor de peticiones (`FalloPeticion.error === "tope"`) y aquí se enseña tal cual.
 * Quién decide: el veredicto previo usa el actor REAL de la sesión (cuenta y rol en el grupo, `actorDeLaSesion`), el
 * mismo que usa la ejecución; mientras se lee, la deducción local (`actorDeLaVentana`).
 * Agentes: lo que un agente pide (`peticion/pedir.ts`, `EVENTO_PLAN_PENDIENTE`) aparece aquí como «un agente
 * propone…» y solo se ejecuta si la persona lo confirma, contra la pantalla en que se pidió.
 * Honestidad: cada fallo se cuenta con su motivo y su camino (`pasos.ts#textoFallo`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { decidirCambio } from "@/lib/protomolecula/gobierno";
import { actorDeLaSesion, ejecutarPlan, planificarPeticion } from "@/lib/protomolecula/peticion";
import type { ActorProto, ContextoProto, ModoEdicion, PlanPeticion, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { descartarPlanPendiente, EVENTO_PLAN_PENDIENTE, planesPendientes, tomarPlanPendiente, type PlanPendiente } from "@/lib/protomolecula/peticion/pedir";
import { actorDeLaVentana } from "./contexto";
import { esPlanSoloDeApertura } from "./herramientas";
import { MAX_TEXTO_PETICION, type EstadoPeticion, type OrigenPlan, type PendienteVentana, type ResultadoVentana } from "./tipos";

export interface DependenciasPeticion {
  planificar: typeof planificarPeticion;
  ejecutar: typeof ejecutarPlan;
  decidir: typeof decidirCambio;
  /** El actor real de la sesión para esta pantalla; null = no se sabe (se usa la deducción local). */
  resolverActor: (contexto: ContextoProto, origen: ActorProto["origen"]) => Promise<ActorProto | null>;
}

export interface OpcionesPeticion {
  /** Cómo navegar dentro del OS (la ventana pasa `router.push`); sin él, el motor usa la navegación del navegador. */
  abrirRuta?: (ruta: string) => void;
}

/** Clave de la pantalla para el gobierno: si cambia, hay que volver a leer quién es la persona en ella. */
const claveGobierno = (c: ContextoProto): string =>
  [c.ambito, c.entidad?.tipo, c.entidad?.id, c.gobernadaPor?.tipo, c.gobernadaPor?.id].map((x) => x ?? "").join("|");

/** Espera máxima del plan antes de decir que tarda (no se queda cargando para siempre). */
export const ESPERA_PLAN_MS = 45_000;

const VEREDICTO_APERTURA: VeredictoGobierno = { decision: "aplicar", motivo: "Solo abre una vista: no cambia nada de nadie.", confirmar: false };

const mensajeDe = (e: unknown): string => (e instanceof Error && e.message ? e.message : typeof e === "string" ? e : "");

const POR_DEFECTO: DependenciasPeticion = { planificar: planificarPeticion, ejecutar: ejecutarPlan, decidir: decidirCambio, resolverActor: actorDeLaSesion };

export function usePeticion(contexto: ContextoProto, deps?: Partial<DependenciasPeticion>, opciones: OpcionesPeticion = {}) {
  const [estado, setEstado] = useState<EstadoPeticion>({ fase: "reposo" });
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const turno = useRef(0);
  const montado = useRef(true);
  /** Guardia síncrona: una sola petición o ejecución a la vez, aunque se pulse dos veces seguidas. */
  const enCurso = useRef(false);
  const ctx = useRef(contexto);
  ctx.current = contexto;
  const dep = useRef<DependenciasPeticion>({ ...POR_DEFECTO, ...deps });
  dep.current = { ...POR_DEFECTO, ...deps };
  const abrirRuta = useRef(opciones.abrirRuta);
  abrirRuta.current = opciones.abrirRuta;
  /** El actor real de la sesión en ESTA pantalla (null mientras se lee o si no se sabe). */
  const actorReal = useRef<{ clave: string; actor: ActorProto } | null>(null);
  const clave = claveGobierno(contexto);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; turno.current++; };
  }, []);

  useEffect(() => {
    let vigente = true;
    actorReal.current = null;
    dep.current.resolverActor(ctx.current, "humano")
      .then((a) => { if (vigente && a) actorReal.current = { clave, actor: a }; })
      .catch(() => { /* sin sesión legible: se queda la deducción local */ });
    return () => { vigente = false; };
  }, [clave]);

  /** Solo aplica el cambio de estado si esta orden sigue siendo la vigente (no la cancelaron ni la pisaron). */
  const poner = useCallback((mio: number, e: EstadoPeticion) => {
    if (montado.current && turno.current === mio) {
      estadoRef.current = e;
      setEstado(e);
    }
  }, []);

  /** El actor para el veredicto: el real si ya se leyó para esta pantalla; si no, la deducción local. */
  const actorPara = useCallback((c: ContextoProto, origen: OrigenPlan): ActorProto => {
    const real = actorReal.current;
    if (real && real.clave === claveGobierno(c)) return { ...real.actor, origen: origen === "ia" ? "ia" : "humano" };
    return actorDeLaVentana(c, origen);
  }, []);

  const veredictoDe = useCallback((plan: PlanPeticion, origen: OrigenPlan, c: ContextoProto = ctx.current): VeredictoGobierno => {
    if (esPlanSoloDeApertura(plan)) return VEREDICTO_APERTURA;
    try {
      return dep.current.decidir(c, actorPara(c, origen), plan.tipoCambio);
    } catch (e) {
      // Si el gobierno no puede decidir, no se aplica nada: se dice por qué.
      return { decision: "denegar", motivo: `El gobierno de esta entidad no pudo decidir${mensajeDe(e) ? ` (${mensajeDe(e)})` : ""}.`, confirmar: false };
    }
  }, [actorPara]);

  /** Ejecuta contra la pantalla de la ventana (o la del agente que lo pidió). El actor lo deduce el motor con la sesión. */
  const ejecutar = useCallback(async (plan: PlanPeticion, mio: number, donde?: ContextoProto) => {
    enCurso.current = true;
    poner(mio, { fase: "ejecutando", plan });
    try {
      const r = (await dep.current.ejecutar(plan, { contexto: donde ?? ctx.current, ...(abrirRuta.current ? { abrirRuta: abrirRuta.current } : {}) })) as ResultadoVentana;
      poner(mio, { fase: "hecho", plan, resultado: { ok: r.ok, hechos: r.hechos ?? [], pendientes: r.pendientes ?? [], motivo: r.motivo, deshacer: typeof r.deshacer === "function" ? r.deshacer : undefined } });
    } catch (e) {
      poner(mio, { fase: "hecho", plan, resultado: { ok: false, hechos: [], pendientes: [], motivo: mensajeDe(e) || "La ejecución falló." } });
    } finally {
      if (turno.current === mio) enCurso.current = false;
    }
  }, [poner]);

  /** Un plan ya hecho (herramienta o reglas locales): lo abre directo o lo enseña para confirmar. */
  const lanzarPlan = useCallback((plan: PlanPeticion, origen: OrigenPlan = "humano", texto = "") => {
    if (enCurso.current) return;
    const mio = ++turno.current;
    if (esPlanSoloDeApertura(plan)) { void ejecutar(plan, mio); return; }
    poner(mio, { fase: "plan", texto, plan, veredicto: veredictoDe(plan, origen), origen });
  }, [ejecutar, poner, veredictoDe]);

  const pedir = useCallback(async (textoBruto: string, modo: ModoEdicion = "directo") => {
    const texto = textoBruto.trim().slice(0, MAX_TEXTO_PETICION);
    if (enCurso.current) return;
    if (!texto) { setEstado({ fase: "error", texto: "", tipo: "vacia", motivo: "" }); return; }
    const mio = ++turno.current;
    enCurso.current = true;
    poner(mio, { fase: "planificando", texto });
    let aviso: ReturnType<typeof setTimeout> | undefined;
    try {
      const espera = new Promise<"tarda">((r) => { aviso = setTimeout(() => r("tarda"), ESPERA_PLAN_MS); });
      const r = await Promise.race([dep.current.planificar({ texto, contexto: ctx.current, modo }), espera]);
      if (r === "tarda") { poner(mio, { fase: "error", texto, tipo: "tarda", motivo: "" }); return; }
      if ("error" in r) { poner(mio, { fase: "error", texto, tipo: r.error, motivo: r.motivo }); return; }
      poner(mio, { fase: "plan", texto, plan: r, veredicto: veredictoDe(r, "ia"), origen: "ia" });
    } catch (e) {
      poner(mio, { fase: "error", texto, tipo: "fallo", motivo: mensajeDe(e) });
    } finally {
      if (aviso) clearTimeout(aviso);
      if (turno.current === mio) enCurso.current = false;
    }
  }, [poner, veredictoDe]);

  /** Confirmar: aplica si el gobierno dice «aplicar»; si dice proponer o votar, abre la propuesta; denegar no hace nada. */
  const confirmar = useCallback(() => {
    const e = estadoRef.current;
    if (e.fase !== "plan" || enCurso.current) return;
    const { veredicto, plan, pendiente } = e;
    if (veredicto.decision === "denegar") return;
    if (veredicto.decision === "proponer" || veredicto.decision === "votar") {
      const mio = ++turno.current;
      poner(mio, { fase: "propuesta", plan, veredicto, ...(pendiente ? { pendiente } : {}) });
      return;
    }
    // Lo que pidió un agente sale de la cola al confirmarlo: no se puede ejecutar dos veces.
    if (pendiente) tomarPlanPendiente(pendiente.id);
    void ejecutar(plan, ++turno.current, pendiente?.contexto);
  }, [ejecutar, poner]);

  const volverAlPlan = useCallback(() => {
    const e = estadoRef.current;
    if (e.fase !== "propuesta") return;
    const mio = ++turno.current;
    poner(mio, { fase: "plan", texto: "", plan: e.plan, veredicto: e.veredicto, origen: "ia", ...(e.pendiente ? { pendiente: e.pendiente } : {}) });
  }, [poner]);

  /** Un plan que pidió un agente: se enseña para confirmar, salvo que la persona ya esté con otro plan o ejecutando. */
  const mostrarPendiente = useCallback((p: PlanPendiente) => {
    if (enCurso.current || !p?.id || !p.plan) return;
    const fase = estadoRef.current.fase;
    if (fase !== "reposo" && fase !== "hecho" && fase !== "error") return; // no pisa lo que la persona está mirando
    const pendiente: PendienteVentana = { id: p.id, agente: p.agente || "un agente", contexto: p.contexto ?? ctx.current };
    const mio = ++turno.current;
    poner(mio, { fase: "plan", texto: p.texto, plan: p.plan, veredicto: veredictoDe(p.plan, "ia", pendiente.contexto), origen: "ia", pendiente });
  }, [poner, veredictoDe]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const oir = (ev: Event) => { const d = (ev as CustomEvent<PlanPendiente>).detail; if (d) mostrarPendiente(d); };
    window.addEventListener(EVENTO_PLAN_PENDIENTE, oir);
    // Lo que un agente pidió con la ventana cerrada sigue esperando: se enseña el más reciente al abrir.
    const ya = planesPendientes();
    if (ya.length) mostrarPendiente(ya[ya.length - 1]);
    return () => window.removeEventListener(EVENTO_PLAN_PENDIENTE, oir);
  }, [mostrarPendiente]);

  /** Cancela lo que haya (plan a medias, espera): la orden en vuelo queda descartada. Un plan de agente se descarta. */
  const cancelar = useCallback(() => {
    const e = estadoRef.current;
    if ((e.fase === "plan" || e.fase === "propuesta") && e.pendiente) descartarPlanPendiente(e.pendiente.id);
    turno.current++;
    enCurso.current = false;
    estadoRef.current = { fase: "reposo" };
    setEstado({ fase: "reposo" });
  }, []);

  const deshacer = useCallback(async () => {
    const e = estadoRef.current;
    if (e.fase !== "hecho" || !e.resultado.deshacer) return;
    try {
      await e.resultado.deshacer();
      if (montado.current) setEstado({ fase: "reposo" });
    } catch (err) {
      if (montado.current) setEstado({ fase: "hecho", plan: e.plan, resultado: { ...e.resultado, deshacer: undefined, motivo: `No se pudo deshacer${mensajeDe(err) ? `: ${mensajeDe(err)}` : ""}.` } });
    }
  }, []);

  /** «Sin IA»: lo mismo, con las reglas locales (dictado de órdenes a una molécula). Pasa por el mismo plan y confirmación. */
  const reglasLocales = useCallback((texto: string) => {
    const orden = texto.trim().slice(0, MAX_TEXTO_PETICION);
    if (!orden) return;
    lanzarPlan({
      resumen: "Dar la orden a los controles de la molécula con las reglas locales",
      tipoCambio: "contenido",
      pasos: [{ tipo: "dictar-molecula", orden }],
      fuera: [],
      motor: "reglas locales (sin IA)",
    }, "humano", orden);
  }, [lanzarPlan]);

  const ocupadoAhora = estado.fase === "planificando" || estado.fase === "ejecutando";
  return { estado, ocupado: ocupadoAhora, pedir, lanzarPlan, confirmar, volverAlPlan, cancelar, deshacer, reglasLocales };
}
