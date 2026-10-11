import { describe, expect, it } from "vitest";
import { planificar, regionExcluida, usoPermitido, type PeticionPlan } from "../canalizacion";
import { ETAPAS, MOTORES_3D } from "../motores";

const pet = (o: Partial<PeticionPlan> = {}): PeticionPlan => ({
  partida: "imagen", esqueleto: "vrm-humanoide", capacidades: ["navegador", "cpu"], region: "MX", comercial: false, permitirDePago: false, ...o,
});
const paso = (p: ReturnType<typeof planificar>, e: string) => p.pasos.find((x) => x.etapa === e)!;

describe("tabla de motores", () => {
  it("ids únicos, etapas válidas y animar siempre declara esqueletos", () => {
    expect(new Set(MOTORES_3D.map((m) => m.id)).size).toBe(MOTORES_3D.length);
    for (const m of MOTORES_3D) {
      expect(ETAPAS).toContain(m.etapa);
      if (m.etapa === "animar") expect(m.esqueletos?.length).toBeGreaterThan(0);
    }
  });
  it("honestidad: UniMate figura pero sin código; Filigree3D y BTC3D son solo artículos; Smart Remesh es de pago", () => {
    const e = (id: string) => MOTORES_3D.find((m) => m.id === id)!.estado;
    expect(e("unimate")).toBe("pesos-sin-codigo");
    expect(e("filigree3d")).toBe("solo-articulo");
    expect(e("btc3d")).toBe("solo-articulo");
    expect(e("smart-remesh")).toBe("de-pago");
  });
});

describe("planificar", () => {
  it("una neurona sin GPU: remalla con Instant Meshes y anima en el navegador, pero no genera ni riggea", () => {
    const p = planificar(pet());
    expect(paso(p, "generar").motor).toBeNull();
    expect(paso(p, "remallar").motor?.id).toBe("instant-meshes");
    expect(paso(p, "riggear").motor).toBeNull();
    expect(paso(p, "animar").motor?.id).toBe("procedural");
    expect(p.listo).toBe(false);
  });
  it("UniMate nunca se elige mientras no publiquen la inferencia, y lo dice", () => {
    const p = planificar(pet({ partida: "vrm", capacidades: ["navegador", "cpu", "cuda-8gb"] }));
    expect(paso(p, "animar").motor?.id).toBe("procedural");
    expect(paso(p, "animar").descartes.join(" ")).toMatch(/UniMate.*código de inferencia aún no está publicado/);
  });
  it("con un VRM se salta generar, remallar y riggear; Kimodo anima SOMA", () => {
    const p = planificar(pet({ partida: "vrm", esqueleto: "soma30" }));
    expect(["generar", "remallar", "riggear"].map((e) => paso(p, e).saltada)).toEqual([true, true, true]);
    expect(paso(p, "animar").motor?.id).toBe("kimodo");
    expect(p.listo).toBe(true);
  });
  it("Mac de 32 GB en México puede usar Hunyuan; en España se descarta por licencia", () => {
    const mac = { capacidades: ["navegador", "cpu", "apple-silicon-32gb"] as const };
    const mx = planificar(pet({ ...mac, capacidades: [...mac.capacidades] }));
    expect(paso(mx, "generar").motor).not.toBeNull();
    const es = planificar(pet({ capacidades: [...mac.capacidades], region: "ES" }));
    expect(paso(es, "generar").motor?.id).not.toBe("hunyuan3d-mlx");
    expect(paso(es, "generar").descartes.join(" ")).toMatch(/Hunyuan3D.*no cubre tu región \(ES\)/);
  });
  it("región desconocida: lo restringido por región no se usa", () => {
    expect(regionExcluida(["EU"], null)).toBe(true);
    expect(regionExcluida(["EU", "GB"], "fr")).toBe(true);
    expect(regionExcluida(["EU"], "MX")).toBe(false);
    expect(regionExcluida(undefined, null)).toBe(false);
  });
  it("de pago solo si se permite y hay clave; la procedencia recoge la atribución", () => {
    const sin = planificar(pet({ capacidades: ["navegador", "cpu", "clave-externa"] }));
    expect(paso(sin, "generar").motor).toBeNull();
    const con = planificar(pet({ capacidades: ["navegador", "cpu", "clave-externa"], permitirDePago: true }));
    expect(paso(con, "generar").motor?.id).toBe("meshy");
    expect(con.procedencia.find((x) => x.herramienta === "meshy")?.atribucion).toMatch(/Meshy/);
  });
  it("con GPU NVIDIA: genera, remalla, riggea con UniRig y el plan queda listo", () => {
    const p = planificar(pet({ capacidades: ["navegador", "cpu", "cuda-16gb", "cuda-8gb"], esqueleto: "libre" }));
    expect(paso(p, "riggear").motor?.id).toBe("unirig");
    expect(paso(p, "detallar").saltada).toBe(true);
    expect(p.listo).toBe(true);
  });
  it("un avatar orbe no necesita esqueleto ni animación de huesos", () => {
    const p = planificar(pet({ partida: "plantilla", esqueleto: "ninguno" }));
    expect(paso(p, "animar").saltada).toBe(true);
    expect(p.listo).toBe(true);
  });
});

describe("usoPermitido", () => {
  it("bloquea por región y por uso comercial, y junta las atribuciones sin repetir", () => {
    const procedencia = [
      { herramienta: "hunyuan3d-mlx", licencia: "Tencent", uso: "restringido-region" as const, regionesExcluidas: ["EU"] },
      { herramienta: "meshy", licencia: "CC BY 4.0", uso: "atribucion" as const, atribucion: "Modelo 3D generado con Meshy" },
      { herramienta: "meshy", licencia: "CC BY 4.0", uso: "atribucion" as const, atribucion: "Modelo 3D generado con Meshy" },
      { herramienta: "x", licencia: "NC", uso: "no-comercial" as const },
    ];
    const r = usoPermitido({ procedencia }, { region: "DE", comercial: true });
    expect(r.ok).toBe(false);
    expect(r.motivos).toHaveLength(2);
    expect(r.atribuciones).toEqual(["Modelo 3D generado con Meshy"]);
    expect(usoPermitido({ procedencia: procedencia.slice(1, 2) }, { region: "DE", comercial: true }).ok).toBe(true);
  });
});
