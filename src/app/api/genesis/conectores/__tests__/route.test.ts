/** Pruebas de la CAPA DE RUTA de /api/genesis/conectores (Ola 1019G · GCA1019Lb ·
 * architecture/genesis-conectores-abiertos.md §3–§6): la sesión obligatoria
 * (`cuentaConectores`: bucle local de esta máquina o cuenta de Supabase, anónimo → null)
 * y el límite de 20 peticiones por 10 min como /api/genesis/proponer.
 * Sin red y SIN importar nunca un route.ts (regla del repo): la lógica pura la cubre
 * `servicio.test.ts`; aquí solo entra lo que la ruta compone antes de despachar. */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/seguridad/misma-maquina", () => ({
  esPeticionDeEstaMaquina: () => deEstaMaquina,
  estaPublicado: () => publicado,
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      async getUser(token?: string) {
        const sujeto = token ? (token === TOKEN_SESION ? usuario : null) : usuario;
        return { data: { user: sujeto } };
      },
    },
  }),
}));

const TOKEN_SESION = "token-de-sesion-falso";
let usuario: { id: string } | null = null;
let deEstaMaquina = false;
let publicado = false;

import { cuentaConectores } from "@/lib/genesis/conectores/datos";
import { rateLimit } from "@/lib/security/rate-limit";

const peticionCon = (url: string, bearer?: string): Request => {
  const cabeceras = new Headers({ host: new URL(url).host });
  if (bearer) cabeceras.set("authorization", `Bearer ${bearer}`);
  return new Request(url, { headers: cabeceras });
};

beforeEach(() => {
  usuario = null;
  deEstaMaquina = false;
  publicado = false;
});

describe("sesión obligatoria (cuentaConectores)", () => {
  it("una petición de bucle local SIN publicar entra como la máquina, sin sesión", async () => {
    deEstaMaquina = true;
    const cuenta = await cuentaConectores(peticionCon("http://127.0.0.1:9002/api/genesis/conectores"));
    expect(cuenta).toBe("esta-maquina");
  });

  it("publicado, NADA es de esta máquina: hasta el bucle local necesita sesión", async () => {
    deEstaMaquina = true;
    publicado = true;
    const cuenta = await cuentaConectores(peticionCon("http://127.0.0.1:9002/api/genesis/conectores"));
    expect(cuenta).toBeNull();
  });

  it("fuera de la máquina y sin sesión → null (la ruta responde 401)", async () => {
    const cuenta = await cuentaConectores(peticionCon("http://ejemplo.com/api/genesis/conectores"));
    expect(cuenta).toBeNull();
  });

  it("fuera de la máquina, con sesión → el id de la cuenta (solo el id, nunca tokens)", async () => {
    usuario = { id: "cuenta-1" };
    const cuenta = await cuentaConectores(
      peticionCon("http://ejemplo.com/api/genesis/conectores", TOKEN_SESION),
    );
    expect(cuenta).toBe("cuenta-1");
  });

  it("un bearer solo, sin sesión de cookie, no da cuenta a nadie", async () => {
    const cuenta = await cuentaConectores(
      peticionCon("http://ejemplo.com/api/genesis/conectores", TOKEN_SESION),
    );
    expect(cuenta).toBeNull();
  });
});

describe("límite de 20 peticiones por 10 minutos (la clave exacta de la ruta)", () => {
  const WINDOW = 10 * 60 * 1000;
  const clave = "genesis-conectores:cuenta-limite";

  it("deja pasar las 20 y bloquea la 21.ª con Retry-After dentro de la ventana", () => {
    let ultima;
    for (let i = 0; i < 20; i++) ultima = rateLimit(clave, 20, WINDOW);
    expect(ultima?.allowed).toBe(true);
    const la21 = rateLimit(clave, 20, WINDOW);
    expect(la21.allowed).toBe(false);
    expect(la21.retryAfterSec).toBeGreaterThan(0);
    expect(la21.retryAfterSec).toBeLessThanOrEqual(600);
  });

  it("cada cuenta lleva su propio cubo: la de al lado sigue en verde", () => {
    const otra = "genesis-conectores:cuenta-otra";
    rateLimit(clave, 20, WINDOW);
    rateLimit(clave, 20, WINDOW);
    const vecina = rateLimit(otra, 20, WINDOW);
    expect(vecina.allowed).toBe(true);
    expect(vecina.remaining).toBe(19);
  });
});
