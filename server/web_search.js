export class WebSearchService {
  constructor(db, vault, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
    this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
    // Retire saved provider settings and remove their stored credentials.
    const table = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='web_search_config'").get();
    if (table) {
      const row = db.db.prepare('SELECT config_json FROM web_search_config WHERE id=1').get();
      if (row) {
        const previous = JSON.parse(row.config_json);
        for (const [key, value] of Object.entries(previous)) {
          if (key.endsWith('KeyRef') && typeof value === 'string') vault.remove(value);
        }
      }
      db.db.exec('DROP TABLE web_search_config');
    }
  }
  config() { return { provider: 'duckduckgo' }; }
  publicConfig() { return this.config(); }
  save(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)
      || Object.keys(patch).some(key => key !== 'provider')
      || (patch.provider !== undefined && patch.provider !== 'duckduckgo')) {
      throw new Error('Cấu hình tìm kiếm không hợp lệ.');
    }
    return this.publicConfig();
  }
  async search(query, { provider, signal } = {}) {
    if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new Error('Từ khóa tìm kiếm phải có từ 1 đến 2.000 ký tự.');
    query = query.trim();
    provider ||= 'duckduckgo';
    if (provider !== 'duckduckgo') throw new Error('Nguồn tìm kiếm không hợp lệ.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, this.timeoutMs);
    const started = Date.now();
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await this.fetch(url, { signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error('Nguồn tìm kiếm từ chối truy cập. Thử lại sau.');
        if ([429, 432, 433].includes(response.status)) throw new Error('Đã vượt hạn mức hoặc giới hạn tốc độ tìm kiếm. Thử lại sau.');
        throw new Error(`Nguồn tìm kiếm gặp lỗi HTTP ${response.status}.`);
      }
      const reader = response.body.getReader();
      let bytes = 0, chunks = [];
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.length;
        if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Phản hồi tìm kiếm quá lớn.'); }
        chunks.push(Buffer.from(value));
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Nguồn tìm kiếm không trả JSON hợp lệ.'); }
      const raw = data.AbstractText ? [{ title: data.Heading, content: data.AbstractText, url: data.AbstractURL }] : [];
      const topics = (items) => { for (const topic of items || []) { if (topic.Text) raw.push({ title: topic.Text, content: topic.Text, url: topic.FirstURL }); if (Array.isArray(topic.Topics)) topics(topic.Topics); } };
      topics(data.RelatedTopics);
      const seen = new Set();
      const results = raw.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        let link; try { link = new URL(item.url); } catch { return []; }
        if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password || seen.has(link.href)) return [];
        seen.add(link.href);
        return [{ title: String(item.title || link.hostname).slice(0, 300), snippet: String(item.content || item.snippet || '').slice(0, 3000), url: link.href }];
      }).slice(0, 5);
      return { query, provider, resultsCount: results.length, results, latencyMs: Date.now() - started, ...(results.length ? {} : { message: 'Không có kết quả cho truy vấn này. Có thể thử từ khóa khác.' }), limited: true };
    } catch (error) {
      if (controller.signal.aborted) throw new Error(signal?.aborted ? 'Đã hủy tìm kiếm.' : 'Tìm kiếm quá thời gian chờ. Kiểm tra kết nối rồi thử lại.');
      if (error instanceof TypeError) throw new Error('Chưa kết nối được với nguồn tìm kiếm. Kiểm tra mạng và địa chỉ máy chủ.');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}
