import { describe, it, expect } from "vitest";
import {
  filaNodo,
  resumen,
  type MeshNodoInput,
  type GobernadorInput,
  type EstadoBitnetInput,
  type FilaNodo,
} from "../nodos-bitnet";

describe("nodos-bitnet", () => {
  it("clasifica nodo Mac correctamente", () => {
    const nodoMac: MeshNodoInput = { hostname: "macbook-air-m2", os: "darwin", arq: "arm64", ram_gb: 8, cpu_cores: 8 };
    const estadoMac: EstadoBitnetInput = { salud: { vivo: true, tok_s: 9.2, ram_libre_mb: 2048, swap_mb: 512 } };
    const gobMac: GobernadorInput = { maximo_hardware: 2, trabajadores: 1, ram_libre_mb: 2048 };

    const f = filaNodo(nodoMac, estadoMac, gobMac);
    expect(f.medio).toBe("mac");
    expect(f.permanente).toBe(true);
    expect(f.vivo).toBe(true);
    expect(f.tokS).toBe(9.2);
    expect(f.tono).toBe("verde");
    expect(f.agentesMax).toBe(2);
  });

  it("clasifica contenedor de nube de Claude correctamente", () => {
    const nodoNube: MeshNodoInput = { hostname: "claude-runner-x86-64", os: "linux", arq: "x86_64", ram_gb: 2, cpu_cores: 2 };
    const estadoNube: EstadoBitnetInput = { salud: { vivo: true, tok_s: 13.0, ram_libre_mb: 1290, swap_mb: 0 } };

    const f = filaNodo(nodoNube, estadoNube, null);
    expect(f.medio).toBe("nube");
    expect(f.permanente).toBe(false);
    expect(f.vivo).toBe(true);
    expect(f.tokS).toBe(13.0);
    expect(f.tono).toBe("verde");
  });

  it("clasifica Oracle Free Tier ARM correctamente", () => {
    const nodoOracle: MeshNodoInput = { hostname: "oracle-vps-arm", medio: "vps", os: "linux", arq: "aarch64", ram_gb: 24, cpu_cores: 4 };
    const estadoOracle: EstadoBitnetInput = { salud: { vivo: true, tok_s: 20.0, ram_libre_mb: 18000, swap_mb: 0 } };
    const gobOracle: GobernadorInput = { maximo_hardware: 3, trabajadores: 0 };

    const f = filaNodo(nodoOracle, estadoOracle, gobOracle);
    expect(f.medio).toBe("vps");
    expect(f.permanente).toBe(true);
    expect(f.vivo).toBe(true);
    expect(f.agentesMax).toBe(3);
  });

  it("calcula resumen con frase en español", () => {
    const filas: FilaNodo[] = [
      { id: "mac", nombre: "Mac", medio: "mac", arq: "arm64", ramGb: 8, nucleos: 8, vivo: true, tokS: 9.0, ramLibreMb: 2000, swapMb: 0, agentesMax: 2, agentesAhora: 1, permanente: true, tono: "verde" },
      { id: "nube", nombre: "Nube", medio: "nube", arq: "x86_64", ramGb: 2, nucleos: 2, vivo: true, tokS: 13.0, ramLibreMb: 1200, swapMb: 0, agentesMax: 2, agentesAhora: 0, permanente: false, tono: "verde" },
      { id: "caido", nombre: "VPS", medio: "vps", arq: "arm64", ramGb: 24, nucleos: 4, vivo: false, tokS: 0, ramLibreMb: 0, swapMb: 0, agentesMax: 3, agentesAhora: 0, permanente: true, tono: "gris" },
    ];

    const r = resumen(filas);
    expect(r.nodosVivos).toBe(2);
    expect(r.tokSTotal).toBe(22);
    expect(r.agentesMaxTotal).toBe(7);
    expect(r.frase).toBe("2 nodos vivos · 22 tok/s en total · caben 6 agentes más");
  });
});
