import { describe, it, expect } from "vitest";
import {
  SALIDAS, PLANTILLAS, escenaDesdePlantilla, adaptarEscena, validarFuente,
  moverCapa, alternarCapa, volumenCapa,
  type Fuente, type Escena, type Salida,
} from "../estudio-escenas";

const imagen: Fuente = { id: "f-img", tipo: "imagen", etiqueta: "Fondo", url: "https://ejemplo.com/a.png" };
const cam1: Fuente = { id: "f-cam1", tipo: "camara", etiqueta: "Cámara 1" };
const cam2: Fuente = { id: "f-cam2", tipo: "camara", etiqueta: "Cámara 2" };
const pantalla: Fuente = { id: "f-pan", tipo: "pantalla", etiqueta: "Pantalla" };
const micro: Fuente = { id: "f-mic", tipo: "microfono", etiqueta: "Micrófono" };
const rotulo: Fuente = { id: "f-rot", tipo: "texto", etiqueta: "Rótulo", texto: "EN DIRECTO" };

const FUENTES: Record<string, Fuente[]> = {
  presentador: [cam1],
  "pantalla-camara": [pantalla, cam1],
  "entrevista-2": [cam1, cam2],
  "solo-audio": [micro],
  rotulo: [imagen, rotulo],
};

const enRango = (e: Escena) =>
  e.capas.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.ancho <= 1.000001 && c.y + c.alto <= 1.000001
    && c.ancho > 0 && c.alto > 0);

const mismaProporcion = (antes: Escena, despues: Escena, s: Salida) =>
  antes.capas.length === despues.capas.length && despues.capas.every((c, i) => {
    const o = antes.capas[i];
    if (o.x === 0 && o.y === 0 && o.ancho >= 1 && o.alto >= 1) return true; // pantalla completa
    const ref = 16 / 9;
    const arAntes = (o.ancho * ref) / o.alto;
    const arDespues = (c.ancho * s.ancho) / (c.alto * s.alto || 1);
    return Math.abs(arAntes - arDespues) < 0.05;
  });

describe("plantillas y salidas", () => {
  it("SALIDAS cumple el contrato", () => {
    expect(SALIDAS.horizontal).toMatchObject({ ancho: 1920, alto: 1080, fps: 30 });
    expect(SALIDAS.vertical).toMatchObject({ ancho: 1080, alto: 1920, fps: 30 });
    expect(SALIDAS.cuadrada).toMatchObject({ ancho: 1080, alto: 1080, fps: 30 });
    expect(SALIDAS["solo-audio"]).toMatchObject({ ancho: 0, alto: 0 });
    expect(SALIDAS["malla-baja"]).toMatchObject({ ancho: 640, alto: 360, fps: 15 });
    expect(SALIDAS["malla-baja"].kbpsMax).toBeLessThanOrEqual(300);
  });

  it.each(Object.keys(PLANTILLAS))("la plantilla %s cabe en cada salida sin deformarse", (id) => {
    const escena = escenaDesdePlantilla(id, FUENTES[id]);
    for (const s of Object.values(SALIDAS)) {
      const adaptada = adaptarEscena(escena, s);
      if (s.id === "solo-audio") {
        expect(adaptada.capas.every((c) => c.fuente.tipo !== "imagen" && c.fuente.tipo !== "texto")).toBe(true);
        continue;
      }
      expect(enRango(adaptada)).toBe(true);
      expect(mismaProporcion(escena, adaptada, s)).toBe(true);
    }
  });

  it("pantalla completa sigue a pantalla completa en vertical", () => {
    const escena = escenaDesdePlantilla("pantalla-camara", FUENTES["pantalla-camara"]);
    const a = adaptarEscena(escena, SALIDAS.vertical);
    const fondo = a.capas.find((c) => c.fuente.tipo === "pantalla")!;
    expect(fondo).toMatchObject({ x: 0, y: 0, ancho: 1, alto: 1 });
  });

  it("solo-audio deja solo capas con audio", () => {
    const escena = escenaDesdePlantilla("rotulo", FUENTES.rotulo);
    expect(adaptarEscena(escena, SALIDAS["solo-audio"]).capas).toHaveLength(0);
    const pc = escenaDesdePlantilla("pantalla-camara", FUENTES["pantalla-camara"]);
    expect(adaptarEscena(pc, SALIDAS["solo-audio"]).capas).toHaveLength(2);
  });

  it("falla si falta una fuente del tipo pedido", () => {
    expect(() => escenaDesdePlantilla("entrevista-2", [cam1])).toThrow(/camara/);
    expect(() => escenaDesdePlantilla("nope", [])).toThrow(/Plantilla desconocida/);
  });
});

describe("validarFuente", () => {
  it("exige https en imagen y enlace", () => {
    expect(validarFuente({ id: "a", tipo: "imagen", etiqueta: "x", url: "http://inseguro.com/a.png" })).not.toHaveLength(0);
    expect(validarFuente({ id: "a", tipo: "enlace", etiqueta: "x" })).not.toHaveLength(0);
    expect(validarFuente({ id: "a", tipo: "enlace", etiqueta: "x", url: "https://ok.com" })).toHaveLength(0);
  });

  it("exige ruta interna con / en estacion-interna", () => {
    expect(validarFuente({ id: "a", tipo: "estacion-interna", etiqueta: "x", ruta: "estaciones/1" })).not.toHaveLength(0);
    expect(validarFuente({ id: "a", tipo: "estacion-interna", etiqueta: "x", ruta: "/estaciones/1" })).toHaveLength(0);
  });

  it("exige texto en el rótulo e id/etiqueta siempre", () => {
    expect(validarFuente({ id: "a", tipo: "texto", etiqueta: "x", texto: "  " })).not.toHaveLength(0);
    expect(validarFuente({ id: "", tipo: "camara", etiqueta: "" })).not.toHaveLength(0);
    expect(validarFuente(cam1)).toHaveLength(0);
  });
});

describe("capas inmutables", () => {
  const base = escenaDesdePlantilla("pantalla-camara", FUENTES["pantalla-camara"]);
  const camara = base.capas.find((c) => c.fuente.tipo === "camara")!;

  it("moverCapa mueve y sujeta al lienzo sin tocar la escena original", () => {
    const movida = moverCapa(base, camara.id, 0.1, -1);
    expect(movida).not.toBe(base);
    expect(base.capas.find((c) => c.id === camara.id)!.x).toBe(camara.x);
    const c = movida.capas.find((x) => x.id === camara.id)!;
    expect(c.x + c.ancho).toBeLessThanOrEqual(1);
    expect(c.y).toBe(0);
  });

  it("alternarCapa y volumenCapa no mutan y limitan el volumen a 0..1", () => {
    const apagada = alternarCapa(base, camara.id);
    expect(apagada.capas.find((c) => c.id === camara.id)!.visible).toBe(false);
    expect(base.capas.find((c) => c.id === camara.id)!.visible).toBe(true);
    const alta = volumenCapa(base, camara.id, 9);
    expect(alta.capas.find((c) => c.id === camara.id)!.volumen).toBe(1);
    const baja = volumenCapa(base, camara.id, -2);
    expect(baja.capas.find((c) => c.id === camara.id)!.volumen).toBe(0);
  });
});
