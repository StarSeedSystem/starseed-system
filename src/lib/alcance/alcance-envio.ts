// Salida segura del alcance (INV1025O): evaluarEnvio exige aprobación humana
// (R2), huella del texto aprobado (SHA-256), confirmación escrita ENVIAR de una
// persona, canal publicado por la propia entidad (R1), supresión, cuotas y
// pausas, enlaces vivos (2xx hace menos de 15 min), pie honesto (R7) y nada
// automático para nivel alto. Módulo puro con reloj inyectado: usa Web Crypto
// (no node:crypto) para que también lo llame el cliente.

import { AJUSTES_DEFECTO, type EntradaEnvio, type VeredictoEnvio } from "./alcance-tipos";

/** Huella SHA-256 (Web Crypto) del texto aprobado, anclada al destino. */
export async function huellaTexto(
  asunto: string,
  cuerpo: string,
  destinoRef: string,
): Promise<string> {
  const datos = `${destinoRef}\n${asunto.trim()}\n${cuerpo.trim()}`;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(datos));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

const MINUTOS_ENLACE = 15;

/** Evalúa si un mensaje aprobado puede SALIR hoy, y por qué no, si no. */
export async function evaluarEnvio(entrada: EntradaEnvio): Promise<VeredictoEnvio> {
  const { propuesta, destino, ajustes = AJUSTES_DEFECTO, registro, suprimidos, ahora, enlaces, confirmacion } = entrada;
  const motivos: string[] = [];
  const dias = (fecha: string) => (ahora.getTime() - new Date(fecha).getTime()) / 86_400_000;
  const delDestino = registro
    .filter((r) => r.destinoId === destino.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ultimo = delDestino[0];

  if (suprimidos.includes(destino.id)) {
    motivos.push("El destino está suprimido: pidió no recibir más mensajes.");
  }
  if (destino.canalPublicado.trim() === "") {
    motivos.push("Sin canal publicado por la propia entidad, no hay destino honesto (R1).");
  }
  if (propuesta.medio !== destino.medio) {
    motivos.push("El medio de la propuesta no coincide con el medio del destino.");
  }
  if (propuesta.estado !== "aprobada" || !propuesta.aprobadaPorHumano) {
    motivos.push("Sin aprobación explícita de una persona no sale nada (R2).");
  }
  const huella = await huellaTexto(propuesta.asunto, propuesta.cuerpo, destino.id);
  if (huella !== propuesta.huellaAprobada) {
    motivos.push("El texto cambió después de aprobarse: hay que aprobarlo de nuevo.");
  }
  if (!(confirmacion.porPersona && confirmacion.texto.trim() === "ENVIAR")) {
    motivos.push("Falta la confirmación escrita ENVIAR de una persona.");
  }
  const hoy = ahora.toISOString().slice(0, 10);
  if (registro.filter((r) => r.fecha.slice(0, 10) === hoy).length >= ajustes.limite_diario) {
    motivos.push(`Se alcanzó el límite diario de mensajes (${ajustes.limite_diario}).`);
  }
  const pausado = delDestino.find((r) => r.estado === "no-contactar" || r.estado === "rebotada");
  if (pausado) {
    const diasPausa = pausado.estado === "no-contactar"
      ? ajustes.pausa_no_contactar_dias
      : ajustes.pausa_rechazo_dias;
    if (dias(pausado.fecha) < diasPausa) {
      motivos.push(`Pausa de ${diasPausa} días en vigor tras el último estado «${pausado.estado}».`);
    }
  }
  if (ultimo && ultimo.estado === "sin-respuesta") {
    if (delDestino.some((r) => r.recordatorio)) {
      motivos.push("El recordatorio único ya salió: queda esperar respuesta sin insistir.");
    } else if (dias(ultimo.fecha) < ajustes.recordatorio_dias) {
      motivos.push(`El recordatorio espera a los ${ajustes.recordatorio_dias} días sin respuesta.`);
    } else if (!propuesta.recordatorio) {
      motivos.push("Sobre un mensaje sin respuesta solo puede enviarse el recordatorio único.");
    }
  }
  for (const url of propuesta.enlaces) {
    const prova = enlaces.find((e) => e.url === url);
    if (prova && prova.codigo >= 200 && prova.codigo < 300) {
      if (ahora.getTime() - new Date(prova.verificadoEn).getTime() >= MINUTOS_ENLACE * 60_000) {
        motivos.push(`El enlace ${url} no está verificado hace menos de 15 minutos.`);
      }
    } else {
      motivos.push(`El enlace ${url} no responde 2xx hace menos de 15 minutos.`);
    }
  }
  if (propuesta.pie.identidad.trim() === "" || propuesta.pie.baja.trim() === "") {
    motivos.push("El pie exige la identidad real del remitente y la forma de no recibir más (R7).");
  }
  if (propuesta.automatico) {
    if (!ajustes.automatico.activo || !ajustes.automatico.validado) {
      motivos.push("El envío automático está apagado o sin validación.");
    }
    if (destino.nivel === "alto") {
      motivos.push("Un objetivo de nivel alto jamás sale por envío automático.");
    }
    if (propuesta.medio !== "correo-propio") {
      motivos.push("El envío automático solo está previsto por correo-propio.");
    }
  }
  return { puede: motivos.length === 0, motivos };
}
