/**
 * Persistencia de la bandeja del buzón en el almacén local (MSJ1108C · F1).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * El buzón sigue sirviendo su estado en memoria (síncrono, para `useSyncExternalStore`); esto lo respalda:
 *   · arranca con la clave vieja de localStorage (lectura de respaldo, se mantiene una versión);
 *   · en segundo plano abre IndexedDB, MIGRA sin pérdidas (ver `migracion.ts`), y sustituye la memoria por el almacén;
 *   · desde entonces escribe solo los mensajes que cambian (diferencia por identidad) y los «leído hasta» y vías;
 *   · si IndexedDB falla o no existe, el buzón sigue escribiendo la bandeja entera en localStorage como antes;
 *   · otras pestañas avisan por BroadcastChannel y se relee el almacén.
 * Nunca lanza hacia el buzón.
 */

import { abrirAlmacenIdb, type AlmacenMensajes, type RegistroMensaje } from "./almacen";
import { bandejaDesdeAlmacen, META_LEIDO, META_VIAS, migrarDesdeLocalStorage, registroDeMensaje, type AlmacenamientoClaves } from "./migracion";
import { MAX_POR_CONVERSACION, type EstadoBandeja, type MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";

export interface OpcionesPersistencia {
    ls: AlmacenamientoClaves | null;
    /** Sin IndexedDB o con error: el buzón escribe en localStorage como antes. */
    escribirLs(e: EstadoBandeja): void;
    /** Se relee el almacén (otra pestaña escribió) o termina la hidratación. */
    alReemplazar(e: EstadoBandeja): void;
    fabricaIdb?: IDBFactory;
    /** Para pruebas: otro almacén en lugar de IndexedDB. */
    abrir?: () => Promise<AlmacenMensajes>;
}

export interface PersistenciaBandeja {
    /** Registra el cambio de estado (diferencia contra el anterior) y lo escribe. */
    guardar(prev: EstadoBandeja, nuevo: EstadoBandeja): void;
    /** Quita un mensaje de este aparato para siempre (lápida). */
    enterrar(clave: string, id: string): void;
    /** Abre, migra y carga. Devuelve el almacén o null si no hay IndexedDB. */
    hidratar(actual: () => EstadoBandeja): Promise<AlmacenMensajes | null>;
    almacen(): AlmacenMensajes | null;
    activo(): boolean;
}

const CANAL_TABS = "starseed-malla-bandeja";

function distinto(a: MensajeMalla, b: MensajeMalla): boolean {
    if (a === b) return false;
    try {
        return JSON.stringify(a) !== JSON.stringify(b);
    } catch {
        return true;
    }
}

export function crearPersistencia(o: OpcionesPersistencia): PersistenciaBandeja {
    let alm: AlmacenMensajes | null = null;
    let cola = new Map<string, RegistroMensaje>();
    let metaSucia = false;
    let programado = false;
    const idPestana = `p${Math.random().toString(36).slice(2, 8)}`;
    let canal: BroadcastChannel | null = null;
    let ultimo: EstadoBandeja | null = null;

    function conmutarALs(): void {
        alm = null;
        const e = ultimo;
        if (e) o.escribirLs(e);
    }

    async function vaciar(): Promise<void> {
        programado = false;
        const a = alm;
        if (!a) return;
        const lote = Array.from(cola.values());
        cola = new Map();
        const conMeta = metaSucia;
        metaSucia = false;
        try {
            await a.poner(lote);
            if (conMeta && ultimo) {
                const leido: Record<string, number> = {};
                for (const [k, c] of Object.entries(ultimo.conv)) if (c.leidoHasta) leido[k] = c.leidoHasta;
                const previo = (await a.meta<Record<string, number>>(META_LEIDO)) ?? {};
                for (const [k, v] of Object.entries(previo)) leido[k] = Math.max(leido[k] ?? 0, v);
                await a.ponerMeta(META_LEIDO, leido);
                await a.ponerMeta(META_VIAS, { ...((await a.meta<Record<string, unknown>>(META_VIAS)) ?? {}), ...ultimo.vias });
            }
            try {
                canal?.postMessage({ de: idPestana });
            } catch {
                /* sin canal */
            }
        } catch {
            // IndexedDB falló a medio camino: no se pierde nada, la bandeja entera vuelve a localStorage.
            conmutarALs();
        }
    }

    function programar(): void {
        if (programado) return;
        programado = true;
        setTimeout(() => void vaciar(), 20);
    }

    return {
        guardar(prev, nuevo) {
            ultimo = nuevo;
            if (!alm) return;
            for (const [clave, c] of Object.entries(nuevo.conv)) {
                const antes = prev.conv[clave];
                if (antes === c) continue;
                const previos = new Map((antes?.mensajes ?? []).map((m) => [m.id, m]));
                for (const m of c.mensajes) {
                    const p = previos.get(m.id);
                    if (!p || distinto(p, m)) cola.set(m.id, registroDeMensaje(m));
                }
                if (c.leidoHasta !== (antes?.leidoHasta ?? 0)) metaSucia = true;
            }
            if (nuevo.vias !== prev.vias) metaSucia = true;
            if (cola.size || metaSucia) programar();
        },

        enterrar(clave, id) {
            const a = alm;
            if (!a) return;
            void (async () => {
                try {
                    const previo = await a.obtener(id);
                    await a.poner([{ ...(previo ?? registroDeMensaje({ id, clave, dir: "sale", texto: "", at: 0, estado: "enviado" })), lapida: true }]);
                } catch {
                    /* la lápida es de mejor esfuerzo */
                }
            })();
        },

        async hidratar(actual) {
            let a: AlmacenMensajes;
            try {
                a = await (o.abrir ?? (() => abrirAlmacenIdb(o.fabricaIdb)))();
            } catch {
                return null;
            }
            try {
                await migrarDesdeLocalStorage(a, o.ls);
                const cargado = await bandejaDesdeAlmacen(a, MAX_POR_CONVERSACION);
                // Lo que se escribió en memoria mientras tanto manda; y se escribe.
                const vivo = actual();
                const conv = { ...cargado.conv };
                for (const [clave, c] of Object.entries(vivo.conv)) {
                    const base = new Map((conv[clave]?.mensajes ?? []).map((m) => [m.id, m]));
                    let cambio = false;
                    for (const m of c.mensajes) {
                        const previo = base.get(m.id);
                        if (!previo || distinto(previo, m)) {
                            base.set(m.id, m);
                            cola.set(m.id, registroDeMensaje(m));
                            cambio = true;
                        }
                    }
                    if (cambio || !conv[clave]) {
                        const ms = Array.from(base.values()).sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
                        conv[clave] = { mensajes: ms.length > MAX_POR_CONVERSACION ? ms.slice(ms.length - MAX_POR_CONVERSACION) : ms, leidoHasta: Math.max(c.leidoHasta, conv[clave]?.leidoHasta ?? 0) };
                    }
                }
                const fusionado: EstadoBandeja = { v: 1, conv, vias: { ...cargado.vias, ...vivo.vias } };
                alm = a;
                ultimo = fusionado;
                metaSucia = true;
                programar();
                o.alReemplazar(fusionado);
                if (typeof BroadcastChannel !== "undefined") {
                    canal = new BroadcastChannel(CANAL_TABS);
                    canal.onmessage = (ev) => {
                        if ((ev.data as { de?: string } | null)?.de === idPestana) return;
                        void bandejaDesdeAlmacen(a, MAX_POR_CONVERSACION).then((e) => {
                            ultimo = e;
                            o.alReemplazar(e);
                        });
                    };
                }
                return a;
            } catch {
                return null;
            }
        },

        almacen: () => alm,
        activo: () => alm !== null,
    };
}
