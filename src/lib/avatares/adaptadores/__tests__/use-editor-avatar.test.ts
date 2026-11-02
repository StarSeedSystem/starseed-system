/**
 * AV1011B · Pruebas del editor en tiempo real (núcleo puro con reloj inyectado).
 * Sin red, sin disco, sin reloj de pared: guardar y emitir son dobles inyectados.
 */
import { describe, expect, it } from "vitest";
import { adnPorDefecto, type AdnAvatar, type Morfologia } from "@/lib/avatares/adn/adn";
import type { CambioAvatar } from "@/lib/avatares/adn/cambios";
import type { Vinculo } from "@/lib/protomolecula/vinculos-control";
import {
  cambioDeMidi, cambiosDeRespuestaAstraura, claveControlDe, crearEditorAvatar,
  instruccionAstraura, mapeoDeVinculos, type DepsEditor, TOPE_PILA,
} from "../use-editor-avatar";

const base = (): AdnAvatar => adnPorDefecto("adn-test-1", "Prueba", { tipo: "perfil", id: "p1" });
const morfo = (clave: Morfologia, valor: number): CambioAvatar => ({ op: "morfologia", clave, valor });

/** Reloj a mano: `t.avanzar(ms)` hace avanzar el tiempo. */
function reloj(inicial = 0): { ahora: () => number; avanzar: (ms: number) => void } {
  let t = inicial;
  return { ahora: () => t, avanzar: (ms) => { t += ms; } };
}

interface Montura {
  ed: ReturnType<typeof crearEditorAvatar>;
  t: ReturnType<typeof reloj>;
  guardar: AdnAvatar[];
  emitidos: CambioAvatar[][];
  otros: number;
}

/** Monta el editor con almacén y canal de dobles, y con otra gente configurable. */
function montar(o: { conGuardar?: boolean; conEmitir?: boolean; otros?: number; adn?: AdnAvatar } = {}): Montura {
  const t = reloj();
  const m: Montura = {
    ed: null as unknown as Montura["ed"],
    t,
    guardar: [],
    emitidos: [],
    otros: o.otros ?? 0,
  };
  const deps: DepsEditor = {
    ahora: t.ahora,
    ...(o.conGuardar ? { guardar: (a: AdnAvatar) => { m.guardar.push(a); } } : {}),
    ...(o.conEmitir ? { emitir: (lote: CambioAvatar[]) => { m.emitidos.push(lote); } } : {}),
    otrosPresentes: () => m.otros,
  };
  m.ed = crearEditorAvatar(o.adn ?? base(), deps);
  return m;
}

/* ── Aplicar al instante, deshacer y rehacer (pila de ADN, tope 50) ── */

describe("aplicar, deshacer y rehacer", () => {
  it("aplica el cambio al instante y deja la pila lista para deshacer", () => {
    const m = montar({ conGuardar: true, conEmitir: true });
    expect(m.ed.aplicar(morfo("altura", 0.9))).toBe(true);
    const e = m.ed.estado();
    expect(e.adn.morfologia.altura).toBe(0.9);
    expect(e.adn.rev).toBe(1);
    expect(e.sinGuardar).toBe(true);
    expect(e.puedeDeshacer).toBe(true);
    expect(e.puedeRehacer).toBe(false);
  });

  it("un cambio que no cabe en el ADN no entra en la pila ni marca sin guardar", () => {
    const m = montar();
    expect(m.ed.aplicar({ op: "morfología", clave: "altura", valor: 0.9 } as unknown as CambioAvatar)).toBe(false);
    expect(m.ed.aplicar(morfo("altura", Number.NaN))).toBe(false);
    expect(m.ed.estado().sinGuardar).toBe(false);
    expect(m.ed.estado().adn.rev).toBe(0);
  });

  it("deshacer y rehacer devuelven el estado previo por el mismo camino", () => {
    const m = montar({ conEmitir: true });
    m.ed.aplicar(morfo("altura", 0.9));
    expect(m.ed.deshacer()).toBe(true);
    expect(m.ed.estado().adn.morfologia.altura).toBeUndefined();
    expect(m.ed.estado().puedeRehacer).toBe(true);
    m.t.avanzar(100);
    expect(m.ed.rehacer()).toBe(true);
    expect(m.ed.estado().adn.morfologia.altura).toBe(0.9);
    // tras rehacer sí hay de nuevo pasado de dónde tirar
    expect(m.ed.deshacer()).toBe(true);
  });

  it("la pila de deshacer tiene tope 50: más atrás no hay nadie", () => {
    const m = montar();
    for (let i = 0; i <= 60; i++) m.ed.aplicar(morfo("altura", i / 100));
    for (let i = 0; i < TOPE_PILA; i++) expect(m.ed.deshacer()).toBe(true);
    expect(m.ed.deshacer()).toBe(false);
    // Deshacer 50 devuelve al estado justo antes del cambio 11.
    expect(Math.round((m.ed.estado().adn.morfologia.altura ?? 0) * 100)).toBe(10);
  });
});

