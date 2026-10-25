/**
 * Imágenes locales de Astraura · CATÁLOGO DE MODELOS Y MOTORES (IMG1011). Contrato: architecture/astraura-imagenes.md §2.
 *
 * Tabla (dato) verificada el 2026-10-11 contra Hugging Face y GitHub: licencia, si está «gated» (hay que
 * aceptar sus términos con una cuenta de Hugging Face para descargarlo), qué motores lo ejecutan y qué sabe
 * hacer. La MEMORIA es orientativa (gama declarada por Alex y los autores): el instalador mide el pico real
 * en cada neurona y esa medida manda (`memoriaNecesaria`). El explorador de la Biblioteca añade modelos
 * nuevos; nada no comercial se ofrece para un uso comercial. PURO.
 */
import type { UsoLicencia } from "@/lib/avatares/adn/adn";

export const FECHA_VERIFICACION_IMAGENES = "2026-10-16";

export const MOTORES_IMG = ["sdcpp", "comfyui", "diffusers", "onnx-web", "a1111-forge"] as const;
export type MotorImg = (typeof MOTORES_IMG)[number];
export const CAPACIDADES_IMG = ["texto-a-imagen", "edicion", "texto-legible", "transparencia", "multi-referencia", "rapido"] as const;
export type CapacidadImg = (typeof CAPACIDADES_IMG)[number];
export type Gama = "navegador" | "entrada" | "media" | "alta";

export interface InfoMotorImg { nombre: string; licencia: string; corre: string; fuente: string; nota?: string }

/** Programas que ejecutan los modelos. stable-diffusion.cpp es la base universal: CPU, Metal, CUDA, Vulkan… */
export const MOTORES: Record<MotorImg, InfoMotorImg> = {
  sdcpp: {
    nombre: "stable-diffusion.cpp", licencia: "MIT", corre: "CPU, Metal (Mac), CUDA, Vulkan, OpenCL, SYCL; pesos GGUF cuantizados",
    fuente: "https://github.com/leejet/stable-diffusion.cpp",
    nota: "Base universal: corre hasta en la A1 (CPU) y en una Mac de 8 GB con modelos pequeños. Su modo RPC (repartir el cálculo entre máquinas) es experimental y SIN autenticación: solo dentro de la malla privada.",
  },
  comfyui: {
    nombre: "ComfyUI", licencia: "GPL-3.0", corre: "NVIDIA, AMD, Intel, Apple Silicon; desde 4 GB de VRAM + 8 GB de RAM con streaming de pesos",
    fuente: "https://github.com/Comfy-Org/ComfyUI", nota: "API local para flujos; el más completo para NVIDIA. URL canónica (Comfy-Org).",
  },
  diffusers: { nombre: "Diffusers (Hugging Face)", licencia: "Apache-2.0", corre: "PyTorch: NVIDIA, Apple (MPS) y CPU", fuente: "https://github.com/huggingface/diffusers" },
  "onnx-web": {
    nombre: "ONNX Runtime Web + WebGPU", licencia: "MIT", corre: "En la pestaña del navegador con WebGPU, sin instalar nada",
    fuente: "https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/sd-turbo",
  },
  "a1111-forge": {
    nombre: "SD WebUI Forge (API de AUTOMATIC1111)", licencia: "AGPL-3.0", corre: "NVIDIA sobre todo",
    fuente: "https://github.com/lllyasviel/stable-diffusion-webui-forge",
    nota: "Su tabla de estado se actualizó por última vez en 2024: solo compatibilidad con quien ya lo tenga (el OS ya habla su API).",
  },
};

export interface ModeloImagen {
  id: string;
  nombre: string;
  gama: Gama;
  /** VRAM orientativa en GPU con su forma habitual (cuantizada cuando existe). */
  vramGB: number;
  /** RAM orientativa para correrlo en CPU o en la memoria unificada de una Mac (stable-diffusion.cpp, GGUF). 0 = no corre así. */
  ramGB: number;
  motores: readonly MotorImg[];
  licencia: string;
  uso: UsoLicencia;
  /** Hay que aceptar sus términos con cuenta de Hugging Face antes de descargar. */
  gated: boolean;
  /** Tamaño del repositorio completo en Hugging Face (todas las variantes); lo que se descarga es menos. */
  repoGB?: number;
  pasos: number;
  resolucion: number;
  capacidades: readonly CapacidadImg[];
  hf: string;
  codigo?: string;
  /** Space público de Hugging Face verificado en marcha (GPU gratis con cuota por persona). */
  espacio?: string;
  nota?: string;
}

const TODO: readonly MotorImg[] = ["sdcpp", "comfyui", "diffusers", "a1111-forge"];

