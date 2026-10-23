// SP092939 · El email es dato de CUENTA (privado): como nombre público expone
// un dato sensible sin consentimiento. El alias anónimo lo sustituye.
import { describe, expect, it } from "vitest";
import {
    ALIAS_ANONIMO,
    nombrePublicoDesdeMetadata,
    pareceCorreo,
} from "@/lib/social/alias-publico";

describe("nombrePublicoDesdeMetadata", () => {
    it("usa el nombre que la persona eligió mostrar", () => {
        expect(nombrePublicoDesdeMetadata({ full_name: "Ada Lovelace" })).toBe("Ada Lovelace");
    });

    it("prefiere full_name sobre las demás claves", () => {
        const meta = {
            full_name: "Ada Lovelace",
            name: "ada",
            display_name: "Ada L.",
            user_name: "ada_l",
        };
        expect(nombrePublicoDesdeMetadata(meta)).toBe("Ada Lovelace");
    });

    it("acepta el nombre que da un proveedor OAuth (display_name)", () => {
        expect(nombrePublicoDesdeMetadata({ display_name: "Grace Hopper" })).toBe("Grace Hopper");
    });

    it("cae al alias anónimo cuando no hay nombre de perfil público", () => {
        expect(nombrePublicoDesdeMetadata({})).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoDesdeMetadata(null)).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoDesdeMetadata(undefined)).toBe(ALIAS_ANONIMO);
    });

    it("NUNCA devuelve un email como nombre público", () => {
        expect(nombrePublicoDesdeMetadata({ full_name: "ada@correo.com" })).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoDesdeMetadata({ name: "ada@correo.com" })).toBe(ALIAS_ANONIMO);
        expect(nombrePublicoDesdeMetadata({ display_name: "ada@correo.com" })).toBe(ALIAS_ANONIMO);
    });

    it("ignora nombres vacíos o solo espacios", () => {
        expect(nombrePublicoDesdeMetadata({ full_name: "   ", name: "Ada" })).toBe("Ada");
        expect(nombrePublicoDesdeMetadata({ full_name: "" })).toBe(ALIAS_ANONIMO);
    });

    it("descarta valores que no son texto", () => {
        expect(nombrePublicoDesdeMetadata({ full_name: 42, name: true })).toBe(ALIAS_ANONIMO);
    });

    it("normaliza espacios y limita el largo", () => {
        expect(nombrePublicoDesdeMetadata({ full_name: "  Ada \n Lovelace  " })).toBe("Ada Lovelace");
        const largo = "a".repeat(120);
        expect(nombrePublicoDesdeMetadata({ full_name: largo })).toHaveLength(64);
    });
});

describe("pareceCorreo", () => {
    it("reconoce un correo y descarta lo que no lo es", () => {
        expect(pareceCorreo("ada@correo.com")).toBe(true);
        expect(pareceCorreo("Ada Lovelace")).toBe(false);
        expect(pareceCorreo("ada@correo")).toBe(false);
        expect(pareceCorreo("")).toBe(false);
    });
});
