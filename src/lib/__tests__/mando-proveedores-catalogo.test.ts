import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    PROVEEDORES_CATALOGO,
    clasificarProveedor,
    proveedoresDisponibles,
    type ClaveProveedor,
    type FotoProveedorBus,
    type ProveedorInfo,
    type SaludProvEntrada,
} from "../mando/proveedores-catalogo";
import { clavesPresentes } from "../mando/modelos-disponibles";

/** Expresiones que nunca deben aparecer en el catálogo (parecidas a claves reales). */
const PATRONES_SECRETO = [
    /\bsk-[A-Za-z0-9_-]{12,}/,
    /\btk-[A-Za-z0-9]{12,}/,
    /\bnvapi-[A-Za-z0-9_-]{12,}/,
    /\bAIza[A-Za-z0-9_-]{20,}/,
    /\btr_[A-Za-z0-9_-]{10,}/,
];

/** Reúne todo el texto de un proveedor (incluye variables y campos editoriales). */
function textoDe(info: ProveedorInfo): string {
    return [
        info.id,
        info.nombre,
        info.base,
        info.panelClaves,
        info.docs,
        info.gratis,
        ...info.variables,
    ].join("\n");
}

describe("Catálogo de proveedores (Ola 271)", () => {
    it("no contiene ninguna variable ni cadena que parezca una clave real", () => {
        for (const info of PROVEEDORES_CATALOGO) {
            const texto = textoDe(info);
            for (const patron of PATRONES_SECRETO) {
                expect(texto).not.toMatch(patron);
            }
            // Las variables deben ser solo nombres (mayúsculas, guiones bajos), no valores.
            for (const variable of info.variables) {
                expect(variable).toMatch(/^[A-Z0-9_]+$/);
            }
        }
    });

    it("clasifica sin cupo, enfriándose, sin clave y por conseguir", () => {
        const catalogo = PROVEEDORES_CATALOGO;
        const salud = {
            nim: {
                estado: "vivo",
                claves: {
                    claves: [
                        { var: "NVIDIA_API_KEY", medio: "~/.hermes/.env", huella: "nvapi-…", agotada_hasta: "2030-09-07 23:59:00" },
                    ],
                    activa: "NVIDIA_API_KEY",
                    sin_cupo_hasta: "2030-09-07 23:59:00",
                },
            },
            xkiro: {
                estado: "caido",
                claves: {
                    claves: [{ var: "XKIRO_API_KEY", medio: "proceso", huella: "xk-…" }],
                    activa: "XKIRO_API_KEY",
                },
            },
            aihubmix: {
                estado: "vivo",
                claves: { claves: [], activa: null },
            },
        };

        // «Ahora» fijo (antes del sin_cupo_hasta) para que la clasificación sea
        // determinista y no dependa del reloj de la máquina que corre el test.
        const salida = proveedoresDisponibles(
            { salud, ahora: Date.parse("2026-09-07T00:00:00Z") },
            catalogo,
        );
        const porId = new Map(salida.map((p) => [p.id, p]));

        // nim: con clave y sin_cupo_hasta futuro → sinCupo.
        const nim = porId.get("nim");
        expect(nim?.estado).toBe("sinCupo");
        expect(nim?.sinCupoHasta).toBe("2030-09-07 23:59:00");
        expect(nim?.activa).toBe("NVIDIA_API_KEY");
        expect(nim?.claves).toHaveLength(1);

        // xkiro: estado caido (enfriándose, 429/cuota reciente) → enfriandose.
        expect(porId.get("xkiro")?.estado).toBe("enfriandose");

        // llm7: sin clave es válido (responde anónimo) → activo o sinClave, nunca porConseguir.
        expect(porId.get("llm7")?.estado).not.toBe("porConseguir");

        // groq: requiere cuenta y no tiene ninguna clave en la salud → porConseguir.
        expect(porId.get("groq")?.estado).toBe("porConseguir");
    });

    it("devuelve todos los proveedores del catálogo aunque la salud esté vacía", () => {
        const salida = proveedoresDisponibles({}, PROVEEDORES_CATALOGO);
        expect(salida).toHaveLength(PROVEEDORES_CATALOGO.length);
        // Sin salud: quien no requiere cuenta y tiene variables → alguna clave propia esperada,
        // y quien solo Alex puede abrir queda «porConseguir».
        expect(salida.every((p) => typeof p.estado === "string")).toBe(true);
    });
});

// ── Ola 271 · M9B: clasificarProveedor (la regla honesta de la pestaña Flota) ──

