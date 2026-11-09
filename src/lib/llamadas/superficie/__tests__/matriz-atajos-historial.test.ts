/**
 * LLA1108G · la matriz de controles (tipo × medio × plataforma), los mensajes de aplicación, los atajos y el
 * historial. Fijan la tabla de `architecture/llamadas-telefonia.md` §10.
 */
import { describe, expect, it } from "vitest";
import {
  CONTROLES, claseMedio, disponibilidad, matrizControles, motivosDesactivados,
  MOTIVO_EN_VIVO, MOTIVO_PANTALLA_ANDROID, MOTIVO_PANTALLA_MAC, MOTIVO_PANTALLA_NAVEGADOR, MOTIVO_VIDEO_BLUETOOTH, MOTIVO_VIDEO_DATOS,
  type ClaseMedioLlamada, type ContextoMatriz, type EntornoLlamada,
} from "../matriz-controles";
import { accionDeTecla } from "../atajos";
import { leerMensajeApp, sumarChat, sumarReaccion } from "../senales-app";
import { anadirFila, leerHistorial, puedeRellamar, registrarEnHistorial, resumenFila, type FilaHistorial } from "../historial-llamadas";
import { sanearSenal } from "@/lib/llamadas/negociacion";

const ESCRITORIO: EntornoLlamada = { pantalla: true, androidWebView: false, macWebView: false, movil: false, camaras: 1, pip: true, pantallaCompleta: true, setSinkId: true, rutasNativas: 0, grabadora: true };
const ANDROID: EntornoLlamada = { pantalla: false, androidWebView: true, movil: true, camaras: 2, pip: false, pantallaCompleta: true, setSinkId: false, rutasNativas: 3, grabadora: true };
const MAC_APP: EntornoLlamada = { ...ESCRITORIO, pantalla: false, macWebView: true };

const ctx = (o: Partial<ContextoMatriz> = {}): ContextoMatriz => ({ tipo: "voz", medio: "webrtc", entorno: ESCRITORIO, personas: 2, camaraEncendida: false, pantallaCompartida: false, hayVideoRemoto: false, soyCreador: true, viva: true, ...o });

