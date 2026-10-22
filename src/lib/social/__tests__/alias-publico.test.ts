import { describe, expect, it } from "vitest";

import {
    ALIAS_ANONIMO,
    nombrePublicoParaComentario,
    pareceEmail,
} from "@/lib/social/alias-publico";

describe("nombrePublicoParaComentario", () => {
    it("manda el nombre público del PERFIL sobre el de la cuenta", () => {
        expect(
            nombrePublicoParaComentario({
                nombrePerfil: "Ana Ruiz",
                metadata: { full_name: "Otro nombre" },
            }),
        ).toBe("Ana Ruiz");
    });

    it("usa el nombre que la persona eligió en la CUENTA si no hay perfil", () => {
        expect(nombrePublicoParaComentario({ metadata: { full_name: "Ana" } })).toBe("Ana");
        expect(nombrePublicoParaComentario({ metadata: { name: "Ana" } })).toBe("Ana");
        expect(nombrePublicoParaComentario({ metadata: { display_name: "Ana" } })).toBe("Ana");
    });

    it("firma con el alias anónimo cuando no hay ningún nombre", () => {
        expect(nombrePublicoParaComentario({})).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoParaComentario({ nombrePerfil: null, metadata: null })).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoParaComentario({ nombrePerfil: "   " })).toBe(ALIAS_ANONIMO);
    });

    it("NUNCA muestra el email: ni del perfil ni de los metadatos", () => {
        expect(nombrePublicoParaComentario({ metadata: { email: "ana@example.com" } })).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoParaComentario({ metadata: { full_name: "ana@example.com" } })).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoParaComentario({ nombrePerfil: "ana@example.com" })).toBe(ALIAS_ANONIMO);
    });

    it("cae al nombre elegido cuando el perfil solo trae el alias", () => {
        expect(
            nombrePublicoParaComentario({ nombrePerfil: ALIAS_ANONIMO, metadata: { full_name: "Ana" } }),
        ).toBe("Ana");
    });

    it("ignora valores que no son texto y recorta los que sí", () => {
        expect(nombrePublicoParaComentario({ metadata: { full_name: 42 } })).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoParaComentario({ metadata: { full_name: "  Ana  " } })).toBe("Ana");
    });
});

describe("pareceEmail", () => {
    it("distingue un email de un nombre", () => {
        expect(pareceEmail("ana@example.com")).toBe(true);
        expect(pareceEmail("ana")).toBe(false);
        expect(pareceEmail("Ana Ruiz")).toBe(false);
    });
});
