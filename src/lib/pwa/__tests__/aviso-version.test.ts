import { describe, expect, it, vi } from "vitest";

import {
    TEMA_VERSION,
    URL_SSE_VERSION,
    puedeRecargarSuave,
    suscribirseAvisoVersion,
    type EventSourceMinimo,
} from "@/lib/pwa/aviso-version";

class EventSourceFalso implements EventSourceMinimo {
    static ultimas: EventSourceFalso[] = [];
    onmessage: ((ev: { data: string }) => void) | null = null;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    url: string;
    cerrado = false;
    constructor(url: string) {
        this.url = url;
        EventSourceFalso.ultimas.push(this);
    }
    close() { this.cerrado = true; }
    emite(data: string) { this.onmessage?.({ data }); }
}

function banco() {
    EventSourceFalso.ultimas = [];
    let visible = true;
    const oyentes: Array<() => void> = [];
    return {
        crearEventSource: (url: string) => new EventSourceFalso(url),
        ponVisible: (v: boolean) => { visible = v; oyentes.forEach((o) => o()); },
        esVisible: () => visible,
        escucharVisibilidad: (alCambiar: () => void) => {
            oyentes.push(alCambiar);
            return () => { const i = oyentes.indexOf(alCambiar); if (i >= 0) oyentes.splice(i, 1); };
        },
    };
}

describe("puedeRecargarSuave", () => {
    const docVacio = { activeElement: null, querySelector: () => null } as unknown as Document;
    it("sin documento inyectado devuelve true", () => {
        expect(puedeRecargarSuave(undefined)).toBe(true);
        expect(puedeRecargarSuave(docVacio)).toBe(true);
    });
    it("false si el foco está en un input, textarea o contenteditable", () => {
        const con = (el: object | null) =>
            ({ activeElement: el, querySelector: () => null }) as unknown as Document;
        expect(puedeRecargarSuave(con({ tagName: "INPUT" }))).toBe(false);
        expect(puedeRecargarSuave(con({ tagName: "textarea" }))).toBe(false);
        expect(puedeRecargarSuave(con({ tagName: "DIV", isContentEditable: true }))).toBe(false);
        expect(puedeRecargarSuave(con({ tagName: "BUTTON" }))).toBe(true);
    });
    it("false si hay algo marcado data-sin-guardar", () => {
        const doc = { activeElement: null, querySelector: () => ({}) } as unknown as Document;
        expect(puedeRecargarSuave(doc)).toBe(false);
    });
});

describe("suscribirseAvisoVersion", () => {
    it("abre un SSE al tema fijo y avisa solo ante mensajes ntfy", () => {
        const b = banco();
        const alAvisar = vi.fn();
        const cierre = suscribirseAvisoVersion(alAvisar, b);
        expect(EventSourceFalso.ultimas).toHaveLength(1);
        expect(EventSourceFalso.ultimas[0].url).toBe(URL_SSE_VERSION);
        expect(URL_SSE_VERSION).toContain(TEMA_VERSION);
        const es = EventSourceFalso.ultimas[0];
        es.emite(JSON.stringify({ event: "keepalive" }));
        es.emite("no-json");
        expect(alAvisar).not.toHaveBeenCalled();
        es.emite(JSON.stringify({ event: "message", title: "Nueva versión" }));
        expect(alAvisar).toHaveBeenCalledTimes(1);
        cierre();
        expect(es.cerrado).toBe(true);
    });
    it("cierra al ocultarse la pestaña y reabre al volver", () => {
        const b = banco();
        const cierre = suscribirseAvisoVersion(() => {}, b);
        const es1 = EventSourceFalso.ultimas[0];
        b.ponVisible(false);
        expect(es1.cerrado).toBe(true);
        b.ponVisible(true);
        expect(EventSourceFalso.ultimas).toHaveLength(2);
        cierre();
    });
    it("oculta de entrada: no abre hasta hacerse visible", () => {
        const b = banco();
        b.ponVisible(false); // primer cambio: los oyentes aún no existen
        const cierre = suscribirseAvisoVersion(() => {}, b);
        expect(EventSourceFalso.ultimas).toHaveLength(0);
        b.ponVisible(true);
        expect(EventSourceFalso.ultimas).toHaveLength(1);
        cierre();
    });
});
