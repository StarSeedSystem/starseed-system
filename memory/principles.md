# 🜂 Principios StarSeed — Desarrollo extendido

> Este documento desarrolla en profundidad la Tríada Ideológica Nuclear de la Constitución, traducida a implicaciones técnicas concretas para el SO. Es el filtro contra el cual debe evaluarse toda decisión de diseño o de producto.

---

## 1. Ontocracia — Implicaciones técnicas

### 1.1 Soberanía Directa

**Principio:** El poder reside intransferiblemente en el individuo. Se abole la figura del representante.

**Traducción técnica:**
- Sistema de votación directa en cada propuesta política (`/network/politics`).
- Sin "moderadores" con poder unilateral de borrar/banear contenido (mediante mediación comunitaria).
- API de propuestas abierta: cualquier cuenta verificada puede emitir una propuesta.
- Tabla `proposals` en Supabase con RLS (Row Level Security) que permite crear a cualquier ciudadano verificado.

### 1.2 Meritocracia del Entendimiento

**Principio:** Autoridad técnica por sabiduría aplicada verificable, no por riqueza, linaje o popularidad.

**Traducción técnica:**
- Sistema de **Insignias y Logros** (`Badge[]` en el schema `Profile`).
- Insignias son verificables, no autoadjudicadas. Se otorgan tras:
  - Demostración práctica de habilidad (eval automatizada o peer-review).
  - Validación por mediadores con insignia previa de mayor rango.
- Insignias condicionan funciones técnicas (ej. "Mediador" permite participar en Círculos de Paz; "Insignia médica" da peso al voto en propuestas sanitarias).
- **NO condicionan voto general**: en propuestas no técnicas, una persona = una voz.

### 1.3 Una Persona, Una Voz

**Principio:** Verificación biométrica con criptografía de conocimiento cero.

**Traducción técnica:**
- En la primera fase aceptamos prueba de humanidad delegada (OAuth provider confiable + email + opcionalmente WorldID / similar).
- En fase posterior: zk-proofs con biometría local (no se sube biometría al servidor).
- Una `Account` por humano. Múltiples `Profile` permitidos pero todos cuelgan de la misma Account → responsabilidad legal trazable, pero anonimato en perfiles posible.
- Detección de duplicados vía heurísticas (no por biometría directa) + denuncia comunitaria.

### 1.4 Voto Delegado Líquido

**Principio:** Voto delegable a expertos por tema, revocable en cualquier momento, nunca alienado permanentemente.

**Traducción técnica:**
- Tabla `vote_delegations` con campos `(delegator_id, delegatee_id, topic_tag, valid_until)`.
- `valid_until` nunca puede ser indefinido → expira automáticamente. Default sugerido: 1 año.
- Revocación instantánea (con propagación en tiempo real a votaciones activas).
- UI clara que muestra al delegador qué votó su delegado.

---

## 2. Ciberdelia — Implicaciones técnicas

### 2.1 La tecnología nunca controla, vigila ni aliena

**Veto absoluto sobre:**
- Tracking de comportamiento para publicidad o monetización.
- Algoritmos de "engagement maximizado" que exploten dopamina (scroll infinito sin propósito, notificaciones manipuladoras).
- Recopilación de datos no esenciales para el funcionamiento.
- Métricas de "tiempo en pantalla" como objetivo de producto.

**En su lugar:**
- Métricas de **propósito cumplido** (¿el usuario logró lo que vino a hacer?).
- Notificaciones agrupadas, resumidas por IA (`AIInsightWidget`) y silenciables granularmente.
- "Modo Foco" por defecto: el sistema oculta lo irrelevante al contexto activo.

### 2.2 Expansión cognitiva como objetivo de diseño

- Visualizaciones holográficas / data-art para hacer **visible lo invisible**:
  - `HolographicGraph` muestra conexiones sociales reales (no follower count).
  - Visualizaciones de impacto ecológico, presupuesto comunitario, flujos de votación.
- Interfaces que **enseñan** mientras se usan (microlearning embebido).
- Modo "Ágora": pantalla que muestra el estado vital de la comunidad (Propiocepción Social).

### 2.3 Estética como derecho

Del Codex Art. 29: "La belleza no es un lujo decorativo, sino un imperativo funcional para el bienestar del ser."

- Sistema de diseño Crystal Liquid Glass como default (no Material/Bootstrap genéricos).
- Animaciones biomiméticas (orgánicas, no mecánicas). Curvas bezier suaves.
- Proporción áurea en layouts cuando sea posible.
- Tipografía premium (Satoshi / General Sans según design system).

### 2.4 Exocórtex (IA personal)

- Los agentes IA configurados en `/agent` son **propiedad del usuario**, no del sistema.
- Datos de conversación con el agente: cifrados en cliente, almacenados con clave derivada de la cuenta del usuario.
- El sistema central **no puede leer** el contenido de las conversaciones agente↔usuario.
- Modelos: privilegiar modelos open-weight (Llama, Mistral, DeepSeek) ejecutables en infra propia o local. APIs propietarias (Google AI vía Genkit) solo como opt-in del usuario.

