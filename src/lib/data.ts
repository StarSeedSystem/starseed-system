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
]
