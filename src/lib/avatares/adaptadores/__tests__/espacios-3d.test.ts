/**
 * Pruebas del adaptador de Spaces 3D (ESP1011C). Sin red, sin disco, sin procesos.
 * Usa el cliente de ESP1011A simulado; prueba respaldo Pixal3D → TRELLIS.2,
 * permisos/consentimiento, cuota y API cambiada.
 */
import { describe, expect, it } from "vitest";
import { hostPorDefecto } from "@/lib/espacios/cliente-espacios";
import {
  ESPACIO_PIXAL3D,
  ESPACIO_TRELLIS2,
  generar3DEspacios,
  motivoDenegacionEspacio3D,
  planEspacios3D,
} from "../espacios-3d";

const HOST_P = hostPorDefecto(ESPACIO_PIXAL3D);
const HOST_T = hostPorDefecto(ESPACIO_TRELLIS2);
const AHORA = Date.UTC(2026, 9, 22, 12, 0, 0);

function almacenEnMemoria() {
  const datos = new Map<string, string>();
  return { datos, get: (k: string) => datos.get(k) ?? null, set: (k: string, v: string) => (datos.set(k, v), true), remove: (k: string) => void datos.delete(k) };
}

function reloj() {
  let t = AHORA;
  return () => (t += 6000);
}

function simulaEspacio(espacioId: string, cfg: { ok?: boolean; glb?: boolean; dormido?: boolean; joinStatus?: number; error?: string } = {}) {
  const HOST = hostPorDefecto(espacioId);
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const f: any = async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } });
    if (url === `https://huggingface.co/api/spaces/${espacioId}`) return json({ runtime: { stage: cfg.dormido ? "SLEEPING" : "RUNNING" } });
    if (url === `${HOST}/config`) {
      if (cfg.dormido) return new Response("<html>Space is sleeping</html>", { status: 503 });
      return json({
        version: "6.0.0",
        api_prefix: "/gradio_api",
        dependencies: [{ id: 10, api_name: "generate_3d" }],
      });
    }
    if (url === `${HOST}/gradio_api/info`) return json({ named_endpoints: { "/generate_3d": { parameters: [{ parameter_name: "image", component: "Image" }, { parameter_name: "seed", component: "Slider", parameter_has_default: true, parameter_default: 1234 }] } } });
    if (url === `${HOST}/gradio_api/upload`) return json(["/tmp/gradio/ref.png"]);
    if (url === `${HOST}/gradio_api/queue/join`) {
      if (cfg.joinStatus) return json(cfg.error ? { error: cfg.error } : {}, cfg.joinStatus);
      return json({ event_id: "e1" });
    }
    if (url.startsWith(`${HOST}/gradio_api/queue/data`)) {
      if (cfg.error && !cfg.joinStatus) {
        const sse = `data: ${JSON.stringify({ msg: "process_completed", success: false, output: { error: cfg.error } })}\n\n`;
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      const out = cfg.glb === false
        ? { msg: "process_completed", success: true, output: { data: ["hecho"] } }
        : { msg: "process_completed", success: true, output: { data: [{ path: "/tmp/out.glb", url: null, orig_name: "modelo.glb", mime_type: "model/gltf-binary", meta: { _type: "gradio.FileData" } }] } };
      const sse = `data: ${JSON.stringify({ msg: "process_starts", eta: 10 })}\n\n` + `data: ${JSON.stringify(out)}\n\n`;
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    if (url.startsWith(`${HOST}/gradio_api/file=`)) return new Response(new Blob([new Uint8Array([103, 108, 84, 70])], { type: "model/gltf-binary" }));
    return new Response("no", { status: 404 });
  };
  return { f, llamadas };
}

function fetchMixto(p: any, t: any) {
  return async (url: string, init?: RequestInit) => {
    if (url.includes("TencentARC/Pixal3D") || url.includes(HOST_P.replace("https://", ""))) return p.f(url, init);
    if (url.includes("microsoft/TRELLIS") || url.includes(HOST_T.replace("https://", ""))) return t.f(url, init);
    if (url.includes("huggingface.co/api/spaces/TencentARC")) return p.f(url, init);
    if (url.includes("huggingface.co/api/spaces/microsoft")) return t.f(url, init);
    // delega al que corresponda por host
    if (url.includes("tencentarc-pixal3d")) return p.f(url, init);
    if (url.includes("microsoft-trellis")) return t.f(url, init);
    return p.f(url, init);
  };
}

