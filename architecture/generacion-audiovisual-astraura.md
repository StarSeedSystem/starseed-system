# 🎨 SOP — Generación audiovisual de Astraura: GRATIS/LOCAL primero (Adenda 138)

> **Fuente de verdad** de la habilidad de generación audiovisual (imagen, y con
> límites honestos audio y vídeo) de Astraura. Código: `src/ai/astraura/media/media-gen.ts`
> (motor) + `src/components/media/media-gen-panel.tsx` (panel de configuración/uso).
> **Regla dorada:** este SOP es la fuente de verdad. Si la lógica cambia, actualiza
> primero este documento y luego el código.
>
> *Número de adenda asignado por continuidad con el último documento del proyecto a
> fecha de escritura (2026-08-04); confírmalo/ajústalo si choca con otra ola en curso.*

---

## 0. La regla de oro (no negociable)

**La generación de imagen SIEMPRE funciona.** Ninguna cuenta, desde ningún
dispositivo, necesita instalar nada ni pegar ninguna clave para generar una
imagen desde Astraura. El suelo garantizado es **Pollinations.ai** (motor
`pollinations`, `access: "web-free"`): una petición GET pública, sin clave, con
CORS habilitado, usable directamente como `<img src>`. No depende de red propia,
ni de servidores del usuario, ni de descargas — **no se puede romper**.

Corolario de diseño, igual que en `aurora-voz-motores.md` §0: **ninguna función
de esta capa lanza excepciones**. Cada intento a un proveedor opcional (local o
de pago) va envuelto en manejo defensivo; si falla, `generateImage()` cae
**en silencio** a Pollinations. El usuario nunca se queda sin imagen por un
fallo de conexión a un servicio que él mismo configuró.

Esto es la aplicación directa de la Tríada Ideológica del proyecto (CLAUDE.md
§3, Ciberdelia + Transhumanismo Comunista): la tecnología amplifica sin pedir
peaje de entrada. Los servicios locales o de pago son **mejoras opcionales**,
nunca un requisito para que la habilidad exista.

---

## 1. Objetivo

Que la generación audiovisual sea una **habilidad activa por defecto, para
cualquier cuenta, desde la web, sin instalar nada** — y a la vez **configurable**:

- Por **personalidad/skill** (capacidad `av-gen` de Astraura, §5).
- Por **neurona** (dispositivo) o por **cuenta**, con un selector de proveedor
  independiente para cada tipo de medio (imagen / vídeo / audio).
- Con la opción de conectar un servicio **local** (más calidad y control:
  AUTOMATIC1111, Fooocus-API, ComfyUI) o uno **de pago con clave propia**
  (Hugging Face Inference, Muapi.ai), sin que eso sea nunca obligatorio.

---

## 2. Arquitectura gratis-primero

`src/ai/astraura/media/media-gen.ts` es el motor. Expone un **catálogo**
(`MEDIA_PROVIDERS`) y tres funciones de generación (`generateImage`,
`generateAudio`, `generateVideo`) que resuelven "qué proveedor usar" con la
preferencia del usuario y **siempre** caen a un resultado honesto.

| Proveedor (`MediaProviderId`) | Medios | Acceso | Clave | Qué es |
|---|---|---|---|---|
| **`pollinations`** ⭐ | imagen, audio | `web-free` | no | Motor por defecto. GET público sin clave; genera imagen al vuelo y sintetiza voz (texto→voz) vía `text.pollinations.ai`. No cubre vídeo de forma fiable. |
| `hf-inference` | imagen | `web-key` | sí (gratuita) | Hugging Face Inference API. Requiere un token Bearer gratuito del usuario; modelos gratuitos pueden tener cold-start. |
| `automatic1111` | imagen | `local-endpoint` | no | Servidor propio de Stable Diffusion WebUI (`--api`). Reutiliza el endpoint ya conectado en `/servicios` si existe. |
| `fooocus` | imagen | `local-endpoint` | no | Servidor propio Fooocus-API (SDXL). Reutiliza `/servicios` si existe. |
| `comfyui` | imagen, vídeo | `local-endpoint` | no | Servidor propio ComfyUI. Puede necesitar un proxy REST simple delante de un grafo personalizado. |
| `muapi` | imagen, vídeo, audio | `web-key` | sí (DE PAGO) | Catalogado, **no integrado como motor real** (§3). |
| `custom-endpoint` | imagen, vídeo, audio | `local-endpoint` | no | Cualquier endpoint HTTP propio del usuario (self-host o proxy genérico). |

