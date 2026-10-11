/**
 * Avatares 3D · MOTORES DEL TALLER (AV1011). Contrato: architecture/astraura-avatares-3d.md §4.
 *
 * Tabla (dato, no lógica) de lo que puede hacer cada etapa del taller de avatares: generar una malla
 * desde una imagen o un texto, remallarla, ponerle esqueleto, mejorar el detalle y animarla. Cada
 * motor dice qué necesita (cualquiera de sus `necesita` basta), en qué estado está DE VERDAD hoy y
 * qué obliga su licencia. Verificado el 2026-10-11 contra sus páginas; lo no comprobado va en `nota`.
 * «Basta de ilusiones»: lo que solo es un artículo o no tiene código NO se elige nunca.
 */
import type { Esqueleto, UsoLicencia } from "./adn";

export const ETAPAS = ["generar", "remallar", "riggear", "detallar", "animar"] as const;
export type Etapa = (typeof ETAPAS)[number];

/** `espacio-hf` = un Space público de Hugging Face con GPU gratis (cuota diaria): NO es local, la imagen sale de tu aparato. */
export const REQUISITOS_3D = ["navegador", "cpu", "blender", "apple-silicon-32gb", "cuda-8gb", "cuda-16gb", "clave-externa", "espacio-hf"] as const;
export type Requisito3D = (typeof REQUISITOS_3D)[number];

/** listo = se puede instalar y usar hoy; pesos-sin-codigo = falta publicar la inferencia; solo-articulo = sin código. */
export type EstadoMotor = "listo" | "pesos-sin-codigo" | "solo-articulo" | "de-pago";

export interface Motor3D {
  id: string;
  etapa: Etapa;
  nombre: string;
  necesita: readonly Requisito3D[];
  estado: EstadoMotor;
  licencia: string;
  uso: UsoLicencia;
  regionesExcluidas?: readonly string[];
  atribucion?: string;
  /** Solo en «animar»: esqueletos que sabe mover. */
  esqueletos?: readonly Esqueleto[];
  minutosAprox?: number;
  /** 1 … 5, orientativa (lo que dicen sus autores y image-to-3dlab); el taller la corrige con sus mediciones. */
  fidelidad?: number;
  /** Corre fuera de la neurona (servicio o Space): solo con permiso y siempre detrás de lo local. */
  remoto?: boolean;
  fuente: string;
  nota?: string;
}

export const FECHA_VERIFICACION_MOTORES = "2026-10-11";
const TODOS: readonly Esqueleto[] = ["vrm-humanoide", "soma30", "smplx22", "libre"];

