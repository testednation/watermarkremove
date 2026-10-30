import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Upload,
  Sparkles,
  Download,
  Wand2,
  Brush,
  Eraser,
  Square,
  CheckSquare,
  RotateCcw,
  Undo2,
  Redo2,
  Check,
  Eye,
  Trash2,
  Sun,
  Moon,
  ChevronRight,
  Image as ImageIcon,
  MoveHorizontal,
  ShieldCheck,
  Zap,
  FolderArchive,
  ClipboardPaste,
  Columns2,
  Type,
  Shapes,
  Loader2,
  AlertTriangle,
  X,
  Crop,
  TrendingDown,
  HardDrive,
  PenLine,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  autoDetectWatermarkMask,
  removeWatermark,
  dilateMask,
  magicWandMask,
  extractDetectionZones,
  DetectionMode,
  InpaintMethod,
  DetectionZone,
} from './lib/watermarkEngine';
import { OFFLINE_SAMPLES, SamplePreset } from './lib/sampleGenerator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { BulkCropModal } from './components/BulkCropModal';
import { BatchRenameModal } from './components/BatchRenameModal';
import { CropParameters, calculateCropRect, cropImageData } from './lib/cropEngine';
import { optimizeCleanedImage, OptimizeFormat, formatBytes, estimateQueueSizes } from './lib/optimizer';
import {
  computeReconstructionQuality,
  ReconstructionQuality,
  getQualityBadgeStyles,
} from './lib/qualityMetrics';

type ViewMode = 'compare' | 'side-by-side' | 'clean' | 'mask' | 'original';
type ActiveTool = 'compare' | 'brush-add' | 'brush-erase' | 'rect-add' | 'magic-wand';

interface BatchProgress {
  active: boolean;
  title: string;
  current: number;
  total: number;
  percentage: number;
  currentFileName?: string;
  isComplete?: boolean;
}

interface QueueItem {
  id: string;
  name: string;
  width: number;
  height: number;
  originalData: ImageData;
  cleanedData: ImageData;
  mask: Uint8Array;
  undoStack: Uint8Array[];
  redoStack: Uint8Array[];
  zones: DetectionZone[];
  coveragePercent: number;
  processingMs: number;
  originalUrl: string;
  cleanedUrl: string;
  status: 'cleaned' | 'processing';
  quality?: ReconstructionQuality;
}

