/**
 * Banco de llamadas · los pasos que faltan para armarlo, en el orden en que se resuelven (BAN1115D). Puro.
 * Dice solo lo que la app sabe: sin informe todavía, no afirma que falte ni que sobre nada.
 */
import type { EstadoApp } from "./actor";

export interface Paso {
    clave: "tableta" | "llave" | "aceptada" | "armada";
    hecho: boolean;
    texto: string;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pasosQueFaltan(a: { informe: EstadoApp | null; destino: string; codigo: string | null; ahora?: number }): Paso[] {
    const { informe: i, destino } = a;
    const ahora = a.ahora ?? Date.now();
    const out: Paso[] = [];
    const elegida = RE_UUID.test(destino);
    out.push({ clave: "tableta", hecho: elegida, texto: elegida ? "Neurona elegida." : "Elige la neurona de la lista o escribe su id completo." });
    if (!elegida) return out;
    // 1 · la clave de ESTE aparato
    if (!i) {
        out.push({ clave: "llave", hecho: false, texto: "Comprobando la clave de este aparato y si esa neurona te aceptó…" });
        return out;
    }
    if (i.llave === false) {
        out.push({ clave: "llave", hecho: false, texto: "Este aparato no tiene clave propia: créala en Chats de Genesis (emparejar). Sin ella no se puede firmar ninguna orden." });
        return out;
    }
    out.push({ clave: "llave", hecho: i.llave === true, texto: i.llave === true ? "Este aparato tiene clave propia." : "No se pudo saber si este aparato tiene clave propia." });
    // 2 · la tableta aceptó a esta Mac
    const mismo = i.objetivo?.toLowerCase() === destino.toLowerCase();
    if (!mismo || !i.sesion) {
        out.push({ clave: "aceptada", hecho: false, texto: "Comprobando si esa neurona te aceptó…" });
        return out;
    }
    if (i.sesion.estado !== "aceptada") {
        const cod = a.codigo ?? i.codigo;
        out.push({
            clave: "aceptada",
            hecho: false,
            texto: `Esa neurona no te ha aceptado todavía (${i.sesion.motivo ?? "sin respuesta"}). Pulsa «Pedir controlarla desde aquí» y, en esa neurona, en Control entre mis neuronas, acepta este aparato${cod ? ` con el código ${cod}` : ""}.`,
        });
        return out;
    }
    out.push({ clave: "aceptada", hecho: true, texto: "Esa neurona ha aceptado este aparato." });
    // 3 · el modo de pruebas de llamadas armado
    const arm = i.armada;
    if (!arm || arm.con.toLowerCase() !== destino.toLowerCase()) {
        out.push({ clave: "armada", hecho: false, texto: "El modo de pruebas de llamadas no está armado hacia esa neurona: pulsa «Modo de pruebas de llamadas hacia esa neurona»." });
    } else if (arm.hasta <= ahora) {
        out.push({ clave: "armada", hecho: false, texto: "El modo de pruebas de llamadas venció: vuelve a armarlo." });
    } else {
        out.push({ clave: "armada", hecho: true, texto: `Modo de pruebas de llamadas armado hasta las ${new Date(arm.hasta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, quedan ${arm.restantes} llamadas.` });
    }
    return out;
}
