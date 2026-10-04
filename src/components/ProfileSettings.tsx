import React, { useRef, useState } from 'react';
import {
  Pencil, Code, Palette, GraduationCap, Briefcase, Megaphone, Target,
  HeartHandshake, Settings as SettingsIcon, Users, Scale, Camera, TrendingUp,
  Baby, Heart, Compass, Home, Package, HardDrive, ImagePlus, Trash2
} from 'lucide-react';
import type { SettingsLocale } from '../appearance.ts';
import { settingsText } from '../settingsLocale.ts';

export interface UserProfile {
  displayName: string;
  username: string;
  avatar: string;
  interests: string[];
}

const PROFILE_STORAGE_KEY = 'ohmyt_profile';

export const INTERESTS: Array<{ key: string; label: string; icon: React.ReactNode }> = [
  { key: 'content', label: 'Sáng tạo nội dung', icon: <Pencil size={14} /> },
  { key: 'dev', label: 'Lập trình & Phát triển', icon: <Code size={14} /> },
  { key: 'design', label: 'Thiết kế & Sáng tạo', icon: <Palette size={14} /> },
  { key: 'study', label: 'Học tập & Nghiên cứu', icon: <GraduationCap size={14} /> },
  { key: 'business', label: 'Kinh doanh & Chiến lược', icon: <Briefcase size={14} /> },
  { key: 'marketing', label: 'Tiếp thị & Quảng bá', icon: <Megaphone size={14} /> },
  { key: 'product', label: 'Sản phẩm & Quản lý', icon: <Target size={14} /> },
  { key: 'sales', label: 'Bán hàng & Chăm sóc khách hàng', icon: <HeartHandshake size={14} /> },
  { key: 'ops', label: 'Vận hành & Quản trị', icon: <SettingsIcon size={14} /> },
  { key: 'hr', label: 'Con người & Nhân sự', icon: <Users size={14} /> },
  { key: 'legal', label: 'Tài chính & Pháp lý', icon: <Scale size={14} /> },
  { key: 'creator', label: 'Nền kinh tế nhà sáng tạo', icon: <Camera size={14} /> },
  { key: 'invest', label: 'Đầu tư & Tài chính', icon: <TrendingUp size={14} /> },
  { key: 'family', label: 'Gia đình & Nuôi dạy con', icon: <Baby size={14} /> },
  { key: 'health', label: 'Sức khỏe & Thói quen', icon: <Heart size={14} /> },
  { key: 'culture', label: 'Sở thích & Văn hóa', icon: <Compass size={14} /> },
  { key: 'life', label: 'Cuộc sống cá nhân', icon: <Home size={14} /> },
  { key: 'other', label: 'Lĩnh vực khác', icon: <Package size={14} /> }
];

const emptyProfile: UserProfile = { displayName: '', username: '', avatar: '', interests: [] };

export function loadProfile(): UserProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return emptyProfile;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName.slice(0, 80) : '',
      username: typeof parsed.username === 'string' ? parsed.username.slice(0, 40) : '',
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar.slice(0, 300_000) : '',
      interests: Array.isArray(parsed.interests) ? parsed.interests.filter(i => typeof i === 'string') : []
    };
  } catch {
    return emptyProfile;
  }
}

function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

export const ProfileSettings: React.FC<{ locale: SettingsLocale }> = ({ locale }) => {
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const t = (key: Parameters<typeof settingsText>[1]) => settingsText(locale, key);

  const save = (next: UserProfile) => {
    setProfile(next);
    setError('');
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setError('Không lưu được ảnh đại diện (bộ nhớ đầy). Hãy chọn ảnh nhỏ hơn.');
    }
  };

  const toggleInterest = (key: string) => {
    const has = profile.interests.includes(key);
    save({
      ...profile,
      interests: has ? profile.interests.filter(i => i !== key) : [...profile.interests, key]
    });
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Vui lòng chọn tệp ảnh.'); return; }
    try {
      const dataUrl = await fileToAvatar(file);
      save({ ...profile, avatar: dataUrl });
    } catch {
      setError('Không đọc được ảnh này.');
    }
  };

  const initial = (profile.displayName || profile.username || '?').trim().slice(0, 1).toUpperCase() || '?';

  return (
    <div className="appearance-cards">
      <section className="appearance-card">
        <header>
          <h2>Tài khoản</h2>
          <span className="appearance-save" role="status"><HardDrive size={12} />{t('Đã lưu trên thiết bị')}</span>
        </header>

        <div className="profile-row">
          <div className="appearance-row-label"><span>Ảnh đại diện</span></div>
          <div className="profile-avatar-wrap">
            <span className="profile-avatar" aria-hidden="true">
              {profile.avatar
                ? <img src={profile.avatar} alt="" />
                : initial}
            </span>
            <span className="profile-avatar-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                aria-label="Chọn ảnh đại diện"
                onChange={event => { void pickAvatar(event.target.files?.[0]); event.target.value = ''; }}
              />
              <button type="button" className="profile-btn" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={14} /> Đổi ảnh
              </button>
              {profile.avatar && (
                <button type="button" className="profile-btn danger" onClick={() => save({ ...profile, avatar: '' })}>
                  <Trash2 size={14} /> Xóa
                </button>
              )}
            </span>
          </div>
        </div>

        <div className="profile-row">
          <div className="appearance-row-label"><span>Họ và tên</span></div>
          <input
            className="profile-input"
            value={profile.displayName}
            maxLength={80}
            placeholder="VD: Hồ Minh Quân"
            aria-label="Họ và tên"
            onChange={event => save({ ...profile, displayName: event.target.value })}
          />
        </div>

        <div className="profile-row">
          <div className="appearance-row-label"><span>Tên người dùng</span></div>
          <input
            className="profile-input"
            value={profile.username}
            maxLength={40}
            placeholder="Nhập tên người dùng"
            aria-label="Tên người dùng"
            onChange={event => save({ ...profile, username: event.target.value.replace(/\s+/g, '') })}
          />
        </div>

        <div className="profile-row profile-row-top">
          <div className="appearance-row-label"><span>Sở thích</span></div>
          <div className="profile-interests" role="group" aria-label="Sở thích">
            {INTERESTS.map(item => {
              const active = profile.interests.includes(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  className="profile-chip"
                  data-active={active}
                  onClick={() => toggleInterest(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="profile-error" role="alert">{error}</p>}
      </section>
    </div>
  );
};
