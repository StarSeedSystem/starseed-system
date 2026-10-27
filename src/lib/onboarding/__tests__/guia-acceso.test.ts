/**
 * La puerta común de la guía también fuera del navegador.
 *
 * `abrirGuia` se llama desde la pantalla de acceso, la bienvenida, Ajustes y cada aviso; algunas
 * de esas superficies se renderizan en el servidor. Este archivo cubre lo que las pruebas de
 * componente no ven: que en Node/SSR no lanza ni despacha, y que el módulo no arrastra imports de
 * valor (nada de `node:*`, Supabase ni componentes) al bundle de quien solo quiere abrir la guía.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { abrirGuia } from "../guia-acceso";

const RAIZ = path.join(__dirname, "..", "..", "..", "..");
const leer = (ruta: string) => readFileSync(path.join(RAIZ, ruta), "utf-8");

describe("abrirGuia fuera del navegador", () => {
  it("en Node o SSR no lanza ni despacha y devuelve false", () => {
    expect(typeof window).toBe("undefined");
    expect(() => abrirGuia({ desde: "login" })).not.toThrow();
    expect(abrirGuia({ desde: "login" })).toBe(false);
    expect(abrirGuia({ desde: "bienvenida", temaInicial: "malla" })).toBe(false);
  });
});

describe("pureza de la puerta común", () => {
  it("no importa nada de valor en tiempo de ejecución", () => {
    const fuente = leer("src/lib/onboarding/guia-acceso.ts");
    expect(fuente).not.toMatch(/from\s+"node:/);
    expect(fuente).not.toContain("createClient");
    expect(fuente).not.toMatch(/from\s+"@(components|supabase)\//);
    const deValor = fuente
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(deValor, "solo imports de tipo").toEqual([]);
  });
});
