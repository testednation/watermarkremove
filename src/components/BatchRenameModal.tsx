/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  PenLine,
  Hash,
  Sparkles,
  ArrowRight,
  Check,
  RotateCcw,
  FileText,
  Sliders,
  Type,
} from 'lucide-react';
import {
  NamingPatternConfig,
  DEFAULT_NAMING_CONFIG,
  NAMING_PRESETS,
  NumberPosition,
  CaseFormat,
  generateBatchRenamePreview,
} from '../lib/namingPattern';

interface QueueItemRef {
  id: string;
  name: string;
}

interface BatchRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: QueueItemRef[];
  onApplyRename: (renamedMap: Map<string, string>) => void;
}

export function BatchRenameModal({
  isOpen,
  onClose,
  queue,
  onApplyRename,
}: BatchRenameModalProps) {
  const [config, setConfig] = useState<NamingPatternConfig>(DEFAULT_NAMING_CONFIG);
  const [activePresetId, setActivePresetId] = useState<string>('suffix-cleaned');

  // Close on Escape key
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

  // Compute live rename preview whenever config or queue changes
  const previewItems = useMemo(() => {
    return generateBatchRenamePreview(queue, config);
  }, [queue, config]);

  const changedCount = useMemo(() => {
    return previewItems.filter((item) => item.hasChanged).length;
  }, [previewItems]);

  const handleApplyPreset = (presetId: string) => {
    const preset = NAMING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(presetId);
    setConfig((prev) => ({
      ...prev,
      ...preset.config,
    }));
  };

  const handleResetToDefault = () => {
    setConfig(DEFAULT_NAMING_CONFIG);
    setActivePresetId('suffix-cleaned');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const map = new Map<string, string>();
    for (const item of previewItems) {
      map.set(item.id, item.newName);
    }
    onApplyRename(map);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-rename-title"
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20 shrink-0">
              <PenLine className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="batch-rename-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"
              >
                <span>Batch Rename Queue</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                  {queue.length} {queue.length === 1 ? 'image' : 'images'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Define a consistent pattern with prefixes, sequential numbering, or suffixes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[calc(85vh-130px)] overflow-y-auto">
          {/* Quick Preset Templates */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Quick Preset Patterns</span>
              </label>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[11px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer transition-colors"
                title="Reset to default pattern"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {NAMING_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pattern Builder Configuration Grid */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-4">
            {/* Row 1: Prefix & Suffix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Prefix (prepended to start)
                </label>
                <input
                  type="text"
                  value={config.prefix}
                  onChange={(e) => {
                    setActivePresetId('');
                    setConfig((prev) => ({ ...prev, prefix: e.target.value }));
                  }}
                  placeholder="e.g. clean_ or watermark_free_"
                  className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Suffix (appended before extension)
                </label>
                <input
                  type="text"
                  value={config.suffix}
                  onChange={(e) => {
                    setActivePresetId('');
                    setConfig((prev) => ({ ...prev, suffix: e.target.value }));
                  }}
                  placeholder="e.g. _cleaned or _hq"
                  className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Row 2: Base Name Source */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Base Name Source
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActivePresetId('');
                    setConfig((prev) => ({ ...prev, baseSource: 'original' }));
                  }}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                    config.baseSource === 'original'
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs">
                    <div className="font-semibold">Keep Original Name</div>
                    <div className="text-[11px] opacity-80">Preserves individual file names</div>
                  </div>
                  {config.baseSource === 'original' && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivePresetId('');
                    setConfig((prev) => ({ ...prev, baseSource: 'custom' }));
                  }}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                    config.baseSource === 'custom'
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs">
                    <div className="font-semibold">Custom Base Name</div>
                    <div className="text-[11px] opacity-80">Replaces all names with custom text</div>
                  </div>
                  {config.baseSource === 'custom' && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                </button>
              </div>

              {config.baseSource === 'custom' && (
                <div className="pt-1.5">
                  <input
                    type="text"
                    value={config.customBase}
                    onChange={(e) => {
                      setActivePresetId('');
                      setConfig((prev) => ({ ...prev, customBase: e.target.value }));
                    }}
                    placeholder="Enter common base name (e.g. Vacation_Photo)"
                    className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* Row 3: Sequential Numbering Options */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.enableNumbering}
                    onChange={(e) => {
                      setActivePresetId('');
                      setConfig((prev) => ({ ...prev, enableNumbering: e.target.checked }));
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Enable Sequential Numbering</span>
                  </div>
                </label>

                {config.enableNumbering && (
                  <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-medium">
                    {String(config.startNumber).padStart(config.paddingDigits, '0')} ...{' '}
                    {String(config.startNumber + Math.max(0, queue.length - 1)).padStart(
                      config.paddingDigits,
                      '0'
                    )}
                  </span>
                )}
              </div>

              {config.enableNumbering && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Start Number
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      value={config.startNumber}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setConfig((prev) => ({
                          ...prev,
                          startNumber: isNaN(val) ? 1 : Math.max(0, val),
                        }));
                      }}
                      className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Padding (Digits)
                    </label>
                    <select
                      value={config.paddingDigits}
                      onChange={(e) => {
                        setConfig((prev) => ({
                          ...prev,
                          paddingDigits: parseInt(e.target.value, 10) || 1,
                        }));
                      }}
                      className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value={1}>1 (1, 2, 3)</option>
                      <option value={2}>01 (2 digits)</option>
                      <option value={3}>001 (3 digits)</option>
                      <option value={4}>0001 (4 digits)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Position
                    </label>
                    <select
                      value={config.numberPosition}
                      onChange={(e) => {
                        setConfig((prev) => ({
                          ...prev,
                          numberPosition: e.target.value as NumberPosition,
                        }));
                      }}
                      className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="suffix">End (name_01)</option>
                      <option value="prefix">Start (01_name)</option>
                      <option value="replace">Only Number (01)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Separator
                    </label>
                    <select
                      value={config.separator}
                      onChange={(e) => {
                        setConfig((prev) => ({ ...prev, separator: e.target.value }));
                      }}
                      className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="_">_ (Underscore)</option>
                      <option value="-">- (Hyphen)</option>
                      <option value=".">. (Dot)</option>
                      <option value=" ">[Space]</option>
                      <option value="">None</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Row 4: Letter Case Formatting */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-indigo-500" />
                <span>Text Case:</span>
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'preserve', label: 'As-Is' },
                    { id: 'lowercase', label: 'lowercase' },
                    { id: 'uppercase', label: 'UPPERCASE' },
                    { id: 'kebab', label: 'kebab-case' },
                    { id: 'snake', label: 'snake_case' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setActivePresetId('');
                      setConfig((prev) => ({ ...prev, caseFormat: c.id as CaseFormat }));
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      config.caseFormat === c.id
                        ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Real-Time Live Preview Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                <span>Live Pattern Preview</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {changedCount} of {queue.length} names will change
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden">
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800/80 text-xs">
                {previewItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2.5 flex items-center justify-between gap-3 hover:bg-white dark:hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono text-[10px] text-slate-400 w-4 text-right shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 truncate max-w-[160px] sm:max-w-[200px]" title={item.originalName}>
                        {item.originalName}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span
                        className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 truncate"
                        title={item.newName}
                      >
                        {item.newName}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                        item.hasChanged
                          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-medium'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {item.hasChanged ? 'Updated' : 'Unchanged'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Files can still be manually edited in the queue list at any time.
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Pattern ({queue.length})</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
