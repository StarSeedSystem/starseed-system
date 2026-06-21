'use client';

import React from 'react';
import {
  Layers, Pyramid, Activity, Orbit, Music, Brain, Zap, Search,
  ChevronDown, ChevronUp, MapPin, Shield, Radio,
  Folder, FileText, Save, Download, Upload, Trash2, Plus,
  CornerUpLeft, CornerUpRight, MoreHorizontal, Edit2, X, Play,
  Network, Globe, ArrowRight, Settings, Pause, ChevronRight, Waves,
  Volume2, Smartphone, Database,
} from 'lucide-react';

export const icons = {
  Layers,
  Pyramid,
  Activity,
  Orbit,
  Music,
  Brain,
  Zap,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  Shield,
  Radio,
  Folder,
  FileText,
  Save,
  Download,
  Upload,
  Trash2,
  Plus,
  CornerUpLeft,
  CornerUpRight,
  MoreHorizontal,
  Edit2,
  X,
  Play,
  Network,
  Globe,
  ArrowRight,
  Settings,
  Pause,
  ChevronRight,
  Waves,
  Volume2,
  Smartphone,
  Database,
};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size = 20, className = '' }) => {
  const IconComponent = icons[name as keyof typeof icons];
  if (!IconComponent) return null;
  return <IconComponent size={size} className={className} />;
};

export default Icon;
