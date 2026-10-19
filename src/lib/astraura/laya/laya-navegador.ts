import { type PerfilMedio } from "./capas/perfil-medio";

/**
 * Decide si cargar el modelo Laya en el navegador según el perfil del medio.
 * Retorna { cargar, modelo, motivo } con la decisión y la justificación.
 * Puro: sin red, sin disco, sin modelo de Laya inyectado.
 */
export interface PlanLayaLocal {
  cargar: boolean;
  modelo: "multilingual-int8" | "multilingual" | null;
  motivo: string;
}

/**
 * Decide si cargar el modelo Laya en el navegador según el perfil del medio.
 * Retorna {cargar, modelo, motivo} para el plan del medio.
 * Conforme a capas-autoadaptables.md §4: nunca visita web, PWA con WebGPU y ≥2 GB de almacenamiento persistente y ≥4 GB de RAM,
 * app nativa si presupuesto lo permite, batería <20 % o pestaña oculta → no.
 * Mientras vendor/laya-ts y el modelo exportado (tarea O) no existan, devuelve cargar:false con ese motivo.
 */
export function planLayaLocal(perfil: PerfilMedio): PlanLayaLocal {
  if (!existeLayaTsYModelo()) {
    return {
      cargar: false,
      modelo: null,
      motivo: "vendor/laya-ts o modelo exportado (tarea O) no existen todavía",
    };
  }

  if (enSegundoPlano(perfil)) {
    return {
      cargar: false,
      modelo: null,
      motivo: "medio en segundo plano (pestaña oculta, batería baja o saveData)",
    };
  }

  switch (perfil.plataforma) {
    case "servidor":
      return {
        cargar: false,
        modelo: null,
        motivo: "servidor: Laya no se ejecuta en el backend",
      };

    case "tauri":
    case "android":
    case "ios": {
      const { disco_mb, ram_mb, capas_guardables } = presupuestoMedio(perfil);
      if (ram_mb !== null && ram_mb >= 2048 && disco_mb >= 2048 && capas_guardables.length > 0) {
        return {
          cargar: true,
          modelo: perfil.plataforma === "ios" ? "multilingual-int8" : "multilingual",
          motivo: "app nativa con presupuesto suficiente: disco ${disco_mb} MB, RAM ${ram_mb} MB, capas ${capas_guardables.join(', ')}",
        };
      }
      return {
        cargar: false,
        modelo: null,
        motivo: "app nativa sin presupuesto suficiente: disco ${disco_mb} MB, RAM ${ram_mb} MB, capas ${capas_guardables.join(', ')}",
      };
    }

    case "pwa": {
      if (!perfil.almacenamiento.persistente) {
        return {
          cargar: false,
          modelo: null,
          motivo: "PWA sin persist() concedido: solo reflejo en caché",
        };
      }
      if (perfil.webgpu.disponible && perfil.base.ramGb !== null && perfil.base.ramGb >= 4 && perfil.almacenamiento.libreMb !== null && perfil.almacenamiento.libreMb >= 2048) {
        return {
          cargar: true,
          modelo: "multilingual",
          motivo: "PWA con WebGPU, RAM ${perfil.base.ramGb} GB y ≥2 GB de almacenamiento persistente",
        };
      }
      return {
        cargar: false,
        modelo: null,
        motivo: "PWA sin WebGPU o RAM <4 GB o almacenamiento <2 GB: ${perfil.webgpu.disponible ? 'WebGPU' : 'sin WebGPU'}, RAM ${perfil.base.ramGb} GB, almacenamiento libre ${perfil.almacenamiento.libreMb} MB",
      };
    }

    default: {
      return {
        cargar: false,
        modelo: null,
        motivo: "navegador de visita: nunca carga Laya (va por la malla)",
      };
    }
  }
}

function enSegundoPlano(p: PerfilMedio): boolean {
  if (!p.visible) return true;
  if (p.bateria.baja && p.bateria.cargando !== true) return true;
  return p.saveData;
}

function existeLayaTsYModelo(): boolean {
  return typeof (globalThis as any).vendor?.layaTs !== "undefined" && typeof (globalThis as any).layaModelo !== "undefined";
}

function presupuestoMedio(p: PerfilMedio) {
  const MB = 1024 * 1024;
  const segundoPlano = enSegundoPlano(p);
  let disco_mb: number;
  let ram_mb: number | null;
  let capas: Array<"reflejo" | "memoria" | "palabra" | "razon"> = [];

  switch (p.plataforma) {
    case "servidor": {
      ram_mb = p.ramLibreMb ?? (p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024 * 0.7) : null);
      disco_mb = p.almacenamiento.cuotaMb ?? 0;
      capas = ["reflejo", "memoria", "palabra", "razon"];
      break;
    }
    case "tauri":
    case "android":
    case "ios": {
      const libre = p.almacenamiento.libreMb ?? 0;
      disco_mb = Math.min(Math.floor(libre * 0.15), 8 * 1024);
      ram_mb = p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024 * 0.4) : 512;
      capas = ["reflejo", "memoria", "palabra", "razon"];
      break;
    }
    case "pwa": {
      if (!p.almacenamiento.persistente) {
        disco_mb = 0;
      } else {
        disco_mb = Math.min(p.almacenamiento.libreMb ?? 1024, 1024);
      }
      ram_mb = p.base.ramGb !== null ? Math.floor(p.base.ramGb * 1024 * 0.3) : null;
      capas = p.almacenamiento.persistente ? ["reflejo", "memoria", "palabra"] : ["reflejo"];
      break;
    }
    default: {
      disco_mb = 12;
      const ramOk = (p.base.ramGb ?? 0) >= 4;
      ram_mb = p.webgpu.disponible && ramOk ? 1536 : 0;
      capas = ["reflejo"];
      break;
    }
  }

  if (segundoPlano) {
    capas = capas.includes("reflejo") ? ["reflejo"] : [];
    ram_mb = 0;
  }

  return { disco_mb, ram_mb, capas_guardables: capas };
}