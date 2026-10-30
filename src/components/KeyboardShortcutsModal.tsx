/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Keyboard,
  Undo2,
  Redo2,
  ClipboardPaste,
  Eye,
  Sliders,
  FolderArchive,
  Download,
  Crop,
  PenLine,
  Search,
  Sparkles,
  Command,
  Bookmark,
  RotateCcw,
} from 'lucide-react';

interface ShortcutItem {
  id: string;
  category: 'edit' | 'views' | 'clipboard' | 'batch';
  label: string;
  description: string;
  keys: string[];
  icon: React.ReactNode;
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS: ShortcutItem[] = [
  // History & Canvas Editing
  {
    id: 'undo',
    category: 'edit',
    label: 'Undo Mask Action',
    description: 'Revert the most recent brush stroke, marquee box, or wand detection.',
    keys: ['Ctrl', 'Z'],
    icon: <Undo2 className="w-4 h-4 text-blue-500" />,
  },
  {
    id: 'redo',
    category: 'edit',
    label: 'Redo Mask Action',
    description: 'Re-apply previously reverted mask inpainting adjustments.',
    keys: ['Ctrl', 'Y'],
    icon: <Redo2 className="w-4 h-4 text-indigo-500" />,
  },
  {
    id: 'redo-shift',
    category: 'edit',
    label: 'Redo (Alternative)',
    description: 'Mac and standard desktop shortcut variant for redo.',
    keys: ['Ctrl', 'Shift', 'Z'],
    icon: <Redo2 className="w-4 h-4 text-indigo-500" />,
  },
  {
    id: 'hold-original',
    category: 'edit',
    label: 'Hold to Peek Original',
    description: 'Temporarily display the watermarked source image without releasing position.',
    keys: ['Space', 'Hold'],
    icon: <Eye className="w-4 h-4 text-amber-500" />,
  },

  // Clipboard & Import
  {
    id: 'paste-clipboard',
    category: 'clipboard',
    label: 'Paste from Clipboard',
    description: 'Instantly paste screenshot or image directly into the queue and auto-clean.',
    keys: ['Ctrl', 'V'],
    icon: <ClipboardPaste className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: 'drag-drop',
    category: 'clipboard',
    label: 'Drag & Drop Batch',
    description: 'Drop one or multiple image files anywhere on the browser window.',
    keys: ['Drag & Drop'],
    icon: <Sparkles className="w-4 h-4 text-sky-500" />,
  },

  // Views & Navigation
  {
    id: 'mode-switch',
    category: 'views',
    label: 'Simple 1-Box / Pro Studio Toggle',
    description: 'Switch between the streamlined 1-box auto cleaner and the full 3-column workbench.',
    keys: ['Simple Mode', 'Pro Studio'],
    icon: <Sparkles className="w-4 h-4 text-blue-500" />,
  },
  {
    id: 'escape',
    category: 'views',
    label: 'Close Modals / Overlays',
    description: 'Dismiss open dialogs (Shortcuts, Bulk Crop, Rename Pattern, Mask Reset).',
    keys: ['Escape'],
    icon: <X className="w-4 h-4 text-rose-500" />,
  },
  {
    id: 'help-key',
    category: 'views',
    label: 'Keyboard Shortcuts Help',
    description: 'Toggle this interactive shortcut reference guide from anywhere.',
    keys: ['?'],
    icon: <Keyboard className="w-4 h-4 text-purple-500" />,
  },

  // Batch & Queue Workflows
  {
    id: 'export-presets',
    category: 'batch',
    label: 'Custom Export Presets',
    description: 'Save custom combinations of Optimize Format (WebP/JPEG/PNG) and Quality for quick switching.',
    keys: ['Export Presets'],
    icon: <Bookmark className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: 'export-all',
    category: 'batch',
    label: 'Export All (Direct)',
    description: 'Triggers individual direct downloads for each image, bypassing ZIP compression.',
    keys: ['Export All'],
    icon: <Download className="w-4 h-4 text-blue-600 dark:text-sky-400" />,
  },
  {
    id: 'zip-download',
    category: 'batch',
    label: 'Download ZIP Archive',
    description: 'Bundles all processed images into a single compressed ZIP with metadata scrubbed.',
    keys: ['Download ZIP'],
    icon: <FolderArchive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
  },
  {
    id: 'batch-crop',
    category: 'batch',
    label: 'Bulk Crop Corner Margins',
    description: 'Crops uniform watermark bands or timestamps across all images simultaneously.',
    keys: ['Bulk Crop'],
    icon: <Crop className="w-4 h-4 text-blue-500" />,
  },
  {
    id: 'batch-rename',
    category: 'batch',
    label: 'Pattern Batch Rename',
    description: 'Apply prefixes, suffixes, sequential numbering, and case formatting to files.',
    keys: ['Rename Pattern'],
    icon: <PenLine className="w-4 h-4 text-indigo-500" />,
  },
  {
    id: 'batch-reset-all',
    category: 'batch',
    label: 'Reset All Selected',
    description: 'Clears masks and undo/redo stacks across all selected images in the queue with confirmation.',
    keys: ['Reset All'],
    icon: <RotateCcw className="w-4 h-4 text-rose-500" />,
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Shortcuts' },
  { id: 'edit', label: 'Editing & History' },
  { id: 'clipboard', label: 'Import & Clipboard' },
  { id: 'views', label: 'Views & Modals' },
  { id: 'batch', label: 'Batch Workflows' },
] as const;

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredShortcuts = SHORTCUTS.filter((item) => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesCategory;
    const matchesQuery =
      item.label.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.keys.some((k) => k.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20 shrink-0">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="shortcuts-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"
              >
                <span>Keyboard Shortcuts & Quick Actions</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Speed up your watermark removal workflow with desktop hotkeys
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter bar & Search */}
        <div className="p-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-900/40 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts or actions (e.g. paste, undo, export)..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 sm:p-6 max-h-[55vh] overflow-y-auto space-y-2.5">
          {filteredShortcuts.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              {filteredShortcuts.map((item) => (
                <div
                  key={item.id}
                  className="p-3 sm:px-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  {/* Keycaps */}
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, idx) => (
                      <React.Fragment key={idx}>
                        <kbd className="px-2 py-1 text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md shadow-2xs">
                          {k}
                        </kbd>
                        {idx < item.keys.length - 1 && (
                          <span className="text-xs text-slate-400 font-semibold">+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400">
              No shortcuts found matching &quot;{searchQuery}&quot;.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-xs">
          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Command className="w-3.5 h-3.5 text-slate-400" />
            <span>Works in Chrome, Edge, Safari, and Firefox</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
