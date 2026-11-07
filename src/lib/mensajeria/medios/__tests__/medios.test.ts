import { describe, expect, it } from "vitest";
import {
    candidatosDesdeEnlaces,
    detalleVia,
    etiquetaVia,
    medioDeEnlace,
    mediosParaEnviar,
    nombreDeVia,
    normalizarPreferencias,
    resumenPreferencias,
    viaServidor,
} from "../medios";
import type { CandidatoMedio, PreferenciasMedio } from "../tipos";

const auto: PreferenciasMedio = { modo: "auto", elegidos: [], siNinguno: "esperar" };

function cand(p: Partial<CandidatoMedio> & Pick<CandidatoMedio, "enlaceId" | "medio">): CandidatoMedio {
    return { etiqueta: p.enlaceId, abierto: true, llega: true, rttMs: null, ruta: null, ...p };
}

describe("medioDeEnlace", () => {
    it("traduce cada enlace real a su medio según la ruta medida", () => {
        expect(medioDeEnlace({ tipo: "local" })).toBe("local");
        expect(medioDeEnlace({ tipo: "cuenta", ruta: "misma-red-local" })).toBe("wifi-local");
        expect(medioDeEnlace({ tipo: "par", ruta: "reenviado-turn" })).toBe("turn");
        expect(medioDeEnlace({ tipo: "cuenta", ruta: "internet-directo" })).toBe("p2p-internet");
        expect(medioDeEnlace({ tipo: "cuenta", ruta: null })).toBe("p2p-internet");
        expect(medioDeEnlace({ tipo: "rele" })).toBe("rele");
        expect(medioDeEnlace({ tipo: "lora" })).toBe("lora");
        expect(medioDeEnlace({ tipo: "desconocido" })).toBeNull();
    });
});

describe("candidatosDesdeEnlaces", () => {
    it("usa el predicado de alcance, quita duplicados y los que no llevan mensajes", () => {
        const c = candidatosDesdeEnlaces(
            [
                { id: "local:a", tipo: "local", etiqueta: "Tablet", abierto: true, rttMs: 9 },
                { id: "local:a", tipo: "local", etiqueta: "Tablet (dup)", abierto: true },
                { id: "cuenta:b", tipo: "cuenta", etiqueta: "Mac", abierto: true, ruta: "misma-red-local", rttMs: Number.NaN },
                { id: "x", tipo: "cuenta", etiqueta: "Sin mensajes", abierto: true, admite: { mensaje: false } },
                { id: "rele", tipo: "rele", etiqueta: "Relé", abierto: true },
            ],
            (e) => e.id !== "rele",
            () => "sin identidad del destinatario para el relé",
        );
        expect(c.map((x) => x.enlaceId)).toEqual(["local:a", "cuenta:b", "rele"]);
        expect(c[0]).toMatchObject({ medio: "local", rttMs: 9, llega: true });
        expect(c[1]).toMatchObject({ medio: "wifi-local", rttMs: null });
        expect(c[2]).toMatchObject({ llega: false, motivoNoLlega: "sin identidad del destinatario para el relé" });
    });
});

