# Referencia: brag (habilidad de producción audiovisual)

**Fuente:** `latent-spaces/brag` (commit `669ab9286aa28b6c3ee30e75f181ee74319d012a`, 2026-11-14, MIT)
**Instalada en:** `vendor/habilidades/brag`, `vendor/habilidades/brag-slim`, `.agent/skills/brag`, `.agent/skills/brag-slim`
**Ficha en Librería:** `config/repos-libreria-1113.json` → `lib-brag`

---

## Cuándo usar brag

| Situación | Qué hacer | Comando |
|---|---|---|
| **Release estable publicada** | El estudio propone un vídeo brag de la versión (borrador para aprobar) | `/brag --full` |
| **Función nueva destacada** | Vídeo centrado en la novedad (hook = la función) | `/brag --full --title "Nueva función: X"` |
| **Shorts / Reels (Matriz: Mente Digital)** | Formato vertical, 15–20 s, mismo material recortado | `/brag --full --format vertical` |
| **Demo rápida para el equipo** | Versión ligera sin HyperFrames, solo modelo | `/brag-slim` (solo con aprobación) |

**Disparador canónico:** al publicarse una release estable, el estudio propone automáticamente un vídeo brag de la versión como borrador para aprobar. No se espera a que alguien lo pida.

---

## Reglas de economía

| Modo | Qué usa | Coste | Cuándo |
|---|---|---|---|
| **`/brag --full` (por defecto)** | HyperFrames + modelos gratuitos/de bajo coste (FreeLLMAPI, Ollama, modelos `:free` de OpenRouter) | ~$0 | **Siempre por defecto** |
| **`/brag-slim`** | Opus 5.5 (modelo único, sin HyperFrames) | Créditos Opus | **Solo con aprobación explícita de Maggasukha** |

- La flota gratuita cubre el render local de HyperFrames; no se usan claves de pago.
- Ante 429/402 se releva al siguiente proveedor gratuito sin insistir.
- `brag-slim` existe para Opus: si el modelo actual es Opus 5.5 y no se pide `--full`, el skill cambia a `brag-slim` automáticamente y avisa.

---

## Reglas de marca

1. **Símbolo:** el original (`public/starseed-symbol*.png`), compuesto en postproducción. **Nunca** generado por IA.
2. **Colores:** exclusivamente tokens del sistema (`tokens.json`: temas noche, nieve, cristal…). Nada de hex sueltos.
3. **Tipografía:** Satoshi (editorial/premium), Rajdhani (técnico/cifras), Inter (cuerpo), Quicksand (orgánico), JetBrains Mono (código). Máximo tres por pieza.
4. **Música:** tracks CC BY 4.0 de **ende.app** (`happy-beats-business-moves-vol-1/9/10/11/12`). **Obligatorio citar en créditos:** «Music: happy-beats-business-moves by ende.app (CC BY 4.0)».
5. **Efectos de sonido:** los 200+ SFX OGG/WAV incluidos en `vendor/habilidades/brag/` (cartas, dados, chips, clicks, footsteps, impacts, switches, etc.). Uso libre dentro de la skill.
6. **Intro canónica:** si el vídeo abre o cierra con la marca, usa la intro aprobada (`escena1-v4.mp4`, 29.6 s) y el sonido oficial («Semilla estelar», 10.3 s). Ver `memory/diseno/identidades.md` § «Intro canónica» y «Sonido oficial».
7. **Composición centrada:** elementos centrados en su ventana, ventanas centradas en pantalla, controles persistentes desde los bordes.

---

## Proceso de aprobación (nada se publica sin palabra)

1. **Generación:** el skill produce `brag-output-YYYY-MM-DD-HHmmss/` con `brag.mp4`, `brag.jpg` (poster, frame 0), `share-copy.txt`, `brag-plan.md`, `composition/`.
2. **Entrega de borrador:** se suben el MP4 y los textos a **Drive › Videos › Proyectos en desarrollo** y se avisa en el **chat de producción**.
3. **Revisión:** Maggasukha ve el vídeo, la copia y el plan. Puede pedir re-roll de escenas, cambio de tono, o aprobar.
4. **Publicación:** solo tras aprobación explícita («sí», «publica», «aprobado»). El estudio publica en los canales correspondientes.

