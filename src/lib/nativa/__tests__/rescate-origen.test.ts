/*
 * Rescate entre orígenes del servidor local (NOT1108A): la página que exporta el origen viejo
 * (http://127.0.0.1:<puerto anterior>) y la que importa en el actual, de punta a punta con una IndexedDB de
 * mentira y un «Rust» de mentira (los comandos `rescate_origen_*` guardan y sirven los trozos). Y el
 * contrato con Rust (rutas, comandos y la página inline).
 *   NODE_ENV=test npx vitest run src/lib/nativa/__tests__/rescate-origen.test.ts
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearIdbDeMentira } from "./idb-de-mentira";

const require = createRequire(import.meta.url);
const RAIZ = process.cwd();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M: any = require(join(RAIZ, "native/servidor-local/migracion-origen.js"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = require(join(RAIZ, "native/servidor-local/rescate-origen.js"));
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

class LsDeMentira {
    m = new Map<string, string>();
    constructor(o: Record<string, string> = {}) {
        for (const [k, v] of Object.entries(o)) this.m.set(k, v);
    }
    get length() {
        return this.m.size;
    }
    key(i: number) {
        return [...this.m.keys()][i] ?? null;
    }
    getItem(k: string) {
        return this.m.has(k) ? this.m.get(k)! : null;
    }
    setItem(k: string, v: string) {
        this.m.set(k, String(v));
    }
}

/** `document.cookie` de mentira: cada asignación pone una cookie; leerla da «a=1; b=2». */
class DocDeMentira {
    c = new Map<string, string>();
    constructor(inicial: Record<string, string> = {}) {
        for (const [k, v] of Object.entries(inicial)) this.c.set(k, v);
    }
    get cookie() {
        return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    set cookie(s: string) {
        const [par] = s.split(";");
        const i = par.indexOf("=");
        this.c.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
}

function pedido<T>(r: { onsuccess: unknown; onerror: unknown; result: unknown; error: unknown }): Promise<T> {
    return new Promise((ok, falla) => {
        r.onsuccess = () => ok(r.result as T);
        r.onerror = () => falla(r.error);
    });
}

const bandeja = (conv: Record<string, Array<{ id: string; at: number; texto?: string }>>, leido = 0) =>
    JSON.stringify({
        v: 1,
        conv: Object.fromEntries(
            Object.entries(conv).map(([k, ms]) => [k, { leidoHasta: leido, mensajes: ms.map((m) => ({ clave: k, dir: "entra", estado: "recibido", texto: m.texto ?? m.id, ...m })) }]),
        ),
        vias: {},
    });

/** Un «Rust» de mentira con los cuatro comandos del rescate (solo memoria, como el de verdad). */
function rustDeMentira() {
    const exportados = new Map<number, { trozos: string[]; vacio: boolean; error: string | null }>();
    let exportando = 0;
    const confirmados: unknown[] = [];
    return {
        exportados,
        confirmados,
        exportarDesde(puerto: number) {
            exportando = puerto;
        },
        invoke: async (cmd: string, a: Record<string, unknown> = {}) => {
            if (cmd === "rescate_origen_exportar") {
                const e = exportados.get(exportando) ?? { trozos: [], vacio: false, error: null };
                if (a.error) e.error = String(a.error);
                else {
                    e.trozos[a.indice as number] = String(a.trozo);
                    e.vacio = !!a.vacio;
                }
                exportados.set(exportando, e);
                return null;
            }
            if (cmd === "rescate_origen_estado") {
                return { actual: 47610, fuentes: [...exportados].filter(([, e]) => !e.vacio && !e.error).map(([puerto, e]) => ({ puerto, partes: e.trozos.length })) };
            }
            if (cmd === "rescate_origen_datos") return exportados.get(a.puerto as number)!.trozos[a.indice as number];
            if (cmd === "rescate_origen_confirmar") {
                confirmados.push(a.resultados);
                return null;
            }
            throw new Error(`comando desconocido ${cmd}`);
        },
    };
}

describe("cookies de la sesión", () => {
    it("solo las de Supabase (`sb-…`) viajan", () => {
        expect(R.cookiesDeSesion("sb-ref-auth-token.0=AAA; starseed_pase=zzz; otra=1; sb-ref-auth-token.1=BBB")).toEqual([
            ["sb-ref-auth-token.0", "AAA"],
            ["sb-ref-auth-token.1", "BBB"],
        ]);
        expect(R.cookiesDeSesion("")).toEqual([]);
    });

    it("se ponen si aquí no hay sesión; nunca se mezclan con una que ya haya", () => {
        const vacio = new DocDeMentira();
        expect(R.ponerCookies(vacio, [["sb-ref-auth-token", "AAA"], ["malo;x", "1"]])).toBe(1);
        expect(vacio.c.get("sb-ref-auth-token")).toBe("AAA");
        const conSesion = new DocDeMentira({ "sb-ref-auth-token": "MIA" });
        expect(R.ponerCookies(conSesion, [["sb-ref-auth-token", "VIEJA"]])).toBe(0);
        expect(conSesion.c.get("sb-ref-auth-token")).toBe("MIA");
    });
});

describe("bandeja de la malla", () => {
    it("se UNE mensaje a mensaje (no gana una de las dos)", () => {
        const aqui = bandeja({ "n:mac": [{ id: "m3", at: 30 }], "n:otra": [{ id: "x1", at: 5 }] }, 30);
        const vieja = bandeja({ "n:mac": [{ id: "m1", at: 10 }, { id: "m2", at: 20 }, { id: "m3", at: 30, texto: "otro texto" }] }, 20);
        const f = R.fusionarBandeja(aqui, vieja);
        expect(f.traidos).toBe(2);
        const o = JSON.parse(f.texto);
        expect(o.conv["n:mac"].mensajes.map((m: { id: string }) => m.id)).toEqual(["m1", "m2", "m3"]);
        expect(o.conv["n:mac"].mensajes[2].texto).toBe("m3"); // el de aquí se queda
        expect(o.conv["n:mac"].leidoHasta).toBe(30);
        expect(o.conv["n:otra"].mensajes).toHaveLength(1);
    });

    it("sin bandeja aquí, la vieja entera; basura: nada", () => {
        const f = R.fusionarBandeja(null, bandeja({ "c:u9": [{ id: "a", at: 1 }] }));
        expect(JSON.parse(f.texto).conv["c:u9"].mensajes).toHaveLength(1);
        expect(R.fusionarBandeja(null, "{roto")).toEqual({ texto: null, traidos: 0 });
    });

    it("con el tope del buzón (300 por conversación: los más nuevos)", () => {
        const muchos = Array.from({ length: 320 }, (_, i) => ({ id: `v${i}`, at: i }));
        const o = JSON.parse(R.fusionarBandeja(null, bandeja({ "n:mac": muchos })).texto);
        expect(o.conv["n:mac"].mensajes).toHaveLength(300);
        expect(o.conv["n:mac"].mensajes[0].id).toBe("v20");
    });
});

describe("de punta a punta: origen viejo → Rust → origen actual", () => {
    it("trae el historial, los ajustes, IndexedDB y la sesión sin pisar lo de aquí", async () => {
        // Origen viejo (127.0.0.1:47611): la native-20 sirvió aquí.
        const lsViejo = new LsDeMentira({
            "starseed.mensajeria.malla.v1": bandeja({ "n:mac": [{ id: "m1", at: 10 }, { id: "m2", at: 20 }] }),
            "starseed.neuron.device-id": "neurona-vieja-0001",
            "starseed.escritorios.v1": '{"a":1}',
            "starseed.tema": "oscuro",
        });
        const idbViejo = crearIdbDeMentira();
        const r = idbViejo.open("starseed-memory", 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r.onupgradeneeded = () => (r.result as any).createObjectStore("notas", { keyPath: "id" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db: any = await pedido(r);
        const tx = db.transaction(["notas"], "readwrite");
        tx.objectStore("notas").add({ id: "n1", texto: "nota vieja" });
        await new Promise((ok) => (tx.oncomplete = ok));

        const rust = rustDeMentira();
        rust.exportarDesde(47611);
        const pintado: string[] = [];
        await R.exportarPagina({
            M,
            invoke: rust.invoke,
            localStorage: lsViejo,
            indexedDB: idbViejo,
            cookie: "sb-ref-auth-token=SESION; starseed_pase=nunca",
            origen: "http://127.0.0.1:47611",
            ahora: () => 1,
            pintar: (t: string) => pintado.push(t),
        });
        expect(rust.exportados.get(47611)?.vacio).toBe(false);
        expect(pintado[0]).toContain("127.0.0.1:47611");

        // Un origen vacío (47612): se dice «vacío» y no se importa.
        rust.exportarDesde(47612);
        await R.exportarPagina({ M, invoke: rust.invoke, localStorage: new LsDeMentira(), indexedDB: crearIdbDeMentira(), cookie: "", origen: "http://127.0.0.1:47612", ahora: () => 1 });
        expect(rust.exportados.get(47612)?.vacio).toBe(true);

        // Origen actual (127.0.0.1:47610): la native-21 ya creó su propio id y un mensaje nuevo.
        const ls = new LsDeMentira({
            "starseed.mensajeria.malla.v1": bandeja({ "n:mac": [{ id: "m3", at: 30 }] }),
            "starseed.neuron.device-id": "neurona-nueva-0002",
            "starseed.tema": "claro",
        });
        const idb = crearIdbDeMentira();
        const doc = new DocDeMentira({ starseed_pase: "otro" });
        const resultados = await R.importarPagina({ M, invoke: rust.invoke, localStorage: ls, indexedDB: idb, document: doc, ahora: () => 2 });

        expect(resultados).toHaveLength(1);
        expect(resultados[0]).toMatchObject({ puerto: 47611, ok: true });
        expect(resultados[0].resumen.mensajesMalla).toBe(2);
        expect(resultados[0].resumen.cookiesSesion).toBe(1);
        // El historial: unido.
        const b = JSON.parse(ls.getItem("starseed.mensajeria.malla.v1")!);
        expect(b.conv["n:mac"].mensajes.map((m: { id: string }) => m.id)).toEqual(["m1", "m2", "m3"]);
        // Lo que no había aquí, traído; lo que aquí es otro valor, se queda (y la neurona anterior se apunta).
        expect(ls.getItem("starseed.escritorios.v1")).toBe('{"a":1}');
        expect(ls.getItem("starseed.tema")).toBe("claro");
        expect(ls.getItem("starseed.neuron.device-id")).toBe("neurona-nueva-0002");
        expect(ls.getItem(M.CLAVE_NEURONA_ANTERIOR)).toBe("neurona-vieja-0001");
        // La sesión (cookie de Supabase), puesta; el pase de la app nunca viaja.
        expect(doc.c.get("sb-ref-auth-token")).toBe("SESION");
        expect(doc.c.get("starseed_pase")).toBe("otro");
        // IndexedDB.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db2: any = await pedido(idb.open("starseed-memory"));
        const cursor = db2.transaction(["notas"]).objectStore("notas").openCursor();
        const valores: unknown[] = [];
        await new Promise<void>((ok) => {
            cursor.onsuccess = () => {
                const c = cursor.result;
                if (!c) return ok();
                valores.push(c.value);
                c.continue();
            };
        });
        expect(valores).toEqual([{ id: "n1", texto: "nota vieja" }]);
        // Confirmado a Rust y marcador para la web.
        expect(rust.confirmados).toHaveLength(1);
        expect(JSON.parse(ls.getItem(R.CLAVE_MARCADOR)!).resultados[0].ok).toBe(true);
    });

    it("un error al exportar se cuenta y no se importa nada", async () => {
        const rust = rustDeMentira();
        rust.exportarDesde(47613);
        const M2 = { ...M, exportar: () => Promise.reject(new Error("IndexedDB ilegible")) };
        await R.exportarPagina({ M: M2, invoke: rust.invoke, localStorage: new LsDeMentira(), indexedDB: null, cookie: "", origen: "x", ahora: () => 1 });
        expect(rust.exportados.get(47613)?.error).toContain("ilegible");
        const r = await R.importarPagina({ M, invoke: rust.invoke, localStorage: new LsDeMentira(), indexedDB: null, document: new DocDeMentira(), ahora: () => 2 });
        expect(r).toEqual([]);
        expect(rust.confirmados).toEqual([[]]);
    });
});

describe("contrato con Rust", () => {
    it("rutas, comandos, la página inline y los diez puertos", () => {
        const logica = leer("native/src-tauri/src/origen_local_logica.rs");
        const glue = leer("native/src-tauri/src/origen_local.rs");
        expect(logica).toContain(`pub const RUTA_EXPORTAR: &str = "${R.RUTA_EXPORTAR}";`);
        expect(logica).toContain(`pub const RUTA_IMPORTAR: &str = "${R.RUTA_IMPORTAR}";`);
        expect(glue).toContain('include_str!("../../servidor-local/rescate-origen.js")');
        expect(glue).toContain('include_str!("../../servidor-local/migracion-origen.js")');
        const js = leer("native/servidor-local/rescate-origen.js");
        for (const c of ["rescate_origen_exportar", "rescate_origen_estado", "rescate_origen_datos", "rescate_origen_confirmar"]) {
            expect(js).toContain(`"${c}"`);
            expect(glue).toMatch(new RegExp(`pub fn ${c}\\(`));
        }
        const puertos = (f: string, n: string) => logica.match(new RegExp(`pub const ${n}: \\[u16; 10\\] = \\[([^\\]]+)\\]`))?.[1] ?? f;
        expect(puertos("", "PUERTOS")).toBe(leer("native/src-tauri/src/servidor_local_logica.rs").match(/pub const PUERTOS: \[u16; 10\] = \[([^\]]+)\]/)![1]);
        // Sin sintaxis moderna que no entienda el WebKit de macOS 10.15.
        expect(js).not.toMatch(/\?\.|\?\?|=>/);
        // La bandeja que se une es la del buzón de la malla.
        expect(leer("src/lib/mensajeria/neuronas/buzon.ts")).toContain(`CLAVE_BANDEJA_MALLA = "${R.CLAVE_BANDEJA}"`);
    });
});
