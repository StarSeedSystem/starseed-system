/**
 * Autoadaptación por neurona: elegir el medio para una app ArtCraft (contrato: `architecture/artcraft-y-rare.md` §4.5).
 * Modos equivalentes según `architecture/apps-en-la-malla.md` §5. Módulo PURO: sin `node:*`, sin React, sin red.
 */
import type { AppArtcraft } from "./politica-tablas";

type RolNeurona = "escritorio" | "movil" | "servidor" | "tv" | "navegador";

export interface NeuronaArtcraft {
  rol: RolNeurona;
  webgpu: boolean;
  webgl2: boolean;
  memoriaMB: number;
  binarios: Partial<Record<AppArtcraft, { version: string }>>;
  aislamientoSinRed: boolean;
  servidoresMalla: { id: string; apps: AppArtcraft[]; libre: boolean }[];
}

export type MedioArtcraft = "nativo" | "web" | "servidor-malla" | "ninguno";

export type ModoMalla = "local" | "por-bandas" | "montada" | "transmitida" | "ramificada";

export interface AlternativaMedio {
  medio: MedioArtcraft;
  motivo: string;
}

export interface EleccionMedioArtcraft {
  medio: MedioArtcraft;
  modoMalla: ModoMalla | null;
  motivo: string;
  alternativas: AlternativaMedio[];
}

export const VERSION_MINIMA: Record<AppArtcraft, string> = {
  figcraft: "0.10.0",
  gridcraft: "0.11.1",
  deckcraft: "0.10.0",
};

const MEMORIA_WEB_MB = 1024;

/** Compara versiones `x.y.z` numéricamente; tolera prefijo `v` y faltantes (1.0 == 1.0.0). */
export function versionAlMenos(a: string, b: string): boolean {
  const n = (v: string): number[] => v.replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const na = n(a);
  const nb = n(b);
  const largo = Math.max(na.length, nb.length);
  for (let i = 0; i < largo; i += 1) {
    const x = na[i] ?? 0;
    const y = nb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

function evaluarNativo(
  n: NeuronaArtcraft,
  app: AppArtcraft,
): { viable: boolean; modo: ModoMalla | null; motivo: string } {
  if (n.rol !== "escritorio" && n.rol !== "servidor")
    return { viable: false, modo: null, motivo: "solo lo corren escritorio o servidor" };
  const bin = n.binarios[app];
  if (!bin) return { viable: false, modo: null, motivo: `sin binario de ${app}` };
  const minima = VERSION_MINIMA[app];
  if (!versionAlMenos(bin.version, minima))
    return { viable: false, modo: null, motivo: `binario ${bin.version}, se necesita ≥ ${minima}` };
  if (!n.aislamientoSinRed)
    return {
      viable: false,
      modo: null,
      motivo: "sin aislamiento de red: se queda como web, el binario no puede abrirse con red libre",
    };
  return { viable: true, modo: "montada", motivo: `binario ${bin.version} con aislamiento de red` };
}

function evaluarWeb(n: NeuronaArtcraft): {
  viable: boolean;
  modo: ModoMalla | null;
  motivo: string;
} {
  const gpu = n.webgpu ? "WebGPU" : n.webgl2 ? "WebGL2" : null;
  if (!gpu) return { viable: false, modo: null, motivo: "sin WebGPU ni WebGL2" };
  if (n.memoriaMB < MEMORIA_WEB_MB)
    return { viable: false, modo: null, motivo: `${gpu} sí, pero poca memoria: hacen falta ${MEMORIA_WEB_MB} MB` };
  return { viable: true, modo: "por-bandas", motivo: `${gpu} y ${MEMORIA_WEB_MB} MB o más: volumen por bandas` };
}

function evaluarServidor(n: NeuronaArtcraft, app: AppArtcraft): {
  viable: boolean;
  modo: ModoMalla | null;
  motivo: string;
} {
  const servidor = n.servidoresMalla.find((s) => s.libre && s.apps.includes(app));
  if (!servidor) return { viable: false, modo: null, motivo: `sin servidor libre con ${app} en la malla` };
  return { viable: true, modo: "transmitida", motivo: `servidor «${servidor.id}» libre: ventana transmitida` };
}

export function elegirMedioArtcraft(
  n: NeuronaArtcraft,
  app: AppArtcraft,
  forzar?: MedioArtcraft,
): EleccionMedioArtcraft {
  const candidatas = [
    { medio: "nativo" as MedioArtcraft, ...evaluarNativo(n, app) },
    { medio: "web" as MedioArtcraft, ...evaluarWeb(n) },
    { medio: "servidor-malla" as MedioArtcraft, ...evaluarServidor(n, app) },
  ];
  const viables = candidatas.filter((c) => c.viable);
  const rechazadas = candidatas.filter((c) => !c.viable);
  let elegida = viables[0];
  let motivo = elegida?.motivo ?? "";
  if (forzar) {
    const forzada = viables.find((c) => c.medio === forzar);
    if (forzada) {
      elegida = forzada;
      motivo = forzada.motivo;
    } else if (forzar !== "ninguno") {
      const razon = rechazadas.find((c) => c.medio === forzar)?.motivo;
      motivo = razon
        ? `forzar «${forzar}» no se puede: ${razon}. ${viables[0]?.motivo ?? ""}`.trim()
        : motivo;
    }
  }
  if (!elegida) {
    const faltan = rechazadas.map((c) => c.motivo).join(". ");
    return {
      medio: "ninguno",
      modoMalla: null,
      motivo: faltan ? `próximamente — falta: ${faltan}` : "próximamente",
      alternativas: [],
    };
  }
  const mejorRechazada = rechazadas[0];
  if (mejorRechazada && mejorRechazada.medio !== forzar)
    motivo = `${motivo} — sin «${mejorRechazada.medio}»: ${mejorRechazada.motivo}`;
  const alternativas = viables.filter((c) => c.medio !== elegida?.medio).map((c) => ({ medio: c.medio, motivo: c.motivo }));
  return { medio: elegida.medio, modoMalla: elegida.modo, motivo, alternativas };
}