describe("mediosParaEnviar", () => {
    const enlaces = [
        cand({ enlaceId: "servidor", medio: "servidor" }),
        cand({ enlaceId: "cuenta:lejos", medio: "p2p-internet", ruta: "internet-directo", rttMs: 80 }),
        cand({ enlaceId: "cuenta:wifi2", medio: "wifi-local", rttMs: 30 }),
        cand({ enlaceId: "cuenta:wifi1", medio: "wifi-local", rttMs: 12 }),
        cand({ enlaceId: "local:x", medio: "local", abierto: false }),
        cand({ enlaceId: "rele", medio: "rele", llega: false, motivoNoLlega: "sin identidad" }),
    ];

    it("automático en neuronas: lo más directo primero y, dentro del medio, la menor latencia medida", () => {
        const plan = mediosParaEnviar(auto, enlaces, { tipo: "neurona" });
        expect(plan.pasos.map((p) => p.enlaceId)).toEqual(["cuenta:wifi1", "cuenta:wifi2", "cuenta:lejos", "servidor"]);
        expect(plan.sinCamino).toBe(false);
        expect(plan.descartados).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ enlaceId: "local:x", motivo: "no está disponible ahora" }),
                expect.objectContaining({ enlaceId: "rele", motivo: "sin identidad" }),
            ]),
        );
    });

    it("automático en chats: el servidor primero (guarda el historial compartido)", () => {
        const plan = mediosParaEnviar(auto, enlaces, { tipo: "dm" });
        expect(plan.pasos[0].medio).toBe("servidor");
        // El relé no lo usa un chat 1:1 (aún): descartado con motivo.
        expect(plan.descartados.find((d) => d.enlaceId === "rele")?.motivo).toBe("este tipo de chat no lo usa");
    });

    it("solo métodos elegidos: respeta el orden de la persona y descarta el resto con motivo", () => {
        const plan = mediosParaEnviar({ modo: "elegidos", elegidos: ["servidor", "wifi-local"], siNinguno: "avisar" }, enlaces, { tipo: "neurona" });
        expect(plan.pasos.map((p) => p.enlaceId)).toEqual(["servidor", "cuenta:wifi1", "cuenta:wifi2"]);
        expect(plan.descartados.find((d) => d.enlaceId === "cuenta:lejos")?.motivo).toBe("no está entre tus medios elegidos");
    });

    it("sin camino: esperar y reintentar o avisar, con frase honesta", () => {
        const soloLora: PreferenciasMedio = { modo: "elegidos", elegidos: ["lora", "bluetooth"], siNinguno: "esperar" };
        const plan = mediosParaEnviar(soloLora, enlaces, { tipo: "neurona" });
        expect(plan.sinCamino).toBe(true);
        expect(plan.pasos).toEqual([]);
        expect(plan.aviso).toMatch(/en espera/);
        expect(plan.descartados).toEqual(
            expect.arrayContaining([
                { medio: "lora", motivo: "no hay ningún enlace de este tipo ahora" },
                { medio: "bluetooth", motivo: "no hay ningún enlace de este tipo ahora" },
            ]),
        );
        const avisar = mediosParaEnviar({ ...soloLora, siNinguno: "avisar" }, [], { tipo: "neurona" });
        expect(avisar.siNinguno).toBe("avisar");
        expect(avisar.aviso).toBe("Ninguno de tus medios elegidos está disponible ahora.");
    });

    it("un medio que el tipo de chat no admite se descarta aunque se elija", () => {
        const plan = mediosParaEnviar({ modo: "elegidos", elegidos: ["correo", "servidor"], siNinguno: "avisar" }, enlaces, { tipo: "dm" });
        expect(plan.pasos.map((p) => p.medio)).toEqual(["servidor"]);
        expect(plan.descartados).toContainEqual({ medio: "correo", motivo: "este tipo de chat no lo usa" });
    });

    it("si ninguno de los elegidos sirve para ese tipo de chat (ajustes generales), va en automático", () => {
        const plan = mediosParaEnviar({ modo: "elegidos", elegidos: ["lora", "rele"], siNinguno: "avisar" }, enlaces, { tipo: "dm" });
        expect(plan.modo).toBe("auto");
        expect(plan.nota).toMatch(/automático/);
        expect(plan.pasos[0].medio).toBe("servidor");
        expect(plan.sinCamino).toBe(false);
    });

    it("es determinista y no muta la entrada", () => {
        const copia = JSON.parse(JSON.stringify(enlaces));
        const a = mediosParaEnviar(auto, enlaces, { tipo: "neurona" });
        const b = mediosParaEnviar(auto, [...enlaces].reverse(), { tipo: "neurona" });
        expect(a.pasos).toEqual(b.pasos);
        expect(enlaces).toEqual(copia);
    });
});

describe("normalizarPreferencias", () => {
    it("limpia medios desconocidos y repetidos; «elegidos» vacío vuelve a automático", () => {
        expect(normalizarPreferencias({ modo: "elegidos", elegidos: ["lora", "x", "lora", "servidor"], siNinguno: "avisar" })).toEqual({
            modo: "elegidos",
            elegidos: ["lora", "servidor"],
            siNinguno: "avisar",
        });
        expect(normalizarPreferencias({ modo: "elegidos", elegidos: [] })).toEqual({ modo: "auto", elegidos: [], siNinguno: "esperar" });
        expect(normalizarPreferencias(null).modo).toBe("auto");
    });

    it("resume las preferencias para la interfaz", () => {
        expect(resumenPreferencias(auto, "dm")).toBe("Automático");
        expect(resumenPreferencias({ modo: "elegidos", elegidos: ["wifi-local", "lora"], siNinguno: "esperar" }, "neurona")).toBe("Solo: Wi-Fi local, LoRa");
    });
});

