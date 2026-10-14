import { describe, it, expect, vi } from "vitest";
import { POST } from "../route";
import { createClient } from "@/utils/supabase/server";

// Mock modules
vi.mock("@/lib/seguridad/misma-maquina", () => ({
  esPeticionDeEstaMaquina: () => false,
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock NextRequest
const mockRequest = (body: string) => ({
  headers: {
    get: (key: string) => (key === "authorization" ? null : null),
  },
  text: () => Promise.resolve(body),
}) as unknown as Request;

describe("POST /api/genesis/proponer", () => {
  // Test 1: sin sesión → 401
  it("returns 401 when no session", async () => {
    const mockSupabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } };
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const req = mockRequest(JSON.stringify({ mensaje: "hola" }));
    const res = await POST(req as unknown as typeof req);
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.error).toBe("Inicia sesión para usar Genesis.");
  });

  // Test 2: con sesión y mensaje vacío → 400
  it("returns 400 when message is empty", async () => {
    const mockSupabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) } };
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    const req = mockRequest(JSON.stringify({ mensaje: "" }));
    const res = await POST(req as unknown as typeof req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("Escribe qué quieres cambiar.");
  });

  // Test 3: con sesión, sin variables de modelos → 503 con sinModelos: true
  it("returns 503 with sinModelos: true when no model variables", async () => {
    const mockSupabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-2" } } }) } };
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    // Save and remove model vars
    const originalEnv = { ...process.env };
    const modelVars = ["GROQ_API_KEY", "NVIDIA_SHARED_KEY", "NVIDIA_API_KEY", "OPENROUTER_SHARED_KEY", "OPENROUTER_API_KEY", "FREELLMAPI_KEY", "GEMINI_API_KEY"];
    modelVars.forEach(v => delete process.env[v]);

    try {
      const req = mockRequest(JSON.stringify({ mensaje: "hola" }));
      const res = await POST(req as unknown as typeof req);
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.sinModelos).toBe(true);
    } finally {
      // Restore env vars
      process.env = originalEnv;
    }
  });

  // Test 4: con GROQ_API_KEY y mock fetch → 200, operaciones con UNA sola válida, rechazadas índice 1, modelo groq/
  it("returns 200 with valid operations when GROQ_API_KEY set and fetch mocked", async () => {
    const mockSupabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-3" } } }) } };
    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    // Set GROQ_API_KEY
    process.env.GROQ_API_KEY = "prueba";

    // Mock fetch
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    respuesta: "ok",
                    operaciones: [
                      { tipo: "dock.añadir", elemento: { id: "mi-boton" }, motivo: "m" },
                      { tipo: "dock.quitar", id: "settings", motivo: "m" },
                    ],
                  }),
                },
              },
            ],
          }),
      })
    );

    const req = mockRequest(JSON.stringify({ mensaje: "hola" }));
    const res = await POST(req as unknown as typeof req);
    const json = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(json.operaciones).toHaveLength(1);
    expect(json.operaciones[0].op.tipo).toBe("dock.añadir");
    expect(json.rechazadas).toHaveLength(1);
    expect(json.rechazadas[0].indice).toBe(1);
    expect(json.modelo).toMatch(/^groq\//);
    fetchSpy.mockRestore();
  });
});