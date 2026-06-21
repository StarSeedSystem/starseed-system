
import { FrequencyItem } from '../types';

export const frequencyData: FrequencyItem[] = [
  // --- 2. EL ESPECTRO SOLFEGGIO ---
  { 
    id: 'solf_174', hz: "174", numericalHz: 174, 
    name: "Fa3 - El Anestésico Cuántico", category: "solfeggio", 
    description: "Seguridad, arraigo y alivio del dolor.", 
    detailedUsage: "Constituye el cimiento de la escala. Actúa sobre el sistema nervioso central para inhibir la percepción del dolor. Genera un campo de contención bioenergética que 'adormece' terminaciones nerviosas hiperactivas. Suma Teosófica: 12 → 3.", 
    evidence: "Dr. Joseph Puleo" 
  },
  { 
    id: 'solf_285', hz: "285", numericalHz: 285, 
    name: "Do#4 - Restauración Tisular", category: "solfeggio", 
    description: "Regeneración de tejidos y campo etérico.", 
    detailedUsage: "Instruye a las células para recordar su estructura original. Fundamental en medicina regenerativa para cicatrización de heridas, quemaduras y reparación de agujeros en el aura. Suma Teosófica: 15 → 6.", 
    evidence: "Dr. Joseph Puleo" 
  },
  { 
    id: 'solf_396', hz: "396", numericalHz: 396, 
    name: "UT - Liberación (Sol4)", category: "solfeggio", 
    description: "Chakra Raíz: Liberación de culpa y miedo.", 
    detailedUsage: "Penetra las defensas del subconsciente. Desestabiliza estructuras energéticas de la culpa y el miedo, permitiendo superar obstáculos autoimpuestos. Suma Teosófica: 18 → 9.", 
    evidence: "Dr. Joseph Puleo" 
  },
  { 
    id: 'solf_417', hz: "417", numericalHz: 417, 
    name: "RE - Transmutación (Sol#4)", category: "solfeggio", 
    description: "Chakra Sacro: Facilitación del cambio.", 
    detailedUsage: "Catalizador de transformación. Disuelve la impronta de traumas pasados y condicionamientos negativos. Limpia 'basura' energética acumulada y rompe estancamientos creativos. Suma Teosófica: 12 → 3.", 
    evidence: "Dr. Joseph Puleo" 
  },
  { 
    id: 'solf_528', hz: "528", numericalHz: 528, 
    name: "MI - Frecuencia Milagrosa (Do5)", category: "solfeggio", 
    description: "Plexo Solar/Corazón: Reparación de ADN.", 
    detailedUsage: "Conocida como la 'Frecuencia del Amor'. Facilita la absorción de luz UV en el ADN y la reparación de enlaces de hidrógeno. Ligada a la proporción áurea y la limpieza de aguas. Suma Teosófica: 15 → 6.", 
    evidence: "Dr. Joseph Puleo / Biochem" 
  },
  { 
    id: 'solf_639', hz: "639", numericalHz: 639, 
    name: "FA - Red Integradora (Mi5)", category: "solfeggio", 
    description: "Chakra Corazón: Conexión relacional.", 
    detailedUsage: "Aborda la geometría de las relaciones. Fomenta la comunicación celular, la resolución de conflictos y la unificación de hemisferios cerebrales. Suma Teosófica: 18 → 9.", 
    evidence: "Dr. Joseph Puleo" 
  },
  { 
    id: 'solf_741', hz: "741", numericalHz: 741, 
    name: "SOL - Limpiador del Espectro (Fa#5)", category: "solfeggio", 
    description: "Chakra Garganta: Expresión y Detox.", 
    detailedUsage: "Función primaria de desintoxicación. Limpia células de toxinas virales, bacterianas y radiación electromagnética. Disuelve el 'ruido' cognitivo para potenciar la intuición. Suma Teosófica: 12 → 3.", 
    evidence: "Dr. Joseph Puleo" 
  },
  { 
    id: 'solf_852', hz: "852", numericalHz: 852, 
    name: "LA - Despertar de la Intuición (La5)", category: "solfeggio", 
    description: "Tercer Ojo: Orden espiritual.", 
    detailedUsage: "Penetra el velo de ilusiones subconscientes. Facilita el acceso a estados de conciencia superiores y restaura el orden espiritual en situaciones de caos mental. Suma Teosófica: 15 → 6.", 
    evidence: "Dr. Joseph Puleo" 
  },
  { 
    id: 'solf_963', hz: "963", numericalHz: 963, 
    name: "SI - Frecuencia de los Dioses (Si5)", category: "solfeggio", 
    description: "Chakra Corona: Trascendencia y Unidad.", 
    detailedUsage: "Activa la glándula pineal. Reconecta el sistema bioenergético con la Luz o Espíritu Universal, induciendo estados de Unidad (Oneness). Suma Teosófica: 18 → 9.", 
    evidence: "Dr. Joseph Puleo" 
  },

  // --- 3. FRECUENCIAS PLANETARIAS (OCTAVA CÓSMICA) ---
  { 
    id: 'plan_sun', hz: "126.22", numericalHz: 126.22, 
    name: "Sol (Si1)", category: "planetary", 
    description: "Centro Vital y Ego.", 
    detailedUsage: "Punto mágico entre cuerpo y espíritu. Trascendencia física, vitalidad y proyección de la voluntad. Basada en el campo gravitatorio solar.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_merc', hz: "141.27", numericalHz: 141.27, 
    name: "Mercurio (Do#3)", category: "planetary", 
    description: "Intelecto y Comunicación.", 
    detailedUsage: "Estimula los centros del lenguaje (Garganta) y la agilidad mental. Asociado con el intelecto y la comunicación fluida.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_ven', hz: "221.23", numericalHz: 221.23, 
    name: "Venus (La3)", category: "planetary", 
    description: "Amor, Armonía y Estética.", 
    detailedUsage: "Equilibra la energía femenina. Se utiliza para restaurar el amor propio, la armonía en las relaciones y la apreciación de la belleza.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_earth_year', hz: "136.10", numericalHz: 136.10, 
    name: "Tierra: Año (OM) (Do#3)", category: "planetary", 
    description: "Equilibrio y Alma.", 
    detailedUsage: "Frecuencia primordial del equilibrio, el 'OM' cósmico. Induce relajación profunda y centramiento. Estándar para diapasones terapéuticos.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_earth_day', hz: "194.18", numericalHz: 194.18, 
    name: "Tierra: Día Solar Medio (Sol3)", category: "planetary", 
    description: "Vitalidad Dinámica.", 
    detailedUsage: "Derivado de las 24 horas. Tono dinámico, estimulante y tónico. Promueve la activación y el despertar de la energía.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_earth_sid', hz: "194.71", numericalHz: 194.71, 
    name: "Tierra: Día Sideral", category: "planetary", 
    description: "Rotación Astronómica.", 
    detailedUsage: "Basado en la rotación real (23h 56m 4s). Utilizado para trabajos de precisión astronómica y energética.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_platonic', hz: "172.06", numericalHz: 172.06, 
    name: "Año Platónico (Fa3)", category: "planetary", 
    description: "Iluminación Espiritual.", 
    detailedUsage: "Derivado de la precesión de los equinoccios (25,920 años). Claridad espiritual, conexión con el Chakra Corona.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_moon_syn', hz: "210.42", numericalHz: 210.42, 
    name: "Luna Sinódica (Sol#3)", category: "planetary", 
    description: "Fluidez y Sexualidad.", 
    detailedUsage: "Ciclo de luna llena a luna llena. Regulación de fluidos, ciclos menstruales y energía sexual femenina.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_moon_sid', hz: "227.43", numericalHz: 227.43, 
    name: "Luna Sideral (La#3)", category: "planetary", 
    description: "Inconsciente e Intuición.", 
    detailedUsage: "Conexión subconsciente profunda. Facilita la intuición y el trabajo con el lado oculto de la psique.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_mars', hz: "144.72", numericalHz: 144.72, 
    name: "Marte (Re3)", category: "planetary", 
    description: "Fuerza y Voluntad.", 
    detailedUsage: "Tono de la fuerza vital. Estimula la toma de decisiones, el impulso de acción y la vitalidad sexual masculina.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_jup', hz: "183.58", numericalHz: 183.58, 
    name: "Júpiter (Fa#3)", category: "planetary", 
    description: "Expansión y Sabiduría.", 
    detailedUsage: "Apoya el crecimiento espiritual, el optimismo y la creatividad. Frecuencia de la abundancia y la expansión.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_sat', hz: "147.85", numericalHz: 147.85, 
    name: "Saturno (Re3)", category: "planetary", 
    description: "Estructura y Karma.", 
    detailedUsage: "Ayuda a establecer límites, fomenta la disciplina y estructura la conciencia. Tono de la concentración.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_ura', hz: "207.36", numericalHz: 207.36, 
    name: "Urano (Sol#3)", category: "planetary", 
    description: "Originalidad y Renovación.", 
    detailedUsage: "Ruptura de patrones y estructuras rígidas. Provoca 'insights' repentinos y cambios sorpresivos.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_nep', hz: "211.44", numericalHz: 211.44, 
    name: "Neptuno (Sol#3)", category: "planetary", 
    description: "Misticismo y Sueños.", 
    detailedUsage: "Accede al inconsciente colectivo, fomenta la creatividad artística, lo onírico y la intuición profunda.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_pluto', hz: "140.25", numericalHz: 140.25, 
    name: "Plutón (Do#3)", category: "planetary", 
    description: "Transformación Radical.", 
    detailedUsage: "Alquimia interior. Trabaja sobre las sombras psicológicas profundas, facilitando el renacimiento y la integración.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_chiron', hz: "172.86", numericalHz: 172.86, 
    name: "Quirón (Fa3)", category: "planetary", 
    description: "El Sanador Herido.", 
    detailedUsage: "Actúa como puente entre materia y espíritu. Facilita la sanación de heridas profundas del alma.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'plan_sedna', hz: "128.10", numericalHz: 128.10, 
    name: "Sedna (Do3)", category: "planetary", 
    description: "Origen Profundo.", 
    detailedUsage: "Conexión con el inconsciente colectivo y los orígenes planetarios profundos.", 
    evidence: "Hans Cousto" 
  },
  { 
    id: 'schumann_fund', hz: "7.83", numericalHz: 7.83, 
    name: "Resonancia Schumann (Fundamental)", category: "planetary", 
    description: "El latido de la Tierra.", 
    detailedUsage: "Límite Theta/Alfa. Esencial para la salud biológica y la orientación espacial. Su ausencia causa malestar en astronautas.", 
    evidence: "W.O. Schumann" 
  },
  { 
    id: 'schumann_harm', hz: "14.3, 20.8, 27.3", numericalHz: 14.3, 
    name: "Armónicos Schumann", category: "planetary", 
    description: "Respiración electromagnética.", 
    detailedUsage: "Frecuencias armónicas de la resonancia terrestre: 14.3 Hz, 20.8 Hz, 27.3 Hz, 33.8 Hz. Mantienen la coherencia biosférica.", 
    evidence: "W.O. Schumann" 
  },

  // --- 4. ARQUEOACÚSTICA ---
  { 
    id: 'pyr_117', hz: "117", numericalHz: 117, 
    name: "Sarcófago Gran Pirámide", category: "pyramid", location: "Giza",
    description: "Resonancia del Granito.", 
    detailedUsage: "Induce patrones geométricos complejos en membranas de agua (cimática). Se asocia con apertura emocional y sanación profunda.", 
    evidence: "John Stuart Reid" 
  },
  { 
    id: 'pyr_16', hz: "16", numericalHz: 16, 
    name: "Infrasonido Piramidal", category: "pyramid", location: "Giza",
    description: "Acorde de Fa Sostenido.", 
    detailedUsage: "Generado por el viento en los conductos de ventilación. Crea un efecto de 'acorde de Fa sostenido' con la Tierra.", 
    evidence: "Teoría Acústica" 
  },
  { 
    id: 'pyr_111', hz: "111", numericalHz: 111, 
    name: "Megalitos (Hal Saflieni)", category: "pyramid", location: "Malta/UK",
    description: "Silencio Mental.", 
    detailedUsage: "Desactiva el área del lenguaje y la corteza prefrontal (lógica), activando el lóbulo temporal derecho. Facilita el trance y el procesamiento emocional.", 
    evidence: "Dr. Ian Cook (UCLA)" 
  },

  // --- 5. BIORRESONANCIA (RIFE Y NOGIER) ---
  // Protocolos Rife
  { 
    id: 'rife_cancer', hz: "2127, 2008", numericalHz: 2127, 
    name: "Protocolo Cáncer General", category: "bioresonance", 
    description: "Muerte de Célula BX.", 
    detailedUsage: "Frecuencias clásicas Rife. Secundarias: 2120 Hz, 1150 Hz. Diseñadas para desvitalizar células patógenas por resonancia estructural (MOR).", 
    evidence: "Royal Rife (CAFL)" 
  },
  { 
    id: 'rife_breast', hz: "741, 712", numericalHz: 741, 
    name: "Protocolo Mama", category: "bioresonance", 
    description: "Soporte específico.", 
    detailedUsage: "741 Hz coincide con el Solfeggio Detox. Utilizado experimentalmente para patologías mamarias.", 
    evidence: "CAFL" 
  },
  { 
    id: 'rife_liver', hz: "751, 750, 727", numericalHz: 751, 
    name: "Soporte Hepático", category: "bioresonance", 
    description: "Desintoxicación del Hígado.", 
    detailedUsage: "Frecuencias para estimular la limpieza y función del hígado.", 
    evidence: "CAFL" 
  },
  { 
    id: 'rife_kidney', hz: "625, 600, 440", numericalHz: 625, 
    name: "Soporte Renal", category: "bioresonance", 
    description: "Limpieza renal y cálculos.", 
    detailedUsage: "Ayuda en la limpieza de riñones y disolución de cálculos. Secundarias: 600-625 Hz.", 
    evidence: "CAFL" 
  },
  { 
    id: 'rife_lungs', hz: "727, 776, 880", numericalHz: 880, 
    name: "Infecciones Pulmonares", category: "bioresonance", 
    description: "Soporte Respiratorio.", 
    detailedUsage: "Utilizado para infecciones respiratorias y fortalecimiento pulmonar.", 
    evidence: "CAFL" 
  },
  { 
    id: 'rife_stomach', hz: "676, 727", numericalHz: 676, 
    name: "Estómago (Gastritis)", category: "bioresonance", 
    description: "Helicobacter y Gastritis.", 
    detailedUsage: "Frecuencias dirigidas a aliviar gastritis y combatir H. Pylori.", 
    evidence: "CAFL" 
  },
  { 
    id: 'rife_ecoli', hz: "1672, 1415", numericalHz: 1672, 
    name: "E. Coli", category: "bioresonance", 
    description: "Bactericida específico.", 
    detailedUsage: "Frecuencias resonantes para desvitalizar la bacteria Escherichia coli.", 
    evidence: "CAFL" 
  },
  { 
    id: 'rife_parasite', hz: "1500, 1424", numericalHz: 1500, 
    name: "Parásitos General", category: "bioresonance", 
    description: "Amplio espectro antiparasitario.", 
    detailedUsage: "Frecuencias experimentales para eliminación de parásitos comunes.", 
    evidence: "CAFL" 
  },
  { 
    id: 'rife_pain', hz: "3000, 95", numericalHz: 3000, 
    name: "Dolor General", category: "bioresonance", 
    description: "Alivio sintomático.", 
    detailedUsage: "Frecuencias analgésicas. A menudo combinadas con 174 Hz (Solfeggio) para alivio profundo.", 
    evidence: "CAFL" 
  },
  // Frecuencias Nogier
  { 
    id: 'nog_a', hz: "292", numericalHz: 292, 
    name: "Nogier A - Ectodermo", category: "body", 
    description: "Piel y Sistema Nervioso.", 
    detailedUsage: "Cicatrización de piel, ojos y vitalidad celular. Resuena con la capa embrionaria externa.", 
    evidence: "Dr. Paul Nogier" 
  },
  { 
    id: 'nog_b', hz: "584", numericalHz: 584, 
    name: "Nogier B - Endodermo", category: "body", 
    description: "Digestivo y Metabólico.", 
    detailedUsage: "Sistema digestivo, pulmones, hígado y glándulas. Equilibrio metabólico.", 
    evidence: "Dr. Paul Nogier" 
  },
  { 
    id: 'nog_c', hz: "1168", numericalHz: 1168, 
    name: "Nogier C - Mesodermo", category: "body", 
    description: "Huesos, Sangre y Músculos.", 
    detailedUsage: "Problemas circulatorios y locomotores. Resuena con la capa media embrionaria.", 
    evidence: "Dr. Paul Nogier" 
  },
  { 
    id: 'nog_d', hz: "2336", numericalHz: 2336, 
    name: "Nogier D - Lateralidad", category: "body", 
    description: "Equilibrio Hemisférico.", 
    detailedUsage: "Sincronización entre hemisferios cerebrales. Lateralidad.", 
    evidence: "Dr. Paul Nogier" 
  },
  { 
    id: 'nog_e', hz: "4672", numericalHz: 4672, 
    name: "Nogier E - Médula Espinal", category: "body", 
    description: "Analgesia Potente.", 
    detailedUsage: "Sistema nervioso periférico y médula. Transmisión del dolor.", 
    evidence: "Dr. Paul Nogier" 
  },
  { 
    id: 'nog_f', hz: "73", numericalHz: 73, 
    name: "Nogier F - Subcortical", category: "body", 
    description: "Hormonas y Espasmos.", 
    detailedUsage: "Cerebro subcortical. Regulación hormonal y alivio de espasmos faciales.", 
    evidence: "Dr. Paul Nogier" 
  },
  { 
    id: 'nog_g', hz: "146", numericalHz: 146, 
    name: "Nogier G - Corteza Cerebral", category: "body", 
    description: "Memoria e Intelecto.", 
    detailedUsage: "Funciones intelectuales superiores, memoria y reducción de inflamación.", 
    evidence: "Dr. Paul Nogier" 
  },
  // Previous Barbara Hero entries (kept for completeness as requested)
  { 
    id: 'b1', hz: "321.9", numericalHz: 321.9, 
    name: "Sangre (Vital)", category: "body", 
    description: "Fluido vital.", 
    detailedUsage: "Promueve la circulación saludable y oxigenación celular.", 
    evidence: "Barbara Hero" 
  },
  { 
    id: 'b2', hz: "492.8", numericalHz: 492.8, 
    name: "Glándulas Suprarrenales", category: "body", 
    description: "Energía y estrés.", 
    detailedUsage: "Equilibra la producción de cortisol y adrenalina.", 
    evidence: "Barbara Hero" 
  },

  // --- 6. NEUROACÚSTICA (ONDAS CEREBRALES) ---
  { 
    id: 'brain_epsilon', hz: "< 0.5", numericalHz: 0.1, 
    name: "Epsilon", category: "brain", 
    description: "Animación Suspendida.", 
    detailedUsage: "Meditación trascendental avanzada. Relacionada con estados de éxtasis estático.", 
    evidence: "Neurociencia" 
  },
  { 
    id: 'brain_delta', hz: "0.5 - 4", numericalHz: 0.5, 
    name: "Delta", category: "brain", 
    description: "Sueño Profundo.", 
    detailedUsage: "Regeneración física, liberación de hormona de crecimiento. 4.0 Hz se usa para sueño lúcido.", 
    evidence: "Neurociencia" 
  },
  { 
    id: 'brain_theta', hz: "4 - 8", numericalHz: 4, 
    name: "Theta", category: "brain", 
    description: "Subconsciente y REM.", 
    detailedUsage: "Creatividad profunda, trance hipnótico. 6.3 Hz para proyección mental, 7.83 Hz para conexión tierra.", 
    evidence: "Neurociencia" 
  },
  { 
    id: 'brain_alpha', hz: "8 - 12", numericalHz: 8, 
    name: "Alfa", category: "brain", 
    description: "Relajación Despierta.", 
    detailedUsage: "Aprendizaje acelerado, 'flow'. 10 Hz para liberación de serotonina y claridad.", 
    evidence: "Neurociencia" 
  },
  { 
    id: 'brain_beta', hz: "13 - 30", numericalHz: 13, 
    name: "Beta", category: "brain", 
    description: "Vigilia y Enfoque.", 
    detailedUsage: "Pensamiento lógico. 14 Hz para concentración de estudio. Rangos altos (20+) indican estrés.", 
    evidence: "Neurociencia" 
  },
  { 
    id: 'brain_gamma', hz: "30 - 100", numericalHz: 30, 
    name: "Gamma", category: "brain", 
    description: "Procesamiento Alto.", 
    detailedUsage: "Insight, compasión pura. 40 Hz para sincronización neuronal y lucidez.", 
    evidence: "Neurociencia" 
  },
  { 
    id: 'brain_lambda', hz: "> 100", numericalHz: 100, 
    name: "Lambda", category: "brain", 
    description: "Integración Total.", 
    detailedUsage: "Estados místicos. Conexión circular con Epsilon.", 
    evidence: "Neurociencia" 
  },

  // --- 7. TEORÍA MUSICAL SAGRADA (432 HZ SCALE) ---
  { 
    id: 'scale_c', hz: "256.87", numericalHz: 256.87, 
    name: "Do (C) - Aries", category: "music", 
    description: "Inicio.", 
    detailedUsage: "Nota base de la escala A=432Hz. Relacionada con el inicio zodiacal (Aries).", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_c_sh', hz: "272.14", numericalHz: 272.14, 
    name: "Do# (C#) - Tauro/Tierra", category: "music", 
    description: "Tierra y OM.", 
    detailedUsage: "Octava superior del Año Terrestre (136.10 Hz). Estabilidad y conexión a tierra.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_d', hz: "288.33", numericalHz: 288.33, 
    name: "Re (D) - Géminis", category: "music", 
    description: "Comunicación.", 
    detailedUsage: "Relación con Géminis. Comunicación y dualidad.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_d_sh', hz: "305.47", numericalHz: 305.47, 
    name: "Re# (D#) - Cáncer", category: "music", 
    description: "Emoción y Hogar.", 
    detailedUsage: "Resonancia con Cáncer.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_e', hz: "323.63", numericalHz: 323.63, 
    name: "Mi (E) - Leo", category: "music", 
    description: "Corazón y Expresión.", 
    detailedUsage: "Resonancia con Leo. Creatividad.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_f', hz: "342.88", numericalHz: 342.88, 
    name: "Fa (F) - Virgo", category: "music", 
    description: "Orden y Servicio.", 
    detailedUsage: "Resonancia con Virgo.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_f_sh', hz: "363.27", numericalHz: 363.27, 
    name: "Fa# (F#) - Libra/Pirámide", category: "music", 
    description: "Equilibrio.", 
    detailedUsage: "Resonancia con Libra y la Cámara del Rey (aprox).", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_g', hz: "384.87", numericalHz: 384.87, 
    name: "Sol (G) - Escorpio", category: "music", 
    description: "Transformación.", 
    detailedUsage: "Quinta perfecta de Do (256 Hz). Estabilidad del sistema nervioso. Escorpio.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_g_sh', hz: "407.75", numericalHz: 407.75, 
    name: "Sol# (G#) - Sagitario", category: "music", 
    description: "Expansión.", 
    detailedUsage: "Resonancia con Sagitario.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_a', hz: "432.00", numericalHz: 432.00, 
    name: "La (A) - Capricornio", category: "music", 
    description: "Matriz Natural.", 
    detailedUsage: "Relacionado con la precesión de los equinoccios (432x60=25920). Consistencia matemática universal.", 
    evidence: "Verdi / Pitágoras" 
  },
  { 
    id: 'scale_a_sh', hz: "457.69", numericalHz: 457.69, 
    name: "La# (A#) - Acuario", category: "music", 
    description: "Innovación.", 
    detailedUsage: "Resonancia con Acuario.", 
    evidence: "Escala Pitagórica/432" 
  },
  { 
    id: 'scale_b', hz: "484.90", numericalHz: 484.90, 
    name: "Si (B) - Piscis", category: "music", 
    description: "Disolución y Unidad.", 
    detailedUsage: "Resonancia con Piscis.", 
    evidence: "Escala Pitagórica/432" 
  },

  // --- SINERGIAS & INTERVALOS ---
  { 
    id: 'syn_tritone', hz: "1:1.414", numericalHz: 0, 
    name: "El Tritono (Diabolus)", category: "synergy", 
    description: "Ruptura de estasis.", 
    detailedUsage: "Intervalo de tensión utilizado para romper bloqueos energéticos estáticos.", 
    evidence: "Teoría Musical" 
  },
  { 
    id: 'syn_fifth', hz: "3:2", numericalHz: 1.5, 
    name: "Quinta Perfecta", category: "synergy", 
    description: "Intervalo Sagrado.", 
    detailedUsage: "Relación curativa primordial (ej. 256Hz - 384Hz). Equilibra el sistema nervioso.", 
    evidence: "Teoría Musical" 
  },
  { 
    id: 'syn_astral', hz: "Theta + 432Hz", numericalHz: 4, 
    name: "Protocolo Astral", category: "synergy", 
    description: "Proyección Consciente.", 
    detailedUsage: "Uso de Theta bajo (4-4.5Hz) con portadora 432Hz o 963Hz para mantener lucidez mientras el cuerpo duerme.", 
    evidence: "Neuroacústica" 
  },
  // --- SINERGIAS AVANZADAS (NUEVO) ---
  {
    id: 'syn_phi', hz: "Phi (1.618) Binaural", numericalHz: 1.618,
    name: "Sinergia Áurea (Phi)", category: "synergy",
    description: "Geometría Sagrada Auditiva.",
    detailedUsage: "Genera un batido de 1.618 Hz (Proporción Áurea) usando una portadora de 432 Hz. Alinea la mente con los patrones fractales del universo y la biología.",
    evidence: "Matemática Sagrada"
  },
  {
    id: 'syn_sun_moon', hz: "126.22 + 210.42", numericalHz: 126.22,
    name: "Sinergia Sol-Luna (Hatha)", category: "synergy",
    description: "Equilibrio Masculino/Femenino.",
    detailedUsage: "Combina la frecuencia del Sol (126.22 Hz) y la Luna Sinódica (210.42 Hz). Equilibra el 'Ha' (Sol) y 'Tha' (Luna) para una integración de polaridades y flujo energético.",
    evidence: "Hans Cousto / Yoga"
  },
  {
    id: 'syn_gaia_matrix', hz: "528 + 7.83 Beat", numericalHz: 528,
    name: "Matriz de Sanación Gaia", category: "synergy",
    description: "ADN y Tierra.",
    detailedUsage: "Frecuencia de reparación de ADN (528 Hz) modulada con un pulso de resonancia Schumann (7.83 Hz). Ancla la sanación celular al campo electromagnético terrestre.",
    evidence: "Bio-Arquitectura"
  },
  {
    id: 'syn_fibonacci', hz: "144 + 233", numericalHz: 144,
    name: "Acorde Fibonacci", category: "synergy",
    description: "Crecimiento Vital.",
    detailedUsage: "Combina 144 Hz y 233 Hz, dos pasos consecutivos de la secuencia Fibonacci (ratio ~1.618). Estimula el crecimiento ordenado y la percepción estética.",
    evidence: "Matemática Natural"
  },
  {
    id: 'syn_venus_mars', hz: "221.23 + 144.72", numericalHz: 144.72,
    name: "Conjunción Venus-Marte", category: "synergy",
    description: "Pasión y Armonía.",
    detailedUsage: "Une la fuerza de voluntad de Marte con la estética de Venus. Potencia la creatividad artística impulsiva y la armonía sexual.",
    evidence: "Arquetipos Planetarios"
  },
  {
    id: 'syn_sirius', hz: "Sirio A + B", numericalHz: 0,
    name: "Conexión Sirio", category: "synergy",
    description: "Tecnología Espiritual.",
    detailedUsage: "Basada en los periodos orbitales del sistema binario de Sirio. Se asocia con la iniciación espiritual avanzada y la activación de 'memorias estelares'.",
    evidence: "Misticismo Estelar"
  },
  {
    id: 'syn_pi', hz: "3.1416 Binaural", numericalHz: 3.14,
    name: "Resonancia Pi (Ciclos)", category: "synergy",
    description: "Eternidad y Ciclos.",
    detailedUsage: "Batido binaural basado en Pi (3.14159 Hz). Facilita la comprensión de ciclos infinitos y la resolución de problemas complejos.",
    evidence: "Matemática Trascendente"
  },
  {
    id: 'syn_pleiades', hz: "Acorde Pléyades", numericalHz: 0,
    name: "Armónico Pléyades", category: "synergy",
    description: "Amor Cósmico.",
    detailedUsage: "Un stack de frecuencias altas asociadas a las estrellas principales de las Pléyades. Induce sentimientos de amor incondicional y nostalgia cósmica.",
    evidence: "Canalización / Exopolítica"
  },
  {
    id: 'syn_orion', hz: "Cinturón de Orión", numericalHz: 0,
    name: "Alineación Orión", category: "synergy",
    description: "Resurrección y Sabiduría.",
    detailedUsage: "Tríada armónica que representa las estrellas del cinturón. Facilita la conexión con la sabiduría antigua y el tránsito de la conciencia.",
    evidence: "Arqueoastronomía"
  },
  {
    id: 'syn_arcturus', hz: "Luz de Arcturus", numericalHz: 0,
    name: "Sanación Arcturiana", category: "synergy",
    description: "Sanación Emocional Superior.",
    detailedUsage: "Stack complejo para purificación emocional y espiritual acelerada. Combina liberación de miedo y frecuencias de unidad.",
    evidence: "Misticismo Estelar"
  },
  {
    id: 'syn_christ', hz: "33 Hz (Schumann 4)", numericalHz: 33,
    name: "Resonancia 33Hz", category: "synergy",
    description: "Conciencia Crística / Pirámide.",
    detailedUsage: "Cuarto armónico de Schumann (aprox 33.8 Hz) y frecuencia de la Cámara del Rey. Asociada a la edad de Cristo y la iluminación vertebral.",
    evidence: "Misticismo Numérico"
  }
];
