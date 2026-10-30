// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Tanda del 2026-10-27 (Ola MBT1027 · N2): MBT1027 (Mausbot de Astraura): adaptación de OpenMausBot para el cursor del OS con switch, modos, diseños y acciones por voz/chat; enlazado con Protomolécula y todos los medios de Astraura.
// ------------------------------------------------------------------------------
// Alex (2026-10-27) pidió el Mausbot de Astraura: cursor con cara que también actúa (MBT1027) fusionado con el modelo de OpenMausBot, completamente configurable y personalizable; en el Exocórtex hay un switch de encendido/apagado del mausbot y se ajusta a cualquiera de las personalidades y diseños de cursor ilimitados; enlazado con la Protomolécula y todos los medios de Astraura incluyendo la orbe y el Exocórtex; con acceso a todo el OS que cada usuario configure para su perfil o neurona. // Contract: architecture/mausbot-astraura.md.
//
// Módulo PURO y SIN "use client": lo importan `packages.ts` (cliente) y la ruta `/api/library/actualizaciones` (servidor). El JSON entra por importación estática; NADA de `node:fs` (CLAUDE.md, trampa 11).
// ════════════════════════════════════════════════════════════════════════════

/** Funciones de ayuda para MBT1027 exportadas desde repos-1025 */
export { autorDe, resumenRequisitos, versionCorta } from "./repos-1025";

/** Helper para crear paquetes MBT1027 desde una ficha */
function paqueteMbt1027(f: FichaTanda1027, aut: (repo: string) => string, ver: (canal: string, texto: string) => string, desc: (f: FichaTanda1027) => string, nom: (f: FichaTanda1027) => string, pay: (f: FichaTanda1027) => Record<string, unknown>): LibraryPackage {
    return {
        id: f.id,
        kind: f.kind as LibraryPackage["kind"],
        name: nom(f),
        description: desc(f),
        icon: f.icono,
        tags: [...f.area, f.grupo, "ola-mbt1027"],
        version: ver(f.canal, f.version_actual),
        author: aut(f.repo),
        sourceRepoId: "starseed-labs",
        free: f.gratis,
        payload: pay(f),
    };
}