export const MOTORES_3D: readonly Motor3D[] = [
  /* ── generar (imagen o texto → malla con textura) ── */
  {
    id: "hunyuan3d-mlx", etapa: "generar", nombre: "Hunyuan3D 2 en MLX (vía image-to-3dlab)", necesita: ["apple-silicon-32gb"],
    estado: "listo", licencia: "MIT (código) · Tencent Hunyuan Community (pesos)", uso: "restringido-region",
    regionesExcluidas: ["EU", "GB", "KR"], minutosAprox: 9, fidelidad: 3, fuente: "https://github.com/Bingeljell/image-to-3dlab",
    nota: "Los pesos de Tencent no tienen licencia para la UE, el Reino Unido ni Corea del Sur.",
  },
  {
    id: "trellis2", etapa: "generar", nombre: "TRELLIS.2 (Microsoft)", necesita: ["cuda-16gb", "apple-silicon-32gb"],
    estado: "listo", licencia: "MIT + licencia de DINOv3", uso: "condicionado", minutosAprox: 14, fidelidad: 4,
    fuente: "https://github.com/Bingeljell/image-to-3dlab", nota: "En Mac M5 de 32 GB tarda 14–78 min; en NVIDIA mucho menos.",
  },
  {
    id: "stable-fast-3d", etapa: "generar", nombre: "Stable Fast 3D", necesita: ["apple-silicon-32gb", "cuda-8gb"],
    estado: "listo", licencia: "Stability AI Community License", uso: "condicionado", minutosAprox: 1, fidelidad: 2,
    fuente: "https://github.com/Bingeljell/image-to-3dlab", nota: "El más rápido y el de menos detalle; licencia con tope de ingresos.",
  },
  {
    id: "pixal3d", etapa: "generar", nombre: "Pixal3D (Tencent ARC, píxeles alineados a 3D)", necesita: ["cuda-16gb"],
    estado: "listo", licencia: "MIT (código y pesos); terceros según su NOTICE", uso: "condicionado", fidelidad: 5,
    fuente: "https://github.com/TencentARC/Pixal3D",
    nota: "SIGGRAPH 2026; GLB con texturas PBR. Solo NVIDIA (natten con CUDA), sin Mac. VRAM mínima no publicada: modo de poca VRAM a 1024 (normal 1536). Se apoya en TRELLIS.2 (DINOv3): uso comercial sin comprobar. Pesos ~46 GB con todas las variantes.",
  },
  {
    id: "pixal3d-espacio", etapa: "generar", nombre: "Pixal3D en su Space de Hugging Face (GPU gratis con cuota)", necesita: ["espacio-hf"],
    estado: "listo", licencia: "MIT (código y pesos); terceros según su NOTICE", uso: "condicionado", fidelidad: 5, remoto: true,
    fuente: "https://huggingface.co/spaces/TencentARC/Pixal3D",
    nota: "NO es local: la imagen sale a Hugging Face. Solo con permiso expreso, nunca con fotos de personas sin su consentimiento. Cuota diaria gratuita limitada (ZeroGPU A10G).",
  },
  {
    id: "filigree3d", etapa: "generar", nombre: "Filigree3D (ultra alta resolución)", necesita: ["cuda-16gb"],
    estado: "solo-articulo", licencia: "sin publicar", uso: "condicionado", fidelidad: 5, fuente: "https://arxiv.org/abs/2609.34900",
    nota: "Artículo del 2026-09-28 sin código ni pesos enlazados: la Biblioteca vigila su publicación.",
  },
  {
    id: "meshy", etapa: "generar", nombre: "Meshy (servicio)", necesita: ["clave-externa"], estado: "de-pago",
    licencia: "CC BY 4.0 en el plan gratis; privada en los de pago", uso: "atribucion", atribucion: "Modelo 3D generado con Meshy",
    fidelidad: 4, remoto: true,
    fuente: "https://www.meshy.ai", nota: "100 créditos/mes gratis; el acceso por API no está confirmado en el plan gratis.",
  },
  {
    id: "tripo", etapa: "generar", nombre: "Tripo (servicio)", necesita: ["clave-externa"], estado: "de-pago",
    licencia: "términos de Tripo", uso: "condicionado", fidelidad: 3, remoto: true, fuente: "https://www.tripo3d.ai", nota: "Precios y licencia de salida sin comprobar.",
  },
  /* ── remallar (malla de IA caótica → topología limpia y ligera) ── */
  {
    id: "instant-meshes", etapa: "remallar", nombre: "Instant Meshes", necesita: ["cpu"], estado: "listo",
    licencia: "BSD-3-Clause", uso: "libre", minutosAprox: 1, fuente: "https://github.com/wjakob/instant-meshes",
  },
  {
    id: "quadriflow-blender", etapa: "remallar", nombre: "QuadriFlow de Blender (sin ventana)", necesita: ["blender"], estado: "listo",
    licencia: "GPL (Blender); lo que produce es tuyo", uso: "libre", minutosAprox: 2, fuente: "https://www.blender.org",
  },
  {
    id: "smart-remesh", etapa: "remallar", nombre: "Smart Remesh 3 (complemento de Blender)", necesita: ["blender"], estado: "de-pago",
    licencia: "GPL", uso: "libre", fuente: "https://superhivemarket.com/products/smart-remesh",
    nota: "Cuesta 17 USD (no es gratis) y su página no documenta uso sin ventana. Alex decide si se compra.",
  },
  /* ── riggear (esqueleto + pesos de piel) ── */
  {
    id: "unirig", etapa: "riggear", nombre: "UniRig (VAST)", necesita: ["cuda-8gb"], estado: "listo",
    licencia: "MIT", uso: "libre", fuente: "https://github.com/VAST-AI-Research/UniRig",
    nota: "Acepta OBJ, FBX, GLB y VRM; los puntos de control entrenados con VRoid aún no están publicados.",
  },
  /* ── detallar ── */
  {
    id: "btc3d", etapa: "detallar", nombre: "BTC3D (detalle por teselas, sin entrenar)", necesita: ["cuda-16gb"],
    estado: "solo-articulo", licencia: "sin publicar", uso: "condicionado", fuente: "https://arxiv.org/abs/2609.39709",
    nota: "Artículo del 2026-09-30 sin código enlazado: la Biblioteca vigila su publicación.",
  },
  /* ── animar ── */
  {
    id: "unimate", etapa: "animar", nombre: "UniMate (texto → movimiento para cualquier esqueleto)", necesita: ["cuda-8gb"],
    estado: "pesos-sin-codigo", licencia: "MIT (código); pesos sin licencia declarada", uso: "condicionado", esqueletos: TODOS,
    fuente: "https://github.com/Friedrich-M/UniMate",
    nota: "Pesos en Hugging Face desde el 2026-09-27; el código de inferencia está anunciado pero no publicado. Requisitos de GPU sin comprobar.",
  },
  {
    id: "kimodo", etapa: "animar", nombre: "Kimodo local (demonio de movimiento)", necesita: ["cpu"], estado: "listo",
    licencia: "Apache-2.0", uso: "libre", esqueletos: ["soma30", "smplx22"], fuente: "memory/avatares-movimiento.md",
  },
  {
    id: "procedural", etapa: "animar", nombre: "Clips procedurales en el navegador", necesita: ["navegador"], estado: "listo",
    licencia: "propia de StarSeed", uso: "libre", esqueletos: TODOS, fuente: "src/lib/avatares/movimiento/motor.ts",
    nota: "Respiración, balanceo y énfasis; en esqueletos libres solo mueve raíz y columna.",
  },
];
