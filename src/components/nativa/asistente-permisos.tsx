"use client";

/*
 * AsistentePermisos — la lista de permisos de cada neurona (PER1108A → PER1111S, 2026-11-11).
 * Contrato: architecture/permisos-y-control-del-dispositivo.md §5 · registro único: src/lib/nativa/permisos-registro.ts ·
 * máquina de estados: src/lib/nativa/permisos-inicio.ts · quien pide al sistema: permisos-inicio-ejecutor.ts ·
 * la ventana (solo pintura): ./lista-permisos.tsx.
 *
 * En las apps nativas de macOS, Android, Windows y Linux, global (layout raíz). Se abre sola la primera vez y
 * cuando una actualización AÑADE permisos (solo los nuevos y solo si no están ya concedidos); se reabre desde los
 * ajustes de la neurona (evento `starseed:permisos-inicio-abrir`). Lee el estado REAL de cada permiso al abrir, al
 * volver a la ventana (la persona regresa de Ajustes del Sistema) y mientras espera: así nota una concesión sin
 * reiniciar nada.
 *
 * ORDEN DE LAS VENTANAS DE PRIMER ARRANQUE (PER1115A, 2026-11-15) — una sola recibe los toques cada vez:
 *   1. las ventanas de la persona (acceso/crear cuenta y «Esta neurona», diálogos Radix de `PrimerArranque`: sin ellas
 *      no hay cuenta ni neurona y se terminan en 360 px),
 *   2. después, esta lista de permisos.
 * Esta ventana está hecha a mano y un diálogo Radix modal deja `pointer-events:none` en <body>: si se pintara encima, los
 * toques caerían en el diálogo de debajo (y lo cerrarían). Por eso espera a que el primer plano quede libre y, mientras
 * se ve, se marca con `data-ss-primer-plano` para que las demás esperen a que termine. No se pierde ninguna: solo se turnan.
 * También aplica, una vez por versión, los defectos de antenas encendidas (`aplicarDefectosAntenas`).
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { alLiberarsePrimerPlano } from "@/lib/ui/fullscreen-modal";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import {
  ASISTENTE_OCULTO,
  CLAVE_PERMISOS_INICIO,
  EVENTO_ABRIR_ASISTENTE,
  abrirAsistente,
  accionEn,
  debeAbrirseSolo,
  guardadoTras,
  leerGuardadoPermisos,
  permisoActual,
  reducirAsistente,
  serializarGuardadoPermisos,
  sistemaDeAsistente,
  type DefPermiso,
  type EstadoAsistente,
  type FaseAsistente,
} from "@/lib/nativa/permisos-inicio";
import { leerEstadosSistema, pedirPermisoInicio, type DepsEjecutor } from "@/lib/nativa/permisos-inicio-ejecutor";
import { aplicarDefectosAntenas } from "@/lib/nativa/defectos-antenas-aplicar";
import {
  detectarMedio,
  VERSION_MATRIZ,
  registroDe,
  accionDe,
  esAccionable,
  defDe,
  necesitaPara,
  type Medio,
  type EstadoSistema,
  type AccionPermiso,
  type DefPermiso as DefMatriz,
  type IdPermiso,
} from "@/lib/permisos/matriz";
import { ListaPermisos } from "./lista-permisos";

function leerAlmacen(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribirAlmacen(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: se vuelve a preguntar la próxima vez */
  }
}

async function plataformaDeLaApp(): Promise<string> {
  const r = await puenteNativo().llamar<{ plataforma?: unknown }>("permisos_inicio_estado");
  if (r.ok && r.valor && typeof r.valor.plataforma === "string") return r.valor.plataforma;
  // Una app anterior a PER1108A no tiene el comando: se deduce del agente.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /Android/i.test(ua) ? "android" : /Mac/i.test(ua) ? "macos" : /Windows/i.test(ua) ? "windows" : /Linux/i.test(ua) ? "linux" : "otra";
}