⭐ Pollinations es el único `web-free` — es el proveedor **por defecto** de
imagen y el **failover final** de imagen y de audio.

**Cadena de resolución** (`resolveProvider(kind, neuronId)`):

1. Override de la **neurona** (`MediaPrefs.perNeuron[neuronId][kind]`), si existe
   y el proveedor declara soporte para ese `kind`.
2. Proveedor por **defecto de la cuenta** para ese `kind`
   (`defaultImage` / `defaultVideo` / `defaultAudio`).
3. **Pollinations**, si cubre ese `kind` (imagen/audio).
4. El primer proveedor del catálogo que cubra ese `kind` (relevante para vídeo,
   donde no hay `web-free`).

**Failover en generación** (`generateImage`): si el proveedor elegido (local o
de pago) falla — endpoint caído, CORS, timeout, clave inválida — la función cae
automáticamente a `pollinationsImage()`. El resultado (`MediaGenResult.provider`)
siempre dice **qué proveedor respondió de verdad**, para que la UI sea honesta
sobre si hubo failover.

**Reutilización de endpoints ya conectados:** `resolveEndpoint()` mira primero
`MediaPrefs.customEndpoints[id]` (lo que el usuario pegó en esta misma
habilidad) y, si no hay nada, la conexión ya guardada en `/servicios`
(`oss-connections.ts` vía `connectionsForService()`) para AUTOMATIC1111 y
Fooocus-API — así el usuario no repite la misma URL dos veces entre esta
habilidad y el resto del OS.

---

## 3. Por qué `open-generative-ai` / Muapi.ai NO es el motor por defecto

Se investigó `github.com/anil-matcha/open-generative-ai` como candidato a motor
agregador de imagen/vídeo/audio. Resultado: es un **frontend** sobre
**Muapi.ai**, una **pasarela de pago** de modelos de terceros — no gratis, y no
integrable "tal cual" sin que el usuario pague y traiga su propia clave.

Por eso:

- Muapi.ai **está catalogado** (`MEDIA_PROVIDERS` lo declara: `access: "web-key"`,
  `needsKey: true`) para que la UI y Aurora sepan que existe como opción futura.
- **No ejecuta generación real todavía.** `muapiImage()` en `media-gen.ts`
  devuelve siempre `ok:false` con un mensaje honesto en español (nunca finge una
  llamada de pago sin verificar el contrato real de la API). Lo mismo en
  `generateAudio`/`generateVideo`: si se pide `muapi`, se explica la situación y
  se cae a Pollinations (imagen/audio) o a `VIDEO_LIMIT_MESSAGE` (vídeo).
- Cuando se decida integrarlo de verdad, es un candidato **bring-your-own-key**:
  el usuario pega su clave de muapi.ai (`MediaPrefs.muapiKey`, el campo ya existe
  en el panel) y se implementa `muapiImage()`/variantes de vídeo-audio contra su
  API real. No cambia la filosofía: seguiría sin ser el motor por defecto.

---

## 4. Selección por personalidad, neurona y cuenta

Todo vive en una única preferencia (`MediaPrefs`, §7) persistida en
`localStorage["starseed.media.prefs.v1"]`:

- **Por cuenta:** `defaultImage` (siempre presente, cae en `"pollinations"`),
  `defaultVideo`, `defaultAudio` — el panel `<MediaGenPanel />` los edita en el
  bloque "Proveedor por defecto (tu cuenta)".
- **Por neurona (dispositivo):** `perNeuron[neuronId] = { image?, video?, audio? }`
  — un override que **hereda** el valor de cuenta salvo que se fije explícitamente.
  Útil, por ejemplo, si solo un equipo concreto tiene AUTOMATIC1111 corriendo y se
  quiere que SOLO esa neurona lo use sin cambiar el resto de la cuenta.
- **Por personalidad:** no es un campo aparte — la capacidad `av-gen` (§5) es lo
  que hace que Aurora **sepa** que puede generar audiovisual y con qué límites;
  qué proveedor usa de verdad sigue la cadena de cuenta/neurona de arriba. Si en
  el futuro se quiere una preferencia distinta por personalidad, el campo natural
  sería una clave adicional en `perNeuron` (p.ej. `perPersonality`) siguiendo el
  mismo patrón de merge explícito ya usado en `setMediaPrefs()`.

