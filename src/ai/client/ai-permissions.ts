// ════════════════════════════════════════════════════════════════
// StarSeed — Permisos y accesos de las IAs (Asistente Astraura + Nexo)
// ----------------------------------------------------------------
// Modelo de soberanía: POR DEFECTO las IAs de los chats del usuario
// tienen acceso COMPLETO para leer y MODIFICAR su PROPIO entorno
// (widgets, dashboards, menús, diseños, temas, memorias, agentes…).
// Todo es ajustable. Lo único inmutable son los fundamentos del
// sistema/red y los datos de OTROS usuarios o de la red (Constitución
// StarSeed): nunca se pueden alterar salvo permiso explícito.
//
// Source-agnostic + persistente en localStorage. Cualquier superficie
// (overlay flotante, página de IA, Nexo) lee/escribe el mismo estado.
// ════════════════════════════════════════════════════════════════

export type PermissionScope =
    | "read.system"        // leer estado del sistema (rutas, config, memoria)
    | "edit.widgets"       // crear/editar/mover/eliminar widgets
    | "edit.dashboards"    // crear/reordenar/eliminar dashboards
    | "edit.layout"        // menús, Trinity, disposición, posición del asistente
    | "edit.appearance"    // temas, tipografía, estilos, fondos
    | "edit.memory"        // memorias del Exocórtex / OpenHuman
    | "edit.code"          // editar el propio programa (widgets/código del usuario)
    | "manage.agents"      // desplegar/configurar agentes y subagentes
    | "manage.providers"   // cambiar modelos / proveedores / capacidades
    | "act.navigate"       // navegar por la app en nombre del usuario
    | "net.read"           // leer servicios/archivos de la red (solo lectura)
    | "net.write";         // escribir en la red (limitado: requiere permiso de la red)

export interface ScopeMeta {
    id: PermissionScope;
    label: string;
    description: string;
    /** límite constitucional: no puede activarse libremente sobre datos ajenos/red */
    constrained?: boolean;
    group: "lectura" | "entorno" | "inteligencia" | "red";
}

export const PERMISSION_SCOPES: ScopeMeta[] = [
    { id: "read.system", label: "Leer el sistema", description: "Ver rutas, configuración, estado y memoria de tu entorno.", group: "lectura" },
    { id: "act.navigate", label: "Navegar por ti", description: "Abrir secciones y moverse por la app en tu nombre.", group: "lectura" },
    { id: "edit.widgets", label: "Editar widgets", description: "Crear, mover, redimensionar y eliminar tus widgets.", group: "entorno" },
    { id: "edit.dashboards", label: "Editar dashboards", description: "Crear, reordenar y eliminar tus tableros.", group: "entorno" },
    { id: "edit.layout", label: "Editar interfaz", description: "Menús, Trinity, disposición y posición del asistente.", group: "entorno" },
    { id: "edit.appearance", label: "Editar apariencia", description: "Temas, tipografía, estilos y fondos.", group: "entorno" },
    { id: "edit.code", label: "Editar tu código", description: "Modificar widgets y código de tu propio entorno (no los fundamentos del sistema).", group: "entorno" },
    { id: "edit.memory", label: "Editar memoria", description: "Leer y actualizar la memoria de tu Exocórtex.", group: "inteligencia" },
    { id: "manage.agents", label: "Desplegar agentes", description: "Crear y configurar agentes y subagentes.", group: "inteligencia" },
    { id: "manage.providers", label: "Gestionar modelos", description: "Cambiar proveedores, modelos y capacidades.", group: "inteligencia" },
    { id: "net.read", label: "Leer la red", description: "Consultar servicios y archivos de la red (solo lectura).", group: "red" },
    { id: "net.write", label: "Escribir en la red", description: "Modificar datos en la red. Limitado: la información de otros usuarios y de la red no se altera salvo permiso explícito.", constrained: true, group: "red" },
];

export type AiActor = "assistant" | "nexus";

export interface AiPermissionState {
    /** acceso complejo activado: la IA puede editar el entorno y orquestar agentes */
    complexAccess: boolean;
    scopes: Record<PermissionScope, boolean>;
    /** nº máximo de agentes/subagentes que puede desplegar a la vez */
    maxAgents: number;
    updatedTs: number;
}

const LS_PREFIX = "starseed_ai_permissions_v1:";

// Por defecto: acceso COMPLETO al propio entorno. La única restricción es
// escribir en la red (net.write) que queda OFF por la Constitución (datos ajenos).
export function defaultPermissions(): AiPermissionState {
    const scopes = {} as Record<PermissionScope, boolean>;
    for (const s of PERMISSION_SCOPES) scopes[s.id] = s.id !== "net.write";
    return { complexAccess: true, scopes, maxAgents: 8, updatedTs: Date.now() };
}

export function loadPermissions(actor: AiActor): AiPermissionState {
    if (typeof window === "undefined") return defaultPermissions();
    try {
        const raw = localStorage.getItem(LS_PREFIX + actor);
        if (!raw) return defaultPermissions();
        const parsed = JSON.parse(raw) as Partial<AiPermissionState>;
        const base = defaultPermissions();
        return {
            ...base,
            ...parsed,
            scopes: { ...base.scopes, ...(parsed.scopes ?? {}) },
        };
    } catch {
        return defaultPermissions();
    }
}

export function savePermissions(actor: AiActor, state: AiPermissionState): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(LS_PREFIX + actor, JSON.stringify({ ...state, updatedTs: Date.now() }));
        window.dispatchEvent(new CustomEvent("starseed:ai-permissions-changed", { detail: { actor } }));
    } catch { /* noop */ }
}

/** ¿Puede la IA ejecutar una acción de este alcance ahora mismo? */
export function canPerform(actor: AiActor, scope: PermissionScope): boolean {
    const st = loadPermissions(actor);
    if (!st.complexAccess && scope.startsWith("edit.")) return false;
    if (!st.complexAccess && scope.startsWith("manage.")) return false;
    return !!st.scopes[scope];
}

export function setScope(actor: AiActor, scope: PermissionScope, value: boolean): AiPermissionState {
    const st = loadPermissions(actor);
    const next: AiPermissionState = { ...st, scopes: { ...st.scopes, [scope]: value } };
    savePermissions(actor, next);
    return next;
}

export function setComplexAccess(actor: AiActor, value: boolean): AiPermissionState {
    const st = loadPermissions(actor);
    const next: AiPermissionState = { ...st, complexAccess: value };
    savePermissions(actor, next);
    return next;
}

export function setMaxAgents(actor: AiActor, value: number): AiPermissionState {
    const st = loadPermissions(actor);
    const next: AiPermissionState = { ...st, maxAgents: Math.max(0, Math.min(64, Math.round(value))) };
    savePermissions(actor, next);
    return next;
}

export function resetPermissions(actor: AiActor): AiPermissionState {
    const next = defaultPermissions();
    savePermissions(actor, next);
    return next;
}
