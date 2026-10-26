import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  acotar,
  credencialesDeEntorno,
  identificador,
  MAX_RESPUESTA_CHARS,
  pedirJson,
  recortar,
  urlDeLlamada,
  validarCredenciales,
  type FetchLectura,
  type PerfilServicio,
  type PeticionLectura,
  type RelojLectura,
  type RespuestaLectura,
} from "../lectura-http";

// El valor se monta en tiempo de ejecución: ninguna cadena con forma de clave vive entera en el repositorio.
const TOKEN = ["clave", "de", "prueba", "7731"].join("-");

const PERFIL: PerfilServicio = {
  nombre: "Servicio X",
  variableUrl: "SERVICIO_X_URL",
  variableClave: "SERVICIO_X_API_KEY",
  autenticacion: (token) => ({ "x-api-key": token }),
  secretosDerivados: (token) => [btoa(`u:${token}`)],
  sufijoApi: "/api/v9",
  motivoEstado: { 401: "Clave inválida." },
};

const CRED = { url: "https://x.local", token: TOKEN };

const resp = (estado: number, cuerpo: string, extra: Partial<RespuestaLectura> = {}): RespuestaLectura => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  headers: { get: () => null },
  text: async () => cuerpo,
  ...extra,
});

/** Reloj manual: los plazos solo vencen cuando la prueba avanza el tiempo. */
function relojFalso() {
  let t = 1_000;
  const timers: { en: number; r: () => void }[] = [];
  const reloj: RelojLectura = {
    ahora: () => t,
    tras: (ms) => {
      const p = { en: t + ms, r: (): void => undefined };
      timers.push(p);
      return {
        promesa: new Promise<void>((res) => {
          p.r = res;
        }),
        cancelar: () => {
          timers.splice(timers.indexOf(p) >>> 0, 1);
        },
      };
    },
  };
  return {
    reloj,
    avanzar: (ms: number) => {
      t += ms;
      for (const p of timers.filter((x) => x.en <= t)) {
        timers.splice(timers.indexOf(p), 1);
        p.r();
      }
    },
  };
}

describe("lectura-http · credenciales por el NOMBRE de su variable", () => {
  it("lee la URL y la clave del entorno que le pasan, sin tocar process.env", () => {
    const r = credencialesDeEntorno({ SERVICIO_X_URL: " https://x.local ", SERVICIO_X_API_KEY: ` ${TOKEN} ` }, PERFIL);
    expect(r).toEqual({ ok: true, credenciales: { url: "https://x.local", token: TOKEN } });
  });

  it("si falta algo, lo dice por el nombre de la variable y nunca repite un valor", () => {
    const sinNada = credencialesDeEntorno({}, PERFIL);
    expect(sinNada).toMatchObject({ ok: false, faltan: ["SERVICIO_X_URL", "SERVICIO_X_API_KEY"] });
    expect(sinNada.ok ? "" : sinNada.motivo).toMatch(/SERVICIO_X_URL y SERVICIO_X_API_KEY/);
    const sinClave = credencialesDeEntorno({ SERVICIO_X_URL: "https://x.local" }, PERFIL);
    expect(sinClave).toMatchObject({ ok: false, faltan: ["SERVICIO_X_API_KEY"] });
    const mala = credencialesDeEntorno({ SERVICIO_X_URL: "ftp://x.local", SERVICIO_X_API_KEY: TOKEN }, PERFIL);
    expect(mala).toMatchObject({ ok: false, faltan: [] });
    expect(JSON.stringify([sinNada, sinClave, mala])).not.toContain(TOKEN);
  });

  it("rechaza URL rota, esquema ajeno, usuario en la URL, clave vacía o con espacios y saltos de línea", () => {
    expect(validarCredenciales({ url: "no es url", token: TOKEN }, PERFIL)).toMatch(/URL válida/);
    expect(validarCredenciales({ url: "javascript:alerta", token: TOKEN }, PERFIL)).toMatch(/http\(s\)/);
    expect(validarCredenciales({ url: "https://u:p@x.local", token: TOKEN }, PERFIL)).toMatch(/usuario ni clave/);
    expect(validarCredenciales({ url: "https://x.local", token: "" }, PERFIL)).toMatch(/SERVICIO_X_API_KEY/);
    expect(validarCredenciales({ url: "https://x.local", token: "con espacio" }, PERFIL)).toMatch(/ASCII/);
    expect(validarCredenciales({ url: "https://x.local", token: "abc\r\nx-otra: 1" }, PERFIL)).toMatch(/ASCII/);
    expect(validarCredenciales({ url: "https://x.local", token: "clave-ñ" }, PERFIL)).toMatch(/ASCII/);
    expect(validarCredenciales(CRED, PERFIL)).toBeNull();
  });
});

