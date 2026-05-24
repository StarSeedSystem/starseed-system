export type Comment = {
    id: string;
    author: string;
    avatar: string;
    timestamp: string;
    content: string;
    dataAiHint: string;
    likes: number;
    replies: Comment[];
}


export const notifications = [
    {
        id: '1',
        type: 'new_feature',
        title: '¡Lanzamiento del Generador de Apps con IA!',
        description: 'Crea apps funcionales desde una simple descripción de texto. Pruébalo ahora en la sección "Apps".',
        timestamp: 'hace 15m',
        read: false,
    },
    {
        id: '2',
        type: 'mention',
        title: 'Te mencionaron en "Planificación Q4"',
        description: '@tú, ¿puedes revisar las últimas actualizaciones por favor?',
        timestamp: 'hace 1h',
        read: false,
    },
    {
        id: '3',
        type: 'system',
        title: 'Actualización del sistema completada',
        description: 'Nuestros sistemas han sido actualizados a la última versión para un mejor rendimiento.',
        timestamp: 'hace 3h',
        read: true,
    },
    {
        id: '4',
        type: 'new_feature',
        title: 'Presentamos los Filtros Inteligentes',
        description: 'Tu feed ahora es más inteligente. Te mostraremos lo que más importa.',
        timestamp: 'hace 1d',
        read: true,
    },
    {
        id: '5',
        type: 'mention',
        title: 'Se solicitó tu opinión en "Nuevos Mockups de UI"',
        description: 'Hey @tú, ¿qué opinas de la nueva dirección de diseño?',
        timestamp: 'hace 2d',
        read: true,
    },
];

export const feedItemComments: Comment[] = [
    {
        id: 'feed-comment-1',
        author: 'Brenda',
        avatar: 'https://placehold.co/100x100.png',
        timestamp: 'hace 1h',
        content: '¡Totalmente de acuerdo! Esta función de IA cambia las reglas del juego. Me ahorró horas de trabajo de configuración.',
        dataAiHint: 'woman excited',
        likes: 5,
        replies: []
    }
]

export const feedItems = [
    {
        id: 'feed-1',
        author: 'Alex Duran',
        avatar: 'https://placehold.co/100x100.png',
        handle: '@alex',
        href: '/profile/alex',
        content: 'Acabo de usar el nuevo Generador de Apps con IA para crear un rastreador de inventario rápido para mi proyecto personal. ¡Tardé literalmente 5 minutos. Esto es un cambio de juego para el prototipado rápido! 🚀 #StarSeedNetwork #IA',
        timestamp: 'hace 2h',
        likes: 125,
        comments: feedItemComments,
        dataAiHint: 'man coding',
        imageUrl: 'https://placehold.co/600x400.png',
        imageHint: 'code on screen'
    },
    {
        id: 'feed-2',
        author: 'Samantha Lee',
        avatar: 'https://placehold.co/100x100.png',
        content: 'El resumidor de notificaciones es simplemente genial. Mi bandeja de entrada era un desastre, y ahora recibo un resumen limpio y conciso cada mañana. ¡Finalmente, el inbox zero está a mi alcance!',
        handle: '@samlee',
        href: '/profile/samlee',
        timestamp: 'hace 1d',
        likes: 340,
        comments: [],
        dataAiHint: 'woman smiling',
        imageUrl: null,
        imageHint: null,
    },
    {
        id: 'feed-3',
        author: 'Proyecto Stardust',
        avatar: 'https://placehold.co/100x100.png',
        handle: '@stardust',
        href: '/profile/stardust',
        content: 'Anunciando el Proyecto Constelación: nuestra suite de visualización de datos de nueva generación. Estamos aprovechando el núcleo de la Red StarSeed para crear dashboards interactivos en tiempo real. ¡Más detalles próximamente!',
        timestamp: 'hace 3d',
        likes: 1200,
        comments: [],
        dataAiHint: 'nebula stars',
        imageUrl: 'https://placehold.co/600x400.png',
        imageHint: 'star constellation'
    }
];

export const comments: Comment[] = [
    {
        id: 'comment-1',
        author: 'Brenda',
        avatar: 'https://placehold.co/100x100.png',
        timestamp: 'hace 3h',
        content: '¡Este es un punto de partida fantástico! Me gustan especialmente las funciones impulsadas por IA. ¿Han considerado agregar una forma de encadenar acciones de IA?',
        dataAiHint: 'woman thinking',
        likes: 2,
        replies: [
            {
                id: 'reply-1',
                author: 'Admin',
                avatar: 'https://placehold.co/100x100.png',
                timestamp: 'hace 2h',
                content: '¡Gran sugerencia! Un constructor de flujos visuales para servicios de IA está en nuestro roadmap para el Q3. ¡Gracias por los comentarios!',
                dataAiHint: 'robot thinking',
                likes: 1,
                replies: []
            }
        ]
    },
    {
        id: 'comment-2',
        author: 'Carlos',
        avatar: 'https://placehold.co/100x100.png',
        timestamp: 'hace 1d',
        content: 'El sistema de comentarios enriquecido es una gran mejora. Poder incrustar contenido enriquecido directamente en las respuestas hace que las discusiones sean mucho más productivas.',
        dataAiHint: 'man collaborating',
        likes: 5,
        replies: []
    }
];

