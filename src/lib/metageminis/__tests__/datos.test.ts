import { describe, expect, it } from "vitest";
import {
  LIMITE_FILAS,
  TABLAS,
  cargarTodo,
  confirmarEnlace,
  datosVacios,
  decidirBorrador,
  decidirPieza,
  marcarHecho,
  motivoError,
  sinPermiso,
  tablaAusente,
  type ClienteMeta,
  type ErrorBd,
} from "../datos";

interface Llamada {
  nombre: string;
  args?: Record<string, unknown>;
}

function falso(opciones: { tablas?: Record<string, { data?: unknown[]; error?: ErrorBd }>; sesion?: boolean; rpc?: (n: string) => { error: ErrorBd | null }; sesionLanza?: boolean } = {}) {
  const consultas: { tabla: string; orden: string; ascendente: boolean; limite: number }[] = [];
  const llamadas: Llamada[] = [];
  const cliente: ClienteMeta = {
    from(tabla: string) {
      return {
        select(columnas: string) {
          expect(columnas).toBe("*");
          return {
            order(orden: string, { ascending }: { ascending: boolean }) {
              return {
                limit(limite: number) {
                  consultas.push({ tabla, orden, ascendente: ascending, limite });
                  const r = opciones.tablas?.[tabla] ?? { data: [] };
                  return Promise.resolve({ data: r.error ? null : (r.data ?? []), error: r.error ?? null });
                },
              };
            },
          };
        },
      };
    },
    rpc(nombre: string, args?: Record<string, unknown>) {
      llamadas.push({ nombre, args });
      const r = opciones.rpc?.(nombre) ?? { error: null };
      return Promise.resolve({ data: r.error ? null : {}, error: r.error });
    },
    auth: {
      getSession() {
        if (opciones.sesionLanza) return Promise.reject(new Error("sin red"));
        return Promise.resolve({ data: { session: opciones.sesion === false ? null : { user: {} } } });
      },
    },
  } as unknown as ClienteMeta;
  return { cliente, consultas, llamadas };
}

describe("lectura de las tablas", () => {
  it("lee las ocho tablas ordenadas y con límite, y devuelve los datos", async () => {
    const f = falso({ tablas: { metageminis_borradores: { data: [{ id: "b1" }] }, metageminis_piezas: { data: [{ id: "p1" }, { id: "p2" }] } } });
    const c = await cargarTodo(f.cliente);
    expect(c.sesion).toBe(true);
    expect(c.sinTabla).toEqual([]);
    expect(c.errores).toEqual({});
    expect(c.datos.borradores).toHaveLength(1);
    expect(c.datos.piezas).toHaveLength(2);
    expect(f.consultas).toHaveLength(Object.keys(TABLAS).length);
    expect(f.consultas.every((q) => q.limite === LIMITE_FILAS)).toBe(true);
    expect(f.consultas.find((q) => q.tabla === "metageminis_agentes")).toMatchObject({ orden: "nombre", ascendente: true });
    expect(f.consultas.find((q) => q.tabla === "metageminis_piezas")).toMatchObject({ orden: "creado_en", ascendente: false });
  });

  it("dice qué tablas faltan cuando la migración no está aplicada, sin romper las demás", async () => {
    const f = falso({
      tablas: {
        metageminis_piezas: { error: { code: "PGRST205", message: "Could not find the table 'public.metageminis_piezas' in the schema cache" } },
        metageminis_donaciones: { error: { code: "42P01", message: 'relation "metageminis_donaciones" does not exist' } },
        metageminis_borradores: { data: [{ id: "b1" }] },
      },
    });
    const c = await cargarTodo(f.cliente);
    expect(c.sinTabla).toEqual(["donaciones", "piezas"]);
    expect(c.errores).toEqual({});
    expect(c.datos.borradores).toHaveLength(1);
    expect(c.datos.piezas).toEqual([]);
  });

  it("distingue «no existe» de «no se pudo leer» y explica los permisos", async () => {
    const f = falso({
      tablas: {
        metageminis_resultados: { error: { code: "42501", message: "permission denied for table metageminis_resultados" } },
        metageminis_enlaces_pago: { error: { code: "XX000", message: "boom" } },
      },
    });
    const c = await cargarTodo(f.cliente);
    expect(c.sinTabla).toEqual([]);
    expect(c.errores.resultados).toMatch(/miembros de MetaGenesis/);
    expect(c.errores.enlaces).toBe("boom");
  });

  it("sin sesión no lee nada y lo dice", async () => {
    const f = falso({ sesion: false });
    const c = await cargarTodo(f.cliente);
    expect(c.sesion).toBe(false);
    expect(f.consultas).toHaveLength(0);
    expect(c.datos).toEqual(datosVacios());
  });

  it("si la sesión no se puede comprobar, tampoco lee", async () => {
    const f = falso({ sesionLanza: true });
    expect((await cargarTodo(f.cliente)).sesion).toBe(false);
  });

  it("reconoce los errores de tabla ausente y de permiso", () => {
    expect(tablaAusente({ code: "42P01" })).toBe(true);
    expect(tablaAusente({ code: "PGRST205" })).toBe(true);
    expect(tablaAusente({ message: "Could not find the table x" })).toBe(true);
    expect(tablaAusente({ code: "42501" })).toBe(false);
    expect(tablaAusente(null)).toBe(false);
    expect(sinPermiso({ code: "42501" })).toBe(true);
    expect(sinPermiso({ message: "Permission denied" })).toBe(true);
    expect(sinPermiso({ code: "42P01" })).toBe(false);
    expect(motivoError(null)).toBe("");
  });
});

