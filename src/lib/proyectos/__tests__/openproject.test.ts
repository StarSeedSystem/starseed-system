import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  credencialesOpenProject,
  listarPaquetes,
  listarProyectos,
  REFERENCIA_OPENPROJECT,
  sondear,
  TAMANO_PAGINA,
  VARIABLES_OPENPROJECT,
  type CredencialesOpenProject,
  type FetchOpenProject,
} from "../openproject";
import type { PeticionLectura, RelojLectura, RespuestaLectura } from "../../servidores/lectura-http";

// El valor se monta en tiempo de ejecución: ninguna cadena con forma de clave vive entera en el repositorio.
const TOKEN = ["token", "openproject", "de", "prueba", "9052"].join("-");
const BASICA = `Basic ${btoa(`apikey:${TOKEN}`)}`;
const CRED: CredencialesOpenProject = { url: "https://proyectos.local", token: TOKEN };

const resp = (estado: number, cuerpo: string, extra: Partial<RespuestaLectura> = {}): RespuestaLectura => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  headers: { get: () => null },
  text: async () => cuerpo,
  ...extra,
});
const json = (estado: number, valor: unknown) => resp(estado, JSON.stringify(valor));

/** La consulta de la URL ya decodificada, para comparar filtros como objetos. */
const consulta = (url: string) => Object.fromEntries(new URL(url).searchParams.entries());

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

describe("openproject · el token y la URL por el nombre de su variable", () => {
  it("lee OPENPROJECT_URL y OPENPROJECT_API_KEY del entorno que le pasan", () => {
    expect(VARIABLES_OPENPROJECT).toEqual({ url: "OPENPROJECT_URL", clave: "OPENPROJECT_API_KEY" });
    expect(credencialesOpenProject({ OPENPROJECT_URL: "https://op.local", OPENPROJECT_API_KEY: TOKEN })).toEqual({
      ok: true,
      credenciales: { url: "https://op.local", token: TOKEN },
    });
  });

  it("sin configurar dice qué variables faltan", () => {
    const r = credencialesOpenProject({ OPENPROJECT_URL: "https://op.local" });
    expect(r).toMatchObject({ ok: false, faltan: ["OPENPROJECT_API_KEY"] });
    expect(JSON.stringify(credencialesOpenProject({}))).toMatch(/OPENPROJECT_URL y OPENPROJECT_API_KEY/);
  });

  it("la referencia dice dónde y cuándo se comprobó cada ruta", () => {
    expect(REFERENCIA_OPENPROJECT.repo).toBe("https://github.com/opf/openproject");
    expect(REFERENCIA_OPENPROJECT.comprobada).toBe("2026-10-26");
    expect(REFERENCIA_OPENPROJECT.rutas).toEqual(["GET /api/v3", "GET /api/v3/projects", "GET /api/v3/work_packages"]);
  });
});

describe("openproject · sondear (GET /api/v3)", () => {
  it("autentica con Basic apikey:<token>, no sigue redirecciones y lee el nombre y la versión", async () => {
    const f = vi.fn<FetchOpenProject>(async () => json(200, { _type: "Root", instanceName: "Proyectos StarSeed", coreVersion: "17.9.3", _links: {} }));
    const r = await sondear(CRED, f);
    const [url, init] = f.mock.calls[0] as [string, PeticionLectura];
    expect(url).toBe("https://proyectos.local/api/v3");
    expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json", authorization: BASICA } });
    expect(r).toMatchObject({ ok: true, datos: { nombre: "Proyectos StarSeed", version: "17.9.3" } });
  });

  it("sin ser administrador no viene la versión: queda «sin dato»; si no es la raíz de OpenProject, error de datos", async () => {
    expect(await sondear(CRED, async () => json(200, { _type: "Root", instanceName: "OP" }))).toMatchObject({ ok: true, datos: { nombre: "OP", version: null } });
    expect(await sondear(CRED, async () => json(200, { hola: "mundo" }))).toMatchObject({ ok: false, fallo: "datos", motivo: expect.stringMatching(/no es la de OpenProject/) });
  });

  it("no duplica /api/v3 si la URL ya lo trae", async () => {
    const f = vi.fn<FetchOpenProject>(async () => json(200, { _type: "Root", instanceName: "OP" }));
    await sondear({ url: "https://proyectos.local/api/v3/", token: TOKEN }, f);
    expect(f.mock.calls[0]?.[0]).toBe("https://proyectos.local/api/v3");
  });
});

