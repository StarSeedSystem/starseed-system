/**
 * supabase — lo MÍNIMO que el kit necesita del cliente de Supabase de la app (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * El kit no importa `@supabase/supabase-js`: usa el cliente que la app ya tiene (cada app trae su
 * versión), creado con `config()`. Aquí solo se describe la forma que se usa, a propósito laxa
 * (`any` en los constructores de consultas) para que encaje con cualquier versión 2.x sin pelear
 * con sus genéricos. Lo que vuelve de la red se sanea siempre en quien lo usa.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface UsuarioMinimo {
  id: string;
  email?: string | null;
}

export interface CanalRealtime {
  on(tipo: string, filtro: Record<string, unknown>, cb: (m: any) => void): any;
  subscribe(cb?: (estado: string, err?: unknown) => void): any;
  send(m: { type: "broadcast"; event: string; payload: unknown }): Promise<any>;
  track(datos: Record<string, unknown>): Promise<any>;
  untrack(): Promise<any>;
  presenceState(): Record<string, unknown[]>;
}

export interface ClienteSupabase {
  auth: {
    signInWithPassword(c: { email: string; password: string }): Promise<{ data: any; error: { message: string } | null }>;
    getSession(): Promise<{ data: { session: { user: UsuarioMinimo } | null } | any }>;
    signOut(): Promise<any>;
    onAuthStateChange?(cb: (evento: string, sesion: { user: UsuarioMinimo } | null) => void): any;
  };
  from(tabla: string): any;
  channel(tema: string, op?: any): any;
  removeChannel(c: any): any;
}

/** El usuario con sesión, o null. Nunca lanza. */
export async function usuarioDe(cliente: ClienteSupabase | null | undefined): Promise<UsuarioMinimo | null> {
  if (!cliente) return null;
  try {
    const { data } = await cliente.auth.getSession();
    const u = data?.session?.user;
    return u && typeof u.id === "string" ? { id: u.id, email: u.email ?? null } : null;
  } catch {
    return null;
  }
}
