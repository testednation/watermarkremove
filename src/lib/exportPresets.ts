import { OptimizeFormat } from './optimizer';

export interface ExportPreset {
  id: string;
  name: string;
  format: OptimizeFormat;
  quality: number; // 0.1 to 1.0
  isCustom?: boolean;
  description?: string;
}

export const DEFAULT_EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'webp-balanced',
    name: 'Web Balanced (WebP 88%)',
    format: 'webp',
    quality: 0.88,
    description: 'WebP 88% · ~65% size reduction with sharp photographic fidelity',
  },
  {
    id: 'webp-compact',
    name: 'Web Compact (WebP 72%)',
    format: 'webp',
    quality: 0.72,
    description: 'WebP 72% · Ultra-lightweight payload for fast web loading',
  },
  {
    id: 'jpeg-high',
    name: 'Photo High-Q (JPEG 92%)',
    format: 'jpeg',
    quality: 0.92,
    description: 'JPEG 92% · Maximum universal compatibility & vivid colors',
  },
  {
    id: 'jpeg-standard',
    name: 'Photo Standard (JPEG 82%)',
    format: 'jpeg',
    quality: 0.82,
    description: 'JPEG 82% · Balanced photo size & cross-platform support',
  },
  {
    id: 'png-lossless',
    name: 'Lossless Master (Clean PNG)',
    format: 'png',
    quality: 1.0,
    description: 'PNG 100% · Bit-for-bit lossless pixels with EXIF privacy scrubbing',
  },
];

const STORAGE_KEY = 'clearframe_custom_export_presets_v1';

export function loadCustomExportPresets(): ExportPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (p) =>
          p &&
          typeof p.id === 'string' &&
          typeof p.name === 'string' &&
          ['webp', 'jpeg', 'png'].includes(p.format) &&
          typeof p.quality === 'number'
      );
    }
  } catch {
    // Ignore storage parse error
  }
  return [];
}

export function saveCustomExportPresets(presets: ExportPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota error
  }
}
