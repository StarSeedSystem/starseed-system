import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { type NextRequest } from "next/server";
import { guardianMando } from "@/lib/mando/guardian";

// Mock Supabase client
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-test-id" } },
        error: null,
      })),
    },
    rpc: vi.fn(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  })),
}));

// Mock motor-token
vi.mock("@/lib/mando/motor-token", () => ({
  crearTokenMotor: vi.fn(() => ({
    token: "test-token",
    hash: "test-token-hash",
    huella: "test-huella",
  })),
  formatoTokenValido: vi.fn((token) => typeof token === "string"),
  verificarToken: vi.fn((token, hash) => token === "test-token" && hash === "test-token-hash"),
}));

// Mock motores
vi.mock("@/lib/mando/motores", () => ({
  armarRespuestaMotor: vi.fn(({ motorId, huella, token }) => ({
    motorId,
    huella,
    token,
  })),
  validarCuerpoMotor: vi.fn((cuerpo) => {
    if (
      typeof cuerpo === "object" &&
      cuerpo !== null &&
      "nombre" in cuerpo &&
      typeof cuerpo.nombre === "string" &&
      "tipo" in cuerpo &&
      typeof cuerpo.tipo === "string" &&
      "capacidades" in cuerpo &&
      Array.isArray(cuerpo.capacidades)
    ) {
      return { ok: true, valor: cuerpo };
    }
    return { ok: false, error: "Cuerpo inválido" };
  }),
}));

// Import the route handlers after mocking
import { POST, GET, DELETE } from "../route";

// Helper to create a mock request
function crearRequest(
  metodo: string,
  cuerpo: unknown = {},
  queryParams: Record<string, string> = {},
  cabeceras: Record<string, string> = { "content-type": "application/json" }
) {
  const url = new URL(`http://localhost:9002/api/genesis/contenedores`);
  Object.keys(queryParams).forEach(key => {
    url.searchParams.set(key, queryParams[key]);
  });
  return new Request(url.toString(), {
    method: metodo,
    headers: cabeceras,
    // Only include body for methods that typically have a body
    body: metodo === "POST" ? JSON.stringify(cuerpo) : undefined,
  });
}

