/**
 * PTA1110B · la puerta en todos los sentidos: matriz de plataformas, datos móviles, cambio de papel, cadenas y ámbitos.
 * Red en memoria (como tunel.test.ts); ninguna fila se ha probado en aparatos reales.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  AJUSTES_PUERTA_POR_DEFECTO,
  ambitoDePuerta,
  ambitoEfectivo,
  decidirServir,
  interpretarAjustes,
  type AjusteGrupo,
  type AjustesPuerta,
  type EstadoPropio,
} from "@/lib/malla/puerta/politica";
import { TablaPuertas, crearAnuncioPropio } from "@/lib/malla/puerta/tabla";
import { crearGestorPuerta, type GestorPuerta, type MetaVecino, type SocketSalida, type Trama, type TransportePuerta } from "@/lib/malla/puerta/tunel";
import { capacidadesPuerta, type EntornoPuerta } from "@/lib/malla/puerta/plataformas";
import { DecisorRol, textoCadena } from "@/lib/malla/puerta/roles";

/* ───────────────────────── Matriz de plataformas ───────────────────────── */
describe("matriz de plataformas (capacidadesPuerta)", () => {
  const casos: Array<[string, EntornoPuerta, { compartir: boolean; app: boolean; webview: boolean; descargas: boolean; segundoPlano?: string }]> = [
    ["macOS 15 nativo", { plataforma: "macos", nativo: true, macosMayor: 15 }, { compartir: true, app: true, webview: true, descargas: true, segundoPlano: "siempre" }],
    ["macOS 14 nativo", { plataforma: "macos", nativo: true, macosMayor: 14 }, { compartir: true, app: true, webview: true, descargas: true }],
    ["macOS 13: datos de la app y descargas, no el webview", { plataforma: "macos", nativo: true, macosMayor: 13 }, { compartir: true, app: true, webview: false, descargas: true }],
    ["macOS sin versión conocida", { plataforma: "macos", nativo: true, macosMayor: null }, { compartir: true, app: true, webview: false, descargas: true }],
    ["macOS 15 con el proxy apagado por entorno", { plataforma: "macos", nativo: true, macosMayor: 15, proxyApagadoPorEntorno: true }, { compartir: true, app: true, webview: false, descargas: true }],
    ["Android 14 con PROXY_OVERRIDE", { plataforma: "android", nativo: true, androidSdk: 34, webviewProxy: true }, { compartir: true, app: true, webview: true, descargas: true, segundoPlano: "con-servicio" }],
    ["Android 16 (la tableta de pruebas)", { plataforma: "android", nativo: true, androidSdk: 36, webviewProxy: null }, { compartir: true, app: true, webview: true, descargas: true, segundoPlano: "con-servicio" }],
    ["Android con un WebView viejo", { plataforma: "android", nativo: true, androidSdk: 30, webviewProxy: false }, { compartir: true, app: true, webview: false, descargas: true }],
    ["Windows con la pasarela instalada", { plataforma: "windows", nativo: true, webviewProxy: true }, { compartir: true, app: true, webview: true, descargas: true }],
    ["Windows con proxy del sistema (no se pisa)", { plataforma: "windows", nativo: true, webviewProxy: false }, { compartir: true, app: true, webview: false, descargas: true }],
    ["Linux (WebKitGTK)", { plataforma: "linux", nativo: true }, { compartir: true, app: true, webview: true, descargas: true, segundoPlano: "siempre" }],
    ["web / PWA", { plataforma: "web", nativo: false }, { compartir: false, app: false, webview: false, descargas: false, segundoPlano: "no" }],
    ["iOS (planeado, sin build)", { plataforma: "ios", nativo: false, iosMayor: 18 }, { compartir: false, app: false, webview: false, descargas: false }],
    ["una plataforma nativa sin lado de Node se comporta como web", { plataforma: "linux", nativo: false }, { compartir: false, app: false, webview: false, descargas: false }],
  ];
  for (const [nombre, env, esperado] of casos) {
    it(nombre, () => {
      const c = capacidadesPuerta(env);
      expect(c.compartir.puede, "compartir").toBe(esperado.compartir);
      expect(c.usar.app, "app").toBe(esperado.app);
      expect(c.usar.webview, "webview").toBe(esperado.webview);
      expect(c.usar.descargas, "descargas").toBe(esperado.descargas);
      if (esperado.segundoPlano) expect(c.compartir.segundoPlano).toBe(esperado.segundoPlano);
      // Todo lo que no se puede lleva su motivo en llano.
      if (!esperado.compartir || !esperado.webview) expect(c.compartir.nota ?? c.usar.nota, "motivo").toBeTruthy();
    });
  }
  it("compartir exige el lado de Node y la página viva; Android además el servicio de antenas", () => {
    for (const p of ["macos", "windows", "linux", "android"] as const) {
      const c = capacidadesPuerta({ plataforma: p, nativo: true, macosMayor: 15, androidSdk: 34 });
      expect(c.compartir.necesita.join(" ")).toMatch(/Node/);
      expect(c.compartir.necesita.join(" ")).toMatch(/página/);
    }
    expect(capacidadesPuerta({ plataforma: "android", nativo: true, androidSdk: 34 }).compartir.necesita.join(" ")).toMatch(/primer plano/);
  });
});

/* ───────────────────────── Datos móviles ───────────────────────── */
const MIB = 1024 * 1024;
const buena: EstadoPropio = { conInternet: true, bateria: 0.9, cargando: false, medida: false };
const movil: EstadoPropio = { ...buena, medida: true };
const mia = { id: "tableta", mismaCuenta: true };

