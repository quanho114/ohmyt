import type { SettingsLocale } from './appearance.ts';

export const settingsCopy = {
  'Cài đặt': 'Settings', 'Giao diện': 'Appearance', 'Nhà Cung Cấp AI': 'AI providers',
  'Bộ nhớ': 'Memory', 'Kỹ năng Agent': 'Agent skills', 'Timeline': 'Timeline', 'Thống kê': 'Statistics',
  'Cá nhân': 'Personal', 'Mô hình & Engine': 'Models & engine', 'Tìm kiếm cài đặt...': 'Search settings...',
  'Không tìm thấy mục phù hợp.': 'No matching settings.', 'Quay lại chat': 'Back to chat',
  'Thu gọn điều hướng': 'Collapse navigation', 'Mở điều hướng': 'Open navigation',
  'Đã lưu trên thiết bị': 'Saved on this device', 'Chưa lưu được trên thiết bị': 'Could not save on this device',
  'Cài đặt chung': 'General settings', 'Chủ đề': 'Theme', 'Sáng': 'Light', 'Tối': 'Dark', 'Tự động': 'Automatic',
  'Theo hệ thống': 'Follow system', 'Ngôn ngữ': 'Language', 'Tiếng Việt': 'Vietnamese',
  'Hoạt ảnh phản hồi': 'Response animation', 'Tắt': 'Off', 'Nhanh nhẹn': 'Snappy', 'Thanh lịch': 'Elegant',
  'Chế độ menu chuột phải': 'Right-click menu', 'Mặc định': 'Default', 'Ngôn ngữ phản hồi': 'Response language',
  'Áp dụng từ tác vụ tiếp theo. Model có thể không tuân thủ tuyệt đối.': 'Applies to the next run. The model may not always follow this instruction.',
  'Giao diện ứng dụng': 'Application appearance', 'Bảng màu': 'Palette', 'Màu chủ đề': 'Accent color', 'Màu trung tính': 'Neutral color',
  'Đỏ': 'Red', 'Cam': 'Orange', 'Vàng': 'Yellow', 'Lime': 'Lime', 'Xanh lá': 'Green', 'Cyan': 'Cyan', 'Xanh trời': 'Sky', 'Xanh dương': 'Blue', 'Tím': 'Purple', 'Magenta': 'Magenta', 'Coral': 'Coral',
  'Phông chữ': 'Typography', 'Font Antialiasing': 'Font antialiasing',
  'Làm nét chữ bằng grayscale antialiasing. Chỉ ảnh hưởng macOS; tắt để dùng cách hiển thị mặc định của hệ thống.': 'Render text with grayscale antialiasing. Only affects macOS; turn off to use system rendering.',
  'Kích thước chữ': 'Font size', 'Kích thước phông chữ của tin nhắn': 'Message font size', 'Chuẩn': 'Standard',
  'Chào mừng đến với ohmyt. Chỉ cần một câu, hãy nêu mục tiêu của bạn.': 'Welcome to ohmyt. Just one sentence: tell us what you want to accomplish.',
  'Hoạt ảnh chuyển tiếp': 'Transition animations', 'Không có': 'None', 'Hiện dần': 'Fade', 'Mượt mà': 'Smooth',
  'Tính năng': 'Features', 'Điểm nổi bật': 'Key highlights', 'Đa mô hình': 'Multi-model', 'Công cụ': 'Tools',
  'Hành vi trò chuyện': 'Chat behavior', 'Tự động cuộn khi AI phản hồi': 'Auto-scroll during AI responses',
  'Chỉ bám đáy khi bạn không đang đọc lịch sử.': 'Follows the bottom without interrupting you while reading history.',
  'Mở rộng các bước công cụ khi đang chạy': 'Expand tool steps while running', 'Hiển thị biểu tượng trong liên kết tin nhắn': 'Show icons in message links',
  'Xem': 'See', 'để biết thêm chi tiết.': 'for more details.',
  'Chủ đề tô sáng mã': 'Code highlighting theme', 'Chủ đề Mermaid': 'Mermaid theme',
  'Dừng tác vụ': 'Stop run', 'Dừng tác vụ đang chạy': 'Stop the active run',
  'Hoạt động gần đây': 'Recent activity', 'Sự kiện thô': 'Raw events', 'Gỡ lỗi': 'Debug', 'Gỡ lỗi: bật': 'Debug: on',
  'Chưa có hoạt động nào.': 'No activity yet.', 'Đang chờ hoạt động của công cụ.': 'Waiting for tool activity.', 'sự kiện': 'events',
  'Thông tin đã lưu': 'Saved information', 'Tìm kiếm bộ nhớ': 'Search memory', 'Tìm kiếm ký ức...': 'Search memories...', 'Tìm kiếm': 'Search',
  'Không tìm thấy ký ức phù hợp': 'No matching memories', 'Chưa có thông tin nào được lưu trong bộ nhớ': 'No information saved in memory yet', 'Xóa ký ức': 'Delete memory',
  'Đã bắt đầu': 'Started', 'Đang đọc tệp': 'Reading file', 'Đang ghi tệp': 'Writing file', 'Đang xem thư mục': 'Listing directory',
  'Đang tìm kiếm trên web': 'Searching the web', 'Đang tìm trong bộ nhớ': 'Searching memory', 'Đang lưu thông tin': 'Saving information',
  'Đang chạy công cụ': 'Running tool', 'Cần phê duyệt': 'Approval required', 'Đã từ chối quyền': 'Permission denied', 'Hành động bị chặn': 'Action blocked',
  'Đã chạy công cụ': 'Tool completed', 'Công cụ gặp lỗi': 'Tool failed', 'Đã lưu vào bộ nhớ': 'Saved to memory', 'Hoàn thành': 'Completed', 'Đã dừng tác vụ': 'Run stopped', 'Tác vụ gặp lỗi': 'Run failed',
  'Thêm nhà cung cấp': 'Add provider', 'Tất cả nhà cung cấp': 'All providers', 'Đã bật': 'Enabled', 'Đã tắt': 'Disabled',
  'Đang tự động phát hiện models từ endpoint...': 'Discovering models from the endpoint...', 'Test Connection': 'Test connection',
  'Tìm kiếm nhà cung cấp...': 'Search providers...', 'Tìm model...': 'Search models...',
  'Thêm mã mô hình (vd: gpt-4o, claude-3-5-sonnet)...': 'Add model ID (e.g. gpt-4o, claude-3-5-sonnet)...',
  'Xóa model': 'Delete model', 'Bấm để cấu hình': 'Click to configure', 'Thêm nhà cung cấp AI mới': 'Add an AI provider',
  'Loại nhà cung cấp': 'Provider type', 'ID định danh (slug)': 'Provider ID (slug)', 'Mô tả': 'Description',
  'Định dạng request': 'Request format', 'Tên hiển thị': 'Display name', 'Tên nhà cung cấp (vd: My Server)': 'Provider name (e.g. My Server)',
  'API Key (tùy chọn cho local)': 'API key (optional for local)', 'Mô tả về server hoặc model này': 'Describe this server or model',
  'vd: my-local-ai': 'e.g. my-local-ai', 'Nhập API key...': 'Enter API key...', '•••••••••••••••• (Đã lưu key)': '•••••••••••••••• (Key saved)',
  'Vui lòng nhập ID nhà cung cấp (vd: my-provider).': 'Enter a provider ID (e.g. my-provider).', 'Vui lòng nhập tên provider.': 'Enter a provider name.',
  'Vui lòng nhập Base URL (vd: http://localhost:1234).': 'Enter a Base URL (e.g. http://localhost:1234).', 'Chưa có gì thay đổi.': 'No changes.', 'Đã lưu.': 'Saved.',
  'Lưu': 'Save', 'Hủy': 'Cancel', 'Đóng': 'Close', 'Bật': 'On', 'Xóa': 'Delete', 'Kiểm tra kết nối': 'Test connection',
  'Lưu cấu hình': 'Save configuration', 'Danh sách mô hình': 'Model list', 'Chưa có mô hình nào': 'No models yet'
} as const;

export type SettingsTextKey = keyof typeof settingsCopy;
// Stable localization contract shared by all settings sections; unknown data is not translated.
export function settingsText(locale: SettingsLocale, key: string): string {
  return locale === 'en' ? (settingsCopy[key as SettingsTextKey] ?? key) : key;
}

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
