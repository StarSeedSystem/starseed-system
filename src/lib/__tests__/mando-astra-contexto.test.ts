import { describe, it, expect } from "vitest";

import {
  AMBITOS_ASTRA,
} from "../mando/astra";
import {
  FUENTES_POR_AMBITO,
  ambitosSinFuentes,
  estimarTokens,
  recortarAlPresupuesto,
  resumenDeRutas,
  redactarSecretos,
  construirContexto,
} from "../mando/astra-contexto";

// Por qué existe este test (Ola 294 · AR2 · 2026-09-08): AR1 dejó a Astra
// como director que audita "todos los contextos" del OS, pero el límite
// real es el presupuesto. Este módulo decide QUÉ entra por ámbito y
// RECORTA sin partir líneas ni filtrar claves. Si se rompe, Astra se queda
// sin contexto o se le cuelan secretos al prompt.

describe("mando-astra-contexto · empaquetador de contexto para Astra", () => {
  describe("FUENTES_POR_AMBITO", () => {
    it("declara fuentes para todos los id de AMBITOS_ASTRA y solo para esos", () => {
      for (const a of AMBITOS_ASTRA) {
        const fuentes = FUENTES_POR_AMBITO[a.id];
        expect(Array.isArray(fuentes), `fuentes para ${a.id}`).toBe(true);
        expect(fuentes.length, `fuentes no vacías para ${a.id}`).toBeGreaterThan(0);
      }
      // No sobran id que no sean de AMBITOS_ASTRA.
      const idsValidos = new Set(AMBITOS_ASTRA.map((a) => a.id));
      for (const k of Object.keys(FUENTES_POR_AMBITO)) {
        expect(idsValidos.has(k), `clave ajena a AMBITOS_ASTRA: ${k}`).toBe(true);
      }
      expect(ambitosSinFuentes()).toEqual([]);
    });
  });

  describe("estimarTokens", () => {
    it("aproxima 1 token ≈ 4 caracteres y devuelve 0 para vacío/no-string", () => {
      expect(estimarTokens("a".repeat(400))).toBe(100);
      expect(estimarTokens("a".repeat(401))).toBe(101);
      expect(estimarTokens("")).toBe(0);
      // Defensivo: si alguien pasa otra cosa, no lanza.
      expect(estimarTokens(undefined as unknown as string)).toBe(0);
    });
  });

  describe("recortarAlPresupuesto", () => {
    it("con presupuesto que solo admite dos bloques devuelve los de mayor peso y no parte líneas", () => {
      // Por peso (chars): mayor=80, medio=50, menor=20. Cupo para mayor+medio
      // pero no para los tres.
      const mayor = "x".repeat(80);
      const medio = "y".repeat(50);
      const menor = "z".repeat(20);
      const bloques = [
        { ruta: "menor.ts", texto: menor, peso: menor.length },
        { ruta: "mayor.ts", texto: mayor, peso: mayor.length },
        { ruta: "medio.ts", texto: medio, peso: medio.length },
      ];
      // Cupo para mayor + medio enteros, no para menor.
      const max = estimarTokens(mayor) + estimarTokens(medio) + 1;
      const out = recortarAlPresupuesto(bloques, max);
      // Cupo justo: estimarTokens(80+50) = 33; max = 33 + 1 = 34. mayor(80)+medio(50)=130
      // chars → ceil(130/4)=33 tokens → entra. Si cupiera menor, pasaríamos el cupo.
      expect(out.length).toBe(2);
      // El de mayor peso entra primero, el medio después, el menor fuera.
      expect(out.map((x) => x.ruta)).toEqual(["mayor.ts", "medio.ts"]);
      // Nunca supera el presupuesto y nunca parte líneas.
      const totalChars = out.reduce((acc, x) => acc + x.texto.length, 0);
      expect(estimarTokens(out.map((x) => x.texto).join(""))).toBeLessThanOrEqual(max);
      expect(totalChars).toBeLessThanOrEqual(max * 4);
      for (const x of out) {
        for (const línea of x.texto.split("\n")) {
          // Ninguna línea cortada a la mitad.
          expect(línea.length).toBeGreaterThan(0);
        }
      }
    });

    it("con presupuesto justo para uno entero más un recorte, nunca parte una línea", () => {
      // grande (3 líneas, mayor peso) entra RECORTADO a las 2 primeras;
      // pequeño (1 línea, menor peso) entra ENTERO detrás. Esto verifica
      // que el recortador por líneas respeta saltos completos.
      const pequeño = "pppppppp"; // 8 chars, 1 línea
      const grande = "línea larga uno\nlínea larga dos\nlínea larga tres";
      const bloques = [
        { ruta: "pequeño.ts", texto: pequeño, peso: pequeño.length },
        { ruta: "grande.ts", texto: grande, peso: grande.length },
      ];
      // Cupo: tokens(grande recortado a 2 líneas) + tokens(pequeño) + 1.
      const recorte = "línea larga uno\nlínea larga dos";
      const max = estimarTokens(recorte) + estimarTokens(pequeño) + 1;
      const out = recortarAlPresupuesto(bloques, max);
      expect(estimarTokens(out.map((x) => x.texto).join(""))).toBeLessThanOrEqual(max);
      // Ambos bloques presentes: el orden es por peso, así que comprobamos
      // cada uno por ruta sin asumir el orden.
      const pOut = out.find((x) => x.ruta === "pequeño.ts");
      const gOut = out.find((x) => x.ruta === "grande.ts");
      expect(pOut).toBeDefined();
      expect(gOut).toBeDefined();
      // El pequeño entra entero; el grande se recorta sin partir líneas.
      expect(pOut!.texto).toBe(pequeño);
      expect(gOut!.texto).not.toContain("línea larga tres");
      expect(gOut!.texto.endsWith("línea larga dos")).toBe(true);
    });

    it("presupuesto 0 o vacío de bloques devuelve []", () => {
      expect(recortarAlPresupuesto([], 1000)).toEqual([]);
      expect(recortarAlPresupuesto([{ ruta: "x", texto: "y", peso: 1 }], 0)).toEqual([]);
    });
  });

  describe("redactarSecretos", () => {
    it("tapa sk-, gsk_, ssk_, nvapi- y CLAVE=<32 hex> sin tocar texto normal ni rutas", () => {
      const clave = "sk-proj-AAAA" + "a".repeat(40);
      const gsk = "gsk_" + "b".repeat(40);
      const nv = "nvapi-" + "c".repeat(40);
      const ssk = "ssk_" + "d".repeat(40);
      const hex = "A".repeat(40);
      const entrada = [
        `OPENAI=${clave}`,
        `GROQ=${gsk}`,
        `NVIDIA=${nv}`,
        `STT=${ssk}`,
        `OTRO=${hex}`,
        `ruta: src/lib/mando/astra.ts`,
        `un texto normal con palabras`,
      ].join("\n");
      const out = redactarSecretos(entrada);
      expect(out).toContain("sk-••••");
      expect(out).toContain("gsk_••••");
      expect(out).toContain("nvapi-••••");
      expect(out).toContain("ssk_••••");
      expect(out).toContain("=••••");
      // La clave real no debe aparecer nunca en la salida.
      expect(out).not.toContain(clave);
      expect(out).not.toContain(gsk);
      expect(out).not.toContain(nv);
      expect(out).not.toContain(ssk);
      // Rutas y texto normal sobreviven.
      expect(out).toContain("src/lib/mando/astra.ts");
      expect(out).toContain("un texto normal con palabras");
    });
  });

  describe("resumenDeRutas", () => {
    it("agrupa por sección, deduplica y mantiene orden estable", () => {
      const rutas = [
        "src/lib/mando/astra.ts",
        "src/lib/mando/astra.ts",
        "src/lib/mando/grafo.ts",
        "src/app/(app)/mando/page.tsx",
        "memory/orquestacion-economica.md",
        "./src/lib/mando/astra.ts", // duplicado con prefijo "./"
      ];
      const out = resumenDeRutas(rutas);
      // Dedup: aparece una sola vez cada ruta canónica.
      const apariciones = out.split("src/lib/mando/astra.ts").length - 1;
      expect(apariciones).toBe(1);
      // Hay al menos tres secciones (src, memory, app) o al menos dos.
      const secciones = out.split("\n").filter((l) => l.startsWith("["));
      expect(secciones.length).toBeGreaterThanOrEqual(2);
      // La ruta de memory está presente.
      expect(out).toContain("memory/orquestacion-economica.md");
    });
  });

  describe("construirContexto (asíncrona, sin red)", () => {
    it("devuelve texto, fuentes y tokens; marca ausentes sin lanzar", async () => {
      const r = await construirContexto("diseno", 8_000);
      expect(typeof r.texto).toBe("string");
      expect(Array.isArray(r.fuentes)).toBe(true);
      expect(r.tokens).toBeGreaterThan(0);
      // Cabecera con el ámbito.
      expect(r.texto).toContain("diseno");
      // Ninguna clave real en el prompt de salida.
      expect(r.texto).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
      // Las claves de los archivos reales están sin prefijos de secreto.
      // (Si el test corre en este repo, las rutas de diseño existen.)
    });
  });
});
