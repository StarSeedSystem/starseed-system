/** @vitest-environment jsdom */
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { IDIOMA_FUENTE } from "@/lib/idiomas/idiomas";
import { crearCatalogo, type Catalogo } from "@/lib/idiomas/catalogo";

const CLAVE_IDIOMA_NEURONA = "starseed.idioma.neurona.v1";
const EVENTO_IDIOMA = "starseed:idioma";

const catEn: Catalogo = crearCatalogo({
    codigo: "en",
    revisado: false,
    entradas: {
        Guardar: "Save",
        "Guardar ": "Save ",
        " Guardar ": " Save ",
    },
});

const catFr: Catalogo = crearCatalogo({
    codigo: "fr",
    revisado: false,
    entradas: {
        Guardar: "Enregistrer",
        "Guardar ": "Enregistrer ",
        " Guardar ": " Enregistrer ",
    },
});

function aIdiomaElegibleTest(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase().replace(/_/g, "-");
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(v)) return null;
    if (/^zh-(tw|hk|mo|hant)/.test(v)) return "zh-hant";
    const base = v.split("-")[0];
    const alias = base === "no" || base === "nn" ? "nb" : base === "iw" ? "he" : base === "in" ? "id" : base;
    const known = ["es", "en", "pt", "fr", "de", "it", "nl", "ca", "gl", "eu", "ru", "uk", "pl", "tr", "ar", "he", "fa", "ur", "hi", "bn", "zh", "zh-hant", "ja", "ko", "th", "vi", "id", "sw", "el", "sv", "cs", "ro", "hu", "fi", "da", "nb"];
    return known.includes(alias) ? alias : null;
}

declare module "@/lib/idiomas/hidratacion" {
    export const _testUtils: {
        resolver: () => void;
        nuevaPromesa: () => void;
    };
}

vi.mock("@/lib/idiomas/hidratacion", () => {
    let resolver: (() => void) | null = null;
    let promesa: Promise<void>;

    const crear = () => {
        promesa = new Promise<void>((res) => {
            resolver = res;
        });
    };

    crear();

    return {
        cuandoEsSeguroTraducir: vi.fn(() => promesa),
        entornoDelNavegador: vi.fn(() => ({
            readyState: () => "complete",
            alCargar: (f: () => void) => { f(); return () => {}; },
            esperarReposo: (f: () => void, _tope: number) => { f(); return () => {}; },
        })),
        _testUtils: {
            resolver: () => resolver?.(),
            nuevaPromesa: crear,
        },
    };
});

vi.mock("@/lib/idiomas/catalogos/cargar", () => {
    let catEnLocal: Catalogo;
    let catFrLocal: Catalogo;
    return {
        cargarCatalogo: vi.fn(async (codigo: string) => {
            if (codigo === "en") {
                if (!catEnLocal) {
                    const { crearCatalogo: cC } = await import("@/lib/idiomas/catalogo");
                    catEnLocal = cC({
                        codigo: "en",
                        revisado: false,
                        entradas: { Guardar: "Save", "Guardar ": "Save ", " Guardar ": " Save " },
                    });
                }
                return catEnLocal;
            }
            if (codigo === "fr") {
                if (!catFrLocal) {
                    const { crearCatalogo: cC } = await import("@/lib/idiomas/catalogo");
                    catFrLocal = cC({
                        codigo: "fr",
                        revisado: false,
                        entradas: { Guardar: "Enregistrer", "Guardar ": "Enregistrer ", " Guardar ": " Enregistrer " },
                    });
                }
                return catFrLocal;
            }
            return null;
        }),
    };
});

vi.mock("@/lib/idiomas/estado", () => {
    const CLAVE_IDIOMA_NEURONA_LOCAL = "starseed.idioma.neurona.v1";
    const EVENTO_IDIOMA_LOCAL = "starseed:idioma";
    const IDIOMA_FUENTE_LOCAL = "es";
    return {
        CLAVE_IDIOMA_NEURONA: CLAVE_IDIOMA_NEURONA_LOCAL,
        EVENTO_IDIOMA: EVENTO_IDIOMA_LOCAL,
        IDIOMA_FUENTE: IDIOMA_FUENTE_LOCAL,
        idiomaEfectivo: vi.fn(() => {
            try {
                const s = typeof window !== "undefined" ? window.localStorage : null;
                const bruto = s ? JSON.parse(s.getItem(CLAVE_IDIOMA_NEURONA_LOCAL) ?? "null") as { codigo?: string } | null : null;
                const codigo = aIdiomaElegibleTest(bruto?.codigo) ?? IDIOMA_FUENTE_LOCAL;
                return { codigo, origen: "persona" as const };
            } catch {
                return { codigo: IDIOMA_FUENTE_LOCAL, origen: "cuenta" as const };
            }
        }),
    };
});

import { _testUtils } from "@/lib/idiomas/hidratacion";
import { CapaIdioma } from "../capa-idioma";

describe("capa-idioma – hidratación", () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = "";
        document.documentElement.setAttribute("lang", IDIOMA_FUENTE);
        document.documentElement.setAttribute("dir", "ltr");
        vi.useRealTimers();
        _testUtils.nuevaPromesa();
    });

    afterEach(() => {
        cleanup();
    });

    it("con idioma guardado 'en' el texto del cuerpo sigue en español hasta que la promesa resuelve y entonces cambia", async () => {
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));

        document.body.innerHTML = `<p>Guardar</p><button aria-label="Guardar"> Guardar </button>`;

        const { unmount } = render(<CapaIdioma />);

        // Antes de resolver: el texto sigue en español
        await act(async () => { await Promise.resolve(); });
        expect(document.body.textContent).toContain("Guardar");
        expect(document.body.textContent).not.toContain("Save");

        // Resolver la promesa de hidratación
        await act(async () => {
            _testUtils.resolver();
            await Promise.resolve();
        });

        // Después de resolver: el texto cambia a inglés
        expect(document.body.textContent).toContain("Save");

        unmount();
    });

    it("si el componente se desmonta durante la espera no se aplica nada", async () => {
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));

        document.body.innerHTML = `<p>Guardar</p>`;

        const { unmount } = render(<CapaIdioma />);

        // Desmontar antes de que se resuelva la promesa
        unmount();

        // Resolver la promesa después del desmontaje
        await act(async () => {
            _testUtils.resolver();
            await Promise.resolve();
        });

        // El texto debe seguir en español
        expect(document.body.textContent).toContain("Guardar");
        expect(document.body.textContent).not.toContain("Save");
    });

    it("un cambio de idioma durante la espera aplica el último (con catálogo)", async () => {
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));

        document.body.innerHTML = `<p>Guardar</p>`;

        const { unmount } = render(<CapaIdioma />);

        // Cambiar a francés mientras la promesa no se ha resuelto
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "fr" }));
        window.dispatchEvent(new CustomEvent(EVENTO_IDIOMA, { detail: { codigo: "fr" } }));

        // Resolver la promesa
        await act(async () => {
            _testUtils.resolver();
            await Promise.resolve();
        });

        // Debe aplicarse francés (el último elegido, con catálogo)
        expect(document.documentElement.getAttribute("lang")).toBe("fr");
        expect(document.body.textContent).toContain("Enregistrer");

        unmount();
    });
});