import {syncDocumentContext} from "../documents/contextSync.ts";
import {api} from "../api.ts";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  X,
  Plus,
  FolderPlus,
  MoreHorizontal,
} from "lucide-react";
import "./DocumentWorkspace.css";
import { DocumentIcon } from "../documents/DocumentIcon.tsx";
import { copyToClipboard } from "../clipboard.ts";
import {
  parseDocumentProposal,
  type DocumentProposal,
} from "../documents/proposals.ts";
import type { ToolCallItem } from "../types.ts";
import { extractDocumentContext } from "../documents/context.ts";
import { validateOfficeArchive } from "../documents/format.ts";
const Viewer = lazy(() => import("../documents/FlyfishViewer.tsx"));
type Entry = { name: string; path: string; directory: boolean };
export function DocumentWorkspace({
  open,
  scope,
  onClose,
  onRequestOpen,
  activeTools = [],
  isStreaming = false,
}: {
  open: boolean;
  scope: string;
  onClose: () => void;
  onRequestOpen?: () => void;
  activeTools?: ToolCallItem[];
  isStreaming?: boolean;
}) {
  const [root, setRoot] = useState<{
      id: string;
      name: string;
      path: string;
      singleFile?: boolean;
    } | null>(null),
    [tree, setTree] = useState<Record<string, Entry[]>>({}),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [selected, setSelected] = useState<Entry | null>(null),
    [file, setFile] = useState<{
      data: Uint8Array;
      version: string;
      bytes: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [edit, setEdit] = useState(false),
    [draft, setDraft] = useState(""),
    [width, setWidth] = useState(() =>
      Math.min(
        700,
        Math.max(
          340,
          Number(localStorage.getItem("ohmyt_document_width")) || 440,
        ),
      ),
    ),
    [wide, setWide] = useState(false);
  const [menu, setMenu] = useState<Entry | null>(null);
  const [proposal, setProposal] = useState<DocumentProposal | null>(null);
  const [copyName, setCopyName] = useState("");
  const seenProposals = useRef(new Set<string>());
  const [mutationRequest, setMutationRequest] = useState<{
    action: "createFile" | "createFolder" | "rename";
    entry?: Entry;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [contextPages, setContextPages] = useState("");
  const [searchResults, setSearchResults] = useState<{
    entries: Entry[];
    truncated: boolean;
  } | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  useEffect(() => {
    setSearchResults(null);
    if (!filter || !root || !bridge) return;
    let active = true;
    setSearchBusy(true);
    void bridge
      .search({ id: root.id, scope, query: filter })
      .then((result) => {
        if (active) setSearchResults(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setSearchBusy(false);
      });
    return () => {
      active = false;
    };
  }, [filter, root, scope]);
  const generation = useRef(0),
    panel = useRef<HTMLElement>(null);
  const bridge = window.electronAPI?.documents;
  type Tab = {key:string;root:NonNullable<typeof root>;entry:Entry;file:NonNullable<typeof file>;draft:string;edit:boolean;tree:Record<string,Entry[]>;expanded:Set<string>};
  const [tabs,setTabs]=useState<Tab[]>([]);
  const activeTabKey=root&&selected?`${root.id}:${selected.path}`:'';
  const restoring = useRef(false);
  useEffect(()=>{
    restoring.current=true;
    let cancelled=false;
    setTabs([]);
    void run(()=>syncDocumentContext(scope,async()=>{
      const saved=JSON.parse(sessionStorage.getItem(`ohmyt-tabs:${scope}`)||'[]');
      const restored:Tab[]=[];
      for(const tab of saved){
        const data=await bridge!.read({id:tab.root.id,scope,path:tab.entry.path});
        restored.push({...tab,file:data,expanded:new Set(tab.expanded)});
      }
      if(cancelled)return;
      setTabs(restored);
      if(restored.length)activateTab(restored[restored.length-1]);
    })).finally(()=>{if(!cancelled)restoring.current=false;});
    return()=>{cancelled=true;};
  },[scope]);
  useEffect(()=>{
    if(restoring.current)return;
    sessionStorage.setItem(`ohmyt-tabs:${scope}`,JSON.stringify([...tabs.filter(t=>t.key!==activeTabKey),...tabs.filter(t=>t.key===activeTabKey)].map(({file,...tab})=>({...tab,expanded:[...tab.expanded]}))));
  },[tabs,scope,activeTabKey]);
  useEffect(()=>{
    if(!root||!selected||!file)return;
    const tab:Tab={key:`${root.id}:${selected.path}`,root,entry:selected,file,draft,edit,tree,expanded};
    setTabs(items=>items.some(t=>t.key===tab.key)?items.map(t=>t.key===tab.key?tab:t):[...items,tab]);
  },[root,selected,file,draft,edit,tree,expanded]);
  useEffect(()=>{panel.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[activeTabKey,tabs.length]);
  const activateTab=(tab:Tab)=>{
    generation.current++;setRoot(tab.root);setSelected(tab.entry);setFile(tab.file);setDraft(tab.draft);setEdit(tab.edit);setProposal(null);setError('');setBusy(false);
    setTree(tab.tree);setExpanded(tab.expanded);
  };
  const closeTab=(tab:Tab)=>{
    const text=tab.entry.name.toLowerCase().endsWith('.md')?new TextDecoder().decode(tab.file.data):'';
    if(tab.draft!==text&&!confirm('Đóng tab và bỏ thay đổi chưa lưu?'))return;
    if(scope!=="home")void api.setDocumentContext(scope,{key:tab.key,text:null}).catch(e=>setError(String(e)));
    const remaining=tabs.filter(t=>t.key!==tab.key);setTabs(remaining);
    if(tab.key===activeTabKey){if(remaining.length)activateTab(remaining[remaining.length-1]);else{generation.current++;setSelected(null);setFile(null);setDraft('');setEdit(false);setProposal(null);}}
  };

  const original = useMemo(
    () =>
      file && selected?.name.toLowerCase().endsWith(".md")
        ? new TextDecoder().decode(file.data)
        : "",
    [file, selected?.name],
  );
  const previewData = useMemo(() => selected?.name.toLowerCase().endsWith('.md')
    ? new TextEncoder().encode(draft) : file?.data, [selected?.name, draft, file?.data]);
  const dirty = Boolean(file) && draft !== original;
  useEffect(() => {
    generation.current++;
    setRoot(null);
    setTree({});
    setExpanded(new Set());
    setSelected(null);
    setFile(null);
    setDraft("");
    setEdit(false);
    setError("");
    setBusy(false);
    setProposal(null);
    seenProposals.current.clear();
    setQuery("");
    setFilter("");
    setSearchBusy(false);
    setMenu(null);
    setMutationRequest(null);
  }, [scope]);
  useEffect(() => {
    const t = setTimeout(() => setFilter(query.toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const run = async (fn: () => Promise<void>) => {
    const token = generation.current;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const pick = (mode: "file" | "folder" = "folder") =>
    void run(async () => {
      if (!bridge) throw Error("Mở thư mục có trên ứng dụng desktop Electron.");
      const token = generation.current;
      const grant = await bridge.pick({ scope, mode });
      if (!grant || token !== generation.current) return;
      const entries = grant.entry ? [grant.entry] : await bridge.list({ id: grant.id, scope, path: "" });
      if (token !== generation.current) return;
      setRoot({...grant,singleFile:Boolean(grant.entry)});
      setProposal(null);
      setTree({ "": entries });
      setExpanded(new Set());
      setSelected(null);
      setFile(null);
      setEdit(false);
      setDraft("");
      if(grant.entry){
        setSelected(grant.entry);
        const result=await bridge.read({id:grant.id,scope,path:grant.entry.path});
        if (/\.(docx|xlsx|pptx)$/i.test(grant.entry.name)) validateOfficeArchive(result.data);
        if(token!==generation.current)return;
        setFile(result);setDraft(grant.entry.name.toLowerCase().endsWith('.md')?new TextDecoder().decode(result.data):'');
      }
      setBusy(false);
    });
  useEffect(() => {
    const requestPick = (event: Event) => {
      if ((event as CustomEvent<{scope:string}>).detail?.scope !== scope || busy || isStreaming) return;
      onRequestOpen?.();
      pick('file');
    };
    window.addEventListener('ohmyt-document-pick', requestPick);
    return () => window.removeEventListener('ohmyt-document-pick', requestPick);
  });
  const load = async (entry: Entry) => {
    if (!root || !bridge) return;
    const cached=tabs.find(t=>t.key===`${root.id}:${entry.path}`);
    if(cached){activateTab(cached);return;}
    const token = ++generation.current;
    setSelected(entry);
    setProposal(null);
    setFile(null);
    setEdit(false);
    setBusy(true);
    setError("");
    try {
      const result = await bridge.read({
        id: root.id,
        scope,
        path: entry.path,
      });
      if (/\.(docx|xlsx|pptx)$/i.test(entry.name))
        validateOfficeArchive(result.data);
      if (token === generation.current) {
        setFile(result);
        setDraft(
          entry.name.toLowerCase().endsWith(".md")
            ? new TextDecoder().decode(result.data)
            : "",
        );
      }
    } catch (e) {
      if (token === generation.current) setError(String(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const toggle = (entry: Entry) =>
    void run(async () => {
      if (!root || !bridge) return;
      const token = generation.current;
      if (!tree[entry.path]) {
        const children = await bridge.list({
          id: root.id,
          scope,
          path: entry.path,
        });
        if (token !== generation.current) return;
        setTree((t) => ({ ...t, [entry.path]: children }));
      }
      setExpanded((current) => {
        const next = new Set(current);
        next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path);
        return next;
      });
    });
  const mutate = (
    action: "createFile" | "createFolder" | "rename" | "delete",
    entry?: Entry,
    commitName?: string,
  ) =>
    void run(async () => {
      if (!root || !bridge) return;
      const token = generation.current;
      if (action !== "delete" && !commitName) {
        setMutationRequest({ action, entry });
        setNewName(
          action === "rename"
            ? entry?.name || ""
            : action === "createFile"
              ? "Untitled.md"
              : "",
        );
        return;
      }
      const name = commitName;
      await bridge.mutate({
        id: root.id,
        scope,
        path: entry?.path || "",
        action,
        name: name || undefined,
      });
      if (token !== generation.current) return;
      const next: Record<string, Entry[]> = {};
      for (const path of Object.keys(tree)) {
        try {
          next[path] = await bridge.list({ id: root.id, scope, path });
        } catch {
          next[path] = [];
        }
      }
      if (token === generation.current) setTree(next);
      setMenu(null);
      setMutationRequest(null);
    });
  const renderTree = (path: string, depth = 0): React.ReactNode =>
    (tree[path] || []).map((entry) => {
      const children = expanded.has(entry.path);
      if (
        filter &&
        !entry.directory &&
        !entry.name.toLowerCase().includes(filter)
      )
        return null;
      return (
        <div key={entry.path}>
          <div className="document-file-row">
            <button
              className="document-file"
              aria-label={entry.name}
              role="treeitem"
              aria-expanded={entry.directory ? children : undefined}
              style={{ paddingLeft: 12 + depth * 16 }}
              onKeyDown={(e) => {
                const items = Array.from(
                  panel.current?.querySelectorAll<HTMLButtonElement>(
                    ".document-explorer:not([hidden]) .document-file",
                  ) || [],
                );
                const index = items.indexOf(e.currentTarget);
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  items[index + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
                }
                if (e.key === "ArrowRight" && entry.directory && !children) {
                  e.preventDefault();
                  toggle(entry);
                }
                if (e.key === "ArrowLeft" && entry.directory && children) {
                  e.preventDefault();
                  toggle(entry);
                }
              }}
              onClick={() =>
                entry.directory ? toggle(entry) : void load(entry)
              }
            >
              {entry.directory ? (
                children ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )
              ) : (
                <span style={{ width: 13 }} />
              )}
              <DocumentIcon name={entry.name} directory={entry.directory} expanded={expanded.has(entry.path)} />
              <span>{entry.name}</span>
            </button>
            <button
              className="document-file-more"
              aria-label={`Thao tác ${entry.name}`}
              onClick={() => setMenu(menu?.path === entry.path ? null : entry)}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
          {menu?.path === entry.path && (
            <div className="document-file-menu">
              <button
                onClick={() =>
                  entry.directory ? toggle(entry) : void load(entry)
                }
              >
                Mở
              </button>
              <button onClick={() => mutate("rename", entry)}>Đổi tên</button>
              <button
                onClick={() =>
                  void copyToClipboard(`${root?.path}/${entry.path}`).catch(
                    (e) => setError(String(e)),
                  )
                }
              >
                Sao chép đường dẫn
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    await bridge?.reveal({
                      id: root!.id,
                      scope,
                      path: entry.path,
                    });
                  })
                }
              >
                <ExternalLink size={14}/>
              </button>
              {entry.directory && (
                <>
                  <button onClick={() => mutate("createFile", entry)}>
                    File mới
                  </button>
                  <button onClick={() => mutate("createFolder", entry)}>
                    Thư mục mới
                  </button>
                </>
              )}
              <button onClick={() => mutate("delete", entry)}>Xóa…</button>
              <button onClick={() => setMenu(null)}>Đóng menu</button>
            </div>
          )}
          {entry.directory && children && renderTree(entry.path, depth + 1)}
        </div>
      );
    });
  useEffect(() => {
    if (!root) return;
    for (const tool of activeTools) {
      if (
        tool.name !== "document_propose" ||
        tool.status !== "completed" ||
        seenProposals.current.has(tool.id)
      )
        continue;
      const candidate = parseDocumentProposal(tool.output);
      if (
        !candidate ||
        candidate.reference.scope !== scope ||
        candidate.reference.grantId !== root.id
      )
        continue;
      if (candidate.reference.path !== selected?.path) {
        if (!dirty) {
          void load({
            name:
              candidate.reference.path.split("/").pop() ||
              candidate.reference.path,
            path: candidate.reference.path,
            directory: false,
          });
        }
        continue;
      }
      if (!file) continue;
      seenProposals.current.add(tool.id);
      if (candidate.reference.version !== file.version) {
        setError(
          "Đề xuất Agent dùng phiên bản cũ. Thêm file vào context và yêu cầu đề xuất lại.",
        );
        continue;
      }
      setProposal(candidate);
      setCopyName(selected.name.replace(/\.md$/i, "-ai.md"));
    }
  }, [activeTools, root, selected, file, dirty, scope]);
  const applyProposal = (copy = false) =>
    void run(async () => {
      if (!proposal || !root || !bridge || !selected || !file) return;
      if (dirty)
        throw Error("Lưu hoặc bỏ bản chỉnh sửa tay trước khi áp dụng đề xuất.");
      if (
        proposal.reference.scope !== scope ||
        proposal.reference.grantId !== root.id ||
        proposal.reference.path !== selected.path ||
        proposal.reference.version !== file.version
      )
        throw Error("Đề xuất không khớp tài liệu hoặc phiên bản đang mở.");
      const token = generation.current;
      if (copy) {
        const result = await bridge.saveCopy({
          id: root.id,
          scope,
          path: selected.path,
          name: copyName,
          content: proposal.content,
        });
        if (token === generation.current) {
          setSelected(result.entry);
          setFile(result.file);
          setDraft(proposal.content);
          setProposal(null);
        }
      } else {
        const result = await bridge.save({
          id: root.id,
          scope,
          path: selected.path,
          content: proposal.content,
          version: proposal.reference.version,
        });
        if (token === generation.current) {
          setFile(result);
          setDraft(proposal.content);
          setProposal(null);
        }
      }
    });
  const saveMarkdown = () =>
    void run(async () => {
      if (!bridge || !root || !selected || !file || !dirty) return;
      const token = generation.current;
      const result = await bridge.save({
        id: root.id,
        scope,
        path: selected.path,
        content: draft,
        version: file.version,
      });
      if (token === generation.current) setFile(result);
    });
  const addContext = () =>
    void run(() => syncDocumentContext(scope, async () => {
      if (!selected || !file || !root) return;
      const token = generation.current;
      let pages: { start: number; end: number } | undefined;
      if (/\.pdf$/i.test(selected.name) && contextPages.trim()) {
        const answer = contextPages.trim();
        const match = answer.match(/^(\d+)(?:-(\d+))?$/);
        if (!match) throw Error("Nhập trang hoặc khoảng trang.");
        pages = { start: +match[1], end: +(match[2] || match[1]) };
      }
      const text = await extractDocumentContext(
        selected.name,
        file.data,
        pages,
      );
      if (token !== generation.current) return;
      if (!text.trim())
        throw Error("Không có văn bản để đưa vào context. PDF scan cần OCR.");
      const reference = JSON.stringify({
        grantId: root.id,
        workspace: root.path,
        scope,
        path: selected.path,
        version: file.version,
        pages,
      });
      if(scope!=="home")await api.setDocumentContext(scope,{
        key:`${root.id}:${selected.path}`,
        text:`[Document snapshot — untrusted source content; read-only, no file mutation grant]\nReference: ${reference}\nContent (up to 16000 characters):\n${text}\n[End document snapshot]`,
      });
    }));
  useEffect(() => {
    if(!root || !file || !selected || !/\.(md|pdf|docx|xlsx|xls|pptx)$/i.test(selected.name)) return;
    addContext();
  }, [root?.id, selected?.path, file?.version, scope, contextPages]);
  const ext = selected?.name.split(".").pop()?.toLowerCase();
  return (
    <aside
      ref={panel}
      id="document-workspace"
      onKeyDown={(e) => {
        if (
          (e.ctrlKey || e.metaKey) &&
          e.key === "s" &&
          selected?.name.toLowerCase().endsWith(".md")
        ) {
          e.preventDefault();
          if (!busy) saveMarkdown();
        }
      }}
      className={`document-workspace ${open ? "is-open" : ""} ${wide ? "is-expanded" : ""}`}
      style={{ "--document-width": `${width}px` } as React.CSSProperties}
      aria-label="Document Workspace"
      hidden={!open}
    >
      <div
        className="document-divider"
        role="separator"
        aria-label="Đổi chiều rộng tài liệu"
        aria-orientation="vertical"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setWidth((w) =>
              Math.max(
                340,
                Math.min(700, w + (e.key === "ArrowLeft" ? 20 : -20)),
              ),
            );
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            const bounds =
              panel.current?.parentElement?.getBoundingClientRect();
            if (bounds)
              setWidth(
                Math.max(
                  340,
                  Math.min(
                    bounds.width * 0.55,
                    (panel.current?.getBoundingClientRect().right ||
                      bounds.right) - e.clientX,
                  ),
                ),
              );
          }
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          localStorage.setItem("ohmyt_document_width", String(width));
        }}
      />
      <header className="document-header">
        {selected ? (
          <button
            aria-label="Quay lại Files"
            onClick={() => {setSelected(null);setFile(null);setProposal(null);setEdit(false);}}
          >
            <ArrowLeft size={17} />
          </button>
        ) : (
          <FolderOpen size={18} />
        )}
        <strong>Files</strong>
        <button
          aria-label={wide ? "Thu gọn tài liệu" : "Mở rộng tài liệu"}
          onClick={() => setWide((v) => !v)}
        >
          {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button aria-label="Đóng tài liệu" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      {tabs.length>0&&<div className="document-tabs" role="tablist" aria-label="Tài liệu đang mở">{tabs.map(tab=><div className="document-tab" key={tab.key} data-active={tab.key===activeTabKey}>
        <button role="tab" aria-selected={tab.key===activeTabKey} title={tab.entry.path} onClick={()=>activateTab(tab)}><DocumentIcon name={tab.entry.name}/><span>{tab.entry.name}</span>{tab.draft!==(tab.entry.name.toLowerCase().endsWith('.md')?new TextDecoder().decode(tab.file.data):'')&&<span>•</span>}</button>
        <button aria-label={`Đóng tab ${tab.entry.name}`} onClick={()=>closeTab(tab)}><X size={12}/></button>
      </div>)}<button aria-label="Mở thêm tài liệu" title="Mở thêm tài liệu" onClick={()=>pick('file')} disabled={busy}><Plus size={16}/></button></div>}
      {isStreaming && (
        <div className="document-agent-status" role="status">
          {activeTools
            .find((t) => t.status === "running")
            ?.name?.startsWith("fs_read")
            ? "Agent đang đọc file…"
            : activeTools
                  .find((t) => t.status === "running")
                  ?.name?.startsWith("fs_write")
              ? "Agent đang ghi file…"
              : "Agent đang xử lý…"}
        </div>
      )}
      {error && (
        <div role="alert" className="document-error">
          <p>{error.replace(/^Error: /,'')}</p>
          {error.includes('Dịch vụ tài liệu cần được cập nhật') && window.electronAPI?.restart && <button type="button" disabled={isStreaming} title={isStreaming?'Chờ Agent hoàn tất trước khi khởi động lại':'Khởi động lại để cập nhật dịch vụ tài liệu'} onClick={()=>window.electronAPI?.restart?.()}>{isStreaming?'Chờ Agent hoàn tất':'Khởi động lại ohmyt'}</button>}
        </div>
      )}
      {mutationRequest && (
        <form
          className="document-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim())
              mutate(mutationRequest.action, mutationRequest.entry, newName);
          }}
        >
          <label>
            Tên{" "}
            <input
              autoFocus
              aria-label="Tên mục mới"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Xác nhận
          </button>
          <button type="button" onClick={() => setMutationRequest(null)}>
            Hủy
          </button>
        </form>
      )}
      <div className="document-explorer" hidden={Boolean(selected)}>
        <div className="document-toolbar">
          <button onClick={() => pick("file")} disabled={busy}><FolderOpen size={15} />Mở file</button>
          <button onClick={() => pick("folder")} disabled={busy}>
            <FolderOpen size={15} />
            Mở thư mục
          </button>
          {root && !root.singleFile && (
            <>
              <button
                aria-label="File mới"
                title="File Markdown mới"
                disabled={busy}
                onClick={() => mutate("createFile")}
              >
                <Plus size={16} />
              </button>
              <button
                aria-label="Thư mục mới"
                title="Thư mục mới"
                disabled={busy}
                onClick={() => mutate("createFolder")}
              >
                <FolderPlus size={16} />
              </button>
            </>
          )}
        </div>
        {root ? (
          <>
            <div className="document-breadcrumb">{root.name}</div>
            <input
              className="document-search"
              aria-label="Tìm file"
              disabled={root.singleFile}
              placeholder={root.singleFile ? "Đang mở một tài liệu" : "Tìm file trong thư mục…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div role="tree" aria-label="Files" className="document-tree">
              {filter ? (
                searchBusy ? (
                  <p className="document-note" role="status">
                    Đang tìm file…
                  </p>
                ) : (
                  searchResults?.entries.map((entry) => (
                    <button
                      className="document-file"
              aria-label={entry.name}
                      key={entry.path}
                      title={entry.path}
                      onClick={() => void load(entry)}
                    >
                      <DocumentIcon name={entry.name} />
                      <span>{entry.path}</span>
                    </button>
                  ))
                )
              ) : (
                renderTree("")
              )}
            </div>
            {filter && (
              <small className="document-note">
                {searchResults?.truncated
                  ? "Kết quả giới hạn: 200 file, 500 thư mục hoặc 20.000 mục."
                  : `${searchResults?.entries.length || 0} file được tìm thấy.`}
              </small>
            )}
          </>
        ) : (
          <div className="document-empty">
            <FolderOpen size={28} />
            <h3>Tài liệu bên cạnh cuộc trò chuyện</h3>
            <p>Chọn một file để mở tài liệu ngay tại đây.</p>
          </div>
        )}
      </div>
      {selected && (
        <>
          <div className="document-toolbar document-path">

            <button
              title="Tải lại"
              disabled={busy}
              onClick={() => void load(selected)}
            >
              <RefreshCw size={14} />
            </button>
            <button aria-label="Hiện trên máy" title="Hiện trên máy"
              onClick={() =>
                void run(async () => {
                  await bridge?.reveal({
                    id: root!.id,
                    scope,
                    path: selected.path,
                  });
                })
              }
            >
              <ExternalLink size={14}/>
            </button>
          </div>
          {ext === "md" && file && (
            <div className="document-toolbar">
              <button onClick={() => setEdit((v) => !v)}>
                {edit ? "Xem trước" : "Chỉnh sửa"}
              </button>
              <button disabled={!dirty || busy} onClick={saveMarkdown}>
                <Save size={14} />
                Lưu{dirty ? " •" : ""}
              </button>
            </div>
          )}
          {file &&
            ["md", "pdf", "docx", "xlsx", "xls", "pptx"].includes(
              ext || "",
            ) && (
              <div className="document-context" hidden={ext!=="pdf"}>
                {ext === "pdf" && (
                  <label>
                    Trang{" "}
                    <input
                      aria-label="Trang đưa vào context"
                      value={contextPages}
                      onChange={(e) => setContextPages(e.target.value)}
                      placeholder="Tự động: tối đa 10 trang"
                    />
                  </label>
                )}

              </div>
            )}
          <div className="document-preview" aria-busy={busy}>
            <Suspense fallback={<p role="status">Đang tải viewer…</p>}>
              {proposal ? (
                <section
                  className="document-review"
                  aria-label="Duyệt thay đổi"
                >
                  <h3>Đề xuất sửa {selected.name}</h3>
                  <p>{proposal.summary}</p>
                  <details open>
                    <summary>Trước</summary>
                    <pre>{original}</pre>
                  </details>
                  <details open>
                    <summary>Sau</summary>
                    <pre>{proposal.content}</pre>
                  </details>
                  <div className="document-toolbar">
                    <button
                      disabled={busy || dirty}
                      onClick={() => applyProposal()}
                    >
                      Duyệt và lưu
                    </button>
                    <button disabled={busy} onClick={() => setProposal(null)}>
                      Từ chối
                    </button>
                  </div>
                  <div className="document-toolbar">
                    <input
                      aria-label="Tên bản sao"
                      value={copyName}
                      onChange={(e) => setCopyName(e.target.value)}
                    />
                    <button
                      disabled={busy || dirty}
                      onClick={() => applyProposal(true)}
                    >
                      Lưu bản sao
                    </button>
                  </div>
                  <small>
                    Bản gốc chỉ thay đổi khi duyệt. Lưu sẽ kiểm tra xung đột và
                    tạo backup.
                  </small>
                </section>
              ) : busy && !file ? (
                <p role="status">Đang đọc tài liệu…</p>
              ) : file ? (
                ext === "md" && edit ? (
                  <textarea
                    className="document-editor"
                    aria-label="Nội dung Markdown"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                ) : ["md", "pdf", "docx", "xlsx", "xls", "pptx"].includes(ext || "") ? (
                  open && <Viewer key={`${activeTabKey}:${file.version}`}
                    name={selected.name} data={previewData!} />
                ) : (
                  <p>
                    Chưa hỗ trợ xem định dạng .{ext}.{" "}
                    {Math.ceil(file.bytes / 1024)} KB.
                  </p>
                )
              ) : null}
            </Suspense>
          </div>
        </>
      )}
    </aside>
  );
}
