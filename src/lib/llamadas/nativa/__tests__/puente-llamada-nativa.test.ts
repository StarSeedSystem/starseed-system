import { describe, expect, it, vi } from "vitest";
import { crearPuente } from "@/lib/nativa/puente";
import { crearPuenteLlamadaNativa, enlazarMotores, type MotoresLlamada } from "../puente-llamada-nativa";
import { VISTA_INICIAL, vistaTrasEvento } from "../use-llamada-nativa";
import { SIN_CAPACIDADES, type VistaActiva, type VistaDirecta, type VistaTimbre } from "../mapeo-llamada-nativa";

function tauriFalso(respuestas: Record<string, unknown> = {}) {
  const llamadas: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
  const oyentes = new Map<string, (e: { payload: unknown }) => void>();
  const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    llamadas.push({ cmd, args });
    const r = respuestas[cmd];
    if (typeof r === "string" && r.startsWith("FALLA:")) throw r.slice(6);
    return r;
  });
  const listen = vi.fn(async (ev: string, cb: (e: { payload: unknown }) => void) => {
    oyentes.set(ev, cb);
    return () => oyentes.delete(ev);
  });
  return { tauri: { core: { invoke }, event: { listen } }, llamadas, oyentes };
}

describe("API tipada del puente", () => {
  it("en la web normal no hace nada y no inventa estado", async () => {
    const p = crearPuenteLlamadaNativa(crearPuente(null));
    expect(p.disponible).toBe(false);
    expect(await p.capacidades()).toBe(SIN_CAPACIDADES);
    expect(await p.iniciar({ id: "a", nombre: "x", tipo: "voz", entrante: true })).toBe(false);
    expect(await p.estado("a", "activa")).toBe(false);
    expect(await p.rutaAudio("altavoz")).toBe(false);
    expect(await p.proximidad(true)).toBe(false);
    expect(await p.permiso()).toBe(SIN_CAPACIDADES);
    const baja = await p.alEvento(() => undefined);
    expect(() => baja()).not.toThrow();
  });

  it("llama a cada comando de Rust con los argumentos que espera", async () => {
    const { tauri, llamadas } = tauriFalso({ llamada_nativa_capacidades: { nativa: true, plataforma: "android", rutas: ["auricular"], ruta: "auricular" } });
    const p = crearPuenteLlamadaNativa(crearPuente(tauri));
    expect((await p.capacidades()).nativa).toBe(true);
    expect(await p.iniciar({ id: "ll-1", nombre: "Ana", tipo: "video", entrante: false })).toBe(true);
    expect(await p.estado("ll-1", "activa", true)).toBe(true);
    expect(await p.estado("ll-1", "terminada")).toBe(true);
    expect(await p.rutaAudio("bluetooth")).toBe(true);
    expect(await p.proximidad(false)).toBe(true);
    expect(llamadas.map((l) => l.cmd)).toEqual([
      "llamada_nativa_capacidades",
      "llamada_nativa_iniciar",
      "llamada_nativa_estado",
      "llamada_nativa_estado",
      "llamada_nativa_ruta_audio",
      "llamada_nativa_proximidad",
    ]);
    expect(llamadas[1].args).toEqual({ id: "ll-1", nombre: "Ana", tipo: "video", entrante: false });
    expect(llamadas[2].args).toEqual({ id: "ll-1", estado: "activa", silenciada: true });
    expect(llamadas[3].args).toEqual({ id: "ll-1", estado: "terminada" });
    expect(llamadas[4].args).toEqual({ ruta: "bluetooth" });
    expect(llamadas[5].args).toEqual({ activa: false });
  });

  it("un fallo de Rust se queda en false, nunca lanza", async () => {
    const { tauri } = tauriFalso({ llamada_nativa_iniciar: "FALLA:Ya hay una llamada nativa en curso", llamada_nativa_capacidades: "FALLA:x" });
    const p = crearPuenteLlamadaNativa(crearPuente(tauri));
    expect(await p.iniciar({ id: "a", nombre: "x", tipo: "voz", entrante: true })).toBe(false);
    expect(await p.capacidades()).toBe(SIN_CAPACIDADES);
  });

  it("escucha los diez eventos, valida la carga y se da de baja", async () => {
    const { tauri, oyentes } = tauriFalso();
    const p = crearPuenteLlamadaNativa(crearPuente(tauri));
    const vistos: Array<[string, unknown]> = [];
    const baja = await p.alEvento((e, c) => vistos.push([e, c]));
    expect([...oyentes.keys()].sort()).toEqual(["contestar", "colgar", "espera", "ignorar", "mensaje", "proximidad", "rechazar", "ruta", "silenciar", "silencio"].sort().map((e) => `llamada-nativa://${e}`));
    oyentes.get("llamada-nativa://contestar")?.({ payload: { id: "ll-1", valor: null } });
    oyentes.get("llamada-nativa://silenciar")?.({ payload: { id: "ll-1", valor: true } });
    oyentes.get("llamada-nativa://colgar")?.({ payload: "basura" });
    oyentes.get("llamada-nativa://ruta")?.({ payload: { id: "", valor: "altavoz" } });
    expect(vistos).toEqual([
      ["contestar", { id: "ll-1", valor: null }],
      ["silenciar", { id: "ll-1", valor: true }],
    ]);
    baja();
    expect(oyentes.size).toBe(0);
  });
});

