/**
 * Pruebas puras del reparto del taller (G3D1011D): elección de neurona por cuenta, grupo,
 * fidelidad y carga, y la publicación de capacidades en el registro. Sin red ni GPU.
 */
import { describe, it, expect } from "vitest";
import {
  capacidadesPublicadas,
  elegirNeurona,
  fidelidadDel,
  ofrecidaAlEncargo,
  publicacionCambiada,
  publicacionTaller,
  vramDe,
  type EncargoTaller,
  type NeuronaCandidata,
} from "../reparto-taller";
import { capacidadesDe, type Hierro } from "../../adn/optimizacion";

const mac32: Hierro = { gpu: "apple", ramGB: 32, vramGB: null, blender: true, permiteEspacioHf: false, claveExterna: false };
const pc16: Hierro = { gpu: "nvidia", ramGB: 32, vramGB: 16, blender: true, permiteEspacioHf: false, claveExterna: false };
const mac8: Hierro = { gpu: "apple", ramGB: 8, vramGB: null, blender: true, permiteEspacioHf: false, claveExterna: false };

const encargoBase: EncargoTaller = {
  cuentaId: "cuenta-alex", destino: "avatar", partida: "imagen", esqueleto: "ninguno",
  region: "ES", comercial: false, permitirDePago: false,
};

const neurona = (id: string, nombre: string, hierro: Hierro, extra?: Partial<NeuronaCandidata>): NeuronaCandidata => ({
  id, nombre, cuentaId: "cuenta-alex", capacidades: capacidadesDe(hierro), carga: 0, ...extra,
});

describe("reparto del taller", () => {
  it("generar un avatar va a la Mac de 32 GB, no a la de 8 GB", () => {
    const r = elegirNeurona(encargoBase, [neurona("a", "Mac de 8 GB", mac8), neurona("b", "Mac de 32 GB", mac32)]);
    expect(r.neurona?.id).toBe("b");
    expect(r.plan?.listo).toBe(true);
  });

  it("prioridad de calidad: gana la NVIDIA de 16 GB (Pixal3D, más fidelidad)", () => {
    const r = elegirNeurona(encargoBase, [neurona("a", "Mac de 32 GB", mac32), neurona("b", "PC con NVIDIA 16 GB", pc16)]);
    expect(r.neurona?.id).toBe("b");
  });

  it("a igualdad de fidelidad, gana la menos cargada", () => {
    const r = elegirNeurona(encargoBase, [
      neurona("b", "PC ocupado", pc16, { carga: 3 }),
      neurona("a", "PC libre", pc16, { carga: 0 }),
    ]);
    expect(r.neurona?.id).toBe("a");
  });

  it("primero las de la misma cuenta aunque la ofrecida tenga más fidelidad", () => {
    const r = elegirNeurona(encargoBase, [
      neurona("a", "Mi Mac de 32 GB", mac32),
      neurona("b", "PC de la comunidad", pc16, { cuentaId: "otra-cuenta", ofrecidaEn: ["g1"] }),
    ], );
    expect(r.neurona?.id).toBe("a");
  });
});

describe("cuando el grupo ofrece una neurona", () => {
  const encargoGrupo: EncargoTaller = { ...encargoBase, grupoIds: ["g1"] };
  it("si ninguna propia puede, usa la que el grupo ofreció", () => {
    const r = elegirNeurona(encargoGrupo, [
      neurona("a", "Mac de 8 GB", mac8),
      neurona("b", "PC del grupo", pc16, { cuentaId: "otra", ofrecidaEn: ["g1"] }),
    ]);
    expect(r.neurona?.id).toBe("b");
    expect(r.motivo).toContain("ofreció");
  });

  it("una neurona ajena NO ofrecida a mis grupos nunca se usa", () => {
    const r = elegirNeurona(encargoGrupo, [
      neurona("a", "Mac de 8 GB", mac8),
      neurona("b", "PC privado de otra", pc16, { cuentaId: "otra" }),
    ]);
    expect(r.neurona).toBeNull();
    expect(r.motivo).toContain("ninguna neurona tuya");
  });
});

describe("explicación cuando ninguna puede", () => {
  it("dice en palabras qué falta", () => {
    const r = elegirNeurona(encargoBase, [neurona("a", "Mac de 8 GB", mac8), neurona("b", "La A1", mac8, { id: "b", nombre: "La A1" })]);
    expect(r.neurona).toBeNull();
    expect(r.descartes["Mac de 8 GB"]).toBeTruthy();
    expect(r.motivo.length).toBeGreaterThan(10);
  });

  it("sin neuronas: motivo claro", () => {
    expect(elegirNeurona(encargoBase, []).motivo).toContain("No hay ninguna neurona");
  });
});

describe("ayudantes", () => {
  it("ofrecidaAlEncargo: nunca tu propia cuenta, y solo grupos tuyos", () => {
    expect(ofrecidaAlEncargo(neurona("a", "x", pc16), encargoBase)).toBe(false);
    expect(ofrecidaAlEncargo(neurona("a", "x", pc16, { cuentaId: "otra", ofrecidaEn: ["g1"] }), encargoBase)).toBe(false);
    expect(ofrecidaAlEncargo(neurona("a", "x", pc16, { cuentaId: "otra", ofrecidaEn: ["g1"] }), { ...encargoBase, grupoIds: ["g1"] })).toBe(true);
  });

  it("vramDe traduce las capacidades", () => {
    expect(vramDe(["cpu", "cuda-16gb"])).toBe(16);
    expect(vramDe(["cuda-8gb"])).toBe(8);
    expect(vramDe(["cpu"])).toBeNull();
  });
});

describe("publicación de capacidades", () => {
  it("publica las de su hierro y las lee otra neurona", () => {
    const pub = publicacionTaller(pc16);
    expect(pub.capacidades).toContain("cuda-16gb");
    expect(capacidadesPublicadas({ taller3d: pub })).toEqual(pub.capacidades);
    expect(capacidadesPublicadas({})).toEqual([]);
    expect(capacidadesPublicadas({ taller3d: { capacidades: ["cuda-16gb", "trampa"] } })).toEqual(["cuda-16gb"]);
  });

  it("solo se publica al cambiar", () => {
    const pub = publicacionTaller(mac32);
    expect(publicacionCambiada(undefined, pub)).toBe(true);
    expect(publicacionCambiada({ capacidades: [...pub.capacidades] }, pub)).toBe(false);
  });

  it("fidelidadDel: 0 si no se genera", () => {
    const r = elegirNeurona({ ...encargoBase, partida: "vrm", esqueleto: "soma30" }, [neurona("a", "Mac", mac32)]);
    expect(r.plan?.listo).toBe(true);
    expect(fidelidadDel(r.plan!)).toBe(0);
  });
});
