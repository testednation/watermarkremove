export type DetectionMode = 'smart-auto' | 'corner-stamp' | 'diagonal-tiled' | 'luminance-key';
export type InpaintMethod = 'hybrid-smart' | 'patch-synthesis' | 'telea-inpaint' | 'alpha-unblend';

export interface DetectionZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  category: 'text' | 'logo';
  type: 'corner-logo' | 'timestamp' | 'diagonal-grid' | 'center-overlay' | 'manual';
}

export interface AutoDetectOptions {
  mode: DetectionMode;
  sensitivity: number; // 1 to 100 (default 68)
  dilationRadius: number; // 1 to 16 (default 5)
  removeText: boolean; // WatermarkRemover.io signature toggle: Remove Text
  removeLogo: boolean; // WatermarkRemover.io signature toggle: Remove Logo
  targetCorners: {
    bottomRight: boolean;
    bottomLeft: boolean;
    topRight: boolean;
    topLeft: boolean;
    centerAndTiled: boolean;
  };
}

export interface DetectionResult {
  mask: Uint8Array; // 0 = clean, 255 = watermark
  zones: DetectionZone[];
  coveragePercent: number;
  estimatedAlpha: number;
  dominantWatermarkLuma: number;
  textZonesCount: number;
  logoZonesCount: number;
}

/**
 * Computes fast 2D integral image for O(1) window sum queries.
 */
function buildIntegralImage(luma: Float32Array, width: number, height: number): Float64Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const srcOffset = y * width;
    const dstOffset = (y + 1) * stride;
    const prevDstOffset = y * stride;
    for (let x = 0; x < width; x++) {
      rowSum += luma[srcOffset + x];
      integral[dstOffset + x + 1] = integral[prevDstOffset + x + 1] + rowSum;
    }
  }
  return integral;
}

function getBoxMean(
  integral: Float64Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): number {
  const x0 = Math.max(0, cx - radius);
  const y0 = Math.max(0, cy - radius);
  const x1 = Math.min(width - 1, cx + radius);
  const y1 = Math.min(height - 1, cy + radius);
  const stride = width + 1;
  const sum =
    integral[(y1 + 1) * stride + (x1 + 1)] -
    integral[y0 * stride + (x1 + 1)] -
    integral[(y1 + 1) * stride + x0] +
    integral[y0 * stride + x0];
  const count = (x1 - x0 + 1) * (y1 - y0 + 1);
  return sum / Math.max(1, count);
}

/**
 * Morphological dilation with separable structuring element.
 */
export function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const r = Math.min(20, Math.round(radius));
  const horiz = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let lastSeen = -99999;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] > 0) lastSeen = x;
      if (x - lastSeen <= r) horiz[row + x] = 255;
    }
    lastSeen = 99999;
    for (let x = width - 1; x >= 0; x--) {
      if (mask[row + x] > 0) lastSeen = x;
      if (lastSeen - x <= r) horiz[row + x] = 255;
    }
  }

  for (let x = 0; x < width; x++) {
    let lastSeen = -99999;
    for (let y = 0; y < height; y++) {
      if (horiz[y * width + x] > 0) lastSeen = y;
      if (y - lastSeen <= r) out[y * width + x] = 255;
    }
    lastSeen = 99999;
    for (let y = height - 1; y >= 0; y--) {
      if (horiz[y * width + x] > 0) lastSeen = y;
      if (lastSeen - y <= r) out[y * width + x] = 255;
    }
  }

  return out;
}

/**
 * Automatically detects watermarks with separate classification for Text overlays vs Graphic Logos
 * (inspired by WatermarkRemover.io's "Remove Text" and "Remove Logo" pipeline).
 */
