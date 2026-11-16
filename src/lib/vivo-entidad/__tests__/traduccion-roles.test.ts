/**
 * Pruebas de la tabla de traducción de roles (§3.1).
 * Una fila por cada línea de la tabla.
 */
import { describe, expect, test } from "vitest";
import {
    rangoDeSesion,
    puedeEditarSesion,
    puedeModerar,
    puedeGestionar,
    type RangoSesion,
} from "@/lib/vivo-entidad/traduccion-roles";

describe("traducción de roles a rango de sesión (§3.1)", () => {
    // Visitante anónimo con enlace público → ver
    test("anónimo con enlace público → ver", () => {
        const r = rangoDeSesion({ rolEntidad: null, esDuenoSesion: false, esComentarista: false, conEnlacePublico: true });
        expect(r).toBe("ver");
    });

    // Seguidor / miembro «observador» (rango 1) → ver
    test("observador (rango 1) → ver", () => {
        const r = rangoDeSesion({ rolEntidad: "observador", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("ver");
    });

    test("viewer (rango 1) → ver", () => {
        const r = rangoDeSesion({ rolEntidad: "viewer", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("ver");
    });

    test("miembro (rango 1) → ver", () => {
        const r = rangoDeSesion({ rolEntidad: "miembro", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("ver");
    });

    // Invitado «comentarista» (PermisoVivo comentar) → comentar
    test("comentarista invitado → comentar", () => {
        const r = rangoDeSesion({ rolEntidad: null, esDuenoSesion: false, esComentarista: true, conEnlacePublico: false });
        expect(r).toBe("comentar");
    });

    // Miembro «colaborador/editor» (rango 2) → editar
    test("colaborador (rango 2) → editar", () => {
        const r = rangoDeSesion({ rolEntidad: "colaborador", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("editar");
    });

    test("editor (rango 2) → editar", () => {
        const r = rangoDeSesion({ rolEntidad: "editor", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("editar");
    });

    // Moderador (rol moderador) → moderar
    test("moderador → moderar", () => {
        const r = rangoDeSesion({ rolEntidad: "moderador", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("moderar");
    });

    // Gestor/admin (rango 3) → gestionar
    test("gestor (rango 3) → gestionar", () => {
        const r = rangoDeSesion({ rolEntidad: "gestor", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("gestionar");
    });

    test("admin (rango 3) → gestionar", () => {
        const r = rangoDeSesion({ rolEntidad: "admin", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("gestionar");
    });

    test("total (rango 4) → dueno", () => {
        const r = rangoDeSesion({ rolEntidad: "total", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("dueno");
    });

    // Dueño de la sesión/entidad (rango 4) → dueno
    test("dueño de sesión → dueno", () => {
        const r = rangoDeSesion({ rolEntidad: null, esDuenoSesion: true, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("dueno");
    });

    test("owner (rango 4) → dueno", () => {
        const r = rangoDeSesion({ rolEntidad: "owner", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("dueno");
    });

    // Sin rol y sin enlace → null (no entra)
    test("sin rol y sin enlace → null", () => {
        const r = rangoDeSesion({ rolEntidad: null, esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBeNull();
    });

    // Rol desconocido → ver o null, NUNCA más
    test("rol inventado sin enlace → null", () => {
        const r = rangoDeSesion({ rolEntidad: "inventado", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBeNull();
    });

    test("rol inventado con enlace público → ver", () => {
        const r = rangoDeSesion({ rolEntidad: "inventado", esDuenoSesion: false, esComentarista: false, conEnlacePublico: true });
        expect(r).toBe("ver");
    });

    // Prioridad: dueño de sesión gana sobre rol de entidad
    test("dueño de sesión con rol observador → dueno", () => {
        const r = rangoDeSesion({ rolEntidad: "observador", esDuenoSesion: true, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("dueno");
    });

    // Prioridad: moderador gana sobre gestor
    test("moderador con esDuenoSesion false → moderar", () => {
        const r = rangoDeSesion({ rolEntidad: "moderador", esDuenoSesion: false, esComentarista: false, conEnlacePublico: false });
        expect(r).toBe("moderar");
    });
});

describe("puedeEditarSesion", () => {
    const casos: Array<[RangoSesion | null, boolean]> = [
        ["ver", false],
        ["comentar", false],
        ["editar", true],
        ["moderar", true],
        ["gestionar", true],
        ["dueno", true],
        [null, false],
    ];

    for (const [rango, esperado] of casos) {
        test(`${rango ?? "null"} → ${esperado}`, () => {
            expect(puedeEditarSesion(rango)).toBe(esperado);
        });
    }
});

describe("puedeModerar", () => {
    const casos: Array<[RangoSesion | null, boolean]> = [
        ["ver", false],
        ["comentar", false],
        ["editar", false],
        ["moderar", true],
        ["gestionar", true],
        ["dueno", true],
        [null, false],
    ];

    for (const [rango, esperado] of casos) {
        test(`${rango ?? "null"} → ${esperado}`, () => {
            expect(puedeModerar(rango)).toBe(esperado);
        });
    }
});

describe("puedeGestionar", () => {
    const casos: Array<[RangoSesion | null, boolean]> = [
        ["ver", false],
        ["comentar", false],
        ["editar", false],
        ["moderar", false],
        ["gestionar", true],
        ["dueno", true],
        [null, false],
    ];

    for (const [rango, esperado] of casos) {
        test(`${rango ?? "null"} → ${esperado}`, () => {
            expect(puedeGestionar(rango)).toBe(esperado);
        });
    }
});