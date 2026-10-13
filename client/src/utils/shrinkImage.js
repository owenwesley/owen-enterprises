/**
 * Shrink a camera picture in the browser before it is uploaded (patient photos).
 *
 * A phone camera file is often 5-15 MB and 12-50 megapixels. Uploading it whole makes the phone
 * (and a small server) decode a huge image, which can fail with "low memory". Here the browser
 * decodes it directly at a smaller size (createImageBitmap with resizeWidth/resizeHeight lets the
 * decoder skip pixels instead of holding the whole picture), then saves a JPEG of about 200-500 KB.
 * The server still re-encodes and strips metadata; this only makes the upload light.
 *
 * Never throws: when anything goes wrong the ORIGINAL file is returned, so a phone or browser that
 * cannot shrink pictures still works exactly as before.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.85;

function blobFromCanvas(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY));
}

export default async function shrinkImage(file) {
  try {
    if (!file || !/^image\//i.test(file.type || '') || typeof createImageBitmap !== 'function') return file;
    // Only the sizes of the picture are needed first, so ask for a bitmap that is already small.
    // Passing just ONE of resizeWidth/resizeHeight keeps the shape; the long side is capped below.
    const probe = await createImageBitmap(file, { resizeWidth: 64, imageOrientation: 'from-image' });
    const portrait = probe.height > probe.width;
    if (probe.close) probe.close();
    const opts = portrait
      ? { resizeHeight: MAX_SIDE, resizeQuality: 'medium', imageOrientation: 'from-image' }
      : { resizeWidth: MAX_SIDE, resizeQuality: 'medium', imageOrientation: 'from-image' };
    const bitmap = await createImageBitmap(file, opts);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { if (bitmap.close) bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    const blob = await blobFromCanvas(canvas);
    canvas.width = 0; canvas.height = 0;            // release the pixel memory right away
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
