import React, { useState } from 'react';
import {
  Upload,
  ClipboardPaste,
  Download,
  Sparkles,
  Zap,
  Type,
  Shapes,
  Eye,
  MoveHorizontal,
  Check,
  FileDown,
  FolderArchive,
  Loader2,
  Sliders,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { SamplePreset } from '../lib/sampleGenerator';
import { ReconstructionQuality, getQualityBadgeStyles } from '../lib/qualityMetrics';
import { DetectionZone } from '../lib/watermarkEngine';
import { OptimizeFormat } from '../lib/optimizer';
import { ExportPresetsDropdown } from './ExportPresetsDropdown';

export interface SimpleQueueItem {
  id: string;
  name: string;
  width: number;
  height: number;
  originalUrl: string;
  cleanedUrl: string;
  zones: DetectionZone[];
  coveragePercent: number;
  processingMs: number;
  status: 'cleaned' | 'processing';
  quality?: ReconstructionQuality;
}

interface SimpleBatchProgress {
  active: boolean;
  title: string;
  current: number;
  total: number;
  percentage: number;
  currentFileName?: string;
  isComplete?: boolean;
}

interface SimpleModeWorkspaceProps {
  activeItem: SimpleQueueItem | null;
  queue: SimpleQueueItem[];
  activeId: string | null;
  onSelectQueueItem: (id: string) => void;
  onRemoveQueueItem: (id: string) => void;
  onOpenFilePicker: () => void;
  onPasteFromClipboard: () => void;
  onDownloadActive: () => void;
  onExportAllIndividually: () => void;
  onDownloadAllZip: () => void;
  removeText: boolean;
  removeLogo: boolean;
  onToggleRemoveText: () => void;
  onToggleRemoveLogo: () => void;
  onReRunAutoClean: () => void;
  isBatchProcessing: boolean;
  isZipping: boolean;
  isExportingIndividually: boolean;
  batchProgress: SimpleBatchProgress | null;
  samples: SamplePreset[];
  onLoadSample: (sample: SamplePreset) => void;
  onSwitchToProMode: () => void;
  smartOptimize: boolean;
  onToggleSmartOptimize: () => void;
  format: OptimizeFormat;
  quality: number;
  onFormatChange: (format: OptimizeFormat) => void;
  onQualityChange: (quality: number) => void;
  savingsPercent: number;
}

export const SimpleModeWorkspace: React.FC<SimpleModeWorkspaceProps> = ({
  activeItem,
  queue,
  onSelectQueueItem,
  onRemoveQueueItem,
  onOpenFilePicker,
  onPasteFromClipboard,
  onDownloadActive,
  onExportAllIndividually,
  onDownloadAllZip,
  removeText,
  removeLogo,
  onToggleRemoveText,
  onToggleRemoveLogo,
  onReRunAutoClean,
  isBatchProcessing,
  isZipping,
  isExportingIndividually,
  batchProgress,
  samples,
  onLoadSample,
  onSwitchToProMode,
  smartOptimize,
  onToggleSmartOptimize,
  format,
  quality,
  onFormatChange,
  onQualityChange,
  savingsPercent,
}) => {
  const [previewMode, setPreviewMode] = useState<'clean' | 'split'>('clean');
  const [splitPos, setSplitPos] = useState<number>(50);
  const [isHoldingOriginal, setIsHoldingOriginal] = useState<boolean>(false);
  const [isPointerDraggingSplit, setIsPointerDraggingSplit] = useState<boolean>(false);
  const [showPresetsPanel, setShowPresetsPanel] = useState<boolean>(false);

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDraggingSplit && e.buttons !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setSplitPos(relX);
  };

  return (
    <main
      id="workspace"
      className="flex-1 flex flex-col items-center justify-center px-4 py-6 md:py-10 bg-slate-50 dark:bg-slate-950 min-h-[calc(100vh-110px)]"
    >
      {/* THE SINGLE UNIFIED BOX */}
      <div className="w-full max-w-4xl rounded-3xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden p-5 md:p-8 space-y-6">
        {/* Top Header Inside the Single Box */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/10 dark:bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-sky-400 shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Simple 1-Box Auto Cleaner
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Automatic Processing Active
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Drop, upload, or paste any image — watermarks are detected and removed automatically.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSwitchToProMode}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 transition-colors cursor-pointer shrink-0"
            title="Switch to full 3-column Studio Workbench with manual brushes and batch tools"
          >
            <Sliders className="w-4 h-4 text-blue-600 dark:text-sky-400" />
            <span>Switch to Pro Studio</span>
          </button>
        </div>

        {/* Step 1: Big Upload & Paste Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onOpenFilePicker}
            className="w-full py-5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-base md:text-lg shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3.5 transition-all cursor-pointer group"
          >
            <Upload className="w-6 h-6 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
            <div className="text-left">
              <div className="leading-tight">Upload Photo(s)</div>
              <div className="text-xs font-normal text-blue-100 mt-0.5">
                Auto-cleans immediately · Single or Batch
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onPasteFromClipboard}
            className="w-full py-5 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-800 border-2 border-slate-300/80 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-base md:text-lg flex items-center justify-center gap-3.5 transition-all cursor-pointer group"
          >
            <ClipboardPaste className="w-6 h-6 text-blue-600 dark:text-sky-400 shrink-0 group-hover:scale-105 transition-transform" />
            <div className="text-left">
              <div className="leading-tight">Paste Image (Ctrl+V)</div>
              <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                Instant automatic clipboard cleaning
              </div>
            </div>
          </button>
        </div>

        {/* Big Automatic Filter Buttons (Remove Text / Remove Logo / Re-Clean) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={onToggleRemoveText}
            className={`py-3.5 px-4 rounded-2xl border-2 font-bold text-sm md:text-base flex items-center justify-between gap-2 transition-all cursor-pointer ${
              removeText
                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/90 dark:bg-blue-950/50 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Type className="w-5 h-5 text-blue-600 dark:text-sky-400 shrink-0" />
              <span>Remove Text</span>
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold ${
                removeText
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {removeText ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleRemoveLogo}
            className={`py-3.5 px-4 rounded-2xl border-2 font-bold text-sm md:text-base flex items-center justify-between gap-2 transition-all cursor-pointer ${
              removeLogo
                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/90 dark:bg-blue-950/50 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Shapes className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>Remove Logos</span>
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold ${
                removeLogo
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {removeLogo ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onReRunAutoClean}
            disabled={!activeItem || isBatchProcessing}
            className="py-3.5 px-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm md:text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-sky-400 shrink-0" />
            <span>Auto Re-Clean</span>
          </button>
        </div>

        {/* Batch Processing Progress Bar (if active) */}
        {batchProgress && batchProgress.active && (
          <div className="p-4 rounded-2xl border border-blue-500/30 bg-blue-50/80 dark:bg-blue-950/40 space-y-2">
            <div className="flex items-center justify-between text-xs md:text-sm font-semibold text-blue-900 dark:text-blue-200">
              <span className="flex items-center gap-2">
                {batchProgress.isComplete ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-600 dark:text-sky-400 animate-spin" />
                )}
                <span>{batchProgress.title}</span>
              </span>
              <span className="font-mono">
                {batchProgress.current}/{batchProgress.total} ({batchProgress.percentage}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-blue-200/70 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-sky-400 transition-all duration-200"
                style={{ width: `${batchProgress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Unified Automatic Result Preview Area */}
        {activeItem ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/90 overflow-hidden">
            {/* Preview Top Bar with Big View Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                  <Sparkles className="w-3.5 h-3.5" />
                  Cleaned in {activeItem.processingMs}ms
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 font-mono">
                  {activeItem.width}×{activeItem.height}px · {activeItem.zones.length}{' '}
                  {activeItem.zones.length === 1 ? 'watermark' : 'watermarks'} removed
                </span>
                {activeItem.quality && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-mono font-semibold border ${
                      getQualityBadgeStyles(activeItem.quality.tier).badgeBg
                    } ${getQualityBadgeStyles(activeItem.quality.tier).badgeBorder} ${
                      getQualityBadgeStyles(activeItem.quality.tier).badgeText
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        getQualityBadgeStyles(activeItem.quality.tier).dotBg
                      }`}
                    />
                    {activeItem.quality.score}% SSIM
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode('clean')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    previewMode === 'clean' && !isHoldingOriginal
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                  }`}
                >
                  Clean Result
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('split')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    previewMode === 'split' && !isHoldingOriginal
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                  }`}
                >
                  <MoveHorizontal className="w-3.5 h-3.5" />
                  <span>Before / After Split</span>
                </button>
                <button
                  type="button"
                  onPointerDown={() => setIsHoldingOriginal(true)}
                  onPointerUp={() => setIsHoldingOriginal(false)}
                  onPointerLeave={() => setIsHoldingOriginal(false)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer select-none ${
                    isHoldingOriginal
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Hold Original</span>
                </button>
              </div>
            </div>

            {/* Main Image Canvas / Comparison Box */}
            <div
              className="relative flex items-center justify-center p-4 md:p-6 min-h-[280px] max-h-[460px] select-none overflow-hidden"
              onPointerDown={(e) => {
                if (previewMode === 'split') {
                  setIsPointerDraggingSplit(true);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                  setSplitPos(relX);
                }
              }}
              onPointerMove={handleSplitPointerMove}
              onPointerUp={() => setIsPointerDraggingSplit(false)}
              onPointerLeave={() => setIsPointerDraggingSplit(false)}
            >
              {previewMode === 'split' && !isHoldingOriginal ? (
                <div className="relative inline-block max-h-[410px] max-w-full rounded-xl overflow-hidden shadow-lg border border-slate-300 dark:border-slate-800 cursor-ew-resize">
                  <img
                    src={activeItem.cleanedUrl}
                    alt={activeItem.name}
                    className="block max-h-[410px] w-auto max-w-full object-contain pointer-events-none"
                  />
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                  >
                    <img
                      src={activeItem.originalUrl}
                      alt="Original with watermark"
                      className="block max-h-[410px] w-auto max-w-full object-contain"
                    />
                  </div>
                  {/* Split Divider Line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] pointer-events-none"
                    style={{ left: `${splitPos}%` }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-sky-500 text-white shadow-lg flex items-center justify-center border-2 border-white">
                      <MoveHorizontal className="w-4 h-4" />
                    </div>
                  </div>
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-semibold">
                    Before
                  </span>
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-emerald-600/90 text-white text-[10px] font-semibold">
                    After (Auto-Cleaned)
                  </span>
                </div>
              ) : (
                <div className="relative inline-block max-h-[410px] max-w-full rounded-xl overflow-hidden shadow-lg border border-slate-300 dark:border-slate-800">
                  <img
                    src={isHoldingOriginal ? activeItem.originalUrl : activeItem.cleanedUrl}
                    alt={activeItem.name}
                    className="block max-h-[410px] w-auto max-w-full object-contain"
                  />
                  <span
                    className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm ${
                      isHoldingOriginal
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-emerald-600/95 text-white'
                    }`}
                  >
                    {isHoldingOriginal ? 'Original Watermarked Image' : 'Auto-Cleaned Result'}
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnail Strip Inside the Same Box when multiple images are loaded */}
            {queue.length > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 flex items-center gap-2.5 overflow-x-auto">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 pr-1">
                  Batch ({queue.length}):
                </span>
                {queue.map((item) => {
                  const isCurrent = item.id === activeItem.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectQueueItem(item.id)}
                      className={`group relative flex items-center gap-2 p-1.5 pr-2.5 rounded-xl border cursor-pointer shrink-0 transition-all ${
                        isCurrent
                          ? 'border-blue-600 dark:border-blue-400 bg-blue-50/80 dark:bg-blue-950/50'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <img
                        src={item.cleanedUrl}
                        alt={item.name}
                        className="w-10 h-8 rounded-lg object-cover bg-slate-950 shrink-0"
                      />
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[100px] truncate">
                        {item.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveQueueItem(item.id);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* Big Primary Download & Export Action Buttons */}
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <button
              type="button"
              onClick={onDownloadActive}
              disabled={!activeItem || isBatchProcessing}
              className={`${
                queue.length > 1 ? 'sm:col-span-6' : 'sm:col-span-12'
              } py-5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 text-white font-bold text-base md:text-lg shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 transition-all cursor-pointer`}
            >
              <Download className="w-6 h-6 shrink-0" />
              <span>Download Clean Image</span>
            </button>

            {queue.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={onExportAllIndividually}
                  disabled={isExportingIndividually || isZipping || isBatchProcessing}
                  className="sm:col-span-3 py-5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-sm md:text-base shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isExportingIndividually ? (
                    <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  ) : (
                    <FileDown className="w-5 h-5 shrink-0" />
                  )}
                  <span>Export All ({queue.length})</span>
                </button>

                <button
                  type="button"
                  onClick={onDownloadAllZip}
                  disabled={isZipping || isExportingIndividually || isBatchProcessing}
                  className="sm:col-span-3 py-5 px-4 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-sm md:text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isZipping ? (
                    <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  ) : (
                    <FolderArchive className="w-5 h-5 shrink-0" />
                  )}
                  <span>Save ZIP ({queue.length})</span>
                </button>
              </>
            )}
          </div>

          {/* Quick Smart Optimize & Export Presets Bar Inside Bottom of Box */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2.5 text-xs md:text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={smartOptimize}
                    onChange={onToggleSmartOptimize}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Smart Optimize{' '}
                    {smartOptimize && savingsPercent > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        (Saves ~{savingsPercent}%)
                      </span>
                    ) : null}
                  </span>
                </label>

                {smartOptimize && (
                  <button
                    type="button"
                    onClick={() => setShowPresetsPanel((prev) => !prev)}
                    className="text-xs font-semibold text-blue-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Export Presets & Format ({format.toUpperCase()})</span>
                    {showPresetsPanel ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                  Try 1-Click Sample:
                </span>
                {samples.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onLoadSample(sample)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                  >
                    {sample.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Expandable Export Presets dropdown inside Simple Mode */}
            {smartOptimize && showPresetsPanel && (
              <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <ExportPresetsDropdown
                  format={format}
                  quality={quality}
                  onFormatChange={onFormatChange}
                  onQualityChange={onQualityChange}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