`setMediaPrefs(patch)` hace un merge amable: solo toca las claves presentes en
el patch (pasar `undefined` en una clave de `perNeuron` la borra y hace que
vuelva a heredar la cuenta); nunca lanza; persiste y emite el evento
`starseed:media-prefs` (`MEDIA_PREFS_EVENT`) para que cualquier panel abierto se
refresque en el momento.

---

## 5. Cómo se expone como habilidad de Astraura

Tres piezas, dos ya construidas por este módulo y una pendiente de cableado por
quien integre este SOP (ver §9 — por diseño, este módulo no toca esos archivos):

1. **Capacidad `av-gen`** en `src/ai/astraura/skills.ts` (`SKILL_CAPABILITIES`,
   ver `architecture/astraura-capabilities.md`): el bloque de conocimiento que
   Aurora recibe en su system prompt sobre que puede generar imagen (y los
   límites honestos de audio/vídeo), más el sesgo de routing si aplica.
2. **Tool `generar_imagen`** en `src/lib/integrations/aurora-tools.ts`
   (`AURORA_GENERATE_TOOLS`): la acción que Aurora ejecuta cuando el usuario le
   pide una imagen. **Ya existe una tool con este nombre**, cableada hoy a
   `generarImagen()` de `src/lib/aurora/generate/service-generation.ts`, que
   **solo** funciona si el usuario conectó Fooocus-API/AUTOMATIC1111 en
   `/servicios` (sin eso, avisa y no genera) — contradice la regla de oro de
   este SOP (§0). `generateImage()` de este módulo la sustituye/complementa con
   un resultado que **siempre** tiene éxito (ver §9 para la guía de cableado).
3. **Página de Habilidades** (`/habilidades`, `src/components/abilities/abilities-hub.tsx`):
   `<MediaGenPanel configOnly />` se puede embeber ahí como la configuración de
   la habilidad `av-gen` (proveedor por defecto, por neurona, claves/endpoints),
   sin duplicar un generador en vivo si esa pantalla ya tiene su propio flujo de
   prueba. Usado suelto (`<MediaGenPanel />`, `configOnly` por defecto en `false`)
   incluye además el generador en vivo con vista previa.

---

## 6. Límites honestos (no se inventan)

- **Audio:** Pollinations sirve voz vía `text.pollinations.ai` con
  `model=openai-audio` — es **síntesis de voz del propio prompt (TTS)**, no
  generación musical ni de efectos. Es el único motor de audio "siempre
  disponible"; `generateAudio()` cae ahí en cualquier caso que no sea un
  `custom-endpoint` configurado y funcionando.
- **Vídeo:** ningún proveedor gratis/web de este catálogo genera vídeo de forma
  fiable todavía (Pollinations no lo cubre). `generateVideo()` **solo** puede
  tener éxito si el usuario conectó un `custom-endpoint` o un `comfyui` propio
  que responda; en cualquier otro caso devuelve `ok:false` con
  `VIDEO_LIMIT_MESSAGE` — **nunca finge un resultado de vídeo**. Este es el
  límite honesto más visible del módulo y está explicado en el panel (guía
  "Límites honestos: audio y vídeo").
- **Muapi.ai:** catalogado, no ejecuta generación real todavía (§3).
- **ComfyUI "puro":** un grafo de nodos personalizado puede no aceptar
  `{prompt: "..."}` tal cual — puede hacer falta un proxy REST delante que
  traduzca al workflow real. El catálogo lo explica en su `note`.

---

## 7. API pública (`src/ai/astraura/media/media-gen.ts`)

```ts
// Catálogo
type MediaKind = "image" | "video" | "audio";
type MediaProviderId = "pollinations" | "hf-inference" | "automatic1111"
  | "fooocus" | "comfyui" | "muapi" | "custom-endpoint";
type MediaAccessKind = "web-free" | "web-key" | "local-endpoint";
interface MediaProvider { id; label; kinds: MediaKind[]; access; needsKey; note }
const MEDIA_PROVIDERS: MediaProvider[]
function findMediaProvider(id): MediaProvider | undefined

// Preferencias — localStorage "starseed.media.prefs.v1"
const MEDIA_PREFS_KEY = "starseed.media.prefs.v1"
const MEDIA_PREFS_EVENT = "starseed:media-prefs"
interface MediaPrefs {
  defaultImage: MediaProviderId; defaultVideo?; defaultAudio?;
  perNeuron?: Record<string, { image?; video?; audio? }>;
  hfToken?: string; muapiKey?: string; customEndpoints?: Record<string, string>;
}
function getMediaPrefs(): MediaPrefs
function setMediaPrefs(patch: Partial<MediaPrefs>): MediaPrefs
function resolveProvider(kind, neuronId?): MediaProviderId
function listMediaProvidersFor(kind, opts?): { available: MediaProvider[]; active: MediaProviderId }

// Generación
interface MediaGenResult { ok; url?; blob?; provider; error? }
const VIDEO_LIMIT_MESSAGE: string
function generateImage(opts: { prompt; width?; height?; seed?; model?; provider?; neuronId?; negative? }): Promise<MediaGenResult>
function generateAudio(opts: { prompt; voice?; provider?; neuronId?; model? }): Promise<MediaGenResult>
function generateVideo(opts: { prompt; seconds?; provider?; neuronId?; model? }): Promise<MediaGenResult>
```

