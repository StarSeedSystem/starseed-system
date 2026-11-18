/**
 * Clasificador puro de la respuesta de `GET /api/llamadas/ice` para la comprobación de
 * TURN (`scripts/comprobar-turn.mjs`): cuenta URLs y TURN con credenciales, y solo expone
 * esquema y host. Puro: entrada → salida, sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import { esquemaYHost, lineaResumenIce, resumenIce, ResumenIce } from "@/lib/llamadas/resumen-ice";
import { RUTA_SERVIDOR_ICE } from "@/lib/llamadas/ice-servidor";

const CON_TURN = {
    iceServers: [
        { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
        {
            urls: ["turn:turn.ejemplo.org:3478?transport=udp", "turns:turn.ejemplo.org:5349?transport=tcp"],
            username: "1710000000:anon",
            credential: "secreto-temporal",
        },
    ],
    fuente: "cloudflare",
    ttl: 3600,
};

describe("resumenIce", () => {
    it("respuesta con TURN: cuenta URLs y TURN, y solo expone esquema y host", () => {
        const r: ResumenIce = resumenIce(CON_TURN);
        expect(r.turn).toBe(true);
        expect(r.urls).toBe(4);
        expect(r.turnUrls).toBe(2);
        expect(r.hosts).toEqual(["turn:turn.ejemplo.org"]);
    });

    it("nunca incluye usuario, credencial ni puertos en el resumen", () => {
        const texto = JSON.stringify(resumenIce(CON_TURN));
        expect(texto).not.toContain("secreto-temporal");
        expect(texto).not.toContain("1710000000");
        expect(texto).not.toContain("3478");
    });

    it("solo STUN: no hay TURN y la lista de hosts queda vacía", () => {
        const r = resumenIce({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }],
            fuente: "stun",
            ttl: 300,
        });
        expect(r.turn).toBe(false);
        expect(r.urls).toBe(2);
        expect(r.turnUrls).toBe(0);
        expect(r.hosts).toEqual([]);
    });

    it("un TURN sin credenciales no cuenta como TURN", () => {
        const r = resumenIce({ iceServers: [{ urls: "turn:turn.ejemplo.org:3478" }] });
        expect(r.turn).toBe(false);
        expect(r.turnUrls).toBe(0);
    });

    it("vacía y con error: sin TURN, sin lanzar", () => {
        for (const crudo of [{}, { iceServers: [] }, [], { error: "Solo para las llamadas de este OS." }, null, undefined]) {
            expect(resumenIce(crudo)).toEqual({ turn: false, urls: 0, turnUrls: 0, hosts: [] });
        }
    });

    it("acepta también la forma de proveedor crudo (array, objeto suelto y campo url)", () => {
        const r = resumenIce([{ url: "turns:relay.ejemplo.org:443", username: "u", credential: "c" }]);
        expect(r.turn).toBe(true);
        expect(r.turnUrls).toBe(1);
        expect(r.hosts).toEqual(["turns:relay.ejemplo.org"]);
    });

    it("la línea impresa tiene el formato acordado", () => {
        expect(lineaResumenIce(resumenIce(CON_TURN))).toBe("turn=si urls=4 turns=2");
        expect(lineaResumenIce(resumenIce({}))).toBe("turn=no urls=0 turns=0");
    });
});

describe("esquemaYHost", () => {
    it("deja solo esquema y host: sin puerto, consulta ni credenciales", () => {
        expect(esquemaYHost("turn:turn.ejemplo.org:3478?transport=udp")).toBe("turn:turn.ejemplo.org");
        expect(esquemaYHost("turns:relays.ejemplo.org:5349")).toBe("turns:relays.ejemplo.org");
        expect(esquemaYHost("stun:stun.l.google.com:19302")).toBe("stun:stun.l.google.com");
        expect(esquemaYHost("turn:[2001:db8::1]:3478")).toBe("turn:2001:db8::1");
        expect(esquemaYHost("http://mal.example.org")).toBeNull();
        expect(esquemaYHost("")).toBeNull();
    });
});

describe("ruta compartida", () => {
    it("ice-servidor exporta la ruta que comprueba el guion", () => {
        expect(RUTA_SERVIDOR_ICE).toBe("/api/llamadas/ice");
    });
});