/* ══════════════════════════ Flujo matriz (web, iOS, terminal) ══════════════════════════ */

const CLAVE_PERMISOS_MATRIZ = "starseed.permisos-matriz.v1";

interface GuardadoMatriz {
  version: number;
  medio: Medio;
  vistos: IdPermiso[];
  resultados: Partial<Record<IdPermiso, "concedido" | "denegado" | "omitido" | "no-disponible">>;
  yaPedidos: IdPermiso[];
}

const GUARDADO_MATRIZ_VACIO: GuardadoMatriz = { version: 0, medio: "web", vistos: [], resultados: {}, yaPedidos: [] };

function leerGuardadoMatriz(raw: string | null | undefined): GuardadoMatriz {
  if (!raw) return GUARDADO_MATRIZ_VACIO;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return GUARDADO_MATRIZ_VACIO;
    const g = o as Partial<GuardadoMatriz>;
    const version = typeof g.version === "number" && Number.isFinite(g.version) ? Math.floor(g.version) : 0;
    const medio = typeof g.medio === "string" && ["macos", "android", "windows", "linux-x11", "linux-wayland", "web", "terminal", "ios"].includes(g.medio)
      ? (g.medio as Medio) : "web";
    return {
      version,
      medio,
      vistos: Array.isArray(g.vistos) ? g.vistos.filter((v): v is IdPermiso => typeof v === "string") : [],
      resultados: g.resultados ?? {},
      yaPedidos: Array.isArray(g.yaPedidos) ? g.yaPedidos.filter((v): v is IdPermiso => typeof v === "string") : [],
    };
  } catch {
    return GUARDADO_MATRIZ_VACIO;
  }
}

function serializarGuardadoMatriz(g: GuardadoMatriz): string {
  return JSON.stringify(g);
}

type FaseMatriz = "oculto" | "presentacion" | "pidiendo" | "resumen";

interface EstadoMatriz {
  fase: FaseMatriz;
  medio: Medio;
  lista: DefMatriz[];
  cola: DefMatriz[];
  indice: number;
  esperando: IdPermiso | null;
  resultados: Partial<Record<IdPermiso, "concedido" | "denegado" | "omitido" | "no-disponible">>;
  estados: Partial<Record<IdPermiso, EstadoSistema>>;
  yaPedidos: IdPermiso[];
}

const ESTADO_MATRIZ_OCULTO: EstadoMatriz = {
  fase: "oculto",
  medio: "web",
  lista: [],
  cola: [],
  indice: 0,
  esperando: null,
  resultados: {},
  estados: {},
  yaPedidos: [],
};

function accionMatriz(def: DefMatriz, estado: EstadoSistema | undefined, yaPedido = false): AccionPermiso {
  return accionDe(def, estado, yaPedido);
}

function colaMatriz(medio: Medio, g: GuardadoMatriz, estados: Partial<Record<IdPermiso, EstadoSistema>> = {}, forzar = false): DefMatriz[] {
  return registroDe(medio).filter(
    (d) => esAccionable(accionMatriz(d, estados[d.id], g.yaPedidos.includes(d.id))) && (forzar || !g.vistos.includes(d.id)),
  );
}

function debeAbrirseMatriz(medio: Medio, g: GuardadoMatriz, estados: Partial<Record<IdPermiso, EstadoSistema>> = {}): boolean {
  return colaMatriz(medio, g, estados, false).length > 0;
}

function abrirMatriz(medio: Medio, g: GuardadoMatriz, forzar = false, estados: Partial<Record<IdPermiso, EstadoSistema>> = {}): EstadoMatriz {
  const lista = registroDe(medio);
  const cola = colaMatriz(medio, g, estados, forzar);
  const base = { ...ESTADO_MATRIZ_OCULTO, medio, lista, cola, estados, yaPedidos: g.yaPedidos };
  if (!cola.length) return forzar ? { ...base, fase: "resumen" } : ESTADO_MATRIZ_OCULTO;
  return { ...base, fase: "presentacion" };
}

