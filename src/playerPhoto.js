import { getCoachColor } from './asta-setup.js';

const PHOTO_MAX = 200;
const PHOTO_QUALITY = 0.7;

export function getPlayerInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getPlayerAvatarColor(playerId) {
  return getCoachColor(playerId || 1);
}

export function compressPhotoDataUrl(img) {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_MAX;
  canvas.height = PHOTO_MAX;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(PHOTO_MAX / img.width, PHOTO_MAX / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (PHOTO_MAX - w) / 2, (PHOTO_MAX - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

export function readPlayerPhotoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('File non valido'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          resolve(compressPhotoDataUrl(img));
        } catch {
          reject(new Error('Compressione fallita'));
        }
      };
      img.onerror = () => reject(new Error('Immagine non valida'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Lettura file fallita'));
    reader.readAsDataURL(file);
  });
}