describe("planEspacios3D", () => {
  it("Pixal3D primero, TRELLIS.2 de respaldo", () => {
    const plan = planEspacios3D();
    expect(plan[0]).toEqual({ espacioId: ESPACIO_PIXAL3D, endpoint: "generate_3d" });
    expect(plan[1]).toEqual({ espacioId: ESPACIO_TRELLIS2, endpoint: "generate_3d" });
  });
});

describe("motivoDenegacionEspacio3D", () => {
  const img = new Blob([new Uint8Array([1,2,3])], { type: "image/png" });
  it("pide permiso si no lo hay", () => {
    expect(motivoDenegacionEspacio3D({ imagen: img, titulo: "x", permisoRemoto: false })).toMatch(/permiso/i);
  });
  it("pide consentimiento si hay personas sin consentimiento", () => {
    expect(motivoDenegacionEspacio3D({ imagen: img, titulo: "x", permisoRemoto: true, esFotoDePersonas: true, consentimientoPersonas: false })).toMatch(/consentimiento/i);
  });
  it("acepta con permiso", () => {
    expect(motivoDenegacionEspacio3D({ imagen: img, titulo: "x", permisoRemoto: true })).toBeNull();
  });
});

describe("generar3DEspacios", () => {
  const img = new Blob([new Uint8Array([1,2,3])], { type: "image/png" });

  it("con permiso usa Pixal3D y devuelve GLB con procedencia", async () => {
    const p = simulaEspacio(ESPACIO_PIXAL3D, { ok: true });
    const t = simulaEspacio(ESPACIO_TRELLIS2, { ok: true });
    const r = await generar3DEspacios({ imagen: img, titulo: "avatar", permisoRemoto: true }, { fetch: fetchMixto(p,t) as any, almacen: almacenEnMemoria(), ahora: reloj() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.motorId).toBe("pixal3d-espacio");
      expect(r.archivo.tipo).toBe("glb");
      expect(r.procedencia[0].herramienta).toBe("pixal3d-espacio");
    }
  });

  it("si Pixal3D falla por cuota, pasa a TRELLIS.2 y avisa", async () => {
    const p = simulaEspacio(ESPACIO_PIXAL3D, { error: "You have exceeded your GPU quota (60s requested vs. 0s left)." });
    const t = simulaEspacio(ESPACIO_TRELLIS2, { ok: true });
    const r = await generar3DEspacios({ imagen: img, titulo: "avatar", permisoRemoto: true }, { fetch: fetchMixto(p,t) as any, almacen: almacenEnMemoria(), ahora: reloj() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.motorId).toBe("trellis2-espacio");
      expect(r.aviso).toMatch(/TRELLIS/i);
    }
  });

  it("si Pixal3D está dormido pasa a TRELLIS.2", async () => {
    const p = simulaEspacio(ESPACIO_PIXAL3D, { dormido: true });
    const t = simulaEspacio(ESPACIO_TRELLIS2, { ok: true });
    const r = await generar3DEspacios({ imagen: img, titulo: "avatar", permisoRemoto: true }, { fetch: fetchMixto(p,t) as any, almacen: almacenEnMemoria(), ahora: reloj() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.motorId).toBe("trellis2-espacio");
  });

  it("si ambos fallan, dice por qué y no inventa nada", async () => {
    const p = simulaEspacio(ESPACIO_PIXAL3D, { dormido: true });
    const t = simulaEspacio(ESPACIO_TRELLIS2, { joinStatus: 429, error: "queue is full" });
    const r = await generar3DEspacios({ imagen: img, titulo: "avatar", permisoRemoto: true }, { fetch: fetchMixto(p,t) as any, almacen: almacenEnMemoria(), ahora: reloj() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/Pixal3D|TRELLIS/i);
  });

  it("sin permiso no llama a ningún Space", async () => {
    const p = simulaEspacio(ESPACIO_PIXAL3D, { ok: true });
    const t = simulaEspacio(ESPACIO_TRELLIS2, { ok: true });
    const llamadasAntes = p.llamadas.length + t.llamadas.length;
    const r = await generar3DEspacios({ imagen: img, titulo: "avatar", permisoRemoto: false }, { fetch: fetchMixto(p,t) as any, almacen: almacenEnMemoria(), ahora: reloj() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/permiso/i);
    expect(p.llamadas.length + t.llamadas.length).toBe(llamadasAntes);
  });

  it("foto de personas sin consentimiento se rechaza", async () => {
    const p = simulaEspacio(ESPACIO_PIXAL3D, { ok: true });
    const r = await generar3DEspacios({ imagen: img, titulo: "avatar", permisoRemoto: true, esFotoDePersonas: true, consentimientoPersonas: false }, { fetch: p.f as any, almacen: almacenEnMemoria(), ahora: reloj() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/consentimiento/i);
  });
});
