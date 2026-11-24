// Autoenrutamiento autorreparable multicapa: pruebas (AST1123C). Módulo puro.
import { describe, expect, it } from "vitest";
import {
  autoenrutar,
  calcularEnfriamiento,
  crearSalud,
  estaDisponible,
  recuperarRuta,
  registrarExito,
  registrarFallo,
  type PoliticaCircuito,
  type SaludRuta,
} from "../auto-reparacion-ruta";

const POLITICA: PoliticaCircuito = {
  umbralLatenciaMs: 1_000,
  enfriamientoBaseMs: 5_000,
  enfriamientoMaximoMs: 20_000,
};

function abierta(base: SaludRuta, ahora: number): SaludRuta {
  return registrarFallo(base, ahora, POLITICA);
}

describe("crearSalud", () => {
  it("arranca en circuito cerrado y sin fallos", () => {
    const s = crearSalud("local");
    expect(s.proveedor).toBe("local-principal");
    expect(s.estado).toBe("cerrado");
    expect(s.fallos).toBe(0);
    expect(s.enfriamientoHasta).toBe(0);
  });

  it("admite proveedor explícito y latencia inicial", () => {
    const s = crearSalud("servidor-propio", "minipc", 220);
    expect(s.proveedor).toBe("minipc");
    expect(s.latenciaMs).toBe(220);
  });
});

describe("calcularEnfriamiento", () => {
  it("sin fallos no hay enfriamiento", () => {
    expect(calcularEnfriamiento(0, POLITICA)).toBe(0);
    expect(calcularEnfriamiento(-3, POLITICA)).toBe(0);
  });

  it("duplica el enfriamiento en cada fallo y respeta el techo", () => {
    expect(calcularEnfriamiento(1, POLITICA)).toBe(5_000);
    expect(calcularEnfriamiento(2, POLITICA)).toBe(10_000);
    expect(calcularEnfriamiento(3, POLITICA)).toBe(20_000);
    expect(calcularEnfriamiento(9, POLITICA)).toBe(20_000);
  });
});

describe("registrarFallo", () => {
  it("abre el circuito y fija el enfriamiento desde el reloj inyectado", () => {
    const s = registrarFallo(crearSalud("local"), 1_000, POLITICA, 350);
    expect(s.estado).toBe("abierto");
    expect(s.fallos).toBe(1);
    expect(s.enfriamientoHasta).toBe(6_000);
    expect(s.latenciaMs).toBe(350);
  });

  it("duplica el enfriamiento en fallos consecutivos y conserva la latencia", () => {
    const primero = registrarFallo(crearSalud("local"), 1_000, POLITICA, 350);
    const segundo = registrarFallo(primero, 2_000, POLITICA);
    expect(segundo.fallos).toBe(2);
    expect(segundo.latenciaMs).toBe(350);
    expect(segundo.enfriamientoHasta).toBe(12_000);
  });
});

describe("registrarExito", () => {
  it("cierra el circuito y limpia los fallos tras un éxito sano", () => {
    const tras = registrarExito(abierta(crearSalud("local"), 1_000), 120, 99_000, POLITICA);
    expect(tras.estado).toBe("cerrado");
    expect(tras.fallos).toBe(0);
    expect(tras.enfriamientoHasta).toBe(0);
    expect(tras.latenciaMs).toBe(120);
  });

  it("superar la latencia umbral cuenta como fallo", () => {
    const lento = registrarExito(crearSalud("local"), 1_001, 1_000, POLITICA);
    expect(lento.estado).toBe("abierto");
    expect(lento.fallos).toBe(1);
    expect(lento.enfriamientoHasta).toBe(6_000);
  });

  it("una latencia no finita también abre el circuito", () => {
    const rota = registrarExito(crearSalud("local"), Number.NaN, 1_000, POLITICA);
    expect(rota.estado).toBe("abierto");
  });
});

describe("estaDisponible y recuperarRuta", () => {
  it("la ruta abierta vuelve a estar disponible al cumplirse el enfriamiento", () => {
    const s = abierta(crearSalud("local"), 1_000);
    expect(estaDisponible(s, 5_999)).toBe(false);
    expect(estaDisponible(s, 6_000)).toBe(true);
  });

  it("recuperarRuta solo resetea al vencer el enfriamiento", () => {
    const s = abierta(crearSalud("local"), 1_000);
    expect(recuperarRuta(s, 5_999).estado).toBe("abierto");
    const recuperada = recuperarRuta(s, 6_000);
    expect(recuperada.estado).toBe("cerrado");
    expect(recuperada.fallos).toBe(0);
    expect(recuperada.enfriamientoHasta).toBe(0);
  });
});

describe("autoenrutar", () => {
  const local = crearSalud("local", "ollama-158", 100);
  const malla = crearSalud("neurona-malla", "par-malla", 200);
  const propio = crearSalud("servidor-propio", "minipc", 300);
  const nube = crearSalud("nube", "astraura-158-nube", 400);

  it("elige la ruta primaria local cuando está sana", () => {
    const d = autoenrutar({ salud: [local, malla, propio, nube], ahora: 1_000 });
    expect(d.ruta).toBe("local");
    expect(d.proveedor).toBe("ollama-158");
    expect(d.entidad).toBe("agente");
  });

  it("degrada en orden local → malla → servidor propio → nube", () => {
    const caidaLocal = abierta(local, 1_000);
    const d1 = autoenrutar({ salud: [caidaLocal, malla, propio, nube], ahora: 2_000 });
    expect(d1.ruta).toBe("neurona-malla");

    const caidaMalla = abierta(malla, 1_000);
    const d2 = autoenrutar({ salud: [caidaLocal, caidaMalla, propio, nube], ahora: 2_000 });
    expect(d2.ruta).toBe("servidor-propio");

    const caidaPropio = abierta(propio, 1_000);
    const d3 = autoenrutar({ salud: [caidaLocal, caidaMalla, caidaPropio, nube], ahora: 2_000 });
    expect(d3.ruta).toBe("nube");
  });

  it("nunca usa la nube cuando no está permitida", () => {
    const d = autoenrutar({ salud: [abierta(local, 1_000), nube], ahora: 2_000, nubePermitida: false });
    expect(d.ruta).toBeNull();
    expect(d.motivo).toContain("nube vetada");
  });

  it("vuelve sola a la ruta primaria al cumplirse el enfriamiento", () => {
    const caidaLocal = abierta(local, 1_000);
    const d = autoenrutar({ salud: [caidaLocal, malla], ahora: 6_000 });
    expect(d.ruta).toBe("local");
    expect(d.salud.find((s) => s.ruta === "local")?.fallos).toBe(0);
  });

  it("dentro de una ruta elige el proveedor disponible con menor latencia", () => {
    const lento = crearSalud("local", "ollama-lento", 900);
    const sano = crearSalud("local", "ollama-rapido", 80);
    const d = autoenrutar({ salud: [lento, sano], ahora: 1_000 });
    expect(d.proveedor).toBe("ollama-rapido");
  });

  it("respeta la entidad bot y avisa cuando no queda ninguna ruta", () => {
    const todas = [local, malla, propio, nube].map((s) => abierta(s, 1_000));
    const d = autoenrutar({ salud: todas, ahora: 2_000, entidad: "bot" });
    expect(d.ruta).toBeNull();
    expect(d.entidad).toBe("bot");
    expect(d.motivo).toBe("ninguna ruta disponible");
  });
});
