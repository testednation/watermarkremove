/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Crop,
  X,
  Sparkles,
  Layers,
  SlidersHorizontal,
  Maximize2,
  Check,
  AlertCircle,
  Loader2,
  CornerDownRight,
  ShieldAlert,
} from 'lucide-react';
import {
  CropMode,
  AspectRatioPreset,
  CropAnchor,
  CropParameters,
  CropRect,
  calculateCropRect,
  WATERMARK_CROP_PRESETS,
  ASPECT_RATIO_VALUES,
} from '../lib/cropEngine';

interface BulkCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeItem: {
    id: string;
    name: string;
    width: number;
    height: number;
    originalUrl: string;
    zones: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
    }>;
  } | null;
  queueCount: number;
  isApplying: boolean;
  onApplyCrop: (
    params: CropParameters,
    scope: 'all' | 'active',
    recleanAfterCrop: boolean
  ) => Promise<void>;
}

export function BulkCropModal({
  isOpen,
  onClose,
  activeItem,
  queueCount,
  isApplying,
  onApplyCrop,
}: BulkCropModalProps) {
  const [mode, setMode] = useState<CropMode>('margins');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>('16:9');
  const [anchor, setAnchor] = useState<CropAnchor>('top-center');
  const [marginTop, setMarginTop] = useState<number>(0);
  const [marginBottom, setMarginBottom] = useState<number>(8);
  const [marginLeft, setMarginLeft] = useState<number>(0);
  const [marginRight, setMarginRight] = useState<number>(0);
  const [boxX, setBoxX] = useState<number>(0);
  const [boxY, setBoxY] = useState<number>(0);
  const [boxWidth, setBoxWidth] = useState<number>(100);
  const [boxHeight, setBoxHeight] = useState<number>(90);

  const [scope, setScope] = useState<'all' | 'active'>('all');
  const [recleanAfterCrop, setRecleanAfterCrop] = useState<boolean>(true);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isApplying, onClose]);

  const cropParams: CropParameters = useMemo(() => {
    return {
      mode,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      aspectRatio,
      anchor,
      boxX,
      boxY,
      boxWidth,
      boxHeight,
    };
  }, [mode, marginTop, marginBottom, marginLeft, marginRight, aspectRatio, anchor, boxX, boxY, boxWidth, boxHeight]);

  const cropRect: CropRect = useMemo(() => {
    if (!activeItem) return { x: 0, y: 0, width: 100, height: 100 };
    return calculateCropRect(activeItem.width, activeItem.height, cropParams);
  }, [activeItem, cropParams]);

  // Calculate percentage of area cropped
  const areaTrimmedPercent = useMemo(() => {
    if (!activeItem) return 0;
    const origArea = activeItem.width * activeItem.height;
    const cropArea = cropRect.width * cropRect.height;
    return Math.max(0, Math.min(100, Math.round(((origArea - cropArea) / origArea) * 100)));
  }, [activeItem, cropRect]);

  // Check if detected watermark zones on active image are excluded by the crop box
  const watermarkExclusionStatus = useMemo(() => {
    if (!activeItem || activeItem.zones.length === 0) return null;
    let excludedCount = 0;
    for (const z of activeItem.zones) {
      const zRight = z.x + z.width;
      const zBottom = z.y + z.height;
      const cropRight = cropRect.x + cropRect.width;
      const cropBottom = cropRect.y + cropRect.height;

      // Check if zone is fully outside the crop box
      const isOutside =
        zRight <= cropRect.x ||
        z.x >= cropRight ||
        zBottom <= cropRect.y ||
        z.y >= cropBottom;

      if (isOutside) {
        excludedCount++;
      }
    }
    return {
      total: activeItem.zones.length,
      excluded: excludedCount,
      allExcluded: excludedCount === activeItem.zones.length,
    };
  }, [activeItem, cropRect]);

  if (!isOpen || !activeItem) return null;

  const handleApply = async () => {
    await onApplyCrop(cropParams, scope, recleanAfterCrop);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      onClick={() => !isApplying && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-crop-modal-title"
    >
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-sky-400 flex items-center justify-center border border-blue-500/20">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="bulk-crop-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"
              >
                <span>Bulk Crop Queue</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-sky-300">
                  {queueCount} {queueCount === 1 ? 'image' : 'images'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Apply consistent corner trimming or aspect-ratio framing to discard watermarks across all queued files
              </p>
            </div>
          </div>

          <button
            onClick={() => !isApplying && onClose()}
            disabled={isApplying}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Visual Preview + Right Configuration Controls */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 p-6">
          {/* Left Preview Column */}
          <div className="lg:col-span-6 flex flex-col space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Crop Preview (Active Image)</span>
              <span className="font-mono text-[11px] text-slate-500">
                {activeItem.width}×{activeItem.height} → {cropRect.width}×{cropRect.height}px
              </span>
            </div>

            {/* Interactive Crop Visualizer */}
            <div className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-950 flex items-center justify-center min-h-[260px] max-h-[340px] shadow-inner studio-checkerboard">
              <div className="relative w-full h-full flex items-center justify-center p-2">
                <img
                  src={activeItem.originalUrl}
                  alt={activeItem.name}
                  referrerPolicy="no-referrer"
                  className="max-h-[300px] w-auto max-w-full object-contain select-none"
                />

                {/* Crop Box Overlay with Rule-of-Thirds Grid */}
                <div
                  className="absolute pointer-events-none transition-all duration-150"
                  style={{
                    left: `${(cropRect.x / activeItem.width) * 100}%`,
                    top: `${(cropRect.y / activeItem.height) * 100}%`,
                    width: `${(cropRect.width / activeItem.width) * 100}%`,
                    height: `${(cropRect.height / activeItem.height) * 100}%`,
                    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
                    border: '2px solid #38bdf8',
                  }}
                >
                  {/* Grid Lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
                    <div className="border-r border-b border-sky-300/40" />
                    <div className="border-r border-b border-sky-300/40" />
                    <div className="border-b border-sky-300/40" />
                    <div className="border-r border-b border-sky-300/40" />
                    <div className="border-r border-b border-sky-300/40" />
                    <div className="border-b border-sky-300/40" />
                    <div className="border-r border-sky-300/40" />
                    <div className="border-r border-sky-300/40" />
                    <div />
                  </div>

                  {/* Corner Markers */}
                  <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-sky-400 rounded-xs shadow-xs" />
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-sky-400 rounded-xs shadow-xs" />
                  <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-sky-400 rounded-xs shadow-xs" />
                  <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-sky-400 rounded-xs shadow-xs" />
                </div>
              </div>

              {/* Status pill over image */}
              <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-md bg-slate-950/85 text-[11px] font-mono text-slate-200 border border-slate-700/60 flex items-center gap-1.5 backdrop-blur-xs">
                <span>Crop: {cropRect.width} × {cropRect.height}</span>
                <span className="text-slate-400">·</span>
                <span className="text-sky-400">-{areaTrimmedPercent}% area</span>
              </div>
            </div>

            {/* Watermark Exclusion Feedback Card */}
            {watermarkExclusionStatus && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-colors ${
                  watermarkExclusionStatus.allExcluded
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-300'
                    : watermarkExclusionStatus.excluded > 0
                    ? 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300'
                    : 'bg-blue-500/10 border-blue-500/25 text-blue-800 dark:text-blue-300'
                }`}
              >
                {watermarkExclusionStatus.allExcluded ? (
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold">
                    {watermarkExclusionStatus.allExcluded
                      ? 'Watermarks Completely Excluded by Crop'
                      : watermarkExclusionStatus.excluded > 0
                      ? `${watermarkExclusionStatus.excluded} of ${watermarkExclusionStatus.total} Watermark Zones Excluded`
                      : 'Crop Overlaps Watermark Zones'}
                  </div>
                  <div className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                    {watermarkExclusionStatus.allExcluded
                      ? 'The crop boundary cuts cleanly outside all detected watermark zones. No inpainting artifacts will remain.'
                      : 'Remaining watermark zones inside the crop box will be automatically inpainted if auto-clean is kept enabled.'}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Watermark Presets */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <CornerDownRight className="w-3 h-3" />
                <span>One-Click Watermark Removal Presets</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WATERMARK_CROP_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      if (preset.params.mode) setMode(preset.params.mode);
                      if (preset.params.marginTop !== undefined) setMarginTop(preset.params.marginTop);
                      if (preset.params.marginBottom !== undefined) setMarginBottom(preset.params.marginBottom);
                      if (preset.params.marginLeft !== undefined) setMarginLeft(preset.params.marginLeft);
                      if (preset.params.marginRight !== undefined) setMarginRight(preset.params.marginRight);
                      if (preset.params.aspectRatio) setAspectRatio(preset.params.aspectRatio);
                      if (preset.params.anchor) setAnchor(preset.params.anchor);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    title={preset.description}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Controls Column */}
          <div className="lg:col-span-6 flex flex-col space-y-4">
            {/* Mode Tabs */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('margins')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'margins'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Corner & Margins</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('aspect-ratio')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'aspect-ratio'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Aspect Ratio</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('coordinates')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'coordinates'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                <span>Box %</span>
              </button>
            </div>

            {/* Mode 1: Corner & Margin Trim Controls */}
            {mode === 'margins' && (
              <div className="space-y-3.5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Corner & Edge Trimming (% of Image Size)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMarginTop(0);
                      setMarginBottom(0);
                      setMarginLeft(0);
                      setMarginRight(0);
                    }}
                    className="text-[11px] text-blue-600 dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    Reset All Margins
                  </button>
                </div>

                {/* Bottom Margin (Most common for watermarks) */}
                <div className="space-y-1.5 p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Trim Bottom Edge (Watermarks)</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-200/70 dark:bg-blue-800 text-blue-800 dark:text-sky-200 font-mono">
                        Recommended
                      </span>
                    </span>
                    <span className="font-mono tabular-nums font-bold text-blue-600 dark:text-sky-400 text-sm">
                      {marginBottom}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={marginBottom}
                    onChange={(e) => setMarginBottom(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {[0, 5, 8, 12, 16, 20].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMarginBottom(val)}
                        className={`px-2 py-0.5 text-[10px] rounded font-mono transition-colors cursor-pointer ${
                          marginBottom === val
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Top Margin */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span>Trim Top Edge (Banners / Timestamps)</span>
                    <span className="font-mono tabular-nums font-semibold">{marginTop}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={marginTop}
                    onChange={(e) => setMarginTop(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Left & Right Margin Grid */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                      <span>Trim Left Edge</span>
                      <span className="font-mono tabular-nums font-semibold">{marginLeft}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="35"
                      step="1"
                      value={marginLeft}
                      onChange={(e) => setMarginLeft(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                      <span>Trim Right Edge</span>
                      <span className="font-mono tabular-nums font-semibold">{marginRight}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="35"
                      step="1"
                      value={marginRight}
                      onChange={(e) => setMarginRight(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Mode 2: Consistent Aspect Ratio & Alignment Anchor */}
            {mode === 'aspect-ratio' && (
              <div className="space-y-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <label className="text-xs font-semibold text-slate-900 dark:text-slate-100 block mb-2">
                    Target Aspect Ratio
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: '16:9', label: '16:9', desc: 'Widescreen' },
                        { id: '4:3', label: '4:3', desc: 'Standard' },
                        { id: '1:1', label: '1:1', desc: 'Square' },
                        { id: '3:2', label: '3:2', desc: 'Photo 35mm' },
                        { id: '9:16', label: '9:16', desc: 'Story / Reel' },
                        { id: '4:5', label: '4:5', desc: 'Instagram' },
                        { id: '2:1', label: '2:1', desc: 'Header' },
                      ] as const
                    ).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setAspectRatio(r.id)}
                        className={`p-2 rounded-lg border text-center transition-colors cursor-pointer ${
                          aspectRatio === r.id
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-sky-400 font-bold'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-mono">{r.label}</div>
                        <div className="text-[10px] text-slate-500">{r.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Framing Anchor (Crop Placement)
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Top anchor prunes bottom watermark
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 max-w-xs mx-auto">
                    {(
                      [
                        { id: 'top-left', label: 'Top Left' },
                        { id: 'top-center', label: 'Top Center (Safe)' },
                        { id: 'top-right', label: 'Top Right' },
                        { id: 'center-left', label: 'Center Left' },
                        { id: 'center', label: 'Center' },
                        { id: 'center-right', label: 'Center Right' },
                        { id: 'bottom-left', label: 'Bottom Left' },
                        { id: 'bottom-center', label: 'Bottom Center' },
                        { id: 'bottom-right', label: 'Bottom Right' },
                      ] as const
                    ).map((anc) => (
                      <button
                        key={anc.id}
                        type="button"
                        onClick={() => setAnchor(anc.id)}
                        className={`py-2 px-1 text-[11px] rounded-md border text-center transition-colors cursor-pointer ${
                          anchor === anc.id
                            ? 'border-blue-600 bg-blue-600 text-white font-semibold'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {anc.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Mode 3: Custom Coordinates Box Controls */}
            {mode === 'coordinates' && (
              <div className="space-y-3.5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                  Normalized Crop Bounding Box (0 - 100%)
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                      <span>Origin X</span>
                      <span className="font-mono tabular-nums">{boxX}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="80"
                      value={boxX}
                      onChange={(e) => setBoxX(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                      <span>Origin Y</span>
                      <span className="font-mono tabular-nums">{boxY}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="80"
                      value={boxY}
                      onChange={(e) => setBoxY(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                      <span>Width</span>
                      <span className="font-mono tabular-nums">{boxWidth}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      value={boxWidth}
                      onChange={(e) => setBoxWidth(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                      <span>Height</span>
                      <span className="font-mono tabular-nums">{boxHeight}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      value={boxHeight}
                      onChange={(e) => setBoxHeight(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Scope & Auto-Cleaning Checkbox */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="cropScope"
                    checked={scope === 'all'}
                    onChange={() => setScope('all')}
                    className="accent-blue-600"
                  />
                  <span>
                    Apply to <strong>All Queued Images</strong> ({queueCount})
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="cropScope"
                    checked={scope === 'active'}
                    onChange={() => setScope('active')}
                    className="accent-blue-600"
                  />
                  <span>Selected Image Only</span>
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={recleanAfterCrop}
                  onChange={(e) => setRecleanAfterCrop(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  Re-run automatic watermark detection and inpainting on cropped images
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>
              Target resolution: <strong>{cropRect.width} × {cropRect.height} px</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Cropping Queue...</span>
                </>
              ) : (
                <>
                  <Crop className="w-3.5 h-3.5" />
                  <span>
                    {scope === 'all'
                      ? `Apply Bulk Crop to All (${queueCount})`
                      : 'Apply Crop to Active Image'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
