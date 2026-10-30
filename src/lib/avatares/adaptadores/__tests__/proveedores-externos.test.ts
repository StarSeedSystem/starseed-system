/** Proveedores externos opcionales (AV1011I): sin red, disco ni procesos (entorno = objeto, `fetch` simulado). Apagados por
 * defecto, `clave-externa` solo con clave Y permiso, peticiones de la documentación oficial y ninguna clave en los motivos. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { planificar, type PeticionPlan } from "@/lib/avatares/adn/canalizacion";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  MODELO, TOPE_DIARIO, VENTANA_TOPE_MS, capacidadesExternas, consultarTarea, crearTarea, esUrlDescarga, estadoProveedores,
  motivoImagen, motivoNoDisponible, motoresDisponibles, procedenciaExterna, reservarTope,
  type Buscar, type Entorno, type Imagen, type Limitador,
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
   it("permiso \"0\" + clave: apagado (el permiso exige el valor 1)", () => {
     expect(motivoNoDisponible("meshy", { AVATARES_EXTERNOS_PERMITIDOS: "0", MESHY_API_KEY: CLAVE })).toMatch(/Apagado por defecto/);
     expect(capacidadesExternas({ AVATARES_EXTERNOS_PERMITIDOS: "0", MESHY_API_KEY: CLAVE })).toEqual([]);
     expect(estadoProveedores({ AVATARES_EXTERNOS_PERMITIDOS: "0", MESHY_API_KEY: CLAVE }).some((p) => p.disponible)).toBe(false);
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
    it("respuesta sin result: lanza", async () => {
      const { buscar } = simulado([{ status: 200, cuerpo: {} }]);
      const resultado = await crearTarea("meshy", PNG, ENCENDIDO, buscar);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.motivo).toBe("Meshy no devolvió el id de la tarea.");
      }
    });
   it("tripo: «no disponible» sin llamar a la red", async () => {
     const sinTripo = { AVATARES_EXTERNOS_PERMITIDOS: "0" }; // Sin permiso
     const { buscar, llamadas } = simulado([{ status: 200, cuerpo: {} }]);
     const resultado = await crearTarea("tripo", PNG, sinTripo, buscar);
     expect(resultado.ok).toBe(false);
     expect(llamadas).toHaveLength(0); // No debe llamar a la red
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

/* ── Casos añadidos (RTAV1011Ld). Todos usan el módulo REAL; ninguno reimplementa su lógica. ──
 * Descartados a propósito, porque main cambió el contrato: «tripo: no disponible» (Tripo ya está implementado) y el cuerpo con
 * `target_formats` / la URL `/v2` de la rama archivada (main usa /openapi/v1 con data URI, `ai_model` y `should_texture`). */
const sinRed = (): { buscar: Buscar; llamadas: Llamada[] } => simulado([]);
/** `fetch` que contesta UN texto crudo (no JSON) con el estado dado. */
function crudo(texto: string, status = 200): { buscar: Buscar; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const buscar: Buscar = async (url, init) => { llamadas.push({ url, init }); return new Response(texto, { status }); };
  return { buscar, llamadas };
}
/** Lo que viaja en un cuerpo: el texto si es JSON; las claves de los campos si es multipart (la imagen no se vuelca). */
const cuerpoComoTexto = (b: unknown): string => (typeof b === "string" ? b : b instanceof FormData ? [...b.keys()].join(",") : "");
const razon = (r: { ok: boolean; motivo?: string }): string => (r.ok ? "" : String(r.motivo));

