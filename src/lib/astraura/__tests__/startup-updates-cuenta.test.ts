// @vitest-environment jsdom
/**
 * «Sistemas de Astraura en esta neurona» con la cuenta (2026-09-29, persistencia entre medios).
 *
 * Alex: «hay ventanas que reaparecen de las configuraciones de las neuronas al reiniciar, como
 * la de configuración de sistemas de Astraura». Aquí se prueba la decisión de arranque
 * (`decidirArranque`) sobre lo que hay guardado, sin React:
 *  · un medio nuevo hereda de la cuenta y NO abre la ventana grande;
 *  · lo que un medio antiguo tenía «visto» en local se respeta y se copia a la cuenta;
 *  · «recordar luego» no se salta su hora, y viaja con la cuenta;
 *  · un cambio de catálogo es un AVISO pequeño, no la ventana; solo pide ventana lo que exige acción;
 *  · la voz cuenta como resuelta con overrides sincronizados o auto-actualización.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    AVISO_CATALOGO_PREFIJO,
    AVISO_SISTEMAS_INICIO,
    AVISO_SISTEMAS_LUEGO,
    STARTUP_UPDATES_KEY,
    catalogIds,
    catalogSignature,
    copiarEstadoLocalACuenta,
    decidirArranque,
    getStartupState,
    markUpdatesSeen,
    newModelIdsSince,
    pendingConfiguration,
    sellarCatalogoVisto,
    setStartupState,
    shouldShowUpdates,
    snoozeUpdates,
    updateReason,
    vozConfigurada,
} from "@/lib/astraura/startup-updates";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso, marcarAviso } from "@/lib/sync/avisos-cuenta";
import { NEURON_VOICE_LS_KEY, VOICE_SYSTEM_VERSION } from "@/lib/aurora/tts-oss/neuron-voice-constants";

const NEURONA = "neurona-de-prueba";
const PERSONA_KEY = "starseed.astraura.neuron-persona.v1";
const SIG = catalogSignature();
const HORA = 60 * 60 * 1000;

/** Lo que la cuenta entrega al bajar (avisos ya en localStorage, como tras el primer pull). */
function cuentaConAvisos(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number; hasta?: number }>): void {
    localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
    _reiniciarCacheAvisosParaPruebas();
}

function local(estado: Record<string, unknown>): void {
    localStorage.setItem(STARTUP_UPDATES_KEY, JSON.stringify(estado));
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed.neuron.device-id", NEURONA);
    _reiniciarCacheAvisosParaPruebas();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("medio nuevo, cuenta ya configurada", () => {
    it("sin nada en la cuenta ni en local: primera vez → ventana grande", () => {
        const d = decidirArranque();
        expect(d.accion).toBe("ventana");
        expect(d).toMatchObject({ motivo: "primera-vez" });
        expect(shouldShowUpdates()).toBe(true);
    });

    it("la cuenta ya tiene la primera configuración y la firma vista: NO se abre nada", () => {
        cuentaConAvisos({
            [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 },
            [AVISO_CATALOGO_PREFIJO + SIG]: { estado: "visto", ts: 6 },
        });
        const d = decidirArranque();
        expect(d).toEqual({ accion: "nada", motivo: "al-dia" });
        expect(shouldShowUpdates()).toBe(false);
        expect(getStartupState().firstRunDone).toBe(true);
        expect(getStartupState().lastSig).toBe(SIG);
    });

    it("primera configuración hecha pero firma distinta y ninguna foto local: se sella en silencio (sin ventana ni aviso)", () => {
        cuentaConAvisos({ [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 } });
        const d = decidirArranque();
        expect(d).toEqual({ accion: "nada", motivo: "al-dia", sellar: SIG });
        sellarCatalogoVisto(SIG);
        expect(estadoAviso(AVISO_CATALOGO_PREFIJO + SIG).estado).toBe("visto");
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "al-dia" });
    });
});

