"use client";

// ════════════════════════════════════════════════════════════════════════════
// InstallButton — «Instalar StarSeed OS» (nombre histórico, mismo botón para todos)
// ----------------------------------------------------------------------------
// (2026-09-25) Antes este botón solo sabía instalar la web (PWA) y cada superficie
// tenía su propia lógica de descarga. Ahora es un envoltorio del ÚNICO botón del OS,
// `BotonInstalarOS` (src/components/install/instalar-os.tsx): con un toque detecta el
// sistema, trae la última versión de GitHub y descarga el archivo que toca; en
// iPhone/iPad explica cómo instalar la web. Se conserva el nombre y las props para
// que la franja, la tarjeta de la Biblioteca y la bienvenida no cambien.
// ════════════════════════════════════════════════════════════════════════════

import { BotonInstalarOS } from "@/components/install/instalar-os";

export interface InstallButtonProps {
  className?: string;
  /** Estilo compacto para incrustar en filas de acciones. */
  compact?: boolean;
}

export function InstallButton({ className, compact }: InstallButtonProps) {
  return <BotonInstalarOS className={className} compacto={compact} />;
}

export default InstallButton;