export function autoDetectWatermarkMask(
  imageData: ImageData,
  options: AutoDetectOptions
): DetectionResult {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  if (!options.removeText && !options.removeLogo) {
    return {
      mask: new Uint8Array(totalPixels),
      zones: [],
      coveragePercent: 0,
      estimatedAlpha: 0.45,
      dominantWatermarkLuma: 240,
      textZonesCount: 0,
      logoZonesCount: 0,
    };
  }

  const luma = new Float32Array(totalPixels);
  const sat = new Float32Array(totalPixels);
  const warmStampScore = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    sat[i] = maxC - minC;
    // Camera date stamps or colored corner badges (high chroma warm or cyan/blue emblem)
    if (r > 185 && g > 70 && g < 225 && b < 95 && r - b > 110) {
      warmStampScore[i] = (r - b) * 0.85;
    }
  }

  const integralLuma = buildIntegralImage(luma, width, height);
  const integralSat = buildIntegralImage(sat, width, height);

  // Compute Sobel gradient magnitude for high-frequency stroke detection
  const grad = new Float32Array(totalPixels);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const gx =
        -luma[idx - width - 1] +
        luma[idx - width + 1] -
        2 * luma[idx - 1] +
        2 * luma[idx + 1] -
        luma[idx + width - 1] +
        luma[idx + width + 1];
      const gy =
        -luma[idx - width - 1] -
        2 * luma[idx - width] -
        luma[idx - width + 1] +
        luma[idx + width - 1] +
        2 * luma[idx + width] +
        luma[idx + width + 1];
      grad[idx] = Math.hypot(gx, gy);
    }
  }

  const integralGrad = buildIntegralImage(grad, width, height);

  const sensFactor = (105 - Math.max(10, Math.min(95, options.sensitivity))) / 50;
  const rawMask = new Uint8Array(totalPixels);
  const localRadius = Math.max(14, Math.round(Math.min(width, height) * 0.025));

  for (let y = 2; y < height - 2; y++) {
    const ny = y / height;
    const row = y * width;

    for (let x = 2; x < width - 2; x++) {
      const nx = x / width;
      const idx = row + x;

      const inBottomRight = nx >= 0.58 && ny >= 0.72;
      const inBottomLeft = nx <= 0.42 && ny >= 0.72;
      const inTopRight = nx >= 0.62 && ny <= 0.25;
      const inTopLeft = nx <= 0.38 && ny <= 0.25;
      const inBottomBar = ny >= 0.84;

      let zoneAllowed = false;
      let zoneBoost = 1.0;

      if (options.mode === 'corner-stamp') {
        if (
          (inBottomRight && options.targetCorners.bottomRight) ||
          (inBottomLeft && options.targetCorners.bottomLeft) ||
          (inTopRight && options.targetCorners.topRight) ||
          (inTopLeft && options.targetCorners.topLeft) ||
          inBottomBar
        ) {
          zoneAllowed = true;
          zoneBoost = 1.35;
        }
      } else if (options.mode === 'diagonal-tiled') {
        zoneAllowed = true;
        zoneBoost = 1.15;
      } else if (options.mode === 'luminance-key') {
        zoneAllowed = true;
        zoneBoost = 1.2;
      } else {
        if (
          (inBottomRight && options.targetCorners.bottomRight) ||
          (inBottomLeft && options.targetCorners.bottomLeft) ||
          (inTopRight && options.targetCorners.topRight) ||
          (inTopLeft && options.targetCorners.topLeft)
        ) {
          zoneAllowed = true;
          zoneBoost = 1.45;
        } else if (options.targetCorners.centerAndTiled) {
          zoneAllowed = true;
          zoneBoost = 0.94;
        }
      }

      if (!zoneAllowed) continue;

      const localMean = getBoxMean(integralLuma, width, height, x, y, localRadius);
      const tightMean = getBoxMean(integralLuma, width, height, x, y, 4);
      const localGradDensity = getBoxMean(integralGrad, width, height, x, y, 7);
      const localSatMean = getBoxMean(integralSat, width, height, x, y, localRadius);
      const pixelLuma = luma[idx];
      const lumaDiff = pixelLuma - localMean;

      // 1. Camera amber/red date stamp or colored logo emblem in corner
      if (warmStampScore[idx] > 82 * sensFactor && localGradDensity > 20) {
        rawMask[idx] = 255;
        continue;
      }

      // 2. Multi-color graphic logo detection in corners (high saturation anomaly relative to neutral background)
      if (
        options.removeLogo &&
        (inBottomRight || inBottomLeft || inTopRight || inTopLeft) &&
        sat[idx] - localSatMean > 42 * sensFactor &&
        localGradDensity > 28 * sensFactor
      ) {
        rawMask[idx] = 255;
        continue;
      }

      const isNeutralOverlay = sat[idx] < 52 || pixelLuma > 212 || pixelLuma < 38;

      if (options.mode === 'luminance-key') {
        if (
          isNeutralOverlay &&
          lumaDiff > 25 * sensFactor &&
          pixelLuma > 162 &&
          localGradDensity > 24 * sensFactor
        ) {
          rawMask[idx] = 255;
        }
        continue;
      }

      const brightWatermarkScore =
        lumaDiff > (21 * sensFactor) / zoneBoost &&
        pixelLuma > 142 &&
        isNeutralOverlay &&
        (grad[idx] > 40 * sensFactor ||
          (tightMean - localMean > 17 * sensFactor && localGradDensity > 32 * sensFactor));

      const darkWatermarkScore =
        lumaDiff < (-27 * sensFactor) / zoneBoost &&
        pixelLuma < 92 &&
        localMean > 122 &&
        isNeutralOverlay &&
        localGradDensity > 36 * sensFactor;

      if (brightWatermarkScore || darkWatermarkScore) {
        rawMask[idx] = 255;
      }
    }
  }

  // Filter connected components and classify each cluster as 'text' or 'logo'
  const { filteredMask, zones } = filterAndClassifyComponents(
    rawMask,
    sat,
    warmStampScore,
    width,
    height,
    options
  );

  // Dilate mask to capture anti-aliased edges and compression rings
  const finalMask = dilateMask(filteredMask, width, height, options.dilationRadius);

  let maskedCount = 0;
  let sumLuma = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (finalMask[i] > 0) {
      maskedCount++;
      sumLuma += luma[i];
    }
  }

  const coveragePercent = Number(((maskedCount / totalPixels) * 100).toFixed(2));
  const dominantWatermarkLuma = maskedCount > 0 ? sumLuma / maskedCount : 240;

  return {
    mask: finalMask,
    zones,
    coveragePercent,
    estimatedAlpha: 0.45,
    dominantWatermarkLuma,
    textZonesCount: zones.filter((z) => z.category === 'text').length,
    logoZonesCount: zones.filter((z) => z.category === 'logo').length,
  };
}

