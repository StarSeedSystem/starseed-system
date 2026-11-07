/**
 * Señalización WebRTC por el canal local de la app nativa (MLT1107A, puro): quién ofrece, la máquina
 * de estados (con ofertas cruzadas, topes, fallos y reintentos) y los mensajes `nl.sen`.
 * Contrato: architecture/datos-por-la-malla.md §6.
 */
import { describe, expect, it } from "vitest";
import {
  SENAL_INICIAL,
  TOPE_FASE_MS,
  esperaReintento,
  leerSenal,
  pasoSenal,
  quienOfrece,
  textoSenal,
  type EstadoSenal,
  type EventoSenal,
} from "@/lib/malla/senal-nativa";

const tic = (ahora: number, p: Partial<Extract<EventoSenal, { t: "tic" }>> = {}): EventoSenal => ({
  t: "tic",
  ahora,
  posible: true,
  ofrezco: true,
  enlaceAbierto: false,
  sesionNueva: `nativo-s${ahora}xx`,
  ...p,
});

/** Aplica una lista de eventos y devuelve el estado y TODAS las acciones (en orden). */
function correr(eventos: EventoSenal[], e: EstadoSenal = SENAL_INICIAL) {
  const acciones: unknown[] = [];
  for (const ev of eventos) {
    const r = pasoSenal(e, ev);
    e = r.estado;
    acciones.push(...r.acciones);
  }
  return { e, acciones };
}

describe("quién ofrece y cuánto se espera", () => {
  it("ofrece la neurona de id menor: las dos llegan a lo mismo", () => {
    expect(quienOfrece("N-A", "N-B")).toBe(true);
    expect(quienOfrece("N-B", "N-A")).toBe(false);
  });

  it("reintentos 15 s · 2ⁿ hasta 10 min", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(esperaReintento)).toEqual([15_000, 30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000]);
  });
});

describe("pasoSenal — el camino feliz en los dos lados", () => {
  it("quien ofrece: oferta → espera → respuesta → completar → abierta", () => {
    const { e, acciones } = correr([
      tic(0),
      { t: "oferta-enviada", sesion: "nativo-s0xx", ahora: 100 },
      { t: "respuesta-recibida", sesion: "nativo-s0xx", ahora: 900 },
      { t: "abierta", sesion: "nativo-s0xx", ahora: 1_500 },
    ]);
    expect(acciones).toEqual([
      { a: "ofrecer", sesion: "nativo-s0xx" },
      { a: "completar", sesion: "nativo-s0xx" },
    ]);
    expect(e).toMatchObject({ fase: "abierta", sesion: "nativo-s0xx", intentos: 0 });
    expect(textoSenal(e)).toMatch(/abierto/);
  });

  it("quien responde no ofrece nunca: espera la oferta, responde y queda abierta", () => {
    const { e, acciones } = correr([
      tic(0, { ofrezco: false }),
      tic(5_000, { ofrezco: false }),
      { t: "oferta-recibida", sesion: "nativo-otra1", ahora: 6_000, ofrezco: false },
      { t: "respuesta-enviada", sesion: "nativo-otra1", ahora: 6_500 },
      { t: "abierta", sesion: "nativo-otra1", ahora: 7_000 },
    ]);
    expect(acciones).toEqual([{ a: "responder", sesion: "nativo-otra1" }]);
    expect(e.fase).toBe("abierta");
  });

  it("con un enlace ya abierto (p. ej. por QR) no se abre otro; si se cae, se vuelve a intentar enseguida", () => {
    const a = correr([tic(0, { enlaceAbierto: true })]);
    expect(a.acciones).toEqual([]);
    expect(a.e.fase).toBe("abierta");
    const b = correr([tic(10_000, { enlaceAbierto: false }), tic(15_000)], a.e);
    expect(b.acciones).toEqual([{ a: "ofrecer", sesion: "nativo-s15000xx" }]);
  });
});

