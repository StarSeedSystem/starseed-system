/**
 * Cifrado + custodia de `credenciales-servidor.ts` (Ola 374).
 * Cubre: ida y vuelta del cifrado AES-256-GCM, rechazo ante manipulación
 * (tag de autenticación), y el round-trip completo guardar→leer→borrar
 * contra un cliente Supabase FALSO (nunca toca una base de datos real).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Cliente Supabase mínimo que simula `storage_credentials` en memoria. */
function crearSupabaseFalso() {
  const filas = new Map<string, Record<string, unknown>>();
  const clave = (userId: string, proveedor: string) => `${userId}:${proveedor}`;
  const cliente = {
    from(_tabla: string) {
      return {
        upsert: async (row: Record<string, unknown>) => {
          filas.set(clave(row.user_id as string, row.proveedor as string), row);
          return { error: null };
        },
        select: (_cols: string) => ({
          eq: (_c1: string, userId: string) => ({
            eq: (_c2: string, proveedor: string) => ({
              maybeSingle: async () => ({ data: filas.get(clave(userId, proveedor)) ?? null, error: null }),
            }),
          }),
        }),
        delete: () => ({
          eq: (_c1: string, userId: string) => ({
            eq: (_c2: string, proveedor: string) => {
              filas.delete(clave(userId, proveedor));
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
  };
  return { cliente, filas };
}

const { cliente: SUPABASE_FALSO } = crearSupabaseFalso();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => SUPABASE_FALSO),
}));

describe("credenciales-servidor", () => {
  const entorno = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto-de-prueba.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-servicio-de-prueba-bien-larga";
  });

  afterEach(() => {
    process.env = { ...entorno };
  });

  it("cifra y descifra el mismo texto (ida y vuelta)", async () => {
    const { cifrar, descifrar } = await import("../credenciales-servidor");
    const original = "1//refresh-token-de-verdad-de-google-muy-largo";
    const cifrado = cifrar(original);
    expect(cifrado).not.toContain(original);
    expect(cifrado.startsWith("v1:")).toBe(true);
    expect(descifrar(cifrado)).toBe(original);
  });

  it("dos cifrados del MISMO texto son distintos (IV aleatorio) pero ambos descifran igual", async () => {
    const { cifrar, descifrar } = await import("../credenciales-servidor");
    const a = cifrar("mismo-secreto");
    const b = cifrar("mismo-secreto");
    expect(a).not.toBe(b);
    expect(descifrar(a)).toBe("mismo-secreto");
    expect(descifrar(b)).toBe("mismo-secreto");
  });

  it("RECHAZA una credencial cifrada manipulada (tag de autenticación no verifica)", async () => {
    const { cifrar, descifrar } = await import("../credenciales-servidor");
    const cifrado = cifrar("refresh-token-sensible");
    const partes = cifrado.split(":");
    // Corrompe un byte del ciphertext (última parte, base64).
    const dataCorrupta = partes[3].slice(0, -4) + (partes[3].slice(-4) === "AAAA" ? "BBBB" : "AAAA");
    const manipulado = [partes[0], partes[1], partes[2], dataCorrupta].join(":");
    expect(() => descifrar(manipulado)).toThrow();
  });

  it("RECHAZA un formato no reconocido (versión distinta, partes de más/menos)", async () => {
    const { descifrar } = await import("../credenciales-servidor");
    expect(() => descifrar("v2:algo:algo:algo")).toThrow();
    expect(() => descifrar("solo-una-parte")).toThrow();
  });

  it("falla CERRADO sin SUPABASE_SERVICE_ROLE_KEY (nunca cifra con una clave débil implícita)", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { cifrar } = await import("../credenciales-servidor");
    expect(() => cifrar("x")).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("guardar → leer → borrar: round-trip completo contra el cliente Supabase falso", async () => {
    const { guardarCredencial, leerCredencial, estadoCredencial, borrarCredencial } = await import("../credenciales-servidor");
    const userId = "user-abc";
    const guardado = await guardarCredencial({
      userId,
      proveedor: "google-drive",
      refreshToken: "1//el-refresh-token-real",
      cuentaEmail: "alex@example.com",
      alcance: "drive.file",
    });
    expect(guardado.ok).toBe(true);

    const estado = await estadoCredencial(userId, "google-drive");
    expect(estado).toEqual({ conectado: true, cuentaEmail: "alex@example.com" });

    const leido = await leerCredencial(userId, "google-drive");
    expect(leido?.refreshToken).toBe("1//el-refresh-token-real");
    expect(leido?.cuentaEmail).toBe("alex@example.com");

    const borrado = await borrarCredencial(userId, "google-drive");
    expect(borrado).toBe(true);
    expect(await leerCredencial(userId, "google-drive")).toBeNull();
    expect((await estadoCredencial(userId, "google-drive")).conectado).toBe(false);
  });

  it("leerCredencial devuelve null (no lanza) si la fila está corrupta/con otra clave", async () => {
    const { guardarCredencial } = await import("../credenciales-servidor");
    const userId = "user-corrupto";
    await guardarCredencial({ userId, proveedor: "google-drive", refreshToken: "token-x" });
    // Cambiar la clave de servicio DESPUÉS de guardar simula una rotación:
    // lo guardado con la clave anterior ya no verifica.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "otra-clave-de-servicio-completamente-distinta";
    vi.resetModules();
    const { leerCredencial: leerConOtraClave } = await import("../credenciales-servidor");
    expect(await leerConOtraClave(userId, "google-drive")).toBeNull();
  });
});
