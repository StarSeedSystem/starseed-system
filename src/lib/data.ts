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


export const notifications = [];

export const feedItemComments: Comment[] = [];

export const feedItems = [];

export const comments: Comment[] = [];

const politicalComments: Comment[] = [];

export const politicalProposals = [];

export const themes = [
    { id: 'theme-ia', name: 'IA', description: 'Cubre todos los aspectos de la Inteligencia Artificial, desde algoritmos y modelos hasta sus implicaciones éticas y sociales.' },
    { id: 'theme-sostenibilidad', name: 'Sostenibilidad', description: 'Principios y prácticas para crear sistemas que perduren y se regeneren, abarcando ecología, economía y sociedad.' },
    { id: 'theme-gobernanza', name: 'Gobernanza', description: 'Modelos y teorías sobre cómo los grupos de personas se organizan y toman decisiones colectivas.' },
    { id: 'theme-consciencia', name: 'Conciencia', description: 'La exploración de la naturaleza de la conciencia, desde perspectivas científicas, filosóficas y espirituales.' },
    { id: 'theme-fisica', name: 'Física Cuántica', description: 'El estudio del comportamiento de la materia y la energía a nivel atómico y subatómico.' },
    { id: 'theme-etica', name: 'Ética', description: 'El estudio de los principios morales que guían el comportamiento humano y el diseño de sistemas justos.' },
    { id: 'theme-tecnologia', name: 'Tecnología', description: 'Herramientas y técnicas utilizadas para extender las capacidades humanas y transformar el mundo.' },
]

export const courses = [];

const articleComments: Comment[] = [];


export const articles = [];

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


export const culturalPosts = [];

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

export const conversations: ConversationFull[] = [];

export const files = [];

export type Theme = (typeof themes)[0];
export type Category = (typeof categories)[0];
export type Course = (typeof courses)[0];
export type Article = (typeof articles)[0];
// export type ConversationFull = (typeof conversations)[0];
// export type MessageFull = (typeof conversations)[0]['messages'][0];

export const executiveProjects = [];

export const judicialCases = [];

// ---- Hub Data ----
export const studyGroups = [];

export const communityEvents = [];

export const userBadges = [
    { id: 'badge-1', name: 'Ciudadano Verificado', icon: '✓', color: 'blue', description: 'Identidad verificada en la red StarSeed' },
    { id: 'badge-2', name: 'Mediador Certificado', icon: '⚖', color: 'purple', description: 'Certificado para facilitar procesos judiciales restaurativos' },
    { id: 'badge-3', name: 'Pionero StarSeed', icon: '⭐', color: 'gold', description: 'Miembro fundador de la red (primeros 1000 usuarios)' },
    { id: 'badge-4', name: 'Experto en Gobernanza', icon: '🏛', color: 'green', description: 'Ha contribuido significativamente al sistema legislativo' },
    { id: 'badge-5', name: 'Creador Cultural', icon: '🎨', color: 'pink', description: 'Ha publicado obras reconocidas por la comunidad' },
];

export const politicalParties = [];
