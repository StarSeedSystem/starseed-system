/**
 * DIR1124A · Pruebas para canal Principal y respuesta única del presidente.
 *
 * (2026-11-24) Medido: el canal Principal tiene 214 mensajes de director-autocuracion
 * y 93 de director-capacidad frente a 6 de Alex; el presidente publicó 7 respuestas
 * casi idénticas al mismo mensaje en un minuto (23-11 a las 17:51). Alex: «no veo que
 * estés siendo un canal del director presidente».
 *
 * Reglas verificadas:
 * 1. Alex es dirección
 * 2. Respuesta del presidente es dirección
 * 3. Respuesta a Alex (por cualquier director) es dirección
 * 4. Informes de rutina (director-produccion, director-autocuracion, director-capacidad) NO son dirección
 * 5. El presidente usa sintesis=true para respuestas principales
 */
import { describe, expect, it } from "vitest";

import { esDirectorDeConversacion, canalDeDirector } from "../chat-director-tipos";
import { esDireccion } from "../chat-director-feed";

describe("DIR1124A · canal Principal y respuesta única del presidente", () => {
    describe("qué es dirección según el reporte 2026-11-24", () => {
        it("Alex es dirección (rol: alex)", () => {
            const alex: any = {
                id: "md-alex-1",
                t: "2026-11-23T17:45:00Z",
                de: "alex",
                rol: "alex",
                tipo: "mensaje",
                texto: "Consulta importante",
                canal: "terminal",
            };
            expect(esDireccion(alex)).toBe(true);
        });

        it("respuesta del presidente es dirección (canal: director-presidente)", () => {
            const resp: any = {
                id: "md-resp-1",
                t: "2026-11-23T17:51:00Z",
                de: "director-presidente",
                rol: "director",
                tipo: "respuesta",
                texto: "Respuesta del presidente",
                canal: "director-presidente",
                respondeA: "md-alex-1",
            };
            expect(esDireccion(resp)).toBe(true);
        });

        it("respuesta a Alex por cualquier director es dirección", () => {
            const resp: any = {
                id: "md-resp-2",
                t: "2026-11-23T10:01:00Z",
                de: "hermes",
                rol: "director",
                tipo: "respuesta",
                texto: "Respuesta Hermes",
                canal: "hermes",
                respondeA: "md-alex-1",
            };
            const alex: any = {
                id: "md-alex-1",
                t: "2026-11-23T17:45:00Z",
                de: "alex",
                rol: "alex",
                tipo: "mensaje",
                texto: "Pregunta",
                canal: "mando",
            };
            const porId = new Map([[alex.id, alex]]);
            expect(esDireccion(resp, porId)).toBe(true);
        });

        it("Hermes contestando a un aviso de robot NO es dirección", () => {
            const aviso: any = {
                id: "md-aviso-1",
                t: "2026-11-23T10:00:00Z",
                de: "desatascador",
                rol: "sistema",
                tipo: "aviso",
                texto: "Aviso del robot",
                canal: "mando",
            };
            const resp: any = {
                id: "md-resp-3",
                t: "2026-11-23T10:01:00Z",
                de: "hermes",
                rol: "director",
                tipo: "respuesta",
                texto: "Respuesta al robot",
                canal: "hermes",
                respondeA: aviso.id,
            };
            const porId = new Map([[aviso.id, aviso]]);
            expect(esDireccion(resp, porId)).toBe(false);
        });
    });

    describe("director-produccion, autocuracion y capacidad son rutina", () => {
        it("director-produccion NO es director de conversación", () => {
            expect(esDirectorDeConversacion("director-produccion")).toBe(false);
        });

        it("director-autocuracion NO es director de conversación", () => {
            expect(esDirectorDeConversacion("director-autocuracion")).toBe(false);
        });

        it("director-capacidad NO es director de conversación", () => {
            expect(esDirectorDeConversacion("director-capacidad")).toBe(false);
        });

        it("informe de director-produccion NO es dirección", () => {
            const informe: any = {
                id: "md-prod-1",
                t: "2026-11-23T10:00:00Z",
                de: "director-produccion",
                rol: "director",
                tipo: "informe",
                texto: "Informe de producción",
                canal: "mando",
            };
            expect(esDireccion(informe)).toBe(false);
        });

        it("aviso de director-capacidad NO es dirección", () => {
            const aviso: any = {
                id: "md-cap-1",
                t: "2026-11-23T11:00:00Z",
                de: "director-capacidad",
                rol: "director",
                tipo: "aviso",
                texto: "Capacidad en la nube: nada que lanzar",
                canal: "mando",
            };
            expect(esDireccion(aviso)).toBe(false);
        });
    });

    describe("canales del presidente", () => {
        it("canalDeDirector('director-presidente') devuelve 'director-presidente'", () => {
            expect(canalDeDirector("director-presidente")).toBe("director-presidente");
        });

        it("canalDeDirector('hermes') devuelve 'hermes'", () => {
            expect(canalDeDirector("hermes")).toBe("hermes");
        });

        it("canalDeDirector('codex') devuelve 'chatgpt'", () => {
            expect(canalDeDirector("codex")).toBe("chatgpt");
        });

        it("canalDeDirector('claude-mac') devuelve 'claude-mac'", () => {
            expect(canalDeDirector("claude-mac")).toBe("claude-mac");
        });

        it("canalDeDirector('antigravity') devuelve 'antigravity'", () => {
            expect(canalDeDirector("antigravity")).toBe("antigravity");
        });

        it("canalDeDirector con prefijo claude devuelve 'claude-cowork'", () => {
            expect(canalDeDirector("claude-superset")).toBe("claude-cowork");
        });

        it("canalDeDirector devuelve null para canales sin director propio", () => {
            expect(canalDeDirector("vigia")).toBeNull();
            expect(canalDeDirector("buscador")).toBeNull();
        });
    });

    describe("directores de conversación", () => {
        it("hermes es director de conversación", () => {
            expect(esDirectorDeConversacion("hermes")).toBe(true);
        });

        it("chatgpt es director de conversación", () => {
            expect(esDirectorDeConversacion("chatgpt")).toBe(true);
            expect(esDirectorDeConversacion("codex")).toBe(true);
        });

        it("claude-mac es director de conversación", () => {
            expect(esDirectorDeConversacion("claude-mac")).toBe(true);
        });

        it("claude-cowork es director de conversación (prefijo claude)", () => {
            expect(esDirectorDeConversacion("claude-cowork")).toBe(true);
        });

        it("antigravity es director de conversación", () => {
            expect(esDirectorDeConversacion("antigravity")).toBe(true);
        });

        it("director-presidente es director de conversación", () => {
            expect(esDirectorDeConversacion("director-presidente")).toBe(true);
        });
    });
});