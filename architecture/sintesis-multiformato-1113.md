# La síntesis diaria en todos los formatos, entregada en el chat (ola PSF1113)

## 1. Pedido de Maggasukha

**2026-11-13, 15:37 México, por @StarSeed_Design_bot:**

> Recuerda cada día: cuando se termine la síntesis diaria completa, que automáticamente se procese todo en todos
> los formatos que ofrece NotebookLM a través de los cuadernos vinculados a la síntesis, y envíame el resultado de
> cada uno de esos formatos (resumen completo y detallado, notas, observaciones, avances, resultados,
> recomendaciones para próximos pasos, la integración de cada desarrollo e investigación de los procesos agénticos y
> de cada área). Realiza la de hoy y recuérdalo para el final de cada síntesis diaria.

**2026-11-13, 20:07:**

> No me envió los archivos que le solicité directo en el chat (el cual está vinculado a varios canales desde
> MetaGenesis).

## 2. Qué pasó

- El bot trató el mensaje como encargo (ENC-1113-2137). Hizo 11 entregables en Drive, pero:
  - el plan (gemini-flash-lite) marcó `enviar: False` en todos, así que **no mandó ningún archivo al chat**, solo
    los avances con enlaces;
  - faltaron formatos: vídeo, cuestionario y tarjetas;
  - **no guardó la regla diaria** («recuérdalo…»): no está en `preferencias.json` y no hay nada que la ejecute.
- **Solución puntual (2026-11-14 02:09 UTC):** Claude lanzó en el A1 `entrega_enc_1113.py`, que manda al chat los
  11 archivos y genera y manda vídeo, cuestionario y tarjetas. Es puntual; lo permanente es esta ola.

## 3. Diseño

### 3.1 Tras cada síntesis diaria (la del enjambre o la del respaldo del A1)

Un cuaderno «Síntesis <fecha>» con la síntesis y sus fuentes vinculadas: el índice de vídeos, la red de resonancia,
la síntesis anterior y los Docs que cita. Se generan **todos** los formatos de NotebookLM en español:

| Formato | Ajustes |
|---|---|
| informe | a medida, detallado |
| audio | deep-dive |
| vídeo | |
| infografía | vertical, detallada |
| presentación | |
| mapa mental | |
| cuestionario | |
| tarjetas | |
| tabla de datos | |

- Todo va a Drive › Síntesis diarias › `<fecha>`.
- **Cada archivo se envía al chat:**

  | Archivo | Envío |
  |---|---|
  | audio | `sendAudio` |
  | vídeo | `sendVideo`; por encima de 49 MB se recomprime |
  | infografía | `sendPhoto` y además el documento |
  | Docs | se exportan a PDF |
  | el resto | `sendDocument` |

  También va a los canales espejo vinculados de MetaGenesis (`subir_espejo`, Genesis), igual que los mensajes.
- **Mensaje final:** un índice con cada archivo y su enlace de Drive.
- **Si NotebookLM está caído:** los formatos de texto salen por la ruta gratuita y los nativos esperan (SES1113).
  Nada se queda sin entregar en silencio.

### 3.2 Encargos

- **Por defecto, todo entregable que tenga archivo se envía al chat.** El plan de un modelo no puede desactivarlo; solo
  Maggasukha, diciéndolo.
- **Lo pedido es obligatorio:** si el mensaje pide «todos los formatos», el plan los incluye todos (§3.1) y el
  validador rechaza un plan que falte alguno.
- **Reglas permanentes:** un mensaje con «recuerda / cada día / siempre / para cada…» además de un encargo hace las
  dos cosas:
  - cumple el encargo;
  - guarda la regla en `preferencias.json` y, si es una rutina, la registra en `rutinas.json` (lo que la dispara y lo
    que hace).

  El bot confirma las dos.

## 4. Cola PSF1113

La cola está en `starseed_memory_root/olas/cola-psf1113.json`.
