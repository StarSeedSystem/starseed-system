/**
 * ACC1025A · «Entrar con código por correo (sin contraseña)»: la lógica que salió de AuthGate.
 *
 * Lo que se prueba es el contrato que no puede cambiar al unificar la ventana de acceso: las MISMAS dos
 * rutas (`/api/auth/otp/request` y `/api/auth/otp/verify`), el mismo cuerpo, los mismos mensajes y el
 * canje de la sesión con `auth.setSession`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  RUTA_PEDIR_CODIGO,
  RUTA_VERIFICAR_CODIGO,
  pedirCodigoCorreo,
  soloDigitosCodigo,
  verificarCodigoCorreo,
} from "../codigo-correo";

function respuesta(cuerpo: unknown, ok = true): Response {
  return { ok, json: async () => cuerpo } as unknown as Response;
}

describe("rutas", () => {
  it("son las de siempre", () => {
    expect(RUTA_PEDIR_CODIGO).toBe("/api/auth/otp/request");
    expect(RUTA_VERIFICAR_CODIGO).toBe("/api/auth/otp/verify");
  });
});

describe("soloDigitosCodigo", () => {
  it("deja solo dígitos y como mucho seis", () => {
    expect(soloDigitosCodigo("12a3 4-5678")).toBe("123456");
    expect(soloDigitosCodigo("")).toBe("");
  });
});

describe("pedirCodigoCorreo", () => {
  it("pide el código a /api/auth/otp/request con el correo (sin espacios)", async () => {
    const llamar = vi.fn(async () => respuesta({ ok: true }));
    const r = await pedirCodigoCorreo("  ana@star.seed ", llamar as unknown as typeof fetch);
    expect(llamar).toHaveBeenCalledTimes(1);
    const [ruta, init] = llamar.mock.calls[0] as unknown as [string, RequestInit];
    expect(ruta).toBe("/api/auth/otp/request");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ana@star.seed" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aviso).toContain("bandeja de correos y notificaciones del OS");
  });

  it("sin correo no llama al servidor y lo dice", async () => {
    const llamar = vi.fn();
    const r = await pedirCodigoCorreo("   ", llamar as unknown as typeof fetch);
    expect(llamar).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, error: "Escribe tu correo para enviarte el código." });
  });

  it("devuelve el error del servidor, o uno honesto si no trae", async () => {
    const conError = await pedirCodigoCorreo("a@b.c", (async () => respuesta({ ok: false, error: "Demasiados intentos" }, false)) as unknown as typeof fetch);
    expect(conError).toEqual({ ok: false, error: "Demasiados intentos" });
    const sinError = await pedirCodigoCorreo("a@b.c", (async () => respuesta({}, false)) as unknown as typeof fetch);
    expect(sinError).toEqual({ ok: false, error: "No se pudo generar el código." });
  });

  it("un fallo de red no lanza: viaja en el resultado", async () => {
    const r = await pedirCodigoCorreo("a@b.c", (async () => { throw new Error("sin red"); }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "sin red" });
  });
});

describe("verificarCodigoCorreo", () => {
  const sesion = { access_token: "tok-a", refresh_token: "tok-r" };

  it("verifica en /api/auth/otp/verify y canjea la sesión con setSession", async () => {
    const llamar = vi.fn(async () => respuesta({ session: sesion }));
    const setSession = vi.fn(async () => ({ error: null }));
    const r = await verificarCodigoCorreo(" ana@star.seed ", " 123456 ", { auth: { setSession } }, llamar as unknown as typeof fetch);
    const [ruta, init] = llamar.mock.calls[0] as unknown as [string, RequestInit];
    expect(ruta).toBe("/api/auth/otp/verify");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ana@star.seed", code: "123456" });
    expect(setSession).toHaveBeenCalledWith({ access_token: "tok-a", refresh_token: "tok-r" });
    expect(r).toEqual({ ok: true });
  });

  it("un código que no son seis dígitos no llega al servidor", async () => {
    const llamar = vi.fn();
    const setSession = vi.fn();
    for (const malo of ["", "12345", "1234567", "12345a"]) {
      const r = await verificarCodigoCorreo("a@b.c", malo, { auth: { setSession } }, llamar as unknown as typeof fetch);
      expect(r).toEqual({ ok: false, error: "Escribe el código de 6 dígitos que te llegó al OS." });
    }
    expect(llamar).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("código incorrecto: error del servidor y no se abre sesión", async () => {
    const setSession = vi.fn();
    const r = await verificarCodigoCorreo("a@b.c", "123456", { auth: { setSession } }, (async () => respuesta({ error: "Código expirado" }, false)) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "Código expirado" });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("si Supabase rechaza la sesión, lo dice", async () => {
    const setSession = vi.fn(async () => ({ error: { message: "sesión inválida" } }));
    const r = await verificarCodigoCorreo("a@b.c", "123456", { auth: { setSession } }, (async () => respuesta({ session: sesion })) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, error: "sesión inválida" });
  });
});
