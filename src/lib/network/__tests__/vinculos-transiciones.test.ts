/**
 * vinculos-transiciones — Ola 370. Espejo puro de la máquina de estados de
 * `os_mesh_vinculos` (ver la migración `20260926190000_os_mesh_vinculos.sql`
 * para las funciones SECURITY DEFINER reales que aplican esto de verdad).
 */
import { describe, expect, test } from "vitest";
import {
  puedeTransicionar,
  siguienteEstado,
  esEstadoTerminal,
  rolEnVinculo,
  demasiadasSolicitudesRecientes,
  yaExisteVinculoActivo,
  faroSuficientementeFresco,
  LIMITE_SOLICITUDES_POR_HORA,
  FRESCURA_FARO_MS,
  type EstadoVinculo,
} from "@/lib/network/vinculos-transiciones";

describe("puedeTransicionar", () => {
  test("solo el RECEPTOR ('a') puede aceptar, y solo desde 'pendiente'", () => {
    expect(puedeTransicionar("pendiente", "aceptar", "a")).toBe(true);
    expect(puedeTransicionar("pendiente", "aceptar", "de")).toBe(false);
    expect(puedeTransicionar("aceptado", "aceptar", "a")).toBe(false);
    expect(puedeTransicionar("rechazado", "aceptar", "a")).toBe(false);
    expect(puedeTransicionar("revocado", "aceptar", "a")).toBe(false);
  });

  test("solo el RECEPTOR ('a') puede rechazar, y solo desde 'pendiente'", () => {
    expect(puedeTransicionar("pendiente", "rechazar", "a")).toBe(true);
    expect(puedeTransicionar("pendiente", "rechazar", "de")).toBe(false);
    expect(puedeTransicionar("aceptado", "rechazar", "a")).toBe(false);
  });

  test("CUALQUIERA de los dos lados puede revocar desde 'pendiente' o 'aceptado'", () => {
    expect(puedeTransicionar("pendiente", "revocar", "de")).toBe(true);
    expect(puedeTransicionar("pendiente", "revocar", "a")).toBe(true);
    expect(puedeTransicionar("aceptado", "revocar", "de")).toBe(true);
    expect(puedeTransicionar("aceptado", "revocar", "a")).toBe(true);
  });

  test("'rechazado' y 'revocado' son terminales: ninguna acción los mueve", () => {
    const estadosTerminales: EstadoVinculo[] = ["rechazado", "revocado"];
    for (const estado of estadosTerminales) {
      expect(puedeTransicionar(estado, "aceptar", "a")).toBe(false);
      expect(puedeTransicionar(estado, "rechazar", "a")).toBe(false);
      expect(puedeTransicionar(estado, "revocar", "de")).toBe(false);
      expect(puedeTransicionar(estado, "revocar", "a")).toBe(false);
    }
  });
});

describe("siguienteEstado", () => {
  test("devuelve el estado resultante cuando la transición es válida", () => {
    expect(siguienteEstado("pendiente", "aceptar", "a")).toBe("aceptado");
    expect(siguienteEstado("pendiente", "rechazar", "a")).toBe("rechazado");
    expect(siguienteEstado("aceptado", "revocar", "de")).toBe("revocado");
  });

  test("devuelve null cuando la transición NO es válida (rol o estado equivocado)", () => {
    expect(siguienteEstado("pendiente", "aceptar", "de")).toBeNull();
    expect(siguienteEstado("rechazado", "revocar", "de")).toBeNull();
    expect(siguienteEstado("revocado", "aceptar", "a")).toBeNull();
  });
});

describe("esEstadoTerminal", () => {
  test("'rechazado'/'revocado' son terminales; 'pendiente'/'aceptado' no", () => {
    expect(esEstadoTerminal("rechazado")).toBe(true);
    expect(esEstadoTerminal("revocado")).toBe(true);
    expect(esEstadoTerminal("pendiente")).toBe(false);
    expect(esEstadoTerminal("aceptado")).toBe(false);
  });
});

describe("rolEnVinculo", () => {
  const v = { deOwner: "uid-alex", aOwner: "uid-otro" };
  test("identifica el rol de 'de' y de 'a'", () => {
    expect(rolEnVinculo(v, "uid-alex")).toBe("de");
    expect(rolEnVinculo(v, "uid-otro")).toBe("a");
  });
  test("null si no eres parte del vínculo, o sin sesión", () => {
    expect(rolEnVinculo(v, "uid-tercero")).toBeNull();
    expect(rolEnVinculo(v, null)).toBeNull();
    expect(rolEnVinculo(v, undefined)).toBeNull();
  });
});

describe("demasiadasSolicitudesRecientes", () => {
  test("respeta el mismo tope que la migración (10/hora por dispositivo)", () => {
    expect(LIMITE_SOLICITUDES_POR_HORA).toBe(10);
    expect(demasiadasSolicitudesRecientes(9)).toBe(false);
    expect(demasiadasSolicitudesRecientes(10)).toBe(true);
    expect(demasiadasSolicitudesRecientes(11)).toBe(true);
  });
});

describe("yaExisteVinculoActivo", () => {
  const base = { deOwner: "A", aOwner: "B", deDevice: "dA", aDevice: "dB" };
  test("true si ya hay una fila 'pendiente' o 'aceptado' para el MISMO par exacto", () => {
    expect(yaExisteVinculoActivo([{ ...base, estado: "pendiente" }], base)).toBe(true);
    expect(yaExisteVinculoActivo([{ ...base, estado: "aceptado" }], base)).toBe(true);
  });
  test("false si la única fila existente ya está resuelta (rechazado/revocado): se puede reintentar", () => {
    expect(yaExisteVinculoActivo([{ ...base, estado: "rechazado" }], base)).toBe(false);
    expect(yaExisteVinculoActivo([{ ...base, estado: "revocado" }], base)).toBe(false);
  });
  test("false si es un par de dispositivos DISTINTO (misma cuenta, otra neurona)", () => {
    expect(yaExisteVinculoActivo([{ ...base, aDevice: "otra-neurona", estado: "pendiente" }], base)).toBe(false);
  });
  test("false con la lista vacía", () => {
    expect(yaExisteVinculoActivo([], base)).toBe(false);
  });
});

describe("faroSuficientementeFresco", () => {
  test("respeta la misma ventana que BEACON_FRESH_MS de server-relay.ts (4 min)", () => {
    expect(FRESCURA_FARO_MS).toBe(4 * 60_000);
    const ahora = 1_000_000;
    expect(faroSuficientementeFresco(ahora - FRESCURA_FARO_MS, ahora)).toBe(true);
    expect(faroSuficientementeFresco(ahora - FRESCURA_FARO_MS - 1, ahora)).toBe(false);
  });
});