describe("compatibilidad con la clave local antigua", () => {
    it("un «visto» local antiguo se respeta y NO abre la ventana", () => {
        local({ firstRunDone: true, lastSig: SIG, lastCatalog: catalogIds() });
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "al-dia" });
    });

    it("copiarEstadoLocalACuenta pasa a la cuenta la primera vez, la firma y el «luego» vigente", () => {
        const hasta = Date.now() + 5 * HORA;
        local({ firstRunDone: true, lastSig: "firma-antigua", snoozeUntil: hasta });
        copiarEstadoLocalACuenta();
        expect(estadoAviso(AVISO_SISTEMAS_INICIO).estado).toBe("hecho");
        expect(estadoAviso(AVISO_CATALOGO_PREFIJO + "firma-antigua").estado).toBe("visto");
        const luego = estadoAviso(AVISO_SISTEMAS_LUEGO);
        expect(luego.estado).toBe("luego");
        expect(luego.hasta).toBe(hasta);
    });

    it("la copia es idempotente y no pisa un registro que la cuenta ya tenía", () => {
        cuentaConAvisos({ [AVISO_SISTEMAS_LUEGO]: { estado: "luego", ts: 50, hasta: 111 } });
        local({ firstRunDone: true, snoozeUntil: Date.now() + HORA });
        copiarEstadoLocalACuenta();
        copiarEstadoLocalACuenta();
        expect(estadoAviso(AVISO_SISTEMAS_LUEGO)).toMatchObject({ estado: "luego", ts: 50, hasta: 111 });
        expect(estadoAviso(AVISO_SISTEMAS_INICIO).estado).toBe("hecho");
    });

    it("un «luego» local aún sin copiar ya se respeta al decidir", () => {
        local({ firstRunDone: false, snoozeUntil: Date.now() + HORA });
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "pospuesto" });
    });
});

describe("«recordar luego»", () => {
    it("no vuelve a abrir antes de su hora, en cualquier medio (viaja con la cuenta)", () => {
        vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
        snoozeUpdates(3 * HORA);
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "pospuesto" });
        vi.setSystemTime(new Date("2026-09-29T12:59:00Z"));
        expect(decidirArranque().accion).toBe("nada");
        // El plazo está en la cuenta, no en la clave local.
        const guardado = JSON.parse(localStorage.getItem(AVISOS_KEY)!);
        expect(guardado.ids[AVISO_SISTEMAS_LUEGO].estado).toBe("luego");
        expect(JSON.parse(localStorage.getItem(STARTUP_UPDATES_KEY)!).snoozeUntil).toBe(0);
        // Llegada la hora, si sigue pendiente, vuelve.
        vi.setSystemTime(new Date("2026-09-29T13:00:01Z"));
        expect(decidirArranque().accion).toBe("ventana");
    });

    it("aplicar (markUpdatesSeen) levanta el «luego» y sella primera vez + firma en la cuenta", () => {
        snoozeUpdates(10 * HORA);
        markUpdatesSeen({ autoUpdate: true, strategy: "auto" });
        expect(getStartupState().snoozeUntil).toBe(0);
        expect(estadoAviso(AVISO_SISTEMAS_INICIO).estado).toBe("hecho");
        expect(estadoAviso(AVISO_CATALOGO_PREFIJO + SIG).estado).toBe("visto");
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "al-dia" });
    });

    it("un reinicio del «luego» en la cuenta levanta uno antiguo guardado en local", () => {
        local({ firstRunDone: true, snoozeUntil: Date.now() + 10 * HORA });
        cuentaConAvisos({ [AVISO_SISTEMAS_LUEGO]: { estado: "luego", ts: 99, hasta: 0 } });
        expect(getStartupState().snoozeUntil).toBe(0);
    });
});

describe("cambio de catálogo: aviso pequeño, no ventana", () => {
    function catalogoCambiado(): void {
        markUpdatesSeen(); // firstRunDone + foto completa
        // Simula «salió un modelo/fuente nuevo»: la foto local no lo tiene y la firma vista es otra.
        const foto = catalogIds().slice(1);
        localStorage.removeItem(AVISOS_KEY);
        _reiniciarCacheAvisosParaPruebas();
        cuentaConAvisos({ [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 } });
        local({ firstRunDone: true, lastSig: "firma-vieja", lastCatalog: foto, autoUpdate: true, strategy: "auto" });
    }

    it("con novedades y nada que exija acción: `aviso` con el recuento, jamás `ventana`", () => {
        catalogoCambiado();
        const d = decidirArranque();
        expect(d.accion).toBe("aviso");
        if (d.accion === "aviso") {
            expect(d.modelos + d.fuentes).toBe(1);
            expect(d.firma).toBe(SIG);
        }
        expect(shouldShowUpdates()).toBe(false);
        expect(updateReason()).toBe("novedades");
    });

    it("sellar tras el aviso evita repetirlo (en este y en otros medios), pero «Ver» sigue enseñando lo nuevo", () => {
        catalogoCambiado();
        sellarCatalogoVisto(SIG);
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "al-dia" });
        expect(newModelIdsSince().length + (updateReason() === "novedades" ? 1 : 0)).toBeGreaterThan(0);
    });

    it("si además queda algo que de verdad pide acción, sí es ventana", () => {
        catalogoCambiado();
        local({ firstRunDone: true, lastSig: "firma-vieja", lastCatalog: catalogIds().slice(1), autoUpdate: false });
        const d = decidirArranque();
        expect(d.accion).toBe("ventana");
        expect(d).toMatchObject({ motivo: "pendiente" });
    });

    it("una firma más antigua ya vista no molesta aunque otra build use otra firma", () => {
        cuentaConAvisos({
            [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 },
            [AVISO_CATALOGO_PREFIJO + "otra-build"]: { estado: "visto", ts: 6 },
            [AVISO_CATALOGO_PREFIJO + SIG]: { estado: "visto", ts: 7 },
        });
        expect(decidirArranque()).toEqual({ accion: "nada", motivo: "al-dia" });
    });
});

