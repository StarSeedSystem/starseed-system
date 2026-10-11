// Pure module for arranging Astraura bots (orbs) on screen
export const MAX_ORBES_VISIBLES = 5;

export interface PosOrbe {
  xRatio: number;
  yRatio: number;
}

// Default position for the principal orb (Aurora orb) as ratios
const DEFAULT_PRINCIPAL_POS: PosOrbe = { xRatio: 0.9, yRatio: 0.88 };

// Margin in pixels to keep orbs inside the view
const MARGIN_PX = 10;

// Minimum distance between orb centers in pixels (diametro + 8)
function minDistPx(diametro: number): number {
  return diametro + 8;
}

/**
 * Converts ratios to pixel coordinates.
 */
function toPixels(pos: PosOrbe, ancho: number, alto: number): { x: number; y: number } {
  return {
    x: pos.xRatio * ancho,
    y: pos.yRatio * alto,
  };
}

/**
 * Converts pixel coordinates to ratios.
 */
function toRatios(px: { x: number; y: number }, ancho: number, alto: number): PosOrbe {
  return {
    xRatio: px.x / ancho,
    yRatio: px.y / alto,
  };
}

/**
 * Checks if a position (in pixels) is within the view with margin.
 */
function isWithinView(
  px: { x: number; y: number },
  vista: { ancho: number; alto: number; diametro: number }
): boolean {
  const radio = vista.diametro / 2;
  return (
    px.x >= MARGIN_PX + radio &&
    px.x <= vista.ancho - MARGIN_PX - radio &&
    px.y >= MARGIN_PX + radio &&
    px.y <= vista.alto - MARGIN_PX - radio
  );
}

/**
 * Adjusts a position to be within the view with margin, by moving it towards the center if necessary.
 */
function clampToView(
  px: { x: number; y: number },
  vista: { ancho: number; alto: number; diametro: number }
): { x: number; y: number } {
  const radio = vista.diametro / 2;
  let x = px.x;
  let y = px.y;

  if (x < MARGIN_PX + radio) {
    x = MARGIN_PX + radio;
  } else if (x > vista.ancho - MARGIN_PX - radio) {
    x = vista.ancho - MARGIN_PX - radio;
  }

  if (y < MARGIN_PX + radio) {
    y = MARGIN_PX + radio;
  } else if (y > vista.alto - MARGIN_PX - radio) {
    y = vista.alto - MARGIN_PX - radio;
  }

  return { x, y };
}

/**
 * Calculates the distance between two points in pixels.
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

/**
 * Arranges the orbs based on the given open orbs and viewport.
 * @param abiertos - Readonly array of open orbs, each with id, optional principal flag, and optional saved position.
 * @param vista - Viewport dimensions and orb diameter.
 * @returns Array of orbs with their computed position and visibility.
 */
export function disposicionOrbes(
  abiertos: readonly { id: string; principal?: boolean; pos?: PosOrbe }[],
  vista: { ancho: number; alto: number; diametro: number }
): { id: string; pos: PosOrbe; visible: boolean }[] {
  if (abiertos.length === 0) {
    return [];
  }

  // Separate principal and non-principal orbs
  const principalOrb = abiertos.find((orb) => orb.principal);
  const nonPrincipalOrbs = abiertos.filter((orb) => !orb.principal);

  // Determine the position of the principal orb (use saved or default)
  let principalPos: PosOrbe;
  if (principalOrb && principalOrb.pos) {
    principalPos = principalOrb.pos;
  } else {
    principalPos = DEFAULT_PRINCIPAL_POS;
  }

  // We will place orbs in this order: principal first, then non-principal sorted by id (for determinism)
  const orderedNonPrincipal = [...nonPrincipalOrbs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(orb => ({ ...orb, principal: false })); // Ensure principal is false for non-principal
  const orbsToPlace: Array<{ id: string; principal: boolean; pos?: PosOrbe }> = [
    ...(principalOrb ? [{ id: principalOrb.id, principal: true, pos: principalOrb.pos }] : []),
    ...orderedNonPrincipal,
  ];

  // We'll compute the final positions in pixels
  const placed: Array<{ id: string; posPx: { x: number; y: number } }> = [];

  // Helper to try to place an orb at a given position (in pixels), adjusting for obstacles
  function placeOrb(
    id: string,
    preferredPx: { x: number; y: number },
    occupied: Array<{ id: string; posPx: { x: number; y: number } }>
  ): { x: number; y: number } {
    // Start with the preferred position
    let posPx = { ...preferredPx };
    const minDist = minDistPx(vista.diametro);

    // First, clamp to view
    posPx = clampToView(posPx, vista);

    // Check for overlaps with already placed orbs (including principal)
    let offset = 0;
    let maxOffset = 100; // prevent infinite loop
    while (offset < maxOffset) {
      let overlap = false;
      for (const other of occupied) {
        if (distance(posPx, other.posPx) < minDist) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        break;
      }
      // If there's an overlap, try to move in a spiral pattern: right, down, left, up, increasing step
      // For simplicity, we'll move in a fixed direction: to the left by (minDist * (offset+1)) until we find a spot
      // This is not an arc but a simple leftward shift. We'll improve if needed.
      posPx.x -= minDist * (offset + 1);
      // Re-clamp to view after moving
      posPx = clampToView(posPx, vista);
      offset++;
    }
    return posPx;
  }

  // Place each orb in order
  for (const orb of orbsToPlace) {
    let preferredPx: { x: number; y: number };
    if (orb.pos) {
      // Use saved position
      preferredPx = toPixels(orb.pos, vista.ancho, vista.alto);
    } else {
      // No saved position: for non-principal, we place alongside the principal
      // For the principal, we already have a position (from above)
      if (orb.principal) {
        // This should not happen because we already set principalPos, but just in case
        preferredPx = toPixels(principalPos, vista.ancho, vista.alto);
      } else {
        // Place to the left of the principal orb (or the last placed orb if we have multiple)
        const lastPlaced = placed.length > 0 ? placed[placed.length - 1] : { id: principalOrb?.id ?? '', posPx: toPixels(principalPos, vista.ancho, vista.alto) };
        preferredPx = {
          x: lastPlaced.posPx.x - minDistPx(vista.diametro),
          y: lastPlaced.posPx.y,
        };
      }
    }

    // Now place the orb, avoiding overlaps
    const finalPx = placeOrb(orb.id, preferredPx, placed);
    placed.push({ id: orb.id, posPx: finalPx });
  }

  // Convert placed orbs to the output format, assigning visibility
  const result: { id: string; pos: PosOrbe; visible: boolean }[] = [];
  for (let i = 0; i < placed.length; i++) {
    const orb = placed[i];
    const posRatios = toRatios(orb.posPx, vista.ancho, vista.alto);
    result.push({
      id: orb.id,
      pos: posRatios,
      visible: i < MAX_ORBES_VISIBLES,
    });
  }

  return result;
}

/**
 * Determines the z-order of orbs, bringing the focused one to the front.
 * @param ids - Array of orb IDs in default order.
 * @param enfocado - ID of the focused orb, if any.
 * @returns Array of IDs sorted by z-order.
 */
export function ordenZ(ids: string[], enfocado?: string): string[] {
  if (!enfocado) {
    return [...ids];
  }
  // Remove the enfocado from its current position and put it at the front
  const withoutEnfocado = ids.filter((id) => id !== enfocado);
  return [enfocado, ...withoutEnfocado];
}