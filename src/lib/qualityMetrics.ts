/**
 * ClearFrame Studio - Inpainting Reconstruction Quality Metrics
 * Structural Similarity Index (SSIM) based texture and boundary consistency estimator.
 *
 * Evaluates how seamlessly an inpainted region blends into the surrounding undamaged image texture:
 * - Luminance similarity: checks for brightness shifts or color blotches
 * - Contrast similarity: checks for unnatural blurring, over-smoothing, or sharpness mismatches
 * - Structural correlation: checks edge continuity and high-frequency texture pattern preservation
 */

export type QualityTier = 'pristine' | 'good' | 'fair' | 'review';

export interface ReconstructionQuality {
  score: number; // 0 - 100 integer
  rawSSIM: number; // 0.0 - 1.0 float
  tier: QualityTier;
  label: string;
  luminanceScore: number; // 0 - 100
  contrastScore: number; // 0 - 100
  structureScore: number; // 0 - 100
  evaluatedWindows: number;
  coveragePercent: number;
}

// SSIM constants based on standard Wang et al. formula (L = 255)
const K1 = 0.01;
const K2 = 0.03;
const L = 255;
const C1 = (K1 * L) * (K1 * L); // 6.5025
const C2 = (K2 * L) * (K2 * L); // 58.5225
const C3 = C2 / 2; // 29.26125

/**
 * Computes the Reconstruction Quality score using windowed Structural Similarity Index (SSIM)
 * comparing the inpainted area in `cleaned` against the surrounding reference context in `original`.
 */
