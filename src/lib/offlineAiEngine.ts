import * as ort from 'onnxruntime-web';

export type OfflineAiModelId = 'migan-v2' | 'lama-fp32' | 'custom-local';

export interface OfflineAiModelSpec {
  id: OfflineAiModelId;
  name: string;
  shortName: string;
  description: string;
  sizeBytes: number;
  sizeLabel: string;
  url: string | null;
  fileName: string;
  tensorMode: 'migan-uint8' | 'lama-float32';
  patchSize: number;
  recommended?: boolean;
}

export interface CachedModelMetadata {
  id: OfflineAiModelId;
  name: string;
  fileName: string;
  byteLength: number;
  downloadedAt: number;
  tensorMode?: 'migan-uint8' | 'lama-float32';
}

export interface OfflineAiDownloadProgress {
  modelId: OfflineAiModelId;
  phase: 'downloading' | 'caching' | 'initializing';
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export type ExecutionBackend = 'WebGPU' | 'WebAssembly SIMD';

export const OFFLINE_AI_MODELS: Record<OfflineAiModelId, OfflineAiModelSpec> = {
  'migan-v2': {
    id: 'migan-v2',
    name: 'MI-GAN v2 Neural Inpainter',
    shortName: 'MI-GAN v2 (28 MB)',
    description:
      'Lightweight multi-scale generative neural network tuned for fast watermark & object erasure.',
    sizeBytes: 28_079_181,
    sizeLabel: '28.1 MB',
    url: 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx',
    fileName: 'migan_pipeline_v2.onnx',
    tensorMode: 'migan-uint8',
    patchSize: 512,
    recommended: true,
  },
  'lama-fp32': {
    id: 'lama-fp32',
    name: 'LaMa Fourier HD Neural Model',
    shortName: 'LaMa HD (198 MB)',
    description:
      'Large Mask Fast Fourier Convolution neural network for ultra-realistic texture & repetitive pattern reconstruction.',
    sizeBytes: 207_600_000,
    sizeLabel: '198 MB',
    url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
    fileName: 'lama_fp32.onnx',
    tensorMode: 'lama-float32',
    patchSize: 512,
  },
  'custom-local': {
    id: 'custom-local',
    name: 'Custom Local ONNX Model',
    shortName: 'Local .onnx',
    description: 'User-imported .onnx inpainting weights cached locally in IndexedDB.',
    sizeBytes: 0,
    sizeLabel: 'Local File',
    url: null,
    fileName: 'custom_inpaint.onnx',
    tensorMode: 'migan-uint8',
    patchSize: 512,
  },
};

const DB_NAME = 'clearframe-offline-ai-v1';
const DB_VERSION = 1;
const STORE_WEIGHTS = 'weights';
const STORE_META = 'meta';

let activeSession: ort.InferenceSession | null = null;
let activeSessionModelId: OfflineAiModelId | null = null;
let activeBackend: ExecutionBackend | null = null;
let ortEnvConfigured = false;

function configureOrtEnv() {
  if (ortEnvConfigured) return;
  ortEnvConfigured = true;
  if (typeof window !== 'undefined') {
    ort.env.wasm.wasmPaths = `${window.location.origin}/ort-wasm/`;
  }
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
}

function openAiDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_WEIGHTS)) {
        db.createObjectStore(STORE_WEIGHTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB for Offline AI cache'));
  });
}

