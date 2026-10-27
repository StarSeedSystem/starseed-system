# OpenMausBot · piezas de referencia para el Mausbot de Astraura

Copia de LECTURA de seis archivos de [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot)
(commit `7e28ea4174e1bd8e23175293862f011c469eb453`, posterior a la etiqueta `v0.1.130` del 2026-10-27),
traída el 2026-10-27 para que el enjambre porte la mascota-cursor al Mausbot de Astraura sin depender de la red.

- **Licencia:** Apache-2.0 (`LICENSE` y `NOTICE` de aquí, sin cambios). La carpeta `enterprise/` del proyecto tiene otra
  licencia y NO se ha copiado nada de ella. El control del equipo de OpenMausBot usa `cua-driver` (MIT, Cua AI):
  tampoco se ha copiado.
- **No se compila ni se importa:** `integraciones-de-codigo/` está fuera de `tsconfig.json` y de vitest. El código
  del OS vive en `src/lib/mausbot/` y `src/components/mausbot/`, escrito de nuevo a partir de estas piezas.
- **Atribución obligatoria** en cada archivo del OS que adapte algo de aquí, en su cabecera:
  `Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0): <archivo de origen>.`

| Archivo | Qué aporta |
|---|---|
| `shared/mascot-bodies.ts` | Los 10 cuerpos (`cursor`, `blob`, `circle`, `squircle`, `capsule`, `drop`, `shield`, `hexagon`, `diamond`, `star`) en SVG con su encaje de cara |
| `src/components/cursor-face-data.ts` | 25 expresiones (2 ojos × 48 puntos codificados), mirada y bocas |
| `src/components/mascot-motion.ts` | Movimiento del cuerpo y de la cara (transformaciones, velocidades) |
| `src/components/mascot-clock.ts` | Un solo reloj de animación compartido y movimiento reducido |
| `src/components/CursorAvatar.tsx` | El componente completo (1.324 líneas): referencia, no se copia entero |
| `src/components/MausBotCustomize.tsx` | El selector de color y cuerpo |

Contrato del OS: `architecture/mausbot-astraura.md`.