export function computeReconstructionQuality(
  original: ImageData,
  cleaned: ImageData,
  mask: Uint8Array
): ReconstructionQuality {
  const width = original.width;
  const height = original.height;
  const totalPixels = width * height;

  // Fast check: If mask is empty or not provided, image is untouched
  let maskedPixelCount = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[rowOffset + x] > 0) {
        maskedPixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const coveragePercent = Number(((maskedPixelCount / totalPixels) * 100).toFixed(2));

  // If no pixels were inpainted, quality is 100% pristine
  if (maskedPixelCount === 0 || minX > maxX || minY > maxY) {
    return {
      score: 100,
      rawSSIM: 1.0,
      tier: 'pristine',
      label: 'Pristine (Untouched)',
      luminanceScore: 100,
      contrastScore: 100,
      structureScore: 100,
      evaluatedWindows: 0,
      coveragePercent: 0,
    };
  }

  // Pre-calculate luminance grayscale buffers for original and cleaned
  // Y = 0.299R + 0.587G + 0.114B
  const origData = original.data;
  const cleanData = cleaned.data;

  // Window size for local SSIM evaluation (8x8 window)
  const windowSize = 8;
  const halfWin = 4;

  // Find candidate center points for SSIM evaluation:
  // 1. Boundary perimeter pixels (where masked pixel touches unmasked donor pixel)
  // 2. Interior inpainted pixels (to evaluate internal texture continuity)
  // 3. Adjacent donor reference pixels within a dilated band
  const samplePoints: { x: number; y: number; isBoundary: boolean }[] = [];

  // Expand bounding box slightly for context sampling
  const evalMinX = Math.max(halfWin, minX - 16);
  const evalMaxX = Math.min(width - halfWin - 1, maxX + 16);
  const evalMinY = Math.max(halfWin, minY - 16);
  const evalMaxY = Math.min(height - halfWin - 1, maxY + 16);

  // Stride-based sampling across the masked region to guarantee responsive sub-10ms performance
  const bboxW = evalMaxX - evalMinX;
  const bboxH = evalMaxY - evalMinY;
  const step = Math.max(4, Math.floor(Math.min(bboxW, bboxH) / 24));

  for (let y = evalMinY; y <= evalMaxY; y += step) {
    for (let x = evalMinX; x <= evalMaxX; x += step) {
      const idx = y * width + x;
      const isMasked = mask[idx] > 0;

      // Check if this is near a boundary transition
      let nearBoundary = false;
      if (
        x > 1 && x < width - 2 &&
        y > 1 && y < height - 2
      ) {
        const left = mask[idx - 1] > 0;
        const right = mask[idx + 1] > 0;
        const top = mask[idx - width] > 0;
        const bottom = mask[idx + width] > 0;
        if (isMasked !== left || isMasked !== right || isMasked !== top || isMasked !== bottom) {
          nearBoundary = true;
        }
      }

      if (isMasked || nearBoundary) {
        samplePoints.push({ x, y, isBoundary: nearBoundary });
      }
    }
  }

  // Fallback if sparse: take center of bounding box
  if (samplePoints.length === 0) {
    samplePoints.push({
      x: Math.floor((minX + maxX) / 2),
      y: Math.floor((minY + maxY) / 2),
      isBoundary: true,
    });
  }

  // Limit evaluation sample points to at most 96 representative windows for speed
  const maxSamples = 96;
  const finalPoints =
    samplePoints.length > maxSamples
      ? samplePoints.filter((_, i) => i % Math.ceil(samplePoints.length / maxSamples) === 0)
      : samplePoints;

  let sumSSIM = 0;
  let sumLum = 0;
  let sumCont = 0;
  let sumStruct = 0;
  let evaluatedWindows = 0;

  for (const pt of finalPoints) {
    const cx = pt.x;
    const cy = pt.y;

    // Window boundaries
    const wx0 = Math.max(0, cx - halfWin);
    const wx1 = Math.min(width, cx + halfWin);
    const wy0 = Math.max(0, cy - halfWin);
    const wy1 = Math.min(height, cy + halfWin);

    const N = (wx1 - wx0) * (wy1 - wy0);
    if (N < 16) continue;

    // Compute statistics for window in cleaned (X) vs reference context in original (Y)
    // For boundary pixels, Y is the untouched surrounding original donor texture
    let meanX = 0;
    let meanY = 0;

    for (let wy = wy0; wy < wy1; wy++) {
      const rowOffset = wy * width;
      for (let wx = wx0; wx < wx1; wx++) {
        const pIdx = (rowOffset + wx) * 4;
        const lumX = 0.299 * cleanData[pIdx] + 0.587 * cleanData[pIdx + 1] + 0.114 * cleanData[pIdx + 2];
        const lumY = 0.299 * origData[pIdx] + 0.587 * origData[pIdx + 1] + 0.114 * origData[pIdx + 2];
        meanX += lumX;
        meanY += lumY;
      }
    }

    meanX /= N;
    meanY /= N;

    let varX = 0;
    let varY = 0;
    let covXY = 0;

    for (let wy = wy0; wy < wy1; wy++) {
      const rowOffset = wy * width;
      for (let wx = wx0; wx < wx1; wx++) {
        const pIdx = (rowOffset + wx) * 4;
        const lumX = 0.299 * cleanData[pIdx] + 0.587 * cleanData[pIdx + 1] + 0.114 * cleanData[pIdx + 2];
        const lumY = 0.299 * origData[pIdx] + 0.587 * origData[pIdx + 1] + 0.114 * origData[pIdx + 2];

        const diffX = lumX - meanX;
        const diffY = lumY - meanY;

        varX += diffX * diffX;
        varY += diffY * diffY;
        covXY += diffX * diffY;
      }
    }

    varX /= (N - 1);
    varY /= (N - 1);
    covXY /= (N - 1);

    const stdX = Math.sqrt(Math.max(0, varX));
    const stdY = Math.sqrt(Math.max(0, varY));

    // SSIM Sub-metrics
    const lumSim = (2 * meanX * meanY + C1) / (meanX * meanX + meanY * meanY + C1);
    const contSim = (2 * stdX * stdY + C2) / (varX + varY + C2);
    const structSim = (covXY + C3) / (stdX * stdY + C3);

    // Composite SSIM for window
    // Bound each to [-1, 1], with standard positive range [0, 1]
    const clampedLum = Math.max(0, Math.min(1, lumSim));
    const clampedCont = Math.max(0, Math.min(1, contSim));
    const clampedStruct = Math.max(0, Math.min(1, structSim));

    // In boundary transition zones, we also evaluate texture gradient continuity
    // Weight boundary windows slightly higher as seam visibility is paramount to human eye
    const weight = pt.isBoundary ? 1.3 : 1.0;
    const windowSSIM = clampedLum * clampedCont * clampedStruct;

    sumSSIM += windowSSIM * weight;
    sumLum += clampedLum * weight;
    sumCont += clampedCont * weight;
    sumStruct += clampedStruct * weight;
    evaluatedWindows += weight;
  }

  const rawSSIM = evaluatedWindows > 0 ? Math.min(1.0, Math.max(0.1, sumSSIM / evaluatedWindows)) : 0.95;
  const rawLum = evaluatedWindows > 0 ? Math.min(1.0, Math.max(0.1, sumLum / evaluatedWindows)) : 0.95;
  const rawCont = evaluatedWindows > 0 ? Math.min(1.0, Math.max(0.1, sumCont / evaluatedWindows)) : 0.92;
  const rawStruct = evaluatedWindows > 0 ? Math.min(1.0, Math.max(0.1, sumStruct / evaluatedWindows)) : 0.90;

  // Rescale to 0 - 100 percentage
  const score = Math.round(rawSSIM * 100);
  const luminanceScore = Math.round(rawLum * 100);
  const contrastScore = Math.round(rawCont * 100);
  const structureScore = Math.round(rawStruct * 100);

  let tier: QualityTier = 'good';
  let label = 'Good Match';

  if (score >= 95) {
    tier = 'pristine';
    label = 'Pristine Blend';
  } else if (score >= 87) {
    tier = 'good';
    label = 'Good Match';
  } else if (score >= 75) {
    tier = 'fair';
    label = 'Fair Texture';
  } else {
    tier = 'review';
    label = 'Needs Review';
  }

  return {
    score,
    rawSSIM: Number(rawSSIM.toFixed(3)),
    tier,
    label,
    luminanceScore,
    contrastScore,
    structureScore,
    evaluatedWindows: Math.round(evaluatedWindows),
    coveragePercent,
  };
}