describe("pasoSenal — fallos, topes y ofertas cruzadas", () => {
  it("si el otro no contesta a tiempo: fallida, se cancela avisando y se espera 15 s, luego 30 s", () => {
    const tope = TOPE_FASE_MS["esperando-respuesta"];
    const a = correr([tic(0), { t: "oferta-enviada", sesion: "nativo-s0xx", ahora: 10 }, tic(10 + tope + 1)]);
    expect(a.e).toMatchObject({ fase: "fallida", intentos: 1, reintentoEn: 10 + tope + 1 + 15_000 });
    expect(a.e.motivo).toMatch(/no contestó/);
    expect(a.acciones.at(-1)).toEqual({ a: "cancelar", sesion: "nativo-s0xx", avisar: true });
    const antes = correr([tic(a.e.reintentoEn - 1)], a.e);
    expect(antes.acciones).toEqual([]);
    const luego = correr([tic(a.e.reintentoEn), { t: "fallo", sesion: `nativo-s${a.e.reintentoEn}xx`, ahora: a.e.reintentoEn + 5, motivo: "sin red" }], a.e);
    expect(luego.e).toMatchObject({ fase: "fallida", intentos: 2, motivo: "sin red", reintentoEn: a.e.reintentoEn + 5 + 30_000 });
  });

  it("oferta cruzada: quien tiene prioridad ignora la ajena; quien no, cancela la suya y responde", () => {
    const enCurso = correr([tic(0), { t: "oferta-enviada", sesion: "nativo-s0xx", ahora: 10 }]).e;
    expect(pasoSenal(enCurso, { t: "oferta-recibida", sesion: "nativo-ajena", ahora: 20, ofrezco: true }).acciones).toEqual([]);
    const r = pasoSenal(enCurso, { t: "oferta-recibida", sesion: "nativo-ajena", ahora: 20, ofrezco: false });
    expect(r.acciones).toEqual([
      { a: "cancelar", sesion: "nativo-s0xx", avisar: false },
      { a: "responder", sesion: "nativo-ajena" },
    ]);
    expect(r.estado).toMatchObject({ fase: "respondiendo", sesion: "nativo-ajena" });
  });

  it("una oferta repetida no se responde dos veces; una nueva sustituye a la vieja", () => {
    const resp = correr([{ t: "oferta-recibida", sesion: "nativo-uno111", ahora: 0, ofrezco: false }]).e;
    expect(pasoSenal(resp, { t: "oferta-recibida", sesion: "nativo-uno111", ahora: 5, ofrezco: false }).acciones).toEqual([]);
    expect(pasoSenal(resp, { t: "oferta-recibida", sesion: "nativo-dos222", ahora: 5, ofrezco: false }).acciones).toEqual([
      { a: "cancelar", sesion: "nativo-uno111", avisar: false },
      { a: "responder", sesion: "nativo-dos222" },
    ]);
  });

  it("lo de otra sesión (respuestas viejas, aperturas ajenas) no cambia nada", () => {
    const esperando = correr([tic(0), { t: "oferta-enviada", sesion: "nativo-s0xx", ahora: 10 }]).e;
    expect(pasoSenal(esperando, { t: "respuesta-recibida", sesion: "nativo-vieja", ahora: 20 }).estado).toBe(esperando);
    expect(pasoSenal(esperando, { t: "abierta", sesion: "nativo-vieja", ahora: 20 }).estado).toBe(esperando);
    expect(pasoSenal(esperando, { t: "fallo", sesion: "nativo-vieja", ahora: 20, motivo: "x" }).estado).toBe(esperando);
  });

  it("si el otro cancela: en curso → fallida sin avisarle; abierta → se cierra y se reintenta", () => {
    const esperando = correr([tic(0), { t: "oferta-enviada", sesion: "nativo-s0xx", ahora: 10 }]).e;
    const r = pasoSenal(esperando, { t: "cierre-recibido", sesion: "nativo-s0xx", ahora: 30 });
    expect(r.estado).toMatchObject({ fase: "fallida", intentos: 1 });
    expect(r.acciones).toEqual([{ a: "cancelar", sesion: "nativo-s0xx", avisar: false }]);
    const abierta = correr([{ t: "abierta", sesion: "nativo-s0xx", ahora: 40 }], { ...esperando, fase: "conectando" }).e;
    const c = pasoSenal(abierta, { t: "cierre-recibido", sesion: "nativo-s0xx", ahora: 50 });
    expect(c.estado).toMatchObject({ fase: "inactiva", reintentoEn: 50 });
  });

  it("si deja de ser posible (se pierde la ligadura) cancela lo que estuviera en curso", () => {
    const esperando = correr([tic(0), { t: "oferta-enviada", sesion: "nativo-s0xx", ahora: 10 }]).e;
    const r = pasoSenal(esperando, tic(20, { posible: false }));
    expect(r.estado.fase).toBe("inactiva");
    expect(r.acciones).toEqual([{ a: "cancelar", sesion: "nativo-s0xx", avisar: true }]);
    expect(pasoSenal(SENAL_INICIAL, tic(0, { posible: false })).acciones).toEqual([]);
  });
});

describe("leerSenal — solo mensajes bien formados", () => {
  const base = { t: "nl.sen", v: 1, k: "oferta", s: "nativo-abc123", de: "N-A", para: "N-B", sdp: "v=0\r\n", n: "Mac", ts: 1 };

  it("acepta oferta, respuesta y cierre (este sin SDP)", () => {
    expect(leerSenal(base)).toEqual(base);
    expect(leerSenal({ ...base, k: "respuesta" })).toMatchObject({ k: "respuesta", sdp: "v=0\r\n" });
    const cierre = leerSenal({ t: "nl.sen", v: 1, k: "cierre", s: "nativo-abc123", de: "N-A", para: "N-B", ts: 1 });
    expect(cierre).toMatchObject({ k: "cierre" });
    expect(cierre).not.toHaveProperty("sdp");
  });

  it("rechaza sesiones que no son del canal nativo, SDP raros o enormes y tipos desconocidos", () => {
    expect(leerSenal({ ...base, s: "abc123" })).toBeNull();
    expect(leerSenal({ ...base, s: "nativo-../../x" })).toBeNull();
    expect(leerSenal({ ...base, sdp: "hola" })).toBeNull();
    expect(leerSenal({ ...base, sdp: `v=0${"a".repeat(30_000)}` })).toBeNull();
    expect(leerSenal({ ...base, k: "otra" })).toBeNull();
    expect(leerSenal({ ...base, para: "" })).toBeNull();
  });
});