export async function getAllCachedModelsMeta(): Promise<CachedModelMetadata[]> {
  try {
    const db = await openAiDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as CachedModelMetadata[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getCachedModelWeights(modelId: OfflineAiModelId): Promise<ArrayBuffer | null> {
  try {
    const db = await openAiDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WEIGHTS, 'readonly');
      const store = tx.objectStore(STORE_WEIGHTS);
      const req = store.get(modelId);
      req.onsuccess = () => {
        const record = req.result as { id: string; bytes: ArrayBuffer } | undefined;
        resolve(record?.bytes || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function saveModelToIndexedDb(
  modelId: OfflineAiModelId,
  bytes: ArrayBuffer,
  meta: CachedModelMetadata
): Promise<void> {
  const db = await openAiDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_WEIGHTS, STORE_META], 'readwrite');
    tx.objectStore(STORE_WEIGHTS).put({ id: modelId, bytes });
    tx.objectStore(STORE_META).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save model weights to IndexedDB'));
  });
}

export async function deleteCachedOfflineAiModel(modelId: OfflineAiModelId): Promise<void> {
  if (activeSessionModelId === modelId) {
    if (activeSession) {
      try {
        await activeSession.release();
      } catch {
        // ignore release error
      }
    }
    activeSession = null;
    activeSessionModelId = null;
    activeBackend = null;
  }
  const db = await openAiDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_WEIGHTS, STORE_META], 'readwrite');
    tx.objectStore(STORE_WEIGHTS).delete(modelId);
    tx.objectStore(STORE_META).delete(modelId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function isWebGpuAvailable(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown | null> } };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

export function getActiveOfflineAiStatus(): {
  isSessionLoaded: boolean;
  modelId: OfflineAiModelId | null;
  backend: ExecutionBackend | null;
} {
  return {
    isSessionLoaded: Boolean(activeSession),
    modelId: activeSessionModelId,
    backend: activeBackend,
  };
}

export async function loadOfflineAiSession(
  modelId: OfflineAiModelId
): Promise<{ modelId: OfflineAiModelId; backend: ExecutionBackend }> {
  if (activeSession && activeSessionModelId === modelId && activeBackend) {
    return { modelId, backend: activeBackend };
  }

  configureOrtEnv();

  const bytes = await getCachedModelWeights(modelId);
  if (!bytes || bytes.byteLength < 1024) {
    throw new Error(`Offline AI model "${modelId}" is not downloaded yet.`);
  }

  if (activeSession) {
    try {
      await activeSession.release();
    } catch {
      // ignore
    }
    activeSession = null;
    activeSessionModelId = null;
    activeBackend = null;
  }

  const canWebGpu = await isWebGpuAvailable();
  const modelCopy = bytes.slice(0);

  if (canWebGpu) {
    try {
      const session = await ort.InferenceSession.create(modelCopy, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      activeSession = session;
      activeSessionModelId = modelId;
      activeBackend = 'WebGPU';
      return { modelId, backend: 'WebGPU' };
    } catch (err) {
      console.warn('WebGPU ONNX initialization fell back to WebAssembly SIMD:', err);
    }
  }

  const wasmSession = await ort.InferenceSession.create(bytes.slice(0), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  activeSession = wasmSession;
  activeSessionModelId = modelId;
  activeBackend = 'WebAssembly SIMD';
  return { modelId, backend: 'WebAssembly SIMD' };
}

export async function downloadOfflineAiModel(
  modelId: OfflineAiModelId,
  onProgress?: (progress: OfflineAiDownloadProgress) => void,
  signal?: AbortSignal
): Promise<{ meta: CachedModelMetadata; backend: ExecutionBackend }> {
  const spec = OFFLINE_AI_MODELS[modelId];
  if (!spec || !spec.url) {
    throw new Error(`Model "${modelId}" has no remote download URL.`);
  }

  const response = await fetch(spec.url, { mode: 'cors', signal });
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}) while fetching ${spec.shortName}.`);
  }

  const headerLength = Number(response.headers.get('content-length') || 0);
  const totalBytes = headerLength > 0 ? headerLength : spec.sizeBytes;

  let assembledBuffer: ArrayBuffer;

  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        const pct = totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 50;
        onProgress?.({
          modelId,
          phase: 'downloading',
          loadedBytes,
          totalBytes: Math.max(totalBytes, loadedBytes),
          percent: pct,
        });
      }
    }

    const merged = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    assembledBuffer = merged.buffer;
  } else {
    assembledBuffer = await response.arrayBuffer();
  }

  if (assembledBuffer.byteLength < 100_000) {
    throw new Error('Downloaded model file was unexpectedly small or corrupted.');
  }

  onProgress?.({
    modelId,
    phase: 'caching',
    loadedBytes: assembledBuffer.byteLength,
    totalBytes: assembledBuffer.byteLength,
    percent: 100,
  });

  const meta: CachedModelMetadata = {
    id: modelId,
    name: spec.name,
    fileName: spec.fileName,
    byteLength: assembledBuffer.byteLength,
    downloadedAt: Date.now(),
    tensorMode: spec.tensorMode,
  };

  await saveModelToIndexedDb(modelId, assembledBuffer, meta);

  onProgress?.({
    modelId,
    phase: 'initializing',
    loadedBytes: assembledBuffer.byteLength,
    totalBytes: assembledBuffer.byteLength,
    percent: 100,
  });

  const loaded = await loadOfflineAiSession(modelId);
  return { meta, backend: loaded.backend };
}

export async function importLocalOnnxModelFile(
  file: File,
  tensorModeHint?: 'migan-uint8' | 'lama-float32'
): Promise<{ meta: CachedModelMetadata; backend: ExecutionBackend }> {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength < 100_000) {
    throw new Error('Selected ONNX file is too small to be a valid inpainting model.');
  }

  const inferredMode: 'migan-uint8' | 'lama-float32' =
    tensorModeHint ||
    (file.name.toLowerCase().includes('lama') ? 'lama-float32' : 'migan-uint8');

  const meta: CachedModelMetadata = {
    id: 'custom-local',
    name: `Local ONNX (${file.name})`,
    fileName: file.name,
    byteLength: bytes.byteLength,
    downloadedAt: Date.now(),
    tensorMode: inferredMode,
  };

  await saveModelToIndexedDb('custom-local', bytes, meta);
  const loaded = await loadOfflineAiSession('custom-local');
  return { meta, backend: loaded.backend };
}

interface PatchBox {
  x0: number;
  y0: number;
  size: number;
}

/**
 * Generates optimal 512x512 ROI crop windows or sliding overlap tiles that cover every masked pixel.
 */
function buildPatchBoxesForMask(
  mask: Uint8Array,
  width: number,
  height: number,
  patchSize: number
): PatchBox[] {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return [];

  const spanW = maxX - minX + 1;
  const spanH = maxY - minY + 1;

  // Case 1: Image itself fits inside patchSize or single masked cluster fits with generous context
  if ((width <= patchSize && height <= patchSize) || (spanW <= patchSize - 64 && spanH <= patchSize - 64)) {
    const cx = Math.round((minX + maxX) * 0.5);
    const cy = Math.round((minY + maxY) * 0.5);
    const half = Math.floor(patchSize / 2);
    let x0 = cx - half;
    let y0 = cy - half;
    if (width >= patchSize) {
      x0 = Math.max(0, Math.min(width - patchSize, x0));
    } else {
      x0 = 0;
    }
    if (height >= patchSize) {
      y0 = Math.max(0, Math.min(height - patchSize, y0));
    } else {
      y0 = 0;
    }
    return [{ x0, y0, size: patchSize }];
  }

  // Case 2: Multiple regions or full-frame diagonal watermark -> overlapping sliding grid (only tiles containing mask!)
  const stride = Math.round(patchSize * 0.72); // ~368px stride, 144px overlap
  const xs: number[] = [];
  const ys: number[] = [];

  if (width <= patchSize) {
    xs.push(0);
  } else {
    for (let x = 0; x < width - patchSize; x += stride) xs.push(x);
    xs.push(width - patchSize);
  }

  if (height <= patchSize) {
    ys.push(0);
  } else {
    for (let y = 0; y < height - patchSize; y += stride) ys.push(y);
    ys.push(height - patchSize);
  }

  const boxes: PatchBox[] = [];
  for (const y0 of ys) {
    for (const x0 of xs) {
      const xEnd = Math.min(width, x0 + patchSize);
      const yEnd = Math.min(height, y0 + patchSize);
      let hasMask = false;
      for (let y = y0; y < yEnd && !hasMask; y++) {
        const row = y * width;
        for (let x = x0; x < xEnd; x++) {
          if (mask[row + x] > 0) {
            hasMask = true;
            break;
          }
        }
      }
      if (hasMask) {
        boxes.push({ x0, y0, size: patchSize });
      }
    }
  }

  return boxes;
}

/**
 * Runs real Offline AI neural inpainting (MI-GAN v2 or LaMa FP32 via ONNX Runtime Web)
 * on all masked pixels with full-resolution ROI patch compositing and soft boundary feathering.
 */
export async function inpaintWithOfflineAiModel(
  imageData: ImageData,
  mask: Uint8Array,
  modelId: OfflineAiModelId,
  tensorModeOverride?: 'migan-uint8' | 'lama-float32'
): Promise<ImageData> {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  let hasAnyMask = false;
  for (let i = 0; i < totalPixels; i++) {
    if (mask[i] > 0) {
      hasAnyMask = true;
      break;
    }
  }
  if (!hasAnyMask) {
    return new ImageData(new Uint8ClampedArray(data), width, height);
  }

  if (!activeSession || activeSessionModelId !== modelId) {
    await loadOfflineAiSession(modelId);
  }
  const session = activeSession!;
  const spec = OFFLINE_AI_MODELS[modelId];
  const patchSize = spec.patchSize || 512;

  // Determine exact input names and tensor data types
  const inputNames = session.inputNames;
  const imageInputName =
    inputNames.find((n) => n.toLowerCase().includes('img') || n.toLowerCase().includes('image')) ||
    inputNames[0];
  const maskInputName =
    inputNames.find((n) => n.toLowerCase().includes('mask')) || inputNames[1] || inputNames[0];

  // Check runtime input metadata if available to auto-detect uint8 vs float32
  let useUint8 = (tensorModeOverride || spec.tensorMode) === 'migan-uint8';
  const metaAny = (session as unknown as { inputMetadata?: Record<string, { type?: string }> })
    .inputMetadata;
  if (metaAny && metaAny[imageInputName]?.type) {
    const t = String(metaAny[imageInputName].type).toLowerCase();
    if (t.includes('uint8')) useUint8 = true;
    else if (t.includes('float')) useUint8 = false;
  }

  const boxes = buildPatchBoxesForMask(mask, width, height, patchSize);
  const planeSize = patchSize * patchSize;

  // Accumulate overlapping tile outputs weighted smoothly so multi-tile edges are invisible
  const accumR = new Float32Array(totalPixels);
  const accumG = new Float32Array(totalPixels);
  const accumB = new Float32Array(totalPixels);
  const accumW = new Float32Array(totalPixels);

  for (const box of boxes) {
    const imgTensorBuf = useUint8
      ? new Uint8Array(3 * planeSize)
      : new Float32Array(3 * planeSize);
    const maskTensorBuf = useUint8
      ? new Uint8Array(planeSize)
      : new Float32Array(planeSize);

    for (let py = 0; py < patchSize; py++) {
      // Edge-clamp replication if image < patchSize
      const sy = Math.min(height - 1, Math.max(0, box.y0 + py));
      const srcRow = sy * width;
      const dstRow = py * patchSize;

      for (let px = 0; px < patchSize; px++) {
        const sx = Math.min(width - 1, Math.max(0, box.x0 + px));
        const sIdx = srcRow + sx;
        const pIdx = dstRow + px;

        const r = data[sIdx * 4];
        const g = data[sIdx * 4 + 1];
        const b = data[sIdx * 4 + 2];
        const isMasked = mask[sIdx] > 0;

        if (useUint8) {
          imgTensorBuf[pIdx] = r;
          imgTensorBuf[planeSize + pIdx] = g;
          imgTensorBuf[planeSize * 2 + pIdx] = b;
          // MI-GAN pipeline v2 convention: 255 = KEEP background, 0 = REMOVE/INPAINT
          maskTensorBuf[pIdx] = isMasked ? 0 : 255;
        } else {
          imgTensorBuf[pIdx] = r / 255;
          imgTensorBuf[planeSize + pIdx] = g / 255;
          imgTensorBuf[planeSize * 2 + pIdx] = b / 255;
          // LaMa FP32 convention: 1.0 = REMOVE/INPAINT, 0.0 = KEEP background
          maskTensorBuf[pIdx] = isMasked ? 1.0 : 0.0;
        }
      }
    }

    const feeds: Record<string, ort.Tensor> = {
      [imageInputName]: new ort.Tensor(
        useUint8 ? 'uint8' : 'float32',
        imgTensorBuf,
        [1, 3, patchSize, patchSize]
      ),
      [maskInputName]: new ort.Tensor(
        useUint8 ? 'uint8' : 'float32',
        maskTensorBuf,
        [1, 1, patchSize, patchSize]
      ),
    };

    let outputTensor: ort.Tensor;
    try {
      const results = await session.run(feeds);
      outputTensor = results[session.outputNames[0]];
    } catch (runErr) {
      // If WebGPU execution fails mid-run on a specific GPU driver, seamlessly fall back to WASM once
      if (activeBackend === 'WebGPU') {
        console.warn('WebGPU run error, switching Offline AI session to WebAssembly SIMD:', runErr);
        const bytes = await getCachedModelWeights(modelId);
        if (bytes) {
          await activeSession?.release().catch(() => {});
          activeSession = await ort.InferenceSession.create(bytes.slice(0), {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
          });
          activeBackend = 'WebAssembly SIMD';
          const retryResults = await activeSession.run(feeds);
          outputTensor = retryResults[activeSession.outputNames[0]];
        } else {
          throw runErr;
        }
      } else {
        throw runErr;
      }
    }

    const outRaw = outputTensor.data as Uint8Array | Float32Array;
    const isOutFloat = outRaw instanceof Float32Array;
    // Auto-detect if float output is [0..1] vs [0..255]
    let floatScale = 1;
    if (isOutFloat) {
      let maxSample = 0;
      for (let k = 0; k < Math.min(outRaw.length, 4096); k += 17) {
        if (outRaw[k] > maxSample) maxSample = outRaw[k];
      }
      floatScale = maxSample <= 2.5 ? 255 : 1;
    }

    const validW = Math.min(patchSize, width - box.x0);
    const validH = Math.min(patchSize, height - box.y0);

    for (let py = 0; py < validH; py++) {
      const sy = box.y0 + py;
      const dstRow = sy * width;
      const patchRow = py * patchSize;

      // Subtle center-weighted windowing for multi-tile overlap blending
      const dyEdge = Math.min(py + 1, validH - py);
      for (let px = 0; px < validW; px++) {
        const sx = box.x0 + px;
        const sIdx = dstRow + sx;
        if (mask[sIdx] === 0) continue;

        const dxEdge = Math.min(px + 1, validW - px);
        const tileWeight = Math.min(1.0, Math.min(dxEdge, dyEdge) / 24);

        const pIdx = patchRow + px;
        const outR = Math.max(0, Math.min(255, outRaw[pIdx] * floatScale));
        const outG = Math.max(0, Math.min(255, outRaw[planeSize + pIdx] * floatScale));
        const outB = Math.max(0, Math.min(255, outRaw[planeSize * 2 + pIdx] * floatScale));

        accumR[sIdx] += outR * tileWeight;
        accumG[sIdx] += outG * tileWeight;
        accumB[sIdx] += outB * tileWeight;
        accumW[sIdx] += tileWeight;
      }
    }
  }

  // Write final image with soft boundary feathering on 1px mask border
  const outData = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (mask[idx] === 0 || accumW[idx] <= 0) continue;

      const isBorder =
        (x > 0 && mask[idx - 1] === 0) ||
        (x < width - 1 && mask[idx + 1] === 0) ||
        (y > 0 && mask[idx - width] === 0) ||
        (y < height - 1 && mask[idx + width] === 0);

      const feather = isBorder ? 0.78 : 1.0;
      const w = accumW[idx];
      const predR = accumR[idx] / w;
      const predG = accumG[idx] / w;
      const predB = accumB[idx] / w;

      outData[idx * 4] = Math.round(predR * feather + data[idx * 4] * (1 - feather));
      outData[idx * 4 + 1] = Math.round(predG * feather + data[idx * 4 + 1] * (1 - feather));
      outData[idx * 4 + 2] = Math.round(predB * feather + data[idx * 4 + 2] * (1 - feather));
      outData[idx * 4 + 3] = data[idx * 4 + 3];
    }
  }

  return new ImageData(outData, width, height);
}
