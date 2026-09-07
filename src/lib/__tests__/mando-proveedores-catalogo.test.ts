import { describe, expect, it } from "vitest";
import {
    PROVEEDORES_CATALOGO,
    proveedoresDisponibles,
    type ProveedorInfo,
} from "../mando/proveedores-catalogo";

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
                        { var: "NVIDIA_API_KEY", medio: "~/.hermes/.env", huella: "nvapi-…", agotada_hasta: "2026-09-07 23:59:00" },
                    ],
                    activa: "NVIDIA_API_KEY",
                    sin_cupo_hasta: "2026-09-07 23:59:00",
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

        const salida = proveedoresDisponibles(salud, catalogo);
        const porId = new Map(salida.map((p) => [p.id, p]));

        // nim: con clave y sin_cupo_hasta futuro → sinCupo.
        const nim = porId.get("nim");
        expect(nim?.estado).toBe("sinCupo");
        expect(nim?.sinCupoHasta).toBe("2026-09-07 23:59:00");
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