/**
 * Pruebas del kit StarSeed Link: config, cuenta, manifiesto, conversiones, estaciones de punta a
 * punta sobre un Supabase en memoria, transporte, presencia y puente con el OS.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { config, configSincrona, proyectoValido, CLAVE_CONFIG } from "../src/config";
import { correoDeIdentificador, entrar, motivoDeError } from "../src/cuenta";
import { validarManifiesto } from "../src/manifiesto";
import {
  entonacionDesdeOsciladores,
  osciladoresDesdeEntonacion,
  parametrosDesdeVisual,
  visualDesdeParametros,
  sanearVisual,
  type EntonacionParam,
} from "../src/modelo";
import { directorio, publicar, retomar, seguir, CLAVE_LLAVES } from "../src/estacion";
import { crearTransporte, temaCuenta } from "../src/transporte";
import { presencia, describirMedioApp, tokenValido } from "../src/presencia";
import { PuenteOS } from "../src/puente-os";
import { almacenEnMemoria, BusRealtime, clienteFalso, esperarA } from "./falsos";

// Una clave de EJEMPLO con forma de JWT, montada en tiempo de ejecución (nunca una real).
const ANON = ["ey", "J", "hbGciOiJIUzI1NiJ9.", "x".repeat(30)].join("");
const ACTIVO = "https://jhgvhkypqadfdkkqoxta.supabase.co";
const RETIRADO = "https://pqzdpmedcsgcedkvndzl.supabase.co";

describe("config()", () => {
  it("usa lo que dice el OS y lo guarda", async () => {
    const almacen = almacenEnMemoria();
    const f = vi.fn(async () => new Response(JSON.stringify({ v: 1, supabase: { url: ACTIVO, anonKey: ANON }, servicios: { login: "https://starseed-os.vercel.app/login" } }), { status: 200 }));
    const c = await config({ fetch: f as unknown as typeof fetch, almacen });
    expect(c.origen).toBe("os");
    expect(c.supabase?.url).toBe(ACTIVO);
    expect(f).toHaveBeenCalledWith("https://starseed-os.vercel.app/api/vinculo/config", expect.anything());
    expect(JSON.parse(almacen.getItem(CLAVE_CONFIG)!).url).toBe(ACTIVO);
  });

  it("si el OS no contesta: guardada → entorno → respaldo, y nunca un proyecto retirado", async () => {
    const caido = (async () => {
      throw new Error("sin red");
    }) as unknown as typeof fetch;
    expect((await config({ fetch: caido, almacen: almacenEnMemoria(), entorno: { url: RETIRADO, anonKey: ANON } })).origen).toBe("ninguno");
    expect((await config({ fetch: caido, almacen: almacenEnMemoria(), entorno: { url: RETIRADO, anonKey: ANON }, respaldo: { url: ACTIVO, anonKey: ANON } })).origen).toBe("respaldo");
    expect((await config({ fetch: caido, almacen: almacenEnMemoria(), entorno: { url: ACTIVO, anonKey: ANON } })).origen).toBe("entorno");
    const a = almacenEnMemoria();
    a.setItem(CLAVE_CONFIG, JSON.stringify({ url: RETIRADO, anonKey: ANON }));
    expect(configSincrona({ almacen: a, respaldo: { url: ACTIVO, anonKey: ANON } }).origen).toBe("respaldo");
  });

  it("una respuesta del OS con un proyecto retirado o mal formado no se acepta", async () => {
    const f = (async () => new Response(JSON.stringify({ supabase: { url: RETIRADO, anonKey: ANON } }))) as unknown as typeof fetch;
    const c = await config({ fetch: f, almacen: almacenEnMemoria(), respaldo: { url: ACTIVO, anonKey: ANON } });
    expect(c.origen).toBe("respaldo");
    expect(proyectoValido({ url: "https://evil.example.com", anonKey: ANON })).toBeNull();
    expect(proyectoValido({ url: ACTIVO, anonKey: "service_role" })).toBeNull();
  });
});

describe("entrar()", () => {
  it("correo o @usuario", () => {
    expect(correoDeIdentificador("Alex")).toBe("alex@star.seed");
    expect(correoDeIdentificador("@alex")).toBe("alex@star.seed");
    expect(correoDeIdentificador("a@b.co")).toBe("a@b.co");
    expect(correoDeIdentificador("alex", "alexbg")).toBe("alexbg@star.seed");
  });

  it("entra con la contraseña buena y explica la mala", async () => {
    const { cliente } = clienteFalso({ usuario: { id: "u1" }, respuestas: { os_profiles: { handle: "alex" } } });
    const ok = await entrar(cliente, { identificador: "alex", contrasena: "buena" });
    expect(ok.ok && ok.usuario.email).toBe("alex@star.seed");
    const mal = await entrar(cliente, { identificador: "a@b.co", contrasena: "mala" });
    expect(!mal.ok && mal.motivo).toMatch(/Credenciales inválidas/);
    expect(motivoDeError("exceed_egress_quota")).toMatch(/restringida/);
  });
});

describe("manifiestos", () => {
  for (const app of ["omnifrecuencias", "audiomorphic"]) {
    it(`el de ${app} es válido`, () => {
      const m = JSON.parse(readFileSync(path.join(__dirname, "..", "apps", `${app}.manifest.json`), "utf8"));
      const r = validarManifiesto(m);
      expect(r.ok ? [] : r.errores).toEqual([]);
    });
  }
  it("dice todo lo que falla, también una clave metida por error", () => {
    const r = validarManifiesto({ v: 1, id: "X", nombre: "a", web: "http://x", capas: ["magia"], formatos: [], extra: ANON });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.length).toBeGreaterThan(5);
      expect(r.errores.join(" ")).toMatch(/forma de clave/);
    }
  });
});

describe("conversiones app ↔ estación", () => {
  it("osciladores de Omnifrecuencias ida y vuelta (con transición)", () => {
    const oscs = [
      { id: "a", frequency: 432, type: "sine" as const, volume: 0.5, panX: -1, panY: 0, panZ: 0, name: "Base" },
      { id: "b", frequency: 528, type: "triangle" as const, volume: 0.4, panX: 1, panY: 0.2, panZ: 0, type2: "sine" as const, typeMix: 0.3,
        transition: { enabled: true, start: { frequency: 528, volume: 0.4, panX: 1, panY: 0, panZ: 0, type: "sine" as const }, end: { frequency: 639, volume: 0.2, panX: -1, panY: 0, panZ: 0, type: "sine" as const }, duration: 8, loopCount: "infinite" as const } },
    ];
    const e = entonacionDesdeOsciladores(oscs, 0.8) as EntonacionParam;
    expect(e.osciladores).toHaveLength(2);
    const vuelta = osciladoresDesdeEntonacion(e, () => ({ isPlaying: true, color: "#38bdf8" }));
    expect(vuelta[1]).toMatchObject({ id: "b", frequency: 528, type: "triangle", typeMix: 0.3, color: "#38bdf8", transition: { duration: 8, loopCount: "infinite" } });
    expect(entonacionDesdeOsciladores(vuelta as never, 0.8)).toEqual(e);
  });

  it("parámetros visuales: las listas viajan como «__lista» y vuelven como listas", () => {
    const base = { k: 1.01, autoPilot: true, mode: "fractal", spiralResonanceModes: ["goldenSpiral", "flowerOfLife"], nested: { a: 1 } };
    const v = visualDesdeParametros(base);
    expect(v).toEqual({ k: 1.01, autoPilot: true, mode: "fractal", spiralResonanceModes__lista: "goldenSpiral,flowerOfLife" });
    expect(sanearVisual(v)).toEqual(v); // el OS lo acepta tal cual
    const r = parametrosDesdeVisual({ ...v, k: 1.2, spiralResonanceModes__lista: "torus" }, base);
    expect(r).toMatchObject({ k: 1.2, spiralResonanceModes: ["torus"], nested: { a: 1 } });
    // Un tipo distinto al de la app no pisa su campo.
    expect(parametrosDesdeVisual({ k: "mucho" }, base).k).toBe(1.01);
  });
});

const PARAMS = { tipo: "omnifrecuencias" as const, entonacion: { volumen: 0.7, osciladores: [{ id: "a", f: 432, onda: "sine" as const, vol: 0.5, x: 0, y: 0, z: 0 }] } };

describe("estación de punta a punta (Supabase en memoria)", () => {
  it("pública: publica en el directorio del OS, otra app la sigue con el mismo enlace y suena a la vez", async () => {
    const bus = new BusRealtime();
    const a = clienteFalso({ bus, usuario: { id: "u1" }, filaInsertada: "fila-9" });
    const b = clienteFalso({ bus, usuario: null });
    const r = await publicar(
      { fuente: "omnifrecuencias", titulo: "Coherencia 432", enlace: "https://omnifrecuencias.vercel.app/", params: PARAMS, privada: false, categorias: ["sueño"] },
      { app: "omnifrecuencias", cliente: a.cliente, puente: null, almacen: almacenEnMemoria(), locales: false },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const host = r.estacion;
    expect(host.modo).toBe("propia");
    expect(host.directorio).toBe("publicada");
    expect(host.enlace.startsWith(`https://starseed-os.vercel.app/estaciones/vivo/${host.id}?f=`)).toBe(true);
    const ins = a.operaciones.find((o) => o.tabla === "os_estaciones" && o.tipo === "insert")!;
    expect(ins.datos).toMatchObject({ owner_id: "u1", fuente: "starseed", formato: "interno", tipo: "audio", visibilidad: "publica", categorias: ["omnifrecuencias", "en-vivo", "sueño"] });
    expect(String((ins.datos as { enlace: string }).enlace).startsWith(`/estaciones/vivo/${host.id}?f=`)).toBe(true);

    const s = await seguir(host.enlace, { app: "omnifrecuencias", cliente: b.cliente, puente: null, almacen: almacenEnMemoria(), locales: false });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const oyente = s.estacion;
    try {
      expect(oyente.foto()?.control).toBe(false);
      await esperarA(() => oyente.foto()?.reloj.modo === "sincronizado", 6000);
      expect((await host.accion("iniciar", { enMs: 100 })).ok).toBe(true);
      await esperarA(() => oyente.foto()?.fase === "sonando", 4000);
      expect(oyente.foto()?.ancla).toBe(host.foto()?.ancla);
      expect(Math.abs(oyente.ahoraComun() - host.ahoraComun())).toBeLessThan(3);
      expect(bus.enviados.every((m) => m.tema === `estacion-vivo:${host.id}`)).toBe(true);
      expect((await oyente.accion("pausar")).ok).toBe(false);
    } finally {
      oyente.cerrar();
      host.cerrar();
    }
  });

  it("quien se suscribe recibe la foto «sonando» en el instante común, sin tener que preguntar", async () => {
    const bus = new BusRealtime();
    const r = await publicar(
      { fuente: "omnifrecuencias", titulo: "Instante", enlace: "https://omnifrecuencias.vercel.app/", params: PARAMS, privada: true },
      { app: "omnifrecuencias", cliente: clienteFalso({ bus, usuario: { id: "u1" } }).cliente, puente: null, almacen: almacenEnMemoria(), locales: false },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = await seguir(r.estacion.enlace, { app: "omnifrecuencias", cliente: clienteFalso({ bus }).cliente, puente: null, almacen: almacenEnMemoria(), locales: false });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const vistas: { host: string[]; oyente: string[] } = { host: [], oyente: [] };
    const b1 = r.estacion.suscribir((f) => f && vistas.host.push(f.fase));
    const b2 = s.estacion.suscribir((f) => f && vistas.oyente.push(f.fase));
    try {
      await esperarA(() => s.estacion.foto()?.reloj.modo === "sincronizado", 6000);
      expect((await r.estacion.accion("iniciar", { enMs: 150 })).ok).toBe(true);
      // Nadie llama a foto(): el aviso llega solo cuando el instante común pasa.
      await esperarA(() => vistas.host.includes("sonando") && vistas.oyente.includes("sonando"), 3000);
    } finally {
      b1();
      b2();
      s.estacion.cerrar();
      r.estacion.cerrar();
    }
  });

  it("privada: no sale en el directorio, viaja cifrada y sin el token no se entra", async () => {
    const bus = new BusRealtime();
    const a = clienteFalso({ bus, usuario: { id: "u1" } });
    const r = await publicar({ fuente: "omnifrecuencias", titulo: "Privada", enlace: "https://omnifrecuencias.vercel.app/", params: PARAMS, privada: true }, { app: "omnifrecuencias", cliente: a.cliente, puente: null, almacen: almacenEnMemoria(), locales: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estacion.directorio).toBe("privada");
    expect(a.operaciones.some((o) => o.tipo === "insert")).toBe(false);
    expect(r.estacion.enlace).toMatch(/#f=.+&k=/);
    const sinToken = await seguir(r.estacion.enlace.replace(/&k=[^&]+/, ""), { app: "omnifrecuencias", cliente: clienteFalso({ bus }).cliente, puente: null, locales: false });
    expect(sinToken.ok).toBe(false);
    const s = await seguir(r.estacion.enlace, { app: "omnifrecuencias", cliente: clienteFalso({ bus }).cliente, puente: null, almacen: almacenEnMemoria(), locales: false });
    expect(s.ok).toBe(true);
    if (s.ok) {
      await esperarA(() => s.estacion.foto()?.reloj.modo === "sincronizado", 6000);
      expect(bus.enviados.every((m) => m.tema.startsWith("estacion-p:") && !JSON.stringify(m.payload).includes('\\"d\\":'))).toBe(true);
      s.estacion.cerrar();
    }
    r.estacion.cerrar();
  });

  it("el enlace de control da el mando en otro aparato; y quien la creó la retoma tras recargar", async () => {
    const bus = new BusRealtime();
    const almacen = almacenEnMemoria();
    const r = await publicar({ fuente: "audiomorphic", titulo: "Espiral", enlace: "https://audiomorphic.vercel.app/", params: { tipo: "audiomorphic", visual: { k: 1.01 } }, privada: false }, { app: "audiomorphic", cliente: clienteFalso({ bus }).cliente, puente: null, almacen, locales: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estacion.directorio).toMatch(/entra con tu cuenta/);
    const otro = await seguir(r.estacion.enlaceControl!, { app: "audiomorphic", cliente: clienteFalso({ bus }).cliente, puente: null, almacen: almacenEnMemoria(), locales: false });
    expect(otro.ok && otro.estacion.foto()?.control).toBe(true);
    expect(JSON.parse(almacen.getItem(CLAVE_LLAVES)!)[r.estacion.id].referencia).toBe(true);
    r.estacion.cerrar();
    const de = await retomar(r.estacion.id, { app: "audiomorphic", cliente: clienteFalso({ bus }).cliente, almacen, locales: false });
    expect(de.ok && de.estacion.foto()?.control).toBe(true);
    if (de.ok) de.estacion.cerrar();
    if (otro.ok) otro.estacion.cerrar();
  });

  it("directorio(): estaciones en vivo de la app con enlace absoluto del OS", async () => {
    const reciente = new Date(Date.now() - 30_000).toISOString();
    const viejo = new Date(Date.now() - 3_600_000).toISOString();
    const { cliente, operaciones } = clienteFalso({
      respuestas: {
        os_estaciones: [
          { id: "1", titulo: "Viva", enlace: "/estaciones/vivo/abc?f=x", categorias: ["omnifrecuencias"], ultimo_latido: reciente },
          { id: "2", titulo: "Dormida", enlace: "/estaciones/vivo/def?f=y", categorias: ["omnifrecuencias"], ultimo_latido: viejo },
        ],
      },
    });
    const filas = await directorio(cliente, { app: "omnifrecuencias", soloEnDirecto: true });
    expect(filas.map((f) => f.titulo)).toEqual(["Viva"]);
    expect(filas[0].enlace).toBe("https://starseed-os.vercel.app/estaciones/vivo/abc?f=x");
    const sel = operaciones.find((o) => o.tabla === "os_estaciones")!;
    expect(sel.filtros).toContainEqual(["contains", "categorias", ["omnifrecuencias"]]);
  });
});

describe("transporte", () => {
  it("un mensaje llega una vez aunque viaje por dos caminos, con acuse", async () => {
    const bus = new BusRealtime();
    // Dos «BroadcastChannel» unidos entre sí.
    const par = () => {
      const a = { onmessage: null as ((ev: MessageEvent) => void) | null, postMessage: (d: unknown) => queueMicrotask(() => b.onmessage?.({ data: d } as MessageEvent)), close() {} };
      const b = { onmessage: null as ((ev: MessageEvent) => void) | null, postMessage: (d: unknown) => queueMicrotask(() => a.onmessage?.({ data: d } as MessageEvent)), close() {} };
      return [a, b] as const;
    };
    const [p1, p2] = par();
    const token = "ab".repeat(16);
    const t1 = await crearTransporte({ app: "omnifrecuencias", cliente: clienteFalso({ bus }).cliente, token, canalPestanas: p1 });
    const t2 = await crearTransporte({ app: "omnifrecuencias", cliente: clienteFalso({ bus }).cliente, token, canalPestanas: p2 });
    await new Promise((r) => setTimeout(r, 10));
    const recibidos: unknown[] = [];
    t2.alRecibir("presets", (m) => recibidos.push(m.cuerpo));
    const r = await t1.enviar("presets", { nombre: "432" }, { esperarAcuseMs: 50 });
    expect(r.ok).toBe(true);
    expect(r.caminos.sort()).toEqual(["cuenta", "pestanas"]);
    expect(r.acuses).toBeGreaterThanOrEqual(1);
    expect(recibidos).toEqual([{ nombre: "432" }]);
    expect(bus.enviados[0].tema).toBe(await temaCuenta("omnifrecuencias", token));
    expect(bus.enviados[0].tema.includes(token)).toBe(false);
    t1.cerrar();
    t2.cerrar();
  });

  it("sin ningún camino lo dice", async () => {
    const t = await crearTransporte({ app: "x", canalPestanas: null });
    const r = await t.enviar("c", 1, { esperarAcuseMs: 0 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/ningún camino/);
  });
});

describe("presencia()", () => {
  it("entra en el canal de neuronas de la cuenta y ve a los medios del OS", async () => {
    const bus = new BusRealtime();
    const token = "0123456789abcdef0123456789abcdef";
    const { cliente, operaciones } = clienteFalso({ bus, usuario: { id: "u1" }, respuestas: { user_settings: { canal: token }, neuron_devices: [] } });
    // Un medio del OS ya presente en la misma cuenta.
    const os = cliente.channel(`neur:${token}`, { config: { presence: { key: "m-os" } } });
    os.subscribe();
    await os.track({ n: "nrn-mac", m: "m-os", tipo: "navegador", etiqueta: "Chrome · localhost:9002", visible: true, desde: "", t: Date.now(), s: {} });
    const r = await presencia({ cliente, app: { id: "omnifrecuencias", nombre: "Omnifrecuencias" }, almacen: almacenEnMemoria() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(String(operaciones.find((o) => o.tabla === "user_settings")?.sel)).toBe('canal:prefs->>"starseed.neuronas.canal.v1"');
    await esperarA(() => r.presencia.medios().length === 2);
    const yo = r.presencia.medios().find((m) => m.m === r.presencia.medio)!;
    expect(yo.app?.id).toBe("omnifrecuencias");
    expect(yo.s.reticulum.disponible).toBe(false);
    expect(r.presencia.neurona).toBeNull();
    expect(r.presencia.aviso).toMatch(/abre StarSeed OS/);
    r.presencia.detener();
  });

  it("sin token de cuenta no inventa uno", async () => {
    const { cliente } = clienteFalso({ usuario: { id: "u1" }, respuestas: { user_settings: null } });
    const r = await presencia({ cliente, app: { id: "a", nombre: "A" } });
    expect(!r.ok && r.motivo).toMatch(/abre StarSeed OS una vez/);
  });

  it("describe el medio y valida el token", () => {
    expect(describirMedioApp({ id: "o", nombre: "Omni" }, { ua: "Mozilla/5.0 (Linux; Android 14) Chrome/140.0", nativa: true, instalada: false, host: "" })).toEqual({ tipo: "app-nativa", etiqueta: "Omni · app nativa · Android" });
    expect(describirMedioApp({ id: "o", nombre: "Omni" }, { ua: "Mozilla/5.0 (Macintosh) Chrome/140.0", nativa: false, instalada: true, host: "x" }).tipo).toBe("app-instalada");
    expect(tokenValido('"abcdef0123456789"')).toBe("abcdef0123456789");
    expect(tokenValido("nope")).toBeNull();
  });
});

describe("puenteOS()", () => {
  it("habla el protocolo v1 del OS: saludo, reloj, crear y estado; ignora otros orígenes", async () => {
    const OS = "https://starseed-os.vercel.app";
    const oyentes = new Set<(ev: MessageEvent) => void>();
    const ventana = { addEventListener: (_: string, f: (ev: MessageEvent) => void) => oyentes.add(f), removeEventListener: (_: string, f: (ev: MessageEvent) => void) => oyentes.delete(f) } as unknown as Window;
    const recibidos: Record<string, unknown>[] = [];
    const entregar = (data: unknown, origin = OS) => queueMicrotask(() => oyentes.forEach((f) => f({ source: padre, origin, data } as unknown as MessageEvent)));
    const padre = {
      postMessage(m: Record<string, unknown>) {
        recibidos.push(m);
        if (m.tipo === "hola") entregar({ ss: "estacion", v: 1, tipo: "bienvenida", capacidades: ["crear", "reloj"], estacion: null });
        if (m.tipo === "reloj-ping") entregar({ ss: "estacion", v: 1, tipo: "reloj-pong", id: m.id, t0: m.t0, t1: Date.now() + 5000, t2: Date.now() + 5000, comun: true });
        if (m.tipo === "crear") {
          entregar({ ss: "estacion", v: 1, tipo: "estado", estacion: { id: "x", fase: "esperando" } }, "https://malo.example");
          entregar({ ss: "estacion", v: 1, tipo: "creada", id: "abc", enlace: `${OS}/estaciones/vivo/abc`, enlaceControl: `${OS}/estaciones/vivo/abc#c=…`, directorio: "publicada" });
        }
      },
    } as unknown as Window;
    const p = new PuenteOS({ app: "audiomorphic", ventana, padre });
    expect(await p.conectar(500)).toBe(true);
    expect(p.capacidadesOS()).toEqual(["crear", "reloj"]);
    await esperarA(() => p.precisionMs() !== null);
    expect(Math.abs(p.ahoraComun() - (Date.now() + 5000))).toBeLessThan(50);
    const c = await p.crear({ titulo: "Espiral", enlace: "https://audiomorphic.vercel.app/", params: { tipo: "audiomorphic", visual: { k: 1 } }, privada: false });
    expect(c.directorio).toBe("publicada");
    expect(p.estadoActual()).toBeNull(); // el estado del origen malo se ignoró
    expect(recibidos.find((m) => m.tipo === "crear")).toMatchObject({ ss: "estacion", v: 1, params: { tipo: "audiomorphic" } });
    p.desconectar();
  });
});

describe("el kit compila en cualquier app", () => {
  it("también con TypeScript sin «strict» (Omnifrecuencias y Audiomorphic no lo usan)", async () => {
    const { execFileSync } = await import("node:child_process");
    const raiz = path.resolve(__dirname, "..");
    const tsc = path.resolve(raiz, "../../node_modules/typescript/bin/tsc");
    let salida = "";
    try {
      execFileSync(process.execPath, [tsc, "-p", path.join(raiz, "tsconfig.laxo.json")], { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      salida = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(salida).toBe("");
  }, 90_000);

  it("motivoDe() da el motivo de un fallo y null si salió bien", async () => {
    const { motivoDe } = await import("../src/index");
    expect(motivoDe({ ok: true })).toBeNull();
    expect(motivoDe({ ok: false, motivo: "Sin red." } as { ok: boolean })).toBe("Sin red.");
    expect(motivoDe({ ok: false } as { ok: boolean })).toBe("No se pudo.");
  });
});

describe("temporizadores de serie del navegador (2026-10-10)", () => {
  // En el navegador, `setTimeout`/`clearTimeout` llamados con un `this` que no sea el global lanzan
  // «Illegal invocation». Node no lo exige: medido en Omnifrecuencias (la estación se creaba y el
  // panel no arrancaba). Aquí se simulan los del navegador y se recorre publicar → seguir → acciones.
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const realInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  function estricto<F extends (...a: never[]) => unknown>(real: F): F {
    return function (this: unknown, ...args: Parameters<F>) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return (real as unknown as (...a: Parameters<F>) => unknown)(...args);
    } as unknown as F;
  }

  it("publicar, seguir, iniciar, pausar y terminar sin «Illegal invocation»", async () => {
    vi.stubGlobal("setTimeout", estricto(realSet));
    vi.stubGlobal("clearTimeout", estricto(realClear));
    vi.stubGlobal("setInterval", estricto(realInterval));
    vi.stubGlobal("clearInterval", estricto(realClearInterval));
    const errores: unknown[] = [];
    const alError = (e: unknown) => errores.push(e);
    process.on("uncaughtException", alError);
    process.on("unhandledRejection", alError);
    try {
      const bus = new BusRealtime();
      const a = clienteFalso({ bus, usuario: { id: "u1" }, filaInsertada: "fila-1" });
      const r = await publicar(
        { fuente: "omnifrecuencias", titulo: "Serie", enlace: "https://omnifrecuencias.vercel.app/", params: PARAMS, privada: false },
        { app: "omnifrecuencias", cliente: a.cliente, puente: null, almacen: almacenEnMemoria(), locales: false },
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const s = await seguir(r.estacion.enlace, { app: "omnifrecuencias", cliente: clienteFalso({ bus }).cliente, puente: null, almacen: almacenEnMemoria(), locales: false });
      expect(s.ok).toBe(true);
      if (!s.ok) return;
      await esperarA(() => s.estacion.foto()?.reloj.modo === "sincronizado", 6000);
      for (const [accion, fase] of [["iniciar", "sonando"], ["pausar", "pausada"], ["reanudar", "sonando"], ["terminar", "terminada"]] as const) {
        expect((await r.estacion.accion(accion, { enMs: 50 })).ok).toBe(true);
        await esperarA(() => s.estacion.foto()?.fase === fase, 4000);
      }
      s.estacion.cerrar();
      r.estacion.cerrar();
      await new Promise((h) => realSet(h, 50));
      expect(errores).toEqual([]);
    } finally {
      process.off("uncaughtException", alError);
      process.off("unhandledRejection", alError);
      vi.unstubAllGlobals();
    }
  }, 30_000);
});

describe("estado de una estación visual grande (Audiomorphic)", () => {
  it("con muchas acciones de parámetros visuales el estado cabe y lo leen el kit y el OS", async () => {
    const { aplicarAccion, serializarEstado, leerEstado, MAX_BYTES_ESTADO } = await import("../src/modelo");
    const os = await import("@/lib/estaciones/transmision-parametrica");
    const visual: Record<string, number | string | boolean> = {};
    for (let i = 0; i < 60; i++) visual[`clave${i}`] = i * 1.2345;
    const ficha = { v: 1 as const, id: "x".repeat(22), fuente: "audiomorphic" as const, titulo: "Espiral", enlace: "/estaciones", pk: "p".repeat(87), privada: false, params: { tipo: "audiomorphic" as const, visual }, creada: 1_791_600_000_000 };
    let estado = { ficha, linea: [] as never[], rev: 0 } as Parameters<typeof aplicarAccion>[0];
    estado = aplicarAccion(estado, { n: 1, t: ficha.creada + 10, tipo: "iniciar" });
    for (let i = 0; i < 80; i++) {
      estado = aplicarAccion(estado, { n: 10 + i, t: ficha.creada + 1000 * (i + 1), tipo: "parametros", params: { tipo: "audiomorphic", visual: { ...visual, clave0: i } } });
    }
    const json = serializarEstado(estado);
    expect(json.length).toBeLessThanOrEqual(MAX_BYTES_ESTADO);
    const kit = leerEstado(json);
    expect(kit).not.toBeNull();
    const delOS = os.leerEstado(json);
    expect(delOS).not.toBeNull();
    // Y la posición final es la misma: la última entonación visual manda.
    const t = ficha.creada + 100_000;
    expect(os.posicionEn(delOS!, t).params).toEqual(kit && (await import("../src/modelo")).posicionEn(kit, t).params);
    expect((os.posicionEn(delOS!, t).params as { visual: Record<string, number> }).visual.clave0).toBe(79);
  });
});
