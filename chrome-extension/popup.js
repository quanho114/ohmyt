const status = document.getElementById('status');
const show = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
document.getElementById('connect').addEventListener('click', async () => {
  try {
    const value = new URL(document.getElementById('connection').value.trim());
    if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1' || !value.port || value.username || value.password || !/^#[a-f0-9]{64}$/.test(value.hash)) throw new Error('Dán đúng mã kết nối được tạo trong ohmyt.');
    const base = value.origin;
    const response = await fetch(base + '/connect', {method:'POST',headers:{Authorization:`Bearer ${value.hash.slice(1)}`},signal:AbortSignal.timeout(10000)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await chrome.storage.local.set({connection:{base,token:result.token},connectionError:''});
    document.getElementById('connection').value = '';
    await chrome.runtime.sendMessage({action:'wake'});
    show('Đã kết nối. Quay lại ohmyt để chọn tab.');
  } catch (error) { show(error.message, true); }
});
document.getElementById('disconnect').addEventListener('click', async () => {
  const {connection} = await chrome.storage.local.get('connection');
  await chrome.storage.local.remove('connection');
  if (connection) await fetch(connection.base + '/disconnect', {method:'POST',headers:{Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(3000)}).catch(() => {});
  show('Đã ngắt kết nối.');
});
const [active] = await chrome.tabs.query({active:true,currentWindow:true});
const url = active?.url && /^https?:\/\//.test(active.url) ? new URL(active.url) : null;
document.getElementById('allow').disabled = !url;
document.getElementById('allow').addEventListener('click', async () => {
  try {
    if (!url) throw new Error('Mở một website trước khi cho phép.');
    // This request is made directly inside the user gesture.
    const granted = await chrome.permissions.request({origins:[`${url.protocol}//${url.hostname}/*`]});
    show(granted ? 'Đã cho phép trang này. Chọn tab trong ohmyt để chia sẻ với chat.' : 'Bạn chưa cho phép truy cập trang.', !granted);
  } catch (error) { show(error.message, true); }
});
const saved = await chrome.storage.local.get(['connection','connectionError']);
show(saved.connectionError || (saved.connection ? 'Đã ghép nối với ohmyt.' : 'Chưa kết nối.'), Boolean(saved.connectionError));
