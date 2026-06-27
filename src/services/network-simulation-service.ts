import { v4 as uuidv4 } from "uuid";

// --- Types ---

export interface User {
    id: string;
    name: string;
    handle: string;
    avatar: string;
    verified?: boolean;
}

export interface FileAttachment {
    id: string;
    name: string;
    type: "pdf" | "image" | "doc" | "video" | "link";
    size: string;
    url: string;
}

export interface Comment {
    id: string;
    postId: string;
    author: User;
    content: string;
    attachments: FileAttachment[];
    createdAt: string;
    likes: number;
}

export interface Post {
    id: string;
    author: User;
    content: string;
    media: string[]; // URLs for 3D Carousel
    type: "text" | "image" | "video" | "mixed";
    likes: number;
    commentsCount: number;
    shares: number;
    createdAt: string;
    likedByMe: boolean;
    tags: string[];
}

// --- Mock Data ---

// Identidad local neutra para contenido compuesto por el usuario en esta sesión.
// Sin datos personales de ejemplo: el nombre real se resuelve en la capa de UI
// a partir de la sesión soberana (useAccount).
const CURRENT_USER: User = {
    id: "user-current",
    name: "Tú",
    handle: "",
    avatar: "",
};

// Sin usuarios de ejemplo.
const MOCK_USERS: User[] = [];

// Sin publicaciones de ejemplo: el feed inicia vacío (estado vacío real).
const INITIAL_POSTS: Post[] = [];

// Sin comentarios de ejemplo.
const INITIAL_COMMENTS: Record<string, Comment[]> = {};

// --- Service ---

class NetworkSimulationService {
    private posts: Post[] = [...INITIAL_POSTS];
    private comments: Record<string, Comment[]> = { ...INITIAL_COMMENTS };

    // Simulate network delay
    private async delay(min = 300, max = 800) {
        const ms = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getFeed(): Promise<Post[]> {
        await this.delay();
        return [...this.posts];
    }

    async getComments(postId: string): Promise<Comment[]> {
        await this.delay(200, 500);
        return this.comments[postId] || [];
    }

    async createPost(content: string, media: string[] = []): Promise<Post> {
        await this.delay(800, 1500);
        const newPost: Post = {
            id: uuidv4(),
            author: CURRENT_USER,
            content,
            media,
            type: media.length > 0 ? "mixed" : "text",
            likes: 0,
            commentsCount: 0,
            shares: 0,
            createdAt: new Date().toISOString(),
            likedByMe: false,
            tags: []
        };
        this.posts.unshift(newPost);
        return newPost;
    }

    async addComment(postId: string, content: string, attachments: FileAttachment[] = []): Promise<Comment> {
        await this.delay(400, 800);
        const newComment: Comment = {
            id: uuidv4(),
            postId,
            author: CURRENT_USER,
            content,
            attachments,
            createdAt: new Date().toISOString(),
            likes: 0
        };

        if (!this.comments[postId]) {
            this.comments[postId] = [];
        }
        this.comments[postId].push(newComment);

        // Update post comment count
        const post = this.posts.find(p => p.id === postId);
        if (post) post.commentsCount++;

        return newComment;
    }

    async likePost(postId: string): Promise<boolean> {
        await this.delay(100, 300);
        const post = this.posts.find(p => p.id === postId);
        if (post) {
            post.likedByMe = !post.likedByMe;
            post.likes += post.likedByMe ? 1 : -1;
            return true;
        }
        return false;
    }

    // Simulates an upload process
    async uploadFile(file: File): Promise<FileAttachment> {
        await this.delay(1000, 3000); // Longer delay for "upload"
        return {
            id: uuidv4(),
            name: file.name,
            type: file.type.includes("pdf") ? "pdf" : "image", // Simple mock type logic
            size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            url: URL.createObjectURL(file) // Mock URL
        };
    }
}

export const networkService = new NetworkSimulationService();
