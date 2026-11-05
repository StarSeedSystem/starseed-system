/**
 * (1104 · RPO1104F) Ajustes del perfil: revisión con peces (EGM) e interfaz viva (OpenUI).
 * Cubre los valores por defecto, la normalización de lo guardado y cada combinación.
 */

import { describe, expect, it } from "vitest";
import {
  ajustesPerfilPorDefecto,
  debeRevisarConPeces,
  debeUsarInterfazViva,
  esTareaDeCreacion,
  ETIQUETAS_MODO_INTERFAZ,
  ETIQUETAS_REVISION_PECES,
  normalizarAjustesPerfil,
  ORDEN_MODOS_INTERFAZ,
  ORDEN_REVISION_PECES,
  type SenalesDeContenido,
  type TipoDeTarea,
} from "../ajustes-respuesta";

const TAREAS: TipoDeTarea[] = ["app", "pagina", "publicacion", "plan", "charla"];
const SENALES: SenalesDeContenido[] = [];
for (const tieneDatos of [false, true])
  for (const tienePasos of [false, true])
    for (const tieneComparacion of [false, true]) SENALES.push({ tieneDatos, tienePasos, tieneComparacion });

describe("ajustes del perfil · valores por defecto", () => {
  it("peces solo en creaciones e interfaz automática", () => {
    expect(ajustesPerfilPorDefecto()).toEqual({ revisionPeces: "creaciones", interfaz: "auto" });
  });

  it("sin nada guardado, o con valores que ya no existen, vuelve al defecto", () => {
    expect(normalizarAjustesPerfil(undefined)).toEqual(ajustesPerfilPorDefecto());
    expect(normalizarAjustesPerfil(null)).toEqual(ajustesPerfilPorDefecto());
    expect(normalizarAjustesPerfil({ revisionPeces: "a-veces" as never, interfaz: "3d" as never })).toEqual(
      ajustesPerfilPorDefecto(),
    );
    expect(normalizarAjustesPerfil({ interfaz: "texto" })).toEqual({ revisionPeces: "creaciones", interfaz: "texto" });
  });

  it("cada opción tiene su etiqueta en español", () => {
    for (const o of ORDEN_REVISION_PECES) expect(ETIQUETAS_REVISION_PECES[o]).toBeTruthy();
    for (const o of ORDEN_MODOS_INTERFAZ) expect(ETIQUETAS_MODO_INTERFAZ[o]).toBeTruthy();
  });
});

describe("debeRevisarConPeces", () => {
  it("por defecto: app, página, publicación y plan sí; charla no", () => {
    for (const t of TAREAS) expect(debeRevisarConPeces(undefined, t)).toBe(t !== "charla");
    expect(TAREAS.filter(esTareaDeCreacion)).toEqual(["app", "pagina", "publicacion", "plan"]);
  });

  it("«creaciones» elegido a mano es lo mismo que el defecto", () => {
    for (const t of TAREAS)
      expect(debeRevisarConPeces({ revisionPeces: "creaciones" }, t)).toBe(debeRevisarConPeces({}, t));
  });

  it("«siempre» revisa todo, también la charla", () => {
    for (const t of TAREAS) expect(debeRevisarConPeces({ revisionPeces: "siempre" }, t)).toBe(true);
  });

  it("«nunca» no revisa nada", () => {
    for (const t of TAREAS) expect(debeRevisarConPeces({ revisionPeces: "nunca", interfaz: "viva" }, t)).toBe(false);
  });
});

describe("debeUsarInterfazViva", () => {
  it("«auto»: interfaz solo si hay datos, pasos o comparaciones", () => {
    for (const s of SENALES) {
      const alguna = Boolean(s.tieneDatos || s.tienePasos || s.tieneComparacion);
      expect(debeUsarInterfazViva({ interfaz: "auto" }, s)).toBe(alguna);
      expect(debeUsarInterfazViva(undefined, s)).toBe(alguna);
    }
    expect(debeUsarInterfazViva(null)).toBe(false);
  });

  it("«viva»: siempre, aunque sea texto llano", () => {
    for (const s of SENALES) expect(debeUsarInterfazViva({ interfaz: "viva" }, s)).toBe(true);
  });

  it("«texto»: nunca, aunque haya datos, pasos y comparaciones", () => {
    for (const s of SENALES) expect(debeUsarInterfazViva({ interfaz: "texto", revisionPeces: "siempre" }, s)).toBe(false);
  });
});
