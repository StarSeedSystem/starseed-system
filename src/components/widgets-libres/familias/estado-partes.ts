/**
 * Diagnóstico honesto de ESTA neurona (ola 0929 · F): a partir de lo que el navegador deja
 * medir (red, batería, almacenamiento, memoria de la pestaña), del estado de la sincronía de la
 * cuenta, del guardián de consumo de la nube (solo lectura) y de las neuronas en línea, dice qué
 * va bien, qué no y cómo arreglarlo. Lo que no se puede medir es «sin dato», nunca un número
 * inventado. Sin React: se prueba solo.
 */

export type Nivel = "bien" | "atencion" | "mal" | "sin-dato";
export type EstadoSync = "idle" | "connecting" | "connected" | "error" | "disabled" | "no-session";
export type Arreglo = "reintentar-red" | "sincronizar" | "activar-sync" | "entrar" | "persistir" | "modo-eco" | "salir-eco";

export interface Senales {
    enLinea: boolean;
    red: { tipo?: string; mbps?: number; rtt?: number } | null;
    sync: EstadoSync | null;
    ultimoCambio: number | null;
    almacen: { usado: number; cuota: number; persistente: boolean | null } | null;
    bateria: { nivel: number; cargando: boolean } | null;
    consumo: { corte: boolean; corteHasta: number | null; frenoLocalHasta: number | null; diaAgotado: boolean; frenoRemoto: boolean; hoy: number; presupuesto: number };
    neuronas: { en: number; total: number } | null;
    memoria: { usadoMB: number; limiteMB: number } | null;
    eco: boolean;
}

export type ClaveSenal = "red" | "sync" | "consumo" | "almacen" | "bateria" | "neuronas" | "memoria";

export interface Diagnostico {
    clave: ClaveSenal;
    nombre: string;
    nivel: Nivel;
    /** Lo que se ve de un vistazo: «En línea», «62 %», «sin dato». */
    valor: string;
    /** Una frase: qué pasa y, si hace falta, por qué. */
    detalle: string;
    /** 0-1 si la señal es una cantidad (batería, almacén, consumo). */
    progreso: number | null;
    arreglo?: { accion: Arreglo; etiqueta: string; bloqueado?: string };
}

export const COLOR_NIVEL: Record<Nivel, string> = { bien: "#10B981", atencion: "#FFBF00", mal: "#DC143C", "sin-dato": "#64748b" };
const PESO: Record<Nivel, number> = { mal: 3, atencion: 2, bien: 1, "sin-dato": 0 };

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const mb = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);
const miles = (n: number) => n.toLocaleString("es-ES");
const hace = (ms: number, ahora: number) => { const m = Math.round((ahora - ms) / 60_000); return m < 1 ? "ahora mismo" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };

/** ¿La nube está en pausa por consumo? (y por qué, en una frase). */
export function pausaDeConsumo(c: Senales["consumo"], ahora: number): string | null {
    if (c.corte) return `La nube pidió una pausa por tráfico${c.corteHasta ? `; vuelve a intentarlo a las ${hora(c.corteHasta)}` : ""}.`;
    if (c.frenoRemoto) return "El proyecto gastó su presupuesto de hoy: las lecturas vuelven a las 00:00 UTC; lo que escribas sí se guarda.";
    if (c.diaAgotado) return "Este dispositivo gastó sus lecturas de hoy: vuelven a las 00:00 UTC.";
    if (c.frenoLocalHasta && c.frenoLocalHasta > ahora) return "Esta pestaña pidió demasiado seguido: pausa breve de unos 2 minutos.";
    return null;
}

