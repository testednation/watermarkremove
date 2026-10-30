/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OptimizeFormat = 'webp' | 'png' | 'jpeg';

export interface OptimizeConfig {
  enabled: boolean;
  format: OptimizeFormat;
  quality: number; // 0.5 to 1.0 (default: 0.88)
  stripMetadata: boolean;
}

export interface OptimizationResult {
  blob: Blob;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  originalBytes: number;
  savedPercent: number;
}

export const DEFAULT_OPTIMIZE_CONFIG: OptimizeConfig = {
  enabled: true,
  format: 'webp',
  quality: 0.88,
  stripMetadata: true,
};

/**
 * Format bytes into human-readable representation
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Optimizes an ImageData instance:
 * 1. Redraws clean pixels onto a fresh canvas, completely discarding all camera EXIF, GPS, and IPTC metadata.
 * 2. Compresses the cleaned image to modern high-efficiency WebP, optimized PNG, or JPEG.
 * 3. Returns the compressed Blob with exact file size statistics.
 */
export async function optimizeCleanedImage(
  imageData: ImageData,
  config: OptimizeConfig
): Promise<OptimizationResult> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  if (!config.enabled) {
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          const finalBlob = blob || new Blob([]);
          resolve({
            blob: finalBlob,
            extension: 'png',
            mimeType: 'image/png',
            sizeBytes: finalBlob.size,
            originalBytes: finalBlob.size,
            savedPercent: 0,
          });
        },
        'image/png'
      );
    });
  }

  const mimeType =
    config.format === 'webp'
      ? 'image/webp'
      : config.format === 'jpeg'
      ? 'image/jpeg'
      : 'image/png';

  const extension =
    config.format === 'webp'
      ? 'webp'
      : config.format === 'jpeg'
      ? 'jpg'
      : 'png';

  const quality = config.quality ?? 0.88;

  return new Promise((resolve) => {
    // Generate baseline raw PNG for true size comparison
    canvas.toBlob((rawPngBlob) => {
      const origSize = rawPngBlob?.size || imageData.width * imageData.height * 4;

      if (config.format === 'png') {
        // PNG format: metadata stripped via canvas rebuild
        const blob = rawPngBlob || new Blob([]);
        resolve({
          blob,
          extension: 'png',
          mimeType: 'image/png',
          sizeBytes: blob.size,
          originalBytes: origSize,
          savedPercent: 0,
        });
        return;
      }

      // WebP or JPEG format: lossy/lossless visual compression
      canvas.toBlob(
        (optBlob) => {
          if (!optBlob) {
            // Fallback to PNG if browser doesn't support format
            const fallback = rawPngBlob || new Blob([]);
            resolve({
              blob: fallback,
              extension: 'png',
              mimeType: 'image/png',
              sizeBytes: fallback.size,
              originalBytes: origSize,
              savedPercent: 0,
            });
            return;
          }

          const savedPercent = Math.max(
            0,
            Math.min(95, Math.round(((origSize - optBlob.size) / origSize) * 100))
          );

          resolve({
            blob: optBlob,
            extension,
            mimeType,
            sizeBytes: optBlob.size,
            originalBytes: origSize,
            savedPercent,
          });
        },
        mimeType,
        quality
      );
    }, 'image/png');
  });
}

export interface QueueSavingsEstimation {
  rawBytes: number;
  optimizedBytes: number;
  savedBytes: number;
  savedPercent: number;
}

/**
 * Calculates real-time estimated file sizes and savings across queued items
 */
export function estimateQueueSizes(
  items: Array<{ width: number; height: number; cleanedUrl?: string }>,
  config: { enabled: boolean; format: OptimizeFormat; quality?: number }
): QueueSavingsEstimation {
  if (items.length === 0) {
    return {
      rawBytes: 0,
      optimizedBytes: 0,
      savedBytes: 0,
      savedPercent: 0,
    };
  }

  let rawBytes = 0;
  for (const item of items) {
    if (item.cleanedUrl && item.cleanedUrl.startsWith('data:')) {
      const b64 = item.cleanedUrl.split(',')[1] || '';
      rawBytes += Math.round(b64.length * 0.75);
    } else {
      // Estimate baseline PNG size (approx 0.35 bytes/pixel for compressed photographic PNG)
      rawBytes += Math.round(item.width * item.height * 1.4);
    }
  }

  if (!config.enabled) {
    return {
      rawBytes,
      optimizedBytes: rawBytes,
      savedBytes: 0,
      savedPercent: 0,
    };
  }

  // Format ratio relative to raw PNG
  let ratio = 0.34; // WebP ~66% reduction
  if (config.format === 'webp') {
    const q = config.quality ?? 0.88;
    ratio = Math.max(0.18, Math.min(0.55, 0.34 * (q / 0.88)));
  } else if (config.format === 'jpeg') {
    const q = config.quality ?? 0.88;
    ratio = Math.max(0.25, Math.min(0.65, 0.44 * (q / 0.88)));
  } else if (config.format === 'png') {
    // Lossless PNG: metadata stripping provides ~5% size reduction
    ratio = 0.95;
  }

  const optimizedBytes = Math.round(rawBytes * ratio);
  const savedBytes = Math.max(0, rawBytes - optimizedBytes);
  const savedPercent = rawBytes > 0 ? Math.round((savedBytes / rawBytes) * 100) : 0;

  return {
    rawBytes,
    optimizedBytes,
    savedBytes,
    savedPercent,
  };
}