describe("la vía de voz", () => {
    beforeEach(() => {
        cuentaConAvisos({
            [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 },
            [AVISO_CATALOGO_PREFIJO + SIG]: { estado: "visto", ts: 6 },
        });
    });

    it("por defecto (auto-actualización ON) la voz cuenta como resuelta: nada que reabrir", () => {
        expect(vozConfigurada()).toBe(true);
        expect(pendingConfiguration()).toEqual([]);
        expect(decidirArranque().accion).toBe("nada");
    });

    it("con la auto-actualización apagada y ninguna decisión, la voz SÍ pide acción", () => {
        setStartupState({ autoUpdate: false });
        expect(vozConfigurada()).toBe(false);
        expect(pendingConfiguration().map((p) => p.sistema)).toEqual(["voz"]);
        const d = decidirArranque();
        expect(d).toMatchObject({ accion: "ventana", motivo: "pendiente" });
    });

    it("overrides SINCRONIZADOS de esta neurona con un modo de voz la dan por resuelta", () => {
        setStartupState({ autoUpdate: false });
        localStorage.setItem(PERSONA_KEY, JSON.stringify({ [NEURONA]: { "*": { voz: { modo: "cloud" } } } }));
        expect(vozConfigurada()).toBe(true);
        expect(decidirArranque().accion).toBe("nada");
    });

    it("overrides de OTRA neurona no cuentan para esta", () => {
        setStartupState({ autoUpdate: false });
        localStorage.setItem(PERSONA_KEY, JSON.stringify({ "otra-neurona": { "*": { voz: { modo: "cloud" } } } }));
        expect(vozConfigurada()).toBe(false);
    });

    it("un override sin modo de voz (solo motor) no basta", () => {
        setStartupState({ autoUpdate: false });
        localStorage.setItem(PERSONA_KEY, JSON.stringify({ [NEURONA]: { aurora: { voz: { motor: "kokoro" }, llm: { fuente: "x" } } } }));
        expect(vozConfigurada()).toBe(false);
    });

    it("la elección local válida y de la versión actual sigue valiendo", () => {
        setStartupState({ autoUpdate: false });
        localStorage.setItem(NEURON_VOICE_LS_KEY, JSON.stringify({ mode: "local", at: 1, sysV: VOICE_SYSTEM_VERSION }));
        expect(vozConfigurada()).toBe(true);
        localStorage.setItem(NEURON_VOICE_LS_KEY, JSON.stringify({ mode: "later", at: 1, sysV: VOICE_SYSTEM_VERSION }));
        expect(vozConfigurada()).toBe(false);
    });

    it("datos corruptos nunca lanzan: se degrada a «no definida»", () => {
        setStartupState({ autoUpdate: false });
        localStorage.setItem(PERSONA_KEY, "{no es json");
        expect(() => vozConfigurada()).not.toThrow();
        expect(vozConfigurada()).toBe(false);
    });
});

describe("estado efectivo", () => {
    it("las preferencias de esta neurona (auto-actualización, estrategia) siguen siendo locales", () => {
        setStartupState({ autoUpdate: false, strategy: "local" });
        const crudo = JSON.parse(localStorage.getItem(STARTUP_UPDATES_KEY)!);
        expect(crudo.autoUpdate).toBe(false);
        expect(crudo.strategy).toBe("local");
        expect(getStartupState().strategy).toBe("local");
    });

    it("marcarAviso directo de la cuenta se ve en el estado sin pasar por la clave local", () => {
        marcarAviso(AVISO_SISTEMAS_INICIO, "hecho");
        expect(getStartupState().firstRunDone).toBe(true);
        expect(localStorage.getItem(STARTUP_UPDATES_KEY)).toBeNull();
    });
});