/* ── Emisión: agrupación por clave, ritmo y nadie mirando ── */

describe("emisión a los presentes", () => {
  it("agrupa por clave: 60 movimientos del mismo deslizador viajan como UNO", () => {
    const m = montar({ conEmitir: true, otros: 2 });
    for (let i = 0; i <= 60; i++) { m.ed.aplicar(morfo("altura", i / 100)); m.t.avanzar(1); }
    const { emitidos } = m.ed.tic();
    expect(emitidos).toHaveLength(1);
    expect(emitidos![0]).toEqual(morfo("altura", 0.6));
    expect(m.emitidos[0]).toEqual(emitidos);
  });

  it("con nadie mirando no emite nada (ni conserva lo pendiente)", () => {
    const m = montar({ conEmitir: true });
    m.ed.aplicar(morfo("altura", 0.3));
    expect(m.ed.tic().emitidos).toBeNull();
    expect(m.emitidos).toHaveLength(0);
    m.otros = 3;
    expect(m.ed.tic().emitidos).toBeNull(); // la cola se vació: un cambio sin público no vuelve a salir
  });

  it("respeta el ritmo de envío (10 Hz con 3 personas): espera su intervalo", () => {
    const m = montar({ conEmitir: true, otros: 3 });
    m.ed.aplicar(morfo("altura", 0.2));
    expect(m.ed.tic().emitidos).toHaveLength(1);
    m.t.avanzar(40); // menos de 100 ms
    m.ed.aplicar(morfo("complexion", 0.9));
    expect(m.ed.tic().emitidos).toBeNull();
    m.t.avanzar(60); // 100 ms desde el envío anterior
    const { emitidos } = m.ed.tic();
    expect(emitidos).toEqual([morfo("complexion", 0.9)]);
  });

  it("sin canal inyectado no se finge el envío: no hay emitidos", () => {
    const m = montar({ otros: 5 });
    m.ed.aplicar(morfo("altura", 0.7));
    expect(m.ed.tic().emitidos).toHaveLength(1);
    expect(m.emitidos).toHaveLength(0);
  });

  it("deshacer también avisa a los presentes (el diff inverso, agrupado)", () => {
    const m = montar({ conEmitir: true, otros: 1 });
    m.ed.aplicar(morfo("altura", 0.9));
    m.ed.tic();
    m.t.avanzar(200);
    m.ed.deshacer();
    m.t.avanzar(200);
    const { emitidos } = m.ed.tic();
    expect(emitidos).toEqual([morfo("altura", 0.5)]);
    expect(m.ed.estado().adn.morfologia.altura).toBeUndefined();
  });
});

/* ── Guardado: 5 s de calma, 30 s entre guardados, guardar al cerrar ── */