/* ── Enlace con los motores (falsos) ── */

function motoresFalsos() {
  const estado = {
    directa: { fase: "inactiva", id: null, nombre: "", video: false, micro: true, entrante: false } as VistaDirecta,
    activa: null as VistaActiva | null,
    timbres: [] as VistaTimbre[],
    micro: true,
  };
  const oyDirecta = new Set<() => void>();
  const oySistema = new Set<() => void>();
  const hechas: string[] = [];
  const motores: MotoresLlamada = {
    directa: {
      leer: () => estado.directa,
      suscribir: (cb) => (oyDirecta.add(cb), () => oyDirecta.delete(cb)),
      contestar: async () => void hechas.push("directa.contestar"),
      rechazar: () => void hechas.push("directa.rechazar"),
      colgar: () => void hechas.push("directa.colgar"),
      alternarMicro: () => void hechas.push("directa.silenciar"),
    },
    sistema: {
      leer: () => ({ activa: estado.activa, timbres: estado.timbres, micro: estado.micro }),
      suscribir: (cb) => (oySistema.add(cb), () => oySistema.delete(cb)),
      contestar: async (id) => void hechas.push(`sistema.contestar:${id}`),
      rechazar: async (id) => void hechas.push(`sistema.rechazar:${id}`),
      colgar: () => void hechas.push("sistema.colgar"),
      alternarMicro: async () => void hechas.push("sistema.silenciar"),
    },
  };
  const cambiaDirecta = (p: Partial<VistaDirecta>) => {
    estado.directa = { ...estado.directa, ...p };
    oyDirecta.forEach((f) => f());
  };
  const cambiaSistema = () => oySistema.forEach((f) => f());
  return { estado, motores, hechas, cambiaDirecta, cambiaSistema, oyDirecta, oySistema };
}

function puenteGrabador() {
  const registro: string[] = [];
  const p = {
    disponible: true,
    capacidades: async () => SIN_CAPACIDADES,
    iniciar: async (l: { id: string; nombre: string; tipo: string; entrante: boolean }) => (registro.push(`iniciar:${l.id}:${l.tipo}:${l.entrante ? "entrante" : "saliente"}`), true),
    estado: async (id: string, e: string, s?: boolean) => (registro.push(`estado:${id}:${e}${s ? ":silenciada" : ""}`), true),
    rutaAudio: async () => true,
    proximidad: async () => true,
    ignorar: async () => true,
    recientes: async () => [],
    permiso: async () => SIN_CAPACIDADES,
    alEvento: async () => () => undefined,
  };
  return { p, registro };
}

