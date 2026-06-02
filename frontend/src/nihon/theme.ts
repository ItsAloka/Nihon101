// theme.ts — palettes, font pairings, tint helpers

export const PALETTES: Record<string, any> = {
  hakuji: {
    label: 'Hakuji',
    label_jp: '白磁',
    bg:        '#FBFAF7',
    surface:   '#FFFFFF',
    surface2:  '#F2F0EB',
    ink:       '#1A1817',
    inkSoft:   '#5C544C',
    inkFaint:  '#A39F98',
    line:      '#ECE8E0',
    accent:    '#F58FA3',
    accentDeep:'#E54E70',
    stamp:     '#D63752',
    tint:      '#FCE5EA',
    gradient:  true,
  },
  sakura: {
    label: 'Sakura',
    label_jp: '桜',
    bg:        '#FDF5EE',
    surface:   '#FFFAF3',
    surface2:  '#F7EADF',
    ink:       '#1E1813',
    inkSoft:   '#6E5F50',
    inkFaint:  '#B6A593',
    line:      '#EEDFCE',
    accent:    '#E8A0AE',   // milky pink
    accentDeep:'#C7626F',
    stamp:     '#C1453D',   // hanko red used sparingly
    tint:      '#FBE6E5',
  },
  yuzu: {
    label: 'Yuzu',
    label_jp: '柚子',
    bg:        '#FAF6E1',
    surface:   '#FDFBED',
    surface2:  '#F3EBC4',
    ink:       '#1F1C0E',
    inkSoft:   '#6F6748',
    inkFaint:  '#B4AB82',
    line:      '#EBE3BA',
    accent:    '#D4D77C',   // yuzu-sage
    accentDeep:'#9AA04A',
    stamp:     '#D67E2E',
    tint:      '#F3F2D2',
  },
  aizome: {
    label: 'Aizome',
    label_jp: '藍',
    bg:        '#EEF2F6',
    surface:   '#F7FAFC',
    surface2:  '#DDE6EE',
    ink:       '#10161D',
    inkSoft:   '#54657A',
    inkFaint:  '#9AAEC2',
    line:      '#D5DEE7',
    accent:    '#A2B9D2',   // milky blue
    accentDeep:'#4C6E94',
    stamp:     '#234567',
    tint:      '#D7E2EC',
  },
  matcha: {
    label: 'Matcha',
    label_jp: '抹茶',
    bg:        '#F2F1E1',
    surface:   '#F8F8EE',
    surface2:  '#E1E2C7',
    ink:       '#1A1D12',
    inkSoft:   '#5F6446',
    inkFaint:  '#A8AC85',
    line:      '#DCDDC0',
    accent:    '#B7C58B',   // milky matcha
    accentDeep:'#76854A',
    stamp:     '#A85A4A',
    tint:      '#DDE0BD',
  },
};

export const FONT_PAIRINGS: Record<string, any> = {
  shippori: {
    label: 'Shippori (default)',
    display: '"Shippori Mincho B1", "Shippori Mincho", "Times New Roman", serif',
    body:    '"Inter", "Noto Sans JP", system-ui, sans-serif',
    weight: { display: 600, body: 400 },
  },
  newsreader: {
    label: 'Newsreader',
    display: '"Newsreader", "Shippori Mincho B1", serif',
    body:    '"Inter", "Noto Sans JP", system-ui, sans-serif',
    weight: { display: 500, body: 400 },
  },
  zen: {
    label: 'Zen Old Mincho',
    display: '"Zen Old Mincho", "Shippori Mincho B1", serif',
    body:    '"Zen Kaku Gothic New", "Inter", system-ui, sans-serif',
    weight: { display: 600, body: 400 },
  },
};

// Tint mapping for category/author chips. Pulls from active palette.
export function tintBg(name: string, p: any) {
  const map: Record<string, string> = {
    rose:   '#FBC5CC',
    amber:  '#FFD27A',
    blue:   '#A6C7F0',
    lilac:  '#D6B8F0',
    peach:  '#FBB58B',
    sage:   '#B6D58E',
    clay:   '#E89A7E',
    mauve:  '#D89DBE',
    sky:    '#9BC2EE',
    cream:  '#FFE6B5',
  };
  return map[name] || p.accent;
}

// Vivid gradient stops per tint — used by Photo placeholders
export function tintGradient(name: string) {
  const grads: Record<string, [string, string]> = {
    rose:   ['#FCCFD6', '#F58FA3'],
    amber:  ['#FFE3A2', '#FFAA4F'],
    blue:   ['#C4DCF6', '#7FA9DE'],
    lilac:  ['#E2CCF2', '#B89BD9'],
    peach:  ['#FFCFB0', '#F08D5C'],
    sage:   ['#D4E4B0', '#9CB66D'],
    clay:   ['#F2B59C', '#D17A5A'],
    mauve:  ['#E5BBD2', '#BC7FA0'],
    sky:    ['#C0DAF0', '#7FAFDC'],
    cream:  ['#FFEFC8', '#FFCB7A'],
  };
  return grads[name] || ['#FCE5EA', '#F58FA3'];
}

// Subject glyph per hue — large faded kanji as the photo's 'subject'
export function subjectGlyph(hue: string) {
  const map: Record<string, string> = {
    cream:  '茶', amber: '麺', peach: '弁',
    blue:   '雪', sky:   '駅', lilac: '燈',
    rose:   '桜', mauve: '香',
    sage:   '葉', clay:  '器',
  };
  return map[hue] || '日';
}