const politicalComments: Comment[] = [
    {
        id: 'pol-comment-1',
        author: 'Experto en Legislación',
        avatar: 'https://placehold.co/100x100.png',
        timestamp: 'hace 6h',
        content: 'He revisado el "Análisis de Impacto Técnico.docx". La arquitectura propuesta es sólida, pero debemos considerar el coste computacional a largo plazo para las bóvedas de datos personales. Sugiero añadir una enmienda para revisar la eficiencia cada 2 años.',
        dataAiHint: 'man with glasses',
        likes: 15,
        replies: [
            {
                id: 'pol-reply-1',
                author: 'Proponente de la Ley',
                avatar: 'https://placehold.co/100x100.png',
                timestamp: 'hace 4h',
                content: 'Excelente punto. Voy a proponer tu sugerencia como una opción de enmienda en la sección de comentarios para que pueda ser votada.',
                dataAiHint: 'politician speaking',
                likes: 4,
                replies: []
            }
        ]
    }
]

export const politicalProposals = [
    {
        id: 'prop-1',
        title: 'Ley de Soberanía de Datos Personales',
        ef: 'E.F. del Valle Central',
        urgency: 'Urgente',
        status: 'Votación Activa',
        deadline: '3 días',
        summary: 'Propuesta para establecer un marco legal que garantice que todos los datos generados por los ciudadanos dentro de la E.F. sean de su propiedad y control, requiriendo consentimiento explícito para su uso por terceros.',
        details: 'Esta ley busca implementar el principio de soberanía de datos a nivel de Entidad Federativa. Incluye la creación de una "Bóveda de Datos Personal" encriptada para cada ciudadano, gestionada a través de su Perfil Oficial. Las empresas y otras entidades que deseen acceder a datos deberán realizar solicitudes formales que el ciudadano podrá aprobar o denegar con granularidad. La propuesta también establece sanciones para el uso no autorizado de datos.',
        votes: [
            { name: 'A Favor', votes: 1250, color: 'hsl(var(--accent-hsl))' },
            { name: 'En Contra', votes: 340, color: 'hsl(var(--destructive-hsl))' },
            { name: 'Abstención', votes: 120, color: 'hsl(var(--muted-foreground-hsl))' }
        ],
        files: [
            { name: 'Borrador Completo de la Ley.pdf', url: '#' },
            { name: 'Análisis de Impacto Técnico.docx', url: '#' }
        ],
        comments: politicalComments,
    },
    {
        id: 'prop-2',
        title: 'Protocolo de Energía Renovable Comunitaria',
        ef: 'E.F. Norte Verde',
        urgency: 'Alta',
        status: 'Debate Oficial',
        deadline: '12 días',
        summary: 'Establece un protocolo para la creación de microrredes eléctricas comunitarias alimentadas por energía solar y eólica, con gestión descentralizada mediante contratos inteligentes.',
        details: 'El protocolo define los estándares técnicos para la instalación de paneles solares y aerogeneradores en edificios comunitarios. Propone un sistema de créditos de energía distribuibles entre los miembros que contribuyan con su infraestructura. La gestión de la microrred será transparente y auditada en la blockchain pública de StarSeed.',
        votes: [
            { name: 'A Favor', votes: 890, color: 'hsl(var(--accent-hsl))' },
            { name: 'En Contra', votes: 156, color: 'hsl(var(--destructive-hsl))' },
            { name: 'Abstención', votes: 74, color: 'hsl(var(--muted-foreground-hsl))' }
        ],
        files: [
            { name: 'Estudio de Viabilidad Energética.pdf', url: '#' },
            { name: 'Mapa de Recursos Solares.svg', url: '#' }
        ],
        comments: [],
    },
    {
        id: 'prop-3',
        title: 'Currículo Abierto de Educación Universal',
        ef: 'Consejo Global StarSeed',
        urgency: 'Media',
        status: 'Apoyo Inicial',
        deadline: '21 días',
        summary: 'Define los estándares mínimos de un currículo de educación libre y universal accesible a todos los miembros de la red, desde alfabetización básica hasta competencias transhumanas avanzadas.',
        details: 'El currículo se organiza en 7 niveles de competencia, desde fundamentos de lectoescritura y pensamiento crítico hasta inteligencia artificial aplicada y gobernanza ontocrática. Cada nivel tiene módulos teóricos y prácticos. La validación de competencias se realiza mediante proyectos comunitarios evaluados por pares certificados.',
        votes: [
            { name: 'A Favor', votes: 2340, color: 'hsl(var(--accent-hsl))' },
            { name: 'En Contra', votes: 89, color: 'hsl(var(--destructive-hsl))' },
            { name: 'Abstención', votes: 210, color: 'hsl(var(--muted-foreground-hsl))' }
        ],
        files: [
            { name: 'Borrador de Currículo v2.3.pdf', url: '#' },
            { name: 'Comparativa con Sistemas Educativos.docx', url: '#' },
            { name: 'Feedback Comunidad.xlsx', url: '#' }
        ],
        comments: [],
    },
    {
        id: 'prop-4',
        title: 'Constitución de la Economía de Semillas (Seeds)',
        ef: 'E.F. Nexus Digital',
        urgency: 'Urgente',
        status: 'Borrador',
        deadline: '5 días para apoyo',
        summary: 'Codifica las reglas fundamentales de la economía interna basada en Seeds (SC): emisión, distribución, karma, y los mecanismos anti-monopolio para asegurar que los recursos fluyan libremente según contribución.',
        details: 'El ecosistema económico StarSeed se basa en Seeds (SC) como unidad de reconocimiento de contribución. Esta constitución define: (1) Emisión controlada ligada a actividad real, (2) Sistema de karma como multiplicador de influencia, (3) Límites de acumulación para prevenir concentración de poder, (4) Distribución básica universal para todos los miembros verificados, (5) Mecanismos de donación y transferencia comunitaria.',
        votes: [
            { name: 'A Favor', votes: 445, color: 'hsl(var(--accent-hsl))' },
            { name: 'En Contra', votes: 312, color: 'hsl(var(--destructive-hsl))' },
            { name: 'Abstención', votes: 188, color: 'hsl(var(--muted-foreground-hsl))' }
        ],
        files: [
            { name: 'Whitepaper Economía Seeds.pdf', url: '#' }
        ],
        comments: [],
    }
];

