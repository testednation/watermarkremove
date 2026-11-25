import React, { useRef, useState } from 'react';
import {
  Cpu,
  Download,
  CheckCircle2,
  X,
  HardDrive,
  Loader2,
  Trash2,
  FolderOpen,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import {
  OFFLINE_AI_MODELS,
  OfflineAiModelId,
  CachedModelMetadata,
  OfflineAiDownloadProgress,
  ExecutionBackend,
} from '../lib/offlineAiEngine';

interface OfflineAiDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId: OfflineAiModelId;
  cachedModels: CachedModelMetadata[];
  activeBackend: ExecutionBackend | null;
  downloadProgress: OfflineAiDownloadProgress | null;
  downloadError: string | null;
  hasPendingAutoCleanPrompt?: boolean;
  onSelectAndActivateModel: (modelId: OfflineAiModelId) => Promise<void>;
  onStartDownloadModel: (modelId: OfflineAiModelId) => Promise<void>;
  onCancelDownload: () => void;
  onDeleteCachedModel: (modelId: OfflineAiModelId) => Promise<void>;
  onImportLocalFile: (file: File) => Promise<void>;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const OfflineAiDownloadModal: React.FC<OfflineAiDownloadModalProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  cachedModels,
  activeBackend,
  downloadProgress,
  downloadError,
  hasPendingAutoCleanPrompt = false,
  onSelectAndActivateModel,
  onStartDownloadModel,
  onCancelDownload,
  onDeleteCachedModel,
  onImportLocalFile,
}) => {
  const [chosenId, setChosenId] = useState<OfflineAiModelId>(
    selectedModelId === 'custom-local' ? 'migan-v2' : selectedModelId
  );
  const onnxFileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const isDownloading = Boolean(downloadProgress);
  const cachedMap = new Map<OfflineAiModelId, CachedModelMetadata>();
  cachedModels.forEach((m) => cachedMap.set(m.id, m));

  const chosenCached = cachedMap.get(chosenId);
  const customCached = cachedMap.get('custom-local');

  const downloadableIds: OfflineAiModelId[] = ['migan-v2', 'lama-fp32'];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-ai-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-sky-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="offline-ai-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"
              >
                <span>Offline Neural AI Engine</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  100% Local
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Download AI weights once to run automatic neural removal completely offline.
              </p>
            </div>
          </div>
          {!isDownloading && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close Offline AI modal"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {hasPendingAutoCleanPrompt && cachedModels.length === 0 && !isDownloading && (
            <div className="p-3.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/70 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Offline Neural AI weights are not cached yet.</span>{' '}
                Download the lightweight <strong>MI-GAN v2 model (28.1 MB)</strong> once so
                ClearFrame can automatically reconstruct images using neural AI completely offline —
                zero images ever leave your browser.
              </div>
            </div>
          )}

          {/* Model Options */}
          <div className="space-y-2.5">
            {downloadableIds.map((id) => {
              const spec = OFFLINE_AI_MODELS[id];
              const cached = cachedMap.get(id);
              const isSelected = chosenId === id;
              const isActive = selectedModelId === id && Boolean(cached);

              return (
                <div
                  key={id}
                  onClick={() => !isDownloading && setChosenId(id)}
                  className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-600 dark:border-sky-500 bg-blue-50/50 dark:bg-blue-950/25'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {spec.name}
                        </span>
                        {spec.recommended && (
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-blue-600 text-white">
                            Recommended
                          </span>
                        )}
                        {cached ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Cached Offline ({formatMb(cached.byteLength)})
                          </span>
                        ) : (
                          <span className="px-2 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {spec.sizeLabel} download
                          </span>
                        )}
                        {isActive && activeBackend && (
                          <span className="px-2 py-0.2 rounded text-[10px] font-mono font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            Active · {activeBackend}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {spec.description}
                      </p>
                    </div>

                    {cached && !isDownloading && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCachedModel(id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                        title="Remove cached weights from IndexedDB"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Optional Local .onnx File Import for Air-Gapped Offline Setup */}
            <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Already have a local <code className="font-mono">.onnx</code> model?
                  </span>
                  {customCached && (
                    <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">
                      Loaded: {customCached.fileName} ({formatMb(customCached.byteLength)})
                    </span>
                  )}
                </div>
              </div>
              <input
                ref={onnxFileInputRef}
                type="file"
                accept=".onnx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportLocalFile(file);
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={isDownloading}
                onClick={() => onnxFileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Load Local .onnx</span>
              </button>
            </div>
          </div>

          {/* Live Download & Initialization Progress */}
          {downloadProgress && (
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900 dark:text-blue-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-sky-400" />
                  <span>
                    {downloadProgress.phase === 'downloading'
                      ? `Downloading ${OFFLINE_AI_MODELS[downloadProgress.modelId].shortName}...`
                      : downloadProgress.phase === 'caching'
                      ? 'Saving weights into browser IndexedDB for offline use...'
                      : 'Compiling WebGPU / WASM neural session...'}
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  {formatMb(downloadProgress.loadedBytes)} / {formatMb(downloadProgress.totalBytes)} (
                  {downloadProgress.percent}%)
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-blue-200/70 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 dark:bg-sky-400 transition-all duration-150"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Notice */}
          {downloadError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{downloadError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2.5">
          {isDownloading ? (
            <>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Cached locally after this one-time download.
              </span>
              <button
                type="button"
                onClick={onCancelDownload}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel Download
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {cachedModels.length > 0 ? 'Close' : 'Use Built-in Fast Engine for Now'}
              </button>

              {chosenCached ? (
                <button
                  type="button"
                  onClick={() => onSelectAndActivateModel(chosenId)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Activate {OFFLINE_AI_MODELS[chosenId].shortName} &amp; Auto-Clean</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartDownloadModel(chosenId)}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    Download Offline AI ({OFFLINE_AI_MODELS[chosenId].sizeLabel})
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