export function diagnosticar(s: Senales, ahora: number): Diagnostico[] {
    const lista: Diagnostico[] = [];
    const pausa = pausaDeConsumo(s.consumo, ahora);

    // Red
    if (!s.enLinea) {
        lista.push({ clave: "red", nombre: "Red", nivel: "mal", valor: "Sin conexión", detalle: "El dispositivo no tiene conexión; lo guardado aquí sigue a mano.", progreso: 0, arreglo: { accion: "reintentar-red", etiqueta: "Reintentar" } });
    } else {
        const lenta = (s.red?.rtt ?? 0) > 600 || /(^|-)2g$/.test(s.red?.tipo ?? "");
        const partes = [s.red?.tipo, typeof s.red?.mbps === "number" ? `${s.red.mbps} Mbps` : null, typeof s.red?.rtt === "number" ? `${s.red.rtt} ms` : null].filter(Boolean);
        lista.push({ clave: "red", nombre: "Red", nivel: lenta ? "atencion" : "bien", valor: lenta ? "Lenta" : "En línea", detalle: partes.length ? partes.join(" · ") : "En línea (el navegador no da más detalle).", progreso: typeof s.red?.mbps === "number" ? Math.min(1, s.red.mbps / 10) : null });
    }

    // Sincronía de la cuenta
    const bloqueo = pausa ? "La nube está en pausa por consumo" : !s.enLinea ? "Sin conexión" : undefined;
    const sync = s.sync;
    if (sync === null) lista.push({ clave: "sync", nombre: "Sincronía", nivel: "sin-dato", valor: "sin dato", detalle: "Aún no hay estado de la sincronía.", progreso: null });
    else if (sync === "connected") lista.push({ clave: "sync", nombre: "Sincronía", nivel: "bien", valor: "Al día", detalle: s.ultimoCambio ? `Último cambio ${hace(s.ultimoCambio, ahora)}.` : "Conectada con tu cuenta.", progreso: null });
    else if (sync === "error") lista.push({ clave: "sync", nombre: "Sincronía", nivel: "mal", valor: "Error", detalle: "La sincronía con tu cuenta falló.", progreso: null, arreglo: { accion: "sincronizar", etiqueta: "Sincronizar ahora", bloqueado: bloqueo } });
    else if (sync === "disabled") lista.push({ clave: "sync", nombre: "Sincronía", nivel: "atencion", valor: "Apagada", detalle: "Los cambios de este dispositivo no viajan a los demás.", progreso: null, arreglo: { accion: "activar-sync", etiqueta: "Encender sincronía" } });
    else if (sync === "no-session") lista.push({ clave: "sync", nombre: "Sincronía", nivel: "atencion", valor: "Sin sesión", detalle: "Entra para que tu configuración viaje contigo.", progreso: null, arreglo: { accion: "entrar", etiqueta: "Entrar" } });
    else lista.push({ clave: "sync", nombre: "Sincronía", nivel: "atencion", valor: sync === "connecting" ? "Conectando" : "En espera", detalle: sync === "connecting" ? "Conectando con tu cuenta…" : "La sincronía aún no ha arrancado.", progreso: null, arreglo: { accion: "sincronizar", etiqueta: "Sincronizar ahora", bloqueado: bloqueo } });

    // Consumo de la nube (solo lectura)
    const fraccion = s.consumo.presupuesto > 0 ? Math.min(1, s.consumo.hoy / s.consumo.presupuesto) : null;
    const cifra = `${miles(s.consumo.hoy)} de ${miles(s.consumo.presupuesto)} lecturas hoy`;
    if (pausa) lista.push({ clave: "consumo", nombre: "Consumo", nivel: s.consumo.corte ? "mal" : "atencion", valor: "En pausa", detalle: pausa, progreso: fraccion });
    else lista.push({ clave: "consumo", nombre: "Consumo", nivel: (fraccion ?? 0) >= 0.7 ? "atencion" : "bien", valor: fraccion === null ? "sin dato" : `${Math.round(fraccion * 100)} %`, detalle: (fraccion ?? 0) >= 0.7 ? `Consumo alto: ${cifra}.` : `${cifra}.`, progreso: fraccion });

    // Almacenamiento
    if (!s.almacen || !(s.almacen.cuota > 0)) {
        lista.push({ clave: "almacen", nombre: "Almacén", nivel: "sin-dato", valor: "sin dato", detalle: "El navegador no dice cuánto espacio queda.", progreso: null });
    } else {
        const f = s.almacen.usado / s.almacen.cuota;
        const nivel: Nivel = f > 0.9 ? "mal" : f > 0.75 || s.almacen.persistente === false ? "atencion" : "bien";
        lista.push({
            clave: "almacen", nombre: "Almacén", nivel, valor: `${Math.round(f * 100)} %`, progreso: f,
            detalle: `${mb(s.almacen.usado)} de ${mb(s.almacen.cuota)}${s.almacen.persistente === false ? "; el navegador podría borrarlo si le falta sitio" : s.almacen.persistente ? " · protegido" : ""}.`,
            ...(s.almacen.persistente === false ? { arreglo: { accion: "persistir" as const, etiqueta: "Proteger datos" } } : {}),
        });
    }

    // Batería
    if (!s.bateria) lista.push({ clave: "bateria", nombre: "Batería", nivel: "sin-dato", valor: "sin dato", detalle: "Este navegador no da la batería (o el equipo va enchufado sin batería).", progreso: null });
    else {
        const { nivel: b, cargando } = s.bateria;
        const nivel: Nivel = cargando ? "bien" : b < 0.15 ? "mal" : b < 0.3 ? "atencion" : "bien";
        const arreglo = !s.eco && !cargando && b < 0.3 ? { accion: "modo-eco" as const, etiqueta: "Modo eco" }
            : s.eco && (cargando || b > 0.5) ? { accion: "salir-eco" as const, etiqueta: "Salir del modo eco" } : undefined;
        lista.push({ clave: "bateria", nombre: "Batería", nivel, valor: `${Math.round(b * 100)} %`, progreso: b, detalle: `${cargando ? "Cargando" : "Con batería"}${s.eco ? " · modo eco activo" : ""}.`, ...(arreglo ? { arreglo } : {}) });
    }

    // Neuronas de la cuenta
    if (!s.neuronas) lista.push({ clave: "neuronas", nombre: "Neuronas", nivel: "sin-dato", valor: "sin dato", detalle: "Sin lista de neuronas (sin sesión o sin conexión).", progreso: null });
    else lista.push({ clave: "neuronas", nombre: "Neuronas", nivel: s.neuronas.en > 0 ? "bien" : "atencion", valor: `${s.neuronas.en}/${s.neuronas.total}`, detalle: `${s.neuronas.en} de ${s.neuronas.total} en línea.`, progreso: s.neuronas.total ? s.neuronas.en / s.neuronas.total : null });

    // Memoria de la pestaña (solo Chromium la da)
    if (s.memoria && s.memoria.limiteMB > 0) {
        const f = s.memoria.usadoMB / s.memoria.limiteMB;
        lista.push({ clave: "memoria", nombre: "Memoria", nivel: f > 0.85 ? "atencion" : "bien", valor: `${Math.round(s.memoria.usadoMB)} MB`, detalle: `Esta pestaña usa ${Math.round(s.memoria.usadoMB)} MB de ${Math.round(s.memoria.limiteMB)} MB.`, progreso: f });
    }
    return lista;
}