describe("el permiso exige exactamente «1»", () => {
  it.each(["0", "true", "TRUE", " 1", "1 ", "", "2", "si"])("AVATARES_EXTERNOS_PERMITIDOS=%j apaga los dos proveedores aunque haya claves", (v) => {
    const e: Entorno = { AVATARES_EXTERNOS_PERMITIDOS: v, MESHY_API_KEY: CLAVE, TRIPO_API_KEY: CLAVE };
    expect(motivoNoDisponible("meshy", e)).toMatch(/AVATARES_EXTERNOS_PERMITIDOS=1/);
    expect(motivoNoDisponible("tripo", e)).toMatch(/AVATARES_EXTERNOS_PERMITIDOS=1/);
    expect(capacidadesExternas(e)).toEqual([]);
    expect(motoresDisponibles(e).some((m) => m.id === "meshy" || m.id === "tripo")).toBe(false);
  });
  it("con «1» una clave vacía sigue sin valer, y solo se enciende el proveedor que tiene la suya", () => {
    expect(motivoNoDisponible("meshy", { AVATARES_EXTERNOS_PERMITIDOS: "1", MESHY_API_KEY: "" })).toMatch(/MESHY_API_KEY/);
    expect(estadoProveedores(ENCENDIDO).map((p) => [p.id, p.disponible, p.motivo])).toEqual([["meshy", true, null], ["tripo", true, null]]);
  });
});

describe("crearTarea: respuestas incompletas y errores HTTP, siempre una sola petición por paso", () => {
  it.each([{}, { result: "" }, { result: 5 }, { result: null }])("Meshy con %j no devuelve id de tarea", async (cuerpo) => {
    const { buscar, llamadas } = simulado([{ status: 200, cuerpo }]);
    expect(razon(await crearTarea("meshy", PNG, ENCENDIDO, buscar))).toMatch(/id de la tarea/);
    expect(llamadas).toHaveLength(1);
  });
  it.each([{ code: 0, data: {} }, { code: 0 }, { code: 0, data: { file_token: "" } }])("Tripo sin file_token (%j) se queda en la subida", async (cuerpo) => {
    const { buscar, llamadas } = simulado([{ cuerpo }]);
    expect(razon(await crearTarea("tripo", PNG, ENCENDIDO, buscar))).toMatch(/file_token/);
    expect(llamadas).toHaveLength(1);
  });
  it("Tripo sin task_id tras subir la imagen: dos peticiones y el motivo del id", async () => {
    const { buscar, llamadas } = simulado([{ cuerpo: { code: 0, data: { file_token: "f1" } } }, { cuerpo: { code: 0, data: {} } }]);
    expect(razon(await crearTarea("tripo", PNG, ENCENDIDO, buscar))).toMatch(/id de la tarea/);
    expect(llamadas).toHaveLength(2);
  });
  it.each([[403, /sin créditos/], [429, /demasiadas peticiones/], [500, /HTTP 500/]] as const)("HTTP %i en Meshy y en Tripo da su motivo sin reintentar", async (status, motivo) => {
    for (const p of ["meshy", "tripo"] as const) {
      const { buscar, llamadas } = simulado([{ status, cuerpo: {} }]);
      expect(razon(await crearTarea(p, PNG, ENCENDIDO, buscar))).toMatch(motivo);
      expect(llamadas).toHaveLength(1);
    }
  });
  it("si falla la SEGUNDA petición de Tripo (crear tras subir) también se dice, sin la clave", async () => {
    const { buscar, llamadas } = simulado([{ cuerpo: { code: 0, data: { file_token: "f1" } } }, { status: 402, cuerpo: {} }]);
    const motivo = razon(await crearTarea("tripo", PNG, ENCENDIDO, buscar));
    expect(motivo).toMatch(/sin créditos/);
    expect(motivo).not.toContain(CLAVE);
    expect(llamadas).toHaveLength(2);
  });
  it("un cuerpo que no es JSON, o que es JSON pero no un objeto, no se puede leer", async () => {
    for (const p of ["meshy", "tripo"] as const) {
      for (const texto of ["<html>502 Bad Gateway</html>", JSON.stringify("hola"), "null"]) {
        const { buscar, llamadas } = crudo(texto);
        expect(razon(await crearTarea(p, PNG, ENCENDIDO, buscar))).toMatch(/no se pudo leer/);
        expect(llamadas).toHaveLength(1);
      }
    }
  });
  it("Meshy sin red lo dice sin la clave", async () => {
    const motivo = razon(await crearTarea("meshy", PNG, ENCENDIDO, simulado(["sin-red"]).buscar));
    expect(motivo).toMatch(/sin red/);
    expect(motivo).not.toContain(CLAVE);
  });
});