function permisoActualMatriz(e: EstadoMatriz): DefMatriz | null {
  return e.fase === "pidiendo" && e.indice < e.cola.length ? e.cola[e.indice] : null;
}

function avanzarMatriz(e: EstadoMatriz, desde: number, resultados: EstadoMatriz["resultados"]): EstadoMatriz {
  let indice = desde;
  const r = { ...resultados };
  while (indice < e.cola.length && e.estados[e.cola[indice].id] === "concedido") {
    r[e.cola[indice].id] = r[e.cola[indice].id] ?? "concedido";
    indice++;
  }
  return indice >= e.cola.length
    ? { ...e, indice, esperando: null, resultados: r, fase: "resumen" }
    : { ...e, indice, esperando: null, resultados: r, fase: "pidiendo" };
}

type AccionMatriz =
  | { t: "empezar" }
  | { t: "pedir"; id?: IdPermiso }
  | { t: "resultado"; id: IdPermiso; r: "concedido" | "denegado" | "omitido" | "no-disponible" }
  | { t: "estados"; estados: Partial<Record<IdPermiso, EstadoSistema>> }
  | { t: "omitir" }
  | { t: "omitir-todo" }
  | { t: "cerrar" }
  | { t: "abrir"; estado: EstadoMatriz };

function reducirMatriz(e: EstadoMatriz, ev: AccionMatriz): EstadoMatriz {
  switch (ev.t) {
    case "abrir":
      return ev.estado;
    case "empezar":
      return e.fase === "presentacion" ? avanzarMatriz({ ...e, fase: "pidiendo" }, e.indice, e.resultados) : e;
    case "pedir": {
      if (e.esperando || e.fase === "oculto" || e.fase === "presentacion") return e;
      const d = ev.id ? e.lista.find((x) => x.id === ev.id) ?? null : permisoActualMatriz(e);
      if (!d || !esAccionable(accionMatriz(d, e.estados[d.id], e.yaPedidos.includes(d.id)))) return e;
      const yaPedido = d.como === "aviso-y-panel" && accionMatriz(d, e.estados[d.id], false) === "pedir";
      return { ...e, esperando: d.id, yaPedidos: yaPedido && !e.yaPedidos.includes(d.id) ? [...e.yaPedidos, d.id] : e.yaPedidos };
    }
    case "resultado": {
      if (e.esperando !== ev.id) return e;
      const resultados = { ...e.resultados, [ev.id]: ev.r };
      const actual = permisoActualMatriz(e);
      if (actual && actual.id === ev.id) return avanzarMatriz(e, e.indice + 1, resultados);
      return { ...e, esperando: null, resultados };
    }
    case "estados": {
      const n = { ...e, estados: { ...e.estados, ...ev.estados } };
      return n.fase === "pidiendo" && !n.esperando ? avanzarMatriz(n, n.indice, n.resultados) : n;
    }
    case "omitir": {
      if (e.esperando) return e;
      const d = permisoActualMatriz(e);
      return d ? avanzarMatriz(e, e.indice + 1, { ...e.resultados, [d.id]: "omitido" }) : e;
    }
    case "omitir-todo": {
      if (e.fase === "oculto" || e.fase === "resumen" || e.esperando) return e;
      const resultados = { ...e.resultados };
      for (const d of e.cola.slice(e.indice)) if (!resultados[d.id]) resultados[d.id] = "omitido";
      return { ...e, indice: e.cola.length, resultados, fase: "resumen" };
    }
    case "cerrar":
      return e.esperando ? e : { ...e, fase: "oculto" };
  }
}

function guardadoTrasMatriz(g: GuardadoMatriz, e: EstadoMatriz): GuardadoMatriz {
  const vistos = new Set<IdPermiso>(g.vistos);
  const resultados = { ...g.resultados };
  for (const d of e.lista) {
    const r = e.resultados[d.id];
    if (r) {
      vistos.add(d.id);
      resultados[d.id] = r;
    }
  }
  const yaPedidos = Array.from(new Set([...g.yaPedidos, ...e.yaPedidos]));
  return { version: VERSION_MATRIZ, medio: e.medio, vistos: Array.from(vistos), resultados, yaPedidos };
}

