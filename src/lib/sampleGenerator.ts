import { DetectionMode } from './watermarkEngine';

export interface SamplePreset {
  id: string;
  title: string;
  subtitle: string;
  watermarkType: string;
  recommendedMode: DetectionMode;
  width: number;
  height: number;
  renderToDataUrl: () => string;
}

/**
 * Generates high-resolution, 100% offline test photographs with realistic watermarks
 * (Stock corner logo, Vintage camera date stamp, Diagonal proof mesh, Product studio badge)
 * so users can test automatic watermark removal immediately even without internet.
 */
export const OFFLINE_SAMPLES: SamplePreset[] = [
  {
    id: 'alpine-twilight',
    title: 'Alpine Lake Twilight',
    subtitle: 'Corner Stock Agency Stamp',
    watermarkType: 'Bottom-Right Translucent Logo',
    recommendedMode: 'smart-auto',
    width: 960,
    height: 600,
    renderToDataUrl: () => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      // Twilight sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, 380);
      sky.addColorStop(0, '#0f172a');
      sky.addColorStop(0.45, '#1e3a8a');
      sky.addColorStop(0.8, '#3b82f6');
      sky.addColorStop(1, '#93c5fd');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 960, 380);

      // Soft sun glow
      const glow = ctx.createRadialGradient(260, 260, 10, 260, 260, 220);
      glow.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
      glow.addColorStop(0.5, 'rgba(251, 146, 60, 0.2)');
      glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 960, 380);

      // Distant mountain range
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(0, 370);
      ctx.lineTo(140, 210);
      ctx.lineTo(270, 295);
      ctx.lineTo(430, 165);
      ctx.lineTo(590, 280);
      ctx.lineTo(750, 185);
      ctx.lineTo(960, 310);
      ctx.lineTo(960, 380);
      ctx.closePath();
      ctx.fill();

      // Foreground mountain ridge
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(0, 380);
      ctx.lineTo(90, 290);
      ctx.lineTo(240, 340);
      ctx.lineTo(390, 250);
      ctx.lineTo(560, 335);
      ctx.lineTo(710, 265);
      ctx.lineTo(860, 325);
      ctx.lineTo(960, 285);
      ctx.lineTo(960, 380);
      ctx.closePath();
      ctx.fill();

      // Calm alpine lake reflection
      const lake = ctx.createLinearGradient(0, 375, 0, 600);
      lake.addColorStop(0, '#1e3a8a');
      lake.addColorStop(0.4, '#172554');
      lake.addColorStop(1, '#090d16');
      ctx.fillStyle = lake;
      ctx.fillRect(0, 375, 960, 225);

      // Subtle water ripples
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.14)';
      ctx.lineWidth = 1.5;
      for (let y = 390; y < 585; y += 14) {
        ctx.beginPath();
        ctx.moveTo(40 + ((y * 37) % 180), y);
        ctx.lineTo(220 + ((y * 53) % 340), y);
        ctx.stroke();
      }

      // Add realistic semi-transparent stock watermark in bottom-right corner
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.56)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(648, 508, 34, 34);
      ctx.beginPath();
      ctx.arc(665, 525, 9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('AEROSTOCK', 694, 530);
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.fillText('ID #8849201 · PREVIEW', 694, 548);
      ctx.restore();

      return canvas.toDataURL('image/png');
    },
  },
  {
    id: 'kyoto-film-stamp',
    title: 'Sunset Coastline 35mm',
    subtitle: 'Orange Quartz Camera Timestamp',
    watermarkType: 'Bottom-Right Amber Date Stamp',
    recommendedMode: 'corner-stamp',
    width: 960,
    height: 600,
    renderToDataUrl: () => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      // Warm golden hour coastal gradient
      const bg = ctx.createLinearGradient(0, 0, 0, 410);
      bg.addColorStop(0, '#31102f');
      bg.addColorStop(0.35, '#7c2d12');
      bg.addColorStop(0.75, '#ea580c');
      bg.addColorStop(1, '#fde047');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 960, 410);

      // Setting sun disc
      ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
      ctx.beginPath();
      ctx.arc(480, 320, 62, 0, Math.PI * 2);
      ctx.fill();

      // Ocean horizon
      const sea = ctx.createLinearGradient(0, 405, 0, 600);
      sea.addColorStop(0, '#431407');
      sea.addColorStop(0.5, '#1c1917');
      sea.addColorStop(1, '#0c0a09');
      ctx.fillStyle = sea;
      ctx.fillRect(0, 405, 960, 195);

      // Headland silhouette
      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.moveTo(0, 410);
      ctx.lineTo(0, 290);
      ctx.lineTo(145, 315);
      ctx.lineTo(290, 375);
      ctx.lineTo(380, 410);
      ctx.closePath();
      ctx.fill();

      // Classic 90s quartz camera orange timestamp in bottom-right
      ctx.save();
      ctx.font = '700 28px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255, 138, 20, 0.92)';
      ctx.shadowColor = 'rgba(234, 88, 12, 0.45)';
      ctx.shadowBlur = 4;
      ctx.fillText("'98 08 24  18:42", 650, 548);
      ctx.restore();

      return canvas.toDataURL('image/png');
    },
  },
  {
    id: 'architectural-studio',
    title: 'Minimalist Concrete Pavilion',
    subtitle: 'Multi-Corner Proof Watermarks',
    watermarkType: 'Top-Left + Bottom-Right Badges',
    recommendedMode: 'smart-auto',
    width: 960,
    height: 600,
    renderToDataUrl: () => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      // Clean architectural sky & concrete planes
      const sky = ctx.createLinearGradient(0, 0, 960, 600);
      sky.addColorStop(0, '#1e293b');
      sky.addColorStop(0.5, '#334155');
      sky.addColorStop(1, '#0f172a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 960, 600);

      // Architectural brutalist geometric walls
      ctx.fillStyle = '#475569';
      ctx.fillRect(140, 160, 440, 340);

      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(580, 160);
      ctx.lineTo(790, 230);
      ctx.lineTo(790, 500);
      ctx.lineTo(580, 500);
      ctx.closePath();
      ctx.fill();

      // Warm interior architectural window light
      const win = ctx.createLinearGradient(220, 230, 500, 420);
      win.addColorStop(0, '#38bdf8');
      win.addColorStop(1, '#0284c7');
      ctx.fillStyle = win;
      ctx.fillRect(220, 230, 280, 170);

      // Reflecting pool at base
      const pool = ctx.createLinearGradient(0, 490, 0, 600);
      pool.addColorStop(0, '#0f172a');
      pool.addColorStop(1, '#1e293b');
      ctx.fillStyle = pool;
      ctx.fillRect(0, 490, 960, 110);

      // Top-left & Bottom-right translucent watermarks
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.54)';
      ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('ARCHIVIEW STUDIO', 46, 58);
      ctx.font = '500 12px "JetBrains Mono", monospace';
      ctx.fillText('UNLICENSED COMP', 46, 78);

      ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('© ARCHIVIEW 2026', 690, 545);
      ctx.restore();

      return canvas.toDataURL('image/png');
    },
  },
];
