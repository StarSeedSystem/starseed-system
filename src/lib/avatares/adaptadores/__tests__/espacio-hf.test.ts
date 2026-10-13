/**
 * Pruebas del adaptador puro del Space de Pixal3D (G3D1011F). Sin red, sin disco, sin procesos:
 * solo funciones puras de validación y de construcción/lectura de peticiones Gradio.
 */
import { describe, it, expect } from "vitest";
import {
  ESPACIO_HF_URL,
  MAX_IMAGEN_BYTES,
  TOPE_DIARIO_POR_DEFECTO,
  cuerpoExtraerGlb,
  cuerpoGenerar3d,
  cuerpoPreproceso,
  claveDia,
  motivoDenegacion,
  procedenciaMotor,
  resultadoDeSse,
  statePathDeResultado,
  topeAlcanzado,
  urlDeArchivo,
  urlGlbDeResultado,
  type PeticionEspacioHf,
} from "../espacio-hf";

const base: PeticionEspacioHf = {
  permiso: true,
  imagenBytes: 1024,
  mime: "image/png",
  usoHoy: 0,
};

describe("motivoDenegacion", () => {
  it("acepta una petición con permiso y dentro de límites", () => {
    expect(motivoDenegacion(base)).toBeNull();
  });

  it("rechaza sin permiso explícito", () => {
    expect(motivoDenegacion({ ...base, permiso: false })).toMatch(/permiso/i);
  });

  it("rechaza una foto de personas sin consentimiento", () => {
    expect(motivoDenegacion({ ...base, esFotoDePersonas: true, consentimientoPersonas: false })).toMatch(/consentimiento/i);
    expect(motivoDenegacion({ ...base, esFotoDePersonas: true })).toMatch(/consentimiento/i);
  });

  it("acepta una foto de personas CON consentimiento", () => {
    expect(motivoDenegacion({ ...base, esFotoDePersonas: true, consentimientoPersonas: true })).toBeNull();
  });

  it("rechaza imagen vacía, gigante o de formato raro", () => {
    expect(motivoDenegacion({ ...base, imagenBytes: 0 })).toMatch(/imagen/i);
    expect(motivoDenegacion({ ...base, imagenBytes: MAX_IMAGEN_BYTES + 1 })).toMatch(/MB/);
    expect(motivoDenegacion({ ...base, imagenBytes: MAX_IMAGEN_BYTES })).toBeNull();
    expect(motivoDenegacion({ ...base, mime: "image/tiff" })).toMatch(/Formato/);
  });

  it("rechaza al llegar al tope diario", () => {
    expect(motivoDenegacion({ ...base, usoHoy: TOPE_DIARIO_POR_DEFECTO })).toMatch(/tope/);
    expect(motivoDenegacion({ ...base, usoHoy: TOPE_DIARIO_POR_DEFECTO - 1 })).toBeNull();
  });
});

describe("topeAlcanzado y claveDia", () => {
  it("compara con el tope", () => {
    expect(topeAlcanzado(3, 3)).toBe(true);
    expect(topeAlcanzado(2, 3)).toBe(false);
  });

  it("la clave de día es AAAA-MM-DD en UTC", () => {
    expect(claveDia(new Date("2026-10-13T23:59:00Z"))).toBe("2026-10-13");
  });
});

describe("urlDeArchivo", () => {
  it("usa la url absoluta cuando existe", () => {
    expect(urlDeArchivo({ path: "a", url: "https://x/glb" })).toBe("https://x/glb");
  });

  it("construye la URL de descarga desde el path", () => {
    expect(urlDeArchivo({ path: "/tmp/x.glb" })).toBe(`${ESPACIO_HF_URL}/gradio_api/file=/tmp/x.glb`);
  });

  it("devuelve null sin path ni url", () => {
    expect(urlDeArchivo({ path: "" })).toBeNull();
  });
});

