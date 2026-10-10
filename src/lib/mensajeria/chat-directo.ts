"use client";

import type { MensajeEntrante, ResultadoEnvio } from "@/lib/malla/transporte-universal";

export interface MensajeChatDirecto {
  id: string;
  uid: string;
  h: string;
  txt: string;
  at: number;
  dir: "sale" | "entra";
  enlace: string | null;
  confirmado: boolean;
  subido: boolean;
  origen?: string;
}

export interface AlmacenChat {
  get(k: string): string | null;
  set(k: string, v: string): void;
}

export interface DepsChatDirecto {
  enviar?: (
    destino: { uid: string },
    canal: string,
    cuerpo: unknown,
  ) => Promise<ResultadoEnvio>;
  alRecibir?: (canal: string, cb: (m: MensajeEntrante) => void) => () => void;
  almacen?: AlmacenChat;
}

const CLAVE = "starseed.chat.directo.v1";
const MAX = 200;

function almacenReal(): AlmacenChat {
  return {
    get: (k) => (typeof localStorage === "undefined" ? null : localStorage.getItem(k)),
    set: (k, v) => {
      if (typeof localStorage !== "undefined") localStorage.setItem(k, v);
    },
  };
}

function leerBandeja(a: AlmacenChat): MensajeChatDirecto[] {
  try {
    const crudo = a.get(CLAVE);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? (datos as MensajeChatDirecto[]) : [];
  } catch {
    return [];
  }
}

function guardar(a: AlmacenChat, lista: MensajeChatDirecto[]): void {
  try {
    a.set(CLAVE, JSON.stringify(lista.slice(0, MAX)));
  } catch {
    /* sin espacio o sin almacen: no pasa nada */
  }
}

function anadir(a: AlmacenChat, m: MensajeChatDirecto): void {
  const lista = leerBandeja(a);
  lista.unshift(m);
  guardar(a, lista);
}

function nuevoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function enviarReal() {
  const m = await import("@/lib/malla/transporte-universal");
  return m.enviarMensaje;
}

/** Envía un chat directo sin internet; pase lo que pase, queda en la bandeja local. */
export async function enviarChatDirecto(
  { uidDestino, hiloId, texto }: { uidDestino: string; hiloId: string; texto: string },
  deps: DepsChatDirecto = {},
): Promise<ResultadoEnvio> {
  const almacen = deps.almacen ?? almacenReal();
  const enviar = deps.enviar ?? (await enviarReal());
  const txt = texto.slice(0, 4000);
  let r: ResultadoEnvio;
  try {
    r = await enviar({ uid: uidDestino }, "chat", { h: hiloId, txt, at: Date.now() });
  } catch {
    r = { ok: false, confirmado: false, enlace: null, intentos: [], descartados: [] };
  }
  anadir(almacen, {
    id: nuevoId(),
    uid: uidDestino,
    h: hiloId,
    txt,
    at: Date.now(),
    dir: "sale",
    enlace: r.enlace?.tipo ?? null,
    confirmado: r.confirmado,
    subido: false,
  });
  return r;
}

/** Escucha chats directos entrantes; valida la forma antes de guardar y avisar. */
export function alRecibirChatDirecto(
  cb: (m: MensajeChatDirecto) => void,
  deps: DepsChatDirecto = {},
): () => void {
  const almacen = deps.almacen ?? almacenReal();
  const alRecibir =
    deps.alRecibir ??
    ((canal: string, f: (m: MensajeEntrante) => void) => {
      let cancelar: () => void = () => {};
      void import("@/lib/malla/transporte-universal").then((m) => {
        cancelar = m.alRecibirMensaje(canal, f);
      });
      return () => cancelar();
    });
  return alRecibir("chat", (m) => {
    const c = m.cuerpo as { h?: unknown; txt?: unknown } | null;
    if (
      !c ||
      typeof c.h !== "string" ||
      c.h.length > 80 ||
      typeof c.txt !== "string" ||
      c.txt.length > 4000
    ) {
      return;
    }
    const msg: MensajeChatDirecto = {
      id: m.id,
      uid: m.origen.syncDeviceId ?? m.origen.etiqueta,
      h: c.h,
      txt: c.txt,
      at: m.at,
      dir: "entra",
      enlace: m.origen.tipo,
      confirmado: true,
      subido: false,
      origen: m.origen.etiqueta,
    };
    anadir(almacen, msg);
    cb(msg);
  });
}

/** Lista la bandeja local, la más nueva primero. */
export function bandejaChatDirecto(deps: DepsChatDirecto = {}): MensajeChatDirecto[] {
  return leerBandeja(deps.almacen ?? almacenReal());
}

/** Marca un mensaje como ya subido a la nube. */
export function marcarSubido(id: string, deps: DepsChatDirecto = {}): boolean {
  const almacen = deps.almacen ?? almacenReal();
  const lista = leerBandeja(almacen);
  const m = lista.find((x) => x.id === id);
  if (!m) return false;
  m.subido = true;
  guardar(almacen, lista);
  return true;
}
