import type { ImageAttachment } from './types.ts';

export function mergeImageAttachments(current: ImageAttachment[], added: ImageAttachment[]): ImageAttachment[] {
  const seen = new Set(current.map(image => image.dataUrl));
  const merged = [...current];
  for (const image of added) {
    if (seen.has(image.dataUrl)) continue;
    seen.add(image.dataUrl);
    merged.push(image);
  }
  return merged;
}

export function isImageFile(file: File): boolean {
  if (file.type && /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i.test(file.type)) return true;
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) return true;
  return false;
}

export function extractImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const files: File[] = [];
  const seen = new Set<string>();

  const add = (file: File | null) => {
    if (!file || !isImageFile(file)) return;
    const key = `${file.name}_${file.size}_${file.lastModified}`;
    if (!seen.has(key)) {
      seen.add(key);
      files.push(file);
    }
  };

  if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        add(item.getAsFile());
      }
    }
  }

  // items and files expose the same clipboard payload. getAsFile() may
  // produce a new lastModified value, so metadata cannot reliably dedupe
  // across the two views. Use files only when items supplied no images.
  if (!files.length && dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      add(dataTransfer.files[i]);
    }
  }

  return files;
}

export async function pastedImage(file: File): Promise<ImageAttachment> {
  if (!isImageFile(file)) throw new Error('Chỉ hỗ trợ dán ảnh (PNG, JPEG, WebP, GIF).');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ảnh gốc quá lớn (tối đa 20 MB).');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        URL.revokeObjectURL(url);
        try {
          resolve(await createImageBitmap(img));
        } catch {
          reject(new Error('Không đọc được định dạng ảnh này.'));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không đọc được file ảnh.'));
      };
      img.src = url;
    });
  }

  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không tạo được ngữ cảnh vẽ ảnh.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > 5500000) dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    if (dataUrl.length > 5500000) throw new Error('Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.');
    return { name: (file.name || 'Ảnh đã dán').slice(0, 200), dataUrl };
  } finally {
    bitmap.close();
  }
}