export const themes = [
    { id: 'theme-ia', name: 'IA', description: 'Cubre todos los aspectos de la Inteligencia Artificial, desde algoritmos y modelos hasta sus implicaciones éticas y sociales.' },
    { id: 'theme-sostenibilidad', name: 'Sostenibilidad', description: 'Principios y prácticas para crear sistemas que perduren y se regeneren, abarcando ecología, economía y sociedad.' },
    { id: 'theme-gobernanza', name: 'Gobernanza', description: 'Modelos y teorías sobre cómo los grupos de personas se organizan y toman decisiones colectivas.' },
    { id: 'theme-consciencia', name: 'Conciencia', description: 'La exploración de la naturaleza de la conciencia, desde perspectivas científicas, filosóficas y espirituales.' },
    { id: 'theme-fisica', name: 'Física Cuántica', description: 'El estudio del comportamiento de la materia y la energía a nivel atómico y subatómico.' },
    { id: 'theme-etica', name: 'Ética', description: 'El estudio de los principios morales que guían el comportamiento humano y el diseño de sistemas justos.' },
    { id: 'theme-tecnologia', name: 'Tecnología', description: 'Herramientas y técnicas utilizadas para extender las capacidades humanas y transformar el mundo.' },
]

export const courses = [
    {
        id: 'course-1',
        href: '/course/quantum-physics-intro',
        title: 'Introducción a la Física Cuántica',
        description: 'Explora los conceptos fundamentales del mundo cuántico, desde la dualidad onda-partícula hasta el entrelazamiento.',
        progress: 60,
        tags: ['Física Cuántica', 'Ciencia', 'Fundamentos'],
        modules: [
            {
                title: "Módulo 1: Fundamentos",
                lessons: [
                    { title: "Lección 1.1: La Crisis de la Física Clásica", completed: true },
                    { title: "Lección 1.2: El cuanto de Planck y el Efecto Fotoeléctrico", completed: true },
                    { title: "Lección 1.3: La Dualidad Onda-Partícula", completed: false },
                ]
            },
            {
                title: "Módulo 2: La Ecuación de Schrödinger",
                lessons: [
                    { title: "Lección 2.1: La Función de Onda", completed: false },
                    { title: "Lección 2.2: Resolviendo para un Pozo de Potencial Infinito", completed: false },
                ]
            }
        ]
    },
    {
        id: 'course-2',
        href: '/course/ai-ethics',
        title: 'Ética en la Inteligencia Artificial',
        description: 'Un curso sobre los dilemas éticos que enfrentamos con el desarrollo de la IA y cómo crear sistemas alineados con valores humanos.',
        progress: 85,
        tags: ['IA', 'Ética', 'Sociedad', 'Tecnología'],
        modules: [
            {
                title: "Módulo 1: Introducción a la Ética de las Máquinas",
                lessons: [
                    { title: "Lección 1.1: ¿Por qué es importante la ética en la IA?", completed: true },
                    { title: "Lección 1.2: Marcos éticos principales (Utilitarismo, Deontología)", completed: true },
                ]
            },
            {
                title: "Módulo 2: Sesgo y Justicia",
                lessons: [
                    { title: "Lección 2.1: ¿Cómo aprenden los modelos el sesgo?", completed: true },
                    { title: "Lección 2.2: Técnicas para la mitigación del sesgo", completed: true },
                ]
            },
            {
                title: "Módulo 3: El Problema de la Caja Negra",
                lessons: [
                    { title: "Lección 3.1: Explicabilidad e Interpretabilidad (XAI)", completed: true },
                    { title: "Lección 3.2: ¿Tenemos derecho a una explicación?", completed: false },
                ]
            }
        ]
    }
];