function adaptarMatrizANativo(e: EstadoMatriz): EstadoAsistente {
  return {
    fase: e.fase,
    sistema: e.medio as EstadoAsistente["sistema"],
    lista: e.lista.map((d) => ({
      ...d,
      como: d.como === "selector" ? "por-uso" : d.como === "no-disponible" ? "nada" : d.como,
      lectura: d.lectura === "no-concedido" ? "no" : d.lectura,
    })) as DefPermiso[],
    cola: e.cola.map((d) => ({
      ...d,
      como: d.como === "selector" ? "por-uso" : d.como === "no-disponible" ? "nada" : d.como,
      lectura: d.lectura === "no-concedido" ? "no" : d.lectura,
    })) as DefPermiso[],
    indice: e.indice,
    esperando: e.esperando,
    resultados: e.resultados as EstadoAsistente["resultados"],
    estados: e.estados as EstadoAsistente["estados"],
    avisos: e.yaPedidos,
  };
}

function depsReales(): DepsEjecutor {
  const p = puenteNativo();
  const tauriNotif = () => (window as unknown as { __TAURI__?: { notification?: { requestPermission?: () => Promise<string>; isPermissionGranted?: () => Promise<boolean> } } }).__TAURI__?.notification;
  return {
    llamar: (c, a) => p.llamar(c, a),
    pedirMedio:
      typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
        ? async (tipo) => {
            try {
              const flujo = await navigator.mediaDevices.getUserMedia(tipo === "audio" ? { audio: true } : { video: true });
              flujo.getTracks().forEach((t) => t.stop());
              return "ok";
            } catch (e) {
              const n = (e as { name?: string } | null)?.name;
              return n === "NotFoundError" || n === "OverconstrainedError" ? "no-hay" : "denegado";
            }
          }
        : null,
    pedirNotificaciones: async () => {
      const f = tauriNotif()?.requestPermission;
      if (typeof f === "function") return f();
      return typeof Notification !== "undefined" ? Notification.requestPermission() : null;
    },
    notificacionesConcedidas: async () => {
      const f = tauriNotif()?.isPermissionGranted;
      if (typeof f === "function") return f();
      return typeof Notification !== "undefined" ? Notification.permission === "granted" : null;
    },
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    ahora: () => Date.now(),
  };
}

/* El reductor puro no sabe «abrir»: este contenedor lo añade (el estado inicial lo calcula `abrirAsistente`). */
type AccionNativa = Parameters<typeof reducirAsistente>[1] | { t: "abrir"; estado: EstadoAsistente };
type AccionMatrizTipo = { t: "abrir-matriz"; estado: EstadoMatriz } | { t: "estados-matriz"; estados: Partial<Record<IdPermiso, EstadoSistema>> } | { t: "pedir-matriz"; id?: IdPermiso } | { t: "resultado-matriz"; id: IdPermiso; r: "concedido" | "denegado" | "omitido" | "no-disponible" } | { t: "omitir-matriz" } | { t: "omitir-todo-matriz" } | { t: "cerrar-matriz" } | { t: "empezar-matriz" };
type Accion = AccionNativa | AccionMatrizTipo;

type EventoAsistenteNativo = Parameters<typeof reducirAsistente>[1];

