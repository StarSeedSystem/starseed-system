import { describe, expect, it } from "vitest";
import { MAX_RESPALDO, capaDeTarea, repartir, type EntradaReparto } from "../reparto-de-modelo";

const base = (o: Partial<EntradaReparto> = {}): EntradaReparto => ({
  tarea: "conversacion", dificultad: "media", medio: "pwa", privacidad: "privada", conexion: "rapida",
  origen: "astraura", capasLocales: ["reflejo", "memoria", "palabra"],
  remotas: [{ capa: "razon", donde: "par" }, { capa: "razon", donde: "servidor-starseed" }, { capa: "profunda", donde: "servidor-starseed" }],
  externas: [{ id: "openrouter/gratis", gratis: true, costeTurno: 0 }, { id: "pago/caro", gratis: false, costeTurno: 5 }],
  presupuesto: { disponible: 100, reserva: 20 },
  preferencias: { nivelador: 0 },
  ...o,
});

describe("capaDeTarea", () => {
  it("cada tarea tiene su papel", () => {
    expect(capaDeTarea("herramienta", "baja")).toBe("reflejo");
    expect(capaDeTarea("conversacion", "media")).toBe("palabra");
    expect(capaDeTarea("codigo", "media")).toBe("razon");
    expect(capaDeTarea("codigo", "alta")).toBe("profunda");
    expect(capaDeTarea("vision", "baja")).toBe("profunda");
    expect(capaDeTarea("voz", "alta")).toBe("voz");
  });
});

describe("repartir", () => {
  it("por defecto responde Astraura local (Bonsai) en el propio aparato", () => {
    const p = repartir(base());
    expect(p).toMatchObject({ motor: "bonsai", donde: "local", capa: "palabra" });
  });
  it("lo privado nunca sale a una API externa ni a un servidor StarSeed", () => {
    const p = repartir(base({ tarea: "codigo" }));
    const todos = [p, ...p.respaldo];
    expect(todos.some((x) => x.donde === "api-externa" || x.donde === "servidor-starseed")).toBe(false);
    expect(p).toMatchObject({ donde: "par", capa: "razon" });
  });
  it("si es público y el nivelador pide APIs, va primero la gratuita", () => {
    const p = repartir(base({ privacidad: "publica", preferencias: { nivelador: 0.9 } }));
    expect(p).toMatchObject({ motor: "api-externa", modelo: "openrouter/gratis" });
    expect(p.respaldo[0].modelo).toBe("pago/caro");
  });
  it("nunca gasta crédito de pago por debajo de la reserva", () => {
    const p = repartir(base({ privacidad: "publica", preferencias: { nivelador: 1 }, presupuesto: { disponible: 24, reserva: 20 } }));
    expect([p, ...p.respaldo].some((x) => x.modelo === "pago/caro")).toBe(false);
  });
  it("la API que eligió la persona va por delante entre las externas", () => {
    const p = repartir(base({ privacidad: "publica", preferencias: { nivelador: 1, externaFija: "pago/caro" } }));
    expect(p.modelo).toBe("pago/caro");
  });
  it("sin conexión solo lo local; sin capa local, lo dice y no inventa", () => {
    const p = repartir(base({ conexion: "sin", tarea: "vision", privacidad: "publica" }));
    expect(p.motor).toBe("ninguno");
    expect(p.motivo).toContain("Sin conexión");
  });
  it("si falta la capa ideal, baja a una más ligera local antes que nada", () => {
    const p = repartir(base({ tarea: "codigo", remotas: [] }));
    expect(p).toMatchObject({ capa: "palabra", donde: "local" });
  });
  it("una capa apagada no se usa", () => {
    const p = repartir(base({ preferencias: { nivelador: 0, apagadas: ["palabra"] } }));
    expect(p.capa).not.toBe("palabra");
  });
  it("herramientas: primero el reflejo (Needle), luego Laya y Jev; en un juicio, Jev primero", () => {
    const h = repartir(base({ tarea: "herramienta", capasLocales: ["reflejo", "razon"] }));
    expect([h.motor, h.respaldo[0].motor, h.respaldo[1].motor]).toEqual(["needle", "laya", "jev"]);
    const j = repartir(base({ tarea: "juicio", capasLocales: ["reflejo", "razon"] }));
    expect(j.motor).toBe("jev");
  });
  it("un bot invitado responde con su propio modelo", () => {
    expect(repartir(base({ origen: "externo" })).motor).toBe("invitado");
  });
  it("el respaldo nunca pasa de cuatro pasos", () => {
    const externas = Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, gratis: true, costeTurno: 0 }));
    const p = repartir(base({ privacidad: "publica", externas }));
    expect(p.respaldo.length).toBeLessThanOrEqual(MAX_RESPALDO);
  });
});