describe("clasificarProveedor (Ola 271 · M9B)", () => {
    const nim = PROVEEDORES_CATALOGO.find((p) => p.id === "nim");
    if (!nim) throw new Error("nim debe estar en el catálogo");

    const clavePresente: ClaveProveedor = {
        var: "NVIDIA_API_KEY",
        medio: "hermes",
        huella: "abcd1234",
        agotadaHasta: null,
    };

    it("clave presente + salud vieja caída + foto del bus viva → activo con datoAntiguo", () => {
        const ahora = Date.parse("2026-09-07T08:00:00Z");
        // Salud de hace 2 horas (rebasa los 30 min): decía «caido», pero es un dato viejo.
        const salud: SaludProvEntrada = { estado: "caido", t: "2026-09-07 06:00:00" };
        // La foto del bus (el orquestador que corre ahora) lo ve vivo y es más nueva.
        const foto: FotoProveedorBus = { estado: "vivo", t: "2026-09-07T07:55:00Z" };
        const r = clasificarProveedor(nim, salud, [clavePresente], foto, ahora);
        expect(r.estado).toBe("activo");
        expect(r.datoAntiguo).toBe(true);
        expect(r.edadSaludMin).toBe(120);
    });

    it("sin clave y requiereCuenta → porConseguir (aunque la salud diga vivo)", () => {
        const ahora = Date.parse("2026-09-07T08:00:00Z");
        const salud: SaludProvEntrada = { estado: "vivo", t: "2026-09-07 07:50:00" };
        const r = clasificarProveedor(nim, salud, [], null, ahora);
        expect(r.estado).toBe("porConseguir");
        expect(r.datoAntiguo).toBe(false);
    });

    it("con clave y sin_cupo_hasta futuro → sinCupo", () => {
        const ahora = Date.parse("2026-09-07T08:00:00Z");
        const salud: SaludProvEntrada = {
            estado: "vivo",
            t: "2026-09-07 07:55:00",
            sin_cupo_hasta: "2026-09-07 12:00:00",
        };
        const r = clasificarProveedor(nim, salud, [clavePresente], null, ahora);
        expect(r.estado).toBe("sinCupo");
    });

    it("con clave, salud reciente caída y sin foto más nueva → enfriandose", () => {
        const ahora = Date.parse("2026-09-07T08:00:00Z");
        const salud: SaludProvEntrada = { estado: "caido", t: "2026-09-07 07:55:00" };
        const r = clasificarProveedor(nim, salud, [clavePresente], null, ahora);
        expect(r.estado).toBe("enfriandose");
        expect(r.datoAntiguo).toBe(false);
    });
});

// ── Ola 271 · M9B: clavesPresentes jamás expone un valor de clave ──

describe("clavesPresentes (Ola 271 · M9B)", () => {
    let hogar = "";
    let homeOriginal: string | undefined;
    let rootOriginal: string | undefined;
    // Variables reales de la máquina que ensuciarían la prueba: se apartan.
    const variablesConocidas = [
        "XKIRO_API_KEY",
        "XKIRO_API_KEY_2",
        "NVIDIA_API_KEY",
        "NVIDIA_API_KEY_2",
        "NVIDIA_SHARED_KEY",
        "AIHUBMIX_API_KEY",
        "TOKENROUTER_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENROUTER_SHARED_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "NEXT_PUBLIC_GOOGLE_API_KEY",
        "LLM7_API_KEY",
        "FREETHEAI_API_KEY",
    ] as const;
    const guardadas = new Map<string, string | undefined>();

    beforeEach(async () => {
        hogar = await mkdtemp(path.join(tmpdir(), "m9b-claves-"));
        homeOriginal = process.env.HOME;
        process.env.HOME = hogar;
        // `clavesPresentes()` también lee `.env.local` de la raíz del repo (un medio
        // real con `NVIDIA_SHARED_KEY` u otras claves). Apuntamos la raíz al `hogar`
        // vacío para que ese medio no aporte nada y la prueba solo vea lo que ella crea.
        rootOriginal = process.env.STARSEED_ROOT;
        process.env.STARSEED_ROOT = hogar;
        for (const nombre of variablesConocidas) {
            guardadas.set(nombre, process.env[nombre]);
            delete process.env[nombre];
        }
        // Cualquier otra variable del proceso que parezca una clave de proveedor
        // (`*_API_KEY`, `*_KEY`, pasarelas `STARSEED_PASARELA_*`): también aporta
        // claves «de proceso» y ensucia la prueba si la máquina la tiene puesta.
        for (const nombre of Object.keys(process.env)) {
            if (!/(_API_KEY|_KEY|_TOKEN)(_\d+)?$/.test(nombre) && !/^STARSEED_PASARELA_/.test(nombre)) continue;
            if (guardadas.has(nombre)) continue;
            guardadas.set(nombre, process.env[nombre]);
            delete process.env[nombre];
        }
    });

    afterEach(async () => {
        if (homeOriginal === undefined) delete process.env.HOME;
        else process.env.HOME = homeOriginal;
        if (rootOriginal === undefined) delete process.env.STARSEED_ROOT;
        else process.env.STARSEED_ROOT = rootOriginal;
        for (const [nombre, valor] of guardadas) {
            if (valor === undefined) delete process.env[nombre];
            else process.env[nombre] = valor;
        }
        guardadas.clear();
        await rm(hogar, { recursive: true, force: true });
    });

    it("lee cada medio por separado y devuelve huellas, nunca valores", async () => {
        const valorSecreto = "sk-secreto-de-prueba-muy-largo-0123456789abcdef";
        await mkdir(path.join(hogar, ".starseed"), { recursive: true });
        await mkdir(path.join(hogar, ".hermes"), { recursive: true });
        await writeFile(path.join(hogar, ".starseed", "env"), `XKIRO_API_KEY=${valorSecreto}\n`);
        await writeFile(
            path.join(hogar, ".hermes", ".env"),
            `XKIRO_API_KEY_2=${valorSecreto}-2\nNVIDIA_API_KEY=${valorSecreto}-3\n`,
        );

        const salida = await clavesPresentes();
        const enJson = JSON.stringify(salida);

        // La huella esperada: sha256(valor).slice(0, 8).
        const huellaEsperada = createHash("sha256").update(valorSecreto, "utf-8").digest("hex").slice(0, 8);
        const xkiro = salida.xkiro ?? [];
        expect(xkiro).toContainEqual({ var: "XKIRO_API_KEY", medio: "starseed", huella: huellaEsperada });
        expect(xkiro.find((c) => c.var === "XKIRO_API_KEY_2")?.medio).toBe("hermes");
        expect(salida.nim?.some((c) => c.var === "NVIDIA_API_KEY" && c.medio === "hermes")).toBe(true);

        // Jamás un valor en el JSON (ni los de prueba ni nada parecido a «sk-…»).
        expect(enJson).not.toContain(valorSecreto);
        expect(enJson).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
        for (const huellas of Object.values(salida)) {
            for (const c of huellas) {
                expect(c).toEqual({ var: expect.any(String), medio: expect.any(String), huella: expect.any(String) });
                expect(c.huella).toMatch(/^[0-9a-f]{8}$/);
                expect("valor" in c).toBe(false);
            }
        }
    });

    it("sin archivos de entorno en HOME devuelve proveedores sin claves presentes", async () => {
        const salida = await clavesPresentes();
        for (const halladas of Object.values(salida)) {
            expect(halladas).toEqual([]);
        }
    });
});