Todo defensivo y SSR-safe: sin `window`/`fetch`, las funciones devuelven un
`MediaGenResult` honesto (`ok:false` con mensaje explicando que la generación
se hace desde el navegador) en vez de lanzar. Los fallos de red se traducen
siempre a `error` legible en español (motivo: timeout/HTTP/CORS/URL inválida).

### Panel — `src/components/media/media-gen-panel.tsx`

`export default function MediaGenPanel({ neuronId?, configOnly?, className? })`.
Estilo Crystal Liquid Glass (mismo lenguaje que los paneles de
`src/components/settings/aurora`). Con `configOnly` omite el generador en vivo
y deja solo los tres bloques de configuración (proveedor por defecto,
por neurona, claves/endpoints) — pensado para embeberse en `/habilidades`.
Hidrata sus valores de `localStorage` en un `useEffect` posterior al montaje
(SSR-safe) y se refresca solo si otra pestaña/panel cambia las preferencias
(escucha `MEDIA_PREFS_EVENT` + `storage`).

---

## 8. Persistencia

Una única clave, versión 1: `starseed.media.prefs.v1` (patrón
`starseed.*.vN` del resto del OS). No usa `SYNCED_KEYS` todavía — es
preferencia local por dispositivo/navegador; si se quiere que viaje con la
cuenta soberana (como la voz en `starseed.aurora.voice.v1`), añadirla a
`SYNCED_KEYS` es responsabilidad de quien integre este SOP (fuera del alcance
de este módulo, que solo declara la clave y el evento de cambio).

---

## 9. Integración pendiente (para quien cablee este SOP)

Este módulo se construyó **sin tocar** `oss-services.ts`, `skills.ts`,
`aurora-tools.ts` ni `packages.ts` a propósito (evita colisiones con trabajo en
curso). Lo que falta para que la habilidad quede completamente encendida:

**(a) Capacidad `av-gen` en `skills.ts`** — añadir a `SKILL_CAPABILITIES`
siguiendo el `SkillCapability` existente (`id, label, systemPrompt, routing?,
skillIds?, packageIds?`), p.ej.:

```ts
{
  id: "av-gen",
  label: "Generación audiovisual (imagen · vídeo · audio)",
  systemPrompt:
    "Puedes generar una IMAGEN a partir de un prompt con la tool generar_imagen: " +
    "SIEMPRE tienes un motor gratis disponible (Pollinations, sin que el usuario " +
    "configure nada), así que nunca digas que no puedes generar imágenes. Si el " +
    "usuario conectó un servicio propio (local o de pago), se usa automáticamente " +
    "y Pollinations queda como respaldo. Para AUDIO solo puedes sintetizar voz del " +
    "propio texto (no música). Para VÍDEO no tienes un motor gratis todavía: solo " +
    "funciona si el usuario conectó su propio servicio; si no, explícalo sin fingir.",
  routing: {},
  skillIds: ["aurora-av-gen"],
  packageIds: ["iatool-media-gen"],
}
```
Para que sea **"default-ON para cualquier cuenta"** de verdad (no solo tras
instalar una skill), lo más consistente con el resto del OS es que el `run` de
la tool (punto b) no dependa de `activeCapabilityIds()` — igual que hoy ninguna
entrada de `AURORA_GENERATE_TOOLS` está gateada por capacidad activa, solo el
*system prompt* lo está. La capacidad `av-gen` sirve para que Aurora **sepa**
que la tiene siempre encendida; añadir `aurora-av-gen`/`iatool-media-gen` a la
lista de skills/paquetes preinstalados por defecto (si existe tal lista en
`packages.ts`) haría además que apareciera activada visualmente en
`/habilidades` desde el primer momento.

