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
  Columns2,
  Search,
  Link2,
  Crop,
  Cpu,
} from 'lucide-react';
import { SamplePreset } from '../lib/sampleGenerator';
import { ReconstructionQuality, getQualityBadgeStyles } from '../lib/qualityMetrics';
import { DetectionZone, InpaintMethod } from '../lib/watermarkEngine';
import { OptimizeFormat } from '../lib/optimizer';
import { ExportPresetsDropdown } from './ExportPresetsDropdown';

import {
  OfflineAiModelId,
  OFFLINE_AI_MODELS,
  ExecutionBackend,
  OfflineAiDownloadProgress,
} from '../lib/offlineAiEngine';

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
  usedAiModel?: OfflineAiModelId | null;
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
  onLoadImageUrl?: (url: string) => Promise<void>;
  onDownloadActive: () => void;
  onExportAllIndividually: () => void;
  onDownloadAllZip: () => void;
  removeText: boolean;
  removeLogo: boolean;
  onToggleRemoveText: () => void;
  onToggleRemoveLogo: () => void;
  onReRunAutoClean: () => void;
  inpaintMethod?: InpaintMethod;
  onInpaintMethodChange?: (method: InpaintMethod) => void;
  activeAiModelId?: OfflineAiModelId | null;
  activeAiBackend?: ExecutionBackend | null;
  aiDownloadProgress?: OfflineAiDownloadProgress | null;
  onOpenAiManager?: () => void;
  onSuggestAutoCrop?: () => void;
  autoCropSummaryBadge?: string | null;
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
  onLoadImageUrl,
  onDownloadActive,
  onExportAllIndividually,
  onDownloadAllZip,
  removeText,
  removeLogo,
  onToggleRemoveText,
  onToggleRemoveLogo,
  onReRunAutoClean,
  inpaintMethod = 'neural-ai',
  onInpaintMethodChange,
  activeAiModelId = null,
  activeAiBackend = null,
  aiDownloadProgress = null,
  onOpenAiManager,
  onSuggestAutoCrop,
  autoCropSummaryBadge,
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
  const [previewMode, setPreviewMode] = useState<'side-by-side' | 'split' | 'clean'>('side-by-side');
  const [isBeforeAfterStatic, setIsBeforeAfterStatic] = useState<boolean>(false);
  const [splitPos, setSplitPos] = useState<number>(50);
  const [isHoldingOriginal, setIsHoldingOriginal] = useState<boolean>(false);
  const [isPointerDraggingSplit, setIsPointerDraggingSplit] = useState<boolean>(false);
  const [showPresetsPanel, setShowPresetsPanel] = useState<boolean>(false);
  const [enableMagnifier, setEnableMagnifier] = useState<boolean>(true);
  const [hoverLensPos, setHoverLensPos] = useState<{ xPct: number; yPct: number } | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [isFetchingUrl, setIsFetchingUrl] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDraggingSplit && e.buttons !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    setSplitPos(relX);
  };

  const handleSideBySidePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enableMagnifier) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setHoverLensPos({ xPct, yPct });
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = imageUrlInput.trim();
    if (!trimmed || !onLoadImageUrl) return;
    setUrlError(null);
    setIsFetchingUrl(true);
    try {
      await onLoadImageUrl(trimmed);
      setImageUrlInput('');
    } catch (err) {
      setUrlError(
        err instanceof Error
          ? err.message
          : 'Unable to load image from URL (check CORS or paste directly with Ctrl+V).'
      );
    } finally {
      setIsFetchingUrl(false);
    }
  };

  return (
    <main
      id="workspace"
      className="flex-1 flex flex-col items-center justify-center px-4 py-6 md:py-8 bg-slate-50 dark:bg-slate-950 min-h-[calc(100vh-110px)]"
    >
      {/* THE SINGLE UNIFIED WATERMARKREMOVER.IO OFFLINE AI BOX */}
      <div className="w-full max-w-5xl rounded-3xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden p-5 md:p-7 space-y-5">
        {/* Top Header Inside the Single Box */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/10 dark:bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-sky-400 shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Offline AI Watermark Remover
                </h1>
                {onOpenAiManager && (
                  <button
                    type="button"
                    onClick={onOpenAiManager}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                      aiDownloadProgress
                        ? 'bg-blue-500/15 text-blue-700 dark:text-sky-300 border-blue-500/30'
                        : activeAiModelId
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                    }`}
                    title="Manage or download cached Offline ONNX Neural AI models"
                  >
                    {aiDownloadProgress ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Downloading AI {aiDownloadProgress.percent}%</span>
                      </>
                    ) : activeAiModelId ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>
                          Offline AI Ready: {OFFLINE_AI_MODELS[activeAiModelId].shortName}
                          {activeAiBackend ? ` · ${activeAiBackend}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        <span>Download Offline AI (28 MB)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Drop, upload, paste (Ctrl+V), or enter an image URL — automatic watermark detection &amp; offline neural AI removal in your browser.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onSuggestAutoCrop && activeItem && (
              <button
                type="button"
                onClick={onSuggestAutoCrop}
                className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100/80 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="Analyze active image margins and edge noise to suggest Auto-Crop parameters"
              >
                <Crop className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Suggest Auto-Crop</span>
                {autoCropSummaryBadge && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 font-bold">
                    {autoCropSummaryBadge}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onSwitchToProMode}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 transition-colors cursor-pointer shrink-0"
              title="Switch to full 3-column Studio Workbench with manual brushes and batch tools"
            >
              <Sliders className="w-4 h-4 text-blue-600 dark:text-sky-400" />
              <span>Pro Studio Workbench</span>
            </button>
          </div>
        </div>

        {/* Step 1: Big Upload, Paste Clipboard & Paste URL (WatermarkRemover.io Signature Input Bar) */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={onOpenFilePicker}
              className="w-full py-4 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3.5 transition-all cursor-pointer group"
            >
              <Upload className="w-6 h-6 shrink-0 group-hover:-translate-y-0.5 transition-transform" />
              <div className="text-left">
                <div className="leading-tight">Upload Image(s)</div>
                <div className="text-xs font-normal text-blue-100 mt-0.5">
                  Auto-cleans immediately · Single or Batch
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onPasteFromClipboard}
              className="w-full py-4 px-5 rounded-2xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-800 border-2 border-slate-300/80 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-base flex items-center justify-center gap-3.5 transition-all cursor-pointer group"
            >
              <ClipboardPaste className="w-6 h-6 text-blue-600 dark:text-sky-400 shrink-0 group-hover:scale-105 transition-transform" />
              <div className="text-left">
                <div className="leading-tight">Paste Image (Ctrl+V)</div>
                <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  Instant clipboard watermark removal
                </div>
              </div>
            </button>
          </div>

          {/* WatermarkRemover.io Paste URL Bar */}
          {onLoadImageUrl && (
            <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => {
                    setImageUrlInput(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  placeholder="Or paste an image URL (https://... or data:image/...) for instant offline AI removal"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={!imageUrlInput.trim() || isFetchingUrl}
                className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
              >
                {isFetchingUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading URL...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    <span>Clean Image URL</span>
                  </>
                )}
              </button>
            </form>
          )}
          {urlError && (
            <div className="text-xs text-amber-600 dark:text-amber-400 px-1">{urlError}</div>
          )}
        </div>

        {/* WatermarkRemover.io Signature Toggles: Remove Text / Remove Logo / Offline AI Engine / Re-Clean */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <button
            type="button"
            onClick={onToggleRemoveText}
            className={`sm:col-span-3 py-3 px-3.5 rounded-2xl border-2 font-bold text-xs md:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer ${
              removeText
                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/90 dark:bg-blue-950/50 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="flex items-center gap-2">
              <Type className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
              <span>Remove Text</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
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
            className={`sm:col-span-3 py-3 px-3.5 rounded-2xl border-2 font-bold text-xs md:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer ${
              removeLogo
                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/90 dark:bg-blue-950/50 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="flex items-center gap-2">
              <Shapes className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>Remove Logo</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                removeLogo
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {removeLogo ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Offline AI Model Selector */}
          <div className="sm:col-span-4 flex items-center gap-2 px-3 py-2 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <label htmlFor="offline-ai-model-select" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Offline AI Model
              </label>
              <select
                id="offline-ai-model-select"
                value={inpaintMethod}
                onChange={(e) =>
                  onInpaintMethodChange && onInpaintMethodChange(e.target.value as InpaintMethod)
                }
                className="w-full bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer truncate"
              >
                <option value="neural-ai" className="bg-white dark:bg-slate-900">
                  Neural Multi-Scale + PatchMatch
                </option>
                <option value="hybrid-smart" className="bg-white dark:bg-slate-900">
                  Hybrid Alpha + Exemplar
                </option>
                <option value="patch-synthesis" className="bg-white dark:bg-slate-900">
                  Patch Texture Synthesis
                </option>
                <option value="alpha-unblend" className="bg-white dark:bg-slate-900">
                  Reverse Alpha Unblending
                </option>
                <option value="telea-inpaint" className="bg-white dark:bg-slate-900">
                  Fast Marching Telea
                </option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={onReRunAutoClean}
            disabled={!activeItem || isBatchProcessing}
            className="sm:col-span-2 py-3 px-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs md:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
            <span>Re-Clean</span>
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
            {/* Preview Top Bar with WatermarkRemover.io Side-by-Side, Split Slider, Clean Result & Magnifier */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80">
              <div className="flex items-center gap-2 flex-wrap">
                {activeItem.status === 'processing' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-sky-300 border border-blue-500/30">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Running Offline AI...</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      Cleaned in {activeItem.processingMs}ms
                      {activeItem.usedAiModel
                        ? ` · ${OFFLINE_AI_MODELS[activeItem.usedAiModel].shortName}`
                        : ''}
                    </span>
                  </span>
                )}
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

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  aria-pressed={isBeforeAfterStatic}
                  onClick={() => {
                    setIsBeforeAfterStatic((prev) => !prev);
                    setHoverLensPos(null);
                    setIsHoldingOriginal(false);
                    setIsPointerDraggingSplit(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                    isBeforeAfterStatic
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                      : 'bg-slate-200/70 dark:bg-slate-800 border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                  }`}
                  title="Display Original and Cleaned Result side-by-side in a static, non-interactive view for quick review"
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Before/After</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsBeforeAfterStatic(false);
                    setPreviewMode('side-by-side');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    !isBeforeAfterStatic && previewMode === 'side-by-side' && !isHoldingOriginal
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Side-by-Side</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsBeforeAfterStatic(false);
                    setPreviewMode('split');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    !isBeforeAfterStatic && previewMode === 'split' && !isHoldingOriginal
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                  }`}
                >
                  <MoveHorizontal className="w-3.5 h-3.5" />
                  <span>Split Slider</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsBeforeAfterStatic(false);
                    setPreviewMode('clean');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    !isBeforeAfterStatic && previewMode === 'clean' && !isHoldingOriginal
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                  }`}
                >
                  Clean Result
                </button>

                {!isBeforeAfterStatic && previewMode === 'side-by-side' && (
                  <button
                    type="button"
                    onClick={() => setEnableMagnifier((prev) => !prev)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
                      enableMagnifier
                        ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                        : 'bg-slate-200/60 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400'
                    }`}
                    title="Toggle synchronized 2.5× hover magnifier loupe across Original and Watermark Removed panels"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>2.5× Loupe</span>
                  </button>
                )}

                {!isBeforeAfterStatic && (
                  <button
                    type="button"
                    onPointerDown={() => setIsHoldingOriginal(true)}
                    onPointerUp={() => setIsHoldingOriginal(false)}
                    onPointerLeave={() => setIsHoldingOriginal(false)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer select-none ${
                      isHoldingOriginal
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Hold Original</span>
                  </button>
                )}
              </div>
            </div>

            {/* Main Image Canvas / Comparison Box */}
            {isBeforeAfterStatic ? (
              <div
                aria-label="Static Before and After comparison view"
                className="p-4 md:p-6 pointer-events-none select-none"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-900 shadow-md">
                    <img
                      src={activeItem.originalUrl}
                      alt="Before: original watermarked"
                      draggable={false}
                      className="w-full h-auto max-h-[380px] object-contain mx-auto block pointer-events-none select-none"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/85 text-xs font-bold text-slate-200 border border-slate-700/70">
                      Before · Original
                    </div>
                  </div>
                  <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 dark:border-emerald-500/30 bg-slate-900 shadow-md">
                    <img
                      src={activeItem.cleanedUrl}
                      alt="After: cleaned result"
                      draggable={false}
                      className="w-full h-auto max-h-[380px] object-contain mx-auto block pointer-events-none select-none"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-emerald-600/95 text-xs font-bold text-white shadow-xs flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>After · Cleaned Result</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2.5 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  Static Before/After quick review (non-interactive). Click Before/After again to return to interactive views.
                </p>
              </div>
            ) : previewMode === 'side-by-side' && !isHoldingOriginal ? (
              <div className="p-4 md:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  {/* Left Panel: Original Watermarked Image */}
                  <div
                    className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-900 shadow-md group cursor-crosshair"
                    onPointerMove={handleSideBySidePointerMove}
                    onPointerLeave={() => setHoverLensPos(null)}
                  >
                    <img
                      src={activeItem.originalUrl}
                      alt="Original watermarked"
                      className="w-full h-auto max-h-[380px] object-contain mx-auto block select-none"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/85 text-xs font-bold text-slate-200 border border-slate-700/70">
                      Original
                    </div>

                    {/* Synchronized 2.5x Magnifier Loupe on Original */}
                    {enableMagnifier && hoverLensPos && (
                      <div
                        className="pointer-events-none absolute w-32 h-32 rounded-full border-2 border-white shadow-2xl overflow-hidden z-20"
                        style={{
                          left: `calc(${hoverLensPos.xPct}% - 64px)`,
                          top: `calc(${hoverLensPos.yPct}% - 64px)`,
                          backgroundImage: `url(${activeItem.originalUrl})`,
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: '260% 260%',
                          backgroundPosition: `${hoverLensPos.xPct}% ${hoverLensPos.yPct}%`,
                        }}
                      >
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-slate-950/80 text-[9px] font-mono text-white">
                          Before 2.5×
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Panel: Watermark Removed Image */}
                  <div
                    className="relative rounded-xl overflow-hidden border border-emerald-500/40 dark:border-emerald-500/30 bg-slate-900 shadow-md group cursor-crosshair"
                    onPointerMove={handleSideBySidePointerMove}
                    onPointerLeave={() => setHoverLensPos(null)}
                  >
                    <img
                      src={activeItem.cleanedUrl}
                      alt="Watermark removed"
                      className="w-full h-auto max-h-[380px] object-contain mx-auto block select-none"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-emerald-600/95 text-xs font-bold text-white shadow-xs flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>Watermark Removed</span>
                    </div>

                    {/* Synchronized 2.5x Magnifier Loupe on Cleaned */}
                    {enableMagnifier && hoverLensPos && (
                      <div
                        className="pointer-events-none absolute w-32 h-32 rounded-full border-2 border-emerald-400 shadow-2xl overflow-hidden z-20"
                        style={{
                          left: `calc(${hoverLensPos.xPct}% - 64px)`,
                          top: `calc(${hoverLensPos.yPct}% - 64px)`,
                          backgroundImage: `url(${activeItem.cleanedUrl})`,
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: '260% 260%',
                          backgroundPosition: `${hoverLensPos.xPct}% ${hoverLensPos.yPct}%`,
                        }}
                      >
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-emerald-950/90 text-[9px] font-mono text-emerald-200">
                          Cleaned 2.5×
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
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
                      Original
                    </span>
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-emerald-600/90 text-white text-[10px] font-semibold">
                      Watermark Removed
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
                      {isHoldingOriginal ? 'Original Watermarked Image' : 'Watermark Removed'}
                    </span>
                  </div>
                )}
              </div>
            )}

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
              } py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 text-white font-bold text-base md:text-lg shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 transition-all cursor-pointer`}
            >
              <Download className="w-6 h-6 shrink-0" />
              <span>Download Image</span>
            </button>

            {queue.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={onExportAllIndividually}
                  disabled={isExportingIndividually || isZipping || isBatchProcessing}
                  className="sm:col-span-3 py-4 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-sm md:text-base shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
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
                  className="sm:col-span-3 py-4 px-4 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-sm md:text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
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
                  No image? Try sample:
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
