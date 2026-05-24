# Antigravity Flux — Theme Manifest

> System Configuration Package for the StarSeed Network

---

## Identity

| Field       | Value                                             |
| ----------- | ------------------------------------------------- |
| Name        | Antigravity Flux                                  |
| Version     | 1.0.0                                             |
| Author      | System Pilot                                      |
| License     | Sovereign Use — StarSeed Network                  |
| Description | Trans-dimensional liquid-glass interface theme     |

## Vision

Ontocratic Cyberdelic Transhumanism — fluid, reactive, bioluminescent UI built on the Trinity Interface geometry. Every surface refracts, every control has physical weight, and the colour language maps directly to the four Trinity axes.

## Compatibility

| Dependency     | Minimum | Tested  |
| -------------- | ------- | ------- |
| React          | 18.0    | 18.3    |
| Framer Motion  | 12.0    | 12.6    |
| Tailwind CSS   | 3.4     | 3.4.17  |
| lucide-react   | 0.400   | 0.468   |
| TypeScript     | 5.0     | 5.7     |

## Directory Structure

```
theme-antigravity-flux/
├── config/
│   ├── theme_params.json      # 160 tokens — palette, shadows, containers, a11y
│   └── motion_physics.json    # 115 entries — springs, tweens, gestures, shader params
├── components/
│   ├── Windows.tsx             # WindowFrame · TabbedWindow · ModalOverlay
│   ├── Navigation.tsx          # Dock (proximity magnify) · ContextMenu · TopBar
│   ├── Controls.tsx            # LiquidButton · ToggleSwitch · GlassInput · GlassSlider
│   └── Widgets.tsx             # GlassCard · StatWidget · OracleCard · GraphNode
│                               # ProgressRing · DataFusionCluster
├── assets/
│   ├── shaders/
│   │   ├── liquid.glsl         # Simplex-noise liquid overlay
│   │   └── glass_refraction.glsl  # Chromatic aberration refraction shader
│   └── icons/
│       └── index.tsx           # 7 morphable glyphs (Zenith · Horizonte · Lógica
│                               # Base · Sovereign · FluxSpinner · Network)
└── manifest.md                 # ← you are here
```

## Config Layer

### theme_params.json

- **Trinity Palette** — Zenith (cyan/blue), Horizonte (green), Lógica (gold/amber), Base (crimson/neutral). Each axis defines `active`, `panel`, `glow`, and `mist` variants.
- **Shadow System** — 5-level depth (`sm` → `extreme`) plus directional glow shadows.
- **Container Anatomy** — Window title bar height/style, tab curvature/transition, panel blur/tint.
- **Dock Config** — Floating margin, icon size, magnification scale/range, background opacity.
- **Accessibility** — Min contrast 4.5 : 1, focus ring width/offset/color, reduced-motion fallbacks, min touch target 44 px.

### motion_physics.json

- 11 named **spring** presets: `button_press`, `toggle_snap`, `slider_thumb`, `dock_enter`, `dock_magnify`, `panel_slide`, `tab_switch`, `modal_scale`, `card_hover`, `menu_elastic`, `window_entry`.
- 4 named **tween** presets: `fade`, `tab_switch`, `color_shift`, `shimmer`.
- **Gesture** params: tap scale/offset, hover scale/glow intensity, drag elasticity.
- **Shader** params: refraction index 1.45, distortion 0.015, chromatic aberration 0.012.
- **Reduced-motion** fallbacks for all spring and tween categories.

## Component Layer

| Component       | Key Features                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `WindowFrame`   | Glassmorphic with chromatic top edge, refraction overlay, traffic lights, focus Z-elevation         |
| `TabbedWindow`  | Animated tab indicator/glow, fade+slide content transitions                                        |
| `ModalOverlay`  | Backdrop blur entrance, scale+fade choreography                                                    |
| `Dock`          | macOS-style proximity magnification, process dots, badges, tooltip on hover                        |
| `ContextMenu`   | 42 px extreme corner radius, spring entrance, divider + danger states                              |
| `TopBar`        | Status LED (active/idle/warning), network, battery, Sovereign ID, clock                            |
| `LiquidButton`  | Physical sink on press, perimeter glow on hover, shimmer sweep, depression shadow                  |
| `ToggleSwitch`  | Color-burst on activate, spring knob, semantic status text                                         |
| `GlassInput`    | Floating morphing label, error state, focus ring, custom caret                                     |
| `GlassSlider`   | Glass rail, accent color, animated thumb, drag tooltip, min/max value display                      |
| `GlassCard`     | Trinity glow mapping, scanline texture, hover lift, configurable glow colour                       |
| `StatWidget`    | Icon + title + value + change badge, colour-coded                                                  |
| `OracleCard`    | Zenith-axis cyan mist, resplandor top edge, configurable glow intensity                            |
| `GraphNode`     | Lógica-axis, status LED (active/idle/error), connection count, spring hover                        |
| `ProgressRing`  | SVG animated stroke dash, glow drop-shadow, percentage label                                       |
| `DataFusion`    | Shared glow underlay, responsive grid, metaball-style grouped cards                                |

## Asset Layer

### Shaders

| Shader                 | Technique                                                       |
| ---------------------- | --------------------------------------------------------------- |
| `liquid.glsl`          | 2-layer simplex noise with time offset, purple↔cyan color mix   |
| `glass_refraction.glsl`| FBM + chromatic aberration, depth + mouse-reactive distortion, Fresnel edge, specular highlights |

### Icons — Morphable Glyph Pack

| Glyph             | Axis       | Idle → Active Morph Description                |
| ----------------- | ---------- | ----------------------------------------------- |
| `ZenithGlyph`     | Zenith     | Upward chevron → expanded star                  |
| `HorizonteGlyph`  | Horizonte  | Seedling → branching tree                       |
| `LogicaGlyph`     | Lógica     | Circle → connected graph with corner nodes      |
| `BaseGlyph`       | Base       | Flat line → anchor                              |
| `SovereignGlyph`  | Identity   | Shield → shield with checkmark                  |
| `FluxSpinner`     | System     | Static ring → orbiting arc (infinite rotation)  |
| `NetworkGlyph`    | Social     | Dots → connected mesh with animated path draw   |

## Sovereignty

This theme is a **self-sovereign** configuration package. It contains no external API calls, no telemetry, and no data collection. All rendering is client-side. The pilot retains full ownership of the system configuration.