// ── Ola 294 · AR5: OpenAI entra como proveedor DE PAGO, fuera de la rotación ──

describe("Proveedor de pago OpenAI (Ola 294 · AR5)", () => {
    it("openai es de pago, tiene papel director y sus dos variables", () => {
        const openai = PROVEEDORES_CATALOGO.find((p) => p.id === "openai");
        expect(openai).toBeDefined();
        expect(openai?.dePago).toBe(true);
        expect(openai?.papel).toBe("director");
        expect(openai?.variables).toEqual(["OPENAI_API_KEY", "STARSEED_PASARELA_OPENAI_KEY"]);
    });

    it("ningún proveedor tiene una base que no empiece por https://", () => {
        for (const info of PROVEEDORES_CATALOGO) {
            expect(info.base.startsWith("https://")).toBe(true);
        }
    });

    it("ningún valor de clave real aparece en el catálogo (sk-, gsk_, nvapi-)", () => {
        for (const info of PROVEEDORES_CATALOGO) {
            const texto = textoDe(info);
            expect(texto).not.toMatch(/\bsk-[A-Za-z0-9_-]{12,}/);
            expect(texto).not.toMatch(/\bgsk_[A-Za-z0-9_-]{12,}/);
            expect(texto).not.toMatch(/\bnvapi-[A-Za-z0-9_-]{12,}/);
        }
    });

    it("los proveedores de pago quedan aparte de los gratuitos (papel distinguible)", () => {
        // `dePago: true` es la marca que aparta al proveedor de la rotación de
        // escritores: nadie gratis debe llevarla y el de pago sí debe distinguirse.
        const dePago = PROVEEDORES_CATALOGO.filter((p) => p.dePago === true);
        const gratuitos = PROVEEDORES_CATALOGO.filter((p) => !p.dePago);
        // (2026-09-09) Antes esto fijaba la lista exacta `["openai"]`, y al entrar
        // Claude como segundo director el test se rompía por crecer, no por romperse.
        // Lo que hay que garantizar es el INVARIANTE, no la foto: todo proveedor de
        // pago está declarado, tiene papel y no se cuela entre los escritores gratis.
        expect(dePago.map((p) => p.id)).toContain("openai");
        expect(dePago.length).toBeGreaterThan(0);
        expect(dePago.every((p) => p.papel === "director")).toBe(true);
        // Ningún gratuito declara papel director (reservado al único de pago).
        expect(gratuitos.every((p) => p.papel !== "director")).toBe(true);
        // Los de pago permanecen aparte: no se mezclan en los gratuitos.
        expect(gratuitos.some((p) => p.dePago === true)).toBe(false);
    });

    it("el número de proveedores gratuitos no cambia al entrar los de pago", () => {
        // (2026-09-08, Ola 294 · AR5) Los gratuitos de la flota son los 16 que ya
        // había ANTES de que OpenAI (y luego Claude) entraran marcados `dePago`:
        // añadir proveedores de pago jamás puede cambiar ese recuento, porque
        // significaría que alguien coló un de pago sin marcar (o lo quitó).
        const gratuitos = PROVEEDORES_CATALOGO.filter((p) => !p.dePago);
        expect(gratuitos.length).toBe(16);
    });
});