import { describe, expect, it } from "vitest";
import { duracionMs, estaGrabando, estaOcupada, reducir, type EventoGrabadora } from "../maquina";
import { INSTANTANEA_INICIAL, type Instantanea, type ResultadoGrabacion } from "../tipos";

const permiso = (extra: Partial<Extract<EventoGrabadora, { tipo: "PERMISO_OK" }>> = {}): EventoGrabadora => ({
  tipo: "PERMISO_OK",
  cuentaAtras: 3,
  superficie: "monitor",
  conMicrofono: true,
  conSonidoSistema: false,
  conCamara: false,
  mimeType: "video/webm",
  avisos: [],
  ...extra,
});

const correr = (...eventos: EventoGrabadora[]): Instantanea => eventos.reduce(reducir, INSTANTANEA_INICIAL);

const resultado = (bytes = 1000, duracionMs = 4000): ResultadoGrabacion => ({
  tipo: "video",
  blob: new Blob([]),
  url: "blob:x",
  mimeType: "video/webm",
  extension: "webm",
  nombre: "a.webm",
  bytes,
  duracionMs,
});

describe("grabación · estados de la grabadora", () => {
  it("camino feliz: pedir → permiso → cuenta atrás → grabando → pausa → reanudar → parar → lista", () => {
    let s = correr({ tipo: "PEDIR" });
    expect(s.fase).toBe("preparando");
    s = reducir(s, permiso());
    expect(s).toMatchObject({ fase: "cuenta-atras", cuenta: 3, superficie: "monitor", conMicrofono: true });
    for (let i = 0; i < 3; i++) s = reducir(s, { tipo: "TICK_CUENTA" });
    expect(s.cuenta).toBe(0);
    s = reducir(s, { tipo: "EMPEZAR", ahora: 1000 });
    expect(s).toMatchObject({ fase: "grabando", tramoDesde: 1000, acumuladoMs: 0 });
    expect(duracionMs(s, 3500)).toBe(2500);
    s = reducir(s, { tipo: "PAUSAR", ahora: 3500 });
    expect(s).toMatchObject({ fase: "pausada", acumuladoMs: 2500, tramoDesde: null });
    expect(duracionMs(s, 99_999)).toBe(2500); // en pausa no corre
    s = reducir(s, { tipo: "REANUDAR", ahora: 10_000 });
    expect(duracionMs(s, 11_000)).toBe(3500);
    s = reducir(s, { tipo: "PARAR", ahora: 12_000 });
    expect(s).toMatchObject({ fase: "procesando", acumuladoMs: 4500 });
    s = reducir(s, { tipo: "LISTO", resultado: resultado(2048, 4500) });
    expect(s).toMatchObject({ fase: "lista", bytes: 2048, acumuladoMs: 4500 });
    expect(s.resultado?.nombre).toBe("a.webm");
  });

  it("parar desde pausa guarda lo acumulado", () => {
    const s = correr({ tipo: "PEDIR" }, permiso({ cuentaAtras: 0 }), { tipo: "EMPEZAR", ahora: 0 }, { tipo: "PAUSAR", ahora: 2000 }, { tipo: "PARAR", ahora: 50_000 });
    expect(s).toMatchObject({ fase: "procesando", acumuladoMs: 2000 });
  });

  it("cerrar el selector de pantalla vuelve a inactiva con un aviso (no es un error)", () => {
    const s = correr({ tipo: "PEDIR" }, { tipo: "SIN_PERMISO", aviso: "No elegiste qué compartir" });
    expect(s).toMatchObject({ fase: "inactiva", avisos: ["No elegiste qué compartir"], error: null });
  });

  it("un fallo lleva a «error» con su mensaje, y «descartar» lo limpia", () => {
    let s = correr({ tipo: "PEDIR" }, { tipo: "FALLO", mensaje: "sin cámara" });
    expect(s).toMatchObject({ fase: "error", error: "sin cámara" });
    s = reducir(s, { tipo: "DESCARTAR" });
    expect(s).toMatchObject({ fase: "inactiva", error: null });
  });

  it("un fallo a mitad de grabación para el cronómetro", () => {
    const s = correr({ tipo: "PEDIR" }, permiso({ cuentaAtras: 0 }), { tipo: "EMPEZAR", ahora: 0 }, { tipo: "FALLO", mensaje: "se cayó" });
    expect(s.fase).toBe("error");
    expect(s.tramoDesde).toBeNull();
  });

  it("cancelar la cuenta atrás o la espera vuelve a inactiva", () => {
    expect(correr({ tipo: "PEDIR" }, { tipo: "CANCELAR" }).fase).toBe("inactiva");
    expect(correr({ tipo: "PEDIR" }, permiso(), { tipo: "CANCELAR" }).fase).toBe("inactiva");
  });

  it("transiciones que no corresponden devuelven el MISMO estado", () => {
    const quieto = INSTANTANEA_INICIAL;
    for (const ev of [
      { tipo: "PAUSAR", ahora: 1 },
      { tipo: "REANUDAR", ahora: 1 },
      { tipo: "PARAR", ahora: 1 },
      { tipo: "EMPEZAR", ahora: 1 },
      { tipo: "TICK_CUENTA" },
      { tipo: "CANCELAR" },
      { tipo: "DESCARTAR" },
      { tipo: "DESCARTAR_CAPTURA" },
      { tipo: "BYTES", bytes: 5 },
      { tipo: "FALLO", mensaje: "x" },
    ] as EventoGrabadora[]) {
      expect(reducir(quieto, ev)).toBe(quieto);
    }
    const grabando = correr({ tipo: "PEDIR" }, permiso({ cuentaAtras: 0 }), { tipo: "EMPEZAR", ahora: 0 });
    expect(reducir(grabando, { tipo: "PEDIR" })).toBe(grabando);
    expect(reducir(grabando, { tipo: "REANUDAR", ahora: 5 })).toBe(grabando);
    expect(reducir(grabando, { tipo: "CANCELAR" })).toBe(grabando);
    expect(reducir(grabando, { tipo: "LISTO", resultado: resultado() })).toBe(grabando);
  });

  it("el tamaño en vivo sube solo mientras se graba y no repinta si no cambia", () => {
    const grabando = correr({ tipo: "PEDIR" }, permiso({ cuentaAtras: 0 }), { tipo: "EMPEZAR", ahora: 0 });
    const a = reducir(grabando, { tipo: "BYTES", bytes: 4096 });
    expect(a.bytes).toBe(4096);
    expect(reducir(a, { tipo: "BYTES", bytes: 4096 })).toBe(a);
  });

  it("los avisos no se repiten", () => {
    const s = correr({ tipo: "PEDIR" }, permiso(), { tipo: "AVISO", aviso: "a" }, { tipo: "AVISO", aviso: "a" }, { tipo: "AVISO", aviso: "b" });
    expect(s.avisos).toEqual(["a", "b"]);
  });

  it("pedir de nuevo desde «lista» o «error» empieza limpio pero conserva la captura", () => {
    const captura = { ...resultado(), tipo: "imagen" as const };
    let s = correr({ tipo: "CAPTURA", captura }, { tipo: "PEDIR" }, permiso(), { tipo: "CANCELAR" });
    expect(s.captura).toBe(captura);
    s = correr({ tipo: "PEDIR" }, permiso({ cuentaAtras: 0 }), { tipo: "EMPEZAR", ahora: 0 }, { tipo: "PARAR", ahora: 1 }, { tipo: "LISTO", resultado: resultado() });
    s = reducir(s, { tipo: "PEDIR" });
    expect(s).toMatchObject({ fase: "preparando", resultado: null, bytes: 0, avisos: [] });
  });

  it("la captura es independiente del vídeo y se descarta aparte", () => {
    const captura = { ...resultado(), tipo: "imagen" as const };
    let s = reducir(INSTANTANEA_INICIAL, { tipo: "CAPTURA", captura });
    expect(s.captura).toBe(captura);
    expect(s.fase).toBe("inactiva");
    s = reducir(s, { tipo: "DESCARTAR_CAPTURA" });
    expect(s.captura).toBeNull();
  });

  it("estaOcupada / estaGrabando", () => {
    expect(estaOcupada({ fase: "inactiva" })).toBe(false);
    expect(estaOcupada({ fase: "lista" })).toBe(false);
    expect(estaOcupada({ fase: "cuenta-atras" })).toBe(true);
    expect(estaOcupada({ fase: "procesando" })).toBe(true);
    expect(estaGrabando({ fase: "grabando" })).toBe(true);
    expect(estaGrabando({ fase: "pausada" })).toBe(true);
    expect(estaGrabando({ fase: "cuenta-atras" })).toBe(false);
  });
});
