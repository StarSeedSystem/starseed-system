import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cargarMolecula, guardarMolecula, PREFIJO_MOLECULA, type AlmacenLocal } from "../almacen-moleculas";
import { esMoleculaValidaNucleo } from "../bloque-protomolecula";
import { controladorActivo, limpiarControladores } from "../controlador-activo";
import type { Molecula as MoleculaAntigua } from "../molecula-estado-tipos";
import { limpiarRegistro, obtenerAtomo } from "../registro-atomos";
import {
  abrirSesion, cerrarSesion, reiniciarSesiones, ESPERA_GUARDADO_MS,
  type DependenciasSesion, type SesionMolecula,
} from "../sesion-molecula";
import { TITULO_MOLECULA_NUEVA } from "../resolver-molecula";
import type { Molecula, Operacion } from "../tipos";

type Almacen = AlmacenLocal & { escrituras: number; roto: boolean };

function almacenMemoria(): Almacen {
  const datos = new Map<string, string>();
  const a: Almacen = {
    escrituras: 0,
    roto: false,
    getItem: (k) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k, v) => {
      if (a.roto) throw new Error("almacenamiento lleno");
      if (k.startsWith(PREFIJO_MOLECULA)) a.escrituras++;
      datos.set(k, v);
    },
    removeItem: (k) => void datos.delete(k),
  };
  return a;
}

/** Reloj manual: `avanzar()` dispara lo programado y no cancelado. */
function relojManual() {
  const cola: Array<{ f: () => void; vivo: boolean }> = [];
  return {
    programar: (f: () => void) => { const e = { f, vivo: true }; cola.push(e); return () => { e.vivo = false; }; },
    avanzar: () => { for (const e of cola.splice(0)) if (e.vivo) e.f(); },
    vivos: () => cola.filter((e) => e.vivo).length,
  };
}

function deps(almacen: AlmacenLocal | null, extra: Partial<DependenciasSesion> = {}): DependenciasSesion {
  let n = 0;
  let t = 1000;
  return { almacen, ahora: () => ++t, nuevoId: () => `id-${++n}`, ...extra };
}

const capa = { id: "c1", tipo: "lienzo2d" as const, titulo: "Base", formato: "svg", referencia: null, orden: 1, visible: true, bloqueada: false };
function moleculaNucleo(par: Partial<Molecula> = {}): Molecula {
  return {
    id: "m1", titulo: "Mía", ambito: "personal", capas: [capa],
    atomos: [{ id: "a1", herramientaId: "sintetizador-web-audio", capaId: "c1", estado: "activo" }],
    valores: { "a1::volumen": -6 }, version: 1, creadaEn: 1000, actualizadaEn: 2000, ...par,
  };
}
const antigua = (par: Partial<MoleculaAntigua> = {}): MoleculaAntigua => ({
  id: "vieja", titulo: "Antigua", ambito: "personal", capas: [{ id: "c", nombre: "Base" }],
  atomos: [{ id: "a", capaId: "c", tipo: "imagen" }], valores: {}, version: 1, creadaEn: 1, actualizadaEn: 9999, ...par,
});

const AUTOR = { tipo: "persona", id: "u1" } as const;
const poner = (atomoId: string, valor: number, id = "op"): Operacion => ({ id, objetivo: { atomoId, parametroId: "volumen" }, accion: { tipo: "exacta", valor }, autor: AUTOR, origen: "mano", t: 1 });
const abierta = (id: string | undefined, d: DependenciasSesion): SesionMolecula => {
  const r = abrirSesion(id, d);
  if (!r.ok) throw new Error(r.motivo);
  return r.sesion;
};

beforeEach(() => { limpiarRegistro(); limpiarControladores(); reiniciarSesiones(); });
afterEach(() => { reiniciarSesiones(); vi.useRealTimers(); });

describe("sesion-molecula · abrir", () => {
  it("sin id y con el almacén vacío crea «Mi primera molécula», registra su controlador y los átomos propios", () => {
    const s = abierta(undefined, deps(almacenMemoria()));
    const m = s.controlador.obtener().molecula;
    expect(m.titulo).toBe(TITULO_MOLECULA_NUEVA);
    expect(esMoleculaValidaNucleo(m)).toBe(true);
    expect(controladorActivo(s.id)).toBe(s.controlador);
    expect(controladorActivo()).toBe(s.controlador);
    expect(obtenerAtomo("sintetizador-web-audio")).toBeDefined();
    expect(s.guardado()).toEqual({ estado: "sin-cambios" });
  });

  it("dos aperturas comparten la sesión y solo la última en cerrar desregistra el controlador", () => {
    const d = deps(almacenMemoria());
    const a = abierta(undefined, d);
    const b = abierta(undefined, d);
    const c = abierta(a.id, d);
    expect(b).toBe(a);
    expect(c).toBe(a);
    cerrarSesion(a.id);
    cerrarSesion(a.id);
    expect(controladorActivo(a.id)).toBe(a.controlador);
    cerrarSesion(a.id);
    expect(controladorActivo(a.id)).toBeNull();
    expect(controladorActivo()).toBeNull();
  });

  it("por id carga lo guardado con sus valores", () => {
    const al = almacenMemoria();
    guardarMolecula(al, moleculaNucleo());
    const s = abierta("m1", deps(al));
    expect(s.controlador.obtener().molecula).toEqual(moleculaNucleo());
  });

  it("un id que no existe, el formato antiguo y la falta de almacén dan un motivo, no una molécula inventada", () => {
    const al = almacenMemoria();
    guardarMolecula(al, antigua());
    const ausente = abrirSesion("nada", deps(al));
    expect(ausente.ok).toBe(false);
    expect(!ausente.ok && ausente.motivo).toContain("«nada»");
    const vieja = abrirSesion("vieja", deps(al));
    expect(!vieja.ok && vieja.motivo).toContain("formato antiguo");
    const sin = abrirSesion("m1", deps(null));
    expect(!sin.ok && sin.motivo).toContain("no deja leer");
    expect(controladorActivo()).toBeNull();
  });

  it("sin id elige la más reciente en formato del núcleo y salta la antigua aunque sea más nueva", () => {
    const al = almacenMemoria();
    guardarMolecula(al, moleculaNucleo({ id: "nucleo-viejo", actualizadaEn: 10 }));
    guardarMolecula(al, moleculaNucleo({ id: "nucleo-nuevo", actualizadaEn: 500 }));
    guardarMolecula(al, antigua({ actualizadaEn: 99999 }));
    expect(abierta(undefined, deps(al)).id).toBe("nucleo-nuevo");
  });
});

describe("sesion-molecula · guardado", () => {
  it("un cambio se guarda a los 400 ms (no antes) y vuelve a cargarse idéntico", () => {
    vi.useFakeTimers();
    const al = almacenMemoria();
    const s = abierta(undefined, deps(al));
    const r = s.controlador.anadirAtomo("sintetizador-web-audio");
    expect(r.ok).toBe(true);
    expect(s.guardado()).toEqual({ estado: "guardando" });
    vi.advanceTimersByTime(ESPERA_GUARDADO_MS - 1);
    expect(al.escrituras).toBe(0);
    vi.advanceTimersByTime(1);
    expect(al.escrituras).toBe(1);
    expect(s.guardado()).toEqual({ estado: "guardado" });
    const guardada = cargarMolecula(al, s.id);
    expect(guardada).toEqual(s.controlador.obtener().molecula);
    expect(esMoleculaValidaNucleo(guardada)).toBe(true);
  });

  it("no escribe mientras no cambie nada ni cuando solo cambian los pendientes", () => {
    const al = almacenMemoria();
    const reloj = relojManual();
    guardarMolecula(al, moleculaNucleo({ id: "g", ambito: "grupo" }));
    al.escrituras = 0;
    const s = abierta("g", deps(al, { programar: reloj.programar }));
    expect(reloj.vivos()).toBe(0);
    const r = s.controlador.anadirAtomo("sintetizador-web-audio", "Otro", "agente"); // en grupo: queda pendiente
    expect(r.ok).toBe(false);
    expect(s.controlador.obtener().pendientes).toHaveLength(1);
    expect(reloj.vivos()).toBe(0);
    reloj.avanzar();
    expect(al.escrituras).toBe(0);
    expect(s.guardado()).toEqual({ estado: "sin-cambios" });
  });

  it("varios cambios seguidos son una sola escritura con el último valor", () => {
    const al = almacenMemoria();
    const reloj = relojManual();
    const s = abierta(undefined, deps(al, { programar: reloj.programar }));
    const a = s.controlador.anadirAtomo("sintetizador-web-audio");
    if (!a.ok) throw new Error(a.motivo);
    s.controlador.mover(poner(a.atomo.id, -3, "o1"));
    s.controlador.mover(poner(a.atomo.id, -2, "o2"));
    expect(reloj.vivos()).toBe(1); // cada cambio reinicia la espera
    reloj.avanzar();
    expect(al.escrituras).toBe(1);
    expect(cargarMolecula(al, s.id)?.valores).toEqual({ [`${a.atomo.id}::volumen`]: -2 });
  });

  it("cerrar la última vista con un guardado esperando lo escribe en el acto", () => {
    const al = almacenMemoria();
    const reloj = relojManual();
    const s = abierta(undefined, deps(al, { programar: reloj.programar }));
    s.controlador.anadirAtomo("sintetizador-web-audio");
    expect(al.escrituras).toBe(0);
    cerrarSesion(s.id);
    expect(al.escrituras).toBe(1);
    expect(cargarMolecula(al, s.id)).not.toBeNull();
    reloj.avanzar(); // lo programado quedó cancelado: no se escribe dos veces
    expect(al.escrituras).toBe(1);
  });

  it("volcar escribe ya, sin esperar el turno", () => {
    const al = almacenMemoria();
    const s = abierta(undefined, deps(al, { programar: relojManual().programar }));
    s.controlador.anadirAtomo("sintetizador-web-audio");
    s.volcar();
    expect(s.guardado()).toEqual({ estado: "guardado" });
  });

  it("un fallo del almacén se dice con su motivo y el siguiente cambio vuelve a intentarlo", () => {
    const al = almacenMemoria();
    const reloj = relojManual();
    const s = abierta(undefined, deps(al, { programar: reloj.programar }));
    al.roto = true;
    s.controlador.anadirAtomo("sintetizador-web-audio");
    reloj.avanzar();
    const g = s.guardado();
    expect(g.estado).toBe("error");
    expect(g.estado === "error" && g.motivo).toContain("no dejó escribir");
    al.roto = false;
    s.controlador.anadirAtomo("sintetizador-web-audio", "Segundo");
    reloj.avanzar();
    expect(s.guardado()).toEqual({ estado: "guardado" });
    expect(cargarMolecula(al, s.id)).toEqual(s.controlador.obtener().molecula);
  });

  it("sin almacén (navegador que no deja guardar) el cambio se aplica pero el guardado dice error", () => {
    const reloj = relojManual();
    const s = abierta(undefined, deps(null, { programar: reloj.programar }));
    expect(s.controlador.anadirAtomo("sintetizador-web-audio").ok).toBe(true);
    reloj.avanzar();
    const g = s.guardado();
    expect(g.estado === "error" && g.motivo).toContain("no deja guardar");
  });

  it("una molécula que ya no cabe en 256 KB da error con ese motivo y no se pierde lo anterior", () => {
    const al = almacenMemoria();
    const reloj = relojManual();
    const base = moleculaNucleo({ id: "grande" });
    const hueco = 262_144 - JSON.stringify(base).length - 20;
    guardarMolecula(al, { ...base, titulo: "x".repeat(hueco) });
    const s = abierta("grande", deps(al, { programar: reloj.programar }));
    s.controlador.anadirAtomo("sintetizador-web-audio");
    reloj.avanzar();
    const g = s.guardado();
    expect(g.estado === "error" && g.motivo).toContain("256 KB");
    expect(cargarMolecula(al, "grande")?.atomos).toHaveLength(1);
  });

  it("avisa a quien escucha el guardado en cada cambio de estado", () => {
    const reloj = relojManual();
    const s = abierta(undefined, deps(almacenMemoria(), { programar: reloj.programar }));
    const vistos: string[] = [];
    const baja = s.suscribirGuardado(() => vistos.push(s.guardado().estado));
    s.controlador.anadirAtomo("sintetizador-web-audio");
    reloj.avanzar();
    baja();
    s.controlador.anadirAtomo("sintetizador-web-audio", "Otro");
    expect(vistos).toEqual(["guardando", "guardado"]);
  });
});

describe("sesion-molecula · el controlador de la sesión", () => {
  it("mover, deshacer y rehacer pasan por el mismo controlador que ven Aurora y los bots", () => {
    const s = abierta(undefined, deps(almacenMemoria(), { programar: relojManual().programar }));
    const c = controladorActivo(s.id)!;
    const a = c.anadirAtomo("sintetizador-web-audio");
    if (!a.ok) throw new Error(a.motivo);
    expect(c.mover(poner(a.atomo.id, -3, "o1")).ok).toBe(true);
    expect(c.obtener().molecula.valores[`${a.atomo.id}::volumen`]).toBe(-3);
    expect(c.deshacer(AUTOR.id).ok).toBe(true);
    expect(c.obtener().molecula.valores[`${a.atomo.id}::volumen`]).toBe(-12);
    expect(c.rehacer(AUTOR.id).ok).toBe(true);
    expect(c.obtener().molecula.valores[`${a.atomo.id}::volumen`]).toBe(-3);
  });
});