const articleComments: Comment[] = [
    {
        id: 'art-comment-1',
        author: 'Estudiante de Filosofía',
        avatar: 'https://placehold.co/100x100.png',
        timestamp: 'hace 2 días',
        content: 'El artículo sobre la teoría de la simulación es fascinante. Me gustaría citar a Bostrom:\n\n> "una de las siguientes proposiciones debe ser verdadera: (1) la fracción de civilizaciones de nivel humano que alcanzan una etapa posthumana es muy cercana a cero; (2) la fracción de civilizaciones posthumanas que están interesadas en ejecutar simulaciones de sus ancestros es muy cercana a cero; (3) la fracción de todas las personas con nuestro tipo de experiencias que están viviendo en una simulación es muy cercana a uno."\n\n¿Qué implicaciones tiene esto para nuestra concepción del "libre albedrío"?',
        dataAiHint: 'student thinking',
        likes: 22,
        replies: []
    }
];


export const articles = [
    {
        id: 'article-1',
        title: 'La Teoría de la Simulación: ¿Vivimos en una Realidad Programada?',
        author: 'Dra. Evelyn Reed',
        authorAvatar: 'https://placehold.co/100x100.png',
        rating: 4.8,
        href: '/article/the-simulation-theory',
        excerpt: 'Un análisis profundo de los argumentos a favor y en contra de la hipótesis de la simulación, explorando sus implicaciones filosóficas y científicas.',
        tags: ['Filosofía', 'Ciencia', 'Conciencia'],
        likes: 152,
        comments: articleComments,
        content: `
La hipótesis de la simulación propone que nuestra realidad es una simulación artificial, posiblemente una simulación por computadora. Esta idea, aunque popularizada por la ciencia ficción, tiene raíces profundas en la filosofía y está siendo seriamente considerada por varios físicos, cosmólogos y filósofos.

### El Argumento de Nick Bostrom

El filósofo Nick Bostrom, en su famoso artículo de 2003, formalizó el argumento de la simulación. Propuso un trilema con tres posibles escenarios:

1.  **La Extinción:** La probabilidad de que una civilización como la nuestra alcance un nivel de desarrollo tecnológico capaz de crear "simulaciones de ancestros" es prácticamente nula.
2.  **La Convergencia de Intereses:** Civilizaciones posthumanas (aquellas que han alcanzado ese nivel tecnológico) habrán perdido interés en ejecutar simulaciones de sus ancestros.
3.  **La Simulación:** Estamos casi con certeza viviendo en una simulación.

Bostrom argumenta que al menos una de estas proposiciones debe ser verdadera. Si la tercera es la correcta, entonces es mucho más probable que seamos una de las innumerables mentes simuladas que una de las mentes originales.

### Evidencia y Argumentos

No existe evidencia directa que confirme o refute la hipótesis de la simulación, pero hay varias líneas de pensamiento:

*   **El Límite Computacional:** Algunos físicos sugieren que si el universo es una simulación, debería haber un "límite" en los recursos computacionales, lo que podría manifestarse como un "pixelado" del espacio-tiempo a la escala de Planck.
*   **La Naturaleza Matemática del Universo:** La sorprendente efectividad de las matemáticas para describir el universo podría ser una pista de que está basado en código y algoritmos.
*   **Paradojas Cuánticas:** Fenómenos como el entrelazamiento y el colapso de la función de onda podrían ser optimizaciones computacionales, donde el universo solo renderiza propiedades definidas cuando son observadas.

> "El universo comienza a parecerse más a un gran pensamiento que a una gran máquina." - James Jeans

Este artículo solo roza la superficie de un tema vasto y alucinante. Te invitamos a explorar las referencias y a unirte a la discusión en los comentarios.
`,
        image: 'https://placehold.co/800x450.png',
        imageHint: 'digital matrix code'
    },
    {
        id: 'article-2',
        title: 'Gobernanza Descentralizada: Modelos para el Futuro',
        author: 'Comunidad de Gobernanza',
        authorAvatar: 'https://placehold.co/100x100.png',
        rating: 4.9,
        href: '/article/decentralized-governance',
        excerpt: 'Estudio comparativo de diferentes modelos de Organizaciones Autónomas Descentralizadas (DAOs) y su aplicabilidad en el contexto de las Entidades Federativas.',
        tags: ['Gobernanza', 'Sociedad', 'Política', 'Tecnología'],
        likes: 230,
        comments: [],
        content: `... (Contenido completo del artículo 2) ...`,
        image: null,
        imageHint: null,
    },
    {
        id: 'article-3',
        title: 'Permacultura: Diseñando Ecosistemas Sostenibles',
        author: 'Red de Permacultura',
        authorAvatar: 'https://placehold.co/100x100.png',
        rating: 4.7,
        href: '/article/permaculture-design',
        excerpt: 'Una guía práctica para aplicar los principios de la permacultura en tu comunidad, desde jardines urbanos hasta sistemas de gestión de agua.',
        tags: ['Sostenibilidad', 'Comunidad', 'Ecología'],
        likes: 98,
        comments: [],
        content: `... (Contenido completo del artículo 3) ...`,
        image: 'https://placehold.co/800x450.png',
        imageHint: 'lush community garden'
    },
    {
        id: 'article-4',
        title: 'Modelos de Lenguaje Grande (LLMs) y Creatividad',
        author: 'Grupo de Estudio de IA',
        authorAvatar: 'https://placehold.co/100x100.png',
        rating: 4.9,
        href: '/article/llms-and-creativity',
        excerpt: 'Cómo los LLMs están revolucionando la creatividad y el arte, y las herramientas para empezar a experimentar.',
        tags: ['IA', 'Arte Generativo', 'Tecnología'],
        likes: 312,
        comments: [],
        content: `... (Contenido completo del artículo 4) ...`,
        image: null,
        imageHint: null
    },
];

