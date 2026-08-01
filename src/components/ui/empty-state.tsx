/**
 * StarSeed OS — EmptyState (primitivo reutilizable).
 * ============================================================================
 * Panel de "superficie vacía" con estética cristal del OS para usar en feeds,
 * listas, bibliotecas, resultados de búsqueda, bandejas, etc. cuando no hay
 * contenido que mostrar. Centrado, con icono opcional, título, descripción y
 * una acción (típicamente un <Button>).
 *
 * Diseño defensivo: sin hooks ni estado — puede renderizarse tanto en Server
 * como en Client Components. El `icon` acepta un componente de lucide
 * (referencia, p.ej. `icon={Inbox}`) O un ReactNode ya construido
 * (p.ej. `icon={<Inbox className="h-7 w-7" />}`); ambos se normalizan sin
 * romper el render.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Componente de lucide (referencia) o un ReactNode ya renderizado. */
  icon?: LucideIcon | React.ReactNode;
  /** Título breve de la superficie vacía. */
  title: string;
  /** Texto o nodo secundario que explica el estado / próxima acción. */
  description?: React.ReactNode;
  /** Acción principal, normalmente un <Button> (o un grupo de botones). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Normaliza el prop `icon`:
 *  - Si ya es un elemento React válido → se usa tal cual.
 *  - Si es un componente (función o exótico de forwardRef/memo con `$$typeof`,
 *    como los iconos de lucide) → se instancia con clases por defecto.
 *  - Cualquier otro nodo (string, número…) → se renderiza directamente.
 */
function renderIcon(icon: LucideIcon | React.ReactNode): React.ReactNode {
  if (icon === null || icon === undefined || icon === false) return null;
  if (React.isValidElement(icon)) return icon;
  const isComponent =
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && "$$typeof" in (icon as object));
  if (isComponent) {
    const Icon = icon as LucideIcon;
    return <Icon className="h-7 w-7" aria-hidden="true" />;
  }
  return icon;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const iconNode = renderIcon(icon);

  return (
    <div
      data-component="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur",
        "px-6 py-12 sm:px-10 sm:py-16",
        "text-white/70",
        className,
      )}
    >
      {iconNode ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 [&_svg]:h-7 [&_svg]:w-7">
          {iconNode}
        </div>
      ) : null}

      <h3 className="text-base font-semibold text-white/90 sm:text-lg">{title}</h3>

      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">{description}</p>
      ) : null}

      {action ? <div className="mt-6 flex items-center justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
