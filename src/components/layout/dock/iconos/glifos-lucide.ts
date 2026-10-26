/**
 * Glifos de Lucide que se pueden elegir para un icono (Ola 1025U · V1b).
 *
 * Una lista CURADA y cerrada (no `import * as Lucide`): así el paquete solo lleva estos iconos, el selector
 * del editor tiene un catálogo manejable y un diseño que llegue de fuera no puede pedir «cualquier cosa»
 * (la clave se valida contra esta lista; una desconocida cae al icono propio del item).
 * Los iconos propios del dock (`DOCK_ICON_MAP`) siempre se resuelven aunque no estén aquí.
 */

import type { ComponentType } from "react";
import {
    Activity, Anchor, Antenna, Aperture, Asterisk, Atom, AudioLines, Award, Bell, Bird, Blocks, BookOpen, Bookmark, Bot, Box, Brain, Brush, Bug, Calendar, CalendarClock, Camera, Cast, Cat, Clock, Cloud, Code, Coffee, Coins, Compass, Cpu, Crown, Database, Diamond, Dna, Dog, Droplet, Eye, Feather, FileText, Film, Fingerprint, Fish, Flag, Flame, FlaskConical, Flower2, Gamepad2, Gauge, Gem, Ghost, Gift, Glasses, Globe, GraduationCap, Hammer, Hand, Handshake, Headphones, Heart, HeartPulse, Hexagon, Hourglass, House, Image, Infinity, Key, Lamp, Laptop, Layers, LayoutGrid, Leaf, Library, Lightbulb, Link, Lock, Magnet, Mail, Map, MapPin, Medal, MessageCircle, MessagesSquare, Mic, Microscope, Monitor, Moon, Mountain, Music, Network, Orbit, Origami, Package, Palette, PenLine, Plane, Plug, Puzzle, Rabbit, Radar, Radio, RadioTower, Rainbow, Rocket, Rss, Satellite, Send, Server, Shapes, Shield, ShieldCheck, ShoppingBag, Smartphone, Smile, Snowflake, Sparkles, Sprout, Star, Store, Sun, Swords, Table2, Target, Telescope, Terminal, Thermometer, TreePine, Triangle, Trophy, Turtle, Umbrella, User, Users, Vote, Wallet, Wand2, Waves, Wifi, Wind, Wrench, Zap,
} from "lucide-react";
import { DOCK_FALLBACK_ICON, DOCK_ICON_MAP, type DockIconKey } from "@/components/layout/dock-config";

export type IconoLucide = ComponentType<{ className?: string }>;

/** Clave → icono de los glifos elegibles en el editor. */
export const GLIFOS_LUCIDE: Readonly<Record<string, IconoLucide>> = Object.freeze({
    Activity,
    Anchor,
    Antenna,
    Aperture,
    Asterisk,
    Atom,
    AudioLines,
    Award,
    Bell,
    Bird,
    Blocks,
    BookOpen,
    Bookmark,
    Bot,
    Box,
    Brain,
    Brush,
    Bug,
    Calendar,
    CalendarClock,
    Camera,
    Cast,
    Cat,
    Clock,
    Cloud,
    Code,
    Coffee,
    Coins,
    Compass,
    Cpu,
    Crown,
    Database,
    Diamond,
    Dna,
    Dog,
    Droplet,
    Eye,
    Feather,
    FileText,
    Film,
    Fingerprint,
    Fish,
    Flag,
    Flame,
    FlaskConical,
    Flower2,
    Gamepad2,
    Gauge,
    Gem,
    Ghost,
    Gift,
    Glasses,
    Globe,
    GraduationCap,
    Hammer,
    Hand,
    Handshake,
    Headphones,
    Heart,
    HeartPulse,
    Hexagon,
    Hourglass,
    House,
    Image,
    Infinity,
    Key,
    Lamp,
    Laptop,
    Layers,
    LayoutGrid,
    Leaf,
    Library,
    Lightbulb,
    Link,
    Lock,
    Magnet,
    Mail,
    Map,
    MapPin,
    Medal,
    MessageCircle,
    MessagesSquare,
    Mic,
    Microscope,
    Monitor,
    Moon,
    Mountain,
    Music,
    Network,
    Orbit,
    Origami,
    Package,
    Palette,
    PenLine,
    Plane,
    Plug,
    Puzzle,
    Rabbit,
    Radar,
    Radio,
    RadioTower,
    Rainbow,
    Rocket,
    Rss,
    Satellite,
    Send,
    Server,
    Shapes,
    Shield,
    ShieldCheck,
    ShoppingBag,
    Smartphone,
    Smile,
    Snowflake,
    Sparkles,
    Sprout,
    Star,
    Store,
    Sun,
    Swords,
    Table2,
    Target,
    Telescope,
    Terminal,
    Thermometer,
    TreePine,
    Triangle,
    Trophy,
    Turtle,
    Umbrella,
    User,
    Users,
    Vote,
    Wallet,
    Wand2,
    Waves,
    Wifi,
    Wind,
    Wrench,
    Zap,
});

/** Claves elegibles, en el orden en que se muestran. */
export const CLAVES_GLIFOS: readonly string[] = Object.freeze(Object.keys(GLIFOS_LUCIDE));

function propio(iconKey: string): IconoLucide {
    return DOCK_ICON_MAP[iconKey as DockIconKey] ?? GLIFOS_LUCIDE[iconKey] ?? DOCK_FALLBACK_ICON;
}

/**
 * El componente de Lucide de un glifo. `auto` (o una clave desconocida) = el icono propio del item
 * del dock (`iconKey`).
 */
export function resolverGlifoLucide(clave: string, iconKeyPropio: string): IconoLucide {
    if (clave === "auto") return propio(iconKeyPropio);
    return GLIFOS_LUCIDE[clave] ?? DOCK_ICON_MAP[clave as DockIconKey] ?? propio(iconKeyPropio);
}