export const categories = [
    {
        id: 'cat-ciencia',
        name: 'Ciencia',
        description: 'La búsqueda sistemática de conocimiento sobre el universo a través de la observación y la experimentación.',
        content: [],
        subCategories: [
            {
                id: 'cat-fisica',
                name: 'Física',
                description: 'La ciencia que estudia la materia, la energía, el espacio y el tiempo.',
                content: [],
                subCategories: [
                    {
                        id: 'cat-cuantica',
                        name: 'Física Cuántica',
                        description: 'Rama de la física que estudia los fenómenos a escalas microscópicas.',
                        content: ['course-1'],
                        subCategories: []
                    }
                ]
            },
            {
                id: 'cat-filosofia',
                name: 'Filosofía',
                description: 'El estudio de preguntas fundamentales sobre la existencia, el conocimiento, los valores, la razón, la mente y el lenguaje.',
                content: ['article-1'],
                subCategories: []
            }
        ]
    },
    {
        id: 'cat-sociedad',
        name: 'Sociedad',
        description: 'El estudio de las estructuras sociales, las relaciones humanas y la cultura.',
        content: [],
        subCategories: [
            {
                id: 'cat-etica',
                name: 'Ética',
                description: 'Principios morales que gobiernan el comportamiento de una persona o la realización de una actividad.',
                content: ['course-2'],
                subCategories: []
            },
            {
                id: 'cat-gobernanza',
                name: 'Gobernanza',
                description: 'Los sistemas y procesos que aseguran la dirección, control y rendición de cuentas de una organización o sociedad.',
                content: ['article-2'],
                subCategories: []
            }
        ]
    },
    {
        id: 'cat-tecnologia',
        name: 'Tecnología',
        description: 'La aplicación del conocimiento científico para fines prácticos, especialmente en la industria.',
        content: ['article-4'],
        subCategories: []
    },
    {
        id: 'cat-ecologia',
        name: 'Ecología',
        description: 'El estudio de las relaciones entre los organismos vivos, incluidos los humanos, y su entorno físico.',
        content: ['article-3'],
        subCategories: []
    }
]