/**
 * Groups nearby strokes into components, classifies each component as Text vs Logo
 * based on aspect ratio, stroke fill density, and color saturation, and filters according
 * to `options.removeText` and `options.removeLogo`.
 */
function filterAndClassifyComponents(
  rawMask: Uint8Array,
  sat: Float32Array,
  warmStampScore: Float32Array,
  width: number,
  height: number,
  options: AutoDetectOptions
): { filteredMask: Uint8Array; zones: DetectionZone[] } {
  const closed = dilateMask(rawMask, width, height, Math.max(4, Math.round(width * 0.008)));
  const visited = new Uint8Array(width * height);
  const filteredMask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const zones: DetectionZone[] = [];

  const minPixels = 12;
  const maxBoxRatio = options.mode === 'diagonal-tiled' ? 0.88 : 0.52;

  for (let i = 0; i < width * height; i++) {
    if (closed[i] === 0 || visited[i]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;

    let minX = i % width;
    let maxX = minX;
    let minY = Math.floor(i / width);
    let maxY = minY;
    let origActiveCount = 0;
    let sumSat = 0;
    let sumWarm = 0;

    while (head < tail) {
      const curr = queue[head++];
      if (rawMask[curr] > 0) {
        origActiveCount++;
        sumSat += sat[curr];
        sumWarm += warmStampScore[curr];
      }
      const cx = curr % width;
      const cy = (curr - cx) / width;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (cx > 0 && closed[curr - 1] > 0 && !visited[curr - 1]) {
        visited[curr - 1] = 1;
        queue[tail++] = curr - 1;
      }
      if (cx < width - 1 && closed[curr + 1] > 0 && !visited[curr + 1]) {
        visited[curr + 1] = 1;
        queue[tail++] = curr + 1;
      }
      if (cy > 0 && closed[curr - width] > 0 && !visited[curr - width]) {
        visited[curr - width] = 1;
        queue[tail++] = curr - width;
      }
      if (cy < height - 1 && closed[curr + width] > 0 && !visited[curr + width]) {
        visited[curr + width] = 1;
        queue[tail++] = curr + width;
      }
    }

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const boxArea = boxW * boxH;
    const fillRatio = origActiveCount / Math.max(1, boxArea);

    const isReasonableSize =
      origActiveCount >= minPixels &&
      (boxW < width * maxBoxRatio || boxH < height * maxBoxRatio) &&
      fillRatio < 0.89;

    if (!isReasonableSize) continue;

    const aspectRatio = boxW / Math.max(1, boxH);
    const meanSat = sumSat / Math.max(1, origActiveCount);
    const meanWarm = sumWarm / Math.max(1, origActiveCount);

    // Heuristic classification between graphic Logo emblem vs Text string:
    // - Logos tend to have more compact/square aspect ratios (0.55 to 1.85) OR higher color chroma (meanSat > 32)
    // - Text lines/timestamps tend to be elongated horizontally (aspectRatio > 1.85) or warm timestamps
    const isLogo =
      meanWarm < 30 &&
      ((aspectRatio >= 0.45 && aspectRatio <= 1.75 && boxH >= 20) || meanSat > 36);
    const category: 'text' | 'logo' = isLogo ? 'logo' : 'text';

    if (category === 'text' && !options.removeText) continue;
    if (category === 'logo' && !options.removeLogo) continue;

    for (let k = 0; k < tail; k++) {
      const idx = queue[k];
      if (rawMask[idx] > 0) {
        filteredMask[idx] = 255;
      }
    }

    const centerX = (minX + maxX) / 2 / width;
    const centerY = (minY + maxY) / 2 / height;

    let type: DetectionZone['type'] = 'center-overlay';
    let label = category === 'logo' ? 'Brand Logo Mark' : 'Text Overlay';

    if (meanWarm > 35) {
      type = 'timestamp';
      label = 'Date / Time Stamp';
    } else if (centerY > 0.7 && (centerX > 0.52 || centerX < 0.48)) {
      type = 'corner-logo';
      label = category === 'logo' ? 'Corner Brand Logo' : 'Corner Text Caption';
    } else if (centerY < 0.28 && (centerX > 0.52 || centerX < 0.48)) {
      type = 'corner-logo';
      label = category === 'logo' ? 'Top Graphic Badge' : 'Top Text Header';
    } else if (boxW > width * 0.4 && boxH > height * 0.4) {
      type = 'diagonal-grid';
      label = 'Diagonal Proof Text';
    }

    zones.push({
      id: `zone-${zones.length + 1}`,
      label,
      x: minX,
      y: minY,
      width: boxW,
      height: boxH,
      confidence: Math.min(99, Math.round(88 + Math.min(11, (boxW * boxH) / 450))),
      category,
      type,
    });
  }

  return { filteredMask, zones };
}

/**
 * Extracts detection zones from an arbitrary user-edited mask.
 */
export function extractDetectionZones(
  mask: Uint8Array,
  width: number,
  height: number
): DetectionZone[] {
  const clusterMask = dilateMask(mask, width, height, Math.max(8, Math.round(width * 0.015)));
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const zones: DetectionZone[] = [];

  for (let i = 0; i < width * height; i++) {
    if (clusterMask[i] === 0 || visited[i]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;

    let minX = i % width;
    let maxX = minX;
    let minY = Math.floor(i / width);
    let maxY = minY;

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = (curr - cx) / width;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (cx > 0 && clusterMask[curr - 1] > 0 && !visited[curr - 1]) {
        visited[curr - 1] = 1;
        queue[tail++] = curr - 1;
      }
      if (cx < width - 1 && clusterMask[curr + 1] > 0 && !visited[curr + 1]) {
        visited[curr + 1] = 1;
        queue[tail++] = curr + 1;
      }
      if (cy > 0 && clusterMask[curr - width] > 0 && !visited[curr - width]) {
        visited[curr - width] = 1;
        queue[tail++] = curr - width;
      }
      if (cy < height - 1 && clusterMask[curr + width] > 0 && !visited[curr + width]) {
        visited[curr + width] = 1;
        queue[tail++] = curr + width;
      }
    }

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (boxW < 8 && boxH < 8) continue;

    const aspect = boxW / Math.max(1, boxH);
    const category: 'text' | 'logo' = aspect >= 0.5 && aspect <= 1.7 ? 'logo' : 'text';

    zones.push({
      id: `zone-${zones.length + 1}`,
      label: category === 'logo' ? 'Logo / Graphic Stamp' : 'Text Watermark',
      x: minX,
      y: minY,
      width: boxW,
      height: boxH,
      confidence: Math.min(99, Math.round(88 + Math.min(11, (boxW * boxH) / 450))),
      category,
      type: 'manual',
    });
  }

  return zones;
}

/**
 * Magic Wand selection: clicks a point on a watermark and selects connected/nearby pixels
 * with similar color signature.
 */
export function magicWandMask(
  imageData: ImageData,
  existingMask: Uint8Array,
  startX: number,
  startY: number,
  tolerance: number = 38,
  searchRadius: number = 140
): Uint8Array {
  const { width, height, data } = imageData;
  const nextMask = new Uint8Array(existingMask);
  const sx = Math.max(0, Math.min(width - 1, Math.round(startX)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(startY)));
  const seedIdx = (sy * width + sx) * 4;
  const sr = data[seedIdx];
  const sg = data[seedIdx + 1];
  const sb = data[seedIdx + 2];

  const x0 = Math.max(0, sx - searchRadius);
  const x1 = Math.min(width - 1, sx + searchRadius);
  const y0 = Math.max(0, sy - searchRadius);
  const y1 = Math.min(height - 1, sy + searchRadius);

  const tempMask = new Uint8Array(width * height);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const distSq = (x - sx) * (x - sx) + (y - sy) * (y - sy);
      if (distSq > searchRadius * searchRadius) continue;
      const idx = y * width + x;
      const p = idx * 4;
      const dr = data[p] - sr;
      const dg = data[p + 1] - sg;
      const db = data[p + 2] - sb;
      const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (colorDist <= tolerance) {
        tempMask[idx] = 255;
      }
    }
  }

  const dilated = dilateMask(tempMask, width, height, 3);
  for (let i = 0; i < nextMask.length; i++) {
    if (dilated[i] > 0) nextMask[i] = 255;
  }
  return nextMask;
}