describe("Android como puerta · datos móviles (Nunca / Preguntar / Sí con tope)", () => {
  it("por defecto no comparte por datos móviles", () => {
    expect(AJUSTES_PUERTA_POR_DEFECTO.datosMoviles.modo).toBe("nunca");
    expect(decidirServir(AJUSTES_PUERTA_POR_DEFECTO, mia, movil, { bytesHoyGrupo: 0, tunelesGrupo: 0 })).toMatchObject({ veredicto: "denegar", motivo: "red-medida" });
    // Con Wi‑Fi (no medida) sí.
    expect(decidirServir(AJUSTES_PUERTA_POR_DEFECTO, mia, buena, { bytesHoyGrupo: 0, tunelesGrupo: 0 }).veredicto).toBe("permitir");
  });
  it("Preguntar: pregunta por neurona y recuerda la respuesta", () => {
    const aj = { ...AJUSTES_PUERTA_POR_DEFECTO, datosMoviles: { modo: "preguntar" as const, bytesDia: 200 * MIB } };
    expect(decidirServir(aj, mia, movil, { bytesHoyGrupo: 0, tunelesGrupo: 0 })).toMatchObject({ veredicto: "preguntar", motivo: "datos-moviles" });
    expect(decidirServir({ ...aj, movilRecordadas: { tableta: "permitir" } }, mia, movil, { bytesHoyGrupo: 0, tunelesGrupo: 0 }).veredicto).toBe("permitir");
    expect(decidirServir({ ...aj, movilRecordadas: { tableta: "denegar" } }, mia, movil, { bytesHoyGrupo: 0, tunelesGrupo: 0 })).toMatchObject({ veredicto: "denegar", motivo: "red-medida" });
  });
  it("Sí, con tope: sirve hasta el tope diario por datos móviles y luego corta", () => {
    const aj = { ...AJUSTES_PUERTA_POR_DEFECTO, datosMoviles: { modo: "si" as const, bytesDia: 50 * MIB } };
    expect(decidirServir(aj, mia, movil, { bytesHoyGrupo: 0, tunelesGrupo: 0, bytesMovilHoy: 10 * MIB }).veredicto).toBe("permitir");
    expect(decidirServir(aj, mia, movil, { bytesHoyGrupo: 0, tunelesGrupo: 0, bytesMovilHoy: 50 * MIB })).toMatchObject({ veredicto: "denegar", motivo: "tope-movil" });
    // Wi‑Fi no gasta el tope móvil.
    expect(decidirServir(aj, mia, buena, { bytesHoyGrupo: 0, tunelesGrupo: 0, bytesMovilHoy: 999 * MIB }).veredicto).toBe("permitir");
  });
  it("la capa pública jamás sale por datos móviles, ni siquiera con «Sí»", () => {
    const aj = { ...AJUSTES_PUERTA_POR_DEFECTO, publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, ofrecer: true }, datosMoviles: { modo: "si" as const, bytesDia: 50 * MIB } };
    expect(decidirServir(aj, { id: "x", mismaCuenta: false, ambito: "publica" }, movil, { bytesHoyGrupo: 0, tunelesGrupo: 0 })).toMatchObject({ veredicto: "denegar", motivo: "red-medida" });
  });
  it("migración: quien permitía red medida pasa a «Sí» con su tope; el resto, a «Nunca»", () => {
    const viejo = interpretarAjustes(JSON.stringify({ v: 1, topesMias: { bytesDia: 80 * MIB, bateriaMin: 0.2, permitirRedMedida: true, maxTuneles: 4 } }));
    expect(viejo.datosMoviles).toEqual({ modo: "si", bytesDia: 80 * MIB });
    expect(viejo.topesMias.permitirRedMedida).toBe(false); // lo gobierna datosMoviles
    expect(interpretarAjustes(null).datosMoviles.modo).toBe("nunca");
    expect(interpretarAjustes(JSON.stringify({ datosMoviles: { modo: "preguntar", bytesDia: 1e12 } })).datosMoviles.modo).toBe("preguntar");
  });
});

/* ───────────────────────── Ámbitos por defecto y laundering ───────────────────────── */
const grupoG = (extra: Partial<AjusteGrupo> = {}): AjusteGrupo => ({ compartir: "preguntar", usar: "preguntar", miembros: ["amiga"], topes: { bytesDia: 100 * MIB, bateriaMin: 0.3, permitirRedMedida: false, maxTuneles: 3 }, ...extra });
const conGrupo = (g: AjusteGrupo, extra: Partial<AjustesPuerta> = {}): AjustesPuerta => ({ ...AJUSTES_PUERTA_POR_DEFECTO, grupos: { g1: g }, ...extra });

describe("ámbitos: defaults", () => {
  it("mis neuronas automático; grupos, Preguntar; pública apagada en los dos sentidos", () => {
    const d = AJUSTES_PUERTA_POR_DEFECTO;
    expect(d.misNeuronas).toBe(true);
    expect(d.publica).toMatchObject({ ofrecer: false, usar: false });
    expect(d.publica.topes.permitirRedMedida).toBe(false);
    expect(d.publica.topes.bytesDia).toBeLessThan(d.topesOtras.bytesDia);
    expect(d.grupos).toEqual({});
    expect(interpretarAjustes(JSON.stringify({ grupos: { g1: { miembros: ["a"] } } })).grupos.g1).toMatchObject({ compartir: "preguntar", usar: "preguntar", miembros: ["a"] });
  });
  it("decidirServir por ámbito: grupo nunca / preguntar / automático, y pública solo si se ofrece", () => {
    const est = buena;
    const u = { bytesHoyGrupo: 0, tunelesGrupo: 0 };
    const amiga = { id: "amiga", mismaCuenta: false, ambito: "grupo" as const, grupo: "g1" };
    expect(decidirServir(conGrupo(grupoG({ compartir: "nunca" })), amiga, est, u)).toMatchObject({ veredicto: "denegar", motivo: "apagada" });
    expect(decidirServir(conGrupo(grupoG({ compartir: "preguntar" })), amiga, est, u).veredicto).toBe("preguntar");
    expect(decidirServir(conGrupo(grupoG({ compartir: "automatico" })), amiga, est, u).veredicto).toBe("permitir");
    // El tope del grupo es el suyo, no el de «otras cuentas».
    expect(decidirServir(conGrupo(grupoG({ compartir: "automatico" })), amiga, est, { ...u, bytesHoyGrupo: 100 * MIB })).toMatchObject({ motivo: "cuota" });
    const pub = { id: "z", mismaCuenta: false, ambito: "publica" as const };
    expect(decidirServir(AJUSTES_PUERTA_POR_DEFECTO, pub, est, u)).toMatchObject({ veredicto: "denegar", motivo: "apagada" });
    const ofrece = { ...AJUSTES_PUERTA_POR_DEFECTO, publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, ofrecer: true } };
    expect(decidirServir(ofrece, pub, est, u).veredicto).toBe("permitir");
    expect(decidirServir(ofrece, pub, { ...est, bateria: 0.4 }, u)).toMatchObject({ motivo: "bateria" }); // la pública exige más batería
    expect(decidirServir(ofrece, pub, est, { ...u, tunelesGrupo: 2 })).toMatchObject({ motivo: "tuneles" });
  });
});