describe("openproject · listarProyectos (GET /api/v3/projects)", () => {
  const coleccion = {
    _type: "Collection",
    total: 45,
    count: 3,
    pageSize: 20,
    offset: 1,
    _embedded: {
      elements: [
        { _type: "Project", id: 1, identifier: "astraura", name: "Astraura", active: true, public: false, description: { format: "markdown", raw: "El cerebro del OS." }, _links: { parent: { href: null } } },
        { _type: "Project", id: 7, identifier: "fase-semilla", name: "Fase Semilla", active: false, public: true, _links: { parent: { href: "/api/v3/projects/1", title: "Astraura" } } },
        { id: "texto", name: "id raro" },
        { sin: "id" },
        "basura",
      ],
    },
  };

  it("pide filters=[], orden por id, 20 por página y la página 1; mapea solo lo que venga", async () => {
    const f = vi.fn<FetchOpenProject>(async () => json(200, coleccion));
    const r = await listarProyectos(CRED, f);
    const [url, init] = f.mock.calls[0] as [string, PeticionLectura];
    expect(url.startsWith("https://proyectos.local/api/v3/projects?")).toBe(true);
    expect(consulta(url)).toEqual({ filters: "[]", sortBy: '[["id","asc"]]', pageSize: "20", offset: "1" });
    expect(init.headers.authorization).toBe(BASICA);
    expect(r.ok ? r.datos : r.motivo).toEqual({
      elementos: [
        { id: "1", identificador: "astraura", nombre: "Astraura", activo: true, publico: false, descripcion: "El cerebro del OS.", padre: null },
        { id: "7", identificador: "fase-semilla", nombre: "Fase Semilla", activo: false, publico: true, descripcion: null, padre: "Astraura" },
        { id: "texto", identificador: null, nombre: "id raro", activo: null, publico: null, descripcion: null, padre: null },
      ],
      total: 45,
      pagina: 1,
      tamanoPagina: 20,
      hayMas: true,
    });
  });

  it("la paginación es por número de página y se acota: 1–100 por página, página desde 1", async () => {
    const f = vi.fn<FetchOpenProject>(async () => json(200, { total: 45, _embedded: { elements: [] } }));
    await listarProyectos(CRED, f, { pagina: 3, tamano: 20 });
    await listarProyectos(CRED, f, { pagina: 0, tamano: 100_000 });
    await listarProyectos(CRED, f, { pagina: -5, tamano: 0 });
    const q = f.mock.calls.map(([u]) => consulta(u as string));
    expect(q[0]).toMatchObject({ pageSize: "20", offset: "3" });
    expect(q[1]).toMatchObject({ pageSize: String(TAMANO_PAGINA.maximo), offset: "1" });
    expect(q[2]).toMatchObject({ pageSize: String(TAMANO_PAGINA.minimo), offset: "1" });
    const ultima = await listarProyectos(CRED, f, { pagina: 3, tamano: 20 });
    expect(ultima.ok ? ultima.datos.hayMas : null).toBe(false);
  });

  it("soloActivos descarta los archivados pero deja los que no dicen su estado", async () => {
    const r = await listarProyectos(CRED, async () => json(200, coleccion), { soloActivos: true });
    expect(r.ok ? r.datos.elementos.map((p) => p.id) : r.motivo).toEqual(["1", "texto"]);
  });

  it("sin total no inventa si hay más páginas; sin lista, error de datos", async () => {
    const r = await listarProyectos(CRED, async () => json(200, { _embedded: { elements: [] } }));
    expect(r.ok ? r.datos : r.motivo).toMatchObject({ total: null, hayMas: null, elementos: [] });
    expect(await listarProyectos(CRED, async () => json(200, { _embedded: {} }))).toMatchObject({ ok: false, fallo: "datos", motivo: expect.stringContaining("lista de proyectos") });
  });
});