describe("matriz de controles: medio × plataforma", () => {
  it("escritorio por WebRTC: todo funciona salvo lo que depende del contexto", () => {
    const m = matrizControles(ctx());
    const fallan = CONTROLES.filter((id) => !m[id].ok);
    expect(fallan.sort()).toEqual(["colgar-todos", "girar-camara", "pip", "tipo-vivo", "tipo-voz"].sort());
    expect(m["tipo-voz"].motivo).toMatch(/Ya estás/);
    expect(m["tipo-vivo"].motivo).toBe(MOTIVO_EN_VIVO);
  });

  const casos: Array<[string, ClaseMedioLlamada, Array<[Parameters<typeof disponibilidad>[0], boolean, string?]>]> = [
    ["WebRTC", "webrtc", [["camara", true], ["pantalla", true], ["tipo-video", true], ["tipo-pantalla", true], ["invitar", true]]],
    ["enlace de datos", "enlace-datos", [["camara", false, MOTIVO_VIDEO_DATOS], ["pantalla", false, MOTIVO_VIDEO_DATOS], ["tipo-video", false, MOTIVO_VIDEO_DATOS], ["tipo-pantalla", false, MOTIVO_VIDEO_DATOS], ["micro", true], ["chat", true], ["astraura", true]]],
    ["Bluetooth", "bluetooth", [["camara", false, MOTIVO_VIDEO_BLUETOOTH], ["pantalla", false, MOTIVO_VIDEO_BLUETOOTH], ["tipo-video", false, MOTIVO_VIDEO_BLUETOOTH], ["invitar", false, "dos en dos"], ["micro", true], ["grabar", true]]],
  ];
  for (const [nombre, medio, filas] of casos) {
    it(`por ${nombre}`, () => {
      for (const [id, ok, motivo] of filas) {
        const d = disponibilidad(id, ctx({ medio }));
        expect({ id, ok: d.ok }).toEqual({ id, ok });
        if (motivo) expect(d.motivo).toContain(motivo);
      }
    });
  }

  it("pantalla: Android y la app de Mac sin getDisplayMedia dicen su motivo; el navegador sin soporte, el suyo", () => {
    expect(disponibilidad("pantalla", ctx({ entorno: ANDROID })).motivo).toBe(MOTIVO_PANTALLA_ANDROID);
    expect(disponibilidad("tipo-pantalla", ctx({ entorno: ANDROID })).motivo).toBe(MOTIVO_PANTALLA_ANDROID);
    expect(disponibilidad("pantalla", ctx({ entorno: MAC_APP })).motivo).toBe(MOTIVO_PANTALLA_MAC);
    expect(disponibilidad("pantalla", ctx({ entorno: { ...ESCRITORIO, pantalla: false } })).motivo).toBe(MOTIVO_PANTALLA_NAVEGADOR);
    expect(disponibilidad("pantalla", ctx()).ok).toBe(true);
  });

  it("cámara: sin cámaras listadas no se bloquea (el aparato dirá el motivo real al encenderla); con la pantalla compartida pide dejarla; girar pide 2 cámaras y la cámara encendida", () => {
    expect(disponibilidad("camara", ctx({ entorno: { ...ESCRITORIO, camaras: 0 } })).ok).toBe(true);
    expect(disponibilidad("camara", ctx({ pantallaCompartida: true })).motivo).toMatch(/Deja de compartir/);
    expect(disponibilidad("girar-camara", ctx()).motivo).toMatch(/Solo hay una cámara/);
    expect(disponibilidad("girar-camara", ctx({ entorno: ANDROID })).motivo).toMatch(/Enciende la cámara/);
    expect(disponibilidad("girar-camara", ctx({ entorno: ANDROID, camaraEncendida: true })).ok).toBe(true);
  });

  it("salida de audio: rutas del teléfono o setSinkId; si no, lo dice. PiP: navegador y vídeo remoto", () => {
    expect(disponibilidad("salida-audio", ctx({ entorno: ANDROID })).ok).toBe(true);
    expect(disponibilidad("salida-audio", ctx({ entorno: { ...ESCRITORIO, setSinkId: false } })).motivo).toMatch(/salida de audio/);
    expect(disponibilidad("pip", ctx({ entorno: ANDROID })).motivo).toMatch(/no permite imagen en imagen/);
    expect(disponibilidad("pip", ctx()).motivo).toMatch(/Aún no hay vídeo/);
    expect(disponibilidad("pip", ctx({ hayVideoRemoto: true })).ok).toBe(true);
  });

  it("invitar: tope de 8; terminar para todos: más de dos y ser quien la empezó", () => {
    expect(disponibilidad("invitar", ctx({ personas: 8 })).motivo).toMatch(/completa/);
    expect(disponibilidad("invitar", ctx({ personas: 7 })).ok).toBe(true);
    expect(disponibilidad("colgar-todos", ctx({ personas: 4 })).ok).toBe(true);
    expect(disponibilidad("colgar-todos", ctx({ personas: 4, soyCreador: false })).motivo).toMatch(/Solo quien empezó/);
  });

  it("sin llamada conectada todo (menos pantalla completa) dice que aún no hay llamada", () => {
    expect(disponibilidad("micro", ctx({ viva: false })).motivo).toMatch(/aún no está conectada/);
    expect(disponibilidad("completa", ctx({ viva: false })).ok).toBe(true);
  });

  it("motivosDesactivados solo lista lo que no funciona, cada uno con su frase", () => {
    const m = motivosDesactivados(ctx({ medio: "bluetooth", entorno: ANDROID }));
    expect(Object.keys(m)).toEqual(expect.arrayContaining(["camara", "pantalla", "tipo-video", "tipo-pantalla", "invitar", "pip", "tipo-vivo"]));
    for (const frase of Object.values(m)) expect((frase as string).length).toBeGreaterThan(10);
    expect(m.micro).toBeUndefined();
  });

  it("el medio de la vista del motor se traduce a clase", () => {
    expect(claseMedio({ medio: { tipo: "webrtc", texto: "Voz por WebRTC · cifrada" } })).toBe("webrtc");
    expect(claseMedio({ medio: { tipo: "enlace-datos", texto: "Voz por Bluetooth directo · cifrada" } })).toBe("bluetooth");
    expect(claseMedio({ medio: { tipo: "enlace-datos", texto: "Voz por Wi‑Fi directo" } })).toBe("enlace-datos");
    expect(claseMedio({ medio: null, videoNoDisponible: "x" })).toBe("bluetooth");
    expect(claseMedio({ medio: null })).toBeNull();
  });
});

describe("atajos de teclado (escritorio)", () => {
  it("M V S F con la llamada viva", () => {
    expect(accionDeTecla({ key: "m" }, true)).toBe("micro");
    expect(accionDeTecla({ key: "V" }, true)).toBe("camara");
    expect(accionDeTecla({ key: "s" }, true)).toBe("pantalla");
    expect(accionDeTecla({ key: "F" }, true)).toBe("completa");
    expect(accionDeTecla({ key: "x" }, true)).toBeNull();
  });
  it("no se disparan sin llamada viva, al escribir, con modificadores ni repetidos", () => {
    expect(accionDeTecla({ key: "m" }, false)).toBeNull();
    expect(accionDeTecla({ key: "m", etiqueta: "INPUT" }, true)).toBeNull();
    expect(accionDeTecla({ key: "m", etiqueta: "textarea" }, true)).toBeNull();
    expect(accionDeTecla({ key: "m", editable: true }, true)).toBeNull();
    expect(accionDeTecla({ key: "s", metaKey: true }, true)).toBeNull();
    expect(accionDeTecla({ key: "f", ctrlKey: true }, true)).toBeNull();
    expect(accionDeTecla({ key: "v", repeat: true }, true)).toBeNull();
  });
});

