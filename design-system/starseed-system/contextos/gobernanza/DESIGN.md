# Design System — Contexto Gobernanza (StarSeed OS)

> **Formato:** numerado (9 secciones) · **ADN de origen:** `memory/diseno/adn/gobernanza/dna.json` (registro v2026-11-20) · **Generado con:** skill `awesome-design-md` (Modo B) · **Patrones de referencia:** Linear.app (lista densa jerárquica), Supabase (dashboard técnico), Notion (superficies cálidas). **No tomar** su paleta, ni su logotipo, ni su tipografía propietaria — solo se estudian patrones, se mapean al ADN Trinity.

---

## 1. Visual Theme & Atmosphere

La gobernanza en StarSeed es **democracia directa, transparente y serena**. La atmósfera respira confianza: superficies cristalinas que dejan ver la estructura, jerarquía clara sin ruido, y un ritmo pausado que invita a la deliberación, no a la reacción.

**Alma (del ADN):** «El poder de decisión reside en el individuo; la interfaz lo hace visible, comprensible y reversible.»  
**Adjetivos:** transparente, serena, estructurada, reversible, colectiva.  
**Linaje:** Trinity (Zenith/Horizon/Logic/Anchor) + geometría sagrada (vesica piscis para solapamiento humano/IA, semilla de la vida para crecimiento de propuestas).

**Características clave:**
- Cristal líquido translúcido (`--mc-cristal`, blur 10px) en paneles cardinales
- Jerarquía tipográfica φ (escala 1.618 en escritorio, 1.25 en móvil)
- Espaciado Fibonacci (fib-13 a fib-55) para respiración entre bloques
- Acento Logic (`#FFBF00`) para acciones de propuesta; Anchor (`#DC143C`) para votos vinculantes
- Nada de gradientes decorativos: la geometría sagrada en `aria-hidden` guía la mirada

---

## 2. Color Palette & Roles

### Primarios (del ADN `paleta[]`)

| Rol | Token | Hex | Nombre descriptivo | Cobertura | Prohibido |
|---|---|---|---|---|---|
| **Propuesta** | `palette.trinity.logica.active` | `#FFBF00` | ámbar solar | Botones crear propuesta, enlaces a borradores, indicadores de fase «en debate» | Fondos grandes, texto de cuerpo |
| **Voto vinculante** | `palette.trinity.anchor.active` | `#DC143C` | carmín sistema | Botones votar, badges «aprobado/rechazado», bordes de tarjetas en votación | Fondos, texto largo |
| **Guía IA** | `palette.trinity.zenith.active` | `#007FFF` | azul eléctrico | Tooltips de Zenith, sugerencias de IA, enlaces a análisis automáticos | Acciones de usuario |
| **Creación** | `palette.trinity.horizonte.panel` | `#10B981` | esmeralda horizonte | Botones «nueva propuesta», indicadores de fase «borrador», métricas positivas | Alertas, errores |

### Neutros (heredados del OS)

| Token | Hex | Uso |
|---|---|---|
| `--aw-shell` | `#0A0F1D` | Fondo base (noche) |
| `--aw-surface` | `#111827` | Superficie de tarjetas, paneles |
| `--aw-field` | `#1F2937` | Inputs, áreas de texto |
| `--aw-ink` | `#F8F9FA` | Texto principal |
| `--aw-text` | `#D1D5DB` | Texto secundario |
| `--aw-muted` | `#9CA3AF` | Texto terciario, placeholders |

### Semánticos

| Rol | Token | Hex | Uso |
|---|---|---|---|
| **Éxito / Aprobado** | `palette.success` | `#10B981` | Badges «aprobado», confirmaciones |
| **Advertencia / Quórum** | `palette.warning` | `#F59E0B` | Badges «quórum no alcanzado», plazos |
| **Error / Rechazado** | `palette.error` | `#EF4444` | Badges «rechazado», validaciones |
| **Información / Delegado** | `palette.info` | `#3B82F6` | Badges «delegado», votos líquidos |

