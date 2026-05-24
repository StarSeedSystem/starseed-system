# Design System: StarSeed Network
**Project ID:** projects/9377170978642673597

## 1. Visual Theme & Atmosphere
**"Ontocracia Ciberdélica Transhumanista"**
The interface feels like a living organism merged with advanced technology. It is **fluid, reactive, and multidimensional**. Interactive elements behave like "liquid crystal" — pulsing, refracting light, and distorting backgrounds organically. The UI is **Zero-Friction**, adhering to a "Perimeter Activation" paradigm where controls emerge from the edges only when needed.

**Keywords:** Bioluminescent, Crystalline, Fluid, Ethereal, Deep Space, Holographic.

## 2. Color Palette & Roles
The "Trinity" system assigns specific energies to screen directions:

*   **Zenith Blue (Top) - AI & Wisdom**
    *   **Electric Azure (#007FFF)**: Primary active state for AI assistance.
    *   **Deep Void Blue (#001F3F)**: Background/Inactive state.
    *   *Role*: Represents guidance, wisdom, and the "exocortex".

*   **Creation Green (Left) - Genesis & Vitality**
    *   **Neon Lime (#39FF14)**: Active cursor interaction/highlight.
    *   **Emerald Glass (#10B981)**: Panel backgrounds.
    *   *Role*: Tools for creation, ideation, and infinite canvas.

*   **Logic Gold (Right) - Order & Control**
    *   **Solar Amber (#FFbf00)**: Active state.
    *   **Burnished Gold (#D4AF37)**: Panel backgrounds.
    *   *Role*: Settings, technical parameters, logic systems.

*   **Anchor Red/Neutral (Bottom) - Stability**
    *   **System Crimson (#DC143C)**: Navigation root / "System Architecture" mode.
    *   **Prism White (#F8F9FA)**: General text and neutral containers.
    *   *Role*: Main menu, grounding, exit/entry.

## 3. Typography Rules
*   **Font Family**: Futuristic sans-serif (e.g., *Inter* or *Rajdhani*). Clean, legible, but with a tech edge.
*   **Weights**:
    *   **Headers**: Light/Thin (300) with wide tracking (letter-spacing) for an ethereal feel.
    *   **Body**: Regular (400) for high readability.
    *   **Data/Code**: Monospace (e.g., *JetBrains Mono*) for the "Logic" panel.

## 4. Component Stylings
*   **Liquid Glass Surfaces**:
    *   **Material**: High transparency, background blur (`backdrop-filter: blur(20px)`), and localized distortion.
    *   **Distortion**: Uses `LiquidGlass` shader with `displacementScale: 64` and `elasticity: 0.35` (bouncy).
    *   **Borders**: No solid borders. Edges are defined by refractive light (white/cyan inner glow) and subtle "rim lighting."

*   **Panels (The Trinity)**:
    *   **Behavior**: Slide out from edges using spring physics ("boing" effect).
    *   **Appearance**: Translucent curtains of their respective color (Blue/Green/Yellow) that tint the underlying content.

*   **Buttons**:
    *   **Shape**: Strictly "Pill-shaped" (`rounded-full`).
    *   **Interaction**: On hover, they "bulge" or "liquefy" slightly using the displacement map.
    *   **Glow**: Internal luminescence rather than drop shadows.

## 5. Layout Principles
*   **Perimeter Paradigm**: The center of the screen is kept sacred and empty for the "content" or "canvas." Controls live exclusively off-screen until summoned.
*   **Fluid Grid**: Masonry or organic grids for dashboards, allowing widgets to "float."
*   **Depth**: Deep layering. Background < Liquid Layer < Content Layer < Floating Controls.

## 6. Crystal Design System (Liquid Glass)

Based on `liquid-glass-react` capabilities, we define the following presets for the "Ontocracia Ciberdélica" aesthetic:

### 1. Crystal Card (Static Container)
Used for: Info panels, profile cards, static widgets.
- **Displacement**: 100
- **Blur**: 0.5 (Frosted)
- **Saturation**: 140%
- **Aberration**: 2.0
- **Elasticity**: 0.0 (Rigid)
- **Corner Radius**: 32px

### 2. Liquid Action (Interactive Element)
Used for: Primary buttons, floating triggers.
- **Displacement**: 64
- **Blur**: 0.1 (Clearer)
- **Saturation**: 130%
- **Aberration**: 2.0
- **Elasticity**: 0.35 (Fluid response to cursor)
- **Corner Radius**: 100px (Pill/Circle)

### 3. Holographic Shield (Overlay)
Used for: Modals, warnings, high-priority notifications.
- **Displacement**: 150 (High distortion)
- **Blur**: 0.0 (Clear)
- **Saturation**: 200% (Vibrant)
- **Aberration**: 5.0 (Strong rainbow edges)
- **Mode**: "polar" or "prominent"

### 4. Hyper-Crystal (Realism)
Used for: Main application windows, docks, and high-fidelity elements.
- **Reference**: `liquid-glass.io` style.
- **Displacement**: 120
- **Blur**: 0.6 (Soft, premium frost)
- **Saturation**: 110% (More natural)
- **Aberration**: 3.0
- **Elasticity**: 0.2 (Subtle physics)
- **Corner Radius**: 48px+ (Heavy rounding)