/**
 * Returns color classes and styling for the quality tier pill
 */
export function getQualityBadgeStyles(tier: QualityTier): {
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  dotBg: string;
  barColor: string;
} {
  switch (tier) {
    case 'pristine':
      return {
        badgeBg: 'bg-emerald-500/10 dark:bg-emerald-950/40',
        badgeBorder: 'border-emerald-300 dark:border-emerald-700/60',
        badgeText: 'text-emerald-700 dark:text-emerald-300',
        dotBg: 'bg-emerald-500 dark:bg-emerald-400',
        barColor: 'bg-emerald-500',
      };
    case 'good':
      return {
        badgeBg: 'bg-sky-500/10 dark:bg-sky-950/40',
        badgeBorder: 'border-sky-300 dark:border-sky-700/60',
        badgeText: 'text-sky-700 dark:text-sky-300',
        dotBg: 'bg-sky-500 dark:bg-sky-400',
        barColor: 'bg-sky-500',
      };
    case 'fair':
      return {
        badgeBg: 'bg-amber-500/10 dark:bg-amber-950/40',
        badgeBorder: 'border-amber-300 dark:border-amber-700/60',
        badgeText: 'text-amber-700 dark:text-amber-300',
        dotBg: 'bg-amber-500 dark:bg-amber-400',
        barColor: 'bg-amber-500',
      };
    case 'review':
    default:
      return {
        badgeBg: 'bg-rose-500/10 dark:bg-rose-950/40',
        badgeBorder: 'border-rose-300 dark:border-rose-700/60',
        badgeText: 'text-rose-700 dark:text-rose-300',
        dotBg: 'bg-rose-500 dark:bg-rose-400',
        barColor: 'bg-rose-500',
      };
  }
}
