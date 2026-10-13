// src/lib/imagenes/adaptadores/malla-imagenes.ts
// Adaptador de la MALLA para imágenes (IMG1011Fb): convierte el registro de
// neuronas ya existente (`network/malla-neuronas.ts` — cada neurona publica
// UNA vez al arrancar y al cambiar su ficha) en `NeuronaImg` para `planImagen`.
// Capa «neurona» = otro dispositivo de tu cuenta; capa «malla» = neurona de
// un grupo o comunidad que la ofreció. «Basta de ilusiones»: lo que la ficha
// no declara (VRAM, modelos instalados) no se inventa — queda en valores
// conservadores para que `cabe()` decida con honestidad.

import {
  snapshotMallaNeuronas,
  type DispositivoMallaRow,
  type FichaDispositivo,
  type NeuronaCercanaRow,
} from "@/lib/network/malla-neuronas";
import type { NeuronaImg } from "@/lib/imagenes/plan";
import type { MotorImg } from "@/lib/imagenes/modelos";

/** Modo RPC de stable-diffusion.cpp (repartir un modelo grande entre varias
 * máquinas): EXPERIMENTAL y APAGADO. No tiene autenticación, así que solo
 * podría usarse dentro de la malla privada, y aun así queda desactivado hasta
 * tener auth. No hay interruptor de usuario: encenderlo exige tocar esta
 * constante a propósito. */
export const RPC_SDCPP_MALLA = {
  activo: false,
  motivo:
    "El reparto RPC de stable-diffusion.cpp es experimental y no tiene autenticación; está apagado hasta que la malla privada lo proteja.",
} as const;

export function rpcSdcppDisponible(): boolean {
  return RPC_SDCPP_MALLA.activo;
}

/** Tope de uso por persona cuando usa neuronas de un grupo (lo fija su gobierno). */
export function topeUsoAlcanzado(generadasHoy: number, topeDiario: number): boolean {
  return topeDiario >= 0 && generadasHoy >= topeDiario;
}

/** Gobierno democrático del grupo: ofrecer tu GPU se vota; pasa con mayoría simple. */
export function votacionAprueba(votosAFavor: number, votosTotales: number): boolean {
  return votosTotales > 0 && votosAFavor * 2 > votosTotales;
}

/** GPU inferida de la plataforma declarada (heurística honesta, conservadora). */
export function gpuDesdePlataforma(plataforma: string | undefined): NeuronaImg["gpu"] {
  const p = (plataforma ?? "").toLowerCase();
  if (p.includes("darwin") || p.includes("mac") || p.includes("ios")) return "apple";
  if (p.includes("win") || p.includes("linux")) return "nvidia";
  return "ninguna";
}

/** RAM libre estimada (la mitad de la clase declarada, piso 1 GB). */
export function ramLibreDesdeClase(clase: FichaDispositivo["ramClase"] | undefined): number {
  const total =
    clase === ">16 GB" ? 32 : clase === "16 GB" ? 16 : clase === "8 GB" ? 8 : clase === "≤4 GB" ? 4 : 4;
  return Math.max(1, Math.floor(total / 2));
}

/** Motores que es razonable esperar según la GPU inferida (sdcpp y onnx-web siempre). */
export function motoresParaGpu(gpu: NeuronaImg["gpu"]): readonly MotorImg[] {
  return gpu === "ninguna" ? ["sdcpp", "onnx-web"] : ["sdcpp", "comfyui", "diffusers", "onnx-web"];
}

/** Dispositivo de la cuenta → NeuronaImg de capa «neurona». */
export function neuronaImgDeDispositivo(disp: DispositivoMallaRow): NeuronaImg {
  const gpu = gpuDesdePlataforma(disp.ficha?.plataforma || disp.plataforma);
  return {
    id: disp.neuronId,
    capa: "neurona",
    gpu,
    vramGB: null, // La ficha no declara VRAM: null = «desconocida», que `cabe()` trate.
    ramLibreGB: ramLibreDesdeClase(disp.ficha?.ramClase),
    motores: motoresParaGpu(gpu),
    instalados: [], // Sin catálogo de modelos publicado aún: nada instalado declarado.
    ocupada: !disp.online || disp.enlace.estado !== "conectado",
  };
}

/** Neurona cercana (grupo/comunidad) → capa «malla». El faro no publica
 * hierro, así que va con mínimos conservadores; si no le cabe nada, `planImagen`
 * lo dirá con su motivo, sin prometer lo que no sabemos. */
export function neuronaImgDeCercana(cerca: NeuronaCercanaRow): NeuronaImg {
  return {
    id: cerca.deviceId,
    capa: "malla",
    gpu: "ninguna",
    vramGB: null,
    ramLibreGB: 2,
    motores: ["sdcpp"],
    instalados: [],
    ocupada: false,
  };
}

/** Neuronas disponibles AHORA para `planImagen`: tuyas (sin este aparato) y
 * las de la malla. Lectura del snapshot ya mantenido por el motor de la malla;
 * no lanza sondas ni red propias. */
export function obtenerNeuronasParaImagen(): NeuronaImg[] {
  const { misDispositivos, cercanas } = snapshotMallaNeuronas();
  return [
    ...misDispositivos.filter((d) => !d.esEsteDispositivo && d.online).map(neuronaImgDeDispositivo),
    ...cercanas.map(neuronaImgDeCercana),
  ];
}