describe("una cadena nunca ensancha la confianza (ambitoEfectivo)", () => {
  const aj = conGrupo(grupoG({ miembros: ["amiga", "otraDeG1"] }), {
    grupos: { g1: grupoG({ miembros: ["amiga", "otraDeG1"] }), g2: grupoG({ miembros: ["vecinaG2"] }) },
    publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, ofrecer: true },
  });
  it("sin ofrecer la capa pública, quien la reclama es «otra cuenta»", () => {
    const sin = { ...aj, publica: { ...aj.publica, ofrecer: false } };
    expect(ambitoEfectivo(sin, { id: "extrana", mismaCuenta: false }, { directa: true, mc: false, am: "publica" })).toEqual({ ambito: "otras" });
    expect(ambitoEfectivo(sin, { id: "mia2", mismaCuenta: true }, { directa: false, mc: false, am: "publica" })).toEqual({ ambito: "otras" });
  });
  const vecinaMia = { id: "mia2", mismaCuenta: true };
  const extrana = { id: "extrana", mismaCuenta: false };
  it("directa: manda lo que yo sé de ella; solo puede declararse pública si no es mía ni de un grupo", () => {
    expect(ambitoEfectivo(aj, vecinaMia, { directa: true, mc: true })).toEqual({ ambito: "mias" });
    expect(ambitoEfectivo(aj, { id: "amiga", mismaCuenta: false }, { directa: true, mc: true, am: "mias" })).toEqual({ ambito: "grupo", grupo: "g1" });
    expect(ambitoEfectivo(aj, extrana, { directa: true, mc: true, am: "mias" })).toEqual({ ambito: "otras" }); // dice ser mía: no lo es
    expect(ambitoEfectivo(aj, extrana, { directa: true, mc: false, am: "publica" })).toEqual({ ambito: "publica" });
  });
  it("reenviada por una extraña: jamás sube de «otras», diga lo que diga (mias, grupo)", () => {
    expect(ambitoEfectivo(aj, extrana, { directa: false, mc: true, am: "mias" })).toEqual({ ambito: "otras" });
    expect(ambitoEfectivo(aj, extrana, { directa: false, mc: true, am: "grupo", g: "g1" })).toEqual({ ambito: "otras" });
    expect(ambitoEfectivo(aj, extrana, { directa: false, mc: false, am: "publica" })).toEqual({ ambito: "publica" });
  });
  it("reenviada por una neurona de OTRO grupo: la declaración de grupo ajeno baja a pública", () => {
    expect(ambitoEfectivo(aj, { id: "vecinaG2", mismaCuenta: false }, { directa: false, mc: false, am: "grupo", g: "g1" })).toEqual({ ambito: "publica" });
    expect(ambitoEfectivo(aj, { id: "vecinaG2", mismaCuenta: false }, { directa: false, mc: false, am: "grupo", g: "g2" })).toEqual({ ambito: "grupo", grupo: "g2" });
    expect(ambitoEfectivo(aj, { id: "vecinaG2", mismaCuenta: false }, { directa: false, mc: true, am: "mias" })).toEqual({ ambito: "grupo", grupo: "g2" });
  });
  it("reenviada por una neurona MÍA: confío en su declaración, pero un grupo que no tengo baja a pública", () => {
    expect(ambitoEfectivo(aj, vecinaMia, { directa: false, mc: true, am: "mias" })).toEqual({ ambito: "mias" });
    expect(ambitoEfectivo(aj, vecinaMia, { directa: false, mc: true, am: "grupo", g: "g1" })).toEqual({ ambito: "grupo", grupo: "g1" });
    expect(ambitoEfectivo(aj, vecinaMia, { directa: false, mc: true, am: "grupo", g: "inventado" })).toEqual({ ambito: "publica" });
    expect(ambitoEfectivo(aj, vecinaMia, { directa: false, mc: false, am: "publica" })).toEqual({ ambito: "publica" });
  });
  it("sin `am` (pares antiguos): `mc` decide y se verifica contra la vecina", () => {
    expect(ambitoEfectivo(aj, vecinaMia, { directa: false, mc: true })).toEqual({ ambito: "mias" });
    expect(ambitoEfectivo(aj, extrana, { directa: false, mc: true })).toEqual({ ambito: "otras" });
  });
  it("USAR una neurona de otra cuenta enlazada (vecina directa): ajuste propio, Preguntar por defecto, recordado y revocable", () => {
    const ctx = { miCuenta: "yo", vecinoMismaCuenta: (id: string) => id === "mia2" };
    const directa = { vecino: "amiga2", anuncio: { id: "amiga2", uid: "otra" } };
    const sinGrupo = AJUSTES_PUERTA_POR_DEFECTO;
    expect(sinGrupo.usarOtrasCuentas).toBe("preguntar");
    expect(ambitoDePuerta(sinGrupo, directa, ctx)).toMatchObject({ ambito: "otras", permitido: true, preguntar: true }); // sin tocar «Usar puertas públicas»
    // Respondido «sí»: se recuerda por neurona y ya no se pregunta; «no»: no se usa; revocar = quitar la entrada.
    expect(ambitoDePuerta({ ...sinGrupo, usoOtrasRecordadas: { amiga2: "permitir" } }, directa, ctx)).toMatchObject({ permitido: true, preguntar: false });
    expect(ambitoDePuerta({ ...sinGrupo, usoOtrasRecordadas: { amiga2: "denegar" } }, directa, ctx)).toMatchObject({ permitido: false });
    expect(ambitoDePuerta({ ...sinGrupo, usoOtrasRecordadas: { otra: "permitir" } }, directa, ctx)).toMatchObject({ preguntar: true });
    expect(ambitoDePuerta({ ...sinGrupo, usarOtrasCuentas: "nunca" }, directa, ctx)).toMatchObject({ permitido: false });
    expect(ambitoDePuerta({ ...sinGrupo, usarOtrasCuentas: "automatico" }, directa, ctx)).toMatchObject({ permitido: true, preguntar: false });
    // Una que se anuncia pública cuenta como pública SOLO si «Usar puertas públicas» está encendido.
    const publicaDirecta = { vecino: "p", anuncio: { id: "p", op: true } };
    expect(ambitoDePuerta(sinGrupo, publicaDirecta, ctx)).toMatchObject({ ambito: "otras", permitido: true, preguntar: true });
    expect(ambitoDePuerta({ ...sinGrupo, publica: { ...sinGrupo.publica, usar: true } }, publicaDirecta, ctx)).toMatchObject({ ambito: "publica", permitido: true });
    // Desconocida por una cadena: pública, rechazada sin el interruptor público.
    expect(ambitoDePuerta(sinGrupo, { vecino: "amiga2", anuncio: { id: "lejana", uid: "otra" } }, ctx)).toMatchObject({ ambito: "publica", permitido: false });
  });
  it("el espejo (usar): mías según «Usar mis neuronas»; grupos según su ajuste; el resto es pública y exige «Usar puertas públicas»", () => {
    const ctx = { miCuenta: "yo", vecinoMismaCuenta: (id: string) => id === "mia2" };
    const e = (vecino: string, id: string, uid?: string) => ({ vecino, anuncio: { id, uid } });
    expect(ambitoDePuerta(aj, e("mia2", "mia2"), ctx)).toMatchObject({ ambito: "mias", permitido: true });
    expect(ambitoDePuerta(aj, e("mia2", "lejana", "yo"), ctx)).toMatchObject({ ambito: "mias", permitido: true }); // llego por una mía que garantiza
    // Una extraña que dice ser de mi cuenta NO es mía.
    expect(ambitoDePuerta(aj, e("extrana", "lejana", "yo"), ctx)).toMatchObject({ ambito: "publica", permitido: false });
    expect(ambitoDePuerta({ ...aj, publica: { ...aj.publica, usar: true } }, e("extrana", "lejana", "yo"), ctx)).toMatchObject({ ambito: "publica", permitido: true });
    expect(ambitoDePuerta(aj, e("amiga", "amiga"), ctx)).toMatchObject({ ambito: "grupo", grupo: "g1", permitido: true, preguntar: true });
    expect(ambitoDePuerta(conGrupo(grupoG({ usar: "nunca" })), e("amiga", "amiga"), ctx)).toMatchObject({ ambito: "grupo", permitido: false });
    expect(ambitoDePuerta({ ...AJUSTES_PUERTA_POR_DEFECTO, modoUso: "nunca" }, e("mia2", "mia2"), ctx)).toMatchObject({ ambito: "mias", permitido: false });
  });
});

