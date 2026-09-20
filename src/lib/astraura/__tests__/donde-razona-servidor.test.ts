import { describe, it, expect } from "vitest";
import { elegirDestino, perfilDeEstaMaquina } from "../donde-razona-servidor";
import type { PerfilHardware } from "../perfil-hardware";

const perfilPleno: PerfilHardware = {
  nivel: "pleno",
  nucleos: 8,
  ramGb: 16,
  arq: "arm64",
  plataforma: "tauri",
  bateria: false,
  conexion: "rapida",
};

const perfilJusto: PerfilHardware = {
  nivel: "justo",
  nucleos: 4,
  ramGb: 8,
  arq: "x86_64",
  plataforma: "tauri",
  bateria: false,
  conexion: "rapida",
};

describe("elegirDestino (servidor)", () => {
  it("destino pedido gana siempre", () => {
    expect(elegirDestino(perfilPleno, "local", false).destino).toBe("local");
    expect(elegirDestino(perfilJusto, "local", false).destino).toBe("local");
    expect(elegirDestino(perfilPleno, "nube", true).destino).toBe("nube");
    expect(elegirDestino(null, "local", false).destino).toBe("local");
  });

  it("perfil pleno con BitNet vivo → local", () => {
    const res = elegirDestino(perfilPleno, null, true);
    expect(res.destino).toBe("local");
    expect(res.motivo).toContain("Perfil pleno y motor BitNet activo");
  });

  it("perfil justo o BitNet apagado → nube", () => {
    expect(elegirDestino(perfilJusto, null, true).destino).toBe("nube");
    expect(elegirDestino(perfilPleno, null, false).destino).toBe("nube");
    expect(elegirDestino(perfilJusto, null, false).destino).toBe("nube");
  });

  it("sin datos → nube (camino seguro)", () => {
    expect(elegirDestino(null, null, true).destino).toBe("nube");
    expect(elegirDestino(undefined, null, false).destino).toBe("nube");
  });

  it("perfilDeEstaMaquina mide la máquina actual", () => {
    const p = perfilDeEstaMaquina();
    expect(p).toHaveProperty("nivel");
    expect(p.nucleos).toBeGreaterThanOrEqual(1);
  });
});