describe("enlace con los motores de llamada", () => {
  it("llamada directa: sale → conecta → cuelga", async () => {
    const m = motoresFalsos();
    const { p, registro } = puenteGrabador();
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    m.cambiaDirecta({ fase: "llamando", id: "ll-1", nombre: "Ana" });
    m.cambiaDirecta({ fase: "en-curso" });
    m.cambiaDirecta({ micro: false });
    m.cambiaDirecta({ fase: "terminada" });
    m.cambiaDirecta({ fase: "inactiva" });
    await enlace.esperar();
    expect(registro).toEqual(["iniciar:ll-1:voz:saliente", "estado:ll-1:activa", "estado:ll-1:activa:silenciada", "estado:ll-1:terminada"]);
  });

  it("llamada directa entrante: suena, se contesta, se cuelga", async () => {
    const m = motoresFalsos();
    const { p, registro } = puenteGrabador();
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    m.cambiaDirecta({ fase: "entrante", id: "ll-2", nombre: "Luz", video: true, entrante: true });
    m.cambiaDirecta({ fase: "en-curso" });
    m.cambiaDirecta({ fase: "terminada" });
    await enlace.esperar();
    expect(registro).toEqual(["iniciar:ll-2:video:entrante", "estado:ll-2:activa", "estado:ll-2:terminada"]);
  });

  it("timbre del sistema: suena, se acepta (llamada activa) y se cuelga", async () => {
    const m = motoresFalsos();
    const { p, registro } = puenteGrabador();
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    m.estado.timbres = [{ sesionId: "t1", tipo: "audio", nombre: "Equipo" }];
    m.cambiaSistema();
    m.estado.timbres = [];
    m.estado.activa = { sesionId: "t1", tipo: "audio", titulo: "Equipo", esCreador: false, fase: "conectando", micro: true };
    m.cambiaSistema();
    m.estado.activa = { ...m.estado.activa, fase: "terminada" };
    m.cambiaSistema();
    await enlace.esperar();
    expect(registro).toEqual(["iniciar:t1:voz:entrante", "estado:t1:activa", "estado:t1:terminada"]);
  });

  it("la llamada que ya hay al enlazar se cuenta enseguida", async () => {
    const m = motoresFalsos();
    m.estado.directa = { fase: "en-curso", id: "ll-9", nombre: "Ana", video: false, micro: true, entrante: false };
    const { p, registro } = puenteGrabador();
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    await enlace.esperar();
    expect(registro).toEqual(["iniciar:ll-9:voz:saliente", "estado:ll-9:activa"]);
  });

  it("los eventos del teléfono llegan a las acciones que ya tenía el motor", async () => {
    const m = motoresFalsos();
    const { p } = puenteGrabador();
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    m.cambiaDirecta({ fase: "entrante", id: "ll-3", nombre: "Ana", entrante: true });
    enlace.alEvento("contestar", { id: "ll-3", valor: null });
    enlace.alEvento("rechazar", { id: "ll-3", valor: null });
    enlace.alEvento("contestar", { id: "otra", valor: null });
    m.cambiaDirecta({ fase: "en-curso" });
    enlace.alEvento("silenciar", { id: "ll-3", valor: true });
    enlace.alEvento("silenciar", { id: "ll-3", valor: false });
    enlace.alEvento("colgar", { id: "ll-3", valor: null });
    enlace.alEvento("ruta", { id: "ll-3", valor: "altavoz" });
    await enlace.esperar();
    await Promise.resolve();
    expect(m.hechas).toEqual(["directa.contestar", "directa.rechazar", "directa.silenciar", "directa.colgar"]);
  });

  it("timbre y llamada del sistema: contestar, rechazar, silenciar y colgar", async () => {
    const m = motoresFalsos();
    const { p } = puenteGrabador();
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    m.estado.timbres = [{ sesionId: "t1", tipo: "audio", nombre: "Equipo" }];
    enlace.alEvento("contestar", { id: "t1", valor: null });
    enlace.alEvento("rechazar", { id: "t1", valor: null });
    m.estado.timbres = [];
    m.estado.activa = { sesionId: "s1", tipo: "audio", titulo: "Equipo", esCreador: true, fase: "en-curso", micro: true };
    enlace.alEvento("silenciar", { id: "s1", valor: true });
    enlace.alEvento("colgar", { id: "s1", valor: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(m.hechas).toEqual(["sistema.contestar:t1", "sistema.rechazar:t1", "sistema.silenciar", "sistema.colgar"]);
  });

  it("si el teléfono falla, la llamada de la web sigue y las órdenes siguientes se ejecutan", async () => {
    const m = motoresFalsos();
    const registro: string[] = [];
    const p = {
      ...puenteGrabador().p,
      iniciar: async () => {
        throw new Error("sin teléfono");
      },
      estado: async (id: string, e: string) => (registro.push(`${id}:${e}`), true),
    };
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    m.cambiaDirecta({ fase: "llamando", id: "ll-1" });
    m.cambiaDirecta({ fase: "en-curso" });
    await enlace.esperar();
    expect(registro).toEqual(["ll-1:activa"]);
  });

  it("al desconectar deja de escuchar a los motores", () => {
    const m = motoresFalsos();
    const { p } = puenteGrabador();
    const enlace = enlazarMotores({ puente: p, motores: m.motores });
    expect(m.oyDirecta.size).toBe(1);
    expect(m.oySistema.size).toBe(1);
    enlace.desconectar();
    expect(m.oyDirecta.size + m.oySistema.size).toBe(0);
  });
});

describe("lo que enseña el hook", () => {
  it("la ruta y la proximidad siguen a los eventos del teléfono", () => {
    let v = VISTA_INICIAL;
    v = vistaTrasEvento(v, "ruta", { id: "a", valor: "altavoz" });
    expect(v.ruta).toBe("altavoz");
    expect(v.capacidades.ruta).toBe("altavoz");
    v = vistaTrasEvento(v, "proximidad", { id: "a", valor: true });
    expect(v.proximidad).toBe(true);
  });
  it("valores raros y eventos que no son suyos no cambian nada", () => {
    expect(vistaTrasEvento(VISTA_INICIAL, "ruta", { id: "a", valor: "moto" })).toBe(VISTA_INICIAL);
    expect(vistaTrasEvento(VISTA_INICIAL, "proximidad", { id: "a", valor: "si" })).toBe(VISTA_INICIAL);
    expect(vistaTrasEvento(VISTA_INICIAL, "colgar", { id: "a", valor: null })).toBe(VISTA_INICIAL);
  });
});
