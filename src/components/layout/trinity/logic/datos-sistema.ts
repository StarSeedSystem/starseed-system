/**
 * Pestaña «Sistema» del Centro de Control · destinos REALES.
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes (hasta la Ola 1025U) cuatro de las seis entradas apuntaban a `/settings/privacy`,
 * `/settings/storage`, `/settings/system` y `/settings/appearance`, rutas que NO existen en
 * `src/app` (404). Ahora cada una lleva a la página y la sección donde vive de verdad esa
 * función. La prueba `datos-sistema.test.ts` recorre `src/app` y falla si una ruta deja de existir.
 */
import {
  HardDrive,
  KeyRound,
  Palette,
  RefreshCw,
  Server,
  Settings,
  Shield,
  User,
  type LucideIcon,
} from "lucide-react";

export interface EntradaSistema {
  id: string;
  rotulo: string;
  /** Una línea bajo el rótulo. */
  sub: string;
  href: string;
  icono: LucideIcon;
}

export interface GrupoSistema {
  id: string;
  titulo: string;
  entradas: EntradaSistema[];
}

export const GRUPOS_SISTEMA: GrupoSistema[] = [
  {
    id: "cuenta",
    titulo: "Tu cuenta",
    entradas: [
      { id: "perfil", rotulo: "Perfil", sub: "Quién eres en la red", href: "/profile", icono: User },
      { id: "configuracion", rotulo: "Configuración", sub: "Cuenta, Aurora y más", href: "/cuenta", icono: Settings },
      { id: "privacidad", rotulo: "Privacidad", sub: "Tus datos y permisos", href: "/cuenta?section=datos-privacidad", icono: Shield },
      { id: "seguridad", rotulo: "Seguridad", sub: "Acceso y bloqueo", href: "/cuenta?section=seguridad", icono: KeyRound },
    ],
  },
  {
    id: "aparato",
    titulo: "Este aparato",
    entradas: [
      { id: "almacenamiento", rotulo: "Almacenamiento", sub: "Dónde se guardan las cosas", href: "/almacenes", icono: HardDrive },
      { id: "sincronizacion", rotulo: "Sincronización", sub: "Archivos entre aparatos", href: "/sincronizacion", icono: RefreshCw },
      { id: "sistema", rotulo: "Sistema", sub: "Servidores y neuronas", href: "/servidores", icono: Server },
      { id: "apariencia", rotulo: "Apariencia", sub: "Temas, fondo y cristal", href: "/cuenta?section=personalizacion", icono: Palette },
    ],
  },
];

export function rutasDelSistema(): string[] {
  return GRUPOS_SISTEMA.flatMap((g) => g.entradas.map((e) => e.href));
}

/** Rutas que enseñan otras partes del Centro de Control (se comprueban en `datos-sistema.test.ts`). */
export const RUTAS_EXTRA_CONTROL = ["/cuenta?section=aurora-voz", "/cuenta", "/galeria", "/camara", "/login", "/notifications"] as const;
