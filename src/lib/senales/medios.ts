/**
 * medios — lo que se sabe de un MEDIO abierto y de «Tú», con la fuente de cada valor (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * «Una neurona por aparato»: cada forma de abrir el OS en un aparato es un medio (app nativa,
 * Chrome en Vercel, Chrome en localhost…). De los medios de OTROS aparatos solo se sabe lo que ellos
 * anuncian en la presencia en vivo (estado «declarado»); de ESTE medio, lo que mide el propio
 * navegador (estado «medido»).
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import { dato, haceTexto, noMedido } from "./fichas-base";
import type { CentroNeurona } from "./centro";
import type { Dato, EntradaYo, FichaMapa, MedioMapa } from "./tipos-vivo";

const TIPO_MEDIO: Record<PresenciaMedio["tipo"], string> = {
  "app-nativa": "app nativa",
  "app-instalada": "app instalada (PWA)",
  local: "navegador en localhost",
  "navegador-claude": "navegador integrado de Claude",
  navegador: "navegador web",
};

/** Las antenas que mide un medio (propio: medido aquí; ajeno: anunciado por él en la presencia). */
export function datosDeSenalesMedio(s: SenalesMedio, propio: boolean): Dato[] {
  const estado = propio ? "medido" : "declarado";
  const quien = propio ? "medido en este medio" : "lo anuncia ese medio en la presencia en vivo (lo mide él)";
  const internet = s.internet.enLinea
    ? ["en línea", s.internet.tipo, s.internet.efectivo, s.internet.mbps ? `~${s.internet.mbps} Mb/s` : null].filter(Boolean).join(" · ")
    : "sin internet";
  const malla = `${s.malla.pares} ${s.malla.pares === 1 ? "par" : "pares"} de tu cuenta`
    + (s.malla.otrasCuentas ? ` · ${s.malla.otrasCuentas} faros de otras cuentas` : "")
    + (s.malla.sinInternet ? ` · ${s.malla.sinInternet} directos sin internet` : "");
  return [
    dato("Internet", internet, `navigator.onLine + Network Information API · ${quien}`, estado),
    dato("Malla P2P", malla, `motor de la malla (canales WebRTC abiertos) · ${quien}`, estado),
    s.lora.estado === "sin-radio"
      ? noMedido("Radio LoRa", "radio Meshtastic", "no hay ningún radio conectado a ese medio")
      : dato("Radio LoRa", `${s.lora.transporte ?? "radio"} · ${s.lora.estado} · ${s.lora.nodos} nodos`, `radio Meshtastic · ${quien}`, estado),
    s.bluetooth.disponible === null
      ? noMedido("Bluetooth", "Web Bluetooth", "este navegador no expone si hay adaptador")
      : dato("Bluetooth", s.bluetooth.disponible ? "adaptador listo (sin escanear: pide un gesto)" : "apagado o sin adaptador", `Web Bluetooth getAvailability · ${quien}`, estado),
    s.serie.disponible
      ? dato("Serie / USB", `${s.serie.puertos} ${s.serie.puertos === 1 ? "puerto autorizado" : "puertos autorizados"}`, `Web Serial getPorts · ${quien}`, estado)
      : noMedido("Serie / USB", "Web Serial", "este medio no tiene Web Serial"),
    noMedido("Reticulum", "motor de la malla", s.reticulum.motivo),
  ];
}