function reductor(e: EstadoAsistente | EstadoMatriz, a: Accion): EstadoAsistente | EstadoMatriz {
  if ("medio" in e) {
    // EstadoMatriz
    if (a.t === "abrir-matriz") return a.estado;
    if (a.t === "estados-matriz") return reducirMatriz(e, { t: "estados", estados: a.estados });
    if (a.t === "pedir-matriz") return reducirMatriz(e, { t: "pedir", id: a.id });
    if (a.t === "resultado-matriz") return reducirMatriz(e, { t: "resultado", id: a.id, r: a.r });
    if (a.t === "omitir-matriz") return reducirMatriz(e, { t: "omitir" });
    if (a.t === "omitir-todo-matriz") return reducirMatriz(e, { t: "omitir-todo" });
    if (a.t === "cerrar-matriz") return reducirMatriz(e, { t: "cerrar" });
    if (a.t === "empezar-matriz") return reducirMatriz(e, { t: "empezar" });
    return e;
  }
  // EstadoAsistente (nativo) - solo procesar acciones nativas
  if (a.t === "abrir") return a.estado;
  if (a.t.startsWith("matriz")) return e; // ignorar acciones de matriz
  return reducirAsistente(e, a as EventoAsistenteNativo);
}

function esMatriz(e: EstadoAsistente | EstadoMatriz): e is EstadoMatriz {
  return "medio" in e;
}

function permisoActualUnificado(e: EstadoAsistente | EstadoMatriz): DefPermiso | DefMatriz | null {
  return esMatriz(e) ? permisoActualMatriz(e) : permisoActual(e);
}

function accionUnificada(e: EstadoAsistente | EstadoMatriz, d: DefPermiso | DefMatriz): AccionPermiso {
  if (esMatriz(e)) return accionMatriz(d as DefMatriz, e.estados[d.id], e.yaPedidos.includes(d.id));
  return accionEn(e, d as DefPermiso);
}

