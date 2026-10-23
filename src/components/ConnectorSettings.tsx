import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileJson,
  FolderGit2,
  Globe,
  KeyRound,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  Wrench
} from 'lucide-react';
import { api, type ConnectorItem } from '../api.ts';
import { parseMcpConfig } from '../../shared/mcp_config.ts';
import type { SettingsLocale } from '../appearance.ts';

const emptyForm = () => ({
  id: `connection_${crypto.randomUUID().replaceAll('-', '')}`,
  name: '',
  transport: 'http' as 'http' | 'stdio',
  url: '',
  command: '',
  args: '',
  scopeId: 'standalone',
  token: ''
});

export function ConnectorSettings({ locale }: { locale: SettingsLocale }) {
  const en = locale === 'en';
  const [items, setItems] = useState<ConnectorItem[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [expectedRevision, setExpectedRevision] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [authentication, setAuthentication] = useState(false);
  const [json, setJson] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [connections, availableProjects] = await Promise.all([
        api.getConnectors(),
        api.getProjects()
      ]);
      setItems(connections.connectors);
      setProjects(availableProjects);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setEditing(false);
    setError('');
    requestAnimationFrame(() => addButton.current?.focus());
  };

  const open = (item?: ConnectorItem) => {
    setExpectedRevision(item?.revision || 0);
    setForm(
      item
        ? {
            id: item.id,
            name: item.name || item.id,
            transport: item.transport,
            url: item.url || '',
            command: item.command || '',
            args: (item.args || []).join('\n'),
            scopeId: item.scopeId,
            token: ''
          }
        : emptyForm()
    );
    setJson('');
    setAuthentication(Boolean(item?.hasToken));
    setEditing(true);
    setError('');
    setNotice('');
  };

  const submit = () =>
    void action(async () => {
      await api.saveConnector({
        ...form,
        name: form.name.trim(),
        url: form.transport === 'http' ? form.url.trim() : undefined,
        command: form.transport === 'stdio' ? form.command.trim() : undefined,
        args:
          form.transport === 'stdio'
            ? form.args
                .split('\n')
                .map(arg => arg.trim())
                .filter(arg => arg.length > 0)
            : [],
        token:
          form.transport === 'http' && authentication
            ? form.token || undefined
            : undefined,
        expectedRevision
      });
      close();
    });

  const scopeName = (scope: string) =>
    scope === 'standalone'
      ? en
        ? 'Chats outside projects'
        : 'Chat ngoài dự án'
      : projects.find(p => `project:${p.id}` === scope)?.name ||
        (en ? 'Unavailable project' : 'Dự án không còn khả dụng');

  const labels = en
    ? {
        add: 'Add connection',
        name: 'Name',
        url: 'Server address',
        command: 'Program',
        args: 'Arguments',
        scope: 'Use in',
        token: 'Access token',
        save: 'Save connection',
        cancel: 'Cancel',
        test: 'Test',
        connect: 'Connect',
        disconnect: 'Disconnect'
      }
    : {
        add: 'Thêm kết nối',
        name: 'Tên kết nối',
        url: 'Địa chỉ dịch vụ',
        command: 'Chương trình',
        args: 'Tham số',
        scope: 'Sử dụng trong',
        token: 'Mã truy cập',
        save: 'Lưu kết nối',
        cancel: 'Hủy',
        test: 'Kiểm tra',
        connect: 'Kết nối',
        disconnect: 'Ngắt kết nối'
      };

  const filteredItems = items.filter(
    i =>
      (filter === 'all' || i.transport === filter) &&
      `${i.name} ${i.id} ${i.url || ''} ${i.command || ''}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );

  return (
    <div
      className="harness-settings connector-settings"
      onKeyDown={e => {
        if (e.key === 'Escape' && editing && !busy) {
          e.stopPropagation();
          close();
        }
      }}
    >
      {error && (
        <div className="connector-feedback connector-error" role="alert">
          <div className="connector-feedback-main">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
          {!editing && (
            <button
              type="button"
              className="connector-text-button"
              disabled={busy || loading}
              onClick={() => {
                setError('');
                void load();
              }}
            >
              {en ? 'Try again' : 'Thử lại'}
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="connector-feedback connector-notice" role="status">
          <div className="connector-feedback-main">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{notice}</span>
          </div>
        </div>
      )}

      {editing ? (
        <form
          className="connector-form"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            className="connector-back"
            disabled={busy}
            onClick={close}
          >
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{en ? 'Back to connections' : 'Quay lại danh sách'}</span>
          </button>

          <div className="connector-form-card">
            <div className="connector-form-header">
              <h2>
                {expectedRevision
                  ? en
                    ? 'Edit connection'
                    : 'Sửa kết nối'
                  : labels.add}
              </h2>
              <p>
                {en
                  ? 'Configure a remote HTTP MCP server or a local stdio command. New connections stay disconnected until you enable them.'
                  : 'Cấu hình dịch vụ MCP từ xa qua HTTP hoặc công cụ chạy trực tiếp trên máy (stdio). Kết nối mới sẽ ở trạng thái chờ cho đến khi bạn bật.'}
              </p>
            </div>

            <fieldset disabled={busy}>
              {!expectedRevision && (
                <details className="connector-import">
                  <summary>
                    <span className="connector-summary-title">
                      <FileJson size={15} aria-hidden="true" />
                      <span>
                        {en
                          ? 'Import JSON configuration'
                          : 'Nhập từ cấu hình JSON'}
                      </span>
                    </span>
                  </summary>
                  <div className="connector-import-body">
                    <p>
                      {en
                        ? 'Paste one mcpServers entry or a server object. Review the populated fields before saving.'
                        : 'Dán một mục mcpServers hoặc đối tượng cấu hình server. Kiểm tra lại các trường sau khi điền.'}
                    </p>
                    <label className="connector-field">
                      <span id="connector-json-label">JSON</span>
                      <textarea
                        aria-labelledby="connector-json-label"
                        rows={5}
                        value={json}
                        spellCheck={false}
                        placeholder={
                          '{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem"]\n    }\n  }\n}'
                        }
                        onChange={e => setJson(e.target.value)}
                      />
                    </label>
                    <div className="connector-import-actions">
                      <button
                        type="button"
                        className="connector-button"
                        onClick={() => {
                          try {
                            const config = parseMcpConfig(json);
                            setForm({
                              ...form,
                              ...config,
                              name: config.name || form.name
                            });
                            setAuthentication(Boolean(config.token));
                            setJson('');
                            setError('');
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : String(e)
                            );
                          }
                        }}
                      >
                        {en ? 'Apply to form' : 'Điền vào biểu mẫu'}
                      </button>
                    </div>
                  </div>
                </details>
              )}

              <label className="connector-field">
                <span id="connector-name-label">{labels.name}</span>
                <input
                  aria-labelledby="connector-name-label"
                  autoFocus
                  required
                  maxLength={100}
                  value={form.name}
                  placeholder={
                    en ? 'e.g. Workspace Tools' : 'Ví dụ: Công cụ công việc'
                  }
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </label>

              <div className="connector-field">
                <span className="connector-field-label">
                  {en ? 'Connection type' : 'Phương thức kết nối'}
                </span>
                <div
                  className="connector-source connector-transport-grid"
                  role="group"
                  aria-label={en ? 'Connection source' : 'Nguồn kết nối'}
                >
                  <button
                    type="button"
                    className="connector-transport-option"
                    aria-pressed={form.transport === 'http'}
                    aria-label={en ? 'Remote service' : 'Dịch vụ từ xa'}
                    onClick={() => setForm({ ...form, transport: 'http' })}
                  >
                    <span className="connector-transport-icon" aria-hidden="true">
                      <Globe size={17} />
                    </span>
                    <span className="connector-transport-copy" aria-hidden="true">
                      <strong>
                        {en ? 'Remote service' : 'Dịch vụ từ xa'}
                      </strong>
                      <small>
                        {en
                          ? 'Connect via Streamable HTTP endpoint URL'
                          : 'Kết nối qua địa chỉ URL của dịch vụ'}
                      </small>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="connector-transport-option"
                    aria-pressed={form.transport === 'stdio'}
                    aria-label={en ? 'On this computer' : 'Trên máy này'}
                    onClick={() => setForm({ ...form, transport: 'stdio' })}
                  >
                    <span className="connector-transport-icon" aria-hidden="true">
                      <Server size={17} />
                    </span>
                    <span className="connector-transport-copy" aria-hidden="true">
                      <strong>
                        {en ? 'On this computer' : 'Trên máy này'}
                      </strong>
                      <small>
                        {en
                          ? 'Run a local command (npx, node, uvx, python…)'
                          : 'Chạy chương trình cục bộ (npx, node, uvx…)'}
                      </small>
                    </span>
                  </button>
                </div>
              </div>

              {form.transport === 'http' ? (
                <>
                  <label className="connector-field">
                    <span id="connector-url-label">{labels.url}</span>
                    <input
                      aria-labelledby="connector-url-label"
                      type="url"
                      required
                      value={form.url}
                      placeholder="https://example.com/mcp"
                      spellCheck={false}
                      aria-describedby="connector-address-help"
                      onChange={e => setForm({ ...form, url: e.target.value })}
                    />
                    <small id="connector-address-help">
                      {en
                        ? 'Paste the MCP endpoint URL provided by your service.'
                        : 'Dán địa chỉ URL MCP do dịch vụ bạn muốn dùng cung cấp.'}
                    </small>
                  </label>

                  <details
                    className="connector-auth"
                    open={authentication}
                    onToggle={e => setAuthentication(e.currentTarget.open)}
                  >
                    <summary>
                      <span className="connector-summary-title">
                        <KeyRound size={14} aria-hidden="true" />
                        <span>
                          {en
                            ? 'Authentication (optional)'
                            : 'Xác thực (không bắt buộc)'}
                        </span>
                      </span>
                    </summary>
                    <div className="connector-auth-body">
                      <label className="connector-field">
                        <span id="connector-token-label">{labels.token}</span>
                        <input
                          aria-labelledby="connector-token-label"
                          type="password"
                          autoComplete="off"
                          value={form.token}
                          onChange={e =>
                            setForm({ ...form, token: e.target.value })
                          }
                          placeholder={
                            expectedRevision
                              ? en
                                ? 'Leave blank to keep the saved token'
                                : 'Để trống để giữ mã đã lưu'
                              : en
                                ? 'Bearer token provided by your service'
                                : 'Mã Bearer do dịch vụ cung cấp'
                          }
                        />
                      </label>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <label className="connector-field">
                    <span id="connector-command-label">{labels.command}</span>
                    <input
                      aria-labelledby="connector-command-label"
                      className="connector-mono-input"
                      required
                      value={form.command}
                      spellCheck={false}
                      placeholder="npx"
                      aria-describedby="connector-program-help"
                      onChange={e =>
                        setForm({ ...form, command: e.target.value })
                      }
                    />
                    <small id="connector-program-help">
                      {en
                        ? 'Use the executable specified in the service setup instructions. It will run on this computer.'
                        : 'Nhập chương trình theo hướng dẫn của dịch vụ. Chương trình sẽ chạy trên máy này.'}
                    </small>
                  </label>

                  <label className="connector-field">
                    <span id="connector-args-label">{labels.args}</span>
                    <textarea
                      aria-labelledby="connector-args-label"
                      className="connector-mono-input"
                      rows={3}
                      value={form.args}
                      spellCheck={false}
                      placeholder={'-y\n@modelcontextprotocol/server-everything'}
                      aria-describedby="connector-args-help"
                      onChange={e => setForm({ ...form, args: e.target.value })}
                    />
                    <small id="connector-args-help">
                      {en
                        ? 'One argument per line, following the service instructions.'
                        : 'Mỗi dòng một tham số, theo hướng dẫn của dịch vụ.'}
                    </small>
                  </label>
                </>
              )}

              <label className="connector-field connector-scope">
                <span id="connector-scope-label">{labels.scope}</span>
                <select
                  aria-labelledby="connector-scope-label"
                  value={form.scopeId}
                  onChange={e => setForm({ ...form, scopeId: e.target.value })}
                >
                  <option value="standalone">
                    {en ? 'Chats outside projects' : 'Chat ngoài dự án'}
                  </option>
                  {projects.map(p => (
                    <option key={p.id} value={`project:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                  {form.scopeId !== 'standalone' &&
                    !projects.some(p => `project:${p.id}` === form.scopeId) && (
                      <option value={form.scopeId} disabled>
                        {en ? 'Unavailable project' : 'Dự án không còn khả dụng'}
                      </option>
                    )}
                </select>
                <small>
                  {en
                    ? 'Scope isolates which workspace or standalone chat can call this server.'
                    : 'Giới hạn phạm vi dự án hoặc cuộc trò chuyện được phép gọi kết nối này.'}
                </small>
              </label>
            </fieldset>

            <div className="connector-form-actions">
              <button
                className="connector-button connector-primary"
                disabled={busy}
                type="submit"
              >
                {busy ? (en ? 'Saving…' : 'Đang lưu…') : labels.save}
              </button>
              <button
                className="connector-button connector-secondary"
                type="button"
                disabled={busy}
                onClick={close}
              >
                {labels.cancel}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <div className="connector-heading">
            <div className="connector-heading-copy">
              <h2>{en ? 'MCP Connections' : 'Kết nối MCP'}</h2>
              <p>
                {en
                  ? 'Connect local tools (stdio) and remote MCP servers (HTTP) to extend ohmyt with external capabilities.'
                  : 'Kết nối công cụ trên máy (stdio) và dịch vụ MCP từ xa (HTTP) để mở rộng khả năng cho ohmyt.'}
              </p>
            </div>

            <div className="connector-heading-actions">
              <button
                type="button"
                className="connector-button connector-icon-button"
                disabled={busy || loading}
                onClick={() => void load()}
                aria-label={en ? 'Refresh' : 'Làm mới'}
                title={en ? 'Refresh' : 'Làm mới'}
              >
                <RefreshCw
                  size={15}
                  className={loading ? 'connector-spin' : undefined}
                  aria-hidden="true"
                />
                <span>{en ? 'Refresh' : 'Làm mới'}</span>
              </button>
              <button
                ref={addButton}
                type="button"
                className="connector-button connector-primary"
                disabled={busy || loading}
                onClick={() => open()}
              >
                <Plus size={15} strokeWidth={2} aria-hidden="true" />
                <span>{labels.add}</span>
              </button>
            </div>
          </div>

          <div className="connector-toolbar">
            <div
              className="connector-source"
              role="group"
              aria-label={en ? 'Transport filter' : 'Lọc kiểu kết nối'}
            >
              {(
                [
                  ['all', en ? 'All' : 'Tất cả'],
                  ['stdio', en ? 'Local · stdio' : 'Trên máy · stdio'],
                  ['http', en ? 'Remote · HTTP' : 'Từ xa · HTTP']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <label className="connector-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                aria-label={en ? 'Search MCP servers' : 'Tìm máy chủ MCP'}
                placeholder={
                  en ? 'Search connections…' : 'Tìm kiếm kết nối…'
                }
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
          </div>

          {items.length > 0 && filteredItems.length === 0 && (
            <div className="connector-empty connector-empty-card">
              <div className="connector-empty-icon" aria-hidden="true">
                <Search size={20} />
              </div>
              <p className="connector-empty-title">
                {en ? 'No matching servers' : 'Không có máy chủ phù hợp'}
              </p>
              <small>
                {en
                  ? 'Try clearing your search query or switching the transport filter.'
                  : 'Thử xóa từ khóa tìm kiếm hoặc chuyển bộ lọc kiểu kết nối.'}
              </small>
            </div>
          )}

          {loading && !items.length ? (
            <div className="connector-empty connector-empty-card" role="status">
              <RefreshCw
                size={20}
                className="connector-spin"
                aria-hidden="true"
              />
              <p className="connector-empty-title">
                {en ? 'Loading…' : 'Đang tải…'}
              </p>
            </div>
          ) : !items.length && !error ? (
            <div className="connector-empty connector-empty-card">
              <div className="connector-empty-icon" aria-hidden="true">
                <Plug size={22} strokeWidth={1.75} />
              </div>
              <p className="connector-empty-title">
                {en ? 'No connections yet' : 'Chưa có kết nối'}
              </p>
              <small>
                {en
                  ? 'Add a remote HTTP endpoint or a local stdio command (npx, uvx, node), or import directly from an mcpServers JSON snippet.'
                  : 'Thêm kết nối bằng địa chỉ dịch vụ từ xa (HTTP), chạy lệnh cục bộ (npx, uvx, node) hoặc dán trực tiếp cấu hình JSON mcpServers.'}
              </small>
            </div>
          ) : (
            <div className="connector-list">
              {filteredItems.map(item => {
                const endpoint =
                  item.transport === 'stdio'
                    ? [item.command, ...(item.args || [])]
                        .filter(Boolean)
                        .join(' ')
                    : item.url;
                return (
                  <div
                    className="connector-row"
                    data-state={item.state}
                    key={item.id}
                  >
                    <div className="connector-row-main">
                      <div
                        className="connector-row-avatar"
                        data-transport={item.transport}
                        aria-hidden="true"
                      >
                        {item.transport === 'stdio' ? (
                          <Server size={18} />
                        ) : (
                          <Globe size={18} />
                        )}
                      </div>

                      <div className="connector-row-info">
                        <div className="connector-row-title-line">
                          <strong>{item.name || item.id}</strong>
                          <span
                            className="connector-status-badge"
                            data-state={item.state}
                          >
                            <i className="connector-status-dot" aria-hidden="true" />
                            <span>
                              {item.state === 'error'
                                ? en
                                  ? 'Connection lost'
                                  : 'Mất kết nối'
                                : item.state === 'connected'
                                  ? en
                                    ? 'Connected'
                                    : 'Đã kết nối'
                                  : en
                                    ? 'Not connected'
                                    : 'Chưa kết nối'}
                            </span>
                          </span>
                        </div>

                        {endpoint && (
                          <small className="connector-endpoint">{endpoint}</small>
                        )}

                        <div className="connector-row-meta">
                          <small className="connector-meta-chip">
                            {item.transport === 'stdio'
                              ? 'Local · stdio'
                              : 'Remote · HTTP'}
                          </small>
                          <small className="connector-meta-chip">
                            <FolderGit2 size={12} aria-hidden="true" />
                            {scopeName(item.scopeId)}
                          </small>
                          {item.hasToken && (
                            <small className="connector-meta-chip">
                              <KeyRound size={12} aria-hidden="true" />
                              {en ? 'Token saved' : 'Đã lưu mã'}
                            </small>
                          )}
                        </div>

                        {item.tools && item.tools.length > 0 && (
                          <details className="connector-tools">
                            <summary>
                              <Wrench size={12} aria-hidden="true" />
                              <span>
                                {item.tools.length} {en ? 'tools' : 'công cụ'}
                              </span>
                            </summary>
                            <div className="connector-tools-list">
                              {item.tools.map(tool => (
                                <div
                                  className="connector-tool-item"
                                  key={tool.name}
                                >
                                  <code>{tool.name}</code>
                                  {tool.description && <p>{tool.description}</p>}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>

                    <div className="connector-row-actions">
                      {item.state === 'disconnected' && (
                        <button
                          type="button"
                          className="connector-button connector-ghost"
                          disabled={busy}
                          onClick={() => open(item)}
                        >
                          {en ? 'Edit' : 'Sửa'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="connector-button connector-ghost"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            const result = await api.connectorAction(
                              item.id,
                              'test'
                            );
                            if (!result.connected)
                              throw new Error(
                                result.error ||
                                  (en
                                    ? 'Connection failed. Check the address and access token.'
                                    : 'Không kết nối được. Kiểm tra địa chỉ và mã truy cập.')
                              );
                            setNotice(
                              en
                                ? `Connection test passed. · ${result.toolCount ?? 0} tools.`
                                : `Kiểm tra kết nối thành công. · ${result.toolCount ?? 0} công cụ.`
                            );
                          })
                        }
                      >
                        {labels.test}
                      </button>
                      <button
                        type="button"
                        className={`connector-button ${
                          item.state === 'connected' || item.state === 'error'
                            ? 'connector-disconnect'
                            : 'connector-connect'
                        }`}
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            api.connectorAction(
                              item.id,
                              item.state === 'connected' ||
                                item.state === 'error'
                                ? 'disconnect'
                                : 'connect'
                            )
                          )
                        }
                      >
                        {item.state === 'connected' || item.state === 'error'
                          ? labels.disconnect
                          : labels.connect}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