### Superficies con nombre descriptivo

- **Cristal noctámbulo** (`--aw-surface` + blur 10px): tarjetas de propuesta, paneles laterales
- **Cristal ámbar** (`--aw-surface` + border `palette.trinity.logica.active` 20%): tarjetas en fase debate
- **Cristal carmín** (`--aw-surface` + border `palette.trinity.anchor.active` 20%): tarjetas en fase votación
- **Pergamino voto** (`--aw-field` + text `--aw-ink`): área de argumentación, delegación

---

## 3. Typography Rules

### Familias (del ADN `tipo`)

| Rol | Familia | Fallback | Nota |
|---|---|---|---|
| **Display / Título de vista** | Rajdhani | Inter, system-ui | Peso 700, tracking -0.5px en φ³+ |
| **Técnico / Cifras / Código** | JetBrains Mono | ui-monospace, Menlo | Peso 400/500, tabular-nums |
| **Cuerpo / UI** | Inter | system-ui, -apple-system | Peso 300 (aire) / 400 (lectura) / 500 (énfasis) |
| **Orgánico / Citas** | Quicksand | Inter, system-ui | Peso 400/500, solo en argumentaciones largas |

### Escala φ (escritorio, tablet, TV) — base 16px

| Peldaño | rem | px | Uso en Gobernanza |
|---|---:|---:|---|
| φ⁻² | 0.382 | 6.1 | Solo glifos no textuales (iconos de fase) |
| φ⁻¹ | 0.618 | 9.9 | Microdato: conteo de votos, % quórum |
| base | 1 | 16 | Cuerpo, controles, argumentaciones |
| φ¹ | 1.618 | 25.9 | Subtítulo: título de propuesta en lista |
| φ² | 2.618 | 41.9 | Título de sección: «Propuestas activas», «Mi delegación» |
| φ³ | 4.236 | 67.8 | Título de vista: «Gobernanza» |
| φ⁴ | 6.854 | 109.7 | Display: hero vacío (sin propuestas) |

### Escala 1.25 (móvil ≤430px, plegable 280px) — base 16px

| Peldaño | rem | px | Uso |
|---|---:|---:|---|
| −1 | 0.8 | 12.8 | Etiqueta fase (borrador/debate/votación) |
| base | 1 | 16 | Cuerpo, controles |
| +1 | 1.25 | 20 | Subtítulo propuesta |
| +2 | 1.5625 | 25 | Título bloque |
| +3 | 1.9531 | 31.3 | Título vista |
| +4 | 2.4414 | 39.1 | Display móvil máx. |

### Interlineado y medida

- **Cuerpo:** `line-height: 1.6` (Inter 300) / `1.5` (Inter 400)
- **Títulos:** `line-height: 1.2` (Rajdhani 700)
- **Código/cifras:** `line-height: 1.4` (JetBrains Mono)
- **Medida máx.:** `65ch` (cuerpo), `45ch` (argumentación)

---

## 4. Component Stylings

### Tarjeta de propuesta (componente principal)

```css
.propuesta-card {
  background: var(--aw-surface);
  border: 1px solid rgba(255,191,0,0.2);       /* borde ámbar 20% */
  border-radius: var(--radius-lg);              /* 24px */
  padding: var(--space-fib-21);                 /* 21px = 1.3125rem */
  box-shadow: var(--elevation-nivel1);          /* 0 4px 24px rgba(0,0,0,0.08) */
  backdrop-filter: blur(10px);
  transition: transform 150ms ease, box-shadow 200ms ease, border-color 200ms ease;
}

.propuesta-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--elevation-nivel2);          /* 0 8px 32px rgba(0,0,0,0.12) */
  border-color: rgba(255,191,0,0.4);
}

/* Variantes por fase */
.propuesta-card--borrador   { border-color: rgba(16,185,129,0.3); }
.propuesta-card--debate     { border-color: rgba(255,191,0,0.4); }
.propuesta-card--votacion   { border-color: rgba(220,20,60,0.4); }
.propuesta-card--aprobada   { border-color: rgba(16,185,129,0.5); background: rgba(16,185,129,0.05); }
.propuesta-card--rechazada  { border-color: rgba(239,68,68,0.3); opacity: 0.7; }
```

