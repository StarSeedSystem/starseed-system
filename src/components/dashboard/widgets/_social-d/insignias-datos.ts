"use client";
/**
 * Insignias (Ola 0929 · D) — el catálogo y lo ganado de verdad (`badges` + `profile_badges`,
 * Módulo 7). Una lectura cada ≥ 30 min, a la vista: la sesión sale de la caché local
 * (`uidActual`, sin /auth/v1/user) y el perfil de mérito por su user_id.
 *
 * «La siguiente» se elige con honestidad: primero las de LOGRO que dependen de ti (auto-otorgables:
 * publicar en la Tienda, desplegar una app o un cerebro, aprobar un examen), luego el resto del
 * catálogo. No hay barra de progreso inventada hacia una insignia concreta: lo que se mide es la
 * colección (ganadas / catálogo) y lo que se ofrece es CÓMO se gana y dónde.
 */
import { uidActual } from "@/lib/consumo/usuario";
import { BADGE_TRIGGERS, badgesForProfile, isSelfAwardableBadge, listBadges, profileIdForUser, type Badge, type ProfileBadge } from "@/lib/badges/badges";
import type { FalloConsulta } from "@/lib/network/bucle-fondo";

export interface Coleccion {
    ganadas: ProfileBadge[];
    catalogo: Badge[];
}

export async function cargarInsignias(): Promise<{ datos?: Coleccion | null; fallo?: FalloConsulta | null }> {
    const uid = await uidActual();
    if (!uid) return { datos: null };
    const pid = await profileIdForUser(uid);
    const [ganadas, catalogo] = await Promise.all([pid ? badgesForProfile(pid) : Promise.resolve([]), listBadges()]);
    return { datos: { ganadas, catalogo } };
}

export interface ComoSeGana {
    texto: string;
    href: string | null;
    accion: string | null;
}

const DESTINO: Record<string, { href: string; accion: string }> = {
    creator: { href: "/store", accion: "Ir a la Tienda" },
    builder: { href: "/cerebros", accion: "Desplegar un cerebro" },
    exam_passed: { href: "/course", accion: "Ver cursos" },
    scholar: { href: "/wiki", accion: "Contribuir a la Wiki" },
    verified: { href: "/cuenta", accion: "Verificar mi cuenta" },
    legislator: { href: "/network/politics", accion: "Ir a Política" },
    mediator: { href: "/network/politics", accion: "Ir a Política" },
};

/** Cómo se gana una insignia: su descripción, el disparador documentado y a dónde ir. */
export function comoSeGana(b: Pick<Badge, "code" | "description">): ComoSeGana {
    const disparador = Object.values(BADGE_TRIGGERS).find((t) => t.badgeCode === b.code);
    const destino = DESTINO[b.code] ?? null;
    const avalada = !isSelfAwardableBadge(b.code) && !!disparador;
    const texto = (disparador?.description ?? b.description ?? "Participa en la Red para desbloquearla.") + (avalada ? " La concede otra persona con su aval." : "");
    return { texto, href: destino?.href ?? null, accion: destino?.accion ?? null };
}

/** La siguiente insignia a perseguir (primero las de logro propio). */
export function siguienteInsignia(c: Coleccion): Badge | null {
    const tengo = new Set(c.ganadas.map((g) => g.code));
    const pendientes = c.catalogo.filter((b) => !tengo.has(b.code));
    return pendientes.find((b) => isSelfAwardableBadge(b.code)) ?? pendientes[0] ?? null;
}
