import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';

export const BUILTIN_SKILLS = new Set(['workspace-analyzer', 'safe-terminal']);

/**
 * Checks if an IPv4 or IPv6 address is private, loopback, link-local, or otherwise prohibited (SSRF prevention).
 */
export function isPrivateIp(ip) {
  if (!ip) return true;
  if (!net.isIP(ip)) return true;

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (Private RFC 1918)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (Private RFC 1918)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private RFC 1918)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata service 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;

    return false;
  }

  // IPv6
  const normalized = ip.toLowerCase();
  // Loopback ::1
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  // Unspecified ::
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.substring(7);
    if (net.isIPv4(v4Part)) return isPrivateIp(v4Part);
  }
  // Unique Local Address fc00::/7 (fc00:: - fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // Link-local unicast fe80::/10 (fe80:: - febf::)
  if (/^fe[89ab]/i.test(normalized)) return true;

  return false;
}

/**
 * Validates a remote URL against SSRF threats.
 */
export async function validateRemoteUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Đường dẫn URL không hợp lệ');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid protocol: Chỉ hỗ trợ giao thức http và https');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Deny localhost and local/internal domain patterns
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.corp') ||
    hostname.endsWith('.lan')
  ) {
    throw new Error('SSRF blocked (private or loopback): Không được phép truy cập tên miền nội bộ');
  }

  // If hostname is IP literal directly
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`SSRF blocked (private or loopback): Không được phép truy cập địa chỉ IP nội bộ (${hostname})`);
    }
  } else {
    // Resolve DNS and check all resolved IP addresses
    let addresses;
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
    } catch (err) {
      throw new Error(`Không thể phân giải tên miền ${hostname}: ${err.message}`);
    }

    if (!addresses || addresses.length === 0) {
      throw new Error(`Tên miền ${hostname} không có địa chỉ IP khả dụng`);
    }

    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        throw new Error(`SSRF blocked (private or loopback): Tên miền ${hostname} phân giải về địa chỉ IP nội bộ không được phép (${record.address})`);
      }
    }
  }

  return parsed;
}

/**
 * Parses and validates GitHub repository inputs (e.g. "owner/repo" or "https://github.com/owner/repo.git").
 */
export function parseGitHubRepo(repoInput) {
  if (!repoInput || typeof repoInput !== 'string') {
    throw new Error('Invalid GitHub repository input: Đường dẫn kho không được để trống');
  }

  let input = repoInput.trim();
  if (input.endsWith('.git')) input = input.slice(0, -4);

  let owner = '';
  let repo = '';
  let branch = 'main';
  let subpath = '';

  if (input.startsWith('http://') || input.startsWith('https://')) {
    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      throw new Error('Invalid GitHub repository URL');
    }
    if (parsed.hostname.toLowerCase() !== 'github.com') {
      throw new Error('Invalid GitHub repository: Chỉ hỗ trợ liên kết github.com');
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error('Invalid GitHub repository: Thiếu thông tin owner/repo');
    }
    owner = parts[0];
    repo = parts[1];
    if (parts[2] === 'tree' && parts.length >= 4) {
      branch = parts[3];
      subpath = parts.slice(4).join('/');
    }
  } else {
    const parts = input.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error('Invalid GitHub repository: Vui lòng nhập dạng owner/repo');
    }
    owner = parts[0];
    repo = parts[1];
  }

  return { owner, repo, branch, subpath };
}

export class SkillsManager {
  constructor(skillsDir = null) {
    this.skillsDir = skillsDir || path.resolve(process.cwd(), 'skills');
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    this.ensureDefaultSkills();
  }