**Jerarquía interna:**
- Fase: badge `radius-full` (9999px), `φ⁻¹` (9.9px), peso 500
- Título: `φ¹` (25.9px), Rajdhani 700, `--aw-ink`
- Resumen: `base` (16px), Inter 300, `--aw-text`, `line-clamp-3`
- Meta: `φ⁻¹` (9.9px), JetBrains Mono 400, `--aw-muted` (autor, fecha, votos)
- Acciones: botones `radius` (20px), padding `fib-8` `fib-13` (8px 13px)

### Botones

| Variante | Fondo | Texto | Borde | Radio | Padding | Uso |
|---|---|---|---|---|---|---|
| **Primaria (propuesta)** | `palette.trinity.logica.active` | `--aw-shell` | none | `--radius` 20px | `fib-8` `fib-13` | Crear propuesta, siguiente paso |
| **Votar (vinculante)** | `palette.trinity.anchor.active` | `--aw-ink` | none | `--radius` 20px | `fib-8` `fib-13` | Votar sí/no, confirmar delegación |
| **Secundaria (borrador)** | `transparent` | `palette.trinity.logica.active` | 1px solid actual | `--radius` 20px | `fib-8` `fib-13` | Guardar borrador, cancelar |
| **Fantasma (delegar)** | `transparent` | `palette.trinity.zenith.active` | none | `--radius` 20px | `fib-5` `fib-8` | Delegar voto, ver análisis IA |
| **Peligro (retirar)** | `transparent` | `palette.error` | 1px solid `palette.error` | `--radius` 20px | `fib-8` `fib-13` | Retirar propuesta, revocar delegación |

**Estados:** `hover` → `opacity 0.9` + `transform translateY(-1px)`; `active` → `scale(0.98)`; `focus-visible` → `ring 2px` `palette.trinity.logica.active` offset 2px; `disabled` → `opacity 0.4`, `cursor not-allowed`.

### Badges de fase y estado

```css
.badge {
  display: inline-flex; align-items: center; gap: var(--space-fib-3); /* 3px */
  padding: var(--space-fib-2) var(--space-fib-5); /* 2px 5px */
  border-radius: 9999px;
  font-size: 0.618rem; /* φ⁻¹ = 9.9px */
  font-weight: 500; font-family: var(--font-mono);
  line-height: 1.3;
}

.badge--borrador   { background: rgba(16,185,129,0.16); color: #10B981; }
.badge--debate     { background: rgba(255,191,0,0.16); color: #FFBF00; }
.badge--votacion   { background: rgba(220,20,60,0.16); color: #DC143C; }
.badge--aprobada   { background: rgba(16,185,129,0.2); color: #10B981; }
.badge--rechazada  { background: rgba(239,68,68,0.16); color: #EF4444; }
.badge--delegada   { background: rgba(59,130,246,0.16); color: #3B82F6; }
.badge--quorum-no  { background: rgba(245,158,11,0.16); color: #F59E0B; }
```

### Panel lateral (SideCurtains — Horizon/Logic)

- **Horizon (izq, creación):** ancho `38.2%` (vesica piscis menor), fondo `cristal noctámbulo`, contiene formulario de propuesta
- **Logic (der, control):** ancho `38.2%`, fondo `cristal noctámbulo`, contiene filtros, delegación, análisis IA
- **Centro:** `61.8%` (lista de propuestas), scroll independiente
- **Transición:** `transform 240ms cubic-bezier(0.4, 0, 0.2, 1)` desde perímetro

### Tabla de votos (vista detalle propuesta)