describe("lo que sale a la red", () => {
  it("una imagen no admitida (webp, vacía, demasiado grande) no toca la red con ningún proveedor", async () => {
    const malas: Imagen[] = [{ ...PNG, mime: "image/webp" }, { ...PNG, bytes: new Uint8Array(0) }, { ...PNG, bytes: new Uint8Array(9 << 20) }];
    for (const p of ["meshy", "tripo"] as const) {
      for (const img of malas) {
        const red = sinRed();
        expect((await crearTarea(p, img, ENCENDIDO, red.buscar)).ok).toBe(false);
        expect(red.llamadas).toHaveLength(0);
      }
    }
  });
  it("Tripo manda Authorization en las dos peticiones y JSON solo en la segunda; Meshy manda las dos cabeceras", async () => {
    const tripo = simulado([{ cuerpo: { code: 0, data: { file_token: "f1" } } }, { cuerpo: { code: 0, data: { task_id: "t1" } } }]);
    await crearTarea("tripo", PNG, ENCENDIDO, tripo.buscar);
    expect(tripo.llamadas.map((l) => cabecera(l, "Authorization"))).toEqual([`Bearer ${CLAVE}`, `Bearer ${CLAVE}`]);
    expect(tripo.llamadas.map((l) => cabecera(l, "Content-Type"))).toEqual([undefined, "application/json"]);
    const meshy = simulado([{ status: 202, cuerpo: { result: "m1" } }]);
    await crearTarea("meshy", PNG, ENCENDIDO, meshy.buscar);
    expect([cabecera(meshy.llamadas[0], "Authorization"), cabecera(meshy.llamadas[0], "Content-Type")]).toEqual([`Bearer ${CLAVE}`, "application/json"]);
  });
  it("la clave solo va en Authorization: ni en las URL ni en ningún cuerpo", async () => {
    const tripo = simulado([{ cuerpo: { code: 0, data: { file_token: "f1" } } }, { cuerpo: { code: 0, data: { task_id: "t1" } } }]);
    const meshy = simulado([{ status: 202, cuerpo: { result: "m1" } }]);
    await crearTarea("tripo", PNG, ENCENDIDO, tripo.buscar);
    await crearTarea("meshy", PNG, ENCENDIDO, meshy.buscar);
    for (const l of [...tripo.llamadas, ...meshy.llamadas]) {
      expect(l.url).not.toContain(CLAVE);
      expect(cuerpoComoTexto(l.init?.body)).not.toContain(CLAVE);
    }
  });
});