**(b) Tool `generar_imagen` en `aurora-tools.ts`** — **ya existe** (línea ~754,
`AURORA_GENERATE_TOOLS`), cableada a `generarImagen()` de
`service-generation.ts`. Esa función exige un servicio conectado en
`/servicios`; no tiene red de seguridad gratis. Recomendación: cambiar su `run`
para llamar a `generateImage({ prompt })` de este módulo (que ya cubre
AUTOMATIC1111/Fooocus-API reutilizando `/servicios` internamente, más
Pollinations de respaldo) y adaptar su `MediaGenResult` al contrato
`ContentOutcome` (`{ ok, message, data? }`) que espera `runServiceGeneration`,
guardando el resultado en la Biblioteca igual que hace hoy `saveToLibrary()` en
`service-generation.ts`, por ejemplo:

```ts
const res = await generateImage({ prompt });
if (!res.ok || !res.url) return { ok: false, message: res.error || "No se pudo generar la imagen." };
const saved = saveToLibrary({ kind: "image", title: `Imagen: ${prompt.slice(0, 60)}`, url: res.url, origin: findMediaProvider(res.provider)?.label });
return { ok: true, message: `Generé la imagen con ${findMediaProvider(res.provider)?.label} y la guardé en tu Biblioteca.`, data: { id: saved.id, url: res.url } };
```
Así `generar_imagen` deja de poder fallar por "no hay servicio conectado" —
exactamente la regla de oro de este SOP (§0). `generarVideo`/vídeo puede
esperar a que exista una tool de vídeo separada (o seguir usando
`service-generation.ts` con su honestidad actual, ya que `generateVideo()` de
este módulo tiene el mismo límite de fondo: sin servicio propio, no hay vídeo).

**(c) Registrar Pollinations / Hugging Face / Muapi en `oss-services.ts`** —
por completitud del catálogo de `/servicios` (para que aparezcan con su
propósito, repo y pistas), siguiendo la interfaz `OssService` existente:

- **Pollinations** — `category: "image"`, `connectionKind: "http-endpoint"`,
  `fields: []` (no pide nada — es la razón de ser de este SOP),
  `defaultEndpoint: "https://image.pollinations.ai"`, `enabledByDefault: true`.
  ⚠️ Cuidado con el ORDEN/posición en `OSS_SERVICES` y con dejarle
  `defaultEndpoint`: `resolveServiceFor("image", scope)` (`oss-connections.ts`)
  cae al **primer** servicio de la categoría cuando no hay ninguna conexión de
  usuario, y usa su `defaultEndpoint` tal cual. Como `generarImagen()` en
  `service-generation.ts` da por hecho un POST-JSON estilo Fooocus/A1111
  (incompatible con el GET-URL de Pollinations), esa función **rompería** si de
  pronto resuelve a Pollinations sin código nuevo que la entienda — de ahí que
  el punto (b) recomiende que `generar_imagen` llame a `media-gen.ts`
  directamente en vez de depender de `resolveServiceFor()` para este caso.
- **Hugging Face Inference** — `category: "image"`, `connectionKind: "api-key"`,
  campos `F_BASE_URL("https://api-inference.huggingface.co/models/<modelo>", …)`
  + `F_API_KEY(...)` (token gratuito), `enabledByDefault: true`.
- **Muapi.ai** — `category: "image"` (o una futura categoría multi-medio),
  `connectionKind: "api-key"`, campo de clave, `purpose` dejando claro que es
  **de pago** y bring-your-own-key, `enabledByDefault: true` solo como entrada
  de catálogo (no como motor activo — sigue sin ejecutar generación real, §3).

Ninguno de estos tres cambios es necesario para que `media-gen.ts` /
`<MediaGenPanel />` funcionen HOY — ya son autosuficientes (leen y escriben su
propia preferencia `MediaPrefs`, y solo consultan `oss-connections.ts` como
alternativa opcional a un endpoint propio). Son necesarios para que **el resto
del OS** (la tool ya existente, el catálogo de `/servicios`) hable el mismo
idioma gratis-primero que esta habilidad.

---

*Adenda 138 · 2026-08-04. Motor (`media-gen.ts`) y panel (`media-gen-panel.tsx`)
construidos; capacidad `av-gen`, tool `generar_imagen` y catálogo `oss-services.ts`
pendientes de cableado (§9).*