- Columnas fijas: Perfil (avatar + nombre), Voto (sí/no/abstención/delegado), Poder (cifra), Argumento (truncado)
- `border-collapse: separate`, `border-spacing: 0 var(--space-fib-8)` (8px)
- Filas: `background: var(--aw-surface)`, `border-bottom: 1px solid rgba(255,255,255,0.04)`
- Hover fila: `background: rgba(255,191,0,0.03)`
- Cifras: `font-variant-numeric: tabular-nums`, `font-family: var(--font-mono)`

### Inputs y textarea (argumentación, delegación)

```css
.input-gobernanza {
  background: var(--aw-field);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-sm); /* 14px */
  padding: var(--space-fib-8) var(--space-fib-13); /* 8px 13px */
  color: var(--aw-ink);
  font-family: var(--font-body);
  font-size: 1rem; line-height: 1.6;
  transition: border-color 150ms, box-shadow 150ms;
}

.input-gobernanza:focus {
  outline: none;
  border-color: var(--palette-trinity-logica-active);
  box-shadow: 0 0 0 3px rgba(255,191,0,0.2);
}

.textarea-argumentacion {
  min-height: 120px; resize: vertical;
  font-family: var(--font-organic); /* Quicksand para argumentaciones */
}
```

---

## 5. Layout Principles

### Rejilla áurea (escritorio ≥1024px)

- **Dos columnas principales:** `38.2% : 61.8%` (contenido principal en 61.8%, apoyo en 38.2%)
- **Inversión semántica:** cuando la acción principal está en el panel lateral (crear propuesta), el panel dominante pasa a la izquierda (`61.8% : 38.2%`)
- **Foco en intersección áurea:** el botón «Crear propuesta» (Horizon) y «Votar» (Logic) se alinean a la intersección superior de la vesica piscis central
- **Controles y texto:** conservan alineación de rejilla base (8px / `fib-8`)

### Espaciado Fibonacci (tokens conceptuales)

| Token | px | rem | Uso en Gobernanza |
|---|---:|---:|---|
| `fib-2` | 2 | 0.125 | Separación óptica badge–texto |
| `fib-3` | 3 | 0.1875 | Microajuste interno botón |
| `fib-5` | 5 | 0.3125 | Icono–texto compacto (avatar + nombre) |
| `fib-8` | 8 | 0.5 | Gap corto (botones en fila, meta propuesta) |
| `fib-13` | 13 | 0.8125 | Padding compacto (tarjeta, input) |
| `fib-21` | 21 | 1.3125 | **Padding de tarjeta propuesta** |
| `fib-34` | 34 | 2.125 | Separación entre bloques (lista ↔ panel lateral) |
| `fib-55` | 55 | 3.4375 | Respiración de sección (hero ↔ lista) |
| `fib-89` | 89 | 5.5625 | Separación escenas (vista lista ↔ vista detalle) |

### Zonas seguras y safe areas

- **Notch / Dynamic Island:** `padding-top: env(safe-area-inset-top)` en hero móvil
- **Barra inferior (OmniDock):** `padding-bottom: env(safe-area-inset-bottom) + 88px` (dock height)
- **Teclado virtual:** `viewport-units: dvh` en modales, `scroll-padding-bottom: 100px`

### Orden DOM (móvil: una columna)

1. **Propósito:** título de vista + métricas clave (propuestas activas, mi poder de voto)
2. **Acción principal:** botón «Crear propuesta» (flotante `fib-21` desde borde inferior)
3. **Apoyo:** filtros, delegación, análisis IA (accesibles via Logic curtain)
4. **Contenido:** lista de propuestas (virtualizada, `fib-21` gap)

---

## 6. Depth & Elevation

| Nivel | Tratamiento | Uso en Gobernanza |
|---|---|---|
| **0** | Plano, `border 1px rgba(255,255,255,0.06)` | Tarjetas propuesta en lista, tabla votos |
| **1** | `box-shadow: 0 4px 24px rgba(0,0,0,0.08)` | **Tarjeta propuesta hover**, paneles laterales abiertos |
| **2** | `box-shadow: 0 8px 32px rgba(0,0,0,0.12)` | Modales (confirmar voto, delegar), tooltip Zenith extendido |
| **3** | `box-shadow: 0 16px 48px rgba(0,0,0,0.16)` | OmniDock expandido, full-screen proposal editor |

