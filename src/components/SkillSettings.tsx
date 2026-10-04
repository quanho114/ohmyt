import React, { useState, useRef } from 'react';
import type { SkillItem } from '../types.ts';
import type { Appearance, SettingsLocale } from '../appearance.ts';
import type { SettingsTextKey } from '../settingsLocale.ts';
import { settingsText } from '../settingsLocale.ts';
import { api } from '../api.ts';
import { SkillMarkdownViewer } from './SkillMarkdownViewer.tsx';
import {
  LayoutGrid,
  Plus,
  PanelLeft,
  ArrowLeft,
  Link,
  GitBranch,
  FileArchive,
  ShoppingBag,
  Check,
  AlertCircle,
  Loader2,
  Terminal,
  Cpu,
  Wrench,
  Sparkles,
  X,
  FileCode,
  ShieldAlert,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface SkillSettingsProps {
  skills: SkillItem[];
  onRefresh: () => void;
  locale: SettingsLocale;
  appearance: Appearance;
  activeTheme: 'light' | 'dark';
  onClose?: () => void;
  onToggleNav?: () => void;
  navCollapsed?: boolean;
  isMobile?: boolean;
}

const STORE_SKILLS: Array<{
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string;
  requiredTools: string[];
  instructions: string;
}> = [
  {
    id: 'artifacts',
    name: 'Tạo tác',
    description: 'Tạo và xem trước trực tiếp các thành phần giao diện tương tác, biểu đồ dữ liệu, đồ họa SVG và ứng dụng web. Tạo nội dung trực quan phong phú mà người dùng có thể tương tác trực tiếp.',
    version: '1.0.0',
    author: 'lobehub',
    icon: 'artifacts',
    requiredTools: ['web_search'],
    instructions: `<artifacts_guides>
The assistant possesses the capability to generate "Artifacts"—dedicated UI windows.

## 1. Evaluation Criteria
For a self-contained preview, emit the Artifact directly.

### When to Create an Artifact (Qualifying Content)
- Interactive Components: UI components that users can preview and manipulate.
- Visual Content: SVG graphics, diagrams, and rich visualizations.
- Web Pages: Self-contained HTML/CSS/JS applications and landing pages.
- Iterative Projects: Content that the user will refine over multiple steps.

### When to Stay Inline (Disqualifying Content)
- Code snippets: Always present code inline using markdown code blocks, never as an artifact.
- Documents or articles: Use regular markdown text in conversation.
</artifacts_guides>`
  },
  {
    id: 'web-researcher',
    name: 'Web Researcher',
    description: 'Chuyên gia thu thập, tổng hợp và phân tích thông tin đa chiều từ Internet.',
    version: '1.2.0',
    author: 'ohmyt-community',
    icon: 'Sparkles',
    requiredTools: ['web_search', 'memory_save'],
    instructions: `# Web Researcher Workflow

Khi nhận được yêu cầu nghiên cứu thông tin:
1. Sử dụng \`web_search\` với từ khóa chính xác và đa dạng góc nhìn.
2. Trích xuất các ý chính, nguồn tham khảo đáng tin cậy.
3. Tổng hợp thành báo cáo có cấu trúc gồm: Bối cảnh, Phân tích chi tiết, Kết luận.
4. Ghi nhớ các phát hiện quan trọng vào bộ nhớ bằng \`memory_save\` khi người dùng yêu cầu.`
  },
  {
    id: 'git-assistant',
    name: 'Git Assistant',
    description: 'Hỗ trợ quản lý phiên bản Git, soạn thảo conventional commit messages và kiểm tra diff.',
    version: '1.1.0',
    author: 'ohmyt-community',
    icon: 'GitBranch',
    requiredTools: ['shell_exec'],
    instructions: `# Git Workflow Assistant

Quy trình quản lý Git an toàn:
1. Chạy \`git status\` và \`git diff\` để kiểm tra các thay đổi hiện tại.
2. Soạn thông điệp commit theo chuẩn Conventional Commits (\`feat:\`, \`fix:\`, \`refactor:\`, \`docs:\`).
3. Xác nhận với người dùng trước khi thực hiện các lệnh có tác động lớn như \`git reset\` hay \`git push --force\`.`
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Phân tích mã nguồn chuyên sâu, phát hiện lỗ hổng bảo mật và đề xuất tối ưu hiệu năng.',
    version: '1.0.0',
    author: 'ohmyt-community',
    icon: 'FileCode',
    requiredTools: ['fs_read', 'fs_list'],
    instructions: `# Code Review Standard

Các tiêu chí đánh giá chất lượng mã nguồn:
1. **Bảo mật**: Kiểm tra injection, lộ bí mật (API keys), SSRF, XSS.
2. **Hiệu năng**: Tránh query N+1, vòng lặp lồng nhau, rò rỉ bộ nhớ.
3. **Clean Code**: Đặt tên rõ ràng, hàm nhỏ (<50 dòng), không lồng quá 4 cấp.
4. **Kiểm thử**: Đảm bảo bao phủ unit test cho các luồng nghiệp vụ quan trọng.`
  },
  {
    id: 'doc-summarizer',
    name: 'Document Summarizer',
    description: 'Tóm tắt tài liệu kỹ thuật dài, rút trích key takeaways và tạo sơ đồ quy trình.',
    version: '1.0.5',
    author: 'ohmyt-community',
    icon: 'Sparkles',
    requiredTools: ['fs_read'],
    instructions: `# Document Summarizer

Khi tóm tắt tài liệu kỹ thuật:
1. Đọc lướt để nắm cấu trúc tổng thể và mục tiêu chính của tài liệu.
2. Trích xuất các ý cốt lõi, danh sách tham số, API và hướng dẫn cài đặt.
3. Chuyển đổi các quy trình phức tạp thành sơ đồ Mermaid dễ hiểu.`
  }
];

export function SkillSettings({
  skills,
  onRefresh,
  locale,
  appearance,
  activeTheme,
  onClose,
  onToggleNav,
  navCollapsed,
  isMobile
}: SkillSettingsProps) {
  const t = (key: SettingsTextKey) => settingsText(locale, key);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return skills.length > 0 ? skills[0].id : null;
  });

  const [collapseBuiltin, setCollapseBuiltin] = useState(false);
  const [collapseCustom, setCollapseCustom] = useState(false);

  // Modals state
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Form states
  const [importUrl, setImportUrl] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [modalError, setModalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, isError = false) => {
    setFeedbackMsg({ text, isError });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Determine active skill
  const selectedSkill = skills.find(s => s.id === selectedId) || skills[0] || null;

  const handleImportFromUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setIsLoading(true);
    setModalError('');
    try {
      const created = await api.importSkillFromUrl(importUrl.trim());
      setShowUrlModal(false);
      setImportUrl('');
      setSelectedId(created.id);
      showToast(t('Đã cài đặt thành công'));
      onRefresh();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Đã xảy ra lỗi khi thực hiện thao tác'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportFromGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubRepo.trim()) return;
    setIsLoading(true);
    setModalError('');
    try {
      const created = await api.importSkillFromGitHub(githubRepo.trim());
      setShowGithubModal(false);
      setGithubRepo('');
      setSelectedId(created.id);
      showToast(t('Đã cài đặt thành công'));
      onRefresh();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Đã xảy ra lỗi khi thực hiện thao tác'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const isZip = file.name.endsWith('.zip') || file.name.endsWith('.skill');
      if (isZip) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const created = await api.uploadSkill({
          filename: file.name,
          content: base64,
          isBase64: true
        });
        setSelectedId(created.id);
      } else {
        const text = await file.text();
        const created = await api.uploadSkill({
          filename: file.name,
          content: text,
          isBase64: false
        });
        setSelectedId(created.id);
      }
      showToast(t('Đã cài đặt thành công'));
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('Đã xảy ra lỗi khi thực hiện thao tác'), true);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInstallStoreSkill = async (storeSkill: typeof STORE_SKILLS[0]) => {
    setIsLoading(true);
    try {
      const created = await api.createSkill({
        id: storeSkill.id,
        name: storeSkill.name,
        description: storeSkill.description,
        version: storeSkill.version,
        author: storeSkill.author,
        icon: storeSkill.icon,
        requiredTools: storeSkill.requiredTools,
        instructions: storeSkill.instructions,
        enabled: true
      });
      setSelectedId(created.id);
      showToast(t('Đã cài đặt thành công'));
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('Đã xảy ra lỗi khi thực hiện thao tác'), true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!selectedSkill) return;
    setIsLoading(true);
    try {
      await api.deleteSkill(selectedSkill.id);
      setShowDeleteModal(false);
      setSelectedId(null);
      showToast(t('Gỡ cài đặt thành công'));
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('Đã xảy ra lỗi khi thực hiện thao tác'), true);
    } finally {
      setIsLoading(false);
    }
  };

  const builtinSkills = skills.filter(s => s.builtin);
  const customSkills = skills.filter(s => !s.builtin);

  const getSkillVisual = (skill?: SkillItem | { id?: string; icon?: string } | null) => {
    const key = skill?.icon || skill?.id || '';
    switch (key) {
      case 'artifacts':
      case 'Tạo tác':
        return {
          icon: <Sparkles size={14} />,
          largeIcon: <Sparkles size={22} />,
          bg: activeTheme === 'dark' ? 'rgba(235, 47, 150, 0.15)' : '#fff0f6',
          color: activeTheme === 'dark' ? '#ff85c0' : '#eb2f96'
        };
      case 'Terminal':
      case 'safe-terminal':
        return {
          icon: <Terminal size={14} />,
          largeIcon: <Terminal size={22} />,
          bg: activeTheme === 'dark' ? 'rgba(250, 84, 28, 0.15)' : '#fff2e8',
          color: activeTheme === 'dark' ? '#ff7a45' : '#fa541c'
        };
      case 'Cpu':
      case 'workspace-analyzer':
        return {
          icon: <Cpu size={14} />,
          largeIcon: <Cpu size={22} />,
          bg: activeTheme === 'dark' ? 'rgba(24, 144, 255, 0.15)' : '#e6f7ff',
          color: activeTheme === 'dark' ? '#40a9ff' : '#1890ff'
        };
      case 'GitBranch':
      case 'git-assistant':
        return {
          icon: <GitBranch size={14} />,
          largeIcon: <GitBranch size={22} />,
          bg: activeTheme === 'dark' ? 'rgba(82, 196, 26, 0.15)' : '#f6ffed',
          color: activeTheme === 'dark' ? '#73d13d' : '#52c41a'
        };
      case 'FileCode':
      case 'code-reviewer':
        return {
          icon: <FileCode size={14} />,
          largeIcon: <FileCode size={22} />,
          bg: activeTheme === 'dark' ? 'rgba(114, 46, 209, 0.15)' : '#f9f0ff',
          color: activeTheme === 'dark' ? '#b37feb' : '#722ed1'
        };
      case 'Sparkles':
      case 'web-researcher':
        return {
          icon: <Sparkles size={14} />,
          largeIcon: <Sparkles size={22} />,
          bg: activeTheme === 'dark' ? 'rgba(250, 219, 20, 0.15)' : '#feffe6',
          color: activeTheme === 'dark' ? '#ffec3d' : '#d48806'
        };
      default:
        return {
          icon: <Wrench size={14} />,
          largeIcon: <Wrench size={22} />,
          bg: activeTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          color: 'var(--text-secondary)'
        };
    }
  };

  const renderSkillRow = (skill: SkillItem) => {
    const isSelected = selectedSkill?.id === skill.id;
    const visual = getSkillVisual(skill);

    return (
      <button
        key={skill.id}
        type="button"
        onClick={() => setSelectedId(skill.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer select-none ${
          isSelected
            ? 'bg-[var(--surface-hover)] font-medium text-primary'
            : 'text-secondary hover:bg-[var(--surface-hover)] hover:text-primary'
        }`}
      >
        {/* Soft Squircle Pastel Avatar */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: visual.bg, color: visual.color }}
        >
          {visual.icon}
        </div>

        {/* Skill Name */}
        <span className="text-[13px] truncate flex-1">{skill.name}</span>
      </button>
    );
  };

  return (
    <div className="skill-settings flex-1 flex flex-row h-full min-h-0 overflow-hidden select-none">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".zip,.skill,.md"
        className="hidden"
      />

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm border font-medium appearance-enter"
          style={{
            backgroundColor: 'var(--surface)',
            color: feedbackMsg.isError ? 'var(--danger)' : 'var(--text-primary)',
            borderColor: feedbackMsg.isError ? 'var(--danger)' : 'var(--border)'
          }}
        >
          {feedbackMsg.isError ? <AlertCircle size={16} /> : <Check size={16} className="text-success" />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* 1. MASTER VIEW (Sub-Sidebar: Flat, un-nested, clean LobeHub style) */}
      <aside
        className="skill-sidebar w-64 flex-shrink-0 flex flex-col h-full border-r border-[var(--border)]"
        style={{ backgroundColor: 'var(--sidebar)' }}
      >
        {/* Header with Title & 2 Compact Ghost Buttons */}
        <div className="h-13 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {(navCollapsed || isMobile) && onToggleNav && (
              <button
                type="button"
                onClick={onToggleNav}
                className="p-1 rounded-md text-secondary hover:text-primary hover:bg-[var(--surface-hover)] transition-colors"
                title={t('Mở điều hướng')}
              >
                <PanelLeft size={16} />
              </button>
            )}
            <span className="font-semibold text-sm text-primary">{t('Kỹ năng')}</span>
          </div>

          <div className="flex items-center gap-1.5 relative">
            {/* Store Button (4 squares LayoutGrid icon like LobeHub) */}
            <button
              type="button"
              onClick={() => setShowStoreModal(true)}
              className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center text-secondary hover:text-primary hover:bg-[var(--surface-hover)] transition-all cursor-pointer"
              title={t('Kho kỹ năng')}
            >
              <LayoutGrid size={14} />
            </button>

            {/* Add / Import Menu Button */}
            <button
              type="button"
              onClick={() => setShowAddMenu(prev => !prev)}
              className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center text-secondary hover:text-primary hover:bg-[var(--surface-hover)] transition-all cursor-pointer"
              title={t('Thêm kỹ năng')}
            >
              <Plus size={15} />
            </button>

            {/* Add Dropdown Menu */}
            {showAddMenu && (
              <div
                className="absolute right-0 top-full mt-1.5 w-60 py-1.5 rounded-xl border border-[var(--border-strong)] shadow-xl z-30 appearance-enter"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                <button
                  type="button"
                  onClick={() => { setShowAddMenu(false); setShowUrlModal(true); }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
                  <Link size={16} className="mt-0.5 text-accent" />
                  <div>
                    <div className="text-xs font-semibold text-primary">{t('Nhập từ URL')}</div>
                    <div className="text-[11px] text-tertiary leading-tight">{t('Nhập qua liên kết trực tiếp đến SKILL.md')}</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setShowAddMenu(false); setShowGithubModal(true); }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
                  <GitBranch size={16} className="mt-0.5 text-accent" />
                  <div>
                    <div className="text-xs font-semibold text-primary">{t('Nhập từ GitHub')}</div>
                    <div className="text-[11px] text-tertiary leading-tight">{t('Nhập từ một kho GitHub công khai')}</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { setShowAddMenu(false); fileInputRef.current?.click(); }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
                  <FileArchive size={16} className="mt-0.5 text-accent" />
                  <div>
                    <div className="text-xs font-semibold text-primary">{t('Tải lên Tệp Zip')}</div>
                    <div className="text-[11px] text-tertiary leading-tight">{t('Tải lên tệp .zip hoặc .skill từ máy tính')}</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Skills List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
          {skills.length === 0 ? (
            <div className="text-center py-10 px-4 text-xs text-tertiary">
              {t('Chưa có kỹ năng nào phù hợp')}
            </div>
          ) : (
            <>
              {/* Built-in Skills Group */}
              {builtinSkills.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setCollapseBuiltin(prev => !prev)}
                    className="w-full flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium text-tertiary hover:text-secondary transition-colors select-none cursor-pointer"
                  >
                    {collapseBuiltin ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span>{t('Kỹ năng tích hợp sẵn')}</span>
                  </button>
                  {!collapseBuiltin && (
                    <div className="space-y-0.5 mt-0.5">
                      {builtinSkills.map(renderSkillRow)}
                    </div>
                  )}
                </div>
              )}

              {/* Custom Skills Group */}
              {customSkills.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setCollapseCustom(prev => !prev)}
                    className="w-full flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium text-tertiary hover:text-secondary transition-colors select-none cursor-pointer"
                  >
                    {collapseCustom ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span>{t('Kỹ năng tùy chỉnh')}</span>
                  </button>
                  {!collapseCustom && (
                    <div className="space-y-0.5 mt-0.5">
                      {customSkills.map(renderSkillRow)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* 2. DETAIL VIEW (Right Pane - Zero Boxes, Flat Markdown Canvas like LobeHub) */}
      <main
        className="skill-detail flex-1 flex flex-col h-full overflow-y-auto"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        {!selectedSkill ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-tertiary">
            <Wrench size={36} className="opacity-20 mb-3" />
            <p className="text-sm">{t('Chọn kỹ năng để xem chi tiết')}</p>
          </div>
        ) : (
          <div className="px-10 py-8 max-w-4xl w-full mx-auto">
            {/* Header: Avatar, Name, Description, and Gỡ cài đặt Button */}
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                {/* Large Soft Squircle Avatar */}
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: getSkillVisual(selectedSkill).bg,
                    color: getSkillVisual(selectedSkill).color
                  }}
                >
                  {getSkillVisual(selectedSkill).largeIcon}
                </div>

                <div className="space-y-1 pt-0.5">
                  <h2 className="text-[19px] font-bold text-primary tracking-tight">
                    {selectedSkill.name}
                  </h2>

                  {/* Description directly beneath title */}
                  {selectedSkill.description && (
                    <p className="text-[13.5px] text-secondary leading-relaxed max-w-2xl">
                      {selectedSkill.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Action: Gỡ cài đặt Button (Red outline, text-red-500, clean like Image #7) */}
              <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                {!selectedSkill.builtin ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="px-3 py-1 rounded-lg text-xs font-medium border border-red-300 dark:border-red-900/60 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                  >
                    {t('Gỡ cài đặt')}
                  </button>
                ) : (
                  <span
                    className="text-[11px] px-2.5 py-0.5 rounded-md text-tertiary border border-[var(--border-subtle)] select-none"
                    title={t('Kỹ năng hệ thống được bảo vệ')}
                  >
                    {t('Hệ thống')}
                  </span>
                )}

                {isMobile && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-[var(--surface-hover)] transition-colors ml-2"
                    title={t('Quay lại chat')}
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Direct Markdown Canvas (No container card, no border line, exactly like Image #7) */}
            <div className="mt-8">
              <SkillMarkdownViewer
                markdown={selectedSkill.instructions}
                appearance={appearance}
                activeTheme={activeTheme}
              />
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: Import from Direct URL */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm appearance-enter">
          <div
            className="w-full max-w-md p-6 rounded-2xl border border-[var(--border-strong)] shadow-2xl space-y-4"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Link size={18} className="text-accent" />
                <h3 className="text-sm font-bold text-primary">{t('Nhập từ URL')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUrlModal(false)}
                className="p-1 rounded-lg hover:bg-[var(--surface-hover)] text-tertiary"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              {t('Nhập đường dẫn trực tiếp (URL) đến tệp SKILL.md. Hệ thống sẽ tự động tải và kích hoạt.')}
            </p>

            <form onSubmit={handleImportFromUrl} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1">
                  {t('Đường dẫn')} (URL)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://raw.githubusercontent.com/.../SKILL.md"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="w-full text-xs rounded-lg py-2 px-3 focus:outline-none"
                  style={{
                    backgroundColor: 'var(--input-background)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {modalError && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-[var(--surface-hover)]"
                >
                  {t('Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !importUrl.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {isLoading && <Loader2 size={13} className="animate-spin" />}
                  <span>{t('Cài đặt kỹ năng')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Import from GitHub Repository */}
      {showGithubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm appearance-enter">
          <div
            className="w-full max-w-md p-6 rounded-2xl border border-[var(--border-strong)] shadow-2xl space-y-4"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <GitBranch size={18} className="text-accent" />
                <h3 className="text-sm font-bold text-primary">{t('Nhập từ GitHub')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGithubModal(false)}
                className="p-1 rounded-lg hover:bg-[var(--surface-hover)] text-tertiary"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              {t('Nhập tên repository GitHub (vd: owner/repo) hoặc URL đầy đủ chứa tệp SKILL.md.')}
            </p>

            <form onSubmit={handleImportFromGithub} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1">
                  GitHub Repository
                </label>
                <input
                  type="text"
                  required
                  placeholder="lobehub/lobe-chat"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  className="w-full text-xs rounded-lg py-2 px-3 focus:outline-none"
                  style={{
                    backgroundColor: 'var(--input-background)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {modalError && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowGithubModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-[var(--surface-hover)]"
                >
                  {t('Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !githubRepo.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {isLoading && <Loader2 size={13} className="animate-spin" />}
                  <span>{t('Cài đặt kỹ năng')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Store Modal (Curated Skills) */}
      {showStoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm appearance-enter">
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-2xl border border-[var(--border-strong)] shadow-2xl space-y-4 overflow-hidden"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} className="text-accent" />
                <h3 className="text-base font-bold text-primary">{t('Kho kỹ năng')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStoreModal(false)}
                className="p-1 rounded-lg hover:bg-[var(--surface-hover)] text-tertiary"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-secondary">
              {t('Khám phá và cài đặt kỹ năng được tuyển chọn')}
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {STORE_SKILLS.map((item) => {
                const isInstalled = skills.some(s => s.id === item.id);

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-[var(--border)] flex items-start justify-between gap-4"
                    style={{ backgroundColor: 'var(--surface-secondary)' }}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                        style={{
                          backgroundColor: getSkillVisual(item).bg,
                          color: getSkillVisual(item).color
                        }}
                      >
                        {getSkillVisual(item).icon}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-primary">{item.name}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded font-mono-code text-tertiary bg-[var(--surface)]">
                            v{item.version}
                          </span>
                        </div>
                        <p className="text-xs text-secondary leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isInstalled || isLoading}
                      onClick={() => handleInstallStoreSkill(item)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-colors ${
                        isInstalled
                          ? 'border border-[var(--border)] text-tertiary opacity-70 cursor-default'
                          : 'bg-accent text-white hover:opacity-90 shadow-sm'
                      }`}
                    >
                      {isInstalled ? t('Đã cài đặt') : t('Cài đặt kỹ năng')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Confirmation */}
      {showDeleteModal && selectedSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm appearance-enter">
          <div
            className="w-full max-w-sm p-6 rounded-2xl border border-[var(--border-strong)] shadow-2xl space-y-4"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="flex items-center gap-3 text-danger">
              <ShieldAlert size={24} />
              <h3 className="text-base font-bold text-primary">{t('Gỡ cài đặt kỹ năng')}</h3>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              {t('Bạn có chắc chắn muốn gỡ cài đặt kỹ năng')} <strong className="text-primary">{selectedSkill.name}</strong>? {t('Hành động này sẽ xóa tệp SKILL.md khỏi hệ thống.')}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-[var(--surface-hover)]"
              >
                {t('Hủy')}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleDeleteSkill}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-danger hover:opacity-90 flex items-center gap-1.5"
              >
                {isLoading && <Loader2 size={13} className="animate-spin" />}
                <span>{t('Xác nhận gỡ cài đặt')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
