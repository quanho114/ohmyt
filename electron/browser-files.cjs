const fs = require('node:fs/promises');
const path = require('node:path');
const MAX_BYTES = 25 * 1024 * 1024;
class BrowserFiles {
  constructor(browser) { this.browser = browser; this.requests = new Map(); this.captures = new Map(); this.sessions = new WeakSet(); }
  watch(wc) {
    if (this.sessions.has(wc.session)) return;
    this.sessions.add(wc.session);
    wc.session.on('will-download', (_event, item, contents) => {
      const pending = this.requests.get(contents?.id);
      if (!pending) {
        // Agent clicks cannot silently download files outside an approved file action.
        if (this.browser.computer.externalOwners.has(contents?.id)) item.cancel();
        return;
      }
      if (pending.item || pending.url && item.getURLChain()[0] !== pending.url) { item.cancel(); return; }
      pending.item = item;
      const verify = () => {
        this.browser.cdp.check(contents.id, pending.owner);
        if (item.getTotalBytes() > MAX_BYTES || item.getReceivedBytes() > MAX_BYTES || item.getURLChain().some(url => !pending.allowed(url))) throw new Error('Download vượt giới hạn hoặc chuyển sang tên miền không được phép.');
      };
      try { verify(); item.setSavePath(pending.path); }
      catch (error) { pending.fail(error); return; }
      item.on('updated', () => { try { verify(); } catch (error) { pending.fail(error); } });
      item.once('done', (_event, state) => {
        try {
          verify();
          if (state !== 'completed') throw new Error('Download chưa hoàn tất.');
          pending.finish(null, { name: item.getFilename(), mime: item.getMimeType() || 'application/octet-stream', bytes: item.getReceivedBytes() });
        } catch (error) { pending.fail(error); }
      });
    });
  }
  captureStart(args) {
    if (this.captures.has(args.tabId)) throw new Error('Tab đã có download capture.');
    const promise = this.download({ ...args, capture: true });
    promise.catch(() => {}); // Outcome is delivered by capture_result, including failures.
    this.captures.set(args.tabId, { owner: args.owner, promise });
    return { ready: true };
  }
  async captureResult({tabId,owner}) {
    const capture=this.captures.get(tabId);
    if(!capture || capture.owner!==owner) throw new Error('Không có download capture cho tác vụ này.');
    try { return await capture.promise; }
    finally { if(this.captures.get(tabId)===capture)this.captures.delete(tabId); }
  }
  async cancel({tabId,owner}) {
    if(this.captures.get(tabId)?.owner===owner)this.captures.delete(tabId);
    const pending = this.requests.get(tabId);
    if (!pending || pending.owner !== owner) return { cancelled: false };
    if (pending.item && pending.item.getState() === 'progressing') {
      await new Promise(resolve => { const timer = setTimeout(resolve, 1000);pending.item.once('done', () => { clearTimeout(timer);resolve(); });pending.item.cancel(); });
    }
    pending.fail(new Error('Download đã dừng.'));
    return { cancelled: true };
  }
  output(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !/^[0-9a-f-]{36}\.part$/.test(path.basename(filePath))) throw new Error('Invalid browser artifact path.');
  }
  async pdf({ tabId, owner, filePath, expectedUrl }) {
    this.output(filePath); this.browser.cdp.check(tabId, owner);
    const wc = this.browser.cdp.target(tabId);
    if(wc.getURL()!==expectedUrl) throw new Error('Trang đã đổi trước khi xuất PDF.');
    const bytes = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true });
    this.browser.cdp.check(tabId, owner);
    if(wc.getURL()!==expectedUrl) throw new Error('Trang đã đổi trong lúc xuất PDF.');
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('PDF vượt giới hạn 25 MB.');
    await fs.writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });
    return { bytes: bytes.length };
  }
  download({ tabId, owner, filePath, url, domains, capture = false }) {
    this.output(filePath); this.browser.cdp.check(tabId, owner);
    if (this.requests.has(tabId)) throw new Error('Tab đang tải một file khác.');
    const allowed = value => { try { const parsed = new URL(capture && value.startsWith('blob:') ? value.slice(5) : value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && domains.includes(parsed.hostname); } catch { return false; } };
    if (!capture && !allowed(url)) throw new Error('Tên miền download không được phép.');
    const wc = this.browser.cdp.target(tabId);
    return new Promise((resolve, reject) => {
      const pending = { url, owner, path: filePath, allowed, item: null, settled: false };
      const finish = (error, result) => {
        if (pending.settled) return;
        pending.settled = true; clearTimeout(timer); clearInterval(poll);
        const complete = () => { this.requests.delete(tabId);if(error)reject(error);else resolve(result); };
        if (error && pending.item?.getState() === 'progressing') {
          // DownloadItem callbacks are not reentrant: cancel on the next event turn,
          // then wait for its done event before allowing staging cleanup.
          setImmediate(async () => {
            if (pending.item.getState() === 'progressing') await new Promise(done => {
              const timeout=setTimeout(done,1000);
              pending.item.once('done',()=>{clearTimeout(timeout);done();});
              pending.item.cancel();
            });
            complete();
          });
        } else complete();
      };
      const timer = setTimeout(() => finish(new Error('Download quá thời gian 30 giây.')), 30000);
      const poll = setInterval(() => { try { this.browser.cdp.check(tabId, owner); } catch (error) { finish(error); } }, 100);
      pending.finish = finish; pending.fail = error => finish(error);
      this.requests.set(tabId, pending);
      try { if(!capture)wc.downloadURL(url); } catch (error) { finish(error); }
    });
  }
}
module.exports = { BrowserFiles };