**Profundidad decorativa (geometría sagrada):**
- **Vesica piscis** (solapamiento humano/IA): capa `aria-hidden`, `opacity 0.12`, centrada en intersección de paneles Horizon/Logic — guía la mirada al botón de acción compartida
- **Semilla de la vida** (crecimiento de red de delegaciones): fondo `opacity 0.06` en panel delegación, 7 círculos, centro = usuario actual
- **Flor de la vida 3D** (vista red de poder): solo en `/gobernanza/red`, WebGL canvas detrás del contenido, `opacity 0.15`, pausa con `prefers-reduced-motion`

---

## 7. Do's and Don'ts

### Do ✅

- Usar **tokens del ADN** (`palette.trinity.*`, `--radius-*`, `fib-*`, `typography.scale_ratio`) — nunca hex sueltos
- Reservar **Logic ámbar** (`#FFBF00`) para acciones de propuesta; **Anchor carmín** (`#DC143C`) solo para votos vinculantes
- Aplicar **radio `--radius-lg` (24px)** en tarjetas de propuesta; `--radius` (20px) en botones; `--radius-sm` (14px) en inputs
- Usar **escala φ** para jerarquía tipográfica; **escala 1.25** en móvil/plegable
- Espaciar con **Fibonacci** (`fib-13` padding tarjeta, `fib-34` entre bloques, `fib-55` respiración sección)
- Mantener **geometría en `aria-hidden`** y sin eventos cuando no comunica datos
- Animar solo **`transform` y `opacity`** (150–300ms); respetar `prefers-reduced-motion`
- **Contraste ≥ 4.5:1** en todos los estados; dianas ≥ 44px (móvil: 48px)
- **Cursor pointer** en todo lo clicable (botones, filas tabla, badges interactivos, enlaces)
- Texto en **español con acentos**; nombres descriptivos para colores («ámbar solar», «carmín sistema»)

### Don't ❌

- No usar **pill buttons** (9999px) para acciones principales — solo badges y avatares
- No introducir **colores de marca ajena** (Linear purple, Supabase emerald, Notion warm) — mapear a Trinity
- No usar **gradientes atmosféricos** de fondo — el cristal y la geometría son la atmósfera
- No mezclar **familias de radio** (Antigravity 4/12/24/42 vs OS 14/20/24/30/40) en el mismo componente
- No curvar **texto ni navegación** para imitar la espiral áurea — guía masa, contraste y vacío
- No justificar **WebGL** salvo escena espacial que ya lo requiera (solo `/gobernanza/red`)
- No reducir **cuerpo por debajo de 16px** — la escala 1.25 conserva base 16px en móvil
- No usar **emojis como iconos** — solo Lucide/Heroicons (`vote`, `users`, `message-square`, `brain`, `shield`)
- No duplicar **elevación** (nivel 1 + nivel 2 en mismo elemento) — un nivel por superficie

---

## 8. Responsive Behavior

### Breakpoints (heredados del OS + gobernanza)

| Nombre | Ancho | Cambios clave en Gobernanza |
|---|---|---|
| **TV / Ultra-wide** | ≥1920px | 3 columnas: Horizon (25%) · Centro (50%) · Logic (25%); tarjetas `φ²` título |
| **Escritorio** | 1280–1919px | 2 columnas áureas 38/62; paneles laterales fijos; tabla votos completa |
| **Tablet landscape** | 1024–1279px | Paneles laterales → curtains (hover 400ms o clic); tabla colapsa columnas secundarias |
| **Tablet portrait** | 768–1023px | Una columna; curtains desde perímetro; botón crear propuesta flotante fijo |
| **Móvil grande** | 430–767px | Escala 1.25; lista virtualizada; hero compacto `φ³` → `+3` (31px) |
| **Móvil / Plegable** | 280–429px | Escala 1.25; `padding: fib-13` global; botones apilados; tabla → tarjetas apiladas |

