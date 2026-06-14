# 🎨 Sistema de Diseño StarSeed — Base de Identidad Gráfica (Figma)

> Fuente de verdad de identidad visual para todo el ecosistema. Cada proyecto Figma se rellena a partir de este documento. Selección inteligente: ante una petición de diseño, elegir el archivo cuyo **tema/marca** coincida (tabla §1).

## 1. Proyectos Figma creados (cuenta maggasukha · team El equipo de Alex Bordon)

| Proyecto | Para qué (selección) | File key | URL |
|---|---|---|---|
| **StarSeed · Sistema de Diseño** (maestro) | Tokens globales, los 3 temas juntos, referencia transversal | `yC5x1jlzBBT4EZwwvFqPtl` | https://www.figma.com/design/yC5x1jlzBBT4EZwwvFqPtl |
| **StarSeed OS · UI Kit & Temas** | Pantallas y componentes del SOSD (dashboard, widgets, Trinity, ajustes) en Aurora/Café/Materia | `G13LnkXjgqJG58nZt7Kjg4` | https://www.figma.com/design/G13LnkXjgqJG58nZt7Kjg4 |
| **StarSeed Nexus · Portal** | Portal/áreas (Materia Viva / Café) | `CH8Bes5hXZAnlN8lyzNagb` | https://www.figma.com/design/CH8Bes5hXZAnlN8lyzNagb |
| **StarSeed Café · Identidad** | Cafetería: menú, vasos, economía (pergamino + oro) | `rySq6vYxZAHplryOBAQu1u` | https://www.figma.com/design/rySq6vYxZAHplryOBAQu1u |
| **Audiomorphic AR · Identidad** | Visualizador AR, geometría sagrada | `TA3tu8R7QJkRizlBJFoYc7` | https://www.figma.com/design/TA3tu8R7QJkRizlBJFoYc7 |

Regla de selección: OS → UI Kit; portal/áreas → Nexus; cafetería → Café; AR/audio → Audiomorphic; algo transversal o un tema nuevo → maestro. Para un tema/estilo futuro, crear una página nueva dentro del archivo de su marca.

## 2. Lenguaje visual (común)
Retrofuturista · Art Nouveau · Solarpunk · Cristal líquido · Geometría sagrada · Natural-tecnológico. Proporción áurea (φ=1.618) para escalas y rejillas. Movimiento "Respiración Digital": easings `--ease-organic (.22,1,.36,1)`, `--ease-glide (.16,1,.3,1)`, `--ease-elastic`; duraciones 150/220/300 ms.

Tipografía: **Fraunces** (display/titulares, Art Nouveau), **Space Grotesk** (texto/interfaz), **Space Mono** (datos/código/etiquetas).

## 3. Temas (tokens)

### 3.1 Aurora StarSeed (OS original)
Oscuro: fondo `#0a0118`, card `#160b30`, primario violeta `#c084fc`, acento cian `#22d3ee`. Claro: fondo `#f6f3fb`, card `#fdfcff`, primario `#9333ea`, acento teal `#0f766e`.

### 3.2 StarSeed Café
Oscuro (verde-negro + oro): fondo `#0d130e`, card `#141b14`, primario oro `#E9C46A`, acento lima `#9FE870`, borde oro. Claro (pergamino + café): fondo `#fdf7ea`, tinta `#3B2818`, primario terracota `#C05C3B`, acento musgo `#3f7a2a`.

### 3.3 Materia Viva (acentos sobre canvas)
oro-vivo `#E9C46A` (rgb 233,196,106) · cristal-líquido `#7FD8E8` · bosque-dorado. Fondo canvas verde-negro `#0d130e→#16210f`. Intensidad 0–1.

### 3.4 Paleta StarSeed extendida
Musgo `#2D4A22`, Terracota `#C05C3B`, Ámbar `#F6A21E`, Cacao `#3B2818`, Lavanda `#B59ECF`, Oro `#E9C46A`, Bronce `#9C6B3F`. Neón: Lime `#9FE870`, Amber `#FFC247`, Lavanda `#C9A8FF`, Cyan `#6FE6D6`, Coral `#FF8A5C`.

### 3.5 Trinity (cardinales)
Zenith `#007FFF` (norte · guía IA) · Horizon `#39FF14` (oeste · creación) · Logic `#FFBF00` (este · control) · Anchor `#DC143C` (sur · dock/raíz).

## 4. Recetas de cristal líquido (glass)
`backdrop-filter: blur(16–40px)`; fondo `color-mix(card, transparent 35–60%)`; borde `1px` `color-mix(accent 30–50%, transparent)`; highlight interno `inset 0 1px 0 rgba(255,255,255,.08–.15)`; sombra cálida `0 18px 48px -20px rgba(0,0,0,.45)`. Variantes: clear (blur 5, refraction .8), frosted (blur 30), holographic (aberración 5px), obsidian (opacidad .85), organic-frosted (blur 20, displacement). 3D: realces especulares, refracción, micro-paralaje suave, formas orgánicas/blob.

## 5. WidgetShell (spec de componente, ya implementado)
Contenedor universal adaptativo: container-queries (tiers micro→expanded), cabecera (gema de icono con degradado de acento, título Fraunces, subtítulo mono, badge "Live", acciones, botón **Ampliar**), cuerpo scrollable, footer con **conexiones** (chips "✦ Conecta" a áreas hermanas). Identidad: hairline de acento superior, sigilo StarSeed de fondo, glow en hover (sin transform). Hereda `config.widgets` (bg/borde/sombra/glass/innerGlow) y el tema del sistema. Tamaños variados por `react-grid-layout` (cols lg12/md10/sm6/xs4/xxs2). Pulsación táctil 3 s para mover (configurable).

### Pendiente de diseño en Figma (a poblar con esta spec)
- Frames por tema: Dashboard (móvil 390 / tablet 768 / desktop 1440 / ultrawide), Widget en sus tiers, Trinity (FAB + edges + curtains), Ajustes.
- Kit de widgets: estados (loading/empty/error/live), variantes de tamaño, modo "diseño original" vs "adaptado al tema".
- Café: menú, vaso personalizado, economía Granos&Semillas. Audiomorphic: geometrías (Flor de la Vida, Metatrón, toro).

*Creado 2026-06-13. Los archivos Figma están vacíos a la espera de poblarse con esta spec (asiento Figma "View"/starter; la creación funcionó vía API).*