export const culturalPosts = [
    {
        id: 'cult-1',
        author: {
            name: 'Artista Anónimo',
            avatar: 'https://placehold.co/100x100.png',
            href: '/profile/artista-anonimo'
        },
        timestamp: 'hace 5h',
        title: 'Exploración Geométrica',
        content: 'Jugando con formas y colores en un espacio generado proceduralmente. Cada vez que actualizas, la obra cambia.\n\n#ArteGenerativo #WebGL #Ciberdelia',
        imageUrl: 'https://placehold.co/600x400.png',
        imageHint: 'abstract geometric art',
        likes: 243,
        comments: [
            {
                id: 'cult-comment-1',
                author: 'Curador de Arte Digital',
                avatar: 'https://placehold.co/100x100.png',
                timestamp: 'hace 3h',
                content: 'La paleta de colores es fascinante. La forma en que los gradientes se fusionan crea una sensación de profundidad infinita. ¿Has considerado añadir interactividad basada en el audio?',
                dataAiHint: 'art curator',
                likes: 8,
                replies: []
            }
        ]
    },
    {
        id: 'cult-2',
        author: {
            name: 'Poeta del Silicio',
            avatar: 'https://placehold.co/100x100.png',
            href: '/profile/poeta-silicio'
        },
        timestamp: 'hace 1 día',
        title: 'Haiku de Código',
        content: 'Un bit solitario,\nfluye en ríos de cristal,\nnace el universo.\n\n#Poesía #Código #Filosofía',
        imageUrl: null,
        imageHint: null,
        likes: 180,
        comments: []
    }
];

export type MessageFull = {
    id: string;
    author: string;
    avatar: string;
    dataAiHint: string;
    timestamp: string;
    content: {
        type: 'text' | 'image' | 'file' | 'canvas' | 'poll';
        text?: string;
        imageUrl?: string;
        imageHint?: string;
        file?: { name: string; size: string; };
        canvas?: { title: string, content: string };
        poll?: { question: string, options: string[] };
    };
};

export type ConversationFull = {
    id: string;
    type: 'dm' | 'group';
    name: string;
    avatar: string;
    dataAiHint: string;
    unreadCount: number;
    lastMessage: string;
    lastMessageTimestamp: string;
    messages: MessageFull[];
    pinned: boolean;
};

export const conversations: ConversationFull[] = [
    {
        id: 'convo-1',
        type: 'dm',
        name: 'Brenda',
        avatar: 'https://placehold.co/100x100.png',
        dataAiHint: 'woman smiling',
        unreadCount: 2,
        lastMessage: '¡Claro! Te envío ahora mismo el borrador del lienzo.',
        lastMessageTimestamp: 'hace 5m',
        pinned: true,
        messages: [
            {
                id: 'msg-1-1',
                author: 'Brenda',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'woman smiling',
                timestamp: 'hace 10m',
                content: { type: 'text', text: 'Hey! ¿Tienes un momento para revisar los conceptos para el nuevo EVP de "Bosque Fractal"?' }
            },
            {
                id: 'msg-1-2',
                author: 'Tú',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'user avatar',
                timestamp: 'hace 8m',
                content: { type: 'text', text: 'Sí, claro. Envíamelos.' }
            },
            {
                id: 'msg-1-3',
                author: 'Brenda',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'woman smiling',
                timestamp: 'hace 5m',
                content: {
                    type: 'canvas',
                    canvas: {
                        title: 'Borrador: Bosque Fractal',
                        content: 'Un lienzo interactivo con imágenes conceptuales, paletas de colores y una pequeña demo de shader.'
                    }
                }
            },
        ]
    },
    {
        id: 'convo-2',
        type: 'group',
        name: 'Grupo de Estudio de IA',
        avatar: 'https://placehold.co/100x100.png',
        dataAiHint: 'brain circuit',
        unreadCount: 0,
        lastMessage: 'Acabo de subir el paper, ¡buena lectura!',
        lastMessageTimestamp: 'hace 1h',
        pinned: true,
        messages: [
            {
                id: 'msg-2-1',
                author: 'Alex Duran',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'man coding',
                timestamp: 'hace 2h',
                content: {
                    type: 'poll',
                    poll: {
                        question: '¿Cuándo hacemos la próxima sesión para discutir el paper sobre "Attention Is All You Need"?',
                        options: ['Martes 5pm', 'Miércoles 6pm', 'Jueves 5pm']
                    }
                }
            },
            {
                id: 'msg-2-2',
                author: 'Samantha Lee',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'woman smiling',
                timestamp: 'hace 1h',
                content: {
                    type: 'file',
                    file: {
                        name: 'Attention_Is_All_You_Need.pdf',
                        size: '2.2 MB'
                    }
                }
            }
        ]
    },
    {
        id: 'convo-3',
        type: 'dm',
        name: 'Artista Anónimo',
        avatar: 'https://placehold.co/100x100.png',
        dataAiHint: 'abstract art',
        unreadCount: 0,
        lastMessage: 'Aquí tienes la última pieza, dime qué te parece.',
        lastMessageTimestamp: 'hace 3h',
        pinned: false,
        messages: [
            {
                id: 'msg-3-1',
                author: 'Artista Anónimo',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'abstract art',
                timestamp: 'hace 3h',
                content: {
                    type: 'image',
                    imageUrl: 'https://placehold.co/400x300.png',
                    imageHint: 'generative art canvas'
                }
            }
        ]
    },
    {
        id: 'convo-4',
        type: 'group',
        name: 'E.F. del Valle Central',
        avatar: 'https://placehold.co/100x100.png',
        dataAiHint: 'government building',
        unreadCount: 5,
        lastMessage: 'Recordatorio: La votación de la Ley de Agua cierra mañana.',
        lastMessageTimestamp: 'hace 8h',
        pinned: false,
        messages: [
            {
                id: 'msg-4-1',
                author: 'Sistema',
                avatar: 'https://placehold.co/100x100.png',
                dataAiHint: 'system icon',
                timestamp: 'hace 8h',
                content: { type: 'text', text: 'Recordatorio: La votación de la Ley de Agua cierra mañana.' }
            }
        ]
    }
];

