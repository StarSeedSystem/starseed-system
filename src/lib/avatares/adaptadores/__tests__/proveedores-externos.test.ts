<<<<<<< HEAD
/** Proveedores externos opcionales (AV1011I): sin red, disco ni procesos (entorno = objeto, `fetch` simulado). Apagados por
 * defecto, `clave-externa` solo con clave Y permiso, peticiones de la documentación oficial y ninguna clave en los motivos. */
import { describe, expect, it } from "vitest";
import { planificar, type PeticionPlan } from "@/lib/avatares/adn/canalizacion";
import {
  MODELO, capacidadesExternas, consultarTarea, crearTarea, esUrlDescarga, estadoProveedores, motivoImagen,
  motivoNoDisponible, motoresDisponibles, procedenciaExterna, type Buscar, type Entorno, type Imagen,
} from "../proveedores-externos";

const CLAVE = ["clave", "de", "prueba", "no", "real"].join("-");
const ENCENDIDO: Entorno = { AVATARES_EXTERNOS_PERMITIDOS: "1", MESHY_API_KEY: CLAVE, TRIPO_API_KEY: CLAVE };
const SOLO_TRIPO: Entorno = { AVATARES_EXTERNOS_PERMITIDOS: "1", TRIPO_API_KEY: CLAVE };
const PNG: Imagen = { mime: "image/png", bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) };
interface Llamada { url: string; init: RequestInit | undefined }
function simulado(respuestas: Array<{ status?: number; cuerpo: unknown } | "sin-red">): { buscar: Buscar; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const buscar: Buscar = async (url, init) => {
    llamadas.push({ url, init });
    const r = respuestas.shift();
    if (!r || r === "sin-red") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.cuerpo), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { buscar, llamadas };
}
const cabecera = (l: Llamada, nombre: string): string | undefined => (l.init?.headers as Record<string, string> | undefined)?.[nombre];
const generarCon = (entorno: Entorno): string | null => planificar({
  partida: "imagen", esqueleto: "ninguno", region: "ES", comercial: false, permitirDePago: true,
  capacidades: ["navegador", "cpu", ...capacidadesExternas(entorno)],
} satisfies PeticionPlan, motoresDisponibles(entorno)).pasos.find((p) => p.etapa === "generar")?.motor?.id ?? null;
describe("apagados por defecto y honestos", () => {
  it("sin entorno, con la clave sola o con el permiso solo: no hay proveedor y se dice qué falta", () => {
    expect(motivoNoDisponible("meshy", {})).toMatch(/AVATARES_EXTERNOS_PERMITIDOS=1/);
    expect(motivoNoDisponible("meshy", { MESHY_API_KEY: CLAVE })).toMatch(/Apagado por defecto/);
    expect(motivoNoDisponible("tripo", { AVATARES_EXTERNOS_PERMITIDOS: "1" })).toMatch(/TRIPO_API_KEY/);
    for (const e of [{}, { MESHY_API_KEY: CLAVE, AVATARES_EXTERNOS_PERMITIDOS: "si" }, { AVATARES_EXTERNOS_PERMITIDOS: "1" }]) {
      expect(capacidadesExternas(e)).toEqual([]);
      expect(estadoProveedores(e).some((p) => p.disponible)).toBe(false);
    }
    expect(JSON.stringify(estadoProveedores({ MESHY_API_KEY: CLAVE }))).not.toContain(CLAVE);
  });
  it("con clave Y permiso se ofrece clave-externa, solo del proveedor que tiene clave", () => {
    expect(capacidadesExternas(SOLO_TRIPO)).toEqual(["clave-externa"]);
    expect(estadoProveedores(SOLO_TRIPO).map((p) => p.disponible)).toEqual([false, true]);
  });
  it("planificar: nada sin entorno; Meshy con las dos (atribución primero); Tripo si solo hay la suya", () => {
    expect(generarCon({})).toBeNull();
    expect(motoresDisponibles({}).some((m) => m.id === "meshy" || m.id === "tripo")).toBe(false);
    expect(generarCon(ENCENDIDO)).toBe("meshy");
    expect(generarCon(SOLO_TRIPO)).toBe("tripo");
    expect(procedenciaExterna("meshy")).toMatchObject({ uso: "atribucion", atribucion: "Modelo 3D generado con Meshy" });
    expect(procedenciaExterna("meshy")?.licencia).toMatch(/CC BY 4\.0/);
    expect(procedenciaExterna("tripo")?.uso).toBe("condicionado");
  });
  it("imagen solo PNG o JPEG con tamaño válido; descargas https del dominio del proveedor", () => {
    expect(motivoImagen(PNG)).toBeNull();
    expect([{ ...PNG, mime: "image/webp" }, { ...PNG, bytes: new Uint8Array(0) }, { ...PNG, bytes: new Uint8Array(9 << 20) }].map(motivoImagen))
      .toEqual([expect.stringMatching(/Formato/), expect.stringMatching(/vacía/), expect.stringMatching(/MB/)]);
    expect(esUrlDescarga("meshy", "https://assets.meshy.ai/t/model.glb?Expires=1")).toBe(true);
    expect(esUrlDescarga("tripo", "https://cdn.tripo3d.ai/output/model_pbr.glb")).toBe(true);
    for (const u of ["http://assets.meshy.ai/m.glb", "https://assets.meshy.ai.atacante.com/m.glb", "https://cdn.tripo3d.ai/m.glb", null]) {
      expect(esUrlDescarga("meshy", u)).toBe(false);
    }
  });
});
describe("crearTarea con fetch simulado", () => {
  it("Meshy: POST image-to-3d con data URI, Bearer y modelo; devuelve `result`", async () => {
    const { buscar, llamadas } = simulado([{ status: 202, cuerpo: { result: "018a210d-8ba4-705c-b111-1f1776f7f578" } }]);
    expect(await crearTarea("meshy", PNG, ENCENDIDO, buscar)).toEqual({ ok: true, valor: "018a210d-8ba4-705c-b111-1f1776f7f578" });
    expect([llamadas[0].url, llamadas[0].init?.method]).toEqual(["https://api.meshy.ai/openapi/v1/image-to-3d", "POST"]);
    expect(cabecera(llamadas[0], "Authorization")).toBe(`Bearer ${CLAVE}`);
    expect(JSON.parse(String(llamadas[0].init?.body))).toEqual({
      image_url: `data:image/png;base64,${Buffer.from(PNG.bytes).toString("base64")}`, ai_model: MODELO.meshy, should_texture: true,
    });
  });
  it("Tripo: sube a /files (multipart) y crea con el file_token", async () => {
    const { buscar, llamadas } = simulado([{ cuerpo: { code: 0, data: { file_token: "file_abc123" } } }, { cuerpo: { code: 0, data: { task_id: "task_abc123" } } }]);
    expect(await crearTarea("tripo", PNG, ENCENDIDO, buscar)).toEqual({ ok: true, valor: "task_abc123" });
    expect(llamadas.map((l) => l.url)).toEqual(["https://openapi.tripo3d.ai/v3/files", "https://openapi.tripo3d.ai/v3/generation/image-to-model"]);
    expect(llamadas[0].init?.body).toBeInstanceOf(FormData);
    expect(cabecera(llamadas[0], "Content-Type")).toBeUndefined();
    expect(JSON.parse(String(llamadas[1].init?.body))).toEqual({ input: "file_abc123", model: MODELO.tripo });
  });
  it("apagado no toca la red; errores honestos y sin la clave: 401, 402, código de Tripo y sin red", async () => {
    const apagado = simulado([]);
    expect((await crearTarea("meshy", PNG, {}, apagado.buscar)).ok).toBe(false);
    expect(apagado.llamadas).toHaveLength(0);
    const motivos = (await Promise.all([
      crearTarea("meshy", PNG, ENCENDIDO, simulado([{ status: 401, cuerpo: { message: "Missing or invalid API key" } }]).buscar),
      crearTarea("meshy", PNG, ENCENDIDO, simulado([{ status: 402, cuerpo: {} }]).buscar),
      crearTarea("tripo", PNG, ENCENDIDO, simulado([{ cuerpo: { code: 2010, message: "Insufficient credits" } }]).buscar),
      crearTarea("tripo", PNG, ENCENDIDO, simulado(["sin-red"]).buscar),
    ])).map((c) => (c.ok ? "" : c.motivo));
    [/rechazó la clave/, /sin créditos/, /2010.*Insufficient credits/, /sin red/].forEach((re, i) => expect(motivos[i]).toMatch(re));
    expect(motivos.join(" ")).not.toContain(CLAVE);
  });
});
describe("consultarTarea: una sola petición por llamada", () => {
  const consulta = (p: "meshy" | "tripo", id: string, cuerpo: unknown) => consultarTarea(p, id, ENCENDIDO, simulado([{ cuerpo }]).buscar);
  it("Meshy: en curso, lista con su GLB en la ruta oficial, GLB ajeno no vale y el fallo trae su motivo", async () => {
    expect(await consulta("meshy", "a", { status: "IN_PROGRESS", progress: 40 })).toEqual({ ok: true, valor: { estado: "trabajando", progreso: 40, glb: null, motivo: null } });
    const { buscar, llamadas } = simulado([{ cuerpo: { status: "SUCCEEDED", progress: 100, model_urls: { glb: "https://assets.meshy.ai/x/model.glb" } } }]);
    const lista = await consultarTarea("meshy", "abc-1", ENCENDIDO, buscar);
    expect(lista.ok && lista.valor).toMatchObject({ estado: "lista", glb: "https://assets.meshy.ai/x/model.glb" });
    expect(llamadas.map((l) => l.url)).toEqual(["https://api.meshy.ai/openapi/v1/image-to-3d/abc-1"]);
    const ajeno = await consulta("meshy", "a", { status: "SUCCEEDED", model_urls: { glb: "https://atacante.example/m.glb" } });
    expect(ajeno.ok && ajeno.valor.estado).toBe("fallida");
    const fallo = await consulta("meshy", "a", { status: "FAILED", task_error: { message: "imagen sin sujeto" } });
    expect(fallo.ok && fallo.valor).toMatchObject({ estado: "fallida", motivo: "imagen sin sujeto" });
  });
  it("Tripo: /tasks/{id} con output.model_url; estado desconocido es error; id raro no sale a la red", async () => {
    const { buscar, llamadas } = simulado([{ cuerpo: { code: 0, data: { status: "success", output: { model_url: "https://cdn.tripo3d.ai/o/m.glb" } } } }]);
    const r = await consultarTarea("tripo", "task_abc123", ENCENDIDO, buscar);
    expect(r.ok && r.valor).toMatchObject({ estado: "lista", progreso: 100, glb: "https://cdn.tripo3d.ai/o/m.glb" });
    expect(llamadas[0].url).toBe("https://openapi.tripo3d.ai/v3/tasks/task_abc123");
    expect((await consulta("tripo", "task_x", { code: 0, data: { status: "dormido" } })).ok).toBe(false);
    const vacio = simulado([]);
    expect((await consultarTarea("tripo", "../account/balance", ENCENDIDO, vacio.buscar)).ok).toBe(false);
    expect(vacio.llamadas).toHaveLength(0);
  });
});
=======
import { describe, it, expect } from "vitest";
import { motivoDescarte, type PeticionPlan } from "@/lib/avatares/adn/canalizacion";
import { MOTORES_3D, type Motor3D } from "@/lib/avatares/adn/motores";

describe("motivoDescarte", () => {
  // Test cases will be added here
});
>>>>>>> c27e427e (salvavidas · RTRTRTRTRTRTCOL1012Bdsbbbbbbbb: trabajo del agente antes de las puertas (tsc / vitest))