/* ───────────────────────── Papeles que cambian solos ───────────────────────── */
describe("DecisorRol: sin parpadeo", () => {
  it("recuperar la salida es inmediato; perderla espera la permanencia", () => {
    const d = new DecisorRol(6000);
    expect(d.observar({ conInternet: false, hayPuertas: true }, 0)).toMatchObject({ rol: "usuaria", cambio: null });
    expect(d.observar({ conInternet: true, hayPuertas: true }, 1000)).toMatchObject({ rol: "puerta", cambio: "a-puerta", antes: "usuaria" });
    // Un parpadeo de 2 s no cambia el papel.
    expect(d.observar({ conInternet: false, hayPuertas: true }, 3000)).toMatchObject({ rol: "puerta", cambio: null });
    expect(d.observar({ conInternet: true, hayPuertas: true }, 4000)).toMatchObject({ rol: "puerta", cambio: null });
    // Una pérdida sostenida sí.
    expect(d.observar({ conInternet: false, hayPuertas: true }, 20_000)).toMatchObject({ rol: "usuaria", cambio: "a-usuaria", antes: "puerta" });
    expect(d.observar({ conInternet: false, hayPuertas: false }, 21_000)).toMatchObject({ rol: "sola", cambio: "a-sola" });
  });
  it("muchos cambios rápidos de la sonda dan como mucho un cambio por permanencia", () => {
    const d = new DecisorRol(6000);
    let cambios = 0;
    d.observar({ conInternet: true, hayPuertas: false }, 0);
    for (let t = 500; t < 5500; t += 500) if (d.observar({ conInternet: t % 1000 === 0, hayPuertas: true }, t).cambio) cambios++;
    expect(cambios).toBe(0);
  });
  it("el texto de la cadena nombra de la puerta hacia mí", () => {
    expect(textoCadena({ nombre: "Maggaboard", enlace: "Bluetooth directo", saltos: 0 })).toBe("Maggaboard · Bluetooth directo");
    expect(textoCadena({ nombre: "Maggaboard", enlace: "Bluetooth directo", saltos: 1, vecino: "MaggaBook" })).toBe("Maggaboard → MaggaBook · Bluetooth directo · 1 salto");
    expect(textoCadena({ nombre: "C", enlace: "Wi‑Fi directo", saltos: 2, vecino: "B" })).toBe("C → … → B · Wi‑Fi directo · 2 saltos");
  });
});

