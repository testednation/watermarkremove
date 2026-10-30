import React, { useState, useEffect, useMemo } from 'react';
import {
  Bookmark,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  Sparkles,
  Sliders,
  X,
  ShieldCheck,
} from 'lucide-react';
import {
  ExportPreset,
  DEFAULT_EXPORT_PRESETS,
  loadCustomExportPresets,
  saveCustomExportPresets,
} from '../lib/exportPresets';
import { OptimizeFormat } from '../lib/optimizer';

interface ExportPresetsDropdownProps {
  format: OptimizeFormat;
  quality: number;
  onFormatChange: (format: OptimizeFormat) => void;
  onQualityChange: (quality: number) => void;
}

export const ExportPresetsDropdown: React.FC<ExportPresetsDropdownProps> = ({
  format,
  quality,
  onFormatChange,
  onQualityChange,
}) => {
  const [customPresets, setCustomPresets] = useState<ExportPreset[]>(() =>
    loadCustomExportPresets()
  );
  const [isSavingModalOpen, setIsSavingModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Combine default and custom presets
  const allPresets = useMemo(() => {
    return [...DEFAULT_EXPORT_PRESETS, ...customPresets];
  }, [customPresets]);

  // Determine which preset matches current format & quality (rounded to 2 decimal places)
  const currentMatchingPreset = useMemo(() => {
    const roundedQ = Math.round(quality * 100) / 100;
    return allPresets.find(
      (p) =>
        p.format === format &&
        (format === 'png' || Math.abs(Math.round(p.quality * 100) / 100 - roundedQ) < 0.015)
    );
  }, [allPresets, format, quality]);

  const selectedPresetId = currentMatchingPreset ? currentMatchingPreset.id : 'custom-modified';

  // Handler for dropdown selection
  const handlePresetSelect = (presetId: string) => {
    if (presetId === '__create_new__') {
      const defaultName = `${format.toUpperCase()} ${
        format === 'png' ? 'Lossless' : `${Math.round(quality * 100)}%`
      }`;
      setNewPresetName(defaultName);
      setSaveError(null);
      setIsSavingModalOpen(true);
      return;
    }

    const found = allPresets.find((p) => p.id === presetId);
    if (found) {
      onFormatChange(found.format);
      onQualityChange(found.quality);
    }
  };

  // Save current format & quality combination as a custom preset
  const handleSavePreset = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newPresetName.trim();
    if (!trimmed) {
      setSaveError('Please enter a preset name.');
      return;
    }

    if (allPresets.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      setSaveError('A preset with this name already exists.');
      return;
    }

    const newPreset: ExportPreset = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      format,
      quality: format === 'png' ? 1.0 : Math.round(quality * 100) / 100,
      isCustom: true,
      description: `Custom ${format.toUpperCase()} at ${
        format === 'png' ? '100% Lossless' : `${Math.round(quality * 100)}% quality`
      }`,
    };

    const nextCustom = [...customPresets, newPreset];
    setCustomPresets(nextCustom);
    saveCustomExportPresets(nextCustom);
    setIsSavingModalOpen(false);
    setNewPresetName('');
    setSaveError(null);
  };

  // Delete a custom preset
  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextCustom = customPresets.filter((p) => p.id !== id);
    setCustomPresets(nextCustom);
    saveCustomExportPresets(nextCustom);
  };

  return (
    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2.5 text-xs">
      {/* Export Presets Dropdown Header */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <label
            htmlFor="export-presets-select"
            className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200"
          >
            <Bookmark className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
            <span>Export Presets</span>
          </label>

          <button
            type="button"
            onClick={() => {
              const defaultName = `${format.toUpperCase()} ${
                format === 'png' ? 'Lossless' : `${Math.round(quality * 100)}%`
              }`;
              setNewPresetName(defaultName);
              setSaveError(null);
              setIsSavingModalOpen(true);
            }}
            className="text-[10px] font-semibold text-blue-600 dark:text-sky-400 hover:text-blue-700 dark:hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40"
            title="Save current format and quality combination as a custom preset"
          >
            <Plus className="w-3 h-3" />
            <span>Save Custom Preset</span>
          </button>
        </div>

        {/* Dropdown Select with custom and default preset groupings */}
        <div className="relative">
          <select
            id="export-presets-select"
            value={selectedPresetId}
            onChange={(e) => handlePresetSelect(e.target.value)}
            className="w-full text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
          >
            {selectedPresetId === 'custom-modified' && (
              <option value="custom-modified">
                * Custom Combination ({format.toUpperCase()}{' '}
                {format === 'png' ? 'Lossless' : `${Math.round(quality * 100)}%`})
              </option>
            )}

            <optgroup label="Default Presets">
              {DEFAULT_EXPORT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>

            {customPresets.length > 0 && (
              <optgroup label="My Custom Presets">
                {customPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    ★ {p.name} ({p.format.toUpperCase()}{' '}
                    {p.format === 'png' ? 'Lossless' : `${Math.round(p.quality * 100)}%`})
                  </option>
                ))}
              </optgroup>
            )}

            <optgroup label="Actions">
              <option value="__create_new__">+ Save Current Settings as Preset...</option>
            </optgroup>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Active Preset Description & Custom Delete button */}
        {currentMatchingPreset && (
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5">
            <span className="truncate pr-2">{currentMatchingPreset.description}</span>
            {currentMatchingPreset.isCustom && (
              <button
                type="button"
                onClick={(e) => handleDeleteCustomPreset(currentMatchingPreset.id, e)}
                className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0 cursor-pointer flex items-center gap-0.5"
                title={`Delete custom preset "${currentMatchingPreset.name}"`}
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Format Selection Buttons */}
      <div className="flex items-center justify-between text-[11px] pt-1">
        <span className="text-slate-600 dark:text-slate-400 font-medium">Optimize Format:</span>
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'webp', label: 'WebP', desc: '-65% size · Modern web' },
              { id: 'jpeg', label: 'JPEG', desc: 'Universal compatibility' },
              { id: 'png', label: 'Clean PNG', desc: 'Lossless' },
            ] as const
          ).map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              onClick={() => onFormatChange(fmt.id)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                format === fmt.id
                  ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80'
              }`}
              title={fmt.desc}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quality Setting Slider (for WebP and JPEG) */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-600 dark:text-slate-400 font-medium">Quality:</span>
          {format === 'png' ? (
            <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              100% (Lossless Bit-Perfect)
            </span>
          ) : (
            <span className="font-mono text-[10px] font-bold text-slate-900 dark:text-slate-100">
              {Math.round(quality * 100)}%
            </span>
          )}
        </div>

        {format !== 'png' ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-mono">40%</span>
            <input
              type="range"
              min="0.4"
              max="1.0"
              step="0.02"
              value={quality}
              onChange={(e) => onQualityChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <span className="text-[10px] text-slate-400 font-mono">100%</span>
          </div>
        ) : (
          <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/50 p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>PNG format preserves 100% raw pixel fidelity without lossy compression.</span>
          </div>
        )}
      </div>

      {/* Modal: Save Custom Export Preset */}
      {isSavingModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsSavingModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-preset-title"
        >
          <div
            className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                <h3 id="save-preset-title" className="text-sm font-bold text-slate-900 dark:text-white">
                  Save Custom Export Preset
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSavingModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePreset} className="space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5 text-xs">
                <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                  Preset Configuration:
                </div>
                <div className="flex items-center justify-between font-mono font-semibold text-slate-800 dark:text-slate-200">
                  <span>Format: {format.toUpperCase()}</span>
                  <span>
                    Quality: {format === 'png' ? '100% (Lossless)' : `${Math.round(quality * 100)}%`}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Preset Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newPresetName}
                  onChange={(e) => {
                    setNewPresetName(e.target.value);
                    setSaveError(null);
                  }}
                  placeholder="e.g., E-Commerce WebP 90% or High-Res JPEG"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {saveError && (
                  <p className="text-[11px] text-red-500 dark:text-red-400 font-medium">
                    {saveError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSavingModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Preset</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
