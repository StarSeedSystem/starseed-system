// Prueba del nombre público con el que PostCard firma comentarios.
// Regla del área social (2026-09-29 · sueño SA092936): el email es dato de la
// Cuenta (privada) y NUNCA puede salir como nombre público del Perfil; sin
// nombre visible se firma con el alias anónimo «Ciudadano StarSeed».
import { describe, it, expect } from "vitest";
import {
    nombrePublicoComentario,
    ALIAS_COMENTARISTA,
} from "@/components/social/PostCard";

describe("nombrePublicoComentario", () => {
    it("usa el primer nombre de perfil disponible", () => {
        expect(nombrePublicoComentario({ full_name: "Ana Pérez" })).toBe("Ana Pérez");
        expect(nombrePublicoComentario({ name: "Bruno" })).toBe("Bruno");
        expect(nombrePublicoComentario({ display_name: "Carla" })).toBe("Carla");
    });

    it("prioriza full_name, luego name, luego display_name", () => {
        expect(
            nombrePublicoComentario({
                full_name: "Ana",
                name: "Bruno",
                display_name: "Carla",
            }),
        ).toBe("Ana");
        expect(nombrePublicoComentario({ name: "Bruno", display_name: "Carla" })).toBe("Bruno");
    });

    it("sin metadatos útiles firma con el alias anónimo", () => {
        expect(nombrePublicoComentario({})).toBe(ALIAS_COMENTARISTA);
        expect(nombrePublicoComentario({ full_name: "", name: "   " })).toBe(ALIAS_COMENTARISTA);
        expect(nombrePublicoComentario({ full_name: 42, name: null })).toBe(ALIAS_COMENTARISTA);
    });

    it("nunca revela el email: lo ignora aunque venga en los metadatos", () => {
        // Contrato de privacidad: la función no lee campos de Cuenta. Si el
        // email llegara a colarse en los metadatos, no puede salir como nombre.
        expect(nombrePublicoComentario({ email: "alex@ejemplo.com" })).toBe(
            ALIAS_COMENTARISTA,
        );
        expect(
            nombrePublicoComentario({
                email: "alex@ejemplo.com",
                display_name: "Alex público",
            }),
        ).toBe("Alex público");
    });
});
