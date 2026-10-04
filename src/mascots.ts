import mascot0 from './assets/fluffy-mascot.png';
import mascot1 from './assets/mascots/pink-cat.png';
import mascot2 from './assets/mascots/mint-bunny.png';
import mascot3 from './assets/mascots/peach-fox.png';
import mascot4 from './assets/mascots/lavender-bear.png';
import mascot5 from './assets/mascots/lemon-bird.png';
import mascot6 from './assets/mascots/teal-monster.png';
import mascot7 from './assets/mascots/coral-puff.png';
import mascot8 from './assets/mascots/cream-penguin.png';
import mascot9 from './assets/mascots/lilac-sprout.png';
import orca from './assets/mascots/orca.png';
import blueWhale from './assets/mascots/blue-whale.png';
import giraffe from './assets/mascots/giraffe.png';

export const mascots = [
  { id: 'blue-puff', vi: 'Bông xanh', en: 'Blue puff', image: mascot0 },
  { id: 'pink-cat', vi: 'Mèo hồng', en: 'Pink kitten', image: mascot1 },
  { id: 'mint-bunny', vi: 'Thỏ bạc hà', en: 'Mint bunny', image: mascot2 },
  { id: 'peach-fox', vi: 'Cáo đào', en: 'Peach fox', image: mascot3 },
  { id: 'lavender-bear', vi: 'Gấu tím', en: 'Lavender bear', image: mascot4 },
  { id: 'lemon-bird', vi: 'Chim vàng', en: 'Lemon bird', image: mascot5 },
  { id: 'teal-monster', vi: 'Bé ngọc lam', en: 'Teal monster', image: mascot6 },
  { id: 'coral-puff', vi: 'Bông san hô', en: 'Coral puff', image: mascot7 },
  { id: 'cream-penguin', vi: 'Cánh cụt kem', en: 'Cream penguin', image: mascot8 },
  { id: 'lilac-sprout', vi: 'Mầm tử đinh hương', en: 'Lilac sprout', image: mascot9 },
  { id: 'orca', vi: 'Cá voi đen', en: 'Orca', image: orca },
  { id: 'blue-whale', vi: 'Cá voi xanh', en: 'Blue whale', image: blueWhale },
  { id: 'giraffe', vi: 'Hươu cao cổ', en: 'Giraffe', image: giraffe },
] as const;
