# Multi-provider AI layer — Exocórtex soberano

Esta capa implementa el principio constitucional del **Exocórtex**: la IA personal
es propiedad del usuario, no del sistema. Cualquier persona puede elegir entre
modelos locales (privacidad absoluta) o cualquier API externa con su propia
clave, sin lock-in.

## Diseño

```
+----------------------------+
|  Components / Pages (UI)   |
+-------------+--------------+
              v
+----------------------------+
|  src/ai/client/chat.ts     |   <- punto único de entrada
+-------------+--------------+
              v
+----------------------------+
|  src/ai/providers/         |
|    index.ts (registry)     |
|    ollama.ts               |   <- local, sin clave
|    openai.ts               |   <- OpenAI + compatibles (Groq, Together…)
|    anthropic.ts            |   <- Claude
|    google.ts               |   <- Gemini
+----------------------------+
              ^
              | usa
+----------------------------+
|  src/ai/client/            |
|    keyStorage.ts           |   <- AES-GCM + PBKDF2 (WebCrypto)
|    providerStore.ts        |   <- localStorage de configs
+----------------------------+
```

## Cómo añadir un nuevo proveedor

1. Crea `src/ai/providers/mi-proveedor.ts` exportando un objeto que implemente
   la interfaz `Provider` (ver `types.ts`).
2. Regístralo en `src/ai/providers/index.ts` (mapa `PROVIDERS` y orden en
   `PROVIDER_ORDER`).
3. Asegúrate de que `info.defaultBaseUrl`, `info.defaultModels` y `getKeyUrl`
   están definidos para que la UI los muestre.
4. Si el proveedor admite listado de modelos, implementa `listModels()`.

No hace falta tocar UI: el panel `ai-providers-panel.tsx` recorre el registro
y lo muestra automáticamente.

## Modelo de seguridad

- Las claves se cifran con AES-GCM (256-bit). La clave de cifrado se deriva
  de la frase de paso del usuario con PBKDF2-SHA256 (250.000 iteraciones,
  salt aleatorio por instalación).
- Si la frase está vacía se usa una clave derivada del salt del dispositivo;
  esto protege contra inspección casual pero **no** contra un atacante local
  con acceso al navegador.
- Las claves descifradas viven solo en memoria, durante la duración de la
  llamada a `provider.chat()`. No se logean, no se serializan, no se envían a
  servidores propios.
- El backend de Next.js **nunca** ve las claves del usuario. Toda llamada a
  proveedores externos parte del navegador.

## Punto único de entrada

```ts
import { chat } from "@/ai/client/chat";

const response = await chat({
  messages: [
    { role: "system", content: "Eres el Núcleo StarSeed." },
    { role: "user", content: "Hola." },
  ],
  passphrase, // si el usuario configuró frase
  onChunk: (delta) => console.log(delta),
});
```

Esto:
1. Carga la configuración del proveedor activo (`getActiveProviderId()`).
2. Descifra la clave si es necesaria.
3. Despacha a la función `chat()` específica del proveedor.

## Compatibilidad legacy con Genkit

`src/ai/genkit.ts` y los flujos en `src/ai/flows/` siguen funcionando como
antes (Google AI server-side via Genkit). Se conservan para flujos que
requieren ejecución en servidor (RAG sobre datos privados, schedulers, etc.).
La nueva capa cliente convive con ellos.

Migración recomendada de flujos a la nueva capa:

- Si el flujo solo hace prompt → respuesta y no toca datos privados del
  servidor: migrar a la capa cliente para liberar al sistema de costos de IA.
- Si el flujo requiere acceso a Postgres con secretos del backend o
  procesamiento orquestado: dejar en Genkit.

## Roadmap

- [ ] Streaming para Google AI (cambiar a `streamGenerateContent`).
- [ ] Soporte de imágenes (vision) por proveedor.
- [ ] Soporte de tool-use / function calling unificado.
- [ ] Provider "Federación StarSeed": cuando un nodo de la red ofrece su modelo
      a otros nodos federados.
