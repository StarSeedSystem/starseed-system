export const notifications = [
  {
    id: '1',
    type: 'new_feature',
    title: 'AI App Generator Launched!',
    description: 'Create functional apps from a simple text description. Try it now in the "Apps" section.',
    timestamp: '15m ago',
    read: false,
  },
  {
    id: '2',
    type: 'mention',
    title: 'You were mentioned in "Q4 Planning"',
    description: '@you, can you please review the latest updates?',
    timestamp: '1h ago',
    read: false,
  },
  {
    id: '3',
    type: 'system',
    title: 'System update complete',
    description: 'Our systems have been upgraded to the latest version for improved performance.',
    timestamp: '3h ago',
    read: true,
  },
  {
    id: '4',
    type: 'new_feature',
    title: 'Introducing Smart Filters',
    description: 'Your feed is now smarter. We will show you what matters most.',
    timestamp: '1d ago',
    read: true,
  },
  {
    id: '5',
    type: 'mention',
    title: 'Feedback requested on "New UI Mockups"',
    description: 'Hey @you, what do you think of the new design direction?',
    timestamp: '2d ago',
    read: true,
  },
];

export const feedItems = [
    {
        id: 'feed-1',
        author: 'Alex Duran',
        avatar: 'https://placehold.co/100x100.png',
        handle: '@alex',
        content: 'Just used the new AI App Generator to build a quick inventory tracker for my side project. Took literally 5 minutes. This is a game-changer for rapid prototyping! 🚀 #StarWeaver #AI',
        timestamp: '2h ago',
        likes: 125,
        comments: 12,
        dataAiHint: 'man coding',
    },
    {
        id: 'feed-2',
        author: 'Samantha Lee',
        avatar: 'https://placehold.co/100x100.png',
        content: 'The notification summarizer is pure genius. My inbox was a mess, and now I get a clean, concise summary every morning. Finally, inbox zero is within reach!',
        handle: '@samlee',
        timestamp: '1d ago',
        likes: 340,
        comments: 45,
        dataAiHint: 'woman smiling',
    },
    {
        id: 'feed-3',
        author: 'Project Stardust',
        avatar: 'https://placehold.co/100x100.png',
        handle: '@stardust',
        content: 'Announcing Project Constellation: Our next-gen data visualization suite. We\'re leveraging Star Weaver\'s core to create interactive, real-time dashboards. More details coming soon!',
        timestamp: '3d ago',
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
        timestamp: '3h ago',
        content: 'This is a fantastic starting point! I especially like the AI-powered features. Have you considered adding a way to chain AI actions together?',
        dataAiHint: 'woman thinking',
        replies: [
            {
                id: 'reply-1',
                author: 'Admin',
                avatar: 'https://placehold.co/100x100.png',
                timestamp: '2h ago',
                content: 'Great suggestion! A visual flow builder for AI services is on our roadmap for Q3. Thanks for the feedback!',
                dataAiHint: 'robot thinking',
            }
        ]
    },
    {
        id: 'comment-2',
        author: 'Carlos',
        avatar: 'https://placehold.co/100x100.png',
        timestamp: '1d ago',
        content: 'The enriched commenting system is a huge improvement. Being able to embed rich content directly in replies makes discussions so much more productive.',
        dataAiHint: 'man collaborating',
        replies: []
    }
]
