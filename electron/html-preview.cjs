function htmlPreviewUrl(content) {
  if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error('File preview cần là HTML và nhỏ hơn 2 MB.');
  return 'data:text/html;charset=utf-8;base64,' + Buffer.from(content, 'utf8').toString('base64');
}
module.exports = {htmlPreviewUrl};
