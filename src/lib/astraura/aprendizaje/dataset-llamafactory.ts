// Dataset para LlamaFactory (Ola 1025R) — módulo PURO: sin red y sin `node:*`.
// Convierte valoraciones y correcciones de Astraura en datasets SFT y KTO por
// ámbito, con la regla de privacidad de Astraura y descarte de secretos.
// Formato «sharegpt» con `messages`; KTO añade la columna booleana `label`.

import type { Experiencia } from "../experiencias";
import type { AjustesAprendizaje } from "../experiencias-aprendizaje";

export type DestinoModelo = "privado" | "ambito" | "publico";
export type Parte = "train" | "val" | "test";
export interface Mensaje { role: "user" | "assistant"; content: string; }
export interface FilaSft { messages: Mensaje[]; parte: Parte; }
export interface FilaKto extends FilaSft { label: boolean; }
export interface OpcionesDataset { ambito: string; destino: DestinoModelo; nombre: string; }
export interface DatasetLlamaFactory { sft: FilaSft[]; kto: FilaKto[]; partes: { train: number; val: number; test: number }; descartadas: Record<string, number>; info: Record<string, object>; }

export function permitido(
    destino: DestinoModelo,
    ambito: string,
    ajustes: AjustesAprendizaje,
): { ok: boolean; motivo?: string } {
    if (destino === "privado") return { ok: true };
    if (!ajustes.aprendizajeColectivo) return { ok: false, motivo: "El aprendizaje colectivo está apagado" };
    const a = ajustes.porAmbito[ambito];
    if (!a || !a.permite) return { ok: false, motivo: `El ámbito «${ambito}» no permite compartir lo aprendido` };
    if (a.privacidad === "privada") return { ok: false, motivo: `El ámbito «${ambito}» es privado` };
    if (destino === "publico" && a.privacidad !== "publica") return { ok: false, motivo: `El ámbito «${ambito}» no es público` };
    return { ok: true };
}

const SECRETOS: readonly RegExp[] = [/sk-[A-Za-z0-9]{16,}/, /AIza[0-9A-Za-z_-]{20,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

function tieneSecreto(textos: string[]): boolean {
    return SECRETOS.some((re) => textos.some((t) => re.test(t)));
}

// FNV-1a: reparto 80/10/10 estable por id (nunca por posición ni por azar).
function parteDe(id: string): Parte {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i += 1) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    const tramo = h % 100;
    return tramo < 80 ? "train" : tramo < 90 ? "val" : "test";
}

function infoDatasets(nombre: string): Record<string, object> {
    const tags = { role_tag: "role", content_tag: "content", user_tag: "user", assistant_tag: "assistant" };
    const base = { formatting: "sharegpt", tags };
    return {
        [`${nombre}_sft`]: { ...base, file_name: `${nombre}_sft.json`, columns: { messages: "messages" } },
        [`${nombre}_kto`]: { ...base, file_name: `${nombre}_kto.json`, columns: { messages: "messages", kto_tag: "label" } },
    };
}

function sumar(cuenta: Record<string, number>, motivo: string): void {
    cuenta[motivo] = (cuenta[motivo] ?? 0) + 1;
}

export function paraLlamaFactory(
    exps: Experiencia[],
    ajustes: AjustesAprendizaje,
    op: OpcionesDataset,
): DatasetLlamaFactory {
    const descartadas: Record<string, number> = {};
    const sft: FilaSft[] = [];
    const kto: FilaKto[] = [];
    const partes = { train: 0, val: 0, test: 0 };
    const info = infoDatasets(op.nombre);
    const delAmbito = exps.filter(
        (e) => (e.tipo === "valoracion" || e.tipo === "correccion") && (e.ambito ?? e.dominio ?? "") === op.ambito,
    );
    if (!permitido(op.destino, op.ambito, ajustes).ok) {
        descartadas.bloqueado = delAmbito.length;
        return { sft, kto, partes, descartadas, info };
    }
    const vistas = new Set<string>();
    for (const e of delAmbito) {
        const entrada = typeof e.entrada === "string" ? e.entrada : "";
        const salida = typeof e.salida === "string" ? e.salida : null;
        const esCorreccion = e.tipo === "correccion";
        const correccion = typeof e.correccion === "string" ? e.correccion : "";
        if (entrada.trim() === "") { sumar(descartadas, "entrada-vacia"); continue; }
        if (salida === null) { sumar(descartadas, "salida-no-texto"); continue; }
        if (salida.trim() === "" || (esCorreccion && correccion.trim() === "")) {
            sumar(descartadas, "texto-vacio");
            continue;
        }
        const firma = [entrada, salida, esCorreccion ? correccion : ""].join("\u0000");
        if (vistas.has(firma)) { sumar(descartadas, "duplicado"); continue; }
        if (tieneSecreto([entrada, salida, esCorreccion ? correccion : ""])) {
            sumar(descartadas, "secreto");
            continue;
        }
        vistas.add(firma);
        const parte = parteDe(e.id);
        const user: Mensaje = { role: "user", content: entrada };
        const pushSft = (respuesta: string) => {
            sft.push({ messages: [user, { role: "assistant", content: respuesta }], parte });
            partes[parte] += 1;
        };
        const pushKto = (respuesta: string, label: boolean) => {
            kto.push({ messages: [user, { role: "assistant", content: respuesta }], label, parte });
        };
        if (esCorreccion) {
            pushSft(correccion);
            pushKto(salida, false);
            pushKto(correccion, true);
        } else if (e.valoracion === "positiva") {
            pushSft(salida);
            pushKto(salida, true);
        } else if (e.valoracion === "negativa") {
            pushKto(salida, false);
        } else {
            sumar(descartadas, "sin-valoracion");
        }
    }
    return { sft, kto, partes, descartadas, info };
}