describe("openproject · listarPaquetes (GET /api/v3/work_packages)", () => {
  const paquete = {
    _type: "WorkPackage",
    id: 1528,
    subject: "Conectar WeKnora a Astraura",
    startDate: "2026-10-27",
    dueDate: "2026-11-03",
    percentageDone: 40,
    updatedAt: "2026-10-26T08:00:00.000Z",
    _links: {
      self: { href: "/api/v3/work_packages/1528" },
      type: { href: "/api/v3/types/1", title: "Tarea" },
      status: { href: "/api/v3/statuses/7", title: "En curso" },
      priority: { href: "/api/v3/priorities/8", title: "Alta" },
      assignee: { href: "/api/v3/users/4", title: "Alex" },
      project: { href: "/api/v3/projects/12", title: "Astraura" },
    },
  };

  it("por defecto solo los abiertos (status_id con operador «o»), con los filtros siempre explícitos", async () => {
    const f = vi.fn<FetchOpenProject>(async () => json(200, { total: 1, _embedded: { elements: [paquete] } }));
    const r = await listarPaquetes(CRED, f);
    const [url] = f.mock.calls[0] as [string, PeticionLectura];
    expect(new URL(url).pathname).toBe("/api/v3/work_packages");
    expect(JSON.parse(consulta(url).filters ?? "")).toEqual([{ status_id: { operator: "o", values: null } }]);
    expect(r.ok ? r.datos.elementos : r.motivo).toEqual([
      {
        id: "1528",
        asunto: "Conectar WeKnora a Astraura",
        tipo: "Tarea",
        estado: "En curso",
        prioridad: "Alta",
        asignado: "Alex",
        proyectoId: "12",
        proyecto: "Astraura",
        inicio: "2026-10-27",
        fin: "2026-11-03",
        porcentaje: 40,
        actualizado: "2026-10-26T08:00:00.000Z",
      },
    ]);
  });

  it("filtra por proyecto con el filtro «project» y, si se piden también los cerrados, manda [] como pide la documentación", async () => {
    const f = vi.fn<FetchOpenProject>(async () => json(200, { total: 0, _embedded: { elements: [] } }));
    await listarPaquetes(CRED, f, { proyectoId: 12, incluirCerrados: true });
    await listarPaquetes(CRED, f, { proyectoId: "12" });
    await listarPaquetes(CRED, f, { incluirCerrados: true });
    const filtros = f.mock.calls.map(([u]) => JSON.parse(consulta(u as string).filters ?? ""));
    expect(filtros[0]).toEqual([{ project: { operator: "=", values: ["12"] } }]);
    expect(filtros[1]).toEqual([{ project: { operator: "=", values: ["12"] } }, { status_id: { operator: "o", values: null } }]);
    expect(filtros[2]).toEqual([]);
  });

  it("un proyecto que no es un id numérico se rechaza antes de llamar (nada se cuela en el filtro)", async () => {
    const f = vi.fn<FetchOpenProject>();
    for (const malo of ["abc", "1,2", '1"]', "../projects", ""]) {
      expect(await listarPaquetes(CRED, f, { proyectoId: malo }), malo).toMatchObject({ ok: false, fallo: "peticion" });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("lo que falte en un paquete queda «sin dato»; sin lista, error de datos", async () => {
    const r = await listarPaquetes(CRED, async () => json(200, { total: 1, _embedded: { elements: [{ id: 5 }, { subject: "sin id" }] } }));
    expect(r.ok ? r.datos.elementos : r.motivo).toEqual([
      { id: "5", asunto: null, tipo: null, estado: null, prioridad: null, asignado: null, proyectoId: null, proyecto: null, inicio: null, fin: null, porcentaje: null, actualizado: null },
    ]);
    expect(await listarPaquetes(CRED, async () => json(200, []))).toMatchObject({ ok: false, fallo: "datos", motivo: expect.stringContaining("paquetes de trabajo") });
  });
});

describe("openproject · estados honestos y el token jamás fuera de su sitio", () => {
  it("401 token inválido · 403 sin permiso · 404 no es la API · 429 despacio, cada uno con su motivo", async () => {
    expect(await sondear(CRED, async () => resp(401, ""))).toMatchObject({ ok: false, fallo: "http", estado: 401, motivo: expect.stringMatching(/Token inválido.*OPENPROJECT_API_KEY/) });
    expect(await listarProyectos(CRED, async () => resp(403, ""))).toMatchObject({ motivo: expect.stringMatching(/no tiene permiso/) });
    expect(await listarPaquetes(CRED, async () => resp(404, ""))).toMatchObject({ motivo: expect.stringMatching(/\/api\/v3/) });
    expect(await listarPaquetes(CRED, async () => resp(429, ""))).toMatchObject({ motivo: expect.stringMatching(/más despacio/) });
    expect(await listarPaquetes(CRED, async () => resp(400, "{}"))).toMatchObject({ estado: 400, motivo: expect.stringMatching(/filtros/) });
  });

  it("una redirección no se sigue (el token no sale de la instancia) y un fallo de red no lanza", async () => {
    const f = vi.fn<FetchOpenProject>(async () => resp(302, ""));
    expect(await sondear(CRED, f)).toMatchObject({ ok: false, fallo: "http", estado: 302, motivo: expect.stringMatching(/OPENPROJECT_URL/) });
    expect(f).toHaveBeenCalledTimes(1);
    expect(
      await sondear(CRED, async () => {
        throw new TypeError("fetch failed");
      }),
    ).toMatchObject({ ok: false, fallo: "red" });
  });

  it("credenciales inválidas (o un token con caracteres que no caben en la cabecera): no llama y no repite el valor", async () => {
    const f = vi.fn<FetchOpenProject>();
    expect(await sondear({ url: "no es url", token: TOKEN }, f)).toMatchObject({ ok: false, fallo: "credenciales" });
    expect(await listarProyectos({ url: "https://x.local", token: "" }, f)).toMatchObject({ ok: false, fallo: "credenciales", motivo: expect.stringContaining("OPENPROJECT_API_KEY") });
    expect(await listarPaquetes({ url: "https://x.local", token: "clave-ñ" }, f)).toMatchObject({ ok: false, fallo: "credenciales" });
    expect(f).not.toHaveBeenCalled();
  });

  it("ni los motivos ni el registro llevan el token ni su forma Basic en base64", async () => {
    const lineas: string[] = [];
    const base64 = btoa(`apikey:${TOKEN}`);
    const r = await listarProyectos(CRED, async () => resp(500, `eco ${TOKEN} y ${base64}`), {}, { registrar: (l) => lineas.push(l) });
    expect(r).toMatchObject({ ok: false, fallo: "http", estado: 500 });
    for (const texto of [JSON.stringify(r), JSON.stringify(lineas)]) {
      expect(texto).not.toContain(TOKEN);
      expect(texto).not.toContain(base64);
    }
    const buenas: string[] = [];
    await sondear(CRED, async () => json(200, { _type: "Root", instanceName: "OP" }), { registrar: (l) => buenas.push(l) });
    expect(buenas[0]).toMatch(/^OpenProject GET \/ · 200 · ok en \d+ ms$/);
    expect(JSON.stringify(buenas)).not.toContain(TOKEN);
  });

  it("tiempo agotado: corta la petición con el reloj inyectado", async () => {
    const { reloj, avanzar } = relojFalso();
    let senal: AbortSignal | undefined;
    const colgado: FetchOpenProject = (_u, i) => {
      senal = i.signal;
      return new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("abortado"))));
    };
    const p = listarPaquetes(CRED, colgado, {}, { reloj });
    avanzar(14_999);
    expect(senal?.aborted).toBe(false);
    avanzar(1);
    expect(await p).toMatchObject({ ok: false, fallo: "tiempo", ms: 15_000 });
    expect(senal?.aborted).toBe(true);
  });
});

describe("openproject · solo lectura y módulo puro", () => {
  it("solo hace GET: ninguna escritura, ni la ruta obsoleta de paquetes por proyecto", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../openproject.ts"), "utf8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/metodo:\s*"POST"|\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b/);
    expect(codigo).not.toMatch(/projects\/\$\{|\/work_packages\/\$\{/);
    expect(codigo).not.toMatch(/^\s*import[^;]*from\s+["']node:/m);
    expect(codigo).not.toMatch(/process\.env/);
    expect(codigo).not.toMatch(/^\s*["']use client["']/m);
  });
});
