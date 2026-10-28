/**
 * Pruebas de /api/genesis/conectores (Ola 1019G · GCA1019L).
 * Dependencias falsas: sesión, guardián, datos y bóveda. Sin red ni disco.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  aAsignacionMando, aAsignacionPublica, ambitoDeUrl, cadenaValida, catalogoPublico,
  huellaDeValor, leerCuerpo, validarCuerpo,
} from "@/lib/genesis/conectores/vacio";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";

const falso = vi.hoisted(() => ({
  usuario: null as { id: string; email: string | null } | null,
  permitido: true,
  veto: null as Response | null,
  llamadas: [] as string[],
  vinculo: { huella: "h-1" } as { huella?: string; error?: string },
  asignacion: { ok: true } as { ok: boolean; error?: string },
  opciones: { catalogo: [{ id: "op" }], sugerencias: [], asignaciones: [] },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: falso.usuario } }) } }),
}));
vi.mock("@/lib/mando/guardian", () => ({ guardianMando: async () => falso.veto }));
vi.mock("@/lib/genesis/conectores/sugerir-conector", () => ({
  cargarOpciones: async (a: string) => { falso.llamadas.push(`cargar:${a}`); return falso.opciones; },
  guardarEnBoveda: async (a: string, p: string) => {
    falso.llamadas.push(`vincular:${a}:${p}`); return falso.vinculo;
  },
  asignarClave: async (a: string, c: string, cadena: string[]) => {
    falso.llamadas.push(`asignar:${a}:${c}:${cadena.join(",")}`); return falso.asignacion;
  },
  permiteUsarApis: async () => falso.permitido,
}));
import { GET, POST } from "../route";

const req = (metodo: "GET" | "POST", cuerpo?: unknown, ambito: string | null = "amb-1"): Request =>
  new Request(
    `http://x/api/genesis/conectores${ambito === null ? "" : `?ambito=${encodeURIComponent(ambito)}`}`,
    { method: metodo, body: metodo === "POST" ? JSON.stringify(cuerpo ?? {}) : undefined },
  );
const sesion = (id = "u-1", email = "ana@star.seed") => { falso.usuario = { id, email }; };

beforeEach(() => {
  falso.usuario = null; falso.permitido = true; falso.veto = null; falso.llamadas = [];
  falso.vinculo = { huella: "h-1" }; falso.asignacion = { ok: true };
});

describe("GET /api/genesis/conectores", () => {
  it("sin sesión 401 y sin ámbito 400", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    sesion();
    expect((await GET(req("GET", undefined, null))).status).toBe(400);
  });
  it("sin permiso 403 y respeta el veto del guardián", async () => {
    sesion(); falso.permitido = false;
    expect((await GET(req("GET"))).status).toBe(403);
    falso.permitido = true; falso.veto = Response.json({ error: "no" }, { status: 404 });
    expect((await GET(req("GET"))).status).toBe(404);
  });
  it("devuelve catálogo, sugerencias y asignaciones sin caché", async () => {
    sesion();
    const r = await GET(req("GET"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toMatchObject({ ambito: "amb-1", catalogo: [{ id: "op" }] });
    expect(falso.llamadas).toContain("cargar:amb-1");
  });
});

describe("POST /api/genesis/conectores", () => {
  it("sin sesión 401 y cuerpo inválido 400", async () => {
    expect((await POST(req("POST", { accion: "vincular" }))).status).toBe(401);
    sesion();
    const r = await POST(new Request("http://x/api/genesis/conectores?ambito=a", { method: "POST", body: "{" }));
    expect(r.status).toBe(400);
  });
  it("vincular sin valor no toca la bóveda; con valor responde solo la huella", async () => {
    sesion();
    expect((await POST(req("POST", { accion: "vincular", proveedor: "p" }))).status).toBe(400);
    expect(falso.llamadas.some((l) => l.startsWith("vincular"))).toBe(false);
    const r = await POST(req("POST", { accion: "vincular", proveedor: "p", valor: "secreto" }));
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j).toEqual({ accion: "vincular", proveedor: "p", huella: "h-1", ambito: "amb-1" });
    expect(JSON.stringify(j)).not.toContain("secreto");
  });
  it("error de bóveda 400; asignar normaliza la cadena y falla 400; acción desconocida 400", async () => {
    sesion();
    falso.vinculo = { error: "sin bóveda" };
    expect((await POST(req("POST", { accion: "vincular", proveedor: "p", valor: "v" }))).status).toBe(400);
    const r = await POST(req("POST", { accion: "asignar", clave: "escritor", cadena: "op-1" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ accion: "asignar", cadena: ["op-1"], ok: true });
    expect(falso.llamadas).toContain("asignar:amb-1:escritor:op-1");
    falso.asignacion = { ok: false, error: "no" };
    expect((await POST(req("POST", { accion: "asignar", clave: "chat", cadena: ["x"] }))).status).toBe(400);
    expect((await POST(req("POST", { accion: "borrar" }))).status).toBe(400);
  });
});

const op = (id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
  id, nombre: id, tipo: "proveedor", papeles: ["escritor"],
  gratis: { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: "sin dato" },
  requiereCuenta: true, enlaceAlta: null, enlaceClave: null, variables: ["X_API_KEY"],
  privacidad: "nube-sin-retencion", licencia: null, verificado: null, fuente: "prueba", ...extra,
});
const asig = (clave: Papel): Asignacion<Papel> => ({
  clave, cadena: [], respaldo: [],
  preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null },
});

describe("contrato puro", () => {
  it("valida ámbito, cuerpo JSON y cadena", () => {
    expect(ambitoDeUrl("http://x/a?ambito=amb-1")).toBe("amb-1");
    expect(ambitoDeUrl("http://x/a?ambito=")).toBeNull();
    expect(leerCuerpo("[]")).toBeNull();
    expect(leerCuerpo("{")).toBeNull();
    expect(leerCuerpo('{"a":1}')).toEqual({ a: 1 });
    expect(cadenaValida(["a", "a", "b"])).toEqual(["a", "b"]);
    expect(cadenaValida([])).toBeNull();
    expect(cadenaValida("")).toBeNull();
    expect(validarCuerpo({ accion: "asignar", clave: "escritor", cadena: "op-1" }))
      .toEqual({ accion: "asignar", clave: "escritor", cadena: ["op-1"] });
    expect(validarCuerpo({ accion: "borrar" })).toEqual({ error: "Acción no soportada." });
  });
  it("huella SHA-256 estable y sin el valor original", async () => {
    const h = await huellaDeValor("secreto");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("secreto");
    expect(await huellaDeValor("secreto")).toBe(h);
    expect(await huellaDeValor("otro")).not.toBe(h);
  });
  it("catálogo: sin vinculadas ni locales, por papel y gratis primero; límite null se conserva", () => {
    const r = catalogoPublico(
      [op("pago", { gratis: null, nombre: "aaa" }), op("gratis", { nombre: "zzz" }),
        op("local", { privacidad: "local" }), op("vinculada"), op("chat", { papeles: ["chat"] })],
      new Set(["vinculada"]), [asig("escritor")],
    );
    expect(r.map((o) => o.id)).toEqual(["gratis", "pago"]);
    expect(r[1].gratis).toBeNull();
    expect(r[0].variables).toEqual(["X_API_KEY"]);
  });
  it("filas de asignación válidas y permiso por registro", async () => {
    expect(aAsignacionMando({ clave: "escritor", cadena: ["a"] })?.clave).toBe("escritor");
    expect(aAsignacionMando({ clave: "inventado", cadena: ["a"] })).toBeNull();
    expect(aAsignacionPublica({ clave: "chat", cadena: ["a"] })).toEqual({ clave: "chat", cadena: ["a"], verificado: null });
    const real = await vi.importActual<typeof import("@/lib/genesis/conectores/sugerir-conector")>(
      "@/lib/genesis/conectores/sugerir-conector",
    );
    const dueno = { dueno: "ana@star.seed", invitaciones: [] };
    expect(real.permiteConRegistro("ana@star.seed", dueno)).toBe(true);
    expect(real.permiteConRegistro("nueva@star.seed", dueno)).toBe(true);
    const invitado = { dueno: "ana@star.seed", invitaciones: [{ correo: "leo@star.seed", vigente: true }] };
    expect(real.permiteConRegistro("leo@star.seed", invitado)).toBe(false);
    expect(real.permiteConRegistro("leo@star.seed", {
      ...invitado, invitaciones: [{ correo: "leo@star.seed", vigente: true, capacidades: ["usar-apis" as const] }],
    })).toBe(true);
  });
  it("cargarOpciones cae al catálogo público si las tablas no están", async () => {
    const real = await vi.importActual<typeof import("@/lib/genesis/conectores/sugerir-conector")>(
      "@/lib/genesis/conectores/sugerir-conector",
    );
    const r = await real.cargarOpciones("amb-1");
    expect(r.catalogo.length).toBeGreaterThan(0);
    expect(r.asignaciones).toEqual([]);
    expect(r.sugerencias.map((g) => g.clave)).toContain("gratis-por-vincular");
    expect(await real.asignarClave("amb-1", "chat", ["x"], { id: "u-1", correo: null }))
      .toEqual({ ok: false, error: "No se pudo guardar la asignación." });
  });
});