describe("cuerpos de llamada Gradio", () => {
  const img = { path: "/tmp/foto.png" };

  it("preproceso manda un FileData con meta de Gradio", () => {
    const c = cuerpoPreproceso(img) as { data: { path: string; meta: { _type: string } }[] };
    expect(c.data[0].path).toBe("/tmp/foto.png");
    expect(c.data[0].meta._type).toBe("gradio.FileData");
  });

  it("generate_3d lleva 18 parámetros con los valores por defecto del Space", () => {
    const c = cuerpoGenerar3d(img) as { data: unknown[] };
    expect(c.data).toHaveLength(18);
    expect(c.data[2]).toBe(1024); // resolución por defecto (modo poca VRAM)
    expect(c.data[17]).toBe("starseed"); // session_id
    const conOpciones = cuerpoGenerar3d(img, { seed: 7, resolution: 512 }, "s1") as { data: unknown[] };
    expect(conOpciones.data[1]).toBe(7);
    expect(conOpciones.data[2]).toBe(512);
    expect(conOpciones.data[17]).toBe("s1");
  });

  it("extract_glb_api lleva state_path, decimación, textura y sesión", () => {
    const c = cuerpoExtraerGlb("/tmp/estado", {}, "s1") as { data: unknown[] };
    expect(c.data).toEqual(["/tmp/estado", 120000, 1024, "s1"]);
    const c2 = cuerpoExtraerGlb("/tmp/estado", { decimationTarget: 2000, textureSize: 512 }) as { data: unknown[] };
    expect(c2.data[1]).toBe(2000);
    expect(c2.data[2]).toBe(512);
  });
});

describe("resultadoDeSse", () => {
  it("lee el data del evento complete", () => {
    const sse = "event: heartbeat\ndata: null\nevent: complete\ndata: [{\"path\": \"/tmp/x.glb\"}]\n";
    const r = resultadoDeSse(sse);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos[0]).toEqual({ path: "/tmp/x.glb" });
  });

  it("reporta event: error (cuota agotada)", () => {
    const r = resultadoDeSse("event: error\ndata: null\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/error|cuota/i);
  });

  it("reporta JSON dañado y ausencia de complete", () => {
    expect(resultadoDeSse("event: complete\ndata: {roto\n").ok).toBe(false);
    expect(resultadoDeSse("event: heartbeat\ndata: null\n").ok).toBe(false);
  });
});

describe("urlGlbDeResultado y statePathDeResultado", () => {
  it("extrae la URL del GLB del primer valor", () => {
    expect(urlGlbDeResultado([{ path: "/tmp/a.glb" }])).toBe(`${ESPACIO_HF_URL}/gradio_api/file=/tmp/a.glb`);
    expect(urlGlbDeResultado([{ url: "https://x/a.glb", path: "" }])).toBe("https://x/a.glb");
    expect(urlGlbDeResultado([])).toBeNull();
    expect(urlGlbDeResultado([42])).toBeNull();
  });

  it("busca la ruta de estado en claves conocidas o dice null", () => {
    expect(statePathDeResultado([{ state_path: "/tmp/estado" }])).toBe("/tmp/estado");
    expect(statePathDeResultado([{ path: "/tmp/estado2" }])).toBe("/tmp/estado2");
    expect(statePathDeResultado([{ state: "xyz" }])).toBe("xyz");
    expect(statePathDeResultado([{ otra: 1 }])).toBeNull();
    expect(statePathDeResultado([])).toBeNull();
  });
});

describe("procedenciaMotor", () => {
  it("apunta al motor pixal3d-espacio de motores.ts con su licencia real", () => {
    const p = procedenciaMotor();
    expect(p.motorId).toBe("pixal3d-espacio");
    if (p.motorId) {
      expect(p.licencia).toMatch(/MIT/);
      expect(p.fuente).toBe("https://huggingface.co/spaces/TencentARC/Pixal3D");
    }
  });
});
