/**
 * DIR1125N · Señales y control remoto en el Centro de notificaciones, desde cualquier área.
 *
 * Petición de Alex (25-11): no debería tener que abrir Señales para ver los registros y avisos de las señales y del control
 * remoto. Antes, la bandeja de lo recibido de otras neuronas solo empezaba a escuchar cuando se abría Señales (lo que llegaba
 * con la app en otra área se perdía), y las sesiones de control, las peticiones de control y los fallos de enlace solo se
 * contaban allí o en avisos sueltos.
 *
 * Aquí: con lo que ya existe (la bandeja, el registro de sesiones, los avisos de petición y los fallos de enlace) se deja una
 * entrada en el Centro de notificaciones (la campana, en cualquier área), como «Señales» y SIN ventana emergente nueva. Topes
 * para no inundar: por tipo de llegada, una entrada cada 10 min que dice cuántas llegaron; la presencia no se apunta; un fallo
 * de enlace por pareja y carril cada hora. Lo que ya estaba al montar no se repite. Lógica sin E/S: todo llega por `deps`.
 */
import type { AppNotifyInput } from "./app-notify";
import type { NetworkInboundItem } from "@/ai/astraura/mesh/network-inbox";
import type { SesionSaliente } from "@/lib/control-remoto/registro-sesiones";
import type { AvisoPeticion } from "@/lib/control-remoto/aviso-peticion";
import type { FalloEnlace } from "@/lib/malla/fallos-enlaces";

/** La app «Señales» del catálogo: el Centro la pinta como origen («desde Señales»). */
export const APP_SENALES = "senales";
/** Igual que `RUTA_AJUSTE_CONTROL` de aviso-peticion (lo comprueba la prueba del montaje). */
export const RUTA_CONTROL = "/senales#control-entre-neuronas";
export const RUTA_LLEGADAS = "/senales?vista=llegadas";
export const VENTANA_LLEGADAS_MS = 10 * 60_000;
export const VENTANA_FALLOS_MS = 60 * 60_000;

const TIPOS: Record<string, { uno: string; varios: string; icono: string }> = {
  message: { uno: "Mensaje", varios: "mensajes", icono: "MessageSquare" },
  post: { uno: "Publicación", varios: "publicaciones", icono: "FileText" },
  alert: { uno: "Alerta", varios: "alertas", icono: "ShieldAlert" },
  "state-delta": { uno: "Cambio de estado", varios: "cambios de estado", icono: "RefreshCw" },
};
/** Presencia: llega cada pocos segundos y ya la enseña el mapa; no es un aviso. */
const NO_APUNTAR = new Set(["presence"]);

interface Fuente<T> {
  leer: () => readonly T[];
  suscribir: (cb: () => void) => () => void;
}

export interface DepsRegistro {
  notificar: (n: AppNotifyInput) => unknown;
  ahora: () => number;
  bandeja: Fuente<NetworkInboundItem>;
  sesiones: Fuente<SesionSaliente>;
  peticiones: Fuente<AvisoPeticion>;
  fallos: Fuente<FalloEnlace>;
  /** Frase legible de un fallo (`textoFalloSenal` sin la cola de «sigue por…»). */
  fraseFallo: (nombreOtra: string, f: FalloEnlace) => string;
}

const corto = (id: string) => (id || "?").slice(0, 8);

function resumenCuerpo(body: unknown): string | undefined {
  try {
    if (typeof body === "string") return body.slice(0, 140) || undefined;
    if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      for (const k of ["text", "texto", "title", "titulo", "body", "mensaje", "message"]) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) return v.trim().slice(0, 140);
      }
    }
  } catch {
    /* nunca lanza */
  }
  return undefined;
}

/** El aviso de una llegada; `n` = cuántas de ese tipo desde el último aviso (incluida esta). Pura. */
export function avisoLlegada(it: NetworkInboundItem, n: number): AppNotifyInput {
  const t = TIPOS[it.type] ?? { uno: `Llegada «${it.type}»`, varios: `llegadas «${it.type}»`, icono: "Radio" };
  const titulo = n > 1 ? `${n} ${t.varios} de otras neuronas` : `${t.uno} de otra neurona`;
  const partes = [resumenCuerpo(it.body), it.verified ? "firma verificada" : null, it.account ? `cuenta ${corto(it.account)}` : null].filter(Boolean);
  return {
    appId: APP_SENALES,
    title: titulo,
    body: partes.length ? partes.join(" · ") : undefined,
    icon: t.icono,
    level: it.type === "alert" ? "warning" : "info",
    actions: [{ label: "Ver lo recibido", href: RUTA_LLEGADAS }],
    dedupeKey: `llegada:${it.id}`,
    popup: false,
  };
}