export const files = [
    { id: 1, type: "image", name: "Concept Art v1", size: "2.5 MB", date: "2024-06-10", preview: "https://placehold.co/400x300.png", dataAiHint: "concept art" },
    { id: 2, type: "document", name: "Propuesta de Proyecto", size: "512 KB", date: "2024-06-09", icon: 'FileText' },
    { id: 3, type: "video", name: "Demo Animación UI", size: "15.2 MB", date: "2024-06-08", preview: "https://placehold.co/400x300.png", dataAiHint: "animation" },
    { id: 4, type: "folder", name: "Documentos de Investigación", size: "123 archivos", date: "2024-06-07", icon: 'Folder' },
    { id: 5, type: "audio", name: "Podcast Episodio 3", size: "30.1 MB", date: "2024-06-06", preview: "https://placehold.co/400x300.png", dataAiHint: "sound wave" },
    { id: 6, type: "image", name: "Foto del Equipo", size: "4.1 MB", date: "2024-06-05", preview: "https://placehold.co/400x300.png", dataAiHint: "team photo" },
];

export type Theme = (typeof themes)[0];
export type Category = (typeof categories)[0];
export type Course = (typeof courses)[0];
export type Article = (typeof articles)[0];
// export type ConversationFull = (typeof conversations)[0];
// export type MessageFull = (typeof conversations)[0]['messages'][0];

export const executiveProjects = [
    {
        id: 'proj-1',
        title: 'Sistema de Riego Comunitario Inteligente',
        status: 'En Progreso',
        budget: '15,000 SC',
        volunteers: 12,
        progress: 65,
        deadline: '15 Ago 2026',
        description: 'Implementación de sensores IoT para optimizar el uso de agua en los huertos del Sector 7.'
    },
    {
        id: 'proj-2',
        title: 'Renovación del Centro Cultural',
        status: 'En Planificación',
        budget: '45,000 SC',
        volunteers: 5,
        progress: 15,
        deadline: '01 Dic 2026',
        description: 'Diseño arquitectónico y estructural para la expansión del domo central.'
    },
    {
        id: 'proj-3',
        title: 'Auditoría de Seguridad de la Red',
        status: 'Completado',
        budget: '5,000 SC',
        volunteers: 3,
        progress: 100,
        deadline: '10 Ene 2026',
        description: 'Revisión completa de los protocolos de encriptación de las bóvedas personales.'
    }
];

export const judicialCases = [
    {
        id: 'case-1',
        title: 'Disputa de Límites - Huerto A vs B',
        type: 'Mediación',
        status: 'En Mediación',
        facilitator: 'Ana K.',
        participants: ['Huerto Comunitario A', 'Huerto Comunitario B'],
        description: 'Conflicto sobre el acceso al canal de agua secundario. Ambas partes reclaman derechos de uso prioritario.',
        date: '2026-05-12'
    },
    {
        id: 'case-2',
        title: 'Violación de Normas de Ruido - Zona Residencial',
        type: 'Convivencia',
        status: 'Juicio Comunitario',
        facilitator: 'Consejo de Ética',
        participants: ['Vecinos Bloque 4', 'Club de Música'],
        description: 'Múltiples reportes sobre niveles de ruido excediendo lo permitido después de las 22:00.',
        date: '2026-06-01'
    },
    {
        id: 'case-3',
        title: 'Uso indebido de datos de perfil',
        type: 'Digital',
        status: 'Abierto',
        facilitator: 'Mediador Digital 1',
        participants: ['Perfil @innovatech', 'E.F. Norte Verde'],
        description: 'Se acusa a @innovatech de recolectar datos de miembros de la EF sin consentimiento explícito para análisis de comportamiento.',
        date: '2026-06-14'
    }
];

