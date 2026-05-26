# 🎨 Reglas de Diseño Adaptativo — StarSeed

> Estas reglas garantizan que **cualquier widget, componente o sección** se vea correctamente sobre **cualquier estilo, fondo o configuración** del usuario, sin superposiciones, sin desbordamientos y respetando los límites de espacio.

El sistema StarSeed permite personalización ilimitada (estilos curados, IA, manual, biblioteca). Para que esa libertad NO rompa la experiencia, todos los componentes deben seguir estas reglas.

---

## 1. Filosofía: el diseño principal es la referencia

El **diseño principal actual** (Crystal Liquid Glass + Trinity + tokens de `MASTER.md`) es la referencia única. Todos los temas/estilos —base y curados— deben respetar la misma estructura: cambia el matiz, no la jerarquía.

- Un widget que se ve bien en el tema `dark` debe verse bien en `synthwave-horizon`, `solarpunk-aurora` y `bauhaus-modular` sin un solo cambio de código.
- Los **tokens** (variables CSS) son la única fuente de verdad. Nunca hardcodear colores, radios, espaciados, blur o sombras.

---

## 2. Tokens — la única fuente de verdad

Toda decisión visual debe expresarse mediante variables CSS del `AppearanceContext`:

### Geometría
```css
border-radius: var(--radius);                /* default 0.5rem */
font-size: calc(16px * var(--font-scale));   /* default 1× */
padding: var(--space-md);                    /* tokens xs/sm/md/lg/xl/2xl/3xl */
```

### Cristal / Glass
```css
backdrop-filter: blur(var(--glass-blur));       /* default 16px */
background: rgba(255,255,255,var(--glass-opacity)); /* default 0.6 */
border: var(--border-width) solid rgba(255,255,255,calc(var(--glass-border-opacity) * 1));
```

### Tipografía
```css
font-family: var(--font-body);
letter-spacing: var(--letter-spacing, normal);
```

### Texto difuso (modos Crystal/Liquid)
```css
filter: blur(var(--text-diff-blur));
opacity: var(--text-diff-opacity);
text-shadow: 0 0 calc(var(--text-diff-glow) * 6px) currentColor;
```

**Anti-patrón:** `style={{ background: "#fff" }}`. Si necesitas un color custom, define un token primero.

---

## 3. Contraste mínimo automático

- Todo texto sobre cualquier fondo debe alcanzar **4.5:1** mínimo (WCAG AA).
- Cuando el fondo es indeterminado (WebGL, gradient, imagen del usuario), usa un **velo adaptativo**:

```tsx
// Patrón de velo adaptativo bajo texto sobre fondos arbitrarios
<div className="relative">
  <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background/85" />
  <div className="relative">…texto…</div>
</div>
```

- Si el usuario activa **alto contraste** (`html.a11y-high-contrast`), los componentes deben preservar legibilidad (ese filtro global se encarga del resto).
- Nunca apoyes información solo en color (rojo=error). Acompaña siempre con icono o texto.

---

## 4. Espacio: prevenir superposiciones y desbordamientos

### Reglas de truncamiento

| Tipo de texto | Tratamiento |
|---|---|
| Título de card (h3/h4) | `truncate` (1 línea) |
| Descripción / tagline | `line-clamp-2` (máx 2 líneas) |
| Body de notificación / mensaje | `line-clamp-3` |
| Cuerpo de post / artículo | sin clamp — usa scroll |
| URLs, hashes, IDs | `truncate` + `font-mono` |

### Reglas de layout para cards

- Toda card debe ser `flex flex-col` con `min-w-0` para permitir truncamiento.
- Los hijos directos con texto largo necesitan `min-w-0` y `truncate` o `break-words`.
- Iconos: `shrink-0` para que nunca se compriman.
- Badges en cabecera: `max-w-[80-120px] truncate` para no romper el layout.
- Swatches/dots: `shrink-0` y separados con `gap-`, jamás `absolute` superpuestos.

### Reglas de espaciado por componente

- **Cards (CrystalCard, GlassCard):** `p-3` mínimo, `p-5` standard, `p-6 md:p-8` premium.
- **Botones:** `min-h-9` (estándar), `min-h-11` (large/touch), `min-h-12` (huge).
- **Iconos clicables:** mínimo **24×24px** desktop, **44×44px** mobile (WCAG 2.5.5).
- **Modales / drawers:** padding al menos `p-5 md:p-6`.

### Reglas para grids

```tsx
// Grid responsivo correcto
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
  {/* ... */}
</div>
```

- `gap-` SIEMPRE (nunca margin externo).
- Mobile-first: 1 columna en xs, escalar a sm/md/lg/xl.
- Aspect ratio fijo si las cards llevan imagen (evita layout shift).

---

## 5. Componentes adaptativos a estilo seleccionado

Para que un widget se adapte automáticamente al estilo activo:

### Patrón A — Componente puramente token-based

```tsx
<div className="
  rounded-[var(--radius,0.5rem)]
  bg-[rgba(var(--card-rgb,255_255_255),var(--glass-opacity,0.6))]
  backdrop-blur-[var(--glass-blur,16px)]
  border border-white/10
  p-4
">
  …
</div>
```

Funciona sin cambios en todos los estilos.

### Patrón B — Componente con variantes que detecta el preset activo