describe("decisiones (solo dueños, por RPC)", () => {
  it("aprobar y descartar un borrador llaman a la RPC con sus argumentos", async () => {
    const f = falso();
    expect(await decidirBorrador("b1", true, undefined, f.cliente)).toEqual({ ok: true });
    expect(await decidirBorrador("b2", false, "  no encaja  ", f.cliente)).toEqual({ ok: true });
    expect(f.llamadas).toEqual([
      { nombre: "metageminis_decidir_borrador", args: { _id: "b1", _aprobar: true, _motivo: null } },
      { nombre: "metageminis_decidir_borrador", args: { _id: "b2", _aprobar: false, _motivo: "no encaja" } },
    ]);
  });

  it("recorta el motivo a 300 caracteres", async () => {
    const f = falso();
    await decidirPieza("p1", false, "x".repeat(500), f.cliente);
    expect((f.llamadas[0].args as { _motivo: string })._motivo).toHaveLength(300);
  });

  it("aprobar una pieza, marcar hecho y confirmar un enlace llaman a su RPC", async () => {
    const f = falso();
    await decidirPieza("p1", true, undefined, f.cliente);
    await marcarHecho("borrador", "b1", f.cliente);
    await marcarHecho("pieza", "p1", f.cliente);
    await confirmarEnlace("e1", true, f.cliente);
    expect(f.llamadas.map((l) => l.nombre)).toEqual([
      "metageminis_decidir_pieza",
      "metageminis_marcar_hecho",
      "metageminis_marcar_hecho",
      "metageminis_confirmar_enlace",
    ]);
    expect(f.llamadas[1].args).toEqual({ _tabla: "borrador", _id: "b1" });
    expect(f.llamadas[3].args).toEqual({ _id: "e1", _activo: true });
  });

  it("traduce los errores de la base a palabras", async () => {
    const caso = async (code: string) => (await decidirBorrador("b1", true, undefined, falso({ rpc: () => ({ error: { code, message: "x" } }) }).cliente)).motivo;
    expect(await caso("42501")).toMatch(/dueño/);
    expect(await caso("23514")).toMatch(/no es válido/);
    expect(await caso("P0002")).toMatch(/No se encontró/);
    expect(await caso("PGRST202")).toMatch(/migración sin aplicar/);
    expect(await caso("XX")).toBe("x");
  });

  it("sin identificador no llama a nada", async () => {
    const f = falso();
    expect(await decidirBorrador("", true, undefined, f.cliente)).toMatchObject({ ok: false });
    expect(await marcarHecho("pieza", "", f.cliente)).toMatchObject({ ok: false });
    expect(await confirmarEnlace("", true, f.cliente)).toMatchObject({ ok: false });
    expect(f.llamadas).toHaveLength(0);
  });

  it("si la red falla no lanza", async () => {
    const roto = { rpc: () => { throw new Error("sin red"); } } as unknown as ClienteMeta;
    expect(await decidirPieza("p1", true, undefined, roto)).toEqual({ ok: false, motivo: "sin red" });
  });
});