/** Monta el registro. Devuelve la función que lo desmonta (quita todas las suscripciones). Nunca lanza. */
export function crearRegistroSenalesControl(d: DepsRegistro): () => void {
  const avisar = (n: AppNotifyInput) => {
    try {
      d.notificar(n);
    } catch {
      /* un aviso que falla no para el registro */
    }
  };

  // 1) Lo recibido de otras neuronas.
  const vistos = new Set(d.bandeja.leer().map((i) => i.id));
  const ultimaPorTipo = new Map<string, number>();
  const sinAvisarPorTipo = new Map<string, number>();
  const alBandeja = () => {
    const items = d.bandeja.leer();
    // La bandeja pone lo nuevo delante: se recorre de lo más viejo a lo más nuevo.
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (vistos.has(it.id)) continue;
      vistos.add(it.id);
      if (NO_APUNTAR.has(it.type)) continue;
      const t = d.ahora();
      const n = (sinAvisarPorTipo.get(it.type) ?? 0) + 1;
      const ultima = ultimaPorTipo.get(it.type);
      if (ultima !== undefined && t - ultima < VENTANA_LLEGADAS_MS) {
        sinAvisarPorTipo.set(it.type, n);
        continue;
      }
      ultimaPorTipo.set(it.type, t);
      sinAvisarPorTipo.set(it.type, 0);
      avisar(avisoLlegada(it, n));
    }
    if (vistos.size > 500) {
      const vivos = new Set(items.map((x) => x.id));
      for (const id of vistos) if (!vivos.has(id)) vistos.delete(id);
    }
  };

  // 2) Sesiones de control que ESTA neurona abre hacia otras.
  let antes = new Map(d.sesiones.leer().map((s) => [s.para, s] as const));
  const alSesiones = () => {
    const ahora = new Map(d.sesiones.leer().map((s) => [s.para, s] as const));
    for (const [para, s] of ahora) {
      if (antes.has(para)) continue;
      avisar({
        appId: APP_SENALES,
        title: "Sesión de control abierta",
        body: `Con la neurona ${corto(para)} (nivel: ${s.nivel}).`,
        icon: "MonitorSmartphone",
        actions: [{ label: "Control entre neuronas", href: RUTA_CONTROL }],
        dedupeKey: `sesion-abierta:${para}:${corto(s.token)}`,
        popup: false,
      });
    }
    for (const [para, s] of antes) {
      if (ahora.has(para)) continue;
      avisar({
        appId: APP_SENALES,
        title: "Sesión de control terminada",
        body: `Con la neurona ${corto(para)}.`,
        icon: "MonitorOff",
        actions: [{ label: "Control entre neuronas", href: RUTA_CONTROL }],
        dedupeKey: `sesion-terminada:${para}:${corto(s.token)}`,
        popup: false,
      });
    }
    antes = ahora;
  };

  // 3) Peticiones de control que llegan a ESTA neurona (su aviso emergente sigue igual; aquí queda el registro).
  const vistasPet = new Set(d.peticiones.leer().map((a) => `${a.id}:${a.estado}`));
  const alPeticiones = () => {
    for (const a of d.peticiones.leer()) {
      const k = `${a.id}:${a.estado}`;
      if (vistasPet.has(k)) continue;
      vistasPet.add(k);
      avisar({
        appId: APP_SENALES,
        title: a.titulo,
        body: a.cuerpo,
        icon: "ShieldQuestion",
        level: "warning",
        actions: [{ label: a.boton || "Control entre neuronas", href: a.ruta || RUTA_CONTROL }],
        dedupeKey: `peticion:${k}`,
        popup: false,
      });
    }
  };

  // 4) Enlaces directos que fallan (uno por pareja y carril cada hora).
  const avisadoFallo = new Map<string, number>();
  for (const f of d.fallos.leer()) avisadoFallo.set(`${f.otra}:${f.lana}`, d.ahora());
  const alFallos = () => {
    const t = d.ahora();
    for (const f of d.fallos.leer()) {
      const k = `${f.otra}:${f.lana}`;
      const ultima = avisadoFallo.get(k);
      if (ultima !== undefined && t - ultima < VENTANA_FALLOS_MS) continue;
      avisadoFallo.set(k, t);
      avisar({
        appId: APP_SENALES,
        title: "Un enlace directo falló",
        body: `${d.fraseFallo(corto(f.otra), f)}. Se reintenta solo.`,
        icon: "Unplug",
        level: "warning",
        actions: [{ label: "Ver en Señales", href: "/senales" }],
        dedupeKey: `fallo:${k}:${f.at}`,
        popup: false,
      });
    }
  };

  const bajas: Array<() => void> = [];
  for (const [fuente, f] of [
    [d.bandeja, alBandeja],
    [d.sesiones, alSesiones],
    [d.peticiones, alPeticiones],
    [d.fallos, alFallos],
  ] as const) {
    try {
      bajas.push((fuente as Fuente<unknown>).suscribir(() => {
        try {
          f();
        } catch {
          /* nunca lanza */
        }
      }));
    } catch {
      /* una fuente que no se deja suscribir no para a las demás */
    }
  }
  return () => {
    for (const b of bajas) {
      try {
        b();
      } catch {
        /* */
      }
    }
  };
}
