# Contrato · Sincronización instantánea de aparatos por neurona (NEU1126F)

**Fecha:** 26 de noviembre de 2026  
**Área:** Diseño e Infraestructura Malla / Neuronas  
**Ubicación en repo:** `architecture/neuronas-aparatos.md`  

---

## 1. Inventario: ¿Qué se sincroniza y qué no entre aparatos de una misma neurona?

### Sincronizado al instante (vía malla P2P / relé):
1. **Ajustes y preferencias:** Tema, idioma, configuraciones de UI guardadas en el almacenamiento de la neurona.
2. **Cerebros y modelos:** Selección de motores de IA, parámetros de inferencia y perfiles neuronales.
3. **Archivos y notas:** Documentos, apuntes, artefactos y diagramas creados en el espacio de trabajo de la neurona.
4. **Estado de sesiones:** Elementos activos en salas, cursores, posicionamiento y estados de flujo compartido.
5. **Capabilities:** Metadatos de los aparatos vinculados a la neurona (`capabilities.aparatos`).

### Excluido por completo (Propio y exclusivo de cada aparato físico):
1. **Clave de control local:** Credenciales criptográficas de cifrado at-rest de ese hardware específico.
2. **Permisos del sistema operativo:** Políticas de acceso a cámara, micrófono, almacenamiento y red del dispositivo.
3. **Huella de hardware:** Identificadores físicos nativos e irreversibles del aparato (`starseed.device.id`).
4. **Tokens de sesión privada:** Credenciales de autenticación OAuth o llaves de API acotadas al nodo local.

---

## 2. Reglas de Sincronía y Fusión (Módulo Puro `src/lib/neurons/sincronia-neurona.ts`)

- **Last-Write-Wins (LWW) por campo con fecha (`actualizadoEn`):** Cada campo de la neurona se versiona de manera independiente. Si dos aparatos modifican campos distintos, ambos cambios se integran sin colisión.
- **Desempate determinista:** Si dos aparatos escriben exactamente en el mismo milisegundo al mismo campo, gana el que tenga el identificador de aparato (`porDispositivo`) menor alfabéticamente.
- **Lápidas para borrados:** Los elementos eliminados emiten una marca de lápida (`borrado: true`) con su marca de tiempo, evitando que un aparato con información desactualizada resucite datos ya descartados.
- **Cola offline con reintentos limpios:** Cuando un aparato carece de conectividad P2P, sus modificaciones se encolan localmente (`encolarCambioSinEnlace`), eliminando duplicados por clave y descargándose masivamente al restablecer el enlace (`procesarColaPendiente`).
- **Registro de conflictos auditables:** Los cruces de escritura concurrente sobre un mismo campo se recogen en un informe transparente para la UI, sin sobrescribir ciegamente trabajo ajeno.