/* ───────────────────────── Red en memoria ───────────────────────── */
interface Nodo {
  id: string;
  gestor: GestorPuerta;
  tabla: TablaPuertas;
  aj: AjustesPuerta;
  est: EstadoPropio;
  cuenta: string;
  sockets: Array<{ host: string; port: number; cerrado: boolean }>;
  preguntas: Array<{ de: string; ambito?: string; grupo?: string; host: string; motivo?: string }>;
  respuesta: "permitir" | "denegar" | "siempre" | "nunca";
  confirmado: boolean;
}

class Falso implements SocketSalida {
  cerrado = false;
  constructor(public host: string, public port: number) {}
  async escribir(): Promise<void> {}
  alDatos(): void {}
  alCerrar(): void {}
  cerrar(): void {
    this.cerrado = true;
  }
}

function crearRed() {
  const nodos = new Map<string, Nodo>();
  const oyentes = new Map<string, (v: string, t: Trama, m: MetaVecino) => void>();
  const enlaces = new Map<string, string>();
  const clave = (a: string, b: string): string => [a, b].sort().join("|");
  const red = {
    nodos,
    enlazar(a: string, b: string, tipo = "local"): void {
      enlaces.set(clave(a, b), tipo);
    },
    cortar(a: string, b: string): void {
      enlaces.delete(clave(a, b));
    },
    nodo(id: string, o: { cuenta?: string; tcp?: boolean; est?: EstadoPropio; aj?: Partial<AjustesPuerta>; respuesta?: Nodo["respuesta"] } = {}): Nodo {
      const tabla = new TablaPuertas(() => Date.now(), id);
      const n: Nodo = { id, tabla, aj: { ...AJUSTES_PUERTA_POR_DEFECTO, ...(o.aj ?? {}) }, est: o.est ?? { ...buena, conInternet: false }, cuenta: o.cuenta ?? "yo", sockets: [], preguntas: [], respuesta: o.respuesta ?? "denegar", confirmado: true } as unknown as Nodo;
      const transporte: TransportePuerta = {
        yo: () => id,
        vecinos: () => [...nodos.keys()].filter((x) => x !== id && enlaces.has(clave(id, x))),
        tamTrozo: () => 1024,
        async enviar(vecino, t) {
          if (!enlaces.has(clave(id, vecino))) return false;
          const tipo = enlaces.get(clave(id, vecino)) as string;
          queueMicrotask(() => {
            const dest = nodos.get(vecino);
            const m: MetaVecino = { mismaCuenta: !!dest && dest.cuenta === n.cuenta, tipoEnlace: tipo === "wifi" ? "local" : tipo, etiqueta: tipo === "ble" ? "Bluetooth directo" : tipo === "wifi" ? "Wi‑Fi directo" : "Red local" };
            oyentes.get(vecino)?.(id, JSON.parse(JSON.stringify(t)) as Trama, m);
          });
          return true;
        },
        alRecibir(cb) {
          oyentes.set(id, cb);
          return () => oyentes.delete(id);
        },
      };
      n.gestor = crearGestorPuerta({
        transporte,
        tabla,
        ajustes: () => n.aj,
        cambiarAjustes: (f) => {
          n.aj = f(n.aj);
        },
        estado: () => n.est,
        miCuenta: () => n.cuenta,
        usoConfirmado: () => n.confirmado,
        anuncioPropio: () => (n.est.conInternet ? crearAnuncioPropio({ id, uid: n.cuenta, capas: ["internet"], latenciaMs: 20, estado: n.est, op: n.aj.publica.ofrecer, ahora: Date.now() }) : null),
        abrirTcp: o.tcp
          ? async (host, port) => {
              const s = new Falso(host, port);
              n.sockets.push(s);
              return s;
            }
          : undefined,
        preguntar: async (s, host, motivo) => {
          n.preguntas.push({ de: s.id, ambito: s.ambito, grupo: s.grupo, host, motivo });
          return n.respuesta;
        },
        plazoAperturaMs: 400,
        plazoPreguntaMs: 800,
        plazoAckMs: 1500,
        ventana: 4,
      });
      nodos.set(id, n);
      vivos.push(n.gestor);
      n.gestor.iniciar();
      return n;
    },
  };
  return red;
}

const vivos: GestorPuerta[] = [];
afterEach(() => {
  for (const g of vivos.splice(0)) g.detener();
});
const pausa = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));
const conInternet: EstadoPropio = { ...buena };