### Comportamiento de componentes

| Componente | Móvil (≤430px) | Tablet (768–1023px) | Escritorio (≥1024px) |
|---|---|---|---|
| **Tarjeta propuesta** | Apilada, `width: 100%`, acciones apiladas | Igual, `max-width: 520px` centrada | En rejilla 1-col (centro 61.8%) |
| **Panel Horizon (crear)** | Bottom sheet (arrastrar, 60% viewport) | Curtain izq (38.2%, hover/clic) | Fijo izq (38.2%) |
| **Panel Logic (control)** | Bottom sheet (arrastrar, 60%) | Curtain der (38.2%, hover/clic) | Fijo der (38.2%) |
| **Tabla votos** | Tarjetas apiladas (avatar + voto + poder) | Tabla 4 col (oculta argumento) | Tabla completa 6 col |
| **Botón crear propuesta** | Flotante fijo inf. der (`fib-21` de dock) | Flotante fijo inf. der | En Horizon curtain (fijo sup.) |
| **Geometría sagrada** | Solo vesica piscis (CSS, `opacity 0.08`) | Vesica + semilla (SVG, `opacity 0.1`) | Completa (WebGL en `/red`) |

### Touch targets y accesibilidad

- **Mínimo 48×48px** en móvil/plegable (botones, filas, badges interactivos)
- **Espacio entre dianas:** `fib-8` (8px) mínimo
- **Focus visible:** `ring 2px` `palette.trinity.logica.active` `offset 2px` en todos los interactivos
- **Movimiento reducido:** `transition: none` en curtains, geometría estática, sin hover transform

---

## 9. Agent Prompt Guide

> Guía acortada para que un agente genere interfaces de gobernanza coherentes. Basado en `PROMPT.md` del contexto gobernanza (registro v2026-11-20).

### Referencia rápida de tokens

```text
Colores:
  Propuesta (acción)     → palette.trinity.logica.active     (#FFBF00, ámbar solar)
  Voto vinculante        → palette.trinity.anchor.active     (#DC143C, carmín sistema)
  Guía IA (Zenith)       → palette.trinity.zenith.active     (#007FFF, azul eléctrico)
  Creación (Horizon)     → palette.trinity.horizonte.panel   (#10B981, esmeralda horizonte)
  Fondo base             → --aw-shell                        (#0A0F1D, noche)
  Superficie tarjeta     → --aw-surface                      (#111827)
  Texto principal        → --aw-ink                          (#F8F9FA)
  Texto secundario       → --aw-text                         (#D1D5DB)

Tipografía:
  Título vista     → Rajdhani 700, φ³ (4.236rem), tracking -0.5px
  Título sección   → Rajdhani 700, φ² (2.618rem)
  Título propuesta → Rajdhani 700, φ¹ (1.618rem)
  Cuerpo           → Inter 300, 1rem, line-height 1.6
  Cifras/votos     → JetBrains Mono 400, tabular-nums
  Argumentación    → Quicksand 400, 1rem, line-height 1.7

Espacio (Fibonacci):
  Padding tarjeta  → fib-21 (21px / 1.3125rem)
  Gap botones      → fib-8  (8px / 0.5rem)
  Bloque–bloque    → fib-34 (34px / 2.125rem)
  Sección–sección  → fib-55 (55px / 3.4375rem)

Radio:
  Tarjeta          → --radius-lg (24px)
  Botón            → --radius (20px)
  Input            → --radius-sm (14px)
  Badge / Avatar   → 9999px (full)

Elevación:
  Tarjeta base     → nivel 0 (borde hairline)
  Tarjeta hover    → nivel 1 (0 4px 24px rgba(0,0,0,0.08))
  Modal / Curtain  → nivel 2 (0 8px 32px rgba(0,0,0,0.12))
```

