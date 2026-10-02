import fs from 'node:fs';
import path from 'node:path';

export class SkillsManager {
  constructor(skillsDir = null) {
    this.skillsDir = skillsDir || path.resolve(process.cwd(), 'skills');
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    this.ensureDefaultSkills();
  }

  parseSkillMd(content) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    let metadata = {};
    let instructions = content;

    if (match) {
      const rawYaml = match[1];
      instructions = match[2].trim();

      for (const line of rawYaml.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.substring(0, colonIdx).trim();
          let val = line.substring(colonIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          } else if (val.startsWith('[') && val.endsWith(']')) {
            val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
          }
          metadata[key] = val;
        }
      }
    }

    return {
      name: metadata.name || 'unnamed-skill',
      description: metadata.description || '',
      version: metadata.version || '1.0.0',
      requiredTools: Array.isArray(metadata.required_tools) ? metadata.required_tools : [],
      instructions
    };
  }

  loadAllSkills() {
    if (!fs.existsSync(this.skillsDir)) return [];

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const skills = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = path.join(this.skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          try {
            const raw = fs.readFileSync(skillMdPath, 'utf-8');
            const parsed = this.parseSkillMd(raw);
            skills.push({
              id: entry.name,
              path: skillMdPath,
              ...parsed
            });
          } catch (err) {
            console.error(`Lỗi khi đọc skill ${entry.name}:`, err);
          }
        }
      }
    }

    return skills;
  }

  ensureDefaultSkills() {
    // 1. Workspace Analyzer
    const analyzerDir = path.join(this.skillsDir, 'workspace-analyzer');
    if (!fs.existsSync(analyzerDir)) {
      fs.mkdirSync(analyzerDir, { recursive: true });
      fs.writeFileSync(path.join(analyzerDir, 'SKILL.md'), `---
name: "workspace-analyzer"
description: "Phân tích cấu trúc thư mục, tệp mã nguồn và kiến trúc của dự án hiện tại"
version: "1.0.0"
required_tools: ["fs_list", "fs_read"]
---

# Quy trình phân tích dự án:
1. Dùng \`fs_list\` tại thư mục gốc để nắm các tệp cấu hình chính (package.json, Cargo.toml, README...).
2. Dùng \`fs_read\` để đọc các tệp cấu hình quan trọng nhằm xác định framework và dependencies.
3. Tổng hợp bức tranh tổng thể ngắn gọn: công nghệ, mục tiêu dự án, cấu trúc thư mục.
`, 'utf-8');
    }

    // 2. Safe Terminal
    const termDir = path.join(this.skillsDir, 'safe-terminal');
    if (!fs.existsSync(termDir)) {
      fs.mkdirSync(termDir, { recursive: true });
      fs.writeFileSync(path.join(termDir, 'SKILL.md'), `---
name: "safe-terminal"
description: "Thực thi lệnh kiểm thử, kiểm tra cú pháp và build an toàn"
version: "1.0.0"
required_tools: ["shell_exec"]
---

# Quy trình chạy lệnh an toàn:
1. Xác định lệnh cần chạy (ví dụ kiểm tra cú pháp, chạy test hoặc build).
2. Tuyệt đối không chạy các lệnh xóa nguy hiểm như \`rm -rf /\` hay \`format\`.
3. Kiểm tra mã thoát (exit code) và tóm tắt kết quả thành công/thất bại rõ ràng cho người dùng.
`, 'utf-8');
    }
  }
}
