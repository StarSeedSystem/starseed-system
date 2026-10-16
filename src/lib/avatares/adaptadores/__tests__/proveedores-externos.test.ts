import { describe, it, expect } from "vitest";
import { motivoDescarte, type PeticionPlan } from "@/lib/avatares/adn/canalizacion";
import { MOTORES_3D, type Motor3D } from "@/lib/avatares/adn/motores";

describe("motivoDescarte", () => {
  const meshMotor = MOTORES_3D.find(m => m.id === "meshy") as Motor3D;
  const tripoMotor = MOTORES_3D.find(m => m.id === "tripo") as Motor3D;

  const basePeticion: PeticionPlan = {
    partida: "imagen",
    esqueleto: "soma30",
    capacidades: ["cpu"] as const, // start with only cpu
    region: null,
    comercial: false,
    permitirDePago: false,
    detallar: false,
    prioridad: "rapidez",
    cerrada: false,
  };

  it("sin permiso ni clave: no disponible", () => {
    // For Meshy, which requires "clave-externa", and we have neither permiso para pagar ni clave
    const p = { ...basePeticion, permitirDePago: false, capacidades: ["cpu"] };
    const motivo = motivoDescarte(meshMotor, p);
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("meshyn"); // The motor's nombre is "Meshy (servicio)"
    expect(motivo).toContain("clave-externa");
  });

  it("solo clave, sin permiso: no disponible", () => {
    // We have the key (so capacidades includes "clave-externa") but not permiso para pagar
    const p = { ...basePeticion, permitirDePago: false, capacidades: ["cpu", "clave-externa"] };
    const motivo = motivoDescarte(meshMotor, p);
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("meshyn");
    expect(motivo).toContain("no está permitido");
  });

  it("solo permiso, sin clave: no disponible", () => {
    // We have permiso para pagar but not the key
    const p = { ...basePeticion, permitirDePago: true, capacidades: ["cpu"] };
    const motivo = motivoDescarte(meshMotor, p);
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("meshyn");
    expect(motivo).toContain("clave-externa");
  });

  it("permiso+clave: disponible y se ofrece «clave-externa»", () => {
    // We have both permiso para pagar and the key
    const p = { ...basePeticion, permitirDePago: true, capacidades: ["cpu", "clave-externa"] };
    const motivo = motivoDescarte(meshMotor, p);
    expect(motivo).toBeNull();
  });

  // Additional test cases from the list that are pure and match this function

  it("tripo: «no disponible» sin llamar a la red", () => {
    // For Tripo, which also requires "clave-externa", without the key it should be unavailable
    const p = { ...basePeticion, permitirDePago: false, capacidades: ["cpu"] };
    const motivo = motivoDescarte(tripoMotor, p);
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("tripo");
    expect(motivo).toContain("clave-externa");
  });

  // We can also test that when we have both, Tripo is available
  it("tripo con permiso y clave: disponible", () => {
    const p = { ...basePeticion, permitirDePago: true, capacidades: ["cpu", "clave-externa"] };
    const motivo = motivoDescarte(tripoMotor, p);
    expect(motivo).toBeNull();
  });

  // Test for a motor that does not require clave-externa, like espacio-hf (which requires espacio-hf)
  // But note: espacio-hf is a motor that requires "espacio-hf"
  const espacioMotor = MOTORES_3D.find(m => m.id === "pixal3d-espacio") as Motor3D;
  it("espacio-hf: sin permiso para espacio-hf: no disponible", () => {
    const p = { ...basePeticion, permitirDePago: false, capacidades: ["cpu"] }; // no espacio-hf
    const motivo = motivoDescarte(espacioMotor, p);
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("pixal3d-espacio");
    expect(motivo).toContain("espacio-hf");
  });

  it("espacio-hf: con permiso para espacio-hf: disponible", () => {
    const p = { ...basePeticion, permitirDePago: false, capacidades: ["cpu", "espacio-hf"] };
    const motivo = motivoDescarte(espacioMotor, p);
    expect(motivo).toBeNull();
  });
});