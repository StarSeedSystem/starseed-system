'use client';

// ════════════════════════════════════════════════════════════════
// FileExplorer (portado) — Guardar / Cargar presets en la Biblioteca
// ----------------------------------------------------------------
// La app original navegaba un árbol de folders. En el StarSeed OS los
// presets viven como recursos planos en la Biblioteca soberana, así que
// este explorador se simplifica a una LISTA PLANA de presets (la
// funcionalidad central: guardar con nombre, cargar, mezclar, renombrar,
// borrar). Se monta sobre document.body con z alto para superponerse a
// la ventana del OS (z-[120]). Conserva la estética cristal.
// ════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { PresetContent } from '../types';
import { useFileSystem } from '../hooks/useFileSystem';
import Icon from './Icon';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Props {
  mode: 'save' | 'load';
  onFileSelect: (content: PresetContent, mix?: boolean) => void;
  onClose: () => void;
  fs: ReturnType<typeof useFileSystem>;
  currentConfig?: PresetContent; // For saving
}

const FileExplorer: React.FC<Props> = ({ mode, onFileSelect, onClose, fs, currentConfig }) => {
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveFileName, setSaveFileName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const presets = fs.presets;

  const handleSave = () => {
    if (saveFileName.trim() && currentConfig) {
      fs.savePreset(saveFileName.trim(), currentConfig);
      onClose();
    }
  };

  // Orden alfabético por nombre.
  const sortedPresets = [...presets].sort((a, b) => a.name.localeCompare(b.name));

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 sm:p-6 animate-fade-in">
      <div className="w-full max-w-5xl bg-black/60 border border-cyan-500/20 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.9),inset_0_0_30px_rgba(34,211,238,0.05)] flex flex-col h-[90vh] sm:h-[85vh] overflow-hidden relative backdrop-blur-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-pink-500/10 pointer-events-none"></div>
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/40 relative z-10">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl border ${mode === 'save' ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400 shadow-[inset_0_0_15px_rgba(34,211,238,0.2)]' : 'bg-purple-950/40 border-purple-500/30 text-purple-400 shadow-[inset_0_0_15px_rgba(168,85,247,0.2)]'}`}>
              <Icon name={mode === 'save' ? 'Save' : 'Folder'} size={28} className="drop-shadow-[0_0_8px_currentColor]" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {mode === 'save' ? 'Guardar Preset' : 'Cargar Preset'}
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-200/60 mt-1">Biblioteca Soberana StarSeed</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer">
            <Icon name="X" size={24} />
          </button>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-transparent relative z-0 custom-scrollbar">
          {sortedPresets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <div className="p-6 rounded-full bg-white/5 border border-white/10 mb-6 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]">
                <Icon name="Folder" size={48} className="opacity-20" />
              </div>
              <p className="text-sm font-medium tracking-widest uppercase opacity-50">
                {mode === 'save' ? 'Aún no hay presets guardados' : 'Biblioteca vacía'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {sortedPresets.map((node) => (
                <div
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  onDoubleClick={() => {
                    onFileSelect(node.content, false);
                    onClose();
                  }}
                  className={`
                    group relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col items-center text-center gap-4
                    ${selectedId === node.id
                      ? 'bg-cyan-950/40 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.15),inset_0_0_15px_rgba(34,211,238,0.1)] -translate-y-1'
                      : 'bg-black/40 border-white/10 hover:bg-white/5 hover:border-white/20 hover:shadow-[0_5px_15px_rgba(0,0,0,0.5)] hover:-translate-y-0.5'}
                  `}
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 border bg-purple-950/30 text-purple-400 border-purple-500/20 shadow-[inset_0_0_15px_rgba(168,85,247,0.1)] group-hover:shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                    <Icon name="FileText" size={28} className="drop-shadow-[0_0_5px_currentColor]" />
                  </div>

                  {editingNodeId === node.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingName.trim()) fs.renamePreset(node.id, editingName.trim());
                          setEditingNodeId(null);
                        } else if (e.key === 'Escape') {
                          setEditingNodeId(null);
                        }
                      }}
                      onBlur={() => {
                        if (editingName.trim()) fs.renamePreset(node.id, editingName.trim());
                        setEditingNodeId(null);
                      }}
                      className="w-full bg-black/80 border border-cyan-500/50 text-white text-xs font-medium text-center rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className={`text-xs font-medium break-words w-full line-clamp-2 leading-relaxed transition-colors ${selectedId === node.id ? 'text-cyan-100' : 'text-slate-300 group-hover:text-white'}`}>
                      {node.name}
                    </span>
                  )}

                  {/* Hover Actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-1 bg-black/60 backdrop-blur-md rounded-lg p-1 border border-white/10 shadow-lg">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNodeId(node.id);
                        setEditingName(node.name);
                      }}
                      className="p-1.5 bg-black/50 hover:bg-cyan-500/50 rounded-md text-white backdrop-blur-sm transition-colors cursor-pointer"
                      title="Renombrar"
                    >
                      <Icon name="Edit2" size={12} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await confirm({ title: "Borrar preset", description: "¿Borrar este preset?", destructive: true })) {
                          fs.deletePreset(node.id);
                        }
                      }}
                      className="p-1.5 bg-black/50 hover:bg-red-500/50 rounded-md text-white backdrop-blur-sm transition-colors cursor-pointer"
                      title="Eliminar"
                    >
                      <Icon name="Trash2" size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/10 bg-black/60 backdrop-blur-xl flex flex-col md:flex-row gap-6 items-center justify-between relative z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hidden sm:block">
            {selectedId ? 'Preset seleccionado' : 'Selecciona un preset'}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            {mode === 'save' && (
              <div className="flex-1 sm:w-72 relative">
                <input
                  type="text"
                  placeholder="Nombre del preset..."
                  value={saveFileName}
                  onChange={(e) => setSaveFileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  className="w-full bg-black/60 border border-cyan-500/50 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(34,211,238,0.4)] focus:outline-none transition-all placeholder:text-slate-500"
                />
                <div className="absolute right-4 top-3.5 text-cyan-500/50 pointer-events-none text-xs font-bold font-mono">.preset</div>
              </div>
            )}

            {mode === 'load' && (
              <button
                onClick={() => {
                  if (selectedId) {
                    const node = sortedPresets.find((n) => n.id === selectedId);
                    if (node) {
                      onFileSelect(node.content, true);
                      onClose();
                    }
                  }
                }}
                disabled={!selectedId}
                className={`
                  w-full sm:w-auto px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all duration-300 border
                  ${selectedId
                    ? 'bg-purple-950/40 text-purple-200 border-purple-500/50 hover:bg-purple-900/60 hover:border-purple-400 hover:shadow-[0_0_20px_rgba(168,85,247,0.4),inset_0_0_10px_rgba(168,85,247,0.2)] hover:-translate-y-0.5 cursor-pointer'
                    : 'bg-white/5 text-slate-500 border-white/10 cursor-not-allowed'}
                `}
              >
                Mezclar
              </button>
            )}

            <button
              onClick={() => {
                if (mode === 'save') handleSave();
                else if (selectedId) {
                  const node = sortedPresets.find((n) => n.id === selectedId);
                  if (node) {
                    onFileSelect(node.content, false);
                    onClose();
                  }
                }
              }}
              disabled={mode === 'save' ? !saveFileName : !selectedId}
              className={`
                w-full sm:w-auto px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all duration-300 border
                ${(mode === 'save' ? saveFileName : selectedId)
                  ? 'bg-cyan-950/40 text-cyan-200 border-cyan-500/50 hover:bg-cyan-900/60 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.4),inset_0_0_10px_rgba(34,211,238,0.2)] hover:-translate-y-0.5 cursor-pointer'
                  : 'bg-white/5 text-slate-500 border-white/10 cursor-not-allowed'}
              `}
            >
              {mode === 'save' ? 'Guardar' : 'Cargar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FileExplorer;