describe("consultarTarea: estados, bordes y descargas", () => {
  const consulta = (p: "meshy" | "tripo", id: string, cuerpo: unknown) => consultarTarea(p, id, ENCENDIDO, simulado([{ cuerpo }]).buscar);
  const tripo = (data: Record<string, unknown>) => ({ code: 0, data });
  it("Meshy PENDING es «en-cola» y CANCELED es fallida con el motivo por defecto", async () => {
    expect(await consulta("meshy", "a", { status: "PENDING" })).toEqual({ ok: true, valor: { estado: "en-cola", progreso: 0, glb: null, motivo: null } });
    const c = await consulta("meshy", "a", { status: "CANCELED" });
    expect(c.ok && c.valor).toMatchObject({ estado: "fallida", glb: null, motivo: expect.stringMatching(/Meshy no pudo generar el modelo/) });
  });
  it.each([
    ["queued", "en-cola", {}], ["running", "trabajando", { progress: 30 }], ["cancelled", "fallida", {}], ["banned", "fallida", {}],
    ["failed", "fallida", { error_message: "imagen sin sujeto" }],
  ] as const)("Tripo «%s» es «%s»", async (status, estado, extra) => {
    const r = await consulta("tripo", "task_x", tripo({ status, ...extra }));
    expect(r.ok && r.valor.estado).toBe(estado);
    expect(r.ok && r.valor.glb).toBeNull();
    if (status === "failed") expect(r.ok && r.valor.motivo).toBe("imagen sin sujeto");
    if (status === "running") expect(r.ok && r.valor.progreso).toBe(30);
  });
  it("el progreso se recorta a 0..100 y lo que no es número vale 0", async () => {
    const progreso = async (p: unknown) => { const r = await consulta("meshy", "a", { status: "IN_PROGRESS", progress: p }); return r.ok ? r.valor.progreso : -1; };
    expect([await progreso(-5), await progreso(150), await progreso(55), await progreso("80"), await progreso(undefined)]).toEqual([0, 100, 55, 0, 0]);
  });
  it("un motivo de fallo larguísimo se recorta a 160 caracteres", async () => {
    const r = await consulta("meshy", "a", { status: "FAILED", task_error: { message: "x".repeat(500) } });
    expect(r.ok && r.valor.motivo).toHaveLength(160);
  });
  it("terminada sin GLB, o con uno que no es del proveedor, es fallida y lo dice", async () => {
    const casos: Array<["meshy" | "tripo", unknown]> = [
      ["meshy", { status: "SUCCEEDED", model_urls: {} }], ["meshy", { status: "SUCCEEDED" }], ["tripo", tripo({ status: "success", output: {} })],
      ["tripo", tripo({ status: "success", output: { model_url: "https://cdn.tripo3d.ai.evil.com/o/m.glb" } })],
      ["meshy", { status: "SUCCEEDED", model_urls: { glb: "http://assets.meshy.ai/x/model.glb" } }],
    ];
    for (const [p, cuerpo] of casos) {
      const r = await consulta(p, "a", cuerpo);
      expect(r.ok && r.valor).toMatchObject({ estado: "fallida", glb: null, motivo: expect.stringMatching(/sin un GLB descargable/) });
    }
  });
  it("un id con barra, espacios, vacío o de 81 caracteres no sale a la red; uno de 80 sí", async () => {
    for (const id of ["a/b", "../x", "a b", "", "a".repeat(81)]) {
      for (const p of ["meshy", "tripo"] as const) {
        const red = sinRed();
        expect(razon(await consultarTarea(p, id, ENCENDIDO, red.buscar))).toMatch(/id de la tarea no es válido/);
        expect(red.llamadas).toHaveLength(0);
      }
    }
    const { buscar, llamadas } = simulado([{ cuerpo: { status: "PENDING" } }]);
    expect((await consultarTarea("meshy", "a".repeat(80), ENCENDIDO, buscar)).ok).toBe(true);
    expect(llamadas).toHaveLength(1);
  });
  it("apagado no consulta; los fallos de Tripo (código 2010, HTTP 401) y de Meshy (404) se dicen sin la clave", async () => {
    const apagado = sinRed();
    expect(razon(await consultarTarea("meshy", "a", {}, apagado.buscar))).toMatch(/AVATARES_EXTERNOS_PERMITIDOS=1/);
    expect(apagado.llamadas).toHaveLength(0);
    const motivos = (await Promise.all([
      consultarTarea("tripo", "t", ENCENDIDO, simulado([{ cuerpo: { code: 2010, message: "Insufficient credits" } }]).buscar),
      consultarTarea("tripo", "t", ENCENDIDO, simulado([{ status: 401, cuerpo: {} }]).buscar),
      consultarTarea("meshy", "t", ENCENDIDO, simulado([{ status: 404, cuerpo: {} }]).buscar),
      consultarTarea("meshy", "t", ENCENDIDO, simulado(["sin-red"]).buscar),
    ])).map(razon);
    [/2010.*Insufficient credits/, /rechazó la clave/, /HTTP 404/, /sin red/].forEach((re, i) => expect(motivos[i]).toMatch(re));
    expect(motivos.join(" ")).not.toContain(CLAVE);
  });
});