describe("mensajes de aplicación: lo que llega de otro aparato se valida", () => {
  it("válidos pasan; mal formados, de otra clase o enormes se descartan", () => {
    expect(leerMensajeApp({ k: "tipo", id: "1", a: "video" })).toEqual({ k: "tipo", id: "1", a: "video" });
    expect(leerMensajeApp({ k: "tipo", id: "1", a: "holograma" })).toBeNull();
    expect(leerMensajeApp({ k: "chat", id: "1", nombre: "A", texto: "hola", en: 1 })).toMatchObject({ texto: "hola" });
    expect(leerMensajeApp({ k: "chat", id: "1", texto: "   " })).toBeNull();
    expect(leerMensajeApp({ k: "chat", id: "1", texto: "x".repeat(900) })).toMatchObject({ texto: "x".repeat(500) });
    expect(leerMensajeApp({ k: "reaccion", id: "1", emoji: "👍" })).toMatchObject({ emoji: "👍" });
    expect(leerMensajeApp({ k: "reaccion", id: "1", emoji: "<script>" })).toBeNull();
    expect(leerMensajeApp({ k: "grabacion", id: "1", de: "a", nombre: "Ana", activa: true, en: 1 })).toMatchObject({ activa: true });
    expect(leerMensajeApp({ k: "grabacion", id: "1" })).toBeNull();
    expect(leerMensajeApp({ k: "astraura-llamada", id: "r", de: "a", texto: "x".repeat(5000), preguntaDe: "A", pregunta: "q", ajustes: {}, local: false, en: 1 })).toBeNull();
    expect(leerMensajeApp({ k: "desconocido" })).toBeNull();
    expect(leerMensajeApp(null)).toBeNull();
  });
  it("el chat y las reacciones son idempotentes por id y acotados", () => {
    let l = sumarChat([], { id: "1", de: "a", nombre: "A", texto: "x", en: 1, mio: false });
    l = sumarChat(l, { id: "1", de: "a", nombre: "A", texto: "x", en: 1, mio: false });
    expect(l).toHaveLength(1);
    let r: ReturnType<typeof sumarReaccion> = [];
    for (let i = 0; i < 20; i++) r = sumarReaccion(r, { id: String(i), nombre: "A", emoji: "👍" });
    expect(r).toHaveLength(8);
  });
  it("el canal las deja pasar (sanearSenal) y rechaza cargas sin clase o gigantes", () => {
    expect(sanearSenal({ tipo: "app", de: "a:t", carga: { k: "chat", id: "1", texto: "hola" } })).toMatchObject({ tipo: "app" });
    expect(sanearSenal({ tipo: "app", de: "a:t", carga: { texto: "sin clase" } })).toBeNull();
    expect(sanearSenal({ tipo: "app", de: "a:t", carga: { k: "chat", relleno: "x".repeat(9000) } })).toBeNull();
    expect(sanearSenal({ tipo: "texto", de: "a:t", texto: "hola", en: 1 })).toMatchObject({ tipo: "texto" });
  });
});

describe("historial de llamadas", () => {
  const fila = (o: Partial<FilaHistorial> = {}): FilaHistorial => ({ id: "1", fin: 1000, titulo: "Ana", tipo: "video", medio: "Voz por WebRTC · cifrada", duracionMs: 725_000, contestada: true, saliente: true, hiloId: "h1", tipoHilo: "dm", miembros: ["u1"], grabacion: null, ...o });
  const almacen = () => {
    const d = new Map<string, string>();
    return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) };
  };
  it("guarda lo más reciente primero, sin repetir y con tope", () => {
    const a = almacen();
    registrarEnHistorial(a, fila({ id: "1", fin: 1 }));
    registrarEnHistorial(a, fila({ id: "2", fin: 2 }));
    registrarEnHistorial(a, fila({ id: "1", fin: 3 }));
    expect(leerHistorial(a).map((f) => f.id)).toEqual(["1", "2"]);
    let l: FilaHistorial[] = [];
    for (let i = 0; i < 130; i++) l = anadirFila(l, fila({ id: String(i), fin: i }));
    expect(l).toHaveLength(100);
  });
  it("lee con tolerancia (datos rotos no tumban la página)", () => {
    const a = almacen();
    a.setItem("starseed.llamadas.historial.v1", "{{no json");
    expect(leerHistorial(a)).toEqual([]);
    a.setItem("starseed.llamadas.historial.v1", JSON.stringify([{ id: "x" }, fila()]));
    expect(leerHistorial(a)).toHaveLength(1);
    expect(leerHistorial(null)).toEqual([]);
  });
  it("resumen con medio, duración y grabación; volver a llamar solo si hay chat y gente", () => {
    const d = (ms: number) => `${Math.round(ms / 60000)} min`;
    expect(resumenFila(fila({ grabacion: "grabaciones-llamada/x.webm" }), d)).toBe("Videollamada · 12 min · Voz por WebRTC · grabada");
    expect(resumenFila(fila({ contestada: false }), d)).toContain("Sin respuesta");
    expect(resumenFila(fila({ contestada: false, saliente: false }), d)).toContain("Perdida");
    expect(puedeRellamar(fila()).ok).toBe(true);
    expect(puedeRellamar(fila({ hiloId: null })).motivo).toMatch(/no salió de un chat/);
    expect(puedeRellamar(fila({ miembros: [] })).ok).toBe(false);
  });
});