export function crearMedio(m: PresenciaMedio, padreId: string, propio: boolean, enlazado: boolean, ahora: number): MedioMapa {
  const abierto = haceTexto(Date.parse(m.desde), ahora);
  const medio: Dato[] = [
    dato("Estado", m.visible ? "a la vista" : "abierto en segundo plano", "presencia en vivo de tu cuenta", "medido"),
    dato("Abierto desde", abierto, "presencia en vivo de tu cuenta", "medido"),
    dato("Tipo de medio", TIPO_MEDIO[m.tipo] ?? m.tipo, "clasificación del origen (app nativa, instalada, local, navegador…)", "declarado"),
    ...(m.plataforma ? [dato("Plataforma", m.plataforma, "lo anuncia ese medio", "declarado")] : []),
    dato("Último anuncio", haceTexto(m.t, ahora), "presencia en vivo de tu cuenta", "medido"),
    ...(enlazado ? [dato("Canal P2P", "es el medio con el que está abierto el enlace", "el id de sincronización del canal coincide con el de este medio", "medido")] : []),
  ];
  const ficha: FichaMapa = {
    titulo: m.etiqueta,
    subtitulo: propio ? "Otro medio abierto en este aparato" : "Medio abierto en otro aparato tuyo",
    resumen: "Una forma de abrir StarSeed OS en ese aparato. Estas son las antenas que mide ese medio ahora.",
    secciones: [
      { id: "medio", titulo: "Medio", datos: medio },
      { id: "senales", titulo: "Antenas que mide", datos: datosDeSenalesMedio(m.s, false) },
      { id: "posicion", titulo: "Dónde está", datos: [dato("Posición", "pegado a su aparato", "reglas del mapa", "declarado", "Un medio no tiene posición propia: orbita al aparato donde está abierto.")] },
    ],
  };
  return {
    id: `medio:${m.m}`, m: m.m, neuronaId: m.n, padreId, etiqueta: m.etiqueta, tipo: m.tipo,
    visible: m.visible, propio, desde: m.desde, ...(enlazado ? { enlazado: true } : {}), ficha,
  };
}

/** Ficha de «Tú»: el aparato, el medio desde el que abres el OS, tus antenas y tu radio. */
export function fichaDeYo(yo: EntradaYo, oidas: number, centro: CentroNeurona | null = null): FichaMapa {
  const r = yo.radio;
  const aparato: Dato[] = [
    yo.nombre
      ? dato("Aparato", yo.nombre, "registro de neuronas de tu cuenta", "declarado")
      : noMedido("Aparato", "registro de neuronas de tu cuenta", "esta neurona aún no tiene nombre en el registro"),
    yo.plataforma
      ? dato("Plataforma", yo.plataforma, "navegador / sistema", "declarado")
      : noMedido("Plataforma", "navegador / sistema", "no la declara este navegador"),
    yo.medio
      ? dato("Medio (desde dónde abres el OS)", yo.medio.etiqueta, "origen y modo de ejecución de esta pestaña", "medido")
      : noMedido("Medio", "origen de esta pestaña", "no se pudo identificar"),
  ];
  const lora: Dato[] = [
    r.estado === "sin-radio"
      ? noMedido("Radio LoRa", "radio Meshtastic", "no hay ningún radio conectado a esta neurona")
      : dato("Radio LoRa", `${r.transporte ?? "radio"} · ${r.estado} · ${r.nodos} ${r.nodos === 1 ? "nodo" : "nodos"} al alcance`, "radio Meshtastic conectado", "medido"),
    r.region ? dato("Región LoRa", r.region, "configuración leída del radio", "declarado") : noMedido("Región LoRa", "configuración del radio", "sin radio o sin región configurada"),
    r.gps
      ? dato("Posición GPS de tu radio", "sí: los nodos con GPS se colocan por rumbo y distancia reales", "nodo local de la malla", "medido")
      : noMedido("Posición GPS de tu radio", "nodo local de la malla", "tu radio no comparte su posición: los nodos se colocan por RF o por calidad"),
  ];
  if (r.simulador) lora.push(dato("Simulador", "activo: los nodos LoRa con aro ámbar NO existen en el aire", "motor de la malla", "declarado"));
  return {
    titulo: centro ? `Tú · ${centro.nombreNeurona}` : "Tú · esta neurona",
    subtitulo: yo.medio?.etiqueta ?? yo.nombre,
    resumen: `El centro del mapa: todo se mide desde aquí. ${oidas > 0 ? `Tus otros aparatos comparten ${oidas} ${oidas === 1 ? "señal" : "señales"} que oyen (se ven al tocar cada aparato).` : "Ningún otro aparato tuyo ha compartido señales ahora."}`,
    secciones: [
      ...(centro ? [{ id: "neurona", titulo: "Mi neurona y mi perfil", datos: centro.datos }] : []),
      { id: "aparato", titulo: "Tu aparato", datos: aparato },
      { id: "antenas", titulo: "Tus antenas ahora", datos: yo.senales ? datosDeSenalesMedio(yo.senales, true) : [noMedido("Antenas de este medio", "medición local", "todavía no se midieron")] },
      { id: "lora", titulo: "Tu radio LoRa", datos: lora },
    ],
  };
}