export const MODELOS_IMAGEN: readonly ModeloImagen[] = [
  {
    id: "sd-turbo", nombre: "SD-Turbo", gama: "navegador", vramGB: 4, ramGB: 4, motores: ["onnx-web", "sdcpp"],
    licencia: "Stability AI (su LICENSE.md; sin etiqueta en Hugging Face)", uso: "condicionado", gated: false, repoGB: 13,
    pasos: 1, resolucion: 512, capacidades: ["texto-a-imagen", "rapido"], hf: "stabilityai/sd-turbo",
    nota: "Corre en la pestaña con WebGPU (Microsoft lo muestra en menos de 1 s en una RTX 4090). Licencia sin comprobar del todo.",
  },
  {
    id: "sd15", nombre: "Stable Diffusion 1.5", gama: "entrada", vramGB: 4, ramGB: 4, motores: TODO,
    licencia: "CreativeML OpenRAIL-M", uso: "libre", gated: false, pasos: 25, resolucion: 512,
    capacidades: ["texto-a-imagen"], hf: "stable-diffusion-v1-5/stable-diffusion-v1-5",
    nota: "El repositorio de runwayml ya no existe: la réplica oficial es stable-diffusion-v1-5. OpenRAIL: libre con normas de uso responsable.",
  },
  {
    id: "pixart-sigma", nombre: "PixArt-Σ XL 1024", gama: "entrada", vramGB: 6, ramGB: 8, motores: ["sdcpp", "diffusers"],
    licencia: "OpenRAIL++", uso: "libre", gated: false, repoGB: 24.3, pasos: 20, resolucion: 1024,
    capacidades: ["texto-a-imagen"], hf: "PixArt-alpha/PixArt-Sigma-XL-2-1024-MS", codigo: "https://github.com/PixArt-alpha/PixArt-sigma",
  },
  {
    id: "sana-1600m", nombre: "Sana 1.6B 1024 (NVIDIA)", gama: "entrada", vramGB: 6, ramGB: 0, motores: ["diffusers"],
    licencia: "Apache-2.0 (según su ficha en Hugging Face)", uso: "libre", gated: false, repoGB: 6.4, pasos: 20, resolucion: 1024,
    capacidades: ["texto-a-imagen", "rapido"], hf: "Efficient-Large-Model/Sana_1600M_1024px", codigo: "https://github.com/NVlabs/Sana",
    nota: "No figura en stable-diffusion.cpp: va por Diffusers (PyTorch).",
  },
  {
    id: "sdxl", nombre: "SDXL 1.0", gama: "media", vramGB: 8, ramGB: 8, motores: TODO,
    licencia: "CreativeML OpenRAIL++-M", uso: "libre", gated: false, repoGB: 77.4, pasos: 30, resolucion: 1024,
    capacidades: ["texto-a-imagen"], hf: "stabilityai/stable-diffusion-xl-base-1.0",
  },
  {
    id: "sd35-medium", nombre: "Stable Diffusion 3.5 Medium", gama: "media", vramGB: 10, ramGB: 12, motores: ["sdcpp", "comfyui", "diffusers"],
    licencia: "Stability AI Community License", uso: "condicionado", gated: true, repoGB: 36.3, pasos: 28, resolucion: 1024,
    capacidades: ["texto-a-imagen", "texto-legible"], hf: "stabilityai/stable-diffusion-3.5-medium",
  },
  {
    id: "sd35-large", nombre: "Stable Diffusion 3.5 Large", gama: "alta", vramGB: 16, ramGB: 24, motores: ["sdcpp", "comfyui", "diffusers"],
    licencia: "Stability AI Community License", uso: "condicionado", gated: true, repoGB: 75.5, pasos: 28, resolucion: 1024,
    capacidades: ["texto-a-imagen", "texto-legible"], hf: "stabilityai/stable-diffusion-3.5-large",
  },
  {
    id: "flux1-schnell", nombre: "FLUX.1 [schnell]", gama: "media", vramGB: 12, ramGB: 16, motores: TODO,
    licencia: "Apache-2.0", uso: "libre", gated: true, repoGB: 58.1, pasos: 4, resolucion: 1024,
    capacidades: ["texto-a-imagen", "texto-legible", "rapido"], hf: "black-forest-labs/FLUX.1-schnell", codigo: "https://github.com/black-forest-labs/flux",
    espacio: "black-forest-labs/FLUX.1-schnell",
  },
  {
    id: "flux1-dev", nombre: "FLUX.1 [dev]", gama: "media", vramGB: 12, ramGB: 16, motores: TODO,
    licencia: "FLUX.1 [dev] Non-Commercial License", uso: "no-comercial", gated: true, repoGB: 69.5, pasos: 28, resolucion: 1024,
    capacidades: ["texto-a-imagen", "texto-legible"], hf: "black-forest-labs/FLUX.1-dev", codigo: "https://github.com/black-forest-labs/flux",
    nota: "Cuantizaciones GGUF de la comunidad (Q2_K a Q8_0, sin gate, misma licencia): city96/FLUX.1-dev-gguf.",
  },
  {
    id: "qwen-image", nombre: "Qwen-Image", gama: "alta", vramGB: 24, ramGB: 32, motores: ["sdcpp", "comfyui", "diffusers"],
    licencia: "Apache-2.0", uso: "libre", gated: false, repoGB: 58, pasos: 30, resolucion: 1024,
    capacidades: ["texto-a-imagen", "texto-legible"], hf: "Qwen/Qwen-Image", codigo: "https://github.com/QwenLM/Qwen-Image", espacio: "Qwen/Qwen-Image",
    nota: "La opción Qwen de uso comercial libre.",
  },
  {
    id: "qwen-image-2.1", nombre: "Qwen-Image 2.1", gama: "alta", vramGB: 24, ramGB: 32, motores: ["sdcpp", "comfyui", "diffusers"],
    licencia: "Qwen Research License (solo investigación o evaluación)", uso: "no-comercial", gated: false, repoGB: 47.4, pasos: 30, resolucion: 1024,
    capacidades: ["texto-a-imagen", "edicion", "texto-legible", "transparencia", "multi-referencia"], hf: "Qwen/Qwen-Image-2.1",
    codigo: "https://github.com/QwenLM/Qwen-Image-2.1",
    nota: "2026-09-20: genera y edita en un modelo, hasta 10 referencias, transparencia nativa. Uso comercial solo con licencia aparte de Qwen. Su Space corre en CPU básica (probablemente llama a un servicio de Qwen): sin comprobar, no se usa como capa.",
  },
  {
    id: "krea-2-turbo", nombre: "Krea 2 Turbo", gama: "alta", vramGB: 16, ramGB: 24, motores: ["sdcpp", "comfyui"],
    licencia: "Krea 2 Community License (código Apache-2.0)", uso: "no-comercial", gated: true, repoGB: 62.5, pasos: 8, resolucion: 1024,
    capacidades: ["texto-a-imagen", "rapido"], hf: "krea/Krea-2-Turbo", codigo: "https://github.com/krea-ai/krea-2",
    nota: "Estilo y exploración creativa; uso comercial con licencia de pago de Krea. Krea-2-Raw es la base para afinar. VRAM sin publicar.",
  },
  {
    id: "qwen-image-2.1-turbo", nombre: "Qwen-Image 2.1-Turbo", gama: "alta", vramGB: 24, ramGB: 32, motores: ["sdcpp", "comfyui", "diffusers"],
    licencia: "Qwen Research License (solo investigación o evaluación)", uso: "no-comercial", gated: false, repoGB: 28, pasos: 8, resolucion: 1024,
    capacidades: ["texto-a-imagen", "edicion", "texto-legible", "transparencia", "multi-referencia", "rapido"], hf: "Qwen/Qwen-Image-2.1-Turbo",
    codigo: "https://github.com/QwenLM/Qwen-Image-2.1-Turbo",
    nota: "2026-10-09: misma arquitectura 7B que Qwen-Image 2.1 en 8 pasos y CFG 1. Transformer 14,2 GB en bf16 + codificador de texto Qwen3-VL 8B de 17,5 GB + VAE 0,68 GB. GGUF en unsloth/Qwen-Image-2.1-Turbo-GGUF (Q2_K 2,47 GB · Q3_K_S 2,72 · Q3_K_M 3,17 · Q4_K_M 4,2 · F16 14,2). ComfyUI con archivos de Comfy-Org. Licencia “no-comercial”: solo investigación o evaluación, comercial con licencia aparte de Qwen.",
  },
  {
    id: "z-image-turbo", nombre: "Z-Image Turbo", gama: "alta", vramGB: 16, ramGB: 24, motores: ["diffusers"],
    licencia: "Apache-2.0", uso: "libre", gated: true, repoGB: 12, pasos: 4, resolucion: 1024,
    capacidades: ["texto-a-imagen", "rapido"], hf: "Tongyi-MAI/Z-Image-Turbo",
    nota: "2025-11-25: modelo rápido de pocos pasos. Apache-2.0 (uso: “libre”). Comprobado en su ficha los pasos y la resolución. No se encontró GGUF publicado. Datos no verificables dejados fuera y se dice en nota.",
  },
];

export const modeloPorId = (id: string): ModeloImagen | undefined => MODELOS_IMAGEN.find((m) => m.id === id);

/** Memoria que de verdad necesita en esta neurona: la medida del instalador si existe; si no, la orientativa. */
export function memoriaNecesaria(m: ModeloImagen, donde: "gpu" | "cpu", medidaGB?: number): number {
  if (typeof medidaGB === "number" && Number.isFinite(medidaGB) && medidaGB > 0) return medidaGB;
  return donde === "gpu" ? m.vramGB : m.ramGB;
}