describe("tope de modelos de pago: reservarTope con un limitador inyectado", () => {
  /** Limitador de prueba (ventana sin reloj): cuenta por clave y anota con qué tope y ventana le preguntan. */
  function limitadorDePrueba(): { limitar: Limitador; pedidas: Array<{ clave: string; tope: number; ventanaMs: number }> } {
    const cuentas = new Map<string, number>();
    const pedidas: Array<{ clave: string; tope: number; ventanaMs: number }> = [];
    const limitar: Limitador = (clave, tope, ventanaMs) => {
      pedidas.push({ clave, tope, ventanaMs });
      const n = (cuentas.get(clave) ?? 0) + 1;
      cuentas.set(clave, n);
      return { allowed: n <= tope, remaining: Math.max(0, tope - n), retryAfterSec: n <= tope ? 0 : 3600 };
    };
    return { limitar, pedidas };
  }
  afterEach(() => vi.useRealTimers());

  it("los topes son 2 por persona y 20 en total, en una ventana de 24 h", () => {
    expect(TOPE_DIARIO).toEqual({ persona: 2, total: 20 });
    expect(VENTANA_TOPE_MS).toBe(24 * 60 * 60 * 1000);
  });
  it("la tercera petición de la misma persona se deniega con su motivo y espera; otra persona sí pasa", () => {
    const { limitar } = limitadorDePrueba();
    expect(reservarTope(limitar, "ali")).toEqual({ ok: true, quedan: 1 });
    expect(reservarTope(limitar, "ali")).toEqual({ ok: true, quedan: 0 });
    const tercera = reservarTope(limitar, "ali");
    expect(tercera.ok).toBe(false);
    if (!tercera.ok) { expect(tercera.motivo).toMatch(/tu tope \(2 modelos.*cada 24 h/); expect(tercera.reintentarSeg).toBeGreaterThan(0); }
    expect(reservarTope(limitar, "bea")).toEqual({ ok: true, quedan: 1 });
  });
  it("pregunta primero por la persona y luego por el total, con el tope y la ventana de las constantes", () => {
    const { limitar, pedidas } = limitadorDePrueba();
    reservarTope(limitar, "ali");
    expect(pedidas).toEqual([
      { clave: "avatares-externo:persona:ali", tope: 2, ventanaMs: VENTANA_TOPE_MS },
      { clave: "avatares-externo:total", tope: 20, ventanaMs: VENTANA_TOPE_MS },
    ]);
  });
  it("quien ya agotó su tope no gasta cupo del total", () => {
    const { limitar, pedidas } = limitadorDePrueba();
    for (let i = 0; i < 5; i++) reservarTope(limitar, "ali");
    expect(pedidas.filter((p) => p.clave === "avatares-externo:total")).toHaveLength(2);
  });
  it("ninguna identidad choca con el total, ni siquiera una que se llame «total»", () => {
    const { limitar, pedidas } = limitadorDePrueba();
    reservarTope(limitar, "total");
    expect(new Set(pedidas.map((p) => p.clave)).size).toBe(2);
  });
  it("el total frena a todos: 10 personas agotan los 20 y la persona 11 se deniega por «todo el OS»", () => {
    const { limitar } = limitadorDePrueba();
    for (let i = 0; i < 10; i++) { reservarTope(limitar, `p${i}`); reservarTope(limitar, `p${i}`); }
    const r = reservarTope(limitar, "p10");
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.motivo).toMatch(/todo el OS \(20 cada 24 h\)/); expect(r.reintentarSeg).toBeGreaterThan(0); }
  });
  it("con el rateLimit REAL y el reloj simulado: sigue denegado a las 24 h menos 1 ms y vuelve a pasar a las 24 h", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.UTC(2031, 0, 1);
    vi.setSystemTime(t0);
    expect(reservarTope(rateLimit, "reloj")).toEqual({ ok: true, quedan: 1 });
    expect(reservarTope(rateLimit, "reloj")).toEqual({ ok: true, quedan: 0 });
    const denegada = reservarTope(rateLimit, "reloj");
    expect(denegada).toMatchObject({ ok: false, reintentarSeg: 86400 });
    vi.setSystemTime(t0 + VENTANA_TOPE_MS - 1);
    expect(reservarTope(rateLimit, "reloj")).toMatchObject({ ok: false, reintentarSeg: 1 });
    vi.setSystemTime(t0 + VENTANA_TOPE_MS);
    expect(reservarTope(rateLimit, "reloj")).toEqual({ ok: true, quedan: 1 });
  });
});
