import { describe, it, expect } from "vitest";
import { leerEstadoOracle, resumenOracle } from "../oracle-tipos";

describe("oracle-tipos", () => {
  it("lee estado válido", () => {
    const json = {
      vinculada: true,
      perfil: "alex",
      region: "mx-queretaro-1",
      comprobado: 123456,
      limites: { a1_ocpu: 2, a1_gb: 12, micro: 2 },
      instancias: [{ nombre: "starseed-a1", forma: "VM.Standard.A1.Flex", ocpus: 2, gb: 12, estado: "RUNNING", ip_publica: "1.2.3.4" }],
      servicios: [{ nombre: "astraura", url: "https://...", ok: true, ms: 42, t: 123 }],
      extra: "ignorado",
    };
    const e = leerEstadoOracle(json);
    expect(e).not.toBeNull();
    expect(e!.vinculada).toBe(true);
    expect(e!.region).toBe("mx-queretaro-1");
    expect(e!.instancias).toHaveLength(1);
  });

  it("descarta campos y valores ocid1", () => {
    const json = {
      vinculada: true,
      perfil: "ocid1.user.oc1..aaaa",
      region: "mx-queretaro-1",
      ocid1: "ocid1.tenancy.oc1..falso",
      limites: { a1_ocpu: 2 },
    };
    const e = leerEstadoOracle(json);
    expect(e).not.toBeNull();
    expect(e!.perfil).toBe("");
    expect((e as any).ocid1).toBeUndefined();
  });

  it("resumenOracle", () => {
    const e = {
      vinculada: true,
      perfil: "",
      region: "mx-queretaro-1",
      comprobado: null,
      limites: { a1_ocpu: 2, a1_gb: 12, micro: 2 },
      instancias: [],
      servicios: [],
    };
    const txt = resumenOracle(e);
    expect(txt).toContain("vinculada");
    expect(txt).toContain("mx-queretaro-1");
  });
});