export function AsistentePermisos() {
  const [estado, enviar] = useReducer(reductor, ASISTENTE_OCULTO);
  const enCurso = useRef(false);
  const plataforma = useRef<{ plat: string; sesion: string | null } | null>(null);
  const medioRef = useRef<Medio | null>(null);
  const visible = estado.fase !== "oculto";
  // Turno: la lista solo se pinta cuando el primer plano está libre (ver el orden arriba).
  const [turno, setTurno] = useState(false);
  useEffect(() => {
    if (!visible) {
      setTurno(false);
      return;
    }
    return alLiberarsePrimerPlano(() => setTurno(true), { intervaloMs: 600 });
  }, [visible]);

  /** Lee el estado real y la plataforma/medio (un solo sitio). */
  const leer = useCallback(async () => {
    const esNativa = esAppNativa();
    let plat: string;
    let sesion: string | null = null;
    let estados: Partial<Record<IdPermiso, EstadoSistema>> = {};
    let medio: Medio;

    if (esNativa) {
      plat = plataforma.current?.plat ?? (await plataformaDeLaApp());
      const sistema = sistemaDeAsistente(plat, plataforma.current?.sesion);
      const l = await leerEstadosSistema(sistema, depsReales());
      sesion = l.sesion ?? plataforma.current?.sesion ?? null;
      estados = l.estados;
      plataforma.current = { plat, sesion };
      medio = (["macos", "android", "windows", "linux-x11", "linux-wayland"].includes(plat) ? plat : "web") as Medio;
    } else {
      medio = detectarMedio();
      medioRef.current = medio;
      // Para medios no nativos, leemos estados desde APIs web
      estados = await leerEstadosWeb(medio);
    }
    return { plat: medio, sesion, estados, medio, esNativa };
  }, []);

  async function leerEstadosWeb(medio: Medio): Promise<Partial<Record<IdPermiso, EstadoSistema>>> {
    const out: Partial<Record<IdPermiso, EstadoSistema>> = {};
    try {
      // Notificaciones
      if (typeof Notification !== "undefined") {
        out.notificaciones = Notification.permission === "granted" ? "concedido" : Notification.permission === "denied" ? "denegado" : "sin-preguntar";
      }
      // Permisos API
      if (typeof navigator !== "undefined" && navigator.permissions) {
        const perms = [
          { name: "microphone", id: "microfono" as IdPermiso },
          { name: "camera", id: "camara" as IdPermiso },
          { name: "geolocation", id: "ubicacion" as IdPermiso },
          { name: "notifications", id: "notificaciones" as IdPermiso },
          { name: "persistent-storage", id: "almacenamiento" as IdPermiso },
        ];
        for (const p of perms) {
          try {
            const status = await navigator.permissions.query({ name: p.name as PermissionName });
            out[p.id] = status.state === "granted" ? "concedido" : status.state === "denied" ? "denegado" : "sin-preguntar";
          } catch {
            /* no disponible en este navegador */
          }
        }
      }
      // Capacidades siempre disponibles
      out.capacidades = "concedido";
    } catch {
      /* ignorar errores de lectura */
    }
    return out;
  }

  // Arranque: defectos de antenas (una vez por versión) y, si toca, abrir la lista.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { plat, sesion, estados, medio, esNativa } = await leer();
      if (!vivo) return;

      if (esNativa) {
        const p = puenteNativo();
        await aplicarDefectosAntenas({
          esNativa: esAppNativa,
          leerAlmacen,
          escribirAlmacen,
          bluetoothActivo: async () => {
            const r = await p.llamar<{ activo?: unknown }>("ble_estado");
            return r.ok && r.valor && typeof r.valor.activo === "boolean" ? r.valor.activo : null;
          },
          leerConfig: async () => {
            const r = await p.llamar<{ faro_apagado?: boolean }>("antenas_config");
            return r.ok && r.valor ? r.valor : null;
          },
          escribirConfig: async (c) => (await p.llamar("antenas_configurar", { config: c })).ok,
        });
        const g = leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO));
        if (debeAbrirseSolo(plat, g, estados, sesion)) enviar({ t: "abrir", estado: abrirAsistente(plat, g, false, estados, sesion) });
      } else {
        const g = leerGuardadoMatriz(leerAlmacen(CLAVE_PERMISOS_MATRIZ));
        if (g.medio !== medio) {
          // Cambio de medio: resetear
          escribirAlmacen(CLAVE_PERMISOS_MATRIZ, serializarGuardadoMatriz({ ...GUARDADO_MATRIZ_VACIO, medio }));
        }
        if (debeAbrirseMatriz(medio, g, estados)) enviar({ t: "abrir-matriz", estado: abrirMatriz(medio, g, false, estados) });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [leer]);

  // Desde los ajustes de la neurona: la lista entera, con todo lo pedible aún sin conceder.
  useEffect(() => {
    const abrir = () => {
      void (async () => {
        const { plat, sesion, estados, medio, esNativa } = await leer();
        if (esNativa) {
          enviar({ t: "abrir", estado: abrirAsistente(plat, leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO)), true, estados, sesion) });
        } else {
          const g = leerGuardadoMatriz(leerAlmacen(CLAVE_PERMISOS_MATRIZ));
          enviar({ t: "abrir-matriz", estado: abrirMatriz(medio, g, true, estados) });
        }
      })();
    };
    window.addEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
  }, [leer]);

  // Al volver a la ventana (de Ajustes del Sistema, por ejemplo) se relee el estado real: la concesión se nota sola.
  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    const releer = () => {
      void leer().then((l) => {
        if (vivo) {
          if (l.esNativa) enviar({ t: "estados", estados: l.estados });
          else enviar({ t: "estados-matriz", estados: l.estados });
        }
      });
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") releer();
    };
    window.addEventListener("focus", releer);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.removeEventListener("focus", releer);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [visible, leer]);

  const pedir = useCallback(
    async (def: DefPermiso | DefMatriz, e: EstadoAsistente | EstadoMatriz) => {
      if (enCurso.current) return;
      enCurso.current = true;
      const accion = accionUnificada(e, def);
      const id = def.id;

      if (esMatriz(e)) {
        enviar({ t: "pedir-matriz", id });
        const r = await pedirPermisoWeb(id, accion);
        const l = await leer();
        enviar({ t: "estados-matriz", estados: l.estados });
        enviar({ t: "resultado-matriz", id, r });
      } else {
        if (!e.sistema) { enCurso.current = false; return; }
        enviar({ t: "pedir", id });
        const r = await pedirPermisoInicio(id, e.sistema, depsReales(), accion);
        const l = await leer();
        enviar({ t: "estados", estados: l.estados });
        enviar({ t: "resultado", id, r });
      }
      enCurso.current = false;
    },
    [leer],
  );

  async function pedirPermisoWeb(id: IdPermiso, accion: AccionPermiso): Promise<"concedido" | "denegado" | "omitido" | "no-disponible"> {
    if (accion === "abrir-ajustes" || accion === "por-uso") return "omitido"; // En web no hay ajustes de sistema que abrir; por-uso se pide al usarse

    try {
      switch (id) {
        case "notificaciones":
          if (typeof Notification !== "undefined") {
            const perm = await Notification.requestPermission();
            return perm === "granted" ? "concedido" : "denegado";
          }
          return "no-disponible";
        case "microfono":
        case "camara":
          if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia(id === "microfono" ? { audio: true } : { video: true });
              stream.getTracks().forEach((t) => t.stop());
              return "concedido";
            } catch (err) {
              const e = err as Error;
              return e.name === "NotAllowedError" ? "denegado" : "no-disponible";
            }
          }
          return "no-disponible";
        case "ubicacion":
        case "ubicacion-wifi":
          if (typeof navigator !== "undefined" && navigator.geolocation) {
            return new Promise((resolve) => {
              navigator.geolocation.getCurrentPosition(
                () => resolve("concedido"),
                (err) => resolve(err.code === err.PERMISSION_DENIED ? "denegado" : "no-disponible"),
                { timeout: 5000 },
              );
            });
          }
          return "no-disponible";
        case "pantalla":
          if (typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia) {
            try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
              stream.getTracks().forEach((t) => t.stop());
              return "concedido";
            } catch {
              return "denegado";
            }
          }
          return "no-disponible";
        case "bluetooth":
          if (typeof navigator !== "undefined" && (navigator as unknown as { bluetooth?: { requestDevice?: (options: unknown) => Promise<unknown> } }).bluetooth?.requestDevice) {
            try {
              await (navigator as unknown as { bluetooth: { requestDevice: (options: unknown) => Promise<unknown> } }).bluetooth.requestDevice({ filters: [{ services: ["battery_service"] }] });
              return "concedido";
            } catch {
              return "denegado";
            }
          }
          return "no-disponible";
        default:
          return "no-disponible";
      }
    } catch {
      return "omitido";
    }
  }

  const cerrar = () => {
    if (esMatriz(estado)) {
      const g = leerGuardadoMatriz(leerAlmacen(CLAVE_PERMISOS_MATRIZ));
      escribirAlmacen(CLAVE_PERMISOS_MATRIZ, serializarGuardadoMatriz(guardadoTrasMatriz(g, estado)));
      enviar({ t: "cerrar-matriz" });
    } else {
      const g = leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO));
      escribirAlmacen(CLAVE_PERMISOS_INICIO, serializarGuardadoPermisos(guardadoTras(g, estado)));
      enviar({ t: "cerrar" });
    }
  };

  const estadoRender = esMatriz(estado) ? adaptarMatrizANativo(estado) : estado;

  if (estadoRender.fase === "oculto" || !estadoRender.sistema || !turno) return null;
  return (
    <ListaPermisos
      estado={estadoRender}
      onEmpezar={() => enviar(esMatriz(estado) ? { t: "empezar-matriz" } : { t: "empezar" })}
      onOmitir={() => enviar(esMatriz(estado) ? { t: "omitir-matriz" } : { t: "omitir" })}
      onOmitirTodo={() => enviar(esMatriz(estado) ? { t: "omitir-todo-matriz" } : { t: "omitir-todo" })}
      onPedir={(d) => void pedir(d, estado)}
      onCerrar={cerrar}
    />
  );
}