describe("/api/genesis/contenedores", () => {
  const AMBITO_ID = "ambito-test-id";
  const MOTOR_ID = "motor-test-id";

  beforeEach(() => {
    vi.clearAllMocks();
    // Set the pairing code secret for tests
    process.env.PAIRING_CODE_SECRET = "test-secret";
    // Enable MANDO_TODOS to avoid 404
    process.env.STARSEED_MANDO_TODOS = "1";
  });

  afterEach(() => {
    delete process.env.PAIRING_CODE_SECRET;
    delete process.env.STARSEED_MANDO_TODOS;
  });

  describe("POST", () => {
    it("should generate a pairing code when ambitoId is provided", async () => {
      const req = crearRequest("POST", { ambitoId: AMBITO_ID });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("codigo");
      expect(typeof json.codigo).toBe("string");

      // Verify that guardianMando was called with the correct ambito and capability
      expect(vi.mocked(guardianMando)).toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          ambito: AMBITO_ID,
          capacidad: "gestionar-motores",
        })
      );
    });

    it("should exchange a pairing code for a motor token", async () => {
      // First, generate a pairing code manually to use in the test
      // We'll use the same logic as in the route, but we can also call the function if we expose it.
      // For simplicity, we'll create a valid code by using the secret we set.
      const { createHmac } = await import("node:crypto");
      const header = { alg: "HS256", typ: "JWT" };
      const payload = { ambitoId: AMBITO_ID, exp: Math.floor(Date.now() / 1000) + 15 * 60 };
      const headerB64 = Buffer.from(JSON.stringify(header))
        .toString("base64url")
        .replace(/=+$/, "");
      const payloadB64 = Buffer.from(JSON.stringify(payload))
        .toString("base64url")
        .replace(/=+$/, "");
      const signatureInput = `${headerB64}.${payloadB64}`;
      const signature = createHmac("sha256", process.env.PAIRING_CODE_SECRET!)
        .update(signatureInput, "utf8")
        .digest("base64url")
        .replace(/=+$/, "");
      const codigoValido = `${headerB64}.${payloadB64}.${signature}`;

      const req = crearRequest("POST", {
        codigo: codigoValido,
        nombre: "Test Motor",
        tipo: "local",
        capacidades: ["reportar"],
      });
      const res = await POST(req);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toHaveProperty("motorId");
      expect(json).toHaveProperty("huella");
      expect(json).toHaveProperty("token");
      expect(json.token).toBe("test-token"); // From the mock

      // Verify that the RPC for registering the motor was called
      const supabaseMock = vi.mocked(require("@/utils/supabase/server").createClient);
      const supabaseInstance = await supabaseMock();
      expect(supabaseInstance.rpc).toHaveBeenCalledWith(
        "mando_registrar_motor",
        expect.objectContaining({
          _ambito: AMBITO_ID,
          _nombre: "Test Motor",
          _tipo: "local",
          _capacidades: ["reportar"],
        })
      );
    });

    it("should return 400 for invalid pairing code", async () => {
      const req = crearRequest("POST", {
        codigo: "invalid-code",
        nombre: "Test Motor",
        tipo: "local",
        capacidades: ["reportar"],
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("inválido");
    });

    it("should return 400 if ambitoId is missing when generating code", async () => {
      const req = crearRequest("POST", {});
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Cuerpo de petición no válido");
    });
  });

  describe("GET", () => {
    it("should list motors for the given ambitoId", async () => {
      // Mock the Supabase response for the GET request
      const supabaseMock = vi.mocked(require("@/utils/supabase/server").createClient);
      const supabaseInstance = await supabaseMock();
      supabaseInstance.from = vi.fn().mockReturnThis();
      supabaseInstance.select = vi.fn().mockReturnThis();
      supabaseInstance.eq = vi.fn().mockReturnThis();
      const mockData = [
        {
          id: MOTOR_ID,
          nombre: "Test Motor",
          tipo: "local",
          huella: "test-huella",
          capacidades: ["reportar"],
          estado: "vivo",
          ultimo_reporte: new Date().toISOString(),
          creado_por: "user-test-id",
        },
      ];
      supabaseInstance.mockResolvedValueOnce({ data: mockData, error: null });

      const req = crearRequest("GET", {}, { ambitoId: AMBITO_ID });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("motores");
      expect(Array.isArray(json.motores)).toBe(true);
      expect(json.motores.length).toBe(1);
      expect(json.motores[0]).toMatchObject({
        id: MOTOR_ID,
        nombre: "Test Motor",
        tipo: "local",
        huella: "test-huella",
        capacidades: ["reportar"],
        estado: "vivo",
      });

      // Verify that guardianMando was called with ver-detalle capability
      expect(vi.mocked(guardianMando)).toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          ambito: AMBITO_ID,
          capacidad: "ver-detalle",
        })
      );
    });

    it("should return 400 if ambitoId is missing", async () => {
      const req = crearRequest("GET", {}, {});
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Falta ambitoId");
    });
  });

  describe("DELETE", () => {
    it("should revoke a motor", async () => {
      // Mock the Supabase RPC response
      const supabaseMock = vi.mocked(require("@/utils/supabase/server").createClient);
      const supabaseInstance = await supabaseMock();
      supabaseInstance.rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null });

      const req = crearRequest("DELETE", {}, { ambitoId: AMBITO_ID, motorId: MOTOR_ID });
      const res = await DELETE(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true });

      // Verify that guardianMando was called with gestionar-motores capability
      expect(vi.mocked(guardianMando)).toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          ambito: AMBITO_ID,
          capacidad: "gestionar-motores",
        })
      );

      // Verify that the revocar_motor RPC was called
      expect(supabaseInstance.rpc).toHaveBeenCalledWith(
        "mando_revocar_motor",
        expect.objectContaining({ _motor: MOTOR_ID })
      );
    });

    it("should return 400 if ambitoId is missing", async () => {
      const req = crearRequest("DELETE", {}, {});
      const res = await DELETE(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Falta ambitoId");
    });

    it("should return 400 if motorId is missing", async () => {
      const req = crearRequest("DELETE", {}, { ambitoId: AMBITO_ID });
      const res = await DELETE(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Falta motorId");
    });
  });
});