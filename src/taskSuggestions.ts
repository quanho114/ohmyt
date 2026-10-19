import { FolderSearch, GitPullRequest, FileText, Mail } from 'lucide-react';
import type {TaskWorkflowId} from '../shared/task_workflow.js';

export interface TaskStartOptions { workflowId?: TaskWorkflowId; projectId?: string; }

export const taskSuggestions = [
  {
    id: 'project-overview' as const,
    label: 'Tìm hiểu dự án',
    description: 'Hiểu cấu trúc, chức năng và cách chạy',
    prompt: 'Tìm hiểu dự án',
    tone: 'blue',
    icon: FolderSearch
  },
  {
    id: 'code-review' as const,
    label: 'Rà soát thay đổi',
    description: 'Tìm lỗi trong phần code vừa sửa',
    prompt: 'Rà soát thay đổi',
    tone: 'purple',
    icon: GitPullRequest
  },
  {
    id: 'document-summary' as const,
    label: 'Tóm tắt tài liệu',
    description: 'Rút ý chính, kết luận và việc cần làm',
    prompt: 'Tóm tắt tài liệu',
    tone: 'orange',
    icon: FileText
  },
  {
    id: 'email-draft' as const,
    label: 'Soạn email',
    description: 'Viết bản nháp theo mục đích của bạn',
    prompt: 'Soạn email',
    tone: 'teal',
    icon: Mail
  }
];

export type TaskSuggestion = typeof taskSuggestions[number];
