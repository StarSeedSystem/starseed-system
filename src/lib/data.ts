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
        comments: 12,
        dataAiHint: 'man coding',
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
        comments: 45,
        dataAiHint: 'woman smiling',
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
        comments: 156,
        dataAiHint: 'nebula stars',
    }
];

export const comments = [
    {
        id: 'comment-1',
        author: 'Brenda',
        avatar: 'https://placehold.co/100x100.png',
        timestamp: 'hace 3h',
        content: '¡Este es un punto de partida fantástico! Me gustan especialmente las funciones impulsadas por IA. ¿Han considerado agregar una forma de encadenar acciones de IA?',
        dataAiHint: 'woman thinking',
        replies: [
            {
                id: 'reply-1',
                author: 'Admin',
                avatar: 'https://placehold.co/100x100.png',
                timestamp: 'hace 2h',
                content: '¡Gran sugerencia! Un constructor de flujos visuales para servicios de IA está en nuestro roadmap para el Q3. ¡Gracias por los comentarios!',
                dataAiHint: 'robot thinking',
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
        replies: []
    }
];

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
    ]
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
    title: 'Introducción a la Física Cuántica',
    description: 'Explora los conceptos fundamentales del mundo cuántico, desde la dualidad onda-partícula hasta el entrelazamiento.',
    progress: 60,
    tags: ['Física Cuántica', 'Ciencia', 'Fundamentos']
  },
  {
    id: 'course-2',
    title: 'Ética en la Inteligencia Artificial',
    description: 'Un curso sobre los dilemas éticos que enfrentamos con el desarrollo de la IA y cómo crear sistemas alineados con valores humanos.',
    progress: 85,
    tags: ['IA', 'Ética', 'Sociedad', 'Tecnología']
  }
];

export const articles = [
  {
    id: 'article-1',
    title: 'La Teoría de la Simulación: ¿Vivimos en una Realidad Programada?',
    author: 'Dra. Evelyn Reed',
    rating: 4.8,
    href: '#',
    excerpt: 'Un análisis profundo de los argumentos a favor y en contra de la hipótesis de la simulación, explorando sus implicaciones filosóficas y científicas.',
    tags: ['Filosofía', 'Ciencia', 'Conciencia']
  },
  {
    id: 'article-2',
    title: 'Gobernanza Descentralizada: Modelos para el Futuro',
    author: 'Comunidad de Gobernanza',
    rating: 4.9,
    href: '#',
    excerpt: 'Estudio comparativo de diferentes modelos de Organizaciones Autónomas Descentralizadas (DAOs) y su aplicabilidad en el contexto de las Entidades Federativas.',
    tags: ['Gobernanza', 'Sociedad', 'Política', 'Tecnología']
  },
  {
    id: 'article-3',
    title: 'Permacultura: Diseñando Ecosistemas Sostenibles',
    author: 'Red de Permacultura',
    rating: 4.7,
    href: '#',
    excerpt: 'Una guía práctica para aplicar los principios de la permacultura en tu comunidad, desde jardines urbanos hasta sistemas de gestión de agua.',
    tags: ['Sostenibilidad', 'Comunidad', 'Ecología']
  },
  {
    id: 'article-4',
    title: 'Modelos de Lenguaje Grande (LLMs) y Creatividad',
    author: 'Grupo de Estudio de IA',
    rating: 4.9,
    href: '#',
    excerpt: 'Cómo los LLMs están revolucionando la creatividad y el arte, y las herramientas para empezar a experimentar.',
    tags: ['IA', 'Arte Generativo', 'Tecnología']
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
    comments: 32
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
    comments: 45
  }
];
