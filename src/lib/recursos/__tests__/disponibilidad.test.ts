// Rescate de la rama nube/a1-20261023-184106 (tarea RTAPM1017U) · casos adaptados a la API de
// hoy: la rama probaba codificar/decodificar/fusionar/quienTiene por índices sueltos, main los
// substituyó por anuncios troceados con registro. Se rescatan tres bordes no cubiertos: la
// cadena vacía de base64, fusionar sin nada y anunciar sin tener piezas. Lo demás ya está
// cubierto con otro nombre (ida y vuelta, troceado, caducidad, unión por nodo).
import { describe, it, expect } from "vitest";
import {
  TOPE_MENSAJE_BYTES,
  CADUCIDAD_POR_DEFECTO_MS,
  AnuncioDisponibilidad,
  AnuncioRecibido,
  codificar,
  decodificar,
  crearBits,
  marcarIndice,
  tieneIndice,
  pesoTexto,
  anuncio,
  fusionar,
  quienTiene,
} from "../disponibilidad";

describe("disponibilidad.ts", () => {
  describe("codificar y decodificar (base64 puro)", () => {
    it("ida y vuelta con bytes variados", () => {
      const bytes = new Uint8Array([0, 1, 2, 254, 255, 7, 130, 85]);
      expect(decodificar(codificar(bytes))).toEqual(bytes);
    });

    it("casos conocidos", () => {
      expect(codificar(new Uint8Array([]))).toBe("");
      expect(codificar(new Uint8Array([1]))).toBe("AQ==");
      expect(codificar(new Uint8Array([255]))).toBe("/w==");
      expect(codificar(new Uint8Array([65, 66, 67]))).toBe("QUJD");
      expect([...decodificar("QUJD")]).toEqual([65, 66, 67]);
    });

    it("falla con un carácter fuera del alfabeto", () => {
      expect(() => decodificar("A#==")).toThrow(/base64/);
    });

    it("una cadena vacía decodifica a un mapa vacío", () => {
      expect([...decodificar("")]).toEqual([]);
    });
  });

  describe("mapa de bits", () => {
    it("marca y consulta índices", () => {
      const bits = crearBits(17);
      marcarIndice(bits, 0);
      marcarIndice(bits, 7);
      marcarIndice(bits, 9);
      marcarIndice(bits, 16);
      expect(tieneIndice(bits, 0)).toBe(true);
      expect(tieneIndice(bits, 7)).toBe(true);
      expect(tieneIndice(bits, 9)).toBe(true);
      expect(tieneIndice(bits, 16)).toBe(true);
      expect(tieneIndice(bits, 1)).toBe(false);
      expect(tieneIndice(bits, 8)).toBe(false);
      expect(bits.length).toBe(3);
    });
  });

  describe("anuncio (troceado al tope de 1 KB)", () => {
    it("un conjunto pequeño cabe en un solo tramo", () => {
      const piezas = anuncio("nodo-a", "transmision-1", 9, [0, 4, 8], 1000);
      expect(piezas.length).toBe(1);
      expect(piezas[0].nodo).toBe("nodo-a");
      expect(piezas[0].elemento).toBe("transmision-1");
      expect(piezas[0].desde).toBe(0);
      expect(piezas[0].hasta).toBe(8);
      expect(piezas[0].total).toBe(9);
      expect(piezas[0].t).toBe(1000);
      const bits = decodificar(piezas[0].bits);
      expect(tieneIndice(bits, 0)).toBe(true);
      expect(tieneIndice(bits, 4)).toBe(true);
      expect(tieneIndice(bits, 8)).toBe(true);
      expect(tieneIndice(bits, 1)).toBe(false);
    });

    it("splitea al crecer y cada mensaje queda dentro de 1 KB", () => {
      const tengo: number[] = [];
      for (let i = 0; i < 400; i++) tengo.push(i * 41); // dispersos: el mapa de bits crece de prisa
      const piezas = anuncio("nodo-largo", "volumen-x", 17000, tengo, 5);
      expect(piezas.length).toBeGreaterThan(1);
      for (const p of piezas) {
        expect(pesoTexto(JSON.stringify(p))).toBeLessThanOrEqual(TOPE_MENSAJE_BYTES);
      }
      // todos los índices aparecen exactamente una vez y en orden creciente
      const vistos: number[] = [];
      for (const p of piezas) {
        const bits = decodificar(p.bits);
        for (let i = 0; i < p.total; i++) {
          if (i < p.desde || i > p.hasta) continue;
          if (tieneIndice(bits, i - p.desde)) vistos.push(i);
        }
      }
      expect(vistos).toEqual(tengo);
      // los tramos no se solapan
      for (let i = 1; i < piezas.length; i++) {
        expect(piezas[i].desde).toBeGreaterThan(piezas[i - 1].hasta);
      }
    });

    it("ordena, quita repetidos y descarta índices fuera de rango", () => {
      const piezas = anuncio("nodo", "e", 10, [9, 2, 2, 12, -1], 0);
      const bits = decodificar(piezas[0].bits);
      expect(vistosDe(piezas[0], bits)).toEqual([2, 9]);
    });

    it("sin piezas no anuncia nada", () => {
      const piezas = anuncio("nodo-vacio", "volumen-z", 10, [], 0);
      expect(piezas.length).toBe(0);
    });
  });

  describe("fusionar y quienTiene", () => {
    const AHORA = 60_000;

    const recibidos = (uno: AnuncioDisponibilidad[], dos: AnuncioDisponibilidad[]): AnuncioRecibido[] => [
      ...uno.map((a) => ({ anuncio: a, recibidoEn: AHORA - 20_000 })),
      ...dos.map((a) => ({ anuncio: a, recibidoEn: AHORA - 5_000 })),
    ];

    it("fusionar sin nada devuelve un registro vacío", () => {
      const registro = fusionar([]);
      expect(registro.size).toBe(0);
    });

    it("une piezas de dos nodos y sirve el índice a quien corresponden", () => {
      const uno = fusionar(
        recibidos(
          anuncio("nodo-a", "t1", 9, [0, 1, 2], 1000),
          anuncio("nodo-b", "t1", 9, [4], 2000),
        ),
      );
      expect(quienTiene(uno, "t1", 4, AHORA)).toEqual(["nodo-b"]);
      expect(quienTiene(uno, "t1", 2, AHORA)).toEqual(["nodo-a"]);
      expect(quienTiene(uno, "t1", 3, AHORA)).toEqual([]);
      // el elemento que no existe no da nada
      expect(quienTiene(uno, "otro", 0, AHORA)).toEqual([]);
      expect(quienTiene(uno, "t1", -1, AHORA)).toEqual([]);
    });

    it("ordena por emisión más nueva primero", () => {
      const reg = fusionar(
        recibidos(
          anuncio("viejo", "t2", 3, [0], 100),
          anuncio("nuevo", "t2", 3, [0], 900),
        ),
      );
      expect(quienTiene(reg, "t2", 0, AHORA)).toEqual(["nuevo", "viejo"]);
    });

    it("caduca a los 30 s por defecto y se extiende con un tope dado", () => {
      const reg = fusionar(
        recibidos(
          anuncio("caduco", "t3", 3, [0], 100),
          anuncio("fresco", "t3", 3, [0], 900),
        ),
      );
      // viejo recibido hace 20 s: fresco con el defecto; a los 21 s del reloj falla
      expect(quienTiene(reg, "t3", 0, AHORA)).toEqual(["fresco", "caduco"]);
      expect(quienTiene(reg, "t3", 0, AHORA + 1_000, CADUCIDAD_POR_DEFECTO_MS).sort()).toEqual(["caduco", "fresco"]);
      expect(quienTiene(reg, "t3", 0, AHORA + 16_000, CADUCIDAD_POR_DEFECTO_MS)).toEqual(["fresco"]);
      // con un tope de 60 s, ambos siguen vivos
      expect(quienTiene(reg, "t3", 0, AHORA + 16_000, 60_000).sort()).toEqual(["caduco", "fresco"]);
      // caducidad 0: nadie
      expect(quienTiene(reg, "t3", 0, AHORA, 0)).toEqual([]);
    });

    it("une piezas de un mismo nodo y las más nuevas ganan en caducidad", () => {
      const reg = fusionar([
        { anuncio: anuncio("solo", "t4", 12, [0, 1], 100)[0], recibidoEn: AHORA - 40_000 },
        { anuncio: anuncio("solo", "t4", 12, [8, 9], 200)[0], recibidoEn: AHORA - 10_000 },
      ]);
      expect(quienTiene(reg, "t4", 0, AHORA)).toEqual(["solo"]);
      const almacenado = reg.get("t4")?.orden.get("solo");
      expect(almacenado?.recibidoEn).toBe(AHORA - 10_000);
      expect(almacenado?.t).toBe(200);
      expect([...reg.get("t4")!.orden.get("solo")!.bits.slice(0, 2)]).toEqual([3, 3]);
    });
  });
});

function vistosDe(p: AnuncioDisponibilidad, bits: Uint8Array): number[] {
  const salida: number[] = [];
  for (let i = p.desde; i <= p.hasta && i < p.total; i++) {
    if (tieneIndice(bits, i - p.desde)) salida.push(i);
  }
  return salida;
}
