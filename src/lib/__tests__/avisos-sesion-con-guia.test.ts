/** GUI1021N · Guardia: ningún aviso «Inicia sesión para…» suelto sin la guía (§5).
 * Vive en `AvisoSesion` o en un toast con `abrirGuia`; «Inicia sesión de nuevo…»,
 * `auth-gate.tsx` y la consola son puertas legítimas. `PENDIENTES` es la deuda del 2026-10-30. */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(process.cwd(), "src/components");
const FRASE = "Inicia sesión para";
const AVISO = /<AvisoSesion\b[\s\S]*?(?:\/>|<\/AvisoSesion>)/g;
const PERMITIDOS = new Set([
  "src/components/auth/auth-gate.tsx",
  "src/components/terminal/terminal-console.tsx",
]);

/** Ventanas pendientes de pasar a `AvisoSesion`, con cuántas frases sueltas tienen hoy. */
const PENDIENTES = new Map<string, number>(
  (
    "agent/agent-runtime-panel,aurora/message-context-menu,aurora/personalities-panel=2,brains/brains-panel,brains/device-network-panel=3,brains/servers-panel,browser/browser-windows=4,camera/camera-app,canvas/canvas-board,canvas/work-centers,cerebro/neuronas-panel,contactos/boton-anadir-contacto=2,creation/library-location-picker,creation/source-picker,dashboard/editor-superior/panel-sistema,dashboard/widgets/gen4/creative-studio-widget,dashboard/widgets/gen4/multiverse-hub-widget,dashboard/widgets/gen5/merit-gallery-widget,decisions/my-activity,design/theme-mixer-panel,education/group-education-panel,education/study/study-groups-panel,education/study/study-guides-panel=2,education/study/study-tasks-panel=3,education/topic-graph=2,exocortex/memory-hub,exocortex/okf-panel,exocortex/provider-panel,exocortex/vaults-panel,files/universal-file-picker,gallery/gallery-app,governance/delegation-panel,governance/liquid-delegation-panel=2,governance/notifications-panel,group/group-ai-studio,group/group-governance=2,group/group-members=2,hub/connections-hub=3,hub/user-directory-results,invitations/invitation-card=2,layout/dock/iconos/acciones-compartir=2,layout/dock/iconos/galeria-plantillas,layout/dock/iconos/selector-imagen,library/entity-library-panel,library/finder/install-to-dialog=2,library/finder/public-catalog-section,library/repos/repo-detail-sheet,library/save-to-library=2," +
    "messages/correos-panel=3,messages/dm/new-chat-dialog=3,messages/dm/thread-view,network/feed/rich-post-card,posts/live-attachment=2,profile/profile-switcher,protomolecula/gobierno/seccion-gobierno-proto,publish/publication-composer=2,recordatorios/recordatorios-panel,recordatorios/recordatorios-widget,security/security-panel,servers/server-card,settings/account/account-sync-panel,settings/appearance/theme-catalog-gallery,settings/neurons/neurons-panel,settings/profile/profile-identity-panel,settings/profile/profile-library-showcase-panel,sharing/share-access-dialog,sharing/share-to-dialog=2,social/entity-editor-dialog,social/PostCard,social/PostFeed,storage/backends-network-panel,storage/connections-hub,storage/storage-panel=2,variaciones/publicar-variacion=2,vivo/programas/bloque-contador=2"
  )
    .split(",")
    .map((e) => {
      const [ruta, veces] = e.split("=");
      return [`src/components/${ruta}.tsx`, Number(veces ?? 1)] as const;
    }),
);

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__tests__") continue;
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivosTsx(ruta));
    else if (e.name.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

/** Fuera comentarios: una frase comentada no es un aviso a la vista. */
function sinComentarios(c: string): string {
  return c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^\S\n])\/\/.*$/gm, "$1");
}

function rangos(c: string, p: RegExp): Array<[number, number]> {
  return Array.from(c.matchAll(p), (m) => {
    const i = m.index ?? 0;
    return [i, i + m[0].length] as [number, number];
  });
}

/** Llamadas `toast.*(...)` que, al pedir sesión, ofrecen la acción de la guía. */
function toastsConGuia(c: string): Array<[number, number]> {
  const salida: Array<[number, number]> = [];
  for (const m of c.matchAll(/toast\.[A-Za-z]+\s*\(/g)) {
    const inicio = m.index ?? 0;
    let nivel = 0;
    let fin = c.indexOf("(", inicio);
    for (; fin < c.length; fin++) {
      if (c[fin] === "(") nivel++;
      else if (c[fin] === ")" && --nivel === 0) break;
    }
    const llamada = c.slice(inicio, fin + 1);
    if (llamada.includes(FRASE) && llamada.includes("abrirGuia")) salida.push([inicio, fin + 1]);
  }
  return salida;
}

const enRango = (i: number, rs: Array<[number, number]>): boolean =>
  rs.some(([a, b]) => i >= a && i < b);

/** Líneas con la frase fuera de `AvisoSesion` y de los toasts con guía. */
function lineasSueltas(c: string): number[] {
  const avisos = rangos(c, AVISO);
  const toasts = toastsConGuia(c);
  const lineas: number[] = [];
  for (let desde = 0; ; ) {
    const i = c.indexOf(FRASE, desde);
    if (i < 0) break;
    desde = i + FRASE.length;
    if (enRango(i, avisos) || enRango(i, toasts)) continue;
    lineas.push(c.slice(0, i).split("\n").length);
  }
  return lineas;
}

describe("avisos de sesión con la guía (GUI1021N)", () => {
  const archivos = archivosTsx(RAIZ);

  it("recorre src/components y deja fuera las pruebas", () => {
    expect(archivos.length).toBeGreaterThan(100);
    expect(archivos.every((r) => !r.includes(`${path.sep}__tests__${path.sep}`))).toBe(true);
  });

  it("ningún .tsx deja «Inicia sesión para» fuera de AvisoSesion o de un toast con la guía", () => {
    const sueltos: string[] = [];
    for (const ruta of archivos) {
      const relativa = path.relative(process.cwd(), ruta).split(path.sep).join("/");
      if (PERMITIDOS.has(relativa)) continue;
      const malas = lineasSueltas(sinComentarios(readFileSync(ruta, "utf8")));
      const permitidas = PENDIENTES.get(relativa) ?? 0;
      if (malas.length > permitidas) sueltos.push(`${relativa}:${malas.join(",")} (${malas.length} > ${permitidas})`);
    }
    expect(sueltos).toEqual([]);
  });

  it("la puerta se mide igual en un caso puro: AvisoSesion y toast con guía valen, el resto no", () => {
    const conAviso = `<AvisoSesion\n  texto="Inicia sesión para ver tus notificaciones"\n/>`;
    const conToast = `toast.error("Inicia sesión para guardar", {\n  action: { label: "Conoce StarSeed", onClick: () => abrirGuia({ desde: "aviso" }) },\n});`;
    expect(lineasSueltas(conAviso)).toEqual([]);
    expect(lineasSueltas(conToast)).toEqual([]);
    expect(lineasSueltas('toast.error("Inicia sesión de nuevo para seguir.");')).toEqual([]);
    expect(lineasSueltas("<div>Inicia sesión para continuar</div>")).toEqual([1]);
  });
});
