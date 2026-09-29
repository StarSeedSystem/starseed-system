/**
 * Lo que tu exocórtex ve ahora (paquete B · Ola 0929) — PURO.
 *
 * Avisos DERIVADOS de datos reales que el paquete ya lee (y comparte por caché): votaciones que
 * te faltan, delegaciones a punto de caducar, la Semilla moviéndose y el mérito pendiente de aval.
 * Nada inventado: sin datos, sin avisos («todo en calma»).
 */
import type { DatosAgora, DatosDelegacion } from "./datos-civicos";
import { duracionCorta, resumenCivico, tiempoDe } from "./datos-civicos";
import type { DatosMercado } from "./datos-economia";
import { variacion } from "./datos-economia";
import type { DatosMerito } from "./datos-merito";

export type TipoAviso = "voto" | "delegacion" | "mercado" | "merito";

export interface AvisoCortex {
    id: string;
    tipo: TipoAviso;
    /** 0 (urgente) … 3 (curiosidad). */
    prioridad: number;
    texto: string;
    detalle: string;
    /** Adónde lleva la acción (si la hay). */
    href?: string;
    accion?: string;
}

export function avisosCortex(f: { agora?: DatosAgora | null; delegacion?: DatosDelegacion | null; mercado?: DatosMercado | null; merito?: DatosMerito | null }, ahora: number): AvisoCortex[] {
    const out: AvisoCortex[] = [];
    if (f.agora) {
        const r = resumenCivico(f.agora.propuestas, ahora);
        if (r.porVotar > 0 && r.proxima) {
            const pendiente = f.agora.propuestas.filter((p) => p.estado === "open" && !p.miVoto).sort((a, b) => (a.cierra ?? Infinity) - (b.cierra ?? Infinity))[0] ?? r.proxima;
            const t = tiempoDe(pendiente, ahora);
            out.push({
                id: `voto:${pendiente.id}`,
                tipo: "voto",
                prioridad: t.urgente ? 0 : 1,
                texto: r.porVotar === 1 ? "Te falta una votación" : `Te faltan ${r.porVotar} votaciones`,
                detalle: `«${pendiente.titulo}» cierra en ${t.texto}.`,
                href: "/network/politics",
                accion: "Votar",
            });
        }
    }
    if (f.delegacion) {
        for (const d of f.delegacion.dadas) {
            const resta = d.caduca - ahora;
            if (resta > 0 && resta < 7 * 86_400_000) {
                out.push({
                    id: `delegacion:${d.id}`,
                    tipo: "delegacion",
                    prioridad: resta < 2 * 86_400_000 ? 1 : 2,
                    texto: `Tu delegación en ${d.temaEtiqueta} caduca en ${duracionCorta(resta)}`,
                    detalle: `La custodia ${d.delegado.nombre}. Si caduca, tu voz vuelve a ser directa.`,
                    href: "/decisiones",
                    accion: "Renovar o dejar",
                });
            }
        }
    }
    if (f.mercado) {
        const v = variacion(f.mercado.serie, 7);
        if (v !== null && Math.abs(v) >= 3) {
            out.push({
                id: "mercado:semana",
                tipo: "mercado",
                prioridad: 3,
                texto: `La Semilla ${v > 0 ? "sube" : "baja"} un ${Math.abs(v).toLocaleString("es-ES", { maximumFractionDigits: 1 })} % esta semana`,
                detalle: "Bolsa de la Semilla (beta simulada): lo ves en la pestaña Economía.",
            });
        }
    }
    if (f.merito && f.merito.uid) {
        const sinAval = f.merito.mias.filter((m) => !m.avalada).length;
        if (sinAval > 0) {
            out.push({
                id: "merito:aval",
                tipo: "merito",
                prioridad: 2,
                texto: sinAval === 1 ? "Una insignia espera aval" : `${sinAval} insignias esperan aval`,
                detalle: "Solo las avaladas por otra persona cuentan como mérito.",
                href: "/insignias",
                accion: "Ver insignias",
            });
        }
    }
    return out.sort((a, b) => a.prioridad - b.prioridad);
}
