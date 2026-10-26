/**
 * Tests de la ruta /api/genesis/conectores (Ola 1019G · GCA1019L · architecture/genesis-conectores-abiertos.md).
 * Prueba GET con catálogo filtrado, sugerencias y asignaciones; POST para vincular proveedor y asignar clave.
 * Se mockean Supabase (sesión), la comprobación de máquina y las funciones de negocio.
 * Sin red ni disco.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// Mock global para el usuario de Supabase
let mockUser: { id: string } | null = null;

vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mockUser } }) },
    }),
}));

vi.mock("@/lib/seguridad/misma-maquina", () => ({
    esPeticionDeEstaMaquina: () => false,
}));

vi.mock("@/lib/mando/guardian", () => ({
    guardianMando: async (req: any, opts: any) => {
        // Siempre permitir para los tests
        return null;
    },
}));

vi.mock("@/lib/genesis/ambito", () => ({
    ambitoDesde: (req: any) => {
        const url = new URL(req.url);
        return url.searchParams.get("ambito") || "test-ambito";
    },
}));

vi.mock("@/lib/genesis/conectores/sugerir-conector", () => ({
    sugerirParaAmbito: async (ambitoId: string) => {
        return [
            {
                clave: "local-por-activar",
                titulo: "Local por activar",
                opciones: [],
            },
            {
                clave: "gratis-por-vincular",
                titulo: "Gratis por vincular",
                opciones: [],
            },
            {
                clave: "sin-opcion",
                titulo: "Sin opción",
                papeles: [],
            },
        ];
    },
}));

vi.mock("@/lib/genesis/conectores/vacio", () => ({
    guardarEnBoveda: async (ambito: string, proveedor: string, valor: any) => {
        // Simular guardado exitoso
        const hash = btoa(`${proveedor}:${valor}:${ambito}`).slice(0, 32);
        return { huella: hash };
    },
    obtenerAsignacionesPorAmbito: async (ambitoId: string) => [],
    asignarClave: async (ambito: string, clave: string, cadena: string) => ({ ok: true }),
    obtenerCatalogo: async (ambitoId: string) => [],
}));

const peticion = (cuerpo: unknown, pathname = "/api/genesis/conectores", query = ""): NextRequest => {
    const url = `http://x${pathname}${query}`;
    const request = new Request(url, {
        method: cuerpo ? "POST" : "GET",
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
    });
    const nextUrl = new URL(request.url);
    return {
        ...request,
        nextUrl: {
            pathname: nextUrl.pathname,
        },
        text: async () => JSON.stringify(cuerpo || {}),
    } as unknown as NextRequest;
};

beforeEach(() => {
    mockUser = null;
});

// Importar la ruta después de los mocks
import { GET, POST } from "../route";

describe("GET /api/genesis/conectores", () => {
    it("sin sesión devuelve 401", async () => {
        mockUser = null;
        const r = await GET(peticion());
        expect(r.status).toBe(401);
    });

    it("con sesión y sin ?ambito devuelve 400", async () => {
        mockUser = { id: "u-1" };
        const r = await GET(peticion("", "/api/genesis/conectores"));
        expect(r.status).toBe(400);
    });

    it("con sesión y ?ambito devuelve 200 con sugerencias y asignaciones", async () => {
        mockUser = { id: "u-2" };
        const r = await GET(peticion("", "/api/genesis/conectores", "?ambito=test-ambito"));
        expect(r.status).toBe(200);
        const j = await r.json();
        expect(j.ambito).toBe("test-ambito");
        expect(j.sugerencias).toHaveLength(3);
        expect(j.asignaciones).toEqual([]);
        expect(j.catalogo).toEqual([]);
    });
});

describe("POST /api/genesis/conectores (accion=vincular)", () => {
    it("sin sesión devuelve 401", async () => {
        mockUser = null;
        const cuerpo = { accion: "vincular", proveedor: "test-provider", valor: "test-value" };
        const r = await POST(peticion(cuerpo));
        expect(r.status).toBe(401);
    });

    it("con sesión y sin ?ambito devuelve 400", async () => {
        mockUser = { id: "u-3" };
        const cuerpo = { accion: "vincular", proveedor: "test-provider", valor: "test-value" };
        const r = await POST(peticion(cuerpo, "/api/genesis/conectores"));
        expect(r.status).toBe(400);
    });

    it("vincular proveedor exitoso", async () => {
        mockUser = { id: "u-4" };
        const cuerpo = { accion: "vincular", proveedor: "test-provider", valor: "test-value" };
        const r = await POST(peticion(cuerpo, "/api/genesis/conectores", "?ambito=test-ambito"));
        expect(r.status).toBe(201);
        const j = await r.json();
        expect(j.accion).toBe("vincular");
        expect(j.proveedor).toBe("test-provider");
        expect(j.huella).toBeDefined();
        expect(j.ambito).toBe("test-ambito");
    });
});

describe("POST /api/genesis/conectores (accion=asignar)", () => {
    it("sin sesión devuelve 401", async () => {
        mockUser = null;
        const cuerpo = { accion: "asignar", clave: "test-clave", cadena: "test-cadena" };
        const r = await POST(peticion(cuerpo));
        expect(r.status).toBe(401);
    });

    it("con sesión y sin ?ambito devuelve 400", async () => {
        mockUser = { id: "u-5" };
        const cuerpo = { accion: "asignar", clave: "test-clave", cadena: "test-cadena" };
        const r = await POST(peticion(cuerpo, "/api/genesis/conectores"));
        expect(r.status).toBe(400);
    });

    it("asignar clave exitoso", async () => {
        mockUser = { id: "u-6" };
        const cuerpo = { accion: "asignar", clave: "test-clave", cadena: "test-cadena" };
        const r = await POST(peticion(cuerpo, "/api/genesis/conectores", "?ambito=test-ambito"));
        expect(r.status).toBe(200);
        const j = await r.json();
        expect(j.accion).toBe("asignar");
        expect(j.clave).toBe("test-clave");
        expect(j.ambito).toBe("test-ambito");
        expect(j.ok).toBe(true);
    });
});

describe("POST /api/genesis/conectores (accion=desconocida)", () => {
    it("devuelve 400 para acción no soportada", async () => {
        mockUser = { id: "u-7" };
        const cuerpo = { accion: "eliminar", proveedor: "test" };
        const r = await POST(peticion(cuerpo, "/api/genesis/conectores", "?ambito=test-ambito"));
        expect(r.status).toBe(400);
    });
});