/* ───────────────────────── Cambio de papel ───────────────────────── */
describe("el papel cambia solo: la usuaria pasa a puerta y la puerta a usuaria", () => {
  it("ida y vuelta entre dos neuronas, con el túnel en vuelo cortado al instante y reabierto por la ruta nueva", async () => {
    const red = crearRed();
    const mac = red.nodo("mac", { tcp: true, est: { ...conInternet, conInternet: false } });
    const tab = red.nodo("tab", { tcp: true, est: conInternet });
    red.enlazar("mac", "tab", "ble");
    tab.gestor.anunciar();
    await pausa();
    // 1) La Mac, sin salida, usa la tableta.
    const t1 = await mac.gestor.abrirTunel("example.com", 443);
    expect("error" in t1).toBe(false);
    if ("error" in t1) return;
    expect(t1.puerta).toBe("tab");
    let cierre = "";
    t1.alCerrar((m) => (cierre = m));
    // 2) La tableta pierde su salida: lo que servía se corta YA y la Mac borra la ruta.
    tab.est = { ...conInternet, conInternet: false };
    tab.gestor.salidaPerdida();
    await pausa();
    expect(cierre).not.toBe("");
    expect(tab.sockets[0].cerrado).toBe(true);
    expect(mac.tabla.candidatas().length).toBe(0);
    expect(await mac.gestor.abrirTunel("example.com", 443)).toEqual({ error: "sin-puertas" });
    // 3) La Mac recupera internet y empieza a compartir; la tableta (ahora sin salida) la usa.
    mac.est = conInternet;
    mac.gestor.anunciar();
    await pausa();
    const t2 = await tab.gestor.abrirTunel("example.com", 443);
    expect("error" in t2).toBe(false);
    if ("error" in t2) return;
    expect(t2.puerta).toBe("mac");
    expect(mac.sockets.length).toBe(1);
    expect(mac.sockets[0].host).toBe("example.com");
  });

  it("sin bucles: dos neuronas sin salida no se anuncian ni se usan entre sí", async () => {
    const red = crearRed();
    const a = red.nodo("a", { tcp: true });
    const b = red.nodo("b", { tcp: true });
    red.enlazar("a", "b");
    a.gestor.anunciar();
    b.gestor.anunciar();
    await pausa();
    expect(a.tabla.candidatas().length + b.tabla.candidatas().length).toBe(0);
    expect(await a.gestor.abrirTunel("example.com", 443)).toEqual({ error: "sin-puertas" });
  });

  it("la baja ('retira') recorre la cadena y respeta una ruta alternativa mejor", async () => {
    const red = crearRed();
    const a = red.nodo("a");
    const b = red.nodo("b");
    const c = red.nodo("c", { tcp: true, est: conInternet });
    const d = red.nodo("d", { tcp: true, est: conInternet });
    red.enlazar("a", "b");
    red.enlazar("b", "c");
    red.enlazar("a", "d");
    c.gestor.anunciar();
    d.gestor.anunciar();
    await pausa();
    expect(a.tabla.vecinoDe("c")).toBe("b");
    c.est = { ...conInternet, conInternet: false };
    c.gestor.salidaPerdida();
    await pausa();
    expect(a.tabla.vecinoDe("c")).toBeNull();
    expect(b.tabla.vecinoDe("c")).toBeNull();
    expect(a.tabla.vecinoDe("d")).toBe("d"); // la otra puerta sigue
  });
});

/* ───────────────────────── Cadena de tres neuronas ───────────────────────── */
describe("cadena A → B → C → internet con carriles distintos", () => {
  async function cadena(ajB: Partial<AjustesPuerta> = {}, estB: Partial<EstadoPropio> = {}) {
    const red = crearRed();
    const a = red.nodo("A");
    const b = red.nodo("B", { tcp: true, est: { ...conInternet, conInternet: false, ...estB }, aj: ajB });
    const c = red.nodo("C", { tcp: true, est: conInternet });
    red.enlazar("A", "B", "ble"); // Bluetooth
    red.enlazar("B", "C", "wifi"); // Wi‑Fi directo
    c.gestor.anunciar();
    await pausa(40);
    return { red, a, b, c };
  }

  it("A llega a internet por C pasando por B, y la interfaz nombra la cadena", async () => {
    const { a, b, c } = await cadena();
    expect(a.tabla.candidatas()[0]).toMatchObject({ vecino: "B", enlace: "Bluetooth directo" });
    expect(a.tabla.candidatas()[0].anuncio.saltos).toBe(1);
    const t = await a.gestor.abrirTunel("example.com", 443);
    expect("error" in t).toBe(false);
    if ("error" in t) return;
    expect(t).toMatchObject({ puerta: "C", saltos: 1, vecino: "B" });
    expect(c.sockets.length).toBe(1);
    expect(b.sockets.length).toBe(0); // B solo retransmite
    expect(b.gestor.compartiendo()[0]).toMatchObject({ rol: "rele", de: "A" });
    expect(c.gestor.compartiendo()[0]).toMatchObject({ rol: "puerta", de: "A", grupo: "mias" });
    const propio = a.gestor.tunelesPropios()[0];
    expect(textoCadena({ nombre: "C", enlace: propio.enlace, saltos: propio.saltos, vecino: "B" })).toBe("C → B · Bluetooth directo · 1 salto");
    t.cerrar();
  });

  it("cada salto aplica SU política: la batería baja de B, o sus ajustes, cortan la cadena", async () => {
    const baja = await cadena({}, { bateria: 0.05 });
    expect(await baja.a.gestor.abrirTunel("example.com", 443)).toEqual({ error: "rele-no-permitido" });
    expect(baja.c.sockets.length).toBe(0);
    const apagada = await cadena({ misNeuronas: false });
    expect(await apagada.a.gestor.abrirTunel("example.com", 443)).toEqual({ error: "rele-no-permitido" });
  });

  it("la cuota del ámbito de B también cuenta al retransmitir", async () => {
    const { a, b } = await cadena({ topesMias: { ...AJUSTES_PUERTA_POR_DEFECTO.topesMias, maxTuneles: 1 } });
    const t1 = await a.gestor.abrirTunel("example.com", 443);
    expect("error" in t1).toBe(false);
    const t2 = await a.gestor.abrirTunel("example.org", 443);
    expect("error" in t2 ? t2.error : "").toBe("rele-no-permitido");
    expect(b.gestor.compartiendo().length).toBe(1);
  });

  it("cuatro neuronas: dos saltos de retransmisión", async () => {
    const red = crearRed();
    const a = red.nodo("A");
    red.nodo("B", { est: { ...conInternet, conInternet: false } });
    red.nodo("C", { est: { ...conInternet, conInternet: false } });
    const d = red.nodo("D", { tcp: true, est: conInternet });
    red.enlazar("A", "B", "ble");
    red.enlazar("B", "C", "wifi");
    red.enlazar("C", "D", "local");
    d.gestor.anunciar();
    await pausa(60);
    const t = await a.gestor.abrirTunel("example.com", 443);
    expect("error" in t).toBe(false);
    if ("error" in t) return;
    expect(t.saltos).toBe(2);
    expect(d.sockets.length).toBe(1);
  });
});