describe("lectura-http · la dirección", () => {
  it("une base, sufijo de la API y ruta; el sufijo no se duplica y la subruta se respeta", () => {
    expect(urlDeLlamada(CRED, PERFIL, { ruta: "/cosas" }).toString()).toBe("https://x.local/api/v9/cosas");
    expect(urlDeLlamada({ ...CRED, url: "https://x.local/api/v9/" }, PERFIL, { ruta: "/cosas" }).toString()).toBe("https://x.local/api/v9/cosas");
    expect(urlDeLlamada({ ...CRED, url: "https://x.local/panel/" }, PERFIL, { ruta: "/cosas" }).toString()).toBe("https://x.local/panel/api/v9/cosas");
    expect(urlDeLlamada(CRED, PERFIL, { ruta: "/health", publica: true }).toString()).toBe("https://x.local/health");
    expect(urlDeLlamada(CRED, PERFIL, { ruta: "/c", consulta: { filters: "[]", q: "a b" } }).toString()).toBe("https://x.local/api/v9/c?filters=%5B%5D&q=a+b");
  });
});

describe("lectura-http · pedirJson", () => {
  it("GET con la clave por su cabecera, redirect manual y señal de tiempo; devuelve el JSON", async () => {
    const f = vi.fn<FetchLectura>(async () => resp(200, '{"a":1}'));
    const r = await pedirJson(CRED, PERFIL, { ruta: "/cosas" }, f);
    const [url, init] = f.mock.calls[0] as [string, PeticionLectura];
    expect(url).toBe("https://x.local/api/v9/cosas");
    expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json", "x-api-key": TOKEN } });
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(r).toMatchObject({ ok: true, estado: 200, datos: { a: 1 } });
  });

  it("POST lleva el cuerpo JSON; una ruta pública no lleva la clave", async () => {
    const f = vi.fn<FetchLectura>(async () => resp(200, "{}"));
    await pedirJson(CRED, PERFIL, { ruta: "/buscar", metodo: "POST", cuerpo: { q: "hola" } }, f);
    const [, post] = f.mock.calls[0] as [string, PeticionLectura];
    expect(post).toMatchObject({ method: "POST", body: '{"q":"hola"}', headers: { "content-type": "application/json" } });
    await pedirJson(CRED, PERFIL, { ruta: "/health", publica: true }, f);
    const [, publica] = f.mock.calls[1] as [string, PeticionLectura];
    expect(publica.headers["x-api-key"]).toBeUndefined();
  });

  it("credenciales inválidas: no llama a la red y dice por qué", async () => {
    const f = vi.fn<FetchLectura>();
    const r = await pedirJson({ url: "https://x.local", token: "" }, PERFIL, { ruta: "/c" }, f);
    expect(r).toMatchObject({ ok: false, fallo: "credenciales" });
    expect(f).not.toHaveBeenCalled();
  });

  it("un 3xx NO se sigue: se explica y no se manda la clave a otra dirección", async () => {
    const f = vi.fn<FetchLectura>(async () => resp(302, "", { headers: { get: (n) => (n === "location" ? "https://otro.local/" : null) } }));
    const r = await pedirJson(CRED, PERFIL, { ruta: "/c" }, f);
    expect(r).toMatchObject({ ok: false, fallo: "http", estado: 302, motivo: expect.stringMatching(/redirige.*URL final/) });
    expect(JSON.stringify(r)).not.toContain("otro.local");
    expect(f).toHaveBeenCalledTimes(1);
    // El navegador oculta el 3xx tras `redirect: "manual"` y deja estado 0: se dice igual.
    expect(await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => resp(0, ""))).toMatchObject({ ok: false, fallo: "http" });
  });

  it("estados con motivo propio, otros errores con el cuerpo recortado, y fallo de red", async () => {
    expect(await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => resp(401, ""))).toMatchObject({ fallo: "http", motivo: "Clave inválida.", estado: 401 });
    expect(await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => resp(418, "soy una tetera"))).toMatchObject({
      fallo: "http",
      motivo: expect.stringContaining("respondió 418: soy una tetera"),
    });
    expect(
      await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => {
        throw new TypeError("fetch failed");
      }),
    ).toMatchObject({ fallo: "red", motivo: expect.stringMatching(/no contesta/) });
  });

  it("una respuesta que no es JSON, o es demasiado grande, se dice sin romper nada", async () => {
    expect(await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => resp(200, "<html>"))).toMatchObject({ fallo: "datos", motivo: expect.stringMatching(/JSON/) });
    const grande = "x".repeat(MAX_RESPUESTA_CHARS + 1);
    expect(await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => resp(200, grande))).toMatchObject({ fallo: "datos", motivo: expect.stringMatching(/demasiado grande/) });
    const declarada = resp(200, "{}", { headers: { get: (n) => (n === "content-length" ? String(MAX_RESPUESTA_CHARS + 5) : null) } });
    const lectura = vi.fn(async () => "{}");
    expect(await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => ({ ...declarada, text: lectura }))).toMatchObject({ fallo: "datos" });
    expect(lectura).not.toHaveBeenCalled();
  });

  it("la clave y lo que se deriva de ella jamás salen en un motivo ni en el registro", async () => {
    const derivado = btoa(`u:${TOKEN}`);
    const lineas: string[] = [];
    const r = await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => resp(500, `eco ${TOKEN} y ${derivado}`), { registrar: (l) => lineas.push(l) });
    expect(r).toMatchObject({ ok: false, fallo: "http" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(JSON.stringify(r)).not.toContain(derivado);
    expect(JSON.stringify(lineas)).not.toContain(TOKEN);
    expect(JSON.stringify(lineas)).not.toContain(derivado);
    const ok: string[] = [];
    await pedirJson(CRED, PERFIL, { ruta: "/c" }, async () => resp(200, "{}"), { registrar: (l) => ok.push(l) });
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatch(/Servicio X GET \/c · 200 · ok en \d+ ms/);
  });

  it("una clave con caracteres raros no rompe el tapado: la rechaza la validación", async () => {
    const perfilBasic: PerfilServicio = { ...PERFIL, secretosDerivados: (t) => [btoa(`u:${t}`)] };
    const r = await pedirJson({ url: "https://x.local", token: "clave-ñ" }, perfilBasic, { ruta: "/c" }, vi.fn<FetchLectura>());
    expect(r).toMatchObject({ ok: false, fallo: "credenciales" });
  });

  it("tiempo agotado: corta la petición (aborta) con el reloj inyectado", async () => {
    const { reloj, avanzar } = relojFalso();
    let senal: AbortSignal | undefined;
    const colgado: FetchLectura = (_u, i) => {
      senal = i.signal;
      return new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("abortado"))));
    };
    const p = pedirJson(CRED, PERFIL, { ruta: "/c" }, colgado, { reloj });
    avanzar(14_999);
    expect(senal?.aborted).toBe(false);
    avanzar(1);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo", ms: 15_000 });
    expect(senal?.aborted).toBe(true);
  });

  it("el tiempo también vence mientras se lee un cuerpo que nunca acaba", async () => {
    const { reloj, avanzar } = relojFalso();
    const p = pedirJson(CRED, PERFIL, { ruta: "/c", tiempoMs: 6_000 }, async () => resp(200, "", { text: () => new Promise<string>(() => undefined) }), { reloj });
    await Promise.resolve();
    avanzar(6_000);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo" });
  });
});