describe("etiquetaVia y detalleVia", () => {
    it("pastilla con lo medido y el visto de confirmado", () => {
        expect(etiquetaVia({ medio: "wifi-local", direccion: "sale", latenciaMs: 12.4, confirmado: true })).toBe("Mesh · Wi-Fi local · 12 ms ✓");
        expect(etiquetaVia({ medio: "lora", direccion: "sale", confirmado: false })).toBe("LoRa");
        expect(etiquetaVia({ medio: "rele", direccion: "sale", confirmado: false })).toBe("Relé cifrado");
        expect(etiquetaVia({ medio: "p2p-internet", direccion: "entra", ruta: null, confirmado: false })).toBe("P2P · ruta sin medir");
        expect(etiquetaVia(viaServidor("entra"))).toBe("Servidor StarSeed");
    });

    it("nunca inventa medidas: sin latencia dice «Sin medir»", () => {
        const d = detalleVia({ medio: "local", direccion: "sale", confirmado: false, enlace: "Tablet" });
        expect(d.find((l) => l.etiqueta === "Latencia")?.valor).toBe("Sin medir");
        expect(d.find((l) => l.etiqueta === "Ruta medida")?.valor).toBe("Sin medir");
        expect(d.find((l) => l.etiqueta === "Entrega")?.valor).toBe("Enviado, sin acuse de recibo");
    });

    it("servidor: guardado por el servidor y latencia de su respuesta", () => {
        const v = viaServidor("sale", 84);
        expect(etiquetaVia(v)).toBe("Servidor StarSeed · 84 ms");
        // Con acuse de la neurona por el canal de la cuenta sí lleva visto.
        expect(etiquetaVia({ medio: "servidor", direccion: "sale", confirmado: true, confirmadoPor: "destino", latenciaMs: 120 })).toBe("Servidor StarSeed · 120 ms ✓");
        const d = detalleVia(v);
        expect(d.find((l) => l.etiqueta === "Entrega")?.valor).toBe("El servidor lo guardó");
        expect(d.find((l) => l.etiqueta === "Latencia")?.valor).toBe("84 ms (hasta que el servidor lo guardó)");
        expect(d.find((l) => l.etiqueta === "Servidor")?.valor).toBe("Supabase en tiempo real");
    });
});

describe("red local de la app nativa (MLT1107A) — la pastilla lo dice", () => {
    it("el canal TCP nativo es un medio «sin internet» y su paso lo explica", () => {
        expect(medioDeEnlace({ tipo: "nativo", ruta: "misma-red-local" })).toBe("local");
        const plan = mediosParaEnviar(auto, [cand({ enlaceId: "nativo:192.168.1.20", medio: "local", ruta: "misma-red-local", rttMs: 3 })], { tipo: "neurona" });
        expect(plan.pasos[0]).toMatchObject({ enlaceId: "nativo:192.168.1.20", medio: "local", motivo: "red local de la app nativa (neurona vinculada, sin internet)" });
    });

    it("«Mesh · Red local (app nativa)» por el TCP y por el WebRTC que abrieron solas las apps; el QR sigue «Sin internet»", () => {
        const tcp = { medio: "local" as const, direccion: "sale" as const, enlaceId: "nativo:192.168.1.20", latenciaMs: 3, latenciaFuente: "acuse" as const, confirmado: true, confirmadoPor: "destino" as const, ruta: "misma-red-local" };
        expect(etiquetaVia(tcp)).toBe("Mesh · Red local (app nativa) · 3 ms ✓");
        expect(etiquetaVia({ ...tcp, enlaceId: "local:nativo-abc123" })).toBe("Mesh · Red local (app nativa) · 3 ms ✓");
        expect(etiquetaVia({ ...tcp, enlaceId: "local:abc123" })).toBe("Mesh · Sin internet · 3 ms ✓");
        expect(nombreDeVia(tcp)).toBe("Red local (app nativa)");
        expect(nombreDeVia({ medio: "local", enlaceId: "local:abc123" })).toBe("Enlace directo sin internet");
        const d = detalleVia({ ...tcp, direccion: "entra", enlace: "Tablet · red local", confirmado: false, confirmadoPor: null });
        expect(d.find((l) => l.etiqueta === "Medio")?.valor).toBe("Red local (app nativa)");
        expect(d.find((l) => l.etiqueta === "Ruta medida")?.valor).toBe("Misma red local");
        expect(d.find((l) => l.etiqueta === "Llegó desde")?.valor).toBe("Tablet · red local");
    });
});