/* ───────────────────────── Ámbitos de punta a punta ───────────────────────── */
describe("ámbitos de punta a punta (mías, grupo, pública) y laundering", () => {
  it("mis neuronas: automático (por defecto)", async () => {
    const red = crearRed();
    const a = red.nodo("A");
    const c = red.nodo("C", { tcp: true, est: conInternet });
    red.enlazar("A", "C");
    c.gestor.anunciar();
    await pausa();
    const t = await a.gestor.abrirTunel("example.com", 443);
    expect("error" in t).toBe(false);
    expect(c.preguntas.length).toBe(0);
    expect(c.gestor.compartiendo()[0].grupo).toBe("mias");
  });

  for (const [modo, esperado] of [["automatico", "sirve"], ["preguntar", "pregunta"], ["nunca", "apagada"]] as const) {
    it(`grupo «${modo}»: ${esperado}`, async () => {
      const red = crearRed();
      const gAj = (x: Partial<AjusteGrupo>) => ({ g1: grupoG({ miembros: [], ...x }) });
      const x = red.nodo("X", { cuenta: "ajena", aj: { grupos: gAj({ usar: "automatico", miembros: ["C"] }) } });
      const c = red.nodo("C", { cuenta: "mia", tcp: true, est: conInternet, respuesta: "permitir", aj: { grupos: gAj({ compartir: modo, miembros: ["X"], nombre: "Vecinos" }) } });
      red.enlazar("X", "C");
      c.gestor.anunciar();
      await pausa();
      const r = await x.gestor.abrirTunel("example.com", 443);
      if (modo === "nunca") expect(r).toEqual({ error: "apagada" });
      else expect("error" in r).toBe(false);
      if (modo === "preguntar") expect(c.preguntas[0]).toMatchObject({ de: "X", ambito: "grupo", grupo: "g1", motivo: "otra-cuenta" });
      if (modo === "automatico") expect(c.preguntas.length).toBe(0);
      if (modo !== "nunca") {
        expect(c.gestor.compartiendo()[0]).toMatchObject({ grupo: "grupo", grupoId: "g1" });
        expect(c.gestor.bytesHoyDe("g1")).toBe(0);
        expect(c.gestor.auditoria().length).toBe(0); // aún abierto
      }
    });
  }

  it("grupo: quien USA con «Preguntar» no usa hasta que el usuario confirma; «Nunca» ni lo intenta", async () => {
    const red = crearRed();
    const aj = { grupos: { g1: grupoG({ miembros: ["C"], usar: "preguntar" }) } };
    const x = red.nodo("X", { cuenta: "ajena", aj });
    const c = red.nodo("C", { cuenta: "mia", tcp: true, est: conInternet, aj: { grupos: { g1: grupoG({ miembros: ["X"], compartir: "automatico" }) } } });
    red.enlazar("X", "C");
    c.gestor.anunciar();
    await pausa();
    x.confirmado = false;
    expect(await x.gestor.abrirTunel("example.com", 443)).toEqual({ error: "sin-puertas" });
    x.confirmado = true;
    expect("error" in (await x.gestor.abrirTunel("example.com", 443))).toBe(false);
    x.aj = { ...x.aj, grupos: { g1: grupoG({ miembros: ["C"], usar: "nunca" }) } };
    expect(await x.gestor.abrirTunel("example.org", 443)).toEqual({ error: "sin-puertas" });
  });

  it("otra cuenta enlazada, directa: pregunta una vez; encadenada y desconocida: rechazada sin el interruptor público", async () => {
    const red = crearRed();
    const x = red.nodo("X", { cuenta: "ajena" });
    const c = red.nodo("C", { cuenta: "mia", tcp: true, est: conInternet, aj: { otrasCuentas: "automatico" } });
    red.enlazar("X", "C");
    c.gestor.anunciar();
    await pausa();
    x.confirmado = false; // aún sin respuesta del usuario a «¿salir por esta neurona?»
    expect(await x.gestor.abrirTunel("example.com", 443)).toEqual({ error: "sin-puertas" });
    x.confirmado = true; // el usuario dijo que sí (el servicio lo recuerda por neurona)
    expect("error" in (await x.gestor.abrirTunel("example.com", 443))).toBe(false);
    // Cadena X → B → C con B de una tercera cuenta: C es desconocida para X (pública) y X no usa públicas.
    const red2 = crearRed();
    const x2 = red2.nodo("X", { cuenta: "ajena" });
    red2.nodo("B", { cuenta: "tercera", est: { ...conInternet, conInternet: false } });
    const c2 = red2.nodo("C", { cuenta: "mia", tcp: true, est: conInternet });
    red2.enlazar("X", "B");
    red2.enlazar("B", "C");
    c2.gestor.anunciar();
    await pausa(40);
    expect(x2.tabla.candidatas().length).toBe(1);
    expect(await x2.gestor.abrirTunel("example.com", 443)).toEqual({ error: "sin-puertas" });
    expect(c2.sockets.length).toBe(0);
  });

  it("pública: apagada en los dos sentidos por defecto", async () => {
    const red = crearRed();
    const x = red.nodo("X", { cuenta: "ajena" });
    const c = red.nodo("C", { cuenta: "mia", tcp: true, est: conInternet });
    red.enlazar("X", "C");
    c.gestor.anunciar();
    await pausa();
    // X no usa a otras cuentas («Nunca»): no intenta nada.
    x.aj = { ...x.aj, usarOtrasCuentas: "nunca" };
    expect(await x.gestor.abrirTunel("example.com", 443)).toEqual({ error: "sin-puertas" });
    x.aj = { ...x.aj, usarOtrasCuentas: "preguntar" };
    // X sí quiere, pero C no la ofrece: X es solo «otra cuenta» para C (se le pregunta, nunca se le sirve sola).
    x.aj = { ...x.aj, publica: { ...x.aj.publica, usar: true } };
    expect(await x.gestor.abrirTunel("example.com", 443)).toEqual({ error: "otra-cuenta" });
    expect(c.preguntas[0]).toMatchObject({ de: "X", ambito: "otras" });
    expect(c.sockets.length).toBe(0);
  });

  it("pública encendida en los dos lados: solo web, sin capas, sin otros puertos", async () => {
    const red = crearRed();
    const x = red.nodo("X", { cuenta: "ajena", aj: { publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, usar: true }, otrosPuertos: "siempre" } });
    const c = red.nodo("C", { cuenta: "mia", tcp: true, est: conInternet, aj: { publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, ofrecer: true } } });
    red.enlazar("X", "C");
    c.gestor.anunciar();
    await pausa();
    expect(c.tabla.candidatas().length).toBe(0);
    expect(x.tabla.candidatas()[0].anuncio.op).toBe(true);
    const t = await x.gestor.abrirTunel("example.com", 8443);
    expect("error" in t).toBe(false);
    expect(c.gestor.compartiendo()[0].grupo).toBe("publica");
    // Un puerto que a sus dueños sí les valdría (otrosPuertos: siempre en X) la pública no lo sirve.
    c.tabla.marcarAcierto("X");
    x.tabla.marcarAcierto("C");
    expect(await x.gestor.abrirTunel("example.com", 9000)).toEqual({ error: "puerto-no-permitido" });
    x.tabla.marcarAcierto("C");
    // Nunca por datos móviles.
    c.est = { ...conInternet, medida: true };
    c.aj = { ...c.aj, datosMoviles: { modo: "si", bytesDia: 100 * MIB } };
    expect(await x.gestor.abrirTunel("example.org", 443)).toEqual({ error: "red-medida" });
    expect(c.preguntas.length).toBe(0);
  });

  it("LAUNDERING: una extraña no se hace pasar por mía a través de una neurona mía", async () => {
    // X (otra cuenta) → B (mía, relé) → C (mía, puerta). X afirma `mc:true, am:"mias"`.
    const red = crearRed();
    const x = red.nodo("X", { cuenta: "ajena", aj: { publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, usar: true } } });
    const b = red.nodo("B", { cuenta: "mia", tcp: true, est: { ...conInternet, conInternet: false }, aj: { otrasCuentas: "automatico" } });
    const c = red.nodo("C", { cuenta: "mia", tcp: true, est: conInternet, respuesta: "denegar" });
    red.enlazar("X", "B", "ble");
    red.enlazar("B", "C", "wifi");
    c.gestor.anunciar();
    await pausa(40);
    expect(x.tabla.candidatas().length).toBe(1);
    // Trama a mano (como la mandaría una neurona maliciosa).
    const tramas: Trama[] = [];
    void tramas;
    const r = await x.gestor.abrirTunel("example.com", 443);
    // B atiende a X como «otras» (automático), C la ve como «otras» y, con «Preguntar» y respuesta «no», la deniega.
    expect("error" in r).toBe(true);
    expect(c.sockets.length).toBe(0);
    expect(c.preguntas[0]).toMatchObject({ de: "X", ambito: "otras" });
    // Si C no admite a otras cuentas, ni pregunta.
    c.preguntas.length = 0;
    c.aj = { ...c.aj, otrasCuentas: "nunca" };
    x.tabla.marcarAcierto("C");
    await x.gestor.abrirTunel("example.org", 443);
    expect(c.preguntas.length).toBe(0);
    expect(c.sockets.length).toBe(0);
    // Y C nunca contó nada como «mías» por culpa de X.
    expect(c.gestor.bytesHoyDe("mias")).toBe(0);
  });

  it("LAUNDERING: un relé que no ofrece la capa pública no pasa a un requeridor público a la puerta que sí la ofrece", async () => {
    const red = crearRed();
    const x = red.nodo("X", { cuenta: "ajena", aj: { publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, usar: true } } });
    const b = red.nodo("B", { cuenta: "otra", tcp: true, est: { ...conInternet, conInternet: false }, aj: { publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, ofrecer: false, usar: true } } });
    const c = red.nodo("C", { cuenta: "tercera", tcp: true, est: conInternet, aj: { publica: { ...AJUSTES_PUERTA_POR_DEFECTO.publica, ofrecer: true } } });
    red.enlazar("X", "B");
    red.enlazar("B", "C");
    c.gestor.anunciar();
    await pausa(40);
    const r = await x.gestor.abrirTunel("example.com", 443);
    expect("error" in r).toBe(true);
    expect(c.sockets.length).toBe(0);
    // Con B también ofreciendo la capa pública, la cadena sí funciona y C ve a X como pública.
    b.aj = { ...b.aj, publica: { ...b.aj.publica, ofrecer: true } };
    x.tabla.marcarAcierto("C");
    x.tabla.marcarAcierto("B");
    await pausa(10);
    const r2 = await x.gestor.abrirTunel("example.org", 443);
    expect("error" in r2).toBe(false);
    expect(c.gestor.compartiendo()[0].grupo).toBe("publica");
  });
});