/**
 * Removes the watermark inside `mask` using Fast Marching Boundary Propagation,
 * Reverse Alpha Unblending, and Context-Aware Patch Texture Synthesis.
 */
export function removeWatermark(
  sourceImageData: ImageData,
  mask: Uint8Array,
  method: InpaintMethod = 'hybrid-smart'
): ImageData {
  const { width, height, data } = sourceImageData;
  const outData = new Uint8ClampedArray(data);
  const totalPixels = width * height;

  let maskedCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (mask[i] > 0) maskedCount++;
  }
  if (maskedCount === 0) {
    return new ImageData(outData, width, height);
  }

  const distMap = new Int16Array(totalPixels);
  const frontierQueue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < totalPixels; i++) {
    distMap[i] = mask[i] > 0 ? -1 : 0;
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      if (distMap[idx] !== -1) continue;
      const hasKnownNeighbor =
        (x > 0 && distMap[idx - 1] === 0) ||
        (x < width - 1 && distMap[idx + 1] === 0) ||
        (y > 0 && distMap[idx - width] === 0) ||
        (y < height - 1 && distMap[idx + width] === 0);
      if (hasKnownNeighbor) {
        distMap[idx] = 1;
        frontierQueue[tail++] = idx;
      }
    }
  }

  const inpaintedR = new Float32Array(totalPixels);
  const inpaintedG = new Float32Array(totalPixels);
  const inpaintedB = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    inpaintedR[i] = data[i * 4];
    inpaintedG[i] = data[i * 4 + 1];
    inpaintedB[i] = data[i * 4 + 2];
  }

  const offsetsX: number[] = [];
  const offsetsY: number[] = [];
  const offsetWeights: number[] = [];
  const sampleRadius = 4;
  for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const d = Math.hypot(dx, dy);
      if (d <= sampleRadius + 0.2) {
        offsetsX.push(dx);
        offsetsY.push(dy);
        offsetWeights.push(1 / (d * d));
      }
    }
  }

  while (head < tail) {
    const idx = frontierQueue[head++];
    const cx = idx % width;
    const cy = (idx - cx) / width;
    const currentDist = distMap[idx];

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumW = 0;

    for (let k = 0; k < offsetsX.length; k++) {
      const nx = cx + offsetsX[k];
      const ny = cy + offsetsY[k];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      const nDist = distMap[nIdx];
      if (nDist >= 0 && nDist < currentDist) {
        const boundaryBoost = nDist === 0 ? 2.6 : 1.0;
        const w = offsetWeights[k] * boundaryBoost;
        sumR += inpaintedR[nIdx] * w;
        sumG += inpaintedG[nIdx] * w;
        sumB += inpaintedB[nIdx] * w;
        sumW += w;
      }
    }

    if (sumW > 0) {
      const baseR = sumR / sumW;
      const baseG = sumG / sumW;
      const baseB = sumB / sumW;

      const origR = data[idx * 4];
      const origG = data[idx * 4 + 1];
      const origB = data[idx * 4 + 2];

      if (method === 'alpha-unblend' || method === 'hybrid-smart') {
        const origLuma = 0.299 * origR + 0.587 * origG + 0.114 * origB;
        const bgLuma = 0.299 * baseR + 0.587 * baseG + 0.114 * baseB;
        const lumaDelta = origLuma - bgLuma;

        if (lumaDelta > 12 && origLuma < 246 && 255 - bgLuma > 20) {
          const estAlpha = Math.max(0.05, Math.min(0.78, lumaDelta / Math.max(25, 255 - bgLuma)));
          const unblendR = Math.max(0, Math.min(255, (origR - estAlpha * 255) / (1 - estAlpha)));
          const unblendG = Math.max(0, Math.min(255, (origG - estAlpha * 255) / (1 - estAlpha)));
          const unblendB = Math.max(0, Math.min(255, (origB - estAlpha * 255) / (1 - estAlpha)));

          const inpaintMix = method === 'alpha-unblend' ? 0.35 : Math.min(0.82, 0.45 + estAlpha * 0.5);
          inpaintedR[idx] = baseR * inpaintMix + unblendR * (1 - inpaintMix);
          inpaintedG[idx] = baseG * inpaintMix + unblendG * (1 - inpaintMix);
          inpaintedB[idx] = baseB * inpaintMix + unblendB * (1 - inpaintMix);
        } else {
          inpaintedR[idx] = baseR;
          inpaintedG[idx] = baseG;
          inpaintedB[idx] = baseB;
        }
      } else {
        inpaintedR[idx] = baseR;
        inpaintedG[idx] = baseG;
        inpaintedB[idx] = baseB;
      }
    }

    if (cx > 0 && distMap[idx - 1] === -1) {
      distMap[idx - 1] = currentDist + 1;
      frontierQueue[tail++] = idx - 1;
    }
    if (cx < width - 1 && distMap[idx + 1] === -1) {
      distMap[idx + 1] = currentDist + 1;
      frontierQueue[tail++] = idx + 1;
    }
    if (cy > 0 && distMap[idx - width] === -1) {
      distMap[idx - width] = currentDist + 1;
      frontierQueue[tail++] = idx - width;
    }
    if (cy < height - 1 && distMap[idx + width] === -1) {
      distMap[idx + width] = currentDist + 1;
      frontierQueue[tail++] = idx + width;
    }
  }

  // Multi-pass anisotropic diffusion
  const diffusionPasses = method === 'alpha-unblend' ? 2 : 4;
  for (let pass = 0; pass < diffusionPasses; pass++) {
    for (let i = 0; i < tail; i++) {
      const idx = frontierQueue[i];
      const cx = idx % width;
      const cy = (idx - cx) / width;
      if (cx <= 0 || cx >= width - 1 || cy <= 0 || cy >= height - 1) continue;

      inpaintedR[idx] =
        inpaintedR[idx] * 0.4 +
        (inpaintedR[idx - 1] + inpaintedR[idx + 1] + inpaintedR[idx - width] + inpaintedR[idx + width]) * 0.15;
      inpaintedG[idx] =
        inpaintedG[idx] * 0.4 +
        (inpaintedG[idx - 1] + inpaintedG[idx + 1] + inpaintedG[idx - width] + inpaintedG[idx + width]) * 0.15;
      inpaintedB[idx] =
        inpaintedB[idx] * 0.4 +
        (inpaintedB[idx - 1] + inpaintedB[idx + 1] + inpaintedB[idx - width] + inpaintedB[idx + width]) * 0.15;
    }
  }

  // Context-aware exemplar patch texture synthesis (clones real surrounding high-frequency texture details)
  for (let i = 0; i < tail; i++) {
    const idx = frontierQueue[i];
    const cx = idx % width;
    const cy = (idx - cx) / width;
    const d = distMap[idx];

    let texDeltaR = 0;
    let texDeltaG = 0;
    let texDeltaB = 0;

    if (method === 'patch-synthesis' || method === 'hybrid-smart') {
      // Search along horizontal/vertical offset outside the mask to sample real local texture variance
      const strideOffset = Math.max(12, d * 2 + 6);
      const candX = cx + strideOffset < width && distMap[cy * width + cx + strideOffset] === 0
        ? cx + strideOffset
        : cx - strideOffset >= 0 && distMap[cy * width + cx - strideOffset] === 0
        ? cx - strideOffset
        : cx;
      const candY = cy + strideOffset < height && distMap[(cy + strideOffset) * width + cx] === 0
        ? cy + strideOffset
        : cy - strideOffset >= 0 && distMap[(cy - strideOffset) * width + cx] === 0
        ? cy - strideOffset
        : cy;

      const sampleIdx = candY * width + candX;
      if (distMap[sampleIdx] === 0 && candX > 0 && candX < width - 1) {
        // High-pass detail from unmasked neighbor
        const neighborMeanR = (inpaintedR[sampleIdx - 1] + inpaintedR[sampleIdx + 1]) * 0.5;
        const neighborMeanG = (inpaintedG[sampleIdx - 1] + inpaintedG[sampleIdx + 1]) * 0.5;
        const neighborMeanB = (inpaintedB[sampleIdx - 1] + inpaintedB[sampleIdx + 1]) * 0.5;
        const weight = method === 'patch-synthesis' ? 0.85 : 0.5;
        texDeltaR = (inpaintedR[sampleIdx] - neighborMeanR) * weight;
        texDeltaG = (inpaintedG[sampleIdx] - neighborMeanG) * weight;
        texDeltaB = (inpaintedB[sampleIdx] - neighborMeanB) * weight;
      }
    }

    const featherAlpha = d === 1 ? 0.65 : d === 2 ? 0.88 : 1.0;
    const hash = ((cx * 73856093) ^ (cy * 19349663)) & 255;
    const grain = ((hash / 255) - 0.5) * 2.0;

    const finalR = Math.round(
      Math.max(
        0,
        Math.min(255, (inpaintedR[idx] + texDeltaR + grain) * featherAlpha + data[idx * 4] * (1 - featherAlpha))
      )
    );
    const finalG = Math.round(
      Math.max(
        0,
        Math.min(255, (inpaintedG[idx] + texDeltaG + grain) * featherAlpha + data[idx * 4] * (1 - featherAlpha))
      )
    );
    const finalB = Math.round(
      Math.max(
        0,
        Math.min(255, (inpaintedB[idx] + texDeltaB + grain) * featherAlpha + data[idx * 4] * (1 - featherAlpha))
      )
    );

    outData[idx * 4] = finalR;
    outData[idx * 4 + 1] = finalG;
    outData[idx * 4 + 2] = finalB;
    outData[idx * 4 + 3] = data[idx * 4 + 3];
  }

  return new ImageData(outData, width, height);
}
