"use client";

/**
 * /red-mesh — CENTRO COMPLETO DE LA RED MESH P2P (Adenda 98 · 99).
 * ============================================================================
 * La página de administración total de la malla, accesible desde el hub de
 * conexiones (Control Center / barra superior, pestaña «Internet») y AGREGABLE
 * AL DOCK (app "Red Mesh" del catálogo). El cuerpo vive en <RedMeshCenter/> para
 * montarse con PARIDAD TOTAL también dentro del hub de conexiones.
 *
 *   1. MAPA 3D — cada neurona activa ubicada por GPS real (si el nodo lo
 *      comparte) o por ESTIMACIÓN DE RADIOFRECUENCIA (distancia derivada del SNR).
 *   2. CONEXIONES — todos los tipos de conexión mesh (USB/BLE/daemon/simulador).
 *   3. ANTENAS Y BANDAS — inventario real + selector inteligente de banda/preset.
 *   4. PRIVACIDAD Y PERMISOS — visibilidad, posición, nombres y uso del relé.
 *   5. PEERS Y ROUTERS — P2P activos, neuronas federadas y la red externa medida.
 */

import { RedMeshCenter } from "@/components/mesh/red-mesh-center";

export default function RedMeshPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <RedMeshCenter />
    </main>
  );
}