describe("lectura-http · lectura defensiva", () => {
  it("acotar, recortar e identificador no inventan nada", () => {
    expect(acotar(500, 1, 20, 5)).toBe(20);
    expect(acotar(0, 1, 20, 5)).toBe(1);
    expect(acotar(7.9, 1, 20, 5)).toBe(7);
    expect(acotar("7", 1, 20, 5)).toBe(5);
    expect(acotar(undefined, 1, 20, 5)).toBe(5);
    expect(acotar(Number.NaN, 1, 20, 5)).toBe(5);
    expect(recortar(null, 10)).toEqual({ texto: null, recortado: false });
    expect(recortar("corto", 10)).toEqual({ texto: "corto", recortado: false });
    expect(recortar("un texto bastante largo", 8)).toEqual({ texto: "un texto…", recortado: true });
    expect(identificador(7)).toBe("7");
    expect(identificador(" ")).toBeNull();
    expect(identificador({})).toBeNull();
  });
});

describe("lectura-http · el módulo es puro (CLAUDE.md, trampa 11)", () => {
  it("no usa node:*, process.env, ni «use client»", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../lectura-http.ts"), "utf8");
    // La cabecera comenta la regla; lo que no puede haber es código real que la rompa.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/^\s*import[^;]*from\s+["']node:/m);
    expect(codigo).not.toMatch(/process\.env/);
    expect(codigo).not.toMatch(/^\s*["']use client["']/m);
  });
});