/** La salud de conjunto: la peor señal medida manda. */
export function saludGeneral(d: Diagnostico[]): "bien" | "atencion" | "mal" {
    const peor = d.reduce<Nivel>((p, x) => (PESO[x.nivel] > PESO[p] ? x.nivel : p), "bien");
    return peor === "sin-dato" ? "bien" : peor;
}

/** Ordenado por gravedad (lo que hay que mirar, primero). */
export function porGravedad(d: Diagnostico[]): Diagnostico[] {
    return [...d].sort((a, b) => PESO[b.nivel] - PESO[a.nivel]);
}

/** El titular en una frase corta. */
export function titular(d: Diagnostico[]): string {
    const peor = porGravedad(d)[0];
    if (!peor || peor.nivel === "bien" || peor.nivel === "sin-dato") return "Todo en orden";
    const avisos = d.filter((x) => x.nivel === "mal" || x.nivel === "atencion").length;
    return `${peor.nombre}: ${peor.valor.toLowerCase()}${avisos > 1 ? ` · ${avisos - 1} más` : ""}`;
}

/** Compatibilidad con la versión anterior (y su prueba). */
export function saludDe(sync: EstadoSync | undefined, bateria: number | null): "bien" | "atencion" | "mal" {
    if (sync === "error" || (bateria !== null && bateria < 0.15)) return "mal";
    if (sync === "connecting" || (bateria !== null && bateria < 0.3)) return "atencion";
    return "bien";
}