describe("guardado en el almacén de AV1011D", () => {
  it("no guarda nada si no se tocó nada", () => {
    const m = montar({ conGuardar: true });
    m.t.avanzar(60_000);
    expect(m.ed.tic().guardo).toBe(false);
    expect(m.guardar).toHaveLength(0);
  });

  it("guarda tras 5 s de calma, y no otra vez hasta 30 s", () => {
    const m = montar({ conGuardar: true });
    m.ed.aplicar(morfo("altura", 0.4));
    m.t.avanzar(4_900);
    expect(m.ed.tic().guardo).toBe(false);
    m.t.avanzar(100);
    expect(m.ed.tic().guardo).toBe(true);
    expect(m.guardar).toHaveLength(1);
    expect(m.guardar[0].morfologia.altura).toBe(0.4);
    m.ed.aplicar(morfo("complexion", 0.2));
    m.t.avanzar(10_000);
    expect(m.ed.tic().guardo).toBe(false);
    m.t.avanzar(20_000);
    expect(m.ed.tic().guardo).toBe(true);
    expect(m.guardar).toHaveLength(2);
  });

  it("mover un deslizador durante la calma pospone el guardado (no guarda a medias)", () => {
    const m = montar({ conGuardar: true });
    m.ed.aplicar(morfo("altura", 0.4));
    m.t.avanzar(3_000);
    m.ed.aplicar(morfo("altura", 0.5));
    m.t.avanzar(3_000);
    expect(m.ed.tic().guardo).toBe(false);
    m.t.avanzar(2_100);
    expect(m.ed.tic().guardo).toBe(true);
  });

  it("cerrar guarda aunque falte la calma; si el almacén falla, lo dice y no finje «guardado»", async () => {
    const t = reloj();
    let fallo = true;
    const guardaMano = (): AdnAvatar[] => [];
    void guardaMano;
    const ed = crearEditorAvatar(base(), { ahora: t.ahora, guardar: () => { if (fallo) throw new Error("disco lleno"); guardaMano(); } });
    ed.aplicar(morfo("altura", 0.3));
    const cierre = await ed.cerrar();
    expect(cierre).toEqual({ ok: false, motivo: "No se pudo guardar el avatar: disco lleno." });
    expect(ed.estado().sinGuardar).toBe(true);
    expect(ed.estado().nota).toMatch(/disco lleno/);
    fallo = false;
    await ed.cerrar();
    expect(ed.estado().sinGuardar).toBe(false);
  });

  it("sin almacén inyectado no se promete guardar (y no lo dice cada tic)", () => {
    const m = montar();
    m.ed.aplicar(morfo("altura", 0.4));
    m.t.avanzar(60_000);
    expect(m.ed.tic().guardo).toBe(false);
  });
});

/* ── Dictado y Astraura ── */

describe("dictado sin modelo (§3.3)", () => {
  it("aplica lo entendido y deja sinEntender lo que no", () => {
    const m = montar();
    const r = m.ed.dictar("pelo azul, ojos verdes y aura dorada, sonríe, ponle alas de mariposa");
    // «pelo azul» y «ojos verdes» son materiales; «aura dorada» es tono del aura; «sonríe» es expresión;
    // «ponle alas de mariposa» solo lo entiende un modelo.
    expect(r.cambios).toBe(9); // 2 materiales + tono + 6 expresiones (una a 1 y el resto a 0)
    expect(r.sinEntender).toEqual(["ponle alas de mariposa"]);
    const e = m.ed.estado();
    expect(e.adn.materiales?.cabello?.color).toBe("#007fff");
    expect(e.adn.materiales?.ojos?.color).toBe("#10b981");
    expect(e.adn.expresionBase.happy).toBe(1);
    expect(e.sinEntender).toEqual(["ponle alas de mariposa"]);
  });

  it("frase vacía o sin nada entendible: no marca sin guardar", () => {
    const m = montar();
    expect(m.ed.dictar("").cambios).toBe(0);
    expect(m.ed.estado().sinGuardar).toBe(false);
    const r = m.ed.dictar("alas de mariposa al viento");
    expect(r.cambios).toBe(0);
    expect(r.sinEntender).toEqual(["alas de mariposa al viento"]);
    expect(m.ed.estado().sinEntender).toEqual(["alas de mariposa al viento"]);
  });
});

describe("Astraura: lo no entendido vuelve como cambios", () => {
  it("sin modelo inyectado lo dice, sin inventar cambios", async () => {
    const m = montar();
    m.ed.dictar("ponle alas");
    const r = await m.ed.preguntarAstraura();
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/Sin modelo disponible/);
    expect(m.ed.estado().sinEntender).not.toHaveLength(0);
  });

  it("con modelo: aplica solo la lista JSON, filtrada con sanearCambio, y limpia lo pendiente", async () => {
    const pedidas: string[] = [];
    const ed = crearEditorAvatar(base(), {
      pedirAstraura: async (instruccion) => {
        pedidas.push(instruccion);
        return 'Claro: [{"op":"morfologia","clave":"altura","valor":0.9},{"op":"morfologia","clave":"flotante","valor":1},{"op":"pieza","slot":"espalda","ref":"https://malo.example/x"}]';
      },
    });
    ed.dictar("ponle alas de mariposa");
    const r = await ed.preguntarAstraura();
    expect(r).toMatchObject({ ok: true, cambios: 1 });
    expect(ed.estado().adn.morfologia.altura).toBe(0.9);
    expect(ed.estado().sinEntender).toHaveLength(0);
    expect(pedidas[0]).toMatch(/^Convierte las frases/);
    expect(pedidas[0]).toMatch(/ÚNICAMENTE con una lista JSON/);
  });

  it("respuesta sin JSON válido o sin cambios de ADN: se dice y no se aplica nada", async () => {
    const ed = crearEditorAvatar(base(), { pedirAstraura: async () => "No entiendo nada." });
    ed.dictar("ponle alas");
    const r = await ed.preguntarAstraura();
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/ningún cambio válido/);
    expect(ed.estado().adn.rev).toBe(0);
  });
});

