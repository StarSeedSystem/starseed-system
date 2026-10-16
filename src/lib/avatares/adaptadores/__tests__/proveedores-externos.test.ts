import { describe, expect, it } from "vitest";
import {
  externosPermitidos,
  ofrecerClaveExterna,
  claveDia,
  topeRestante,
  registrarUso,
  procedenciaExterna,
  crearTareaMeshy,
  crearTareaExterna,
  DIA1,
  DIA2,
  TOPE_DIARIO_POR_PERSONA,
  MESHY_IMAGEN_A_3D,
  ContadorTope,
} from "../proveedores-externos";

// Constants used in the test cases
const ENT = {
  AVATARES_EXTERNOS_PERMITIDOS: "1",
  MESHY_API_KEY: "x"
};

// Mocks for the async test
const respuestaOk = new Response(JSON.stringify({ result: "tarea-123" }), { status: 200 });

describe("proveedores-externos", () => {
  it("sin permiso ni clave: no disponible", () => {
    const c = externosPermitidos({});
    expect(c.disponible).toBe(false);
    expect(c.ids).toEqual([]);
    expect(c.motivo).toContain("AVATARES_EXTERNOS_PERMITIDOS");
  });

  it("solo clave, sin permiso: no disponible", () => {
    expect(externosPermitidos({ MESHY_API_KEY: "x" }).disponible).toBe(false);
  });

  it("solo permiso, sin clave: no disponible", () => {
    expect(externosPermitidos({ AVATARES_EXTERNOS_PERMITIDOS: "1" }).disponible).toBe(false);
    expect(ofrecerClaveExterna({ AVATARES_EXTERNOS_PERMITIDOS: "1" })).toBe(false);
  });

  it("permiso+clave: disponible y se ofrece «clave-externa»", () => {
    const c = externosPermitidos(ENT);
    expect(c.disponible).toBe(true);
    expect(c.ids).toContain("meshy");
    expect(ofrecerClaveExterna(ENT)).toBe(true);
  });

  it("permiso \"0\" + clave: apagado (el permiso exige el valor 1)", () => {
    expect(externosPermitidos({ AVATARES_EXTERNOS_PERMITIDOS: "0", MESHY_API_KEY: "x" }).disponible).toBe(false);
  });

  it("la clave del contador cambia de día", () => {
    expect(claveDia("ali", DIA1)).not.toBe(claveDia("ali", DIA2));
  });

  it("agota el tope y se resetea al día siguiente", () => {
    const c: ContadorTope = new Map();
    expect(topeRestante(c, "ali", DIA1)).toBe(TOPE_DIARIO_POR_PERSONA);
    for (let i = 0; i < TOPE_DIARIO_POR_PERSONA; i++) expect(registrarUso(c, "ali", DIA1)).toBe(true);
    expect(registrarUso(c, "ali", DIA1)).toBe(false);
    expect(topeRestante(c, "ali", DIA1)).toBe(0);
    expect(registrarUso(c, "ali", DIA2)).toBe(true);
  });

  it("el tope es por persona", () => {
    const c: ContadorTope = new Map();
    for (let i = 0; i < TOPE_DIARIO_POR_PERSONA; i++) registrarUso(c, "ali", DIA1);
    expect(registrarUso(c, "bea", DIA1)).toBe(true);
  });

  it("Meshy lleva la atribución obligatoria", () => {
    const p = procedenciaExterna("meshy");
    expect(p.herramienta).toBe("meshy");
    expect(p.uso).toBe("atribucion");
    expect(p.atribucion).toBe("Modelo 3D generado con Meshy");
    expect(p.licencia).toContain("CC BY 4.0");
  });

  it("POST a la URL oficial con Bearer y cuerpo correcto, devuelve el id", async () => {
    let vista: { url: string; init?: RequestInit } = { url: "" };
    const fetchFalso: TFetch = (async (url: RequestInfo, init?: RequestInit) => {
      vista = { url: String(url), init };
      return respuestaOk;
    }) as TFetch;
    const id = await crearTareaMeshy("https://ejemplo.com/a.png", "CLAVE-SECRETA", fetchFalso);
    expect(id).toBe("tarea-123");
    expect(vista.url).toBe(MESHY_IMAGEN_A_3D);
    expect((vista.init?.headers as Record<string, string>).Authorization).toBe("Bearer CLAVE-SECRETA");
    const cuerpo = JSON.parse(String(vista.init?.body)) as Record<string, unknown>;
    expect(cuerpo.image_url).toBe("https://ejemplo.com/a.png");
    expect(cuerpo.target_formats).toEqual(["glb"]);
  });

  it("respuesta con error: lanza con el estado, sin filtrar la clave", async () => {
    const fetchFalso: TFetch = (async () => new Response("no", { status: 402 })) as TFetch;
    await expect(crearTareaMeshy("https://ejemplo.com/a.png", "s3cret4", fetchFalso)).rejects.toThrow("402");
  });

  it("respuesta sin result: lanza", async () => {
    const fetchFalso: TFetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as TFetch;
    await expect(crearTareaMeshy("https://ejemplo.com/a.png", "k", fetchFalso)).rejects.toThrow("id de la tarea");
  });

  it("meshy: ok con fetch simulado", async () => {
    const fetchFalso: TFetch = (async () =>
      new Response(JSON.stringify({ result: "t-1" }), { status: 200 })) as TFetch;
    const r = await crearTareaExterna("meshy", "https://ejemplo.com/a.png", "k", fetchFalso);
    expect(r).toEqual({ ok: true, tarea: "t-1" });
  });

  it("tripo: «no disponible» sin llamar a la red (documentación no verificada)", async () => {
    let llamadas = 0;
    const fetchFalso: TFetch = (async () => {
      llamadas++;
      return new Response("{}", { status: 200 });
    }) as TFetch;
    const r = await crearTareaExterna("tripo", "https://ejemplo.com/a.png", "k", fetchFalso);
    expect(llamadas).toBe(0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("no se pudo verificar");
  });

  it("meshy con error de red: motivo claro, nunca la clave", async () => {
    const fetchFalso: TFetch = (async () => new Response("x", { status: 401 })) as TFetch;
    const r = await crearTareaExterna("meshy", "https://ejemplo.com/a.png", "S3CRET4", fetchFalso);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).not.toContain("S3CRET4");
  });
});