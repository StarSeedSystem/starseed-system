import { describe, expect, it } from "vitest";
import { catalogoSemilla } from "../catalogo-datos";
import { construirPerfilNeurona } from "../perfil-neurona";
import { ramasPorProveedor } from "../ramas-proveedor";
import type { PerfilNeurona } from "../tipos";

function createPerfil(
  id: string,
  ram: number,
  gpu?: string,
  vram?: number | null,
  chip?: string,
  extra?: Partial<PerfilNeurona>
): PerfilNeurona {
  return construirPerfilNeurona({
    plataforma: "tauri",
    ramGb: ram,
    diskLibreGb: undefined,
    enchufada: true,
    ollama: true,
    backend158: true,
    webgpu: true,
    ramReal: true,
    id,
    nombre: id,
    gpuRenderer: gpu,
    vramGb: vram === undefined ? null : vram,
    ...extra,
  });
}

const catalogo = catalogoSemilla().modelos;
const apis: any[] = [];

const profiles: PerfilNeurona[] = [
  createPerfil("mob4", 4, "Samsung Exynos"),
  createPerfil("lap16", 16, "Intel(R) UHD Graphics", null, "cpu"),
  createPerfil("mac8", 8, "Apple M1"),
  createPerfil("mac32", 32, "Apple M2 Max"),
  createPerfil("mac64", 64, "Apple M2 Ultra"),
  createPerfil("srv12", 12, "Intel(R) UHD Graphics", null, "cpu", { backend158: true })
];

describe("ramasPorProveedor", () => {
  it("12GB CPU server selects most capable 4B", () => {
    const data = ramasPorProveedor(catalogo, apis, profiles[5]);
    const ramo = data.find((r) => r.proveedor === "ollama");
    expect(ramo).toBeDefined();
    const mv = ramo!.mejorQueCabe;
    expect(mv).toBeDefined();
    expect(mv!.id).toBe("qwen3.5:4b");
    expect(mv!.id).not.toBe("qwen3.5:9b");
  });
});