/* ── MIDI: Protomolécula si la hay, y CC → deslizador elegido ── */

describe("MIDI", () => {
  it("cambioDeMidi: CC 0–127 → deslizador 0–1, y el bruto inválido no entra", () => {
    expect(cambioDeMidi(127, "morfologia:altura")).toEqual({ op: "morfologia", clave: "altura", valor: 1 });
    expect(cambioDeMidi(0, "movimiento:energia")).toEqual({ op: "movimiento", campo: "energia", valor: 0 });
    expect(cambioDeMidi(64, "aura:intensidad")).toEqual({ op: "aura", campo: "intensidad", valor: expect.closeTo(0.5, 2) });
  });

  it("el mapeo de la Protomolécula se usa sin pedirlo de nuevo; lo que no es del avatar se ignora", () => {
    const vinculos = [
      { id: "v1", fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 20 }, objetivo: { atomoId: "a", parametroId: "morfologia:altura" }, modo: "absoluto", curva: { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0 }, activo: true, creadoPor: "x" },
      { id: "v2", fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 21 }, objetivo: { atomoId: "a", parametroId: "filtro.brillo" }, modo: "absoluto", curva: { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0 }, activo: true, creadoPor: "x" },
      { id: "v3", fuente: { tipo: "midi", mensaje: "cc", canal: 1, numero: 22 }, objetivo: { atomoId: "a", parametroId: "morfologia:cabeza" }, modo: "absoluto", curva: { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0 }, activo: false, creadoPor: "x" },
    ] as unknown as readonly Vinculo[];
    const mapeo = mapeoDeVinculos(vinculos);
    expect(Object.keys(mapeo)).toEqual(["20"]);
    const m = montar();
    m.ed.fijaMidi(20, "morfologia:altura");
    expect(m.ed.midi(20, 127)).toBe(true);
    expect(m.ed.estado().adn.morfologia.altura).toBe(1);
    expect(m.ed.midi(21, 50)).toBe(false); // sin clave asignada, no toca nada
  });

  it("la clave elegida en la interfaz solo es de la lista de deslizadores del editor", () => {
    expect(claveControlDe("movimiento:ritmo")).toBe("movimiento:ritmo");
    expect(claveControlDe("aura:intensidad")).toBe("aura:intensidad");
    expect(claveControlDe("volumen.del.sistema")).toBeNull();
    expect(claveControlDe(null)).toBeNull();
  });
});

/* ── Ayudantes puros del diálogo con el modelo ── */

describe("ayudantes puros", () => {
  it("cambiosDeRespuestaAstraura acepta lista pura u objeto {cambios} y descarta lo que no cabe", () => {
    const lista = [
      { op: "morfologia", clave: "hombros", valor: 0.3 },
      { op: "visibilidad", valor: "publico" },
      "basura",
    ];
    expect(cambiosDeRespuestaAstraura(lista)).toMatchObject({ cambios: [{ op: "morfologia", clave: "hombros", valor: 0.3 }, { op: "visibilidad", valor: "publico" }], descartados: 1 });
    expect(cambiosDeRespuestaAstraura({ cambios: lista })).toMatchObject({ cambios: [ { op: "morfologia", clave: "hombros" }, { op: "visibilidad", valor: "publico" } ], descartados: 1 });
    expect(cambiosDeRespuestaAstraura(null)).toEqual({ cambios: [], descartados: 1 });
  });

  it("instruccionAstraura pide SOLO la lista JSON y cita el vocabulario válido", () => {
    const i = instruccionAstraura(["ponle alas"], base());
    expect(i).toMatch(/ÚNICAMENTE con una lista JSON/);
    expect(i).toContain("estilizado");
    expect(i).toContain("biblioteca:<id>");
    expect(i).toContain('"ponle alas"');
  });
});
