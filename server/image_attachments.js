export function validateImages(images = []) {
  if (!Array.isArray(images) || images.length > 4) throw new Error('Mỗi tin nhắn tối đa 4 ảnh.');
  let total = 0;
  return images.map(image => {
    if (!image || typeof image.dataUrl !== 'string' || typeof image.name !== 'string' || image.name.length > 200) throw new Error('Ảnh không hợp lệ.');
    const match = image.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length > 5600000) throw new Error('Chỉ hỗ trợ PNG, JPEG hoặc WebP dưới 4 MB.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.toString('base64') !== match[2] || bytes.length > 4 * 1024 * 1024) throw new Error('Dữ liệu ảnh không hợp lệ hoặc quá lớn.');
    const valid = match[1] === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : match[1] === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!valid) throw new Error('Nội dung file không khớp định dạng ảnh.');
    total += bytes.length;
    if (total > 12 * 1024 * 1024) throw new Error('Tổng ảnh trong tin nhắn tối đa 12 MB.');
    return {name:image.name, dataUrl:image.dataUrl};
  });
}
export function messageContent(message) {
  let images = [];
  try { images = validateImages(JSON.parse(message.metadata || '{}').images || []); } catch {}
  if (!images.length) return message.content;
  return [...images.map(image => ({type:'image_url',image_url:{url:image.dataUrl}})), {type:'text',text:message.content || 'Hãy xem ảnh này.'}];
}
