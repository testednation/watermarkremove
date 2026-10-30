/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CropMode = 'margins' | 'aspect-ratio' | 'coordinates';

export type AspectRatioPreset =
  | 'free'
  | '1:1'
  | '16:9'
  | '4:3'
  | '3:2'
  | '9:16'
  | '4:5'
  | '2:1';

export type CropAnchor =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface CropParameters {
  mode: CropMode;
  // Margins in percentage (0 to 50%)
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  // Aspect ratio and anchor
  aspectRatio: AspectRatioPreset;
  anchor: CropAnchor;
  // Coordinates box in percentage (0 to 100%)
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ASPECT_RATIO_VALUES: Record<Exclude<AspectRatioPreset, 'free'>, number> = {
  '1:1': 1,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '3:2': 1.5,
  '9:16': 9 / 16,
  '4:5': 4 / 5,
  '2:1': 2.0,
};

export interface CropPresetDefinition {
  id: string;
  label: string;
  description: string;
  params: Partial<CropParameters>;
}

export const WATERMARK_CROP_PRESETS: CropPresetDefinition[] = [
  {
    id: 'trim-bottom-watermark',
    label: 'Trim Bottom Watermark (-8%)',
    description: 'Removes bottom 8% strip containing photographer credits, dates, or site logos',
    params: {
      mode: 'margins',
      marginTop: 0,
      marginBottom: 8,
      marginLeft: 0,
      marginRight: 0,
    },
  },
  {
    id: 'trim-bottom-large',
    label: 'Trim Bottom Watermark (-14%)',
    description: 'Generous bottom trim for multi-line copyright banners or stock proof stamps',
    params: {
      mode: 'margins',
      marginTop: 0,
      marginBottom: 14,
      marginLeft: 0,
      marginRight: 0,
    },
  },
  {
    id: 'trim-bottom-right',
    label: 'Trim Bottom-Right Corner',
    description: 'Trims bottom 10% and right 12% to eliminate corner watermark badges',
    params: {
      mode: 'margins',
      marginTop: 0,
      marginBottom: 10,
      marginLeft: 0,
      marginRight: 12,
    },
  },
  {
    id: 'trim-bottom-left',
    label: 'Trim Bottom-Left Corner',
    description: 'Trims bottom 10% and left 12% to exclude bottom-left corner stamps',
    params: {
      mode: 'margins',
      marginTop: 0,
      marginBottom: 10,
      marginLeft: 12,
      marginRight: 0,
    },
  },
  {
    id: 'trim-top-banner',
    label: 'Trim Top Banner (-8%)',
    description: 'Crops top 8% strip containing site header watermarks or broadcast banners',
    params: {
      mode: 'margins',
      marginTop: 8,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    },
  },
  {
    id: 'ratio-16-9-top',
    label: '16:9 Widescreen (Top-Anchored)',
    description: 'Fits 16:9 ratio anchored at top, completely discarding bottom watermarks',
    params: {
      mode: 'aspect-ratio',
      aspectRatio: '16:9',
      anchor: 'top-center',
    },
  },
  {
    id: 'ratio-4-3-top',
    label: '4:3 Standard (Top-Anchored)',
    description: 'Classic photo ratio anchored at top, preserving subjects while pruning bottom watermark',
    params: {
      mode: 'aspect-ratio',
      aspectRatio: '4:3',
      anchor: 'top-center',
    },
  },
  {
    id: 'ratio-1-1-center',
    label: '1:1 Square (Center)',
    description: 'Symmetric square crop centered on the image',
    params: {
      mode: 'aspect-ratio',
      aspectRatio: '1:1',
      anchor: 'center',
    },
  },
];

/**
 * Calculates the exact pixel crop rectangle for an image with the given dimensions
 * using the provided normalized crop parameters.
 */
export function calculateCropRect(
  sourceWidth: number,
  sourceHeight: number,
  params: CropParameters
): CropRect {
  let x = 0;
  let y = 0;
  let w = sourceWidth;
  let h = sourceHeight;

  if (params.mode === 'margins') {
    x = Math.round((params.marginLeft / 100) * sourceWidth);
    y = Math.round((params.marginTop / 100) * sourceHeight);
    w = Math.round(sourceWidth * (1 - (params.marginLeft + params.marginRight) / 100));
    h = Math.round(sourceHeight * (1 - (params.marginTop + params.marginBottom) / 100));
  } else if (params.mode === 'coordinates') {
    x = Math.round((params.boxX / 100) * sourceWidth);
    y = Math.round((params.boxY / 100) * sourceHeight);
    w = Math.round((params.boxWidth / 100) * sourceWidth);
    h = Math.round((params.boxHeight / 100) * sourceHeight);
  } else if (params.mode === 'aspect-ratio') {
    if (params.aspectRatio === 'free') {
      x = Math.round((params.boxX / 100) * sourceWidth);
      y = Math.round((params.boxY / 100) * sourceHeight);
      w = Math.round((params.boxWidth / 100) * sourceWidth);
      h = Math.round((params.boxHeight / 100) * sourceHeight);
    } else {
      const targetRatio = ASPECT_RATIO_VALUES[params.aspectRatio];
      const sourceRatio = sourceWidth / sourceHeight;

      if (sourceRatio > targetRatio) {
        // Source is wider than target ratio: constrained by height
        h = sourceHeight;
        w = Math.round(sourceHeight * targetRatio);
      } else {
        // Source is taller than target ratio: constrained by width
        w = sourceWidth;
        h = Math.round(sourceWidth / targetRatio);
      }

      // Compute horizontal offset
      if (params.anchor.includes('left')) {
        x = 0;
      } else if (params.anchor.includes('right')) {
        x = sourceWidth - w;
      } else {
        x = Math.round((sourceWidth - w) / 2);
      }

      // Compute vertical offset
      if (params.anchor.startsWith('top')) {
        y = 0;
      } else if (params.anchor.startsWith('bottom')) {
        y = sourceHeight - h;
      } else {
        y = Math.round((sourceHeight - h) / 2);
      }
    }
  }

  // Enforce boundary safety
  x = Math.max(0, Math.min(sourceWidth - 2, x));
  y = Math.max(0, Math.min(sourceHeight - 2, y));
  w = Math.max(2, Math.min(sourceWidth - x, w));
  h = Math.max(2, Math.min(sourceHeight - y, h));

  return { x, y, width: w, height: h };
}

/**
 * Creates a cropped ImageData from a source ImageData using the specified crop rectangle.
 */
export function cropImageData(source: ImageData, rect: CropRect): ImageData {
  const sx = Math.max(0, Math.min(source.width - 1, Math.round(rect.x)));
  const sy = Math.max(0, Math.min(source.height - 1, Math.round(rect.y)));
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(rect.width)));
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(rect.height)));

  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(source, 0, 0);

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const outCtx = out.getContext('2d')!;
  outCtx.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);

  return outCtx.getImageData(0, 0, sw, sh);
}
