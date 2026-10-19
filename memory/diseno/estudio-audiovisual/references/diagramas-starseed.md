# Diagramas con la marca StarSeed

La skill `diagram-design` (MIT) resuelve su piel desde un perfil guardado fuera de la instalación
(`~/.diagram-design/profiles/<slug>.md`) y un marcador `.diagram-design` en la carpeta del proyecto. Este
plugin trae el perfil StarSeed listo en `references/perfil-diagram-design-starseed.md`.

## Instalar el perfil (una vez por sesión o por máquina)

```bash
SKILL_DIR="<carpeta de esta skill>"   # la carpeta que contiene este SKILL.md
mkdir -p ~/.diagram-design/profiles
cp "$SKILL_DIR/references/perfil-diagram-design-starseed.md" ~/.diagram-design/profiles/starseed.md
printf 'profile: starseed\n' > .diagram-design    # en la carpeta de trabajo del diagrama
```

Después pide el diagrama a `diagram-design` con normalidad: leerá el marcador y usará el perfil.

## Qué trae el perfil

- Piel clara sobre nieve `#F8F9FA` y piel oscura sobre noche `#0A0F1D`.
- Un solo acento: zenith (`#0057B0` en claro, `#4DA3FF` en oscuro); enlaces en horizonte (`#047857` /
  `#34D399`).
- Tipos: Rajdhani (título), Inter (nombres y notas), JetBrains Mono (lo técnico).
- Comprobado con `scripts/verify-contrast.py` del repo de Diagram Design: 20 comprobaciones de rol en verde
  en las dos pieles (el texto sobre el relleno de acento usa blanco en claro y noche en oscuro).

## Para vídeo y 3D

Exporta a SVG o PNG con sus scripts (`export_svg.py`, `export_png.py`) y anímalo en HyperFrames (revelado
por orden de lectura). Para 3D, extrae nodos y capas del SVG y apílalos en profundidad con Three.js; los
tipos de capas, despiece y planta axonométrica son los que mejor pasan a 3D.
