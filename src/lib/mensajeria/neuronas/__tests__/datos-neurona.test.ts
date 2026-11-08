import { describe, expect, it } from "vitest";

/*
 * Datos de cualquier formato con una neurona (NEU1107A): qué medio lleva qué, por dónde sale un
 * archivo o un flujo, cómo se llama, límites de tamaño, lo que se acepta de la red, estados de
 * transferencia y de llamada, y la bandeja tras recargar. Todo PURO y determinista.
 */

import {
    AVISO_LIMITES_MEDIOS,
    avanzarRegistroLlamada,
    cabeArchivo,
    candidatosDatosDesdeEnlaces,
    confirmacionesArchivo,
    duracionLegible,
    enlaceForzadoParaArchivo,
    esMedioP2P,
    MAX_BLUETOOTH_BYTES,
    rutaDeArchivo,
    faseDesdeMotor,
    faseTrasRecarga,
    leerAdjunto,
    leerFlujoRef,
    leerLlamada,
    limiteArchivo,
    LLEVA,
    MAX_P2P_BYTES,
    MAX_SERVIDOR_BYTES,
    motivoNoLleva,
    nombreArchivoSeguro,
    planLlamada,
    planParaDatos,
    porcentajeTransferencia,
    registroTrasRecarga,
    tamanoLegible,
    textoFaseArchivo,
    textoLlamada,
    textoRegistroLlamada,
    tipoSeguroPara,
    urlAdjuntoSegura,
    viaDeEnlaces,
    vistaPrevia,
    type CandidatoDato,
    type RegistroLlamada,
} from "@/lib/mensajeria/neuronas/datos-neurona";
import { anadirMensaje, BANDEJA_VACIA, leerBandeja, leerCuerpoNeurona, type MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";
import type { PreferenciasMedio } from "@/lib/mensajeria/medios/tipos";

const AUTO: PreferenciasMedio = { modo: "auto", elegidos: [], siNinguno: "esperar" };
const elegidos = (...m: PreferenciasMedio["elegidos"]): PreferenciasMedio => ({ modo: "elegidos", elegidos: m, siNinguno: "esperar" });

const local: CandidatoDato = { enlaceId: "local:t", medio: "local", etiqueta: "Tablet (sin internet)", abierto: true, llega: true, rttMs: 4, ruta: null };
const wifi: CandidatoDato = { enlaceId: "cuenta:t", medio: "wifi-local", etiqueta: "Tablet", abierto: true, llega: true, rttMs: 9, ruta: "misma-red-local" };
const rele: CandidatoDato = { enlaceId: "rele", medio: "rele", etiqueta: "Relé cifrado", abierto: true, llega: true, rttMs: null, ruta: null };
const lora: CandidatoDato = { enlaceId: "lora", medio: "lora", etiqueta: "Radio LoRa", abierto: true, llega: true, rttMs: null, ruta: null };
const servidor = { abierto: true, llega: true, maxBytes: MAX_SERVIDOR_BYTES };

describe("qué lleva cada medio (y se dice el porqué)", () => {
    it("relé y LoRa no llevan archivos ni flujos; el enlace local lo lleva todo", () => {
        for (const clase of ["mensaje", "archivo", "llamada", "flujo"] as const) expect(LLEVA.local[clase]).toBe(true);
        expect(motivoNoLleva("rele", "archivo")).toMatch(/solo lleva mensajes/);
        expect(motivoNoLleva("lora", "archivo")).toMatch(/LoRa solo lleva mensajes cortos/);
        expect(motivoNoLleva("lora", "flujo")).toMatch(/ni voz, ni vídeo/);
        expect(motivoNoLleva("wifi-local", "archivo")).toBeNull();
        expect(AVISO_LIMITES_MEDIOS).toMatch(/LoRa/);
    });

    it("(BLE1108A) Bluetooth directo: mensajes y archivos (≤ 20 MB) sí; voz, vídeo y transmisiones no, con su porqué", () => {
        expect(LLEVA.bluetooth).toEqual({ mensaje: true, archivo: true, llamada: false, flujo: false });
        expect(motivoNoLleva("bluetooth", "archivo")).toBeNull();
        expect(motivoNoLleva("bluetooth", "mensaje")).toBeNull();
        expect(motivoNoLleva("bluetooth", "llamada")).toMatch(/no lleva voz, vídeo ni transmisiones/);
        expect(motivoNoLleva("bluetooth", "flujo")).toMatch(/solo mensajes y archivos \(≤ 20 MB\)/);
        expect(limiteArchivo("bluetooth")).toBe(MAX_BLUETOOTH_BYTES);
        expect(cabeArchivo("bluetooth", MAX_BLUETOOTH_BYTES)).toEqual({ cabe: true });
        expect(cabeArchivo("bluetooth", MAX_BLUETOOTH_BYTES + 1).cabe).toBe(false);
        expect(esMedioP2P("bluetooth")).toBe(true);
        expect(rutaDeArchivo({ enlaceId: "ble:b3", enlace: "Maggaboard · Bluetooth", medio: "bluetooth" })).toBe(
            "Bluetooth directo (app nativa, sin router) — hacia Maggaboard · Bluetooth",
        );
        expect(AVISO_LIMITES_MEDIOS).toMatch(/Bluetooth directo/);
    });

    it("límites por medio: 4 GB por la malla, 50 MB por el servidor, nada por relé ni LoRa", () => {
        expect(limiteArchivo("local")).toBe(MAX_P2P_BYTES);
        expect(limiteArchivo("servidor")).toBe(MAX_SERVIDOR_BYTES);
        expect(limiteArchivo("rele")).toBe(0);
        expect(cabeArchivo("servidor", MAX_SERVIDOR_BYTES + 1)).toEqual({ cabe: false, motivo: expect.stringMatching(/supera el tope de Servidor StarSeed \(50,0 MB\)/) });
        expect(cabeArchivo("lora", 10)).toEqual({ cabe: false, motivo: expect.stringMatching(/LoRa/) });
        expect(cabeArchivo("p2p-internet", 10)).toEqual({ cabe: true });
        expect(tamanoLegible(1536)).toBe("2 KB");
        expect(tamanoLegible(5 * 1024 * 1024)).toBe("5,0 MB");
    });
});

describe("planParaDatos — por dónde sale un archivo o un flujo", () => {
    it("automático: lo más directo primero; relé y LoRa descartados con su motivo, nunca «en espera» por ellos", () => {
        const plan = planParaDatos(AUTO, [rele, lora, wifi, local], { clase: "archivo", bytes: 1000, servidor });
        expect(plan.pasos.map((p) => p.medio)).toEqual(["local", "wifi-local", "servidor"]);
        const motivos = Object.fromEntries(plan.descartados.map((d) => [d.medio, d.motivo]));
        expect(motivos.rele).toMatch(/relé cifrado del servidor solo lleva mensajes/);
        expect(motivos.lora).toMatch(/LoRa solo lleva mensajes cortos/);
    });

    it("un archivo de más de 50 MB no va por el servidor (lo dice); uno de más de 4 GB, por ninguno", () => {
        const grande = planParaDatos(AUTO, [wifi], { clase: "archivo", bytes: MAX_SERVIDOR_BYTES + 1, servidor });
        expect(grande.pasos.map((p) => p.medio)).toEqual(["wifi-local"]);
        expect(grande.descartados.find((d) => d.medio === "servidor")?.motivo).toMatch(/supera el tope del almacenamiento de tu cuenta/);
        const enorme = planParaDatos(AUTO, [wifi, local], { clase: "archivo", bytes: MAX_P2P_BYTES + 1, servidor });
        expect(enorme.sinCamino).toBe(true);
        expect(enorme.descartados.find((d) => d.medio === "local")?.motivo).toMatch(/supera el tope de Sin internet/);
    });

    it("solo el servidor elegido y la neurona es de otra cuenta: sin camino, espera y lo dice", () => {
        const plan = planParaDatos(elegidos("servidor"), [wifi], {
            clase: "archivo",
            bytes: 10,
            servidor: { ...servidor, llega: false, motivoNoLlega: "el almacenamiento de tu cuenta solo comparte con tus propias neuronas" },
        });
        expect(plan.sinCamino).toBe(true);
        expect(plan.siNinguno).toBe("esperar");
        expect(plan.aviso).toMatch(/espera en esta pestaña/);
        expect(plan.descartados.find((d) => d.medio === "servidor")?.motivo).toMatch(/solo comparte con tus propias neuronas/);
        expect(plan.descartados.find((d) => d.medio === "wifi-local")?.motivo).toBe("no está entre tus medios elegidos");
    });

    it("un vínculo sin permiso de archivos se descarta; un flujo nunca espera", () => {
        const sinPermiso: CandidatoDato = { ...wifi, enlaceId: "par:v1", medio: "p2p-internet", admite: { archivo: false, flujo: true } };
        const plan = planParaDatos(AUTO, [sinPermiso], { clase: "archivo", bytes: 10, servidor: null });
        expect(plan.sinCamino).toBe(true);
        expect(plan.descartados[0].motivo).toBe("este enlace no tiene permiso para archivos");
        const flujo = planParaDatos(AUTO, [rele], { clase: "flujo" });
        expect(flujo).toMatchObject({ sinCamino: true, siNinguno: "avisar" });
        expect(flujo.aviso).toMatch(/una transmisión en vivo/);
    });

    it("multitrayecto solo si el chat permite todos los enlaces P2P al aparato", () => {
        const auto = planParaDatos(AUTO, [local, wifi], { clase: "archivo", bytes: 10 });
        expect(enlaceForzadoParaArchivo(auto, [local, wifi])).toBeNull();
        const soloLocal = planParaDatos(elegidos("local"), [local, wifi], { clase: "archivo", bytes: 10 });
        expect(enlaceForzadoParaArchivo(soloLocal, [local, wifi])).toBe("local:t");
        const porServidor = planParaDatos(elegidos("servidor"), [local], { clase: "archivo", bytes: 10, servidor });
        expect(enlaceForzadoParaArchivo(porServidor, [local])).toBeNull();
    });

    it("traduce los enlaces reales con lo que admite cada uno y quien no llega lo dice", () => {
        const c = candidatosDatosDesdeEnlaces(
            [
                { id: "local:1", tipo: "local", etiqueta: "Tablet", abierto: true, admite: { archivo: true } },
                { id: "cuenta:x", tipo: "cuenta", etiqueta: "Otro", abierto: true, ruta: "reenviado-turn" },
                { id: "raro", tipo: "otro", etiqueta: "?", abierto: true },
            ],
            (e) => e.id !== "cuenta:x",
            () => "ese enlace va a otro aparato",
        );
        expect(c.map((x) => [x.enlaceId, x.medio, x.llega])).toEqual([
            ["local:1", "local", true],
            ["cuenta:x", "turn", false],
        ]);
        expect(c[1].motivoNoLlega).toBe("ese enlace va a otro aparato");
    });
});

describe("planLlamada — cómo se llama a una neurona", () => {
    const base = { preferencias: AUTO, enlaceLocal: null, internet: true, sesion: true };

    it("con enlace sin internet, llamada directa sin servidores; si no, el sistema de llamadas", () => {
        expect(planLlamada({ ...base, enlaceLocal: { id: "local:t", etiqueta: "Tablet" } })).toMatchObject({ via: "enlace-local", enlaceId: "local:t" });
        const sistema = planLlamada(base);
        expect(sistema.via).toBe("sistema-llamadas");
        expect(sistema.descartados[0].motivo).toMatch(/Vincular sin internet/);
    });

    it("sin internet, sin sesión o con medios que no llevan voz: no hay llamada y se dice por qué", () => {
        expect(planLlamada({ ...base, internet: false })).toMatchObject({ via: null, aviso: expect.stringMatching(/No hay cómo llamar/) });
        expect(planLlamada({ ...base, sesion: false }).descartados.at(-1)?.motivo).toMatch(/inicia sesión/);
        const soloLora = planLlamada({ ...base, preferencias: elegidos("lora", "rele"), enlaceLocal: { id: "local:t", etiqueta: "Tablet" } });
        expect(soloLora.via).toBeNull();
        expect(soloLora.descartados.map((d) => d.medio)).toEqual(expect.arrayContaining(["lora", "rele", "local", "servidor"]));
        expect(soloLora.descartados.find((d) => d.medio === "local")?.motivo).toBe("no está entre tus medios elegidos");
    });
});

describe("lo que llega de otro aparato se valida y se enseña sin ejecutar nada", () => {
    it("vista previa por tipo o extensión; el HTML se enseña como texto plano", () => {
        expect(vistaPrevia("image/png")).toBe("imagen");
        expect(vistaPrevia("", "nota.MD")).toBe("texto");
        expect(vistaPrevia("application/x-msdownload", "setup.exe")).toBe("descarga");
        expect(vistaPrevia("text/html")).toBe("texto");
        expect(tipoSeguroPara("texto", "text/html")).toBe("text/plain;charset=utf-8");
        expect(tipoSeguroPara("imagen", "text/html")).toBe("image/png");
        expect(tipoSeguroPara("descarga", "application/x-msdownload")).toBe("application/octet-stream");
    });

    it("solo enlaces https, sin credenciales, y de los servidores permitidos si se dan", () => {
        expect(urlAdjuntoSegura("https://x.supabase.co/a.png")).toBe("https://x.supabase.co/a.png");
        expect(urlAdjuntoSegura("http://x/a")).toBeNull();
        expect(urlAdjuntoSegura("javascript:alert(1)")).toBeNull();
        expect(urlAdjuntoSegura("https://u:p@x/a")).toBeNull();
        expect(urlAdjuntoSegura("https://otro.com/a", ["x.supabase.co"])).toBeNull();
    });

    it("nombres sin rutas ni caracteres de control; adjuntos, llamadas y flujos mal formados fuera", () => {
        expect(nombreArchivoSeguro("../../etc/passwd")).toBe("passwd");
        expect(nombreArchivoSeguro("..\\a\u0007b.txt")).toBe("ab.txt");
        expect(nombreArchivoSeguro(".bashrc")).toBe("bashrc");
        expect(nombreArchivoSeguro(42)).toBe("archivo");
        expect(leerAdjunto({ id: "arch_1", nombre: "a.pdf", tipo: "Application/PDF", tamano: 10, modo: "p2p" })).toEqual({
            id: "arch_1", nombre: "a.pdf", tipo: "application/pdf", tamano: 10, modo: "p2p",
        });
        expect(leerAdjunto({ id: "s1", nombre: "a", tamano: 1, modo: "servidor", url: "http://x/a" })).toBeNull();
        expect(leerAdjunto({ id: "s1", nombre: "a", tamano: 1, modo: "servidor", url: "https://x/a", sha256: "no" })).not.toHaveProperty("sha256");
        expect(leerAdjunto({ id: "s1", nombre: "a", tamano: 1, modo: "servidor", url: "https://x/a", sha256: "a".repeat(64) })?.sha256).toBe("a".repeat(64));
        expect(leerAdjunto({ id: "x", tamano: MAX_P2P_BYTES + 1, modo: "p2p" })).toBeNull();
        expect(leerLlamada({ tipo: "video", via: "sistema-llamadas" })).toBeNull();
        expect(leerLlamada({ tipo: "audio", via: "enlace-local", pantalla: true })).toEqual({ tipo: "audio", via: "enlace-local", pantalla: true });
        expect(leerFlujoRef({ id: "f", formato: "exe" })).toBeNull();
        expect(textoLlamada({ tipo: "video", via: "enlace-local", pantalla: true }, "sale")).toBe("Pantalla compartida saliente · sin internet");
    });

    it("un mensaje de neurona puede ir sin texto si lleva un archivo, una llamada o un flujo", () => {
        const de = { n: "tab", nom: "Tablet" };
        expect(leerCuerpoNeurona({ mid: "m1", txt: "", de, adj: { id: "arch_1", nombre: "a", tamano: 1, modo: "p2p" } })?.adj?.id).toBe("arch_1");
        expect(leerCuerpoNeurona({ mid: "m2", txt: "", de })).toBeNull();
        expect(leerCuerpoNeurona({ mid: "m3", txt: "", de, adj: { id: "x", modo: "raro" } })).toBeNull();
    });
});

describe("estados de una transferencia", () => {
    it("traduce las fases del motor y lo que estaba a medias queda «interrumpido» al recargar", () => {
        expect(faseDesdeMotor("pendiente-aceptar")).toBe("por-aceptar");
        expect(faseDesdeMotor("completada")).toBe("verificado");
        expect(faseDesdeMotor("error")).toBe("error");
        expect(faseTrasRecarga("transfiriendo")).toBe("interrumpido");
        expect(faseTrasRecarga("verificado")).toBe("verificado");
        expect(faseTrasRecarga(undefined)).toBeUndefined();
    });

    it("confirmaciones: enviado → recibido (aceptado y en camino) → verificado (SHA-256)", () => {
        expect(confirmacionesArchivo("preparando", "sale")).toEqual({ enviado: false, recibido: false, verificado: false });
        expect(confirmacionesArchivo("ofrecido", "sale")).toEqual({ enviado: true, recibido: false, verificado: false });
        expect(confirmacionesArchivo("transfiriendo", "sale")).toEqual({ enviado: true, recibido: true, verificado: false });
        expect(confirmacionesArchivo("verificado", "sale")).toEqual({ enviado: true, recibido: true, verificado: true });
        expect(confirmacionesArchivo("por-aceptar", "entra")).toEqual({ enviado: true, recibido: false, verificado: false });
        expect(confirmacionesArchivo("verificado", "entra").verificado).toBe(true);
    });

    it("textos y porcentaje", () => {
        expect(textoFaseArchivo("transfiriendo", "sale", 42.4)).toBe("Enviando · 42 %");
        expect(textoFaseArchivo("transfiriendo", "entra", null)).toBe("Recibiendo");
        expect(textoFaseArchivo("interrumpido", "sale")).toMatch(/Reanuda desde donde quedó/i);
        expect(textoFaseArchivo("verificado", "entra")).toBe("Verificado (SHA-256)");
        expect(porcentajeTransferencia(5, 10)).toBe(50);
        expect(porcentajeTransferencia(3, 0)).toBeNull();
    });

    it("la vía de un archivo dice si fue por varios enlaces y no inventa latencias", () => {
        const via = viaDeEnlaces(
            [
                { id: "local:t", tipo: "local", etiqueta: "Tablet", rttMs: null },
                { id: "cuenta:t", tipo: "cuenta", etiqueta: "Tablet (cuenta)", ruta: "misma-red-local", rttMs: 8 },
            ],
            { clase: "archivo", en: 1 },
        );
        expect(via).toMatchObject({ medio: "local", enlace: "Tablet + Tablet (cuenta)", latenciaMs: null, latenciaFuente: null, confirmado: false });
        expect(via?.motivo).toMatch(/2 enlaces .*multitrayecto/);
        expect(viaDeEnlaces([], { clase: "flujo", en: 1 })).toBeNull();
    });
});

describe("registro de una llamada", () => {
    const sonando: RegistroLlamada = { fase: "sonando" };

    it("sonando → en curso → terminada, con su duración", () => {
        const enCurso = avanzarRegistroLlamada(sonando, { t: "contestada", en: 1000 });
        const fin = avanzarRegistroLlamada(enCurso, { t: "colgada", en: 1000 + 192_000 });
        expect(fin).toEqual({ fase: "terminada", inicio: 1000, fin: 193_000 });
        expect(textoRegistroLlamada(fin, "sale")).toBe("Duró 3:12");
        // Una llamada acabada no retrocede.
        expect(avanzarRegistroLlamada(fin, { t: "contestada", en: 5 })).toBe(fin);
    });

    it("sin contestar, rechazada o fallida", () => {
        expect(avanzarRegistroLlamada(sonando, { t: "colgada", en: 9 }).fase).toBe("perdida");
        expect(avanzarRegistroLlamada(sonando, { t: "sin-respuesta", en: 9 })).toMatchObject({ fase: "perdida", motivo: "nadie contestó" });
        expect(avanzarRegistroLlamada(sonando, { t: "rechazada", en: 9, motivo: "ocupado" })).toMatchObject({ fase: "rechazada", motivo: "ocupado" });
        expect(avanzarRegistroLlamada(sonando, { t: "fallo", en: 9, motivo: "sin TURN" })).toMatchObject({ fase: "fallida", motivo: "sin TURN" });
        expect(textoRegistroLlamada({ fase: "perdida" }, "entra")).toBe("Sin contestar");
        expect(textoRegistroLlamada(undefined, "sale")).toBe("Llamando…");
    });

    it("tras recargar, lo que sonaba o seguía se cierra", () => {
        expect(registroTrasRecarga({ fase: "sonando" })?.fase).toBe("perdida");
        expect(registroTrasRecarga({ fase: "en-curso", inicio: 1 })?.fase).toBe("terminada");
        expect(duracionLegible(3_723_000)).toBe("1:02:03");
        expect(duracionLegible(-1)).toBe("0:00");
    });
});

describe("bandeja: archivos, llamadas y recargas", () => {
    const mensaje = (p: Partial<MensajeMalla>): MensajeMalla => ({ id: "m1", clave: "n:tab", dir: "sale", texto: "", at: 1, estado: "confirmado", ...p });

    it("al recargar, la transferencia a medias queda interrumpida, la llamada se cierra y lo urgente que salía falla", () => {
        const guardado = {
            v: 1,
            conv: {
                "n:tab": {
                    leidoHasta: 0,
                    mensajes: [
                        mensaje({ id: "a", archivo: { fase: "transfiriendo", porcentaje: 40 } }),
                        mensaje({ id: "b", registroLlamada: { fase: "en-curso", inicio: 1 } }),
                        mensaje({ id: "c", estado: "enviando", urgente: true }),
                        mensaje({ id: "d", estado: "enviando" }),
                    ],
                },
            },
            vias: {},
        };
        const ms = leerBandeja(JSON.stringify(guardado)).conv["n:tab"].mensajes;
        expect(ms.find((m) => m.id === "a")?.archivo).toEqual({ fase: "interrumpido", porcentaje: 40 });
        expect(ms.find((m) => m.id === "b")?.registroLlamada?.fase).toBe("terminada");
        expect(ms.find((m) => m.id === "c")?.estado).toBe("fallido");
        expect(ms.find((m) => m.id === "d")?.estado).toBe("en-espera");
    });

    it("un duplicado entrante no pisa al primero, salvo que traiga el archivo por otro medio", () => {
        const p2p = mensaje({ dir: "entra", estado: "recibido", adjunto: { id: "arch_1", nombre: "a", tipo: "x", tamano: 1, modo: "p2p" }, archivo: { fase: "interrumpido" } });
        const e1 = anadirMensaje(BANDEJA_VACIA, p2p);
        expect(anadirMensaje(e1, { ...p2p, texto: "otro" })).toBe(e1);
        const servidorMsg = { ...p2p, adjunto: { ...p2p.adjunto!, modo: "servidor" as const, url: "https://x/a" }, archivo: undefined };
        const e2 = anadirMensaje(e1, servidorMsg);
        const m = e2.conv["n:tab"].mensajes[0];
        expect(m.adjunto?.modo).toBe("servidor");
        expect(m.archivo).toBeUndefined();
    });
});