---

## 3. Transhumanismo Comunista — Implicaciones técnicas

### 3.1 Procomún de la infraestructura

- **Código:** 100% open source. Licencia AGPLv3 sugerida (garantiza que forks comerciales también sean abiertos).
- **Datos comunitarios** (votaciones, propuestas, contenido cultural público): bajo licencia Creative Commons (CC-BY-SA por defecto, CC0 opcional).
- **Modelos IA entrenados con datos de la red:** propiedad de la red, no de empresas externas.
- **Infraestructura física:** servidores propios autogestionados en cuanto la fase Fruto permita su financiación.

### 3.2 Sin lucro como motivo primario

- No hay tier "Premium" de pago con features cerradas.
- Posibles fuentes de financiación (fase Semilla):
  - Donaciones explícitas de la comunidad.
  - Subvenciones / grants ético-tecnológicos.
  - Servicios premium **operativos** (no de features) como hosting dedicado a Sanghas físicas.
  - Marketplace de bienes físicos producidos por las comunidades (porcentaje al sostenimiento de la red).
- Nunca: publicidad, venta de datos, paywalls a funcionalidad democrática.

### 3.3 Reputación como vector de incentivo (no dinero)

- Tabla `reputation` por perfil. Aumenta con:
  - Contribuciones validadas (commits útiles, propuestas aceptadas, mediación exitosa).
  - Reseñas positivas de pares.
- **Reputación no se compra ni se transfiere.**
- Reputación da acceso a roles, no a recursos. Los recursos básicos son universales.

### 3.4 Automatización emancipadora

- Bots / agentes IA del sistema automatizan **trabajo repetitivo** (moderación de spam, traducción, resumen).
- Humanos toman las decisiones de juicio, ética y creatividad.
- **NO automatizar:** decisiones políticas, juicios judiciales, vetos a usuarios.

---

## 4. Singularidad del contenido (Lienzo Universal)

Del Art. 17 de la Constitución, principio operativo crucial:

> Todo contenido (propuesta, artículo, obra) existe como una **Entidad Única**. Al compartirse, no se duplica, sino que se referencia. Las actualizaciones se reflejan instantáneamente en todas sus instancias.

### Implicación técnica

- En el schema actual ya está el campo `references[]` en `Post`. Esto es **la base**.
- **Anti-patrón a evitar**: copiar el contenido completo al "compartir". El share es solo una nueva entrada en `references[]`.
- Cambios en el post original se propagan a todas las referencias.
- Auditoría: historial de cambios visible públicamente (commit-log social).
- En caso de eliminación: tombstone (lápida) visible donde estaba, no borrado silencioso.

---

## 5. Justicia Restaurativa (no punitiva)

Del Art. 22-24, principios para implementar moderación:

- **Sin bans definitivos automáticos.** Cualquier suspensión es temporal y revisable.
- **Tres niveles de juicio:**
  1. **Moral** (intención): educación, recursos de aprendizaje, mentor asignado.
  2. **Ético** (impacto): reparación directa propuesta por la víctima, servicio comunitario.
  3. **Universal** (ley natural): contención protectora (no punitiva), siempre con miras a rehabilitación.
- **Círculos de Paz:** sesiones mediadas (físicas o virtuales) entre las partes, facilitadas por un Mediador certificado (con insignia validada).
- Solo en última instancia: **ostracismo** (expulsión de la comunidad), revisable por Asamblea.

---

## 6. Federación y soberanía digital

Del Art. 16 y 30 del Manifiesto:

- La red opera como un **Fediverso**: federación de nodos.
- Cada Comunidad / Entidad Federativa puede correr su propio nodo (servidor).
- Protocolo de federación inspirado en ActivityPub / Matrix / Nostr (a evaluar técnicamente).
- Usuarios pueden migrar de nodo sin perder identidad ni reputación (identidad portable criptográficamente).
- Cada nodo decide su propia política interna **sin contravenir los principios universales** de la Constitución.

---

## 7. Verificación rápida de decisiones

Antes de implementar una feature, ejecutar este checklist:

- [ ] ¿Respeta la Tríada Ideológica (Ontocracia / Ciberdelia / Transhumanismo Comunista)?
- [ ] ¿El usuario es soberano sobre sus datos en esta feature?
- [ ] ¿Hay alguna forma en que esta feature pueda usarse para controlar / vigilar / alienar?
- [ ] ¿La feature es accesible sin pagar?
- [ ] ¿El código es open source y federable?
- [ ] ¿Respeta la singularidad del contenido (no duplica innecesariamente)?
- [ ] ¿La moderación implícita es restaurativa, no punitiva?
- [ ] ¿La estética y la experiencia elevan al usuario o lo atrapan?

Si algún punto falla, **refactorizar el diseño** antes de codear.