```tsx
const { config } = useAppearance();
const isBrutalist = config.styling.hardShadows || config.themeStore?.activeTemplateId === "bauhaus-modular";
const isNeon = config.buttons?.style === "neon";

return (
  <div className={cn(
    "rounded-[var(--radius)] bg-[var(--card-bg,rgba(255,255,255,0.06))] backdrop-blur-md p-4",
    isBrutalist && "border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]",
    isNeon && "ring-2 ring-primary/40 shadow-[0_0_20px_var(--primary)]"
  )}>
    …
  </div>
);
```

**Importante:** estas variantes deben ser **aditivas**, no reemplazar la estructura base.

---

## 6. Fondos arbitrarios y velos

Cuando el usuario tiene un fondo WebGL, video, o imagen, los componentes deben mantener legibilidad. Usa este árbol:

1. **Backdrop blur + opacidad** del glass del estilo: cubre el 80% de los casos.
2. **Velo adicional** si el contraste lo exige (ver §3).
3. **Modo "high readability"** opt-in del usuario: aumenta `--glass-opacity` a 0.9.

Si un widget necesita renderizar sobre TODO el fondo (ej. canvas 3D), debe aceptar una prop `transparent?: boolean` que desactive el glass.

---

## 7. Reglas para nuevos widgets de la biblioteca

Cuando un widget se descarga de la biblioteca o se genera con IA, debe cumplir:

- [ ] Acepta `className` para que el contenedor padre pueda ajustar tamaño.
- [ ] Usa solo tokens CSS, ningún hex hardcodeado salvo en swatches/ilustraciones.
- [ ] Define `min-w-0` en hijos con texto largo.
- [ ] Iconos con `shrink-0`.
- [ ] Estados `loading`, `empty`, `error` cubiertos visualmente.
- [ ] Funciona en mobile (375px) sin overflow horizontal.
- [ ] Respeta `prefers-reduced-motion`.
- [ ] No usa `position: absolute` sobre el contenido principal (solo decoración).
- [ ] Si tiene animaciones, las desactiva cuando `html.a11y-pause-animations` está presente.
- [ ] **Diff-friendly:** sus props son tipadas con TypeScript estricto y exportadas.

### Manifiesto JSON de un widget

```json
{
  "id": "weather-fluid",
  "name": "Weather Fluid",
  "description": "Reporte climático con animación fluida.",
  "version": "1.0.0",
  "category": "data",
  "compatibleStyles": ["all"],
  "minSize": { "w": 2, "h": 2 },
  "maxSize": { "w": 4, "h": 4 },
  "defaultProps": { "location": "auto", "units": "metric" },
  "permissions": ["geolocation:optional"],
  "license": "AGPL-3.0-or-later"
}
```

---

## 8. Pre-merge checklist visual (para PRs)

Antes de mergear, comprueba este checklist en TRES estilos al menos:

- [ ] Dark + Crystal (default)
- [ ] Light + Origami Paper (minimal claro)
- [ ] Synthwave Horizon (cyberdélico saturado)

Y verifica:

- [ ] No hay overflow horizontal en mobile (375px)
- [ ] Texto largo se trunca / clamp, no rompe layout
- [ ] Iconos nunca se comprimen (shrink-0 funcionando)
- [ ] Badges no se superponen con el contenido
- [ ] Sombras y bordes se ven correctos sobre fondo claro y oscuro
- [ ] Hover/focus visible en ambos modos
- [ ] Funciona con accesibilidad activada (alto contraste, reduce motion, large text)

---

## 9. Reglas de naming visual

- **No emojis como iconos** — usar Lucide React.
- **Capitalización:** Title Case para títulos, Sentence case para descripciones.
- **Tono:** directo, evocador, sin marketing barato.
- **Citas constitucionales:** cuando un componente toca un principio (gobernanza, identidad, IA), puede citar el artículo correspondiente en un `<title>` o tooltip.

---

## 10. Inspiración para diseñadores y usuarios

Los estilos de la biblioteca curada cubren el espectro:

| Mood | Ejemplo | Cuándo usarlo |
|---|---|---|
| Cyberdélico | Synthwave Horizon, Tokyo Midnight | Sesiones creativas, alta energía |
| Solarpunk | Solarpunk Aurora | Trabajo diurno, optimismo |
| Minimal | Origami Paper, Lavender Mist | Concentración, escritura |
| Brutalist | Bauhaus Modular | Editor de código, gobernanza |
| Futurista | Aurora Borealis, Quantum Hex | Exploración, multiverso |
| Orgánico | Verdant Earth, Terracotta Warm | Convivencia, cultura |
| Luxury | Monaco Noir, Iridescent Pearl | Presentaciones, perfil público |

Cualquier usuario puede crear el suyo en `/settings → Apariencia → Estilos` o pedirle a la IA del Editor Universal que genere uno desde una imagen o descripción.

---

## 11. Cómo extender estas reglas

Si encuentras un caso no cubierto:

1. Documéntalo aquí (PR con sección nueva).
2. Discútelo en `/network/politics` si afecta a UX universal.
3. Si requiere cambio del AppearanceContext, sigue la regla dorada del proyecto: actualiza primero `memory/architecture.md` y luego el código.

---

*Estas reglas son cláusula viva, no pétrea. Pueden ampliarse, pero solo para ampliar libertad de personalización, jamás para restringirla.*
