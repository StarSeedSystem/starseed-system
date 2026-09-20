/**
 * Ficha de IDE y proceso en vivo del agente (Ola 344 · MD1b · 2026-09-20)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tipos, saneado de URLs/rutas y utilidades puras para presentar la información
 * del IDE y proceso en vivo traída en el latido del orquestador.
 */

export interface IdeInfo {
    motor: string;
    origen: string;
    entorno: string;
    pid: number | null;
    servidor: string;
    medioId: string;
    enLinea: boolean;
    estado: string;
    venceEnS: number | null;
    worktree: string;
}

export interface AlternativaIde {
    id: string;
    motor: string;
    origen: string;
    libres: number;
    otroServidor: boolean;
}

export interface ProcesoInfo {
    log: string;
    enVivo: string;
    sesion: string;
    enlaceIde: string;
}

export interface EnlaceProceso {
    etiqueta: string;
    href: string;
}

export function sanearHref(href: string): string {
    if (!href || typeof href !== "string") return "";
    const h = href.trim();
    if (h.startsWith("/")) return h.startsWith("//") ? "" : h;
    return /^(https?|vscode|cursor|codex):/i.test(h) ? h : "";
}

export function describirIde(t: { ide?: IdeInfo }): string {
    if (!t.ide?.motor) return "sin IDE registrado";
    const orig = t.ide.origen ? ` · ${t.ide.origen}` : "";
    const srv = t.ide.servidor ? ` (${t.ide.servidor})` : "";
    return `${t.ide.motor}${orig}${srv}`;
}

export function tonoIde(t: { ide?: IdeInfo }): "verde" | "ambar" | "gris" {
    if (!t.ide) return "gris";
    if (t.ide.estado === "colgado" || t.ide.estado === "desconocido") return "ambar";
    return t.ide.enLinea ? "verde" : "gris";
}

export function fraseAlternativas(t: { alternativas?: AlternativaIde[] }): string {
    const list = t.alternativas;
    if (!list?.length) return "sin relevo disponible";
    const otros = list.filter((a) => a.otroServidor).length;
    const desc = list.length === 1 ? "1 medio puede seguirla" : `${list.length} medios pueden seguirla`;
    return otros === 0 ? desc : `${desc} (${otros} en otro servidor)`;
}

export function enlacesDe(t: { proceso?: ProcesoInfo }): EnlaceProceso[] {
    const res: EnlaceProceso[] = [];
    const ev = t.proceso?.enVivo ? sanearHref(t.proceso.enVivo) : "";
    if (ev) res.push({ etiqueta: "Log en vivo", href: ev });
    const ei = t.proceso?.enlaceIde ? sanearHref(t.proceso.enlaceIde) : "";
    if (ei) res.push({ etiqueta: "Abrir en Codex", href: ei });
    return res;
}

export function sanearIde(raw: unknown): IdeInfo | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const d = raw as Record<string, unknown>;
    const motor = typeof d.motor === "string" ? d.motor.trim() : "";
    if (!motor) return undefined;
    const s = (k: string) => typeof d[k] === "string" ? (d[k] as string).trim() : "";
    const n = (k: string) => typeof d[k] === "number" && Number.isFinite(d[k]) ? (d[k] as number) : null;
    return {
        motor, origen: s("origen"), entorno: s("entorno"), pid: n("pid"), servidor: s("servidor"),
        medioId: s("medioId"), enLinea: d.enLinea === true, estado: s("estado") || "desconocido",
        venceEnS: n("venceEnS"), worktree: s("worktree"),
    };
}

export function sanearAlternativas(raw: unknown): AlternativaIde[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const res: AlternativaIde[] = [];
    for (const item of raw.slice(0, 6)) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const d = item as Record<string, unknown>;
        const id = typeof d.id === "string" ? d.id.trim() : "";
        if (id) res.push({
            id,
            motor: typeof d.motor === "string" ? d.motor.trim() : "",
            origen: typeof d.origen === "string" ? d.origen.trim() : "",
            libres: typeof d.libres === "number" && Number.isFinite(d.libres) ? Math.max(0, d.libres) : 0,
            otroServidor: d.otroServidor === true,
        });
    }
    return res.length > 0 ? res : undefined;
}

export function sanearProceso(raw: unknown): ProcesoInfo | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const d = raw as Record<string, unknown>;
    const log = typeof d.log === "string" ? d.log.trim() : "";
    const enVivo = sanearHref(typeof d.enVivo === "string" ? d.enVivo.trim() : "");
    const sesion = typeof d.sesion === "string" ? d.sesion.trim() : "";
    const enlaceIde = sanearHref(typeof d.enlaceIde === "string" ? d.enlaceIde.trim() : "");
    return (!log && !enVivo && !sesion && !enlaceIde) ? undefined : { log, enVivo, sesion, enlaceIde };
}
