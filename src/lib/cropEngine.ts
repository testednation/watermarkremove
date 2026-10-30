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

export type EdgeAnomalyType = 'none' | 'empty-margin' | 'edge-noise' | 'watermark-band';

export interface AutoCropEdgeDetail {
  percent: number;
  pixels: number;
  type: EdgeAnomalyType;
  label: string;
}

export interface AutoCropSuggestion {
  params: CropParameters;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  hasNonContentMargins: boolean;
  confidence: number;
  summaryBadge: string;
  reason: string;
  trimmedAreaPercent: number;
  edgeBreakdown: {
    top: AutoCropEdgeDetail;
    bottom: AutoCropEdgeDetail;
    left: AutoCropEdgeDetail;
    right: AutoCropEdgeDetail;
  };
}

/**
 * Analyzes an image's outer periphery for empty/letterbox margins, consistent edge noise
 * (e.g., scanner borders, broadcast artifacts, frame lines), and peripheral watermark bands,
 * returning a suggested CropParameters configuration targeting non-content areas.
 */
export function analyzeAutoCropMargins(
  imageData: ImageData,
  zones: Array<{ x: number; y: number; width: number; height: number; label?: string }> = []
): AutoCropSuggestion {
  const { width, height, data } = imageData;
  const maxScanRatio = 0.30; // Never auto-suggest trimming more than 30% on a single edge

  // Helper to compute statistics for a horizontal row y (sampling every stepX pixels)
  const getRowStats = (y: number) => {
    const stepX = Math.max(1, Math.floor(width / 120));
    let sumR = 0,
      sumG = 0,
      sumB = 0,
      sumA = 0;
    let sumSqR = 0,
      sumSqG = 0,
      sumSqB = 0;
    let gradSum = 0;
    let highFreqNoiseCount = 0;
    let count = 0;
    let prevLum = -1;
    let prevDeltaSign = 0;

    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      sumR += r;
      sumG += g;
      sumB += b;
      sumA += a;
      sumSqR += r * r;
      sumSqG += g * g;
      sumSqB += b * b;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (prevLum >= 0) {
        const delta = lum - prevLum;
        const absDelta = Math.abs(delta);
        gradSum += absDelta;
        const sign = delta > 3 ? 1 : delta < -3 ? -1 : 0;
        if (sign !== 0 && prevDeltaSign !== 0 && sign !== prevDeltaSign && absDelta > 8) {
          highFreqNoiseCount++;
        }
        if (sign !== 0) prevDeltaSign = sign;
      }
      prevLum = lum;
      count++;
    }

    const n = Math.max(1, count);
    const meanR = sumR / n;
    const meanG = sumG / n;
    const meanB = sumB / n;
    const meanA = sumA / n;
    const varR = Math.max(0, sumSqR / n - meanR * meanR);
    const varG = Math.max(0, sumSqG / n - meanG * meanG);
    const varB = Math.max(0, sumSqB / n - meanB * meanB);
    const stdDev = Math.sqrt((varR + varG + varB) / 3);
    const meanGrad = gradSum / Math.max(1, n - 1);
    const noiseRatio = highFreqNoiseCount / Math.max(1, n - 1);
    const meanLum = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB;

    return { meanR, meanG, meanB, meanA, meanLum, stdDev, meanGrad, noiseRatio };
  };

  // Helper to compute statistics for a vertical column x (sampling every stepY pixels)
  const getColStats = (x: number) => {
    const stepY = Math.max(1, Math.floor(height / 120));
    let sumR = 0,
      sumG = 0,
      sumB = 0,
      sumA = 0;
    let sumSqR = 0,
      sumSqG = 0,
      sumSqB = 0;
    let gradSum = 0;
    let highFreqNoiseCount = 0;
    let count = 0;
    let prevLum = -1;
    let prevDeltaSign = 0;

    for (let y = 0; y < height; y += stepY) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      sumR += r;
      sumG += g;
      sumB += b;
      sumA += a;
      sumSqR += r * r;
      sumSqG += g * g;
      sumSqB += b * b;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (prevLum >= 0) {
        const delta = lum - prevLum;
        const absDelta = Math.abs(delta);
        gradSum += absDelta;
        const sign = delta > 3 ? 1 : delta < -3 ? -1 : 0;
        if (sign !== 0 && prevDeltaSign !== 0 && sign !== prevDeltaSign && absDelta > 8) {
          highFreqNoiseCount++;
        }
        if (sign !== 0) prevDeltaSign = sign;
      }
      prevLum = lum;
      count++;
    }

    const n = Math.max(1, count);
    const meanR = sumR / n;
    const meanG = sumG / n;
    const meanB = sumB / n;
    const meanA = sumA / n;
    const varR = Math.max(0, sumSqR / n - meanR * meanR);
    const varG = Math.max(0, sumSqG / n - meanG * meanG);
    const varB = Math.max(0, sumSqB / n - meanB * meanB);
    const stdDev = Math.sqrt((varR + varG + varB) / 3);
    const meanGrad = gradSum / Math.max(1, n - 1);
    const noiseRatio = highFreqNoiseCount / Math.max(1, n - 1);
    const meanLum = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB;

    return { meanR, meanG, meanB, meanA, meanLum, stdDev, meanGrad, noiseRatio };
  };

  // Scan an edge sequence of stats from index 0 .. maxLines - 1
  const scanEdgeSequence = (
    maxLines: number,
    totalDim: number,
    getStatsAt: (offset: number) => ReturnType<typeof getRowStats>
  ): AutoCropEdgeDetail => {
    if (maxLines < 2) {
      return { percent: 0, pixels: 0, type: 'none', label: 'Clean edge' };
    }

    const statsList: Array<ReturnType<typeof getRowStats>> = [];
    for (let i = 0; i < maxLines; i++) {
      statsList.push(getStatsAt(i));
    }

    const base = statsList[0];
    let emptyMarginLines = 0;

    // 1. Check for uniform / empty margin (solid border, letterbox, padding, or transparency)
    for (let i = 0; i < maxLines; i++) {
      const st = statsList[i];
      const colorDist = Math.sqrt(
        Math.pow(st.meanR - base.meanR, 2) +
          Math.pow(st.meanG - base.meanG, 2) +
          Math.pow(st.meanB - base.meanB, 2)
      );

      const isTransparent = st.meanA < 32;
      const isUniformLine = st.stdDev < 13.5 && st.meanGrad < 8.5 && colorDist < 20;

      if (isTransparent || isUniformLine) {
        emptyMarginLines = i + 1;
      } else {
        break;
      }
    }

    // 2. Check for consistent edge noise or framed border seam within outer 16%
    let edgeNoiseLines = 0;
    const maxNoiseLines = Math.min(maxLines - 1, Math.floor(totalDim * 0.16));
    for (let i = 0; i < maxNoiseLines; i++) {
      const st = statsList[i];
      const nextSt = statsList[i + 1];
      const lumJump = Math.abs(nextSt.meanLum - st.meanLum);

      // High-frequency static noise along the border or sharp frame boundary seam
      if (st.noiseRatio > 0.34 && st.stdDev > 18) {
        edgeNoiseLines = i + 1;
      } else if (i >= 2 && i <= Math.floor(totalDim * 0.12) && lumJump > 34 && st.stdDev < 22) {
        // Framed banner / border seam jump where outer strip was semi-uniform
        edgeNoiseLines = Math.max(edgeNoiseLines, i + 1);
        break;
      }
    }

    if (emptyMarginLines >= Math.max(2, Math.round(totalDim * 0.01))) {
      const pct = Math.min(30, Math.max(1, Math.round((emptyMarginLines / totalDim) * 100)));
      return {
        percent: pct,
        pixels: emptyMarginLines,
        type: 'empty-margin',
        label: `Empty margin (${pct}%)`,
      };
    }

    if (edgeNoiseLines >= Math.max(2, Math.round(totalDim * 0.01))) {
      const pct = Math.min(25, Math.max(1, Math.round((edgeNoiseLines / totalDim) * 100)));
      return {
        percent: pct,
        pixels: edgeNoiseLines,
        type: 'edge-noise',
        label: `Edge noise / frame (${pct}%)`,
      };
    }

    return { percent: 0, pixels: 0, type: 'none', label: 'Clean edge' };
  };

  const maxRowScan = Math.floor(height * maxScanRatio);
  const maxColScan = Math.floor(width * maxScanRatio);

  const topDetail = scanEdgeSequence(maxRowScan, height, (i) => getRowStats(i));
  const bottomDetail = scanEdgeSequence(maxRowScan, height, (i) => getRowStats(height - 1 - i));
  const leftDetail = scanEdgeSequence(maxColScan, width, (i) => getColStats(i));
  const rightDetail = scanEdgeSequence(maxColScan, width, (i) => getColStats(width - 1 - i));

  // 3. Also evaluate peripheral watermark / overlay zones near image edges (within outer 22%)
  // so that edge-hugging watermarks or timestamp strips are factored into non-content margin suggestions
  for (const z of zones) {
    const zTopRatio = z.y / height;
    const zBottomRatio = (z.y + z.height) / height;
    const zLeftRatio = z.x / width;
    const zRightRatio = (z.x + z.width) / width;

    // Bottom edge watermark band/stamp (most common)
    if (zBottomRatio >= 0.78 && zTopRatio >= 0.72) {
      const neededBottomPct = Math.min(
        26,
        Math.ceil(((height - z.y + Math.max(4, height * 0.01)) / height) * 100)
      );
      if (neededBottomPct > bottomDetail.percent && neededBottomPct <= 26) {
        bottomDetail.percent = neededBottomPct;
        bottomDetail.pixels = Math.round((neededBottomPct / 100) * height);
        bottomDetail.type =
          bottomDetail.type === 'empty-margin' ? 'empty-margin' : 'watermark-band';
        bottomDetail.label = `Non-content watermark strip (${neededBottomPct}%)`;
      }
    }
    // Top edge banner/timestamp
    else if (zTopRatio <= 0.22 && zBottomRatio <= 0.25) {
      const neededTopPct = Math.min(
        24,
        Math.ceil(((z.y + z.height + Math.max(4, height * 0.01)) / height) * 100)
      );
      if (neededTopPct > topDetail.percent && neededTopPct <= 24) {
        topDetail.percent = neededTopPct;
        topDetail.pixels = Math.round((neededTopPct / 100) * height);
        topDetail.type = topDetail.type === 'empty-margin' ? 'empty-margin' : 'watermark-band';
        topDetail.label = `Top non-content band (${neededTopPct}%)`;
      }
    }
    // Right edge vertical stamp (only if narrow strip near right border)
    else if (zRightRatio >= 0.82 && zLeftRatio >= 0.78 && z.width / width <= 0.22) {
      const neededRightPct = Math.min(
        22,
        Math.ceil(((width - z.x + Math.max(4, width * 0.01)) / width) * 100)
      );
      if (neededRightPct > rightDetail.percent && neededRightPct <= 22) {
        rightDetail.percent = neededRightPct;
        rightDetail.pixels = Math.round((neededRightPct / 100) * width);
        rightDetail.type = rightDetail.type === 'empty-margin' ? 'empty-margin' : 'watermark-band';
        rightDetail.label = `Right edge stamp (${neededRightPct}%)`;
      }
    }
    // Left edge vertical stamp
    else if (zLeftRatio <= 0.18 && zRightRatio <= 0.22 && z.width / width <= 0.22) {
      const neededLeftPct = Math.min(
        22,
        Math.ceil(((z.x + z.width + Math.max(4, width * 0.01)) / width) * 100)
      );
      if (neededLeftPct > leftDetail.percent && neededLeftPct <= 22) {
        leftDetail.percent = neededLeftPct;
        leftDetail.pixels = Math.round((neededLeftPct / 100) * width);
        leftDetail.type = leftDetail.type === 'empty-margin' ? 'empty-margin' : 'watermark-band';
        leftDetail.label = `Left edge stamp (${neededLeftPct}%)`;
      }
    }
  }

  let marginTop = topDetail.percent;
  let marginBottom = bottomDetail.percent;
  let marginLeft = leftDetail.percent;
  let marginRight = rightDetail.percent;

  const hasDetectedAny = marginTop + marginBottom + marginLeft + marginRight > 0;

  // Build human-readable explanation and summary badge
  const activeEdges: string[] = [];
  const reasonParts: string[] = [];

  if (marginTop > 0) {
    activeEdges.push(`Top ${marginTop}%`);
    reasonParts.push(topDetail.label.toLowerCase());
  }
  if (marginBottom > 0) {
    activeEdges.push(`Bottom ${marginBottom}%`);
    reasonParts.push(bottomDetail.label.toLowerCase());
  }
  if (marginLeft > 0) {
    activeEdges.push(`Left ${marginLeft}%`);
    reasonParts.push(leftDetail.label.toLowerCase());
  }
  if (marginRight > 0) {
    activeEdges.push(`Right ${marginRight}%`);
    reasonParts.push(rightDetail.label.toLowerCase());
  }

  let summaryBadge = 'Edge Trim';
  let reason = '';
  let confidence = 92;

  if (hasDetectedAny) {
    summaryBadge = activeEdges.slice(0, 2).join(' · ') + (activeEdges.length > 2 ? ` +${activeEdges.length - 2}` : '');
    reason = `Detected ${reasonParts.join(', ')} on active image periphery.`;
    const hasEmptyOrNoise =
      [topDetail, bottomDetail, leftDetail, rightDetail].some(
        (d) => d.type === 'empty-margin' || d.type === 'edge-noise'
      );
    confidence = hasEmptyOrNoise ? 96 : 91;
  } else {
    // Fallback when image is full-bleed with minimal edge noise: suggest a conservative 6% bottom trim
    marginBottom = 6;
    bottomDetail.percent = 6;
    bottomDetail.pixels = Math.round(height * 0.06);
    bottomDetail.type = 'edge-noise';
    bottomDetail.label = 'Conservative bottom footer trim (6%)';
    summaryBadge = 'Bottom 6%';
    reason = 'No empty letterbox borders found; suggesting conservative 6% bottom periphery trim.';
    confidence = 78;
  }

  const params: CropParameters = {
    mode: 'margins',
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    aspectRatio: '16:9',
    anchor: 'top-center',
    boxX: marginLeft,
    boxY: marginTop,
    boxWidth: Math.max(20, 100 - marginLeft - marginRight),
    boxHeight: Math.max(20, 100 - marginTop - marginBottom),
  };

  const rect = calculateCropRect(width, height, params);
  const origArea = Math.max(1, width * height);
  const trimmedAreaPercent = Math.max(
    1,
    Math.min(100, Math.round(((origArea - rect.width * rect.height) / origArea) * 100))
  );

  return {
    params,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    hasNonContentMargins: hasDetectedAny,
    confidence,
    summaryBadge,
    reason,
    trimmedAreaPercent,
    edgeBreakdown: {
      top: topDetail,
      bottom: bottomDetail,
      left: leftDetail,
      right: rightDetail,
    },
  };
}