  parseSkillMd(content, skillId = '') {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    const metadata = {};
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
            val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
          } else if (val === 'true') {
            val = true;
          } else if (val === 'false') {
            val = false;
          }
          metadata[key] = val;
        }
      }
    }

    const isBuiltin = BUILTIN_SKILLS.has(skillId) || metadata.builtin === true || metadata.builtin === 'true';
    const enabled = metadata.enabled !== false && metadata.enabled !== 'false';
    const defaultIcon = skillId === 'workspace-analyzer' ? 'Cpu' : skillId === 'safe-terminal' ? 'Terminal' : 'Wrench';

    return {
      name: metadata.name || skillId || 'unnamed-skill',
      description: metadata.description || '',
      version: metadata.version || '1.0.0',
      requiredTools: Array.isArray(metadata.required_tools)
        ? metadata.required_tools
        : Array.isArray(metadata.requiredTools)
        ? metadata.requiredTools
        : [],
      instructions,
      enabled,
      author: metadata.author || (isBuiltin ? 'system' : 'custom'),
      icon: metadata.icon || defaultIcon,
      builtin: isBuiltin
    };
  }

  serializeSkillMd(data) {
    const {
      name,
      description = '',
      version = '1.0.0',
      requiredTools = [],
      instructions = '',
      enabled = true,
      author = 'custom',
      icon = 'Wrench',
      builtin = false
    } = data;

    const toolsFormatted = JSON.stringify(requiredTools);
    const yamlLines = [
      '---',
      `name: ${JSON.stringify(name)}`,
      `description: ${JSON.stringify(description)}`,
      `version: ${JSON.stringify(version)}`,
      `required_tools: ${toolsFormatted}`,
      `author: ${JSON.stringify(author)}`,
      `icon: ${JSON.stringify(icon)}`,
      `builtin: ${builtin ? 'true' : 'false'}`,
      `enabled: ${enabled ? 'true' : 'false'}`,
      '---',
      '',
      instructions.trim(),
      ''
    ];

    return yamlLines.join('\n');
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
            const parsed = this.parseSkillMd(raw, entry.name);
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

    // Sort: built-in skills first, then alphabetical by name
    return skills.sort((a, b) => {
      if (a.builtin && !b.builtin) return -1;
      if (!a.builtin && b.builtin) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  getSkill(id) {
    if (!id || typeof id !== 'string') return null;
    const cleanId = id.trim();
    const skillMdPath = path.join(this.skillsDir, cleanId, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) return null;

    try {
      const raw = fs.readFileSync(skillMdPath, 'utf-8');
      const parsed = this.parseSkillMd(raw, cleanId);
      return {
        id: cleanId,
        path: skillMdPath,
        ...parsed
      };
    } catch {
      return null;
    }
  }

  validateSkillId(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid skill ID: ID kỹ năng không được để trống');
    }
    const cleanId = id.trim().toLowerCase();
    const resolvedPath = path.resolve(this.skillsDir, cleanId);
    if (!resolvedPath.startsWith(path.resolve(this.skillsDir)) || cleanId.includes('/') || cleanId.includes('\\')) {
      throw new Error('Invalid skill ID: ID kỹ năng không hợp lệ (path traversal)');
    }
    if (!/^[a-z0-9][a-z0-9-_]{1,63}$/.test(cleanId)) {
      throw new Error('Invalid skill ID: ID kỹ năng chỉ được chứa chữ cái thường, số, dấu gạch nối và gạch dưới (2-64 ký tự)');
    }
    return cleanId;
  }

  createSkill(data) {
    const cleanId = this.validateSkillId(data.id || data.name);
    const targetDir = path.join(this.skillsDir, cleanId);

    if (fs.existsSync(targetDir)) {
      throw new Error(`Kỹ năng với ID "${cleanId}" đã tồn tại`);
    }

    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error('Tên kỹ năng không được để trống');
    }

    const isBuiltin = BUILTIN_SKILLS.has(cleanId);
    const content = this.serializeSkillMd({
      name: data.name.trim(),
      description: (data.description || '').trim(),
      version: (data.version || '1.0.0').trim(),
      requiredTools: Array.isArray(data.requiredTools) ? data.requiredTools : [],
      instructions: (data.instructions || '').trim(),
      author: data.author || (isBuiltin ? 'system' : 'custom'),
      icon: data.icon || 'Wrench',
      builtin: isBuiltin,
      enabled: data.enabled !== false
    });

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content, 'utf-8');

    return this.getSkill(cleanId);
  }

  updateSkill(id, patch) {
    const cleanId = this.validateSkillId(id);
    const current = this.getSkill(cleanId);
    if (!current) {
      throw new Error(`Không tìm thấy kỹ năng "${cleanId}"`);
    }

    const isBuiltin = current.builtin || BUILTIN_SKILLS.has(cleanId);

    // If built-in, protect identity fields, only allow toggling enabled or updating instructions if permitted
    const updated = {
      ...current,
      ...patch,
      id: cleanId,
      builtin: isBuiltin,
      name: isBuiltin ? current.name : (patch.name !== undefined ? patch.name.trim() : current.name)
    };

    if (patch.enabled !== undefined) {
      updated.enabled = Boolean(patch.enabled);
    }

    const content = this.serializeSkillMd(updated);
    const targetDir = path.join(this.skillsDir, cleanId);
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content, 'utf-8');

    return this.getSkill(cleanId);
  }

  deleteSkill(id) {
    const cleanId = this.validateSkillId(id);
    if (BUILTIN_SKILLS.has(cleanId)) {
      const err = new Error('Cannot delete built-in system skill (Không thể xóa kỹ năng mặc định của hệ thống)');
      err.statusCode = 403;
      throw err;
    }

    const targetDir = path.join(this.skillsDir, cleanId);
    if (!fs.existsSync(targetDir)) {
      const err = new Error(`Không tìm thấy kỹ năng "${cleanId}"`);
      err.statusCode = 404;
      throw err;
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    return true;
  }

  async importFromUrl(urlString) {
    const parsed = await validateRemoteUrl(urlString);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let res;
    try {
      res = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ohmyt-skill-manager/1.0'
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`Lỗi kết nối khi tải kỹ năng từ ${urlString}: ${err.message}`);
    }
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Máy chủ từ xa phản hồi mã lỗi ${res.status} (${res.statusText})`);
    }

    const contentLength = Number(res.headers.get('content-length'));
    if (contentLength && contentLength > 524288) {
      throw new Error('Tệp kỹ năng vượt quá giới hạn dung lượng cho phép (tối đa 512KB)');
    }

    const rawContent = await res.text();
    if (rawContent.length > 524288) {
      throw new Error('Nội dung kỹ năng vượt quá 512KB');
    }

    // Determine candidate ID
    const urlPath = parsed.pathname;
    let candidateId = path.basename(urlPath, path.extname(urlPath)).toLowerCase();
    if (candidateId === 'skill' || candidateId === 'skills' || !candidateId) {
      const segments = urlPath.split('/').filter(Boolean);
      candidateId = segments.length > 1 ? segments[segments.length - 2].toLowerCase() : 'imported-skill';
    }
    candidateId = candidateId.replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'imported-skill';

    // Parse the downloaded markdown
    const parsedSkill = this.parseSkillMd(rawContent, candidateId);

    // Generate safe unique ID
    let finalId = this.validateSkillId(candidateId);
    let counter = 1;
    while (fs.existsSync(path.join(this.skillsDir, finalId))) {
      finalId = `${candidateId}-${counter++}`;
    }

    return this.createSkill({
      id: finalId,
      name: parsedSkill.name || finalId,
      description: parsedSkill.description,
      version: parsedSkill.version,
      requiredTools: parsedSkill.requiredTools,
      instructions: parsedSkill.instructions,
      author: parsedSkill.author || parsed.hostname,
      icon: parsedSkill.icon || 'Globe',
      enabled: true
    });
  }

  async importFromGitHub(repoInput) {
    const { owner, repo, branch, subpath } = parseGitHubRepo(repoInput);

    const candidateId = (subpath ? path.basename(subpath) : repo).toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    const tryFetch = async targetBranch => {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${subpath ? subpath + '/' : ''}SKILL.md`;
      const res = await fetch(rawUrl, {
        headers: { 'User-Agent': 'ohmyt-skill-manager/1.0' }
      });
      if (res.status === 200) {
        return await res.text();
      }
      return null;
    };

    let content = await tryFetch(branch);
    if (!content && branch === 'main') {
      content = await tryFetch('master');
    }

    if (!content) {
      throw new Error(`Không tìm thấy tệp SKILL.md tại kho GitHub ${owner}/${repo} (nhánh ${branch} hoặc master)`);
    }

    const parsedSkill = this.parseSkillMd(content, candidateId);

    let finalId = this.validateSkillId(candidateId || 'github-skill');
    let counter = 1;
    while (fs.existsSync(path.join(this.skillsDir, finalId))) {
      finalId = `${candidateId}-${counter++}`;
    }

    return this.createSkill({
      id: finalId,
      name: parsedSkill.name || finalId,
      description: parsedSkill.description,
      version: parsedSkill.version,
      requiredTools: parsedSkill.requiredTools,
      instructions: parsedSkill.instructions,
      author: owner,
      icon: parsedSkill.icon || 'GitFork',
      enabled: true
    });
  }

  installFromZipBuffer(buffer, originalFilename = 'skill.zip') {
    return this.importFromZip(buffer, originalFilename);
  }

  /**
   * Unpacks a .zip or .skill archive buffer using Node.js built-in zlib without external dependencies.
   */
  importFromZip(buffer, originalFilename = 'skill.zip') {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Dữ liệu tải lên phải là Buffer hợp lệ');
    }

    // Check for ZIP magic signature PK\x03\x04 (0x04034b50)
    if (buffer.length < 30 || buffer.readUInt32LE(0) !== 0x04034b50) {
      // If it's not a zip, check if it's a plain markdown file uploaded as text/buffer
      try {
        const text = buffer.toString('utf-8');
        if (text.includes('---') && (originalFilename.endsWith('.md') || originalFilename.endsWith('.skill'))) {
          const baseName = path.basename(originalFilename, path.extname(originalFilename)).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
          let finalId = this.validateSkillId(baseName || 'uploaded-skill');
          let counter = 1;
          while (fs.existsSync(path.join(this.skillsDir, finalId))) {
            finalId = `${baseName}-${counter++}`;
          }
          const parsed = this.parseSkillMd(text, finalId);
          return this.createSkill({
            id: finalId,
            name: parsed.name || finalId,
            description: parsed.description,
            version: parsed.version,
            requiredTools: parsed.requiredTools,
            instructions: parsed.instructions,
            author: parsed.author || 'custom',
            icon: parsed.icon || 'FileUp',
            enabled: true
          });
        }
      } catch {}
      throw new Error('Tệp không đúng định dạng zip hoặc SKILL.md hợp lệ');
    }

    const files = new Map();
    let offset = 0;

    while (offset + 30 <= buffer.length) {
      const sig = buffer.readUInt32LE(offset);
      if (sig !== 0x04034b50) {
        // Reached end of local file headers or central directory
        break;
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLen = buffer.readUInt16LE(offset + 26);
      const extraFieldLen = buffer.readUInt16LE(offset + 28);

      const headerSize = 30 + fileNameLen + extraFieldLen;
      if (offset + headerSize + compressedSize > buffer.length) {
        throw new Error('Tệp ZIP bị lỗi hoặc bị cắt ngắn');
      }

      const fileName = buffer.toString('utf-8', offset + 30, offset + 30 + fileNameLen);
      const fileDataStart = offset + headerSize;
      const fileDataRaw = buffer.subarray(fileDataStart, fileDataStart + compressedSize);

      // Defend against Zip Slip
      if (!fileName.includes('..') && !fileName.startsWith('/') && !fileName.startsWith('\\')) {
        let decompressed;
        if (compressionMethod === 0) {
          decompressed = fileDataRaw;
        } else if (compressionMethod === 8) {
          try {
            decompressed = zlib.inflateRawSync(fileDataRaw);
          } catch (err) {
            throw new Error(`Không thể giải nén tệp ${fileName} trong zip: ${err.message}`);
          }
        }
        if (decompressed) {
          files.set(fileName.replace(/\\/g, '/'), decompressed);
        }
      }

      offset += headerSize + compressedSize;
    }

    // Locate SKILL.md
    let skillMdKey = null;
    for (const key of files.keys()) {
      const base = path.basename(key).toLowerCase();
      if (base === 'skill.md') {
        skillMdKey = key;
        break;
      }
    }

    if (!skillMdKey) {
      // Search for any .md file
      for (const key of files.keys()) {
        if (key.toLowerCase().endsWith('.md')) {
          skillMdKey = key;
          break;
        }
      }
    }

    if (!skillMdKey) {
      throw new Error('Gói lưu trữ ZIP không chứa tệp SKILL.md');
    }

    const skillMdContent = files.get(skillMdKey).toString('utf-8');
    const folderPrefix = path.dirname(skillMdKey);

    let candidateId = path.basename(originalFilename, path.extname(originalFilename)).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (folderPrefix && folderPrefix !== '.') {
      candidateId = path.basename(folderPrefix).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    }
    candidateId = candidateId || 'imported-zip-skill';

    let finalId = this.validateSkillId(candidateId);
    let counter = 1;
    while (fs.existsSync(path.join(this.skillsDir, finalId))) {
      finalId = `${candidateId}-${counter++}`;
    }

    const targetDir = path.join(this.skillsDir, finalId);
    fs.mkdirSync(targetDir, { recursive: true });

    // Extract companion files in the same directory as SKILL.md
    for (const [filePath, fileBuf] of files.entries()) {
      let relativePath = filePath;
      if (folderPrefix && folderPrefix !== '.') {
        if (filePath.startsWith(folderPrefix + '/')) {
          relativePath = filePath.substring(folderPrefix.length + 1);
        } else {
          continue;
        }
      }
      if (relativePath.endsWith('/')) continue; // Skip directory entries
      const destPath = path.resolve(targetDir, relativePath);
      if (destPath.startsWith(targetDir)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, fileBuf);
      }
    }

    // Ensure SKILL.md is properly normalized in root of targetDir
    const parsed = this.parseSkillMd(skillMdContent, finalId);
    const normalizedContent = this.serializeSkillMd({
      name: parsed.name || finalId,
      description: parsed.description,
      version: parsed.version,
      requiredTools: parsed.requiredTools,
      instructions: parsed.instructions,
      author: parsed.author || 'custom',
      icon: parsed.icon || 'Archive',
      builtin: false,
      enabled: true
    });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), normalizedContent, 'utf-8');

    return this.getSkill(finalId);
  }

  ensureDefaultSkills() {
    // 1. Workspace Analyzer
    const analyzerDir = path.join(this.skillsDir, 'workspace-analyzer');
    if (!fs.existsSync(analyzerDir)) {
      fs.mkdirSync(analyzerDir, { recursive: true });
      fs.writeFileSync(
        path.join(analyzerDir, 'SKILL.md'),
        `---
name: "workspace-analyzer"
description: "Phân tích cấu trúc thư mục, tệp mã nguồn và kiến trúc của dự án hiện tại"
version: "1.0.0"
required_tools: ["fs_list", "fs_read"]
author: "system"
icon: "Cpu"
builtin: true
enabled: true
---

# Quy trình phân tích dự án:
1. Dùng \`fs_list\` tại thư mục gốc để nắm các tệp cấu hình chính (package.json, Cargo.toml, README...).
2. Dùng \`fs_read\` để đọc các tệp cấu hình quan trọng nhằm xác định framework và dependencies.
3. Tổng hợp bức tranh tổng thể ngắn gọn: công nghệ, mục tiêu dự án, cấu trúc thư mục.
`,
        'utf-8'
      );
    }

    // 2. Safe Terminal
    const termDir = path.join(this.skillsDir, 'safe-terminal');
    if (!fs.existsSync(termDir)) {
      fs.mkdirSync(termDir, { recursive: true });
      fs.writeFileSync(
        path.join(termDir, 'SKILL.md'),
        `---
name: "safe-terminal"
description: "Thực thi lệnh kiểm thử, kiểm tra cú pháp và build an toàn"
version: "1.0.0"
required_tools: ["shell_exec"]
author: "system"
icon: "Terminal"
builtin: true
enabled: true
---

# Quy trình chạy lệnh an toàn:
1. Xác định lệnh cần chạy (ví dụ kiểm tra cú pháp, chạy test hoặc build).
2. Tuyệt đối không chạy các lệnh xóa nguy hiểm như \`rm -rf /\` hay \`format\`.
3. Kiểm tra mã thoát (exit code) và tóm tắt kết quả thành công/thất bại rõ ràng cho người dùng.
`,
        'utf-8'
      );
    }
  }
}

export { SkillsManager as SkillManager };
