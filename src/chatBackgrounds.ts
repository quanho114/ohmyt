import type { Appearance } from './appearance.ts';

export const chatBackgrounds = [
  { id: 'aurora', vi: 'Cực quang', en: 'Aurora', paint: 'radial-gradient(ellipse at 20% 20%, #65e6ca, transparent 55%), radial-gradient(ellipse at 80% 30%, #a798ef, transparent 60%), linear-gradient(135deg, #12384d, #7489c9)' },
  { id: 'sunset', vi: 'Hoàng hôn', en: 'Sunset', paint: 'radial-gradient(circle at 70% 35%, #ffe7a0, transparent 30%), linear-gradient(160deg, #8f83c9, #f3a6ab 55%, #ffd2a1)' },
  { id: 'ocean', vi: 'Đại dương', en: 'Ocean', paint: 'radial-gradient(ellipse at 15% 80%, #167e9d, transparent 65%), linear-gradient(135deg, #c6f2ed, #58bbc9, #36759b)' },
  { id: 'forest', vi: 'Rừng xanh', en: 'Forest', paint: 'radial-gradient(ellipse at 75% 15%, #d3e8a8, transparent 50%), linear-gradient(140deg, #a8c5a3, #418178, #234f52)' },
  { id: 'lavender', vi: 'Oải hương', en: 'Lavender', paint: 'radial-gradient(ellipse at 20% 25%, #f9dcf3, transparent 50%), linear-gradient(135deg, #e7d9ff, #b4a0e3, #8e9bd3)' },
  { id: 'sand', vi: 'Cát ấm', en: 'Warm sand', paint: 'radial-gradient(ellipse at 80% 20%, #fff5d8, transparent 60%), linear-gradient(155deg, #ead4b9, #c8a58b, #9f8278)' },
  { id: 'rose', vi: 'Hồng sương', en: 'Rose mist', paint: 'radial-gradient(ellipse at 20% 80%, #e7add3, transparent 55%), linear-gradient(125deg, #fff0e9, #efc2ce, #d09fbc)' },
  { id: 'midnight', vi: 'Đêm sao', en: 'Midnight', paint: 'radial-gradient(ellipse at 75% 25%, #736aaf, transparent 50%), linear-gradient(150deg, #182b4a, #394567, #65708b)' },
  { id: 'mint', vi: 'Bạc hà', en: 'Mint', paint: 'linear-gradient(135deg, #e1f5df, #74cbb2)' },
  { id: 'peach', vi: 'Đào', en: 'Peach', paint: 'linear-gradient(135deg, #ffe7d5, #efa590)' },
  { id: 'sky', vi: 'Trời xanh', en: 'Sky', paint: 'linear-gradient(135deg, #dff3ff, #85bde7)' },
  { id: 'lilac', vi: 'Tử đinh hương', en: 'Lilac', paint: 'linear-gradient(135deg, #eedfff, #c69cda)' },
  { id: 'lemon', vi: 'Chanh vàng', en: 'Lemon', paint: 'linear-gradient(135deg, #fff9cf, #e5d58d)' },
  { id: 'coral', vi: 'San hô', en: 'Coral', paint: 'linear-gradient(135deg, #ffd9cf, #e88c92)' },
  { id: 'sage', vi: 'Xanh xô thơm', en: 'Sage', paint: 'linear-gradient(135deg, #e2e9d5, #94ad93)' },
  { id: 'ice', vi: 'Băng lam', en: 'Ice blue', paint: 'linear-gradient(135deg, #ebfaff, #a8d9e3)' },
  { id: 'blush', vi: 'Hồng phấn', en: 'Blush', paint: 'linear-gradient(135deg, #ffe7ed, #e9abc2)' },
  { id: 'apricot', vi: 'Mơ vàng', en: 'Apricot', paint: 'linear-gradient(135deg, #fff0cd, #eab77c)' },
  { id: 'teal', vi: 'Ngọc lam', en: 'Teal', paint: 'linear-gradient(135deg, #bfeae6, #4d9e9e)' },
  { id: 'periwinkle', vi: 'Xanh tím', en: 'Periwinkle', paint: 'linear-gradient(135deg, #e1e5ff, #98a4d7)' },
  { id: 'cherry', vi: 'Anh đào', en: 'Cherry', paint: 'linear-gradient(135deg, #f8ccd9, #b76d8c)' },
  { id: 'coffee', vi: 'Cà phê', en: 'Coffee', paint: 'linear-gradient(135deg, #dfc9b6, #97786c)' },
  { id: 'silver', vi: 'Bạc', en: 'Silver', paint: 'linear-gradient(135deg, #eff1f4, #a6afbe)' },
  { id: 'olive', vi: 'Ô liu', en: 'Olive', paint: 'linear-gradient(135deg, #e7e8c2, #a5a873)' },
  { id: 'indigo', vi: 'Chàm', en: 'Indigo', paint: 'linear-gradient(135deg, #a9b6ea, #4c568c)' },
  { id: 'plum', vi: 'Mận tím', en: 'Plum', paint: 'linear-gradient(135deg, #dec0dc, #8c668e)' },
  { id: 'terracotta', vi: 'Đất nung', en: 'Terracotta', paint: 'linear-gradient(135deg, #ebc7b1, #b77e69)' },
  { id: 'jade', vi: 'Ngọc bích', en: 'Jade', paint: 'linear-gradient(135deg, #ccecdf, #67a58e)' },
] as const;

export function chatBackgroundPaint(appearance: Appearance): string | undefined {
  if (appearance.chatBackground === 'custom') return appearance.chatBackgroundImage ? `url("${appearance.chatBackgroundImage}")` : undefined;
  return chatBackgrounds.find(item => item.id === appearance.chatBackground)?.paint;
}