// ---- Hub Data ----
export const studyGroups = [
    {
        id: 'sg-1',
        name: 'Física Cuántica Aplicada',
        type: 'Estudio',
        members: 24,
        nextSession: 'Mar 18 Jun, 5PM',
        topic: 'Entrelazamiento y No-Localidad',
        level: 'Avanzado',
        tags: ['Ciencia', 'Física'],
        avatar: 'https://placehold.co/40x40.png',
    },
    {
        id: 'sg-2',
        name: 'Gobernanza Ontocrática',
        type: 'Estudio',
        members: 41,
        nextSession: 'Mié 19 Jun, 6PM',
        topic: 'DAOs y Entidades Federativas: Comparativa',
        level: 'Intermedio',
        tags: ['Política', 'Gobernanza'],
        avatar: 'https://placehold.co/40x40.png',
    },
    {
        id: 'sg-3',
        name: 'Arte Generativo & WebGL',
        type: 'Cultural',
        members: 33,
        nextSession: 'Vie 21 Jun, 7PM',
        topic: 'Three.js: Sistemas de Partículas',
        level: 'Principiante',
        tags: ['Arte', 'Tecnología'],
        avatar: 'https://placehold.co/40x40.png',
    },
    {
        id: 'sg-4',
        name: 'Permacultura Urbana',
        type: 'Cultural',
        members: 67,
        nextSession: 'Sáb 22 Jun, 10AM',
        topic: 'Diseño de Huertos Verticales con IA',
        level: 'Principiante',
        tags: ['Ecología', 'Comunidad'],
        avatar: 'https://placehold.co/40x40.png',
    },
];

export const communityEvents = [
    {
        id: 'ev-1',
        title: 'Asamblea General E.F. Valle Central',
        date: '2026-06-20',
        time: '18:00',
        type: 'Político',
        location: 'Sala de Debates Digital - EVP',
        attendees: 234,
        capacity: 500,
        color: 'blue',
        urgent: true,
    },
    {
        id: 'ev-2',
        title: 'Festival de Arte Generativo CiberSol',
        date: '2026-06-22',
        time: '15:00',
        type: 'Cultural',
        location: 'Anfiteatro Virtual Helix',
        attendees: 890,
        capacity: 2000,
        color: 'purple',
        urgent: false,
    },
    {
        id: 'ev-3',
        title: 'Hackathon: Herramientas de Gobernanza IA',
        date: '2026-06-25',
        time: '09:00',
        type: 'Educativo',
        location: 'Hub del Nexus Digital',
        attendees: 156,
        capacity: 300,
        color: 'green',
        urgent: false,
    },
    {
        id: 'ev-4',
        title: 'Meditación Colectiva Aurora Boreal',
        date: '2026-06-28',
        time: '21:00',
        type: 'Bienestar',
        location: 'Entorno Virtual: Glaciar Ártico',
        attendees: 421,
        capacity: 1000,
        color: 'cyan',
        urgent: false,
    },
];

export const userBadges = [
    { id: 'badge-1', name: 'Ciudadano Verificado', icon: '✓', color: 'blue', description: 'Identidad verificada en la red StarSeed' },
    { id: 'badge-2', name: 'Mediador Certificado', icon: '⚖', color: 'purple', description: 'Certificado para facilitar procesos judiciales restaurativos' },
    { id: 'badge-3', name: 'Pionero StarSeed', icon: '⭐', color: 'gold', description: 'Miembro fundador de la red (primeros 1000 usuarios)' },
    { id: 'badge-4', name: 'Experto en Gobernanza', icon: '🏛', color: 'green', description: 'Ha contribuido significativamente al sistema legislativo' },
    { id: 'badge-5', name: 'Creador Cultural', icon: '🎨', color: 'pink', description: 'Ha publicado obras reconocidas por la comunidad' },
];

export const politicalParties = [
    {
        id: 'party-1',
        name: 'Frente de Soberanía Digital',
        ideology: 'Privacidad radical, descentralización',
        members: 1240,
        founded: '2025-01',
        votes_history: 847,
        color: '#6C5CE7',
        isFollowing: true,
        replicationActive: false,
    },
    {
        id: 'party-2',
        name: 'Coalición Verde Ontocrática',
        ideology: 'Ecología, gobernanza participativa',
        members: 2890,
        founded: '2024-08',
        votes_history: 1203,
        color: '#00B894',
        isFollowing: true,
        replicationActive: true,
    },
    {
        id: 'party-3',
        name: 'Vanguardia Transhumanista',
        ideology: 'IA aumentativa, expansión cognitiva',
        members: 654,
        founded: '2025-03',
        votes_history: 412,
        color: '#0984E3',
        isFollowing: false,
        replicationActive: false,
    },
];