function imageDataToDataUrl(imgData: ImageData): string {
  const c = document.createElement('canvas');
  c.width = imgData.width;
  c.height = imgData.height;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL('image/png');
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [isDark, setIsDark] = useState(true);

  // Queue & active image state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null);
  const [isHoldingOriginal, setIsHoldingOriginal] = useState(false);

  // WatermarkRemover.io signature toggles: Remove Text & Remove Logo
  const [removeText, setRemoveText] = useState<boolean>(true);
  const [removeLogo, setRemoveLogo] = useState<boolean>(true);

  // Automatic engine parameters
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('smart-auto');
  const [inpaintMethod, setInpaintMethod] = useState<InpaintMethod>('hybrid-smart');
  const [sensitivity, setSensitivity] = useState<number>(68);
  const [dilationRadius, setDilationRadius] = useState<number>(5);
  const [autoCleanOnUpload, setAutoCleanOnUpload] = useState<boolean>(true);
  const [targetCorners, setTargetCorners] = useState({
    bottomRight: true,
    bottomLeft: true,
    topRight: true,
    topLeft: true,
    centerAndTiled: true,
  });

  // Canvas & interactive tool state
  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const [activeTool, setActiveTool] = useState<ActiveTool>('compare');
  const [brushSize, setBrushSize] = useState<number>(24);
  const [comparePosition, setComparePosition] = useState<number>(52);
  const [showZoneBoxes, setShowZoneBoxes] = useState<boolean>(true);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [showBulkCropModal, setShowBulkCropModal] = useState<boolean>(false);
  const [showBatchRenameModal, setShowBatchRenameModal] = useState<boolean>(false);
  const [isBulkCropping, setIsBulkCropping] = useState<boolean>(false);
  const [smartOptimize, setSmartOptimize] = useState<boolean>(true);
  const [optimizeFormat, setOptimizeFormat] = useState<OptimizeFormat>('webp');
  const [optimizeQuality, setOptimizeQuality] = useState<number>(0.88);

  // Item selection helpers for Batch Queue operations
  const toggleSelectItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const isAllSelected = useMemo(() => {
    return queue.length > 0 && queue.every((q) => selectedIds.has(q.id));
  }, [queue, selectedIds]);

  const isSomeSelected = useMemo(() => {
    return queue.some((q) => selectedIds.has(q.id)) && !isAllSelected;
  }, [queue, selectedIds, isAllSelected]);

  const selectedCount = useMemo(() => {
    return queue.filter((q) => selectedIds.has(q.id)).length;
  }, [queue, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queue.map((q) => q.id)));
    }
  }, [isAllSelected, queue]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(queue.map((q) => q.id)));
  }, [queue]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Targeted queue based on active selection (selected subset or entire queue if none or all selected)
  const activeTargetQueue = useMemo(() => {
    if (selectedCount > 0 && selectedCount < queue.length) {
      return queue.filter((item) => selectedIds.has(item.id));
    }
    return queue;
  }, [queue, selectedCount, selectedIds]);

  // Refs for interactive canvas painting / rectangle selection
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeItem = queue.find((item) => item.id === activeId) || queue[0] || null;

  // Real-time file size reduction & savings estimation across current queue selection
  const savingsEstimation = useMemo(() => {
    return estimateQueueSizes(activeTargetQueue, {
      enabled: smartOptimize,
      format: optimizeFormat,
      quality: optimizeQuality,
    });
  }, [activeTargetQueue, smartOptimize, optimizeFormat, optimizeQuality]);

  // Sync theme with <html class="dark">
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Process a raw ImageData automatically with current engine settings
  const runAutomaticPipeline = useCallback(
    (
      origData: ImageData,
      overrides?: {
        mode?: DetectionMode;
        sens?: number;
        dilate?: number;
        method?: InpaintMethod;
        corners?: typeof targetCorners;
        remText?: boolean;
        remLogo?: boolean;
      }
    ) => {
      const t0 = performance.now();
      const det = autoDetectWatermarkMask(origData, {
        mode: overrides?.mode ?? detectionMode,
        sensitivity: overrides?.sens ?? sensitivity,
        dilationRadius: overrides?.dilate ?? dilationRadius,
        removeText: overrides?.remText ?? removeText,
        removeLogo: overrides?.remLogo ?? removeLogo,
        targetCorners: overrides?.corners ?? targetCorners,
      });

      const cleaned = removeWatermark(
        origData,
        det.mask,
        overrides?.method ?? inpaintMethod
      );
      const quality = computeReconstructionQuality(origData, cleaned, det.mask);
      const t1 = performance.now();

      return {
        mask: det.mask,
        zones: det.zones,
        coveragePercent: det.coveragePercent,
        cleanedData: cleaned,
        cleanedUrl: imageDataToDataUrl(cleaned),
        processingMs: Math.max(1, Math.round(t1 - t0)),
        quality,
      };
    },
    [detectionMode, sensitivity, dilationRadius, inpaintMethod, targetCorners, removeText, removeLogo]
  );

  // Load a sample preset by ID
  const loadSamplePreset = useCallback(
    (sample: SamplePreset) => {
      const dataUrl = sample.renderToDataUrl();
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const origData = ctx.getImageData(0, 0, img.width, img.height);

        const result = runAutomaticPipeline(origData, { mode: sample.recommendedMode });
        const newItem: QueueItem = {
          id: `${sample.id}-${Date.now()}`,
          name: `${sample.title}.png`,
          width: img.width,
          height: img.height,
          originalData: origData,
          cleanedData: result.cleanedData,
          mask: result.mask,
          undoStack: [],
          redoStack: [],
          zones: result.zones,
          coveragePercent: result.coveragePercent,
          processingMs: result.processingMs,
          originalUrl: dataUrl,
          cleanedUrl: result.cleanedUrl,
          status: 'cleaned',
          quality: result.quality,
        };

        setDetectionMode(sample.recommendedMode);
        setQueue((prev) => [newItem, ...prev]);
        setSelectedIds((prev) => new Set([...prev, newItem.id]));
        setActiveId(newItem.id);
      };
      img.src = dataUrl;
    },
    [runAutomaticPipeline]
  );

  // Initialize with the first offline sample on mount
  useEffect(() => {
    if (queue.length === 0 && OFFLINE_SAMPLES.length > 0) {
      loadSamplePreset(OFFLINE_SAMPLES[0]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run automatic detection & removal on the active item when sliders, toggles, or mode change
  const rerunActiveItemAuto = useCallback(
    (overrides?: {
      mode?: DetectionMode;
      sens?: number;
      dilate?: number;
      method?: InpaintMethod;
      corners?: typeof targetCorners;
      remText?: boolean;
      remLogo?: boolean;
    }) => {
      if (!activeItem) return;
      const res = runAutomaticPipeline(activeItem.originalData, overrides);
      setQueue((prev) =>
        prev.map((item) =>
          item.id === activeItem.id
            ? {
                ...item,
                undoStack: [...item.undoStack.slice(-24), new Uint8Array(item.mask)],
                redoStack: [],
                mask: res.mask,
                zones: res.zones,
                coveragePercent: res.coveragePercent,
                cleanedData: res.cleanedData,
                cleanedUrl: res.cleanedUrl,
                processingMs: res.processingMs,
                quality: res.quality,
              }
            : item
        )
      );
    },
    [activeItem, runAutomaticPipeline]
  );

  // Re-inpaint active item using a custom modified mask
  const applyCustomMaskToActiveItem = useCallback(
    (
      newMask: Uint8Array,
      options?: { methodOverride?: InpaintMethod; recordHistory?: boolean }
    ) => {
      if (!activeItem) return;
      const recordHistory = options?.recordHistory ?? true;
      const t0 = performance.now();
      const cleaned = removeWatermark(
        activeItem.originalData,
        newMask,
        options?.methodOverride ?? inpaintMethod
      );
      const quality = computeReconstructionQuality(activeItem.originalData, cleaned, newMask);
      const t1 = performance.now();
      const totalPixels = activeItem.width * activeItem.height;
      let maskedCount = 0;
      for (let i = 0; i < totalPixels; i++) {
        if (newMask[i] > 0) maskedCount++;
      }
      const coveragePercent = Number(((maskedCount / totalPixels) * 100).toFixed(2));
      const zones = extractDetectionZones(newMask, activeItem.width, activeItem.height);

      setQueue((prev) =>
        prev.map((item) =>
          item.id === activeItem.id
            ? {
                ...item,
                undoStack: recordHistory
                  ? [...item.undoStack.slice(-24), new Uint8Array(item.mask)]
                  : item.undoStack,
                redoStack: recordHistory ? [] : item.redoStack,
                mask: newMask,
                zones,
                coveragePercent,
                cleanedData: cleaned,
                cleanedUrl: imageDataToDataUrl(cleaned),
                processingMs: Math.max(1, Math.round(t1 - t0)),
                quality,
              }
            : item
        )
      );
    },
    [activeItem, inpaintMethod]
  );

  // Undo last mask modification on the active item
  const undoMask = useCallback(() => {
    if (!activeItem || activeItem.undoStack.length === 0) return;
    const previousMask = activeItem.undoStack[activeItem.undoStack.length - 1];
    const nextUndoStack = activeItem.undoStack.slice(0, -1);
    const nextRedoStack = [...activeItem.redoStack, new Uint8Array(activeItem.mask)];

    const t0 = performance.now();
    const cleaned = removeWatermark(activeItem.originalData, previousMask, inpaintMethod);
    const quality = computeReconstructionQuality(activeItem.originalData, cleaned, previousMask);
    const t1 = performance.now();

    const totalPixels = activeItem.width * activeItem.height;
    let maskedCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (previousMask[i] > 0) maskedCount++;
    }
    const coveragePercent = Number(((maskedCount / totalPixels) * 100).toFixed(2));
    const zones = extractDetectionZones(previousMask, activeItem.width, activeItem.height);

    setQueue((prev) =>
      prev.map((item) =>
        item.id === activeItem.id
          ? {
              ...item,
              mask: previousMask,
              undoStack: nextUndoStack,
              redoStack: nextRedoStack,
              zones,
              coveragePercent,
              cleanedData: cleaned,
              cleanedUrl: imageDataToDataUrl(cleaned),
              processingMs: Math.max(1, Math.round(t1 - t0)),
              quality,
            }
          : item
      )
    );
  }, [activeItem, inpaintMethod]);

  // Redo previously undone mask modification on the active item
  const redoMask = useCallback(() => {
    if (!activeItem || activeItem.redoStack.length === 0) return;
    const restoredMask = activeItem.redoStack[activeItem.redoStack.length - 1];
    const nextRedoStack = activeItem.redoStack.slice(0, -1);
    const nextUndoStack = [...activeItem.undoStack, new Uint8Array(activeItem.mask)];

    const t0 = performance.now();
    const cleaned = removeWatermark(activeItem.originalData, restoredMask, inpaintMethod);
    const quality = computeReconstructionQuality(activeItem.originalData, cleaned, restoredMask);
    const t1 = performance.now();

    const totalPixels = activeItem.width * activeItem.height;
    let maskedCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (restoredMask[i] > 0) maskedCount++;
    }
    const coveragePercent = Number(((maskedCount / totalPixels) * 100).toFixed(2));
    const zones = extractDetectionZones(restoredMask, activeItem.width, activeItem.height);

    setQueue((prev) =>
      prev.map((item) =>
        item.id === activeItem.id
          ? {
              ...item,
              mask: restoredMask,
              undoStack: nextUndoStack,
              redoStack: nextRedoStack,
              zones,
              coveragePercent,
              cleanedData: cleaned,
              cleanedUrl: imageDataToDataUrl(cleaned),
              processingMs: Math.max(1, Math.round(t1 - t0)),
              quality,
            }
          : item
      )
    );
  }, [activeItem, inpaintMethod]);

  // Prompt confirmation dialog before resetting the active mask
  const handleResetMaskClick = useCallback(() => {
    if (!activeItem) return;
    // If the mask is already completely blank and has no history, nothing to reset
    if (activeItem.coveragePercent === 0 && activeItem.undoStack.length === 0) {
      return;
    }
    setShowResetConfirmModal(true);
  }, [activeItem]);

  // Execute mask reset with undo history preserved
  const confirmResetMask = useCallback(() => {
    if (!activeItem) return;
    applyCustomMaskToActiveItem(
      new Uint8Array(activeItem.width * activeItem.height),
      { recordHistory: true }
    );
    setShowResetConfirmModal(false);
  }, [activeItem, applyCustomMaskToActiveItem]);

  // Number of target queued items with at least one undo action available in their history stack
  const batchUndoableCount = useMemo(() => {
    return activeTargetQueue.filter((item) => item.undoStack.length > 0).length;
  }, [activeTargetQueue]);

  // Batch Undo: Reverts the last action across target items currently in the queue using each item's undo history stack
  const batchUndoQueue = useCallback(async () => {
    const itemsToUndo = activeTargetQueue.filter((item) => item.undoStack.length > 0);
    if (itemsToUndo.length === 0 || isBatchProcessing || isZipping) return;

    const isBatch = itemsToUndo.length > 1;
    if (isBatch) {
      setIsBatchProcessing(true);
      setBatchProgress({
        active: true,
        title: 'Batch Undoing Last Action',
        current: 0,
        total: itemsToUndo.length,
        percentage: 0,
        currentFileName: itemsToUndo[0]?.name,
        isComplete: false,
      });
    }

    const updatedQueueMap = new Map<string, QueueItem>();

    for (let i = 0; i < itemsToUndo.length; i++) {
      const item = itemsToUndo[i];

      if (isBatch) {
        setBatchProgress({
          active: true,
          title: 'Batch Undoing Last Action',
          current: i,
          total: itemsToUndo.length,
          percentage: Math.round((i / itemsToUndo.length) * 100),
          currentFileName: item.name,
          isComplete: false,
        });
        await new Promise((r) => setTimeout(r, 15));
      }

      const previousMask = item.undoStack[item.undoStack.length - 1];
      const nextUndoStack = item.undoStack.slice(0, -1);
      const nextRedoStack = [...item.redoStack, new Uint8Array(item.mask)];

      const t0 = performance.now();
      const cleaned = removeWatermark(item.originalData, previousMask, inpaintMethod);
      const quality = computeReconstructionQuality(item.originalData, cleaned, previousMask);
      const t1 = performance.now();

      const totalPixels = item.width * item.height;
      let maskedCount = 0;
      for (let p = 0; p < totalPixels; p++) {
        if (previousMask[p] > 0) maskedCount++;
      }
      const coveragePercent = Number(((maskedCount / totalPixels) * 100).toFixed(2));
      const zones = extractDetectionZones(previousMask, item.width, item.height);

      updatedQueueMap.set(item.id, {
        ...item,
        mask: previousMask,
        undoStack: nextUndoStack,
        redoStack: nextRedoStack,
        zones,
        coveragePercent,
        cleanedData: cleaned,
        cleanedUrl: imageDataToDataUrl(cleaned),
        processingMs: Math.max(1, Math.round(t1 - t0)),
        status: 'cleaned',
        quality,
      });
    }

    setQueue((prev) =>
      prev.map((item) => updatedQueueMap.get(item.id) || item)
    );

    if (isBatch) {
      setBatchProgress({
        active: true,
        title: 'Batch Undo Complete',
        current: itemsToUndo.length,
        total: itemsToUndo.length,
        percentage: 100,
        currentFileName: `Reverted ${itemsToUndo.length} queued items`,
        isComplete: true,
      });

      setTimeout(() => {
        setBatchProgress(null);
        setIsBatchProcessing(false);
      }, 1200);
    }
  }, [activeTargetQueue, isBatchProcessing, isZipping, inpaintMethod]);

  // Helper to load and process a single image file
  const processImageFile = useCallback(
    (file: File): Promise<QueueItem | null> => {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (!dataUrl) {
            resolve(null);
            return;
          }
          const img = new Image();
          img.onload = () => {
            const maxDim = 1600;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              const scale = maxDim / Math.max(w, h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            const origData = ctx.getImageData(0, 0, w, h);
            const resizedOrigUrl = c.toDataURL('image/png');

            let mask: Uint8Array = new Uint8Array(w * h);
            let zones: DetectionZone[] = [];
            let coveragePercent = 0;
            let cleanedData = origData;
            let cleanedUrl = resizedOrigUrl;
            let processingMs = 0;
            let quality = computeReconstructionQuality(origData, cleanedData, mask);

            if (autoCleanOnUpload) {
              const res = runAutomaticPipeline(origData);
              mask = res.mask;
              zones = res.zones;
              coveragePercent = res.coveragePercent;
              cleanedData = res.cleanedData;
              cleanedUrl = res.cleanedUrl;
              processingMs = res.processingMs;
              quality = res.quality;
            }

            resolve({
              id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name || `clipboard-${Date.now()}.png`,
              width: w,
              height: h,
              originalData: origData,
              cleanedData,
              mask,
              undoStack: [],
              redoStack: [],
              zones,
              coveragePercent,
              processingMs,
              originalUrl: resizedOrigUrl,
              cleanedUrl,
              status: 'cleaned',
              quality,
            });
          };
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    },
    [autoCleanOnUpload, runAutomaticPipeline]
  );

  // Handle file uploads (single or batch, plus clipboard files) with queue progress feedback
  const handleFilesSelected = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      const fileList = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (fileList.length === 0) return;

      const isBatch = fileList.length > 1;
      if (isBatch) {
        setIsBatchProcessing(true);
        setBatchProgress({
          active: true,
          title: 'Importing & Cleaning Batch',
          current: 0,
          total: fileList.length,
          percentage: 0,
          currentFileName: fileList[0].name,
          isComplete: false,
        });
      }

      for (let index = 0; index < fileList.length; index++) {
        const file = fileList[index];
        if (isBatch) {
          setBatchProgress({
            active: true,
            title: 'Importing & Cleaning Batch',
            current: index,
            total: fileList.length,
            percentage: Math.round((index / fileList.length) * 100),
            currentFileName: file.name,
            isComplete: false,
          });
          await new Promise((r) => setTimeout(r, 15));
        }

        const newItem = await processImageFile(file);
        if (newItem) {
          setQueue((prev) => [newItem, ...prev]);
          setSelectedIds((prev) => new Set([...prev, newItem.id]));
          if (index === 0) {
            setActiveId(newItem.id);
          }
        }

        if (isBatch) {
          const isDone = index === fileList.length - 1;
          setBatchProgress({
            active: true,
            title: isDone ? 'Batch Import Complete' : 'Importing & Cleaning Batch',
            current: index + 1,
            total: fileList.length,
            percentage: Math.round(((index + 1) / fileList.length) * 100),
            currentFileName: file.name,
            isComplete: isDone,
          });
        }
      }

      if (isBatch) {
        setTimeout(() => {
          setBatchProgress(null);
          setIsBatchProcessing(false);
        }, 1400);
      }
    },
    [processImageFile]
  );

  // Paste image directly from clipboard (WatermarkRemover.io Ctrl+V workflow)
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setClipboardStatus('Press Ctrl+V / Cmd+V anywhere to paste an image');
        setTimeout(() => setClipboardStatus(null), 3000);
        return;
      }
      const items = await navigator.clipboard.read();
      const imageFiles: File[] = [];
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          imageFiles.push(new File([blob], `pasted-image-${Date.now()}.png`, { type: imgType }));
        }
      }
      if (imageFiles.length > 0) {
        handleFilesSelected(imageFiles);
        setClipboardStatus('Pasted & auto-cleaned from clipboard');
      } else {
        setClipboardStatus('No image found in clipboard');
      }
      setTimeout(() => setClipboardStatus(null), 2500);
    } catch {
      setClipboardStatus('Press Ctrl+V / Cmd+V to paste image from clipboard');
      setTimeout(() => setClipboardStatus(null), 3000);
    }
  }, [handleFilesSelected]);

  // Global keyboard shortcuts (Ctrl+Z, Ctrl+Y, Escape, and Ctrl+V clipboard image paste)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        if (showResetConfirmModal) {
          setShowResetConfirmModal(false);
          return;
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redoMask();
        } else {
          undoMask();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoMask();
      }
    };

    const handlePasteEvent = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFilesSelected(files);
        setClipboardStatus('Pasted & auto-cleaned from clipboard');
        setTimeout(() => setClipboardStatus(null), 2500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePasteEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePasteEvent);
    };
  }, [undoMask, redoMask, handleFilesSelected, showResetConfirmModal]);

  // Render the active image, split comparison, mask overlay, and detection zones onto the main canvas
  useEffect(() => {
    if (viewMode === 'side-by-side') return;
    const canvas = displayCanvasRef.current;
    if (!canvas || !activeItem) return;
    canvas.width = activeItem.width;
    canvas.height = activeItem.height;
    const ctx = canvas.getContext('2d')!;

    const cleanCanvas = document.createElement('canvas');
    cleanCanvas.width = activeItem.width;
    cleanCanvas.height = activeItem.height;
    cleanCanvas.getContext('2d')!.putImageData(activeItem.cleanedData, 0, 0);

    const origCanvas = document.createElement('canvas');
    origCanvas.width = activeItem.width;
    origCanvas.height = activeItem.height;
    origCanvas.getContext('2d')!.putImageData(activeItem.originalData, 0, 0);

    const effectiveMode = isHoldingOriginal ? 'original' : viewMode;

    if (effectiveMode === 'clean') {
      ctx.drawImage(cleanCanvas, 0, 0);
    } else if (effectiveMode === 'original') {
      ctx.drawImage(origCanvas, 0, 0);
    } else if (effectiveMode === 'compare') {
      ctx.drawImage(cleanCanvas, 0, 0);
      const splitX = Math.round((comparePosition / 100) * activeItem.width);
      if (splitX > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, splitX, activeItem.height);
        ctx.clip();
        ctx.drawImage(origCanvas, 0, 0);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(2, Math.round(activeItem.width / 400));
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, activeItem.height);
      ctx.stroke();
      ctx.restore();
    } else if (effectiveMode === 'mask') {
      ctx.drawImage(origCanvas, 0, 0);
      const overlay = ctx.getImageData(0, 0, activeItem.width, activeItem.height);
      const od = overlay.data;
      const mask = activeItem.mask;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 0) {
          const p = i * 4;
          od[p] = Math.min(255, Math.round(od[p] * 0.35 + 239 * 0.65));
          od[p + 1] = Math.min(255, Math.round(od[p + 1] * 0.35 + 68 * 0.65));
          od[p + 2] = Math.min(255, Math.round(od[p + 2] * 0.35 + 68 * 0.65));
        }
      }
      ctx.putImageData(overlay, 0, 0);
    }

    if (showZoneBoxes && !isHoldingOriginal && (effectiveMode === 'mask' || effectiveMode === 'compare')) {
      ctx.save();
      const splitX = effectiveMode === 'compare' ? (comparePosition / 100) * activeItem.width : activeItem.width;
      activeItem.zones.forEach((z) => {
        if (effectiveMode === 'compare' && z.x > splitX) return;
        ctx.strokeStyle = z.category === 'logo' ? 'rgba(168, 85, 247, 0.9)' : 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(z.x - 4, z.y - 4, z.width + 8, z.height + 8);
      });
      ctx.restore();
    }

    if (dragRect) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 2;
      const rx = Math.min(dragRect.x0, dragRect.x1);
      const ry = Math.min(dragRect.y0, dragRect.y1);
      const rw = Math.abs(dragRect.x1 - dragRect.x0);
      const rh = Math.abs(dragRect.y1 - dragRect.y0);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }
  }, [activeItem, viewMode, comparePosition, showZoneBoxes, dragRect, isHoldingOriginal]);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.max(0, Math.min(canvas.width - 1, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height - 1, (e.clientY - rect.top) * scaleY)),
    };
  };

  const paintBrushStroke = (cx: number, cy: number, isAdd: boolean, recordHistory: boolean) => {
    if (!activeItem) return;
    const { width, height, mask } = activeItem;
    const r = Math.max(2, Math.round(brushSize));
    const rSq = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));

    const nextMask = new Uint8Array(mask);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rSq) {
          nextMask[y * width + x] = isAdd ? 255 : 0;
        }
      }
    }
    applyCustomMaskToActiveItem(nextMask, { recordHistory });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeItem) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;
    const { x, y } = getCanvasCoords(e);

    if (activeTool === 'compare') {
      setViewMode('compare');
      setComparePosition(Math.max(0, Math.min(100, (x / activeItem.width) * 100)));
    } else if (activeTool === 'brush-add' || activeTool === 'brush-erase') {
      paintBrushStroke(x, y, activeTool === 'brush-add', true);
    } else if (activeTool === 'rect-add') {
      rectStartRef.current = { x, y };
      setDragRect({ x0: x, y0: y, x1: x, y1: y });
    } else if (activeTool === 'magic-wand') {
      const nextMask = magicWandMask(activeItem.originalData, activeItem.mask, x, y, 40, 160);
      applyCustomMaskToActiveItem(nextMask, { recordHistory: true });
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current || !activeItem) return;
    const { x, y } = getCanvasCoords(e);

    if (activeTool === 'compare') {
      setComparePosition(Math.max(0, Math.min(100, (x / activeItem.width) * 100)));
    } else if (activeTool === 'brush-add' || activeTool === 'brush-erase') {
      paintBrushStroke(x, y, activeTool === 'brush-add', false);
    } else if (activeTool === 'rect-add' && rectStartRef.current) {
      setDragRect({
        x0: rectStartRef.current.x,
        y0: rectStartRef.current.y,
        x1: x,
        y1: y,
      });
    }
  };

  const handleCanvasPointerUp = () => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    if (activeTool === 'rect-add' && dragRect && activeItem) {
      const x0 = Math.max(0, Math.floor(Math.min(dragRect.x0, dragRect.x1)));
      const x1 = Math.min(activeItem.width - 1, Math.ceil(Math.max(dragRect.x0, dragRect.x1)));
      const y0 = Math.max(0, Math.floor(Math.min(dragRect.y0, dragRect.y1)));
      const y1 = Math.min(activeItem.height - 1, Math.ceil(Math.max(dragRect.y0, dragRect.y1)));

      if (x1 - x0 >= 4 && y1 - y0 >= 4) {
        const nextMask = new Uint8Array(activeItem.mask);
        for (let y = y0; y <= y1; y++) {
          const row = y * activeItem.width;
          for (let x = x0; x <= x1; x++) {
            nextMask[row + x] = 255;
          }
        }
        applyCustomMaskToActiveItem(nextMask, { recordHistory: true });
      }
      rectStartRef.current = null;
      setDragRect(null);
    }
  };

  // Rename a specific queue item
  const handleRenameItem = useCallback((id: string, newName: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: newName } : item))
    );
  }, []);

  // Batch rename multiple queue items using generated pattern mapping
  const handleApplyBatchRename = useCallback((renamedMap: Map<string, string>) => {
    setQueue((prev) =>
      prev.map((item) => {
        const newName = renamedMap.get(item.id);
        return newName ? { ...item, name: newName } : item;
      })
    );
  }, []);

  // Download single cleaned image (respects Smart Optimize settings)
  const downloadItem = async (item: QueueItem) => {
    const trimmed = item.name.trim() || 'cleaned-image';
    const baseName = trimmed.replace(/\.[^.]+$/, '');

    if (smartOptimize) {
      const opt = await optimizeCleanedImage(item.cleanedData, {
        enabled: true,
        format: optimizeFormat,
        quality: optimizeQuality,
        stripMetadata: true,
      });
      const url = URL.createObjectURL(opt.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.${opt.extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const a = document.createElement('a');
      a.href = item.cleanedUrl;
      a.download = `${baseName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Batch re-process all queued items (or active selection) with current automatic settings
  const batchCleanTarget = async () => {
    const targetItems = activeTargetQueue;
    if (targetItems.length === 0 || isBatchProcessing || isZipping) return;
    setIsBatchProcessing(true);

    const targetIdSet = new Set(targetItems.map((q) => q.id));

    // Set targeted queue items to processing status
    setQueue((prev) =>
      prev.map((item) => (targetIdSet.has(item.id) ? { ...item, status: 'processing' } : item))
    );

    setBatchProgress({
      active: true,
      title:
        targetItems.length === queue.length
          ? 'Re-cleaning Batch Queue'
          : `Re-cleaning ${targetItems.length} Selected`,
      current: 0,
      total: targetItems.length,
      percentage: 0,
      currentFileName: targetItems[0]?.name,
      isComplete: false,
    });

    for (let i = 0; i < targetItems.length; i++) {
      const item = targetItems[i];

      setBatchProgress({
        active: true,
        title:
          targetItems.length === queue.length
            ? 'Re-cleaning Batch Queue'
            : `Re-cleaning ${targetItems.length} Selected`,
        current: i,
        total: targetItems.length,
        percentage: Math.round((i / targetItems.length) * 100),
        currentFileName: item.name,
        isComplete: false,
      });

      // Yield thread briefly for smooth UI update and animation
      await new Promise((r) => setTimeout(r, 25));

      const res = runAutomaticPipeline(item.originalData);

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                undoStack: [...q.undoStack.slice(-24), new Uint8Array(q.mask)],
                redoStack: [],
                mask: res.mask,
                zones: res.zones,
                coveragePercent: res.coveragePercent,
                cleanedData: res.cleanedData,
                cleanedUrl: res.cleanedUrl,
                processingMs: res.processingMs,
                status: 'cleaned',
                quality: res.quality,
              }
            : q
        )
      );

      const isLast = i === targetItems.length - 1;
      setBatchProgress({
        active: true,
        title: isLast
          ? 'Batch Re-Clean Complete'
          : targetItems.length === queue.length
          ? 'Re-cleaning Batch Queue'
          : `Re-cleaning ${targetItems.length} Selected`,
        current: i + 1,
        total: targetItems.length,
        percentage: Math.round(((i + 1) / targetItems.length) * 100),
        currentFileName: item.name,
        isComplete: isLast,
      });
    }

    setTimeout(() => {
      setBatchProgress(null);
      setIsBatchProcessing(false);
    }, 1400);
  };

  // Zip and download cleaned images in the queue (or active selection) with compression progress & optional Smart Optimization
  const downloadAllCleanedAsZip = async () => {
    const targetItems = activeTargetQueue;
    if (targetItems.length === 0 || isZipping || isBatchProcessing) return;
    setIsZipping(true);
    setBatchProgress({
      active: true,
      title: smartOptimize ? 'Smart Optimizing & Packaging' : 'Packaging ZIP Archive',
      current: 0,
      total: targetItems.length,
      percentage: 0,
      currentFileName: smartOptimize ? 'Stripping metadata & compressing...' : 'Preparing images...',
      isComplete: false,
    });

    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      let totalOriginalBytes = 0;
      let totalOptimizedBytes = 0;

      for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        const trimmed = item.name.trim() || `image-${i + 1}`;
        const baseName = trimmed.replace(/\.[^.]+$/, '');

        const opt = await optimizeCleanedImage(item.cleanedData, {
          enabled: smartOptimize,
          format: optimizeFormat,
          quality: optimizeQuality,
          stripMetadata: true,
        });

        totalOriginalBytes += opt.originalBytes;
        totalOptimizedBytes += opt.sizeBytes;

        const count = usedNames.get(baseName) || 0;
        usedNames.set(baseName, count + 1);
        const fileName = count === 0 ? `${baseName}.${opt.extension}` : `${baseName}-${count + 1}.${opt.extension}`;

        zip.file(fileName, opt.blob);

        const savedInfo = smartOptimize && opt.savedPercent > 0 ? ` · -${opt.savedPercent}%` : '';
        setBatchProgress({
          active: true,
          title: smartOptimize ? 'Smart Optimizing & Packaging' : 'Packaging ZIP Archive',
          current: i + 1,
          total: targetItems.length,
          percentage: Math.round(((i + 1) / targetItems.length) * 45),
          currentFileName: `${fileName} (${formatBytes(opt.sizeBytes)}${savedInfo})`,
          isComplete: false,
        });
        await new Promise((r) => setTimeout(r, 10));
      }

      const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setBatchProgress({
          active: true,
          title: 'Compressing ZIP Package',
          current: targetItems.length,
          total: targetItems.length,
          percentage: Math.min(100, Math.round(45 + metadata.percent * 0.55)),
          currentFileName: metadata.currentFile || 'Compressing data...',
          isComplete: metadata.percent >= 99,
        });
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clearframe-cleaned-${targetItems.length}-images.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const savedBytes = Math.max(0, totalOriginalBytes - totalOptimizedBytes);
      const overallSavedPercent = totalOriginalBytes > 0 ? Math.round((savedBytes / totalOriginalBytes) * 100) : 0;

      setBatchProgress({
        active: true,
        title: smartOptimize && overallSavedPercent > 0
          ? `ZIP Downloaded · Saved ${overallSavedPercent}% (${formatBytes(savedBytes)})`
          : 'ZIP Download Complete',
        current: targetItems.length,
        total: targetItems.length,
        percentage: 100,
        currentFileName: `Total payload: ${formatBytes(totalOptimizedBytes)} · Metadata stripped`,
        isComplete: true,
      });

      setTimeout(() => {
        setBatchProgress(null);
      }, 2000);
    } finally {
      setIsZipping(false);
    }
  };

  // Bulk crop queued images (or active item) with consistent aspect ratio, corner margin trim, or coordinate box
  const handleApplyBulkCrop = useCallback(
    async (
      params: CropParameters,
      scope: 'all' | 'active',
      recleanAfterCrop: boolean
    ) => {
      if (queue.length === 0 || isBulkCropping) return;
      setIsBulkCropping(true);

      const targetItems = scope === 'active' && activeItem ? [activeItem] : [...activeTargetQueue];
      const isBatch = targetItems.length > 1;

      if (isBatch) {
        setIsBatchProcessing(true);
        setBatchProgress({
          active: true,
          title: 'Bulk Cropping Images',
          current: 0,
          total: targetItems.length,
          percentage: 0,
          currentFileName: targetItems[0]?.name,
          isComplete: false,
        });
      }

      const updatedQueueMap = new Map<string, QueueItem>();

      for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        if (isBatch) {
          setBatchProgress({
            active: true,
            title: 'Bulk Cropping Images',
            current: i,
            total: targetItems.length,
            percentage: Math.round((i / targetItems.length) * 100),
            currentFileName: item.name,
            isComplete: false,
          });
          await new Promise((r) => setTimeout(r, 15));
        }

        // Compute crop coordinates for this specific image's dimensions
        const rect = calculateCropRect(item.width, item.height, params);

        // Crop original image data
        const croppedOrig = cropImageData(item.originalData, rect);

        let cleanedData: ImageData;
        let cleanedUrl: string;
        let mask: Uint8Array;
        let zones: DetectionZone[];
        let coveragePercent: number;
        let processingMs: number;
        let quality: ReconstructionQuality;

        if (recleanAfterCrop) {
          const res = runAutomaticPipeline(croppedOrig);
          cleanedData = res.cleanedData;
          mask = res.mask;
          zones = res.zones;
          coveragePercent = res.coveragePercent;
          processingMs = res.processingMs;
          cleanedUrl = res.cleanedUrl;
          quality = res.quality;
        } else {
          cleanedData = cropImageData(item.cleanedData, rect);
          cleanedUrl = imageDataToDataUrl(cleanedData);
          mask = new Uint8Array(croppedOrig.width * croppedOrig.height);
          zones = [];
          coveragePercent = 0;
          processingMs = item.processingMs;
          quality = computeReconstructionQuality(croppedOrig, cleanedData, mask);
        }

        const originalUrl = imageDataToDataUrl(croppedOrig);

        const updatedItem: QueueItem = {
          ...item,
          width: croppedOrig.width,
          height: croppedOrig.height,
          originalData: croppedOrig,
          cleanedData,
          mask,
          undoStack: [],
          redoStack: [],
          zones,
          coveragePercent,
          processingMs,
          originalUrl,
          cleanedUrl,
          status: 'cleaned',
          quality,
        };

        updatedQueueMap.set(item.id, updatedItem);

        if (isBatch) {
          const isLast = i === targetItems.length - 1;
          setBatchProgress({
            active: true,
            title: isLast ? 'Bulk Crop Complete' : 'Bulk Cropping Images',
            current: i + 1,
            total: targetItems.length,
            percentage: Math.round(((i + 1) / targetItems.length) * 100),
            currentFileName: item.name,
            isComplete: isLast,
          });
        }
      }

      setQueue((prev) =>
        prev.map((item) => updatedQueueMap.get(item.id) || item)
      );

      setIsBulkCropping(false);
      setShowBulkCropModal(false);

      if (isBatch) {
        setTimeout(() => {
          setBatchProgress(null);
          setIsBatchProcessing(false);
        }, 1400);
      }
    },
    [queue, activeTargetQueue, activeItem, isBulkCropping, runAutomaticPipeline]
  );

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        handleFilesSelected(e.dataTransfer.files);
      }}
    >
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          ClearFrame Studio
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#workspace"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Workspace
          </a>
          <a
            href="#presets"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Test Presets
          </a>
          <a
            href="#batch-queue"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Batch Queue
          </a>
          <a
            href="#architecture"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Offline Engine
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />
          <button
            onClick={() => activeItem && downloadItem(activeItem)}
            disabled={!activeItem}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Clean PNG</span>
          </button>
        </div>
      </header>

      {/* Hidden file input for single & batch upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Drag & drop full-window overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-blue-950/80 flex items-center justify-center p-8 pointer-events-none">
          <div className="max-w-md w-full rounded-2xl border-2 border-dashed border-sky-400 bg-slate-900/95 p-8 text-center space-y-3">
            <Upload className="w-10 h-10 text-sky-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Drop Images for Instant Offline Removal</h2>
            <p className="text-sm text-slate-300">
              Watermarks are automatically detected and inpainted locally on your device.
            </p>
          </div>
        </div>
      )}

      {/* Workspace Sub-Toolbar: Breadcrumbs, Offline readiness, and Theme / Upload controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-900 dark:text-slate-200">Studio Workbench</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span>{activeItem ? activeItem.name : 'No Image Loaded'}</span>
          {activeItem && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeItem.width}×{activeItem.height}px
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeItem.zones.length} {activeItem.zones.length === 1 ? 'zone' : 'zones'} detected ({activeItem.coveragePercent}% mask)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Processed in {activeItem.processingMs}ms
              </span>
              {activeItem.quality && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="font-mono tabular-nums flex items-center gap-1.5"
                    title={`Reconstruction Quality: ${activeItem.quality.score}% SSIM (${activeItem.quality.label})\nLuminance: ${activeItem.quality.luminanceScore}%\nContrast: ${activeItem.quality.contrastScore}%\nStructure: ${activeItem.quality.structureScore}%`}
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        getQualityBadgeStyles(activeItem.quality.tier).dotBg
                      }`}
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {activeItem.quality.score}% SSIM
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      ({activeItem.quality.label})
                    </span>
                  </span>
                </>
              )}
            </>
          )}
          {clipboardStatus && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-blue-600 dark:text-sky-400 font-medium">{clipboardStatus}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              {isOnline
                ? '100% Local Processing · Offline Cache Ready'
                : 'Offline Mode Active · Running From Local Cache'}
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">|</span>

          <button
            onClick={() => setIsDark(!isDark)}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Toggle Light / Dark Studio Theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span>{isDark ? 'Light Canvas' : 'Dark Canvas'}</span>
          </button>
        </div>
      </div>

      {/* Main 1440px+ Studio Layout: Left Automatic Controls Sidebar + Center Interactive Viewport + Right Inspector */}
      <main id="workspace" className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-110px)]">
        {/* Left Sidebar: Automatic Detection & Inpainting Controls */}
        <aside className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            {/* Upload Dropzone + Clipboard Paste Button */}
            <div className="space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-blue-500 dark:hover:border-blue-500 p-3.5 text-left transition-colors group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Import Photos (Single or Batch)
                  </span>
                  <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Drop PNG, JPG, or WebP files or press Ctrl+V to paste.
                </p>
              </button>

              <button
                onClick={handlePasteFromClipboard}
                className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Paste Image from Clipboard (Ctrl+V)</span>
              </button>

              <label className="pt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <span>Automatically detect & remove on import</span>
                <input
                  type="checkbox"
                  checked={autoCleanOnUpload}
                  onChange={(e) => setAutoCleanOnUpload(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>

            {/* WatermarkRemover.io Signature Toggles: Remove Text & Remove Logo */}
            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  01. Target Layer Isolation
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Auto-Classified
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const next = !removeText;
                    setRemoveText(next);
                    rerunActiveItemAuto({ remText: next });
                  }}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    removeText
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Type className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                    <span className="text-[11px] font-mono tabular-nums font-semibold">
                      {removeText ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-semibold whitespace-nowrap">Remove Text</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    Captions, IDs & dates
                  </div>
                </button>

                <button
                  onClick={() => {
                    const next = !removeLogo;
                    setRemoveLogo(next);
                    rerunActiveItemAuto({ remLogo: next });
                  }}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    removeLogo
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Shapes className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span className="text-[11px] font-mono tabular-nums font-semibold">
                      {removeLogo ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-semibold whitespace-nowrap">Remove Logo</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    Symbols & emblems
                  </div>
                </button>
              </div>
            </div>

            {/* Section 2: Automatic Detection Profile */}
            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  02. Detection Scan Mode
                </h2>
                <button
                  onClick={() => rerunActiveItemAuto()}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Re-Scan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {(
                  [
                    {
                      id: 'smart-auto',
                      title: 'Full Auto (Smart Scan)',
                      desc: 'Scans corners, timestamps & translucent text',
                    },
                    {
                      id: 'corner-stamp',
                      title: 'Corner Logo & Date Stamp',
                      desc: 'Targets outer margin logos & camera quartz dates',
                    },
                    {
                      id: 'diagonal-tiled',
                      title: 'Tiled / Diagonal Proof Mesh',
                      desc: 'Detects repeating stock proof patterns across frame',
                    },
                    {
                      id: 'luminance-key',
                      title: 'Translucent White Overlay',
                      desc: 'Isolates high-luminance semi-transparent marks',
                    },
                  ] as const
                ).map((mode) => {
                  const active = detectionMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setDetectionMode(mode.id);
                        rerunActiveItemAuto({ mode: mode.id });
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-600 dark:border-blue-500 text-slate-900 dark:text-white'
                          : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{mode.title}</span>
                        {active && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{mode.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Sensitivity & Mask Expansion Sliders */}
            <div className="space-y-3.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                03. Scanner Sensitivity & Feathering
              </h2>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="sens-slider" className="text-slate-600 dark:text-slate-300">
                    Detection Sensitivity
                  </label>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {sensitivity}%
                  </span>
                </div>
                <input
                  id="sens-slider"
                  type="range"
                  min={20}
                  max={92}
                  value={sensitivity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSensitivity(val);
                    rerunActiveItemAuto({ sens: val });
                  }}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="dilate-slider" className="text-slate-600 dark:text-slate-300">
                    Halo Edge Expansion (Dilation)
                  </label>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {dilationRadius}px
                  </span>
                </div>
                <input
                  id="dilate-slider"
                  type="range"
                  min={1}
                  max={14}
                  value={dilationRadius}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDilationRadius(val);
                    rerunActiveItemAuto({ dilate: val });
                  }}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Target Region Checkboxes */}
              <div className="space-y-1.5 pt-1">
                <span className="block text-xs text-slate-600 dark:text-slate-300">
                  Active Scan Zones
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {(
                    [
                      { key: 'bottomRight', label: 'Bottom-Right' },
                      { key: 'bottomLeft', label: 'Bottom-Left' },
                      { key: 'topRight', label: 'Top-Right' },
                      { key: 'topLeft', label: 'Top-Left' },
                      { key: 'centerAndTiled', label: 'Center & Tiled' },
                    ] as const
                  ).map((zone) => (
                    <label
                      key={zone.key}
                      className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={targetCorners[zone.key]}
                        onChange={(e) => {
                          const next = { ...targetCorners, [zone.key]: e.target.checked };
                          setTargetCorners(next);
                          rerunActiveItemAuto({ corners: next });
                        }}
                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                      />
                      <span className="truncate">{zone.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 4: Reconstruction Algorithm */}
            <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                04. Offline Reconstruction Solver
              </h2>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { id: 'hybrid-smart', label: 'Hybrid Alpha+Telea' },
                    { id: 'patch-synthesis', label: 'Patch Synthesis' },
                    { id: 'telea-inpaint', label: 'Fast Marching' },
                    { id: 'alpha-unblend', label: 'Alpha De-blend' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setInpaintMethod(m.id);
                      if (activeItem) {
                        applyCustomMaskToActiveItem(activeItem.mask, {
                          methodOverride: m.id,
                          recordHistory: false,
                        });
                      }
                    }}
                    className={`py-1.5 px-2 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      inpaintMethod === m.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Primary Re-Run Action */}
          <button
            onClick={() => rerunActiveItemAuto()}
            disabled={!activeItem}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Auto-Detect & Clean Watermark</span>
          </button>
        </aside>

        {/* Center Interactive Viewport */}
        <section className="lg:col-span-6 flex flex-col bg-slate-100 dark:bg-slate-950 studio-checkerboard relative">
          {/* Interactive Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800">
            {/* Left: Interactive Refinement Tools */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'compare', label: 'Slide Compare', icon: MoveHorizontal },
                  { id: 'rect-add', label: 'Box Erase', icon: Square },
                  { id: 'magic-wand', label: 'Magic Wand', icon: Wand2 },
                  { id: 'brush-add', label: 'Brush Inpaint', icon: Brush },
                  { id: 'brush-erase', label: 'Restore Orig', icon: Eraser },
                ] as const
              ).map((tool) => {
                const Icon = tool.icon;
                const isActive = activeTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => {
                      setActiveTool(tool.id);
                      if (tool.id === 'compare' && viewMode === 'side-by-side') {
                        setViewMode('compare');
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{tool.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right: View Mode Switcher (including WatermarkRemover.io Side-by-Side mode) */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'compare', label: 'Split Slider' },
                  { id: 'side-by-side', label: 'Side-by-Side' },
                  { id: 'clean', label: 'Clean Result' },
                  { id: 'mask', label: 'Mask Map' },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === v.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contextual Brush Size / Undo-Redo / Hold-to-Compare Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-slate-50/90 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
            <div>
              {viewMode === 'side-by-side' ? (
                <span className="flex items-center gap-1.5">
                  <Columns2 className="w-3.5 h-3.5 text-blue-500" />
                  <span>Side-by-Side Inspection: Original Watermarked (Left) vs Cleaned Output (Right).</span>
                </span>
              ) : (
                <>
                  {activeTool === 'compare' && (
                    <span>Drag horizontally across the canvas to compare Original (Left) vs Cleaned (Right).</span>
                  )}
                  {activeTool === 'rect-add' && (
                    <span>Drag a rectangle over any remaining watermark or logo to erase it immediately.</span>
                  )}
                  {activeTool === 'magic-wand' && (
                    <span>Click directly on any watermark letter or tint to flood-select similar pixels.</span>
                  )}
                  {(activeTool === 'brush-add' || activeTool === 'brush-erase') && (
                    <div className="flex items-center gap-3">
                      <span>
                        {activeTool === 'brush-add'
                          ? 'Paint over watermark areas to add to removal mask'
                          : 'Paint to restore original pixels'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>Radius:</span>
                        <input
                          type="range"
                          min={4}
                          max={64}
                          value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-24 accent-blue-600"
                        />
                        <span className="font-mono tabular-nums">{brushSize}px</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {viewMode !== 'side-by-side' && (
                <button
                  onPointerDown={() => setIsHoldingOriginal(true)}
                  onPointerUp={() => setIsHoldingOriginal(false)}
                  onPointerLeave={() => setIsHoldingOriginal(false)}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-blue-500 text-[11px] font-medium select-none cursor-pointer whitespace-nowrap shrink-0"
                  title="Press and hold to compare with original image"
                >
                  Hold for Original
                </button>
              )}

              <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap shrink-0">
                <input
                  type="checkbox"
                  checked={showZoneBoxes}
                  onChange={(e) => setShowZoneBoxes(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600"
                />
                <span>Zones</span>
              </label>

              {activeItem && (
                <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-3">
                  <button
                    onClick={undoMask}
                    disabled={activeItem.undoStack.length === 0}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Undo Mask Change (Ctrl+Z)"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                    {activeItem.undoStack.length > 0 && (
                      <span className="font-mono tabular-nums text-[10px] text-slate-400">
                        ({activeItem.undoStack.length})
                      </span>
                    )}
                  </button>

                  <button
                    onClick={redoMask}
                    disabled={activeItem.redoStack.length === 0}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Redo Mask Change (Ctrl+Y)"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    <span>Redo</span>
                    {activeItem.redoStack.length > 0 && (
                      <span className="font-mono tabular-nums text-[10px] text-slate-400">
                        ({activeItem.redoStack.length})
                      </span>
                    )}
                  </button>

                  <button
                    onClick={handleResetMaskClick}
                    disabled={!activeItem || (activeItem.coveragePercent === 0 && activeItem.undoStack.length === 0)}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title={
                      activeItem?.undoStack && activeItem.undoStack.length > 0
                        ? `Reset mask (${activeItem.undoStack.length} custom edit stroke${activeItem.undoStack.length > 1 ? 's' : ''} recorded)`
                        : 'Clear current mask'
                    }
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Canvas Container */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
            {activeItem ? (
              viewMode === 'side-by-side' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-5xl items-center">
                  <div className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-900 shadow-md">
                    <img
                      src={activeItem.originalUrl}
                      alt="Original watermarked"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto max-h-[62vh] object-contain"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-slate-950/80 text-[11px] font-medium text-slate-200">
                      Original Image
                    </div>
                  </div>
                  <div className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-900 shadow-md">
                    <img
                      src={activeItem.cleanedUrl}
                      alt="Watermark removed"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto max-h-[62vh] object-contain"
                    />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-slate-950/80 text-[11px] font-medium text-sky-300">
                      Watermark Removed
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative max-w-full max-h-[68vh] flex items-center justify-center rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 shadow-lg bg-slate-900">
                  <canvas
                    ref={displayCanvasRef}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    className={`max-w-full max-h-[68vh] w-auto h-auto object-contain select-none touch-none ${
                      activeTool === 'compare'
                        ? 'cursor-ew-resize'
                        : activeTool === 'rect-add' || activeTool === 'magic-wand'
                        ? 'cursor-crosshair'
                        : 'cursor-cell'
                    }`}
                  />

                  {viewMode === 'compare' && !isHoldingOriginal && (
                    <>
                      <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded bg-slate-950/75 text-[11px] font-medium text-slate-200">
                        Original (Watermarked)
                      </div>
                      <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded bg-slate-950/75 text-[11px] font-medium text-sky-300">
                        Cleaned (Inpainted)
                      </div>
                    </>
                  )}
                </div>
              )
            ) : (
              <div className="text-center max-w-sm space-y-3 p-8">
                <ImageIcon className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-base font-semibold">No Frame Selected</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Upload an image from your device, press Ctrl+V to paste, or choose one of the built-in offline watermark presets.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  Select Image File
                </button>
              </div>
            )}
          </div>

          {/* Bottom Split Position Slider for fine control */}
          {activeItem && viewMode === 'compare' && (
            <div className="px-6 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-4">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                Before / After Split Curtain
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={comparePosition}
                onChange={(e) => setComparePosition(Number(e.target.value))}
                className="flex-1 accent-blue-600 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 w-10 text-right">
                {Math.round(comparePosition)}%
              </span>
            </div>
          )}
        </section>

        {/* Right Sidebar: Detected Watermark Regions & Offline Sample Presets + Batch Queue */}
        <aside className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-6 overflow-y-auto">
          {/* Detected Regions List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Auto-Detected Watermark Zones
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {activeItem ? activeItem.zones.length : 0} active
              </span>
            </div>

            {activeItem && activeItem.zones.length > 0 ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {activeItem.zones.map((zone) => (
                  <div key={zone.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {zone.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {zone.category.toUpperCase()} · x:{zone.x} y:{zone.y} · {zone.width}×{zone.height}px
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-emerald-600 dark:text-emerald-400">
                      {zone.confidence}% match
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400">
                No automatic zones isolated. Enable Remove Text / Remove Logo, increase sensitivity, or drag a Box Erase marquee.
              </div>
            )}

            {/* Quick Mask Morpher Buttons */}
            {activeItem && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    const expanded = dilateMask(activeItem.mask, activeItem.width, activeItem.height, 2);
                    applyCustomMaskToActiveItem(expanded, { recordHistory: true });
                  }}
                  className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Expand Mask +2px
                </button>
                <button
                  onClick={() => setViewMode(viewMode === 'mask' ? 'compare' : 'mask')}
                  className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{viewMode === 'mask' ? 'Hide Mask' : 'Inspect Mask'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Built-in Offline Test Samples */}
          <div id="presets" className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Instant Offline Test Presets
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Click any sample to generate a watermarked photo and run automatic removal.
              </p>
            </div>

            <div className="space-y-2">
              {OFFLINE_SAMPLES.map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => loadSamplePreset(sample)}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {sample.title}
                    </span>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                      Load & Clean
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {sample.subtitle} · {sample.watermarkType}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Batch Queue Panel */}
          <div id="batch-queue" className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  Processed Queue ({queue.length})
                </h2>
                {isBatchProcessing && (
                  <span className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-sky-400 font-medium shrink-0">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Processing</span>
                  </span>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2 shrink-0">
                {/* Select All / Deselect All Button */}
                {queue.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      disabled={isBatchProcessing || isZipping}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-slate-700 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                      title={isAllSelected ? 'Deselect all items in queue' : 'Select all items in queue'}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                      ) : isSomeSelected ? (
                        <div className="w-3.5 h-3.5 rounded-xs border border-blue-600 dark:border-sky-400 bg-blue-600 dark:bg-sky-400 flex items-center justify-center">
                          <span className="w-2 h-0.5 bg-white rounded-full" />
                        </div>
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      )}
                      <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                        {selectedCount}/{queue.length}
                      </span>
                    </button>
                    {isSomeSelected && (
                      <button
                        type="button"
                        onClick={deselectAll}
                        disabled={isBatchProcessing || isZipping}
                        className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:underline px-1 py-0.5 cursor-pointer whitespace-nowrap"
                        title="Deselect all items"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {/* Batch Undo Button */}
                <button
                  type="button"
                  onClick={batchUndoQueue}
                  disabled={batchUndoableCount === 0 || isBatchProcessing || isZipping}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-slate-700 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                  title={
                    batchUndoableCount > 0
                      ? `Batch Undo: Revert last action across ${batchUndoableCount} target items in queue`
                      : 'No undo history across queued items'
                  }
                >
                  <Undo2 className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                  <span>Batch Undo</span>
                  {batchUndoableCount > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-sky-300 font-bold">
                      {batchUndoableCount}
                    </span>
                  )}
                </button>

                {queue.length > 1 && (
                  <button
                    onClick={batchCleanTarget}
                    disabled={isBatchProcessing || isZipping}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isBatchProcessing
                      ? 'Processing Queue...'
                      : selectedCount > 0 && selectedCount < queue.length
                      ? `Re-Clean Selected (${selectedCount})`
                      : `Re-Clean All (${queue.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* Batch Queue Progress Bar Component */}
            {batchProgress && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/40 p-3 space-y-2 transition-all duration-200 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    {batchProgress.isComplete ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                    )}
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {batchProgress.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">
                      {batchProgress.current} / {batchProgress.total}
                    </span>
                    <span className="font-semibold text-blue-600 dark:text-sky-400">
                      {batchProgress.percentage}%
                    </span>
                  </div>
                </div>

                {batchProgress.currentFileName && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate font-mono">
                    {batchProgress.currentFileName}
                  </div>
                )}

                {/* Progress Bar Track */}
                <div
                  className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative"
                  role="progressbar"
                  aria-valuenow={batchProgress.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={batchProgress.title}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      batchProgress.isComplete
                        ? 'bg-emerald-500 dark:bg-emerald-400'
                        : 'bg-blue-600 dark:bg-sky-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, batchProgress.percentage))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Batch Processing Options & Smart Optimize */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Smart Optimize</span>
                      {smartOptimize && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-medium">
                          ~60% smaller
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Metadata stripping & size reduction before export
                    </div>
                  </div>
                </div>

                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={smartOptimize}
                    onChange={(e) => setSmartOptimize(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Format selection when Smart Optimize is active */}
              {smartOptimize && (
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Export Format:</span>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'webp', label: 'WebP', desc: '-65% size' },
                          { id: 'jpeg', label: 'JPEG', desc: '90% quality' },
                          { id: 'png', label: 'Clean PNG', desc: 'Lossless' },
                        ] as const
                      ).map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setOptimizeFormat(fmt.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                            optimizeFormat === fmt.id
                              ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                          title={fmt.desc}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                    <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Auto-strips camera EXIF, GPS location tags, and software metadata.</span>
                  </div>
                </div>
              )}

              {/* Visual Real-Time Savings Preview Card */}
              <div
                className={`p-3 rounded-lg border transition-all duration-200 ${
                  smartOptimize
                    ? 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/30 dark:border-emerald-500/25'
                    : 'bg-slate-100/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                    <HardDrive
                      className={`w-3.5 h-3.5 ${
                        smartOptimize ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                      }`}
                    />
                    <span>Savings Preview</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full transition-colors ${
                      smartOptimize
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {smartOptimize ? `-${savingsEstimation.savedPercent}% File Size` : 'Unoptimized (0%)'}
                  </span>
                </div>

                {/* Visual Footprint Comparison Bar */}
                <div className="space-y-1.5 mb-2.5">
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700/80 overflow-hidden flex relative">
                    <div
                      className={`h-full transition-all duration-300 ease-out flex items-center justify-center text-[9px] font-mono text-white font-semibold ${
                        smartOptimize
                          ? 'bg-emerald-500 dark:bg-emerald-400'
                          : 'bg-slate-400 dark:bg-slate-500 w-full'
                      }`}
                      style={{
                        width: smartOptimize
                          ? `${Math.max(15, 100 - savingsEstimation.savedPercent)}%`
                          : '100%',
                      }}
                      title={`Optimized Footprint: ${formatBytes(savingsEstimation.optimizedBytes)}`}
                    />
                    {smartOptimize && savingsEstimation.savedPercent > 0 && (
                      <div
                        className="h-full bg-emerald-500/25 dark:bg-emerald-400/20 border-l border-emerald-400/40 transition-all duration-300"
                        style={{ width: `${savingsEstimation.savedPercent}%` }}
                        title={`Eliminated Bytes: ${formatBytes(savingsEstimation.savedBytes)}`}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {smartOptimize ? (
                        <>
                          <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
                            {formatBytes(savingsEstimation.optimizedBytes)}
                          </strong>
                          <span className="text-slate-400 ml-1">optimized</span>
                        </>
                      ) : (
                        <>
                          <span>{formatBytes(savingsEstimation.rawBytes)}</span>
                          <span className="text-slate-400 ml-1">standard</span>
                        </>
                      )}
                    </span>
                    <span className="text-slate-400">
                      <span className="line-through mr-1">{formatBytes(savingsEstimation.rawBytes)}</span>
                      <span>raw</span>
                    </span>
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80 text-[11px]">
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Payload Reduction</div>
                    <div
                      className={`font-mono font-bold flex items-center gap-1 ${
                        smartOptimize
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {smartOptimize ? (
                        <>
                          <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                          <span>{formatBytes(savingsEstimation.savedBytes)}</span>
                        </>
                      ) : (
                        <span>0 B (Disabled)</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Metadata Privacy</div>
                    <div className="font-mono text-[10px] flex items-center gap-1 font-medium">
                      {smartOptimize ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="text-emerald-700 dark:text-emerald-300">EXIF Scrubbed</span>
                        </>
                      ) : (
                        <span className="text-slate-400">EXIF Retained</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Queue Context Scope */}
                <div className="mt-2 pt-1.5 border-t border-slate-200/40 dark:border-slate-800/40 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>
                    Queue scope:{' '}
                    <strong>
                      {selectedCount > 0 && selectedCount < queue.length
                        ? `${selectedCount} of ${queue.length}`
                        : queue.length}
                    </strong>{' '}
                    {selectedCount > 0 && selectedCount < queue.length
                      ? selectedCount === 1
                        ? 'image selected'
                        : 'images selected'
                      : queue.length === 1
                      ? 'image'
                      : 'images'}
                  </span>
                  {smartOptimize && (
                    <span className="font-mono text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                      {optimizeFormat} · {Math.round(optimizeQuality * 100)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setShowBatchRenameModal(true)}
                disabled={queue.length === 0 || isBatchProcessing || isZipping || isBulkCropping}
                className="w-full py-2 px-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
                title={
                  selectedCount > 0 && selectedCount < queue.length
                    ? `Define a naming pattern for ${selectedCount} selected images`
                    : 'Define a naming pattern (prefix, sequential numbers, or suffix) for all queued images'
                }
              >
                <PenLine className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  {selectedCount > 0 && selectedCount < queue.length
                    ? `Rename (${selectedCount})`
                    : 'Rename Pattern'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowBulkCropModal(true)}
                disabled={queue.length === 0 || isBatchProcessing || isZipping || isBulkCropping}
                className="w-full py-2 px-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
                title={
                  selectedCount > 0 && selectedCount < queue.length
                    ? `Define a consistent aspect ratio or crop box for ${selectedCount} selected images`
                    : 'Define a consistent aspect ratio or coordinate box to crop all queued images'
                }
              >
                <Crop className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  {selectedCount > 0 && selectedCount < queue.length
                    ? `Bulk Crop (${selectedCount})`
                    : 'Bulk Crop'}
                </span>
              </button>

              <button
                type="button"
                onClick={downloadAllCleanedAsZip}
                disabled={queue.length === 0 || isZipping || isBatchProcessing || isBulkCropping}
                className="w-full py-2 px-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 border border-slate-800 dark:border-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FolderArchive className="w-3.5 h-3.5 text-sky-400 dark:text-white" />
                <span>
                  {isZipping
                    ? 'Packaging...'
                    : selectedCount > 0 && selectedCount < queue.length
                    ? `Download (${selectedCount})`
                    : `Download All (${queue.length})`}
                </span>
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {queue.map((item) => {
                const isSelected = activeItem?.id === item.id;
                const isChecked = selectedIds.has(item.id);
                const isItemProcessing = item.status === 'processing';
                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                    className={`flex items-center justify-between gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
                        : isItemProcessing
                        ? 'border-blue-400/60 dark:border-blue-700/60 bg-blue-50/30 dark:bg-blue-950/20'
                        : isChecked
                        ? 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Checkbox toggle for item selection */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-label={`Select ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectItem(item.id);
                        }}
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400'
                        }`}
                        title={isChecked ? 'Deselect item from batch actions' : 'Select item for batch actions'}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>

                      <div className="relative w-10 h-10 shrink-0">
                        <img
                          src={item.cleanedUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        {isItemProcessing && (
                          <div className="absolute inset-0 rounded bg-slate-950/60 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleRenameItem(item.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          title="Rename file before downloading or exporting as ZIP"
                          placeholder="File name"
                          className="w-full text-xs font-medium text-slate-900 dark:text-slate-100 bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700/80 focus:border-blue-500 dark:focus:border-blue-400 rounded px-1.5 py-0.5 outline-none transition-colors"
                        />
                        <div className="mt-0.5 px-0.5">
                          {isItemProcessing ? (
                            <div className="text-[10px] text-blue-600 dark:text-sky-400 font-medium flex items-center gap-1">
                              <span>Processing watermark...</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1.5 text-[10px]">
                              <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                                {item.width}×{item.height} · {item.processingMs}ms
                              </span>
                              {item.quality && (
                                <div
                                  className={`group/ssim relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border shrink-0 cursor-help transition-all ${
                                    getQualityBadgeStyles(item.quality.tier).badgeBg
                                  } ${getQualityBadgeStyles(item.quality.tier).badgeBorder} ${
                                    getQualityBadgeStyles(item.quality.tier).badgeText
                                  }`}
                                  title={`Reconstruction Quality: ${item.quality.score}% SSIM (${item.quality.label})\n• Luminance Match: ${item.quality.luminanceScore}%\n• Contrast Match: ${item.quality.contrastScore}%\n• Structure Match: ${item.quality.structureScore}%\n• Evaluated across ${item.quality.evaluatedWindows} sample windows`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      getQualityBadgeStyles(item.quality.tier).dotBg
                                    }`}
                                  />
                                  <span>{item.quality.score}% SSIM</span>

                                  {/* Detailed Interactive Tooltip Card */}
                                  <div className="hidden group-hover/ssim:block absolute bottom-full right-0 mb-1.5 w-56 p-2.5 rounded-lg bg-slate-900 text-slate-100 dark:bg-slate-950 dark:text-slate-100 shadow-2xl text-[10px] z-50 pointer-events-none border border-slate-700/80">
                                    <div className="font-semibold text-xs text-white mb-1.5 flex items-center justify-between">
                                      <span>Reconstruction Quality</span>
                                      <span
                                        className={`font-mono text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                          getQualityBadgeStyles(item.quality.tier).badgeBg
                                        } ${getQualityBadgeStyles(item.quality.tier).badgeText}`}
                                      >
                                        {item.quality.label}
                                      </span>
                                    </div>
                                    <div className="space-y-1 font-mono text-[10px]">
                                      <div className="flex justify-between text-slate-200 font-medium">
                                        <span>SSIM Metric:</span>
                                        <span className="text-white font-bold">
                                          {item.quality.rawSSIM} ({item.quality.score}%)
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Luminance Match:</span>
                                        <span className="text-slate-200">{item.quality.luminanceScore}%</span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Contrast Match:</span>
                                        <span className="text-slate-200">{item.quality.contrastScore}%</span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Structure Match:</span>
                                        <span className="text-slate-200">{item.quality.structureScore}%</span>
                                      </div>
                                      <div className="pt-1.5 mt-1.5 border-t border-slate-800 text-slate-400 text-[9px] font-sans leading-tight">
                                        Structural Similarity Index evaluating texture consistency of the inpainting against surrounding reference pixels.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadItem(item);
                        }}
                        disabled={isItemProcessing}
                        className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors cursor-pointer"
                        title="Download Clean PNG"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {queue.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQueue((prev) => prev.filter((q) => q.id !== item.id));
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              next.delete(item.id);
                              return next;
                            });
                          }}
                          disabled={isBatchProcessing}
                          className="p-1.5 rounded text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors cursor-pointer"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      {/* Architecture & Offline Pipeline Section below the workbench */}
      <section
        id="architecture"
        className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-12"
      >
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              How the Automatic Offline Pipeline Works
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              ClearFrame Studio executes a four-stage computer vision pipeline directly in your browser using typed arrays and HTML5 Canvas—requiring zero cloud uploads or external API keys.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-mono text-blue-600 dark:text-blue-400">01. Text vs Logo Separation</div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Component Classification
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Separates elongated high-frequency character strings from compact graphic logos and chroma badges so you can toggle Remove Text and Remove Logo independently.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-mono text-blue-600 dark:text-blue-400">02. Integral Contrast Scanner</div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                O(1) Window Localization
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Computes 2D integral luminance and saturation maps with Sobel edge densities to isolate watermarks and camera date stamps automatically on upload.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-mono text-blue-600 dark:text-blue-400">03. Reverse Alpha Unblending</div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Translucent Layer Inversion
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Estimates local foreground opacity on semi-transparent stock overlays and inverts the alpha compositing equation to recover true underlying detail.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-xs font-mono text-blue-600 dark:text-blue-400">04. Patch & Telea Synthesis</div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Context-Aware Reconstruction
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Combines Fast Marching boundary propagation with unmasked exemplar texture patch sampling so repaired regions preserve natural surface grain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Confirmation Dialog Before Resetting Current Mask */}
      {showResetConfirmModal && activeItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowResetConfirmModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div
            className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <h3 id="reset-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
                  Reset Inpaint Mask?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {activeItem.name} ({activeItem.width} × {activeItem.height})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Custom mask vs auto-detected mask badge */}
            {activeItem.undoStack.length > 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <Brush className="w-3.5 h-3.5 shrink-0" />
                  <span>Custom Drawn Mask Detected</span>
                </div>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                  You have painted or edited <strong>{activeItem.undoStack.length} custom mask stroke{activeItem.undoStack.length > 1 ? 's' : ''}</strong> (brush, box eraser, or magic wand selections). Resetting will erase all custom refinements.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Auto-Detected Mask Active</span>
                </div>
                <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
                  Currently covering <strong>{activeItem.coveragePercent}%</strong> of the image across <strong>{activeItem.zones.length} watermark zone{activeItem.zones.length === 1 ? '' : 's'}</strong>.
                </p>
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Are you sure you want to clear the mask? The inpainting mask will be completely wiped, restoring the raw original image view for this file.
            </p>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Undo2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                Tip: If you clear by mistake, you can immediately undo via{' '}
                <kbd className="px-1 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300 font-semibold">
                  Ctrl+Z
                </kbd>{' '}
                or the toolbar Undo button.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResetMask}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Mask</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Crop Tool Modal */}
      <BulkCropModal
        isOpen={showBulkCropModal}
        onClose={() => setShowBulkCropModal(false)}
        activeItem={activeItem}
        queueCount={activeTargetQueue.length}
        isApplying={isBulkCropping}
        onApplyCrop={handleApplyBulkCrop}
      />

      {/* Batch Rename Pattern Modal */}
      <BatchRenameModal
        isOpen={showBatchRenameModal}
        onClose={() => setShowBatchRenameModal(false)}
        queue={activeTargetQueue}
        onApplyRename={handleApplyBatchRename}
      />
    </div>
  );
}