---

## Estructura de salida (HyperFrames)

```
brag-output-2026-11-14-143022/
├── brag.mp4              # Vídeo final (15–25 s, 30 fps, H.264, AAC)
├── brag.jpg              # Poster (frame 0, baked in)
├── share-copy.txt        # 1–3 frases, postable, específica, tono del vídeo
├── brag-plan.md          # Storyboard beat-a-beat, hook, highlights, punchline, music cues
├── composition/          # Proyecto HyperFrames (npx hyperframes check pasa sin errores)
└── work/                 # Frames intermedios, descargas, stems, scripts
```

---

## Tonos disponibles

| Preset | Energía | Uso típico |
|---|---|---|
| `default` | Juguetón, limpio, publicable | Buen vibe general |
| `polished` | Serio, elegante | Proyectos que no son broma |
| `yc-parody` | Deadpan startup | Falso seriedad en proyectos absurdos |
| `chaotic` | Rápido, alto, agresivo | Over-the-top, desenfrenado |
| `deadpan` | Calmo, seco, subestimado | La gracia es que nada es gracia |
| `cinematic` | Dramático, escala tráiler | Gran motion, grandes claims |
| `app-store` | Limpio, tarjetas de features | Corporativo pero no aburrido |
| *freeform* | Dirección creativa libre | «Fake Series A launch from 2016», «museum exhibit», etc. |

---

## Leyes creativas (inquebrantables)

1. **Corto:** 15–25 s. Ni un segundo más sin razón. La narración no extiende la ventana.
2. **Legible:** Ritmo por motion y cortes, no quitando texto pronto. Cada línea legible se queda el tiempo necesario (~0.3 s/palabra).
3. **Específico:** Debe sentirse hecho para **este** proyecto exacto.
4. **Muestra la cosa:** Al menos una escena con UI real, copia real o key visual del producto. Nada de relleno abstracto.
5. **Cero SaaS genérico:** «Streamline your workflow» prohibido. Usa la copia y claims reales del proyecto.
6. **El hook lo es todo:** Los primeros 2 s deciden si se queda viendo. Planifica el hook primero.
7. **Lo gracioso se gana:** El humor sale de la absurdidad del proyecto, no de intentar ser gracioso.
8. **Patrón base:** Hook (2–3 s) → Reveal (2–4 s) → 2–3 highlights (5–12 s) → Punchline/outro (2–4 s). Se adapta, no es plantilla rígida.

---

## Créditos obligatorios en publicación

> **Music:** happy-beats-business-moves by ende.app (CC BY 4.0)  
> **SFX:** included in brag skill (latent-spaces/brag, MIT)  
> **Symbol:** StarSeed original (hand-crafted, not AI-generated)  
> **Colors/tokens:** StarSeed Design System  
> **Tool:** /brag (latent-spaces/brag) + HyperFrames

---

## Referencias técnicas

- `vendor/habilidades/brag/SKILL.md` — skill principal (`/brag`)
- `vendor/habilidades/brag-slim/SKILL.md` — skill ligera (`/brag-slim`)
- `vendor/habilidades/brag/references/` — step-1-inspect.md, step-2-plan.md, step-3-compose.md, step-4-deliver.md, audio.md, tones.md
- `vendor/habilidades/brag/scripts/analyze_music_cues.py` — análisis de cues musicales
- `vendor/habilidades/brag/assets/music/` — tracks MP3 + cues JSON/MD (CC BY 4.0)
- `vendor/habilidades/brag/` — 200+ SFX OGG/WAV en raíz
- `config/repos-libreria-1113.json` — ficha `lib-brag` con commit, licencia, reglas
- `memory/diseno/identidades.md` — intro canónica, sonido oficial, tokens, tipografía
- `memory/diseno/armonia.md` — escala φ, Fibonacci, rejilla áurea, radios, proporciones