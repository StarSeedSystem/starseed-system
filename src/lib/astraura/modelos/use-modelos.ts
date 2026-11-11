"use client";

// Enganche de React para los modelos recomendados (MOD1110A): reúne el perfil de ESTA neurona, el de las
// otras de la cuenta, el catálogo guardado, los ajustes y la revisión diaria. Defensivo y SSR-safe:
// todo lo que falla se queda como estaba y se dice, nunca se rompe la pantalla.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectCapabilities, listNeurons, thisDeviceId, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { leeHierroServicioLocal, URL_SERVICIO_IMAGENES_POR_DEFECTO } from "@/lib/imagenes/adaptadores/hierro-local";
import capasCrudas from "../../../../config/capas-astraura.json";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { debeRevisar, revisarFuentes, avisoDiscreto, type Mejora } from "./actualizar-catalogo";
import {
  EVENTO_MODELOS, activarVariantes, desactivarVariantes, guardarAjustes, guardarCatalogo, guardarOllamaPendiente, guardarRevision, leerAjustes,
  leerCatalogoGuardado, leerInstalados, leerOllamaPendiente, leerRevision, marcarInstalado, olvidarOllamaPendiente,
  type AjustesModelos, type AlmacenTexto, type ModoModelos,
} from "./almacen";
import { catalogoCompleto, listableSinFiltros, modelosDesdeCapas } from "./catalogo";
import { puenteNativo } from "@/lib/nativa/puente";
import {
  FICHAS_OLLAMA, abrirInstaladorOllama, instalarOllamaGuiado, nativoOllamaDesde, preguntaOllama, sistemaOllama, sondearOllama, vigilarOllama,
  type FichaOllama, type PreguntaOllama, type ProgresoNativoOllama, type ResultadoInstalacionOllama, type SistemaOllama,
} from "./instalar-ollama";
import { CASOS_SIN_FILTROS, aplicarEleccionManual, type UsoModelo } from "./recomendar";
import { variantesDisponibles, type DisponibilidadVariantes } from "./variantes";
import { conHierroMedido, perfilDesdeCapacidades, type PerfilNeurona } from "./perfil-neurona";
import { listarInstaladosOllama, planInstalar, ejecutarInstalacion, type PlanInstalacion, type ResultadoInstalacion, type Traer } from "./instalar";
import { recomendarTodos, type Recomendacion } from "./recomendar";
import { CASOS, type CasoUso, type CatalogoModelos, type ModeloLocal } from "./tipos";

const CAPAS = leerCatalogo(capasCrudas);
const PROPIOS = modelosDesdeCapas(CAPAS);
const BASE_SERVICIO_LOCAL = process.env.NEXT_PUBLIC_ASTRAURA_IMAGENES_LOCAL_URL ?? URL_SERVICIO_IMAGENES_POR_DEFECTO;

function almacen(): AlmacenTexto | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
const hoy = () => new Date().toISOString().slice(0, 10);

/** Lee una fuente pública por el puente del propio OS (lista cerrada en el servidor). */
const traerPorPuente = async (url: string): Promise<string> => {
  const r = await fetch(`/api/astraura/modelos-fuentes?u=${encodeURIComponent(url)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};

export interface EstadoModelos {
  cargando: boolean;
  catalogo: CatalogoModelos;
  /** Catálogo completo a comparar (estándar + capas propias). */
  modelos: ModeloLocal[];
  perfil: PerfilNeurona | null;
  pares: PerfilNeurona[];
  ajustes: AjustesModelos;
  recomendaciones: Record<CasoUso, Recomendacion> | null;
  instalados: ReadonlySet<string>;
  aviso: { clave: string; texto: string } | null;
  revisando: boolean;
  /** Mensaje corto del último intento («sin conexión: se usa el catálogo del …»). */
  estadoRevision: string;
  /** Lo que se USA de verdad por caso: la elección manual con sus límites aplicados (las variantes sin filtros solo en privado). */
  usos: Record<CasoUso, UsoModelo> | null;
  /** «Mostrar variantes sin filtros»: encendido y si este perfil puede usarlo. */
  sinFiltros: { activado: boolean } & DisponibilidadVariantes;
  /** Instalación guiada de Ollama para el sistema de esta neurona. */
  ollama: { sistema: SistemaOllama; ficha: FichaOllama; pregunta: PreguntaOllama; presente: boolean };
  /** Ollama acaba de detectarse y había un modelo pendiente: el siguiente paso (con la pregunta y el tamaño de siempre). */
  continuar: PlanInstalacion | null;
}

export interface AccionesModelos {
  setModo(m: ModoModelos): void;
  elegirManual(caso: CasoUso, id: string | null): void;
  setPrivacidad(p: Partial<AjustesModelos["privacidad"]>): void;
  setRamDeclarada(gb: number | null): void;
  revisarAhora(): Promise<void>;
  descartarAviso(): void;
  /** Plan con la pregunta previa (tamaño incluido). No descarga nada. */
  planDe(m: ModeloLocal): PlanInstalacion | null;
  /** Descarga SOLO tras la confirmación de la persona. */
  instalar(plan: PlanInstalacion, confirmado: boolean, onProgreso?: (pct: number, estado: string) => void): Promise<ResultadoInstalacion>;
  /** Recomendación para una neurona de la cuenta (para «en tu MaggaBook cabría»). */
  recomendarEn(p: PerfilNeurona, caso: CasoUso): Recomendacion | null;
  /** Enciende las variantes sin filtros. SOLO se llama tras la confirmación de la persona. */
  activarVariantes(): void;
  /** Las apaga: se esconden y cualquier elección manual sobre ellas vuelve a «Automático». */
  desactivarVariantes(): void;
  /** Elige a mano una variante para mis conversaciones privadas (los casos en que se permite). */
  usarVariante(id: string): void;
  dejarVariante(id: string): void;
  /** Descarga el instalador oficial de Ollama SOLO con `confirmado`; `modeloId` es el modelo al que se seguirá después. */
  instalarOllama(confirmado: boolean, opciones?: { modeloId?: string; onProgreso?: (p: ProgresoNativoOllama) => void }): Promise<ResultadoInstalacionOllama>;
  cancelarOllama(): Promise<boolean>;
  /** (SEG1111U) Vuelve a abrir el instalador ya descargado, pidiendo antes «acceso al equipo» si falta. */
  abrirInstaladorOllama(ruta: string): Promise<ResultadoInstalacionOllama>;
  /** Mira cada pocos segundos si Ollama ya responde; devuelve la función que deja de mirar. */
  vigilarOllama(): () => void;
  /** Mira una vez ahora («Ya lo instalé»). */
  comprobarOllama(): Promise<boolean>;
  descartarContinuar(): void;
}

export function useModelosNeurona(): EstadoModelos & AccionesModelos {
  const [catalogo, setCatalogo] = useState<CatalogoModelos>(() => leerCatalogoGuardado(almacen()));
  const [ajustes, setAjustes] = useState<AjustesModelos>(() => leerAjustes(almacen()));
  const [perfil, setPerfil] = useState<PerfilNeurona | null>(null);
  const [pares, setPares] = useState<PerfilNeurona[]>([]);
  const [instalados, setInstalados] = useState<ReadonlySet<string>>(() => new Set(leerInstalados(almacen())));
  const [aviso, setAviso] = useState<{ clave: string; texto: string } | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [estadoRevision, setEstadoRevision] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ollamaListo, setOllamaListo] = useState(false);
  const [continuarId, setContinuarId] = useState<string | null>(null);
  const revisionEnCurso = useRef(false);

  // Perfil de ESTA neurona y de las demás de la cuenta.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      let caps: NeuronCapabilities | null = null;
      try { caps = await detectCapabilities(); } catch { /* sin ficha */ }
      const esTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
      const base = perfilDesdeCapacidades(thisDeviceId() || "esta", "Esta neurona", caps as unknown as Record<string, unknown> | null, {
        ramDeclaradaGb: ajustes.ramDeclaradaGb, plataforma: esTauri ? "tauri" : undefined, enLinea: true,
      });
      const hierro = await leeHierroServicioLocal(BASE_SERVICIO_LOCAL);
      if (!vivo) return;
      setPerfil(ajustes.ramDeclaradaGb !== null ? { ...conHierroMedido(base, hierro), ramGb: ajustes.ramDeclaradaGb, ramFiable: true } : conHierroMedido(base, hierro));
      try {
        const lista = await listNeurons();
        if (!vivo) return;
        setPares(lista.filter((n) => !n.isThisDevice).map((n) => {
          const c = (n.capabilities ?? {}) as unknown as Record<string, unknown>;
          const a158 = (c.astraura158 ?? null) as { online?: boolean } | null;
          return perfilDesdeCapacidades(n.id, n.name, c, { iaMalla: c.ollama === true || a158?.online === true, enLinea: n.online !== false });
        }));
      } catch { /* sin lista de neuronas: solo esta */ }
      // Lo ya descargado en el Ollama de esta máquina (mejor esfuerzo).
      const traerLocal: Traer = async (u, init) => { const r = await fetch(u, init); return { ok: r.ok, status: r.status, body: r.body, json: () => r.json() }; };
      const locales = await listarInstaladosOllama(traerLocal);
      if (vivo && locales.length > 0) setInstalados((prev) => new Set([...prev, ...locales]));
      if (vivo) setCargando(false);
    })();
    return () => { vivo = false; };
  }, [ajustes.ramDeclaradaGb]);

  // Ollama detectado después de instalarlo (o al arrancar con una instalación pendiente): la neurona pasa a tener ese motor.
  const perfilEf = useMemo<PerfilNeurona | null>(
    () => (perfil && ollamaListo && !perfil.runtimes.includes("ollama") ? { ...perfil, runtimes: [...perfil.runtimes, "ollama"], puedeInstalarOllama: false } : perfil),
    [perfil, ollamaListo],
  );
  const modelos = useMemo(() => catalogoCompleto(catalogo, CAPAS), [catalogo]);
  const entorno = useMemo(() => ({ pares, privacidad: ajustes.privacidad, instalados }), [pares, ajustes.privacidad, instalados]);
  const recomendaciones = useMemo(() => (perfilEf ? recomendarTodos({ catalogo: modelos, perfil: perfilEf, entorno }) : null), [modelos, perfilEf, entorno]);
  const disponibilidad = useMemo(() => variantesDisponibles(), []);
  const sinFiltros = useMemo(() => ({ activado: ajustes.variantesSinFiltros && disponibilidad.disponible, ...disponibilidad }), [ajustes.variantesSinFiltros, disponibilidad]);
  // Lo que se usa de verdad: la elección manual con los límites de las variantes sin filtros (aquí el contexto es siempre «privado-propio»:
  // este bloque habla de MIS conversaciones en MI neurona; bots, grupos, capas públicas y segundo plano no pasan por la elección manual).
  const usos = useMemo<Record<CasoUso, UsoModelo> | null>(() => {
    if (!perfilEf || !recomendaciones) return null;
    const out = {} as Record<CasoUso, UsoModelo>;
    for (const caso of CASOS) {
      out[caso] = aplicarEleccionManual({
        catalogo: modelos, perfil: perfilEf, caso, rec: recomendaciones[caso],
        idManual: ajustes.modo === "manual" ? ajustes.porCaso[caso] : null,
        sinFiltros: { activado: sinFiltros.activado, disponible: sinFiltros.disponible },
        contexto: "privado-propio", instalados,
      });
    }
    return out;
  }, [perfilEf, recomendaciones, modelos, ajustes.modo, ajustes.porCaso, sinFiltros.activado, sinFiltros.disponible, instalados]);
  const sistema = useMemo(
    () => sistemaOllama({ plataforma: perfil?.plataforma ?? "web", userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent }),
    [perfil?.plataforma],
  );
  const ficha = FICHAS_OLLAMA[sistema];
  const nativo = useMemo(() => nativoOllamaDesde(puenteNativo()), []);
  const traerLocal = useCallback<Traer>(async (u, init) => { const r = await fetch(u, init); return { ok: r.ok, status: r.status, body: r.body, json: () => r.json() }; }, []);

  const aplicarAjustes = useCallback((f: (a: AjustesModelos) => AjustesModelos) => {
    setAjustes((a) => {
      const n = f(a);
      guardarAjustes(almacen(), n);
      try { window.dispatchEvent(new CustomEvent(EVENTO_MODELOS)); } catch { /* */ }
      return n;
    });
  }, []);

  const revisar = useCallback(async (forzar: boolean) => {
    if (!perfilEf || revisionEnCurso.current) return;
    const a = almacen();
    const rev = leerRevision(a);
    const enLinea = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    if (!debeRevisar({ ahoraMs: Date.now(), ultimoIntentoMs: rev.ultimoIntentoMs, enLinea, forzar })) {
      if (!enLinea) setEstadoRevision(`Sin conexión: se usa el catálogo comprobado el ${catalogo.revisado ?? catalogo.actualizado}.`);
      return;
    }
    revisionEnCurso.current = true;
    setRevisando(true);
    try {
      const r = await revisarFuentes(catalogo, hoy(), traerPorPuente, { perfil: perfilEf, entorno, propios: PROPIOS });
      guardarRevision(a, { ultimoIntentoMs: Date.now(), ultimoResultado: r.revisado ? "ok" : "fallo" });
      if (r.revisado) {
        guardarCatalogo(a, r.catalogo);
        setCatalogo(r.catalogo);
        setEstadoRevision(`Catálogo comprobado hoy (${r.fuentesLeidas} fuentes leídas${r.fuentesFallidas ? `, ${r.fuentesFallidas} no respondieron` : ""}).`);
        const mejoras: Mejora[] = r.mejoras;
        const av = avisoDiscreto(mejoras, ajustes.avisosVistos);
        if (av) setAviso(av);
      } else {
        setEstadoRevision(`No pude leer las fuentes: se mantiene el catálogo del ${catalogo.revisado ?? catalogo.actualizado}.`);
      }
    } catch {
      guardarRevision(a, { ultimoIntentoMs: Date.now(), ultimoResultado: "fallo" });
      setEstadoRevision(`No pude revisar hoy: se mantiene el catálogo del ${catalogo.revisado ?? catalogo.actualizado}.`);
    } finally {
      revisionEnCurso.current = false;
      setRevisando(false);
    }
  }, [perfilEf, catalogo, entorno, ajustes.avisosVistos]);

  // «En el siguiente arranque»: si se pidió instalar Ollama para un modelo, se mira una vez si ya está.
  useEffect(() => {
    if (!perfil || perfil.runtimes.includes("ollama")) return;
    const pend = leerOllamaPendiente(almacen(), hoy());
    if (!pend) return;
    let vivo = true;
    void sondearOllama(traerLocal).then((ok) => { if (vivo && ok) { setOllamaListo(true); setContinuarId(pend.modeloId); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);

  // Revisión diaria automática (como mucho una al día; sin conexión se omite).
  useEffect(() => {
    if (perfil) void revisar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);

  const acciones: AccionesModelos = {
    setModo: (m) => aplicarAjustes((a) => ({ ...a, modo: m })),
    elegirManual: (caso, id) => aplicarAjustes((a) => {
      const porCaso = { ...a.porCaso };
      if (id) porCaso[caso] = id; else delete porCaso[caso];
      return { ...a, modo: id ? "manual" : a.modo, porCaso };
    }),
    setPrivacidad: (p) => aplicarAjustes((a) => ({ ...a, privacidad: { ...a.privacidad, ...p } })),
    setRamDeclarada: (gb) => aplicarAjustes((a) => ({ ...a, ramDeclaradaGb: gb })),
    revisarAhora: () => revisar(true),
    descartarAviso: () => {
      const av = aviso;
      setAviso(null);
      if (av) aplicarAjustes((a) => ({ ...a, avisosVistos: [...a.avisosVistos, av.clave].slice(-50) }));
    },
    planDe: (m) => (perfilEf ? planInstalar(m, perfilEf, instalados.has(m.id)) : null),
    instalar: async (plan, confirmado, onProgreso) => {
      const traer: Traer = async (u, init) => { const r = await fetch(u, init); return { ok: r.ok, status: r.status, body: r.body, json: () => r.json() }; };
      const res = await ejecutarInstalacion(plan, { confirmado, traer, onProgreso });
      if (res.ok) {
        marcarInstalado(almacen(), plan.modelo.id);
        setInstalados((prev) => new Set([...prev, plan.modelo.id]));
      }
      return res;
    },
    recomendarEn: (p, caso) => {
      try { return recomendarTodos({ catalogo: modelos, perfil: p, entorno: { pares: [], privacidad: ajustes.privacidad } })[caso]; } catch { return null; }
    },
    activarVariantes: () => { if (disponibilidad.disponible) aplicarAjustes((a) => activarVariantes(a, hoy())); },
    desactivarVariantes: () => aplicarAjustes((a) => desactivarVariantes(a, (id) => modelos.some((m) => m.id === id && m.clase === "abliterated"))),
    usarVariante: (id) => {
      const m = modelos.find((x) => x.id === id);
      if (!m || !sinFiltros.activado || !listableSinFiltros(m)) return;
      aplicarAjustes((a) => {
        const porCaso = { ...a.porCaso };
        for (const c of CASOS_SIN_FILTROS) {
          if (c === "codigo-agentes" && !m.herramientas) continue;
          if (c === "vision" && !m.vision) continue;
          porCaso[c] = id;
        }
        return { ...a, modo: "manual", porCaso };
      });
    },
    dejarVariante: (id) => aplicarAjustes((a) => {
      const porCaso = { ...a.porCaso };
      for (const c of CASOS) if (porCaso[c] === id) delete porCaso[c];
      return { ...a, porCaso, modo: Object.keys(porCaso).length === 0 ? "automatico" : a.modo };
    }),
    instalarOllama: async (confirmado, opciones) => {
      if (confirmado && opciones?.modeloId) guardarOllamaPendiente(almacen(), { modeloId: opciones.modeloId, desde: hoy() });
      const r = await instalarOllamaGuiado(ficha, { confirmado, nativo, onProgreso: opciones?.onProgreso });
      if (r.estado === "cancelada" || r.estado === "fallo" || r.estado === "rechazada" || r.estado === "no-disponible") olvidarOllamaPendiente(almacen());
      return r;
    },
    cancelarOllama: () => nativo.cancelar(),
    abrirInstaladorOllama: (ruta) => abrirInstaladorOllama(ficha, nativo, ruta),
    vigilarOllama: () => vigilarOllama({
      sondear: () => sondearOllama(traerLocal),
      alDetectar: () => {
        setOllamaListo(true);
        const pend = leerOllamaPendiente(almacen(), hoy());
        if (pend) setContinuarId(pend.modeloId);
      },
    }),
    comprobarOllama: async () => {
      const ok = await sondearOllama(traerLocal);
      if (ok) {
        setOllamaListo(true);
        const pend = leerOllamaPendiente(almacen(), hoy());
        if (pend) setContinuarId(pend.modeloId);
      }
      return ok;
    },
    descartarContinuar: () => { setContinuarId(null); olvidarOllamaPendiente(almacen()); },
  };

  const continuar = useMemo<PlanInstalacion | null>(() => {
    const m = continuarId ? modelos.find((x) => x.id === continuarId) : undefined;
    return m && perfilEf ? planInstalar(m, perfilEf, instalados.has(m.id)) : null;
  }, [continuarId, modelos, perfilEf, instalados]);

  const ollama = { sistema, ficha, pregunta: preguntaOllama(ficha), presente: !!perfilEf?.runtimes.includes("ollama") };
  return { cargando, catalogo, modelos, perfil: perfilEf, pares, ajustes, recomendaciones, instalados, aviso, revisando, estadoRevision, usos, sinFiltros, ollama, continuar, ...acciones };
}