### Ejemplos de petición (prompts para agente diseñador)

```text
# Lista de propuestas (vista principal)
"Crea la vista principal de gobernanza: hero con métricas (propuestas activas, mi poder, delegadas), botón flotante 'Crear propuesta' ámbar solar, lista virtualizada de tarjetas cristal noctámbulo con badge de fase (borrador/debate/votación), padding fib-21, radio 24px, hover elevación nivel 1. Paneles Horizon/Logic como curtains en tablet, fijos en escritorio (rejilla 38/62). Geometría vesica piscis en intersección, aria-hidden, opacity 0.12."

# Tarjeta de propuesta (componente)
"Componente PropuestaCard: fase (badge pill 9999px, φ⁻¹ mono), título (Rajdhani 700 φ¹ ámbar solar), resumen (Inter 300 base 3 líneas), meta (JetBrains Mono φ⁻¹ muted: autor, fecha, votos), acciones (botón primario ámbar 'Apoyar', fantasma azul 'Delegar', peligro rojo 'Retirar'). Variante --borrador (borde esmeralda 30%), --debate (ámbar 40%), --votacion (carmín 40%), --aprobada (fondo esmeralda 5%)."

# Detalle de propuesta + tabla de votos
"Vista detalle: hero propuesta (título φ², argumento Quicksand base, métricas φ⁻¹ mono), pestañas 'Debate' / 'Votación' / 'Delegaciones'. Tabla votos: columnas Perfil (avatar+nombre), Voto (pill sí/no/abs/deleg), Poder (mono tabular), Argumento (truncado, expandible). Fila hover ámbar 3%. Curtain Logic con delegación (semilla de la vida opacity 0.06) y análisis Zenith."

# Formulario crear propuesta (Horizon curtain)
"Formulario en curtain Horizon (38.2% izq, cristal noctámbulo): título (input fib-13 padding, radio 14px, focus ring ámbar), tipo (select: decisión/consulta/emergencia), argumento (textarea Quicksand, min 120px, resize vertical), etiquetas (chips pill ámbar 16%), botones: 'Guardar borrador' (secundario ámbar), 'Publicar' (primario ámbar). Validación: título ≥ 5 chars, argumento ≥ 50 chars."

# Panel delegación (Logic curtain)
"Curtain Logic (38.2% der): mi poder actual (φ¹ mono tabular), delegaciones activas (lista: avatar + nombre + poder + badge 'delegada' azul), buscar perfil (input + autocomplete), botón 'Delegar' (primario carmín) → modal confirmación (nivel 2 elevación) con resumen de poder transferido y plazo revocable. Geometría semilla de la vida (7 círculos, centro=yo) opacity 0.06 fondo."
```

### Checklist de verificación (antes de entregar)

- [ ] Todos los colores son tokens del ADN (`palette.trinity.*`, `--aw-*`)
- [ ] Tipografía usa familias del ADN (Rajdhani/Inter/JetBrains/Quicksand) con fallbacks
- [ ] Escala φ en escritorio, 1.25 en móvil; base 16px siempre
- [ ] Espaciado Fibonacci (`fib-2` a `fib-89`); no valores inventados
- [ ] Radios: tarjeta 24px, botón 20px, input 14px, badge 9999px
- [ ] Elevación: 0/1/2/3 según tabla; un nivel por superficie
- [ ] Geometría en `aria-hidden`, `opacity ≤ 0.15`, sin eventos
- [ ] Transiciones 150–300ms, solo `transform`/`opacity`, `prefers-reduced-motion`
- [ ] Contraste ≥ 4.5:1, dianas ≥ 44px (48px móvil), `cursor-pointer` en clicables
- [ ] Textos en español con acentos; nombres descriptivos de color
- [ ] Formato numerado (9 secciones) completo; declara registro y fecha ADN

---

*Fin del DESIGN.md — Contexto Gobernanza v2026-11-20 (ADN registro v2026-11-20)*