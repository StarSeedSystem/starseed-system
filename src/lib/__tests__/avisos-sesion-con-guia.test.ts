/**
 * GUI1021N · Guardia de los avisos de sesión (§5 de `architecture/guias-introduccion.md`).
 *
 * «Una guardia impide nuevos avisos sueltos»: cada ventana que pide iniciar sesión debe usar
 * `AvisoSesion` (texto + acceso + «Conoce StarSeed»), no un «Inicia sesión para…» propio.
 * Se recorren `src/components` (sin `__tests__`) y se vigila que el texto no viva fuera de
 * `<AvisoSesion` ni de un toast con la acción de la guía. M1 y M5 quedaron fuera de la cola, así
 * que las apariciones de hoy se congelan por archivo: una NUEVA sube la cuenta y falla; migrar
 * una sola puede bajarla.
 * Permitidos: los errores «Inicia sesión de nuevo…», `auth-gate.tsx` y la consola de la terminal.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(process.cwd(), "src", "components");
const TEXTO = "Inicia sesión para";
const PERMITIDOS = new Set([
  "auth/aviso-sesion.tsx",
  "auth/auth-gate.tsx",
  "terminal/terminal-console.tsx",
]);
// Ruta relativa (sin .tsx) y, si hay más de una, =cuántas: deuda congelada del código de hoy.
const DEUDA = new Map((
  "agent/agent-runtime-panel,aurora/message-context-menu,aurora/personalities-panel=2,brains/brains-panel,brains/device-network-panel=3," +
  "brains/servers-panel,browser/browser-windows=4,camera/camera-app,canvas/canvas-board,canvas/work-centers,cerebro/neuronas-panel," +
  "contactos/boton-anadir-contacto=2,creation/library-location-picker,creation/source-picker,dashboard/editor-superior/panel-sistema," +
  "dashboard/widgets/gen4/creative-studio-widget,dashboard/widgets/gen4/multiverse-hub-widget,dashboard/widgets/gen5/merit-gallery-widget," +
  "decisions/my-activity,design/theme-mixer-panel,education/group-education-panel,education/study/study-groups-panel,education/study/study-guides-panel=2," +
  "education/study/study-tasks-panel=3,education/topic-graph,exocortex/memory-hub,exocortex/okf-panel,exocortex/provider-panel,exocortex/vaults-panel," +
  "files/universal-file-picker,gallery/gallery-app,governance/delegation-panel,governance/liquid-delegation-panel=2,governance/notifications-panel," +
  "group/group-ai-studio,group/group-governance=2,group/group-members=2,hub/connections-hub=3,hub/user-directory-results,invitations/invitation-card=2," +
  "layout/dock/iconos/acciones-compartir=2,layout/dock/iconos/galeria-plantillas,layout/dock/iconos/selector-imagen,library/entity-library-panel," +
  "library/finder/install-to-dialog=2,library/finder/public-catalog-section,library/repos/repo-detail-sheet,library/save-to-library=2," +
  "messages/correos-panel=3,messages/dm/new-chat-dialog=3,messages/dm/thread-view,network/feed/rich-post-card,posts/live-attachment=2," +
  "profile/profile-switcher,protomolecula/gobierno/seccion-gobierno-proto,publish/publication-composer=2,recordatorios/recordatorios-panel," +
  "recordatorios/recordatorios-widget,security/security-panel,servers/server-card,settings/account/account-sync-panel," +
  "settings/appearance/theme-catalog-gallery,settings/neurons/neurons-panel,settings/profile/profile-identity-panel," +
  "settings/profile/profile-library-showcase-panel,sharing/share-access-dialog,sharing/share-to-dialog=2,social/entity-editor-dialog,social/PostCard," +
  "social/PostFeed,storage/backends-network-panel,storage/connections-hub,storage/storage-panel=2,variaciones/publicar-variacion=2," +
  "vivo/programas/bloque-contador=2"
).split(",").map((e) => {
  const [f, n] = e.split("=");
  return [f + ".tsx", Number(n ?? 1)] as const;
}));

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name !== "__tests__") archivos(ruta, salida);
    } else if (entrada.isFile() && ruta.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(ruta)) {
      salida.push(ruta);
    }
  }
  return salida;
}

function rangosAviso(codigo: string): Array<[number, number]> {
  const rangos: Array<[number, number]> = [];
  for (let desde = 0; ; ) {
    const ini = codigo.indexOf("<AvisoSesion", desde);
    if (ini < 0) break;
    const fin = codigo.indexOf("/>", ini);
    if (fin < 0) break;
    rangos.push([ini, fin + 2]); desde = fin + 2;
  }
  return rangos;
}
function rangosToast(codigo: string): Array<[number, number]> {
  const rangos: Array<[number, number]> = [];
  const re = /\btoast(?:\.[a-zA-Z]+)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo))) {
    const abre = m.index + m[0].length - 1;
    let hondo = 0;
    let cierra = -1;
    for (let i = abre; i < codigo.length; i++) {
      if (codigo[i] === "(") hondo++;
      else if (codigo[i] === ")" && --hondo === 0) { cierra = i; break; }
    }
    if (cierra > 0) rangos.push([abre, cierra]);
  }
  return rangos;
}
function dentro(rangos: Array<[number, number]>, i: number): boolean {
  return rangos.some(([a, b]) => i >= a && i < b);
}

/** Avisos sueltos: el texto no vive en `<AvisoSesion` ni en un toast con la acción de la guía. */
function sueltos(codigo: string): number {
  const avisos = rangosAviso(codigo), toasts = rangosToast(codigo);
  let total = 0, i = -1;
  while ((i = codigo.indexOf(TEXTO, i + 1)) >= 0) {
    if (dentro(avisos, i)) continue;
    const tr = toasts.find(([a, b]) => i >= a && i < b);
    if (tr && /abrirGuia|EVENTO_ABRIR_GUIA|Conoce StarSeed/.test(codigo.slice(tr[0], tr[1]))) continue;
    total++;
  }
  return total;
}
describe("guardia · avisos de sesión con guía", () => {
  it("el detector distingue AvisoSesion y toast de un aviso suelto", () => {
    expect(sueltos('<AvisoSesion texto="Inicia sesión para entrar" />')).toBe(0);
    expect(sueltos('toast.error("Inicia sesión para entrar");')).toBe(1);
    expect(sueltos('toast.error("Inicia sesión para entrar", { action: abrirGuia() });')).toBe(0);
    expect(sueltos("<p>Inicia sesión para entrar</p>")).toBe(1);
  });
  it("ningún archivo de src/components añade avisos sueltos «Inicia sesión para…»", () => {
    const fallos: string[] = [];
    for (const archivo of archivos(RAIZ)) {
      const rel = path.relative(RAIZ, archivo).split(path.sep).join("/");
      if (PERMITIDOS.has(rel)) continue;
      const n = sueltos(readFileSync(archivo, "utf8"));
      const tope = DEUDA.get(rel) ?? 0;
      if (n > tope) fallos.push(`${rel}: ${n} avisos sueltos (tope ${tope}). Usa <AvisoSesion />.`);
    }
    expect(fallos, `Avisos sin guía; usa <AvisoSesion />:\n${fallos.join("\n")}`).toEqual([]);
  });
});
