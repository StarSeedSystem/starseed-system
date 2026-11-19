/**
 * LNX1118WD — lo que la tarjeta «Preparar este Linux» enseña, sin tocar la app ni el sistema. Solo las
 * funciones puras: la medida real (id, ls, systemctl) se prueba en Rust (`permisos_linux_logica.rs`).
 */
import { describe, expect, it } from "vitest";
import { faltasDe, nombreGrupo, resumenNodo, type EstadoNodoLinux } from "../permisos-linux";

const LISTO: EstadoNodoLinux = { grupos_faltan: [], uinput: true, bluetooth: true, completo: true };

describe("PermisosLinux · texto de lo que falta", () => {
  it("sin medida todavía no inventa faltas", () => {
    expect(faltasDe(null)).toEqual([]);
    expect(resumenNodo(null)).toContain("Midiendo");
  });

  it("un nodo completo se dice en claro", () => {
    expect(faltasDe(LISTO)).toEqual([]);
    expect(resumenNodo(LISTO)).toContain("Listo");
  });

  it("los grupos que faltan llevan su nombre en claro", () => {
    const faltas = faltasDe({ ...LISTO, completo: false, grupos_faltan: ["netdev", "input"] });
    expect(faltas).toHaveLength(1);
    expect(faltas[0].clave).toBe("grupos");
    expect(faltas[0].detalle).toContain("red (netdev)");
    expect(faltas[0].detalle).toContain("entrada (input)");
    expect(nombreGrupo("dialout")).toBe("serie (dialout)");
    expect(nombreGrupo("otro")).toBe("otro");
  });

  it("uinput y Bluetooth se explican por separado", () => {
    const faltas = faltasDe({ ...LISTO, completo: false, uinput: false, bluetooth: false });
    expect(faltas.map((f) => f.clave)).toEqual(["uinput", "bluetooth"]);
    expect(faltas[0].detalle).toContain("/dev/uinput");
    expect(faltas[1].detalle).toContain("bluetooth");
  });

  it("el resumen cuenta las cosas que faltan", () => {
    expect(resumenNodo({ ...LISTO, completo: false, bluetooth: false })).toBe("Falta 1 cosa para ser nodo.");
    expect(resumenNodo({ ...LISTO, completo: false, uinput: false, bluetooth: false })).toBe("Faltan 2 cosas para ser nodo.");
  });
});
