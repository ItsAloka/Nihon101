// data.js — sample content for the Nihon101 wireframe (enui).
// English-only static mirror of the live frontend's data shapes. Everything the
// wireframe renders (home, explore, trending, writers, for-you, saved, profile,
// reader) is built from these three arrays by ui.js. No backend, no Japanese.

// ------- Category taxonomy (kanji + palette tint, same as the real app) -------
const CATEGORIES = [
  { id: 'culture',    label: 'Culture',    kanji: '文', tint: 'rose'  },
  { id: 'food',       label: 'Food',       kanji: '食', tint: 'amber' },
  { id: 'travel',     label: 'Travel',     kanji: '旅', tint: 'blue'  },
  { id: 'language',   label: 'Language',   kanji: '言', tint: 'lilac' },
  { id: 'animation',  label: 'Animation',  kanji: '画', tint: 'peach' },
  { id: 'philosophy', label: 'Philosophy', kanji: '哲', tint: 'sage'  },
  { id: 'history',    label: 'History',    kanji: '史', tint: 'clay'  },
  { id: 'fashion',    label: 'Fashion',    kanji: '装', tint: 'mauve' },
  { id: 'news',       label: 'Today',      kanji: '新', tint: 'sky'   },
];

// ------- Authors -------
const AUTHORS = [
  { handle: 'yuki-shirakawa', displayName: 'Yuki Shirakawa', role: 'Writer',      location: 'Kyoto',     bio: 'Slow essays on language, ritual, and the quiet parts of Japanese culture.', joinedAt: ts('2024-03-11'), followers: 4820, following: 92 },
  { handle: 'kenta-hori',     displayName: 'Kenta Hori',     role: 'Food writer',  location: 'Osaka',     bio: 'I eat my way through Japan and write it down. Ramen is a serious subject.',  joinedAt: ts('2024-05-02'), followers: 6310, following: 140 },
  { handle: 'mari-aoki',      displayName: 'Mari Aoki',      role: 'Travel',       location: 'Kanazawa',  bio: 'Trains, hot springs, and the towns most maps forget.',                       joinedAt: ts('2024-01-19'), followers: 3905, following: 77 },
  { handle: 'ren-takeda',     displayName: 'Ren Takeda',     role: 'Animation',    location: 'Tokyo',     bio: 'Frames, history, and why animation in Japan grew up the way it did.',         joinedAt: ts('2024-07-21'), followers: 5120, following: 58 },
  { handle: 'kage-loom',      displayName: 'Kage Loom',      role: 'Editor',       location: 'Sapporo',   bio: 'Founding editor of nihon101. I read everything before it goes out.',          joinedAt: ts('2023-11-01'), followers: 8990, following: 210 },
  { handle: 'aoi-nakamura',   displayName: 'Aoi Nakamura',   role: 'Historian',    location: 'Nara',      bio: 'Edo streets, Meiji change, and the long memory of cities.',                  joinedAt: ts('2024-02-08'), followers: 2740, following: 64 },
  { handle: 'sora-mizuki',    displayName: 'Sora Mizuki',    role: 'Fashion',      location: 'Tokyo',     bio: 'Indigo, denim, and the craft behind what people wear.',                      joinedAt: ts('2024-06-15'), followers: 3110, following: 88 },
  { handle: 'haru-kobayashi', displayName: 'Haru Kobayashi', role: 'Philosophy',   location: 'Kamakura',  bio: 'Wabi-sabi, ma, and ideas you can live inside.',                              joinedAt: ts('2024-04-27'), followers: 2280, following: 51 },
];

// ------- Posts -------
// cover:null → renders the gradient + faded subject-kanji placeholder.
const POSTS = [
  p('komorebi-the-word-for-light-through-leaves', 'Komorebi: the word for light falling through leaves', 'There is a single Japanese word for the dappled light that filters through trees — and learning it changes how you walk through a forest.', 'language', 'yuki-shirakawa', 7, 1840, 96, '2026-06-15', ['komorebi','words','nature'], 240),
  p('the-quiet-ritual-of-the-kissaten', 'The quiet ritual of the kissaten', 'Before the third-wave café, there was the kissaten — dim, smoky, unhurried. A love letter to Japan’s old coffee houses.', 'culture', 'yuki-shirakawa', 9, 2210, 152, '2026-06-14', ['coffee','showa','slow'], 232),
  p('a-bowl-of-tonkotsu-in-the-rain', 'A bowl of tonkotsu in the rain', 'Hakata ramen is at its best when the weather is at its worst. Notes from a counter seat in Fukuoka.', 'food', 'kenta-hori', 6, 3120, 201, '2026-06-15', ['ramen','fukuoka','tonkotsu'], 261),
  p('konbini-egg-sandwich-appreciation', 'In praise of the konbini egg sandwich', 'Soft white bread, impossibly creamy egg. Why the convenience-store sandwich is a small masterpiece.', 'food', 'kenta-hori', 4, 2680, 174, '2026-06-12', ['konbini','sandwich','cheap-eats'], 198),
  p('the-night-train-to-the-snow-country', 'The night train to the snow country', 'Riding north as the cities thin out and the world turns white. Kawabata had a point.', 'travel', 'mari-aoki', 8, 1990, 88, '2026-06-13', ['trains','winter','tohoku'], 215),
  p('kanazawa-in-the-off-season', 'Kanazawa in the off-season', 'No crowds, gold leaf, and a garden that may be the most beautiful in Japan. Go when no one else does.', 'travel', 'mari-aoki', 7, 1520, 63, '2026-06-10', ['kanazawa','gardens','quiet'], 176),
  p('how-anime-grew-up', 'How anime grew up', 'From wartime shorts to global prestige — a short history of how Japanese animation became an art form.', 'animation', 'ren-takeda', 11, 4010, 288, '2026-06-14', ['anime','history','craft'], 270),
  p('the-frame-rate-of-feeling', 'The frame rate of feeling', 'Why Japanese animators draw “on threes” — and how holding a frame can hold an emotion.', 'animation', 'ren-takeda', 6, 2330, 119, '2026-06-09', ['anime','technique','timing'], 188),
  p('wabi-sabi-is-not-what-you-think', 'Wabi-sabi is not what you think', 'It is not shabby chic. It is a whole way of seeing impermanence as beautiful. Let’s clear it up.', 'philosophy', 'haru-kobayashi', 8, 2870, 166, '2026-06-13', ['wabi-sabi','aesthetics','zen'], 224),
  p('ma-the-art-of-negative-space', 'Ma: the art of negative space', 'The pause between notes, the gap between buildings, the silence in a sentence. Japan’s most important nothing.', 'philosophy', 'haru-kobayashi', 7, 1760, 94, '2026-06-08', ['ma','space','design'], 170),
  p('edo-the-city-that-taught-itself-to-recycle', 'Edo: the city that taught itself to recycle', 'A million people, almost no waste. How pre-modern Tokyo ran one of history’s great circular economies.', 'history', 'aoi-nakamura', 10, 2540, 138, '2026-06-12', ['edo','tokyo','sustainability'], 209),
  p('the-meiji-rush', 'The Meiji rush', 'In a single generation Japan rebuilt itself. The cost, the speed, and what got left behind.', 'history', 'aoi-nakamura', 9, 1680, 71, '2026-06-07', ['meiji','modernization','change'], 158),
  p('indigo-the-blue-that-built-a-country', 'Indigo: the blue that built a country', 'Japan blue, ai-zome, the smell of a dye vat at dawn. Inside the craft behind the color.', 'fashion', 'sora-mizuki', 8, 2120, 110, '2026-06-11', ['indigo','denim','craft'], 192),
  p('okayama-denim-pilgrimage', 'An Okayama denim pilgrimage', 'The small town that makes the world’s best jeans, one selvedge loom at a time.', 'fashion', 'sora-mizuki', 6, 1430, 58, '2026-06-06', ['denim','okayama','selvedge'], 142),
  p('what-the-cherry-blossoms-are-really-saying', 'What the cherry blossoms are really saying', 'Hanami is not about flowers. It is a yearly lesson in letting go, dressed up as a party.', 'culture', 'kage-loom', 6, 3450, 240, '2026-06-15', ['sakura','hanami','spring'], 268),
  p('the-grammar-of-politeness', 'The grammar of politeness', 'Keigo can feel like a maze. Here is the map: why Japanese builds respect into the verbs themselves.', 'language', 'yuki-shirakawa', 9, 1980, 102, '2026-06-11', ['keigo','grammar','respect'], 186),
  p('a-week-of-bento', 'A week of bento', 'Five lunchboxes, five small acts of care. What the bento says about Japanese home life.', 'food', 'kenta-hori', 5, 1620, 79, '2026-06-08', ['bento','home','cooking'], 150),
  p('the-last-analog-station', 'The last analog station', 'A rural stop with a hand-written timetable and a stationmaster cat. Slowness as a feature.', 'travel', 'mari-aoki', 6, 1290, 66, '2026-06-05', ['trains','rural','cats'], 138),
  p('studio-light-and-shadow', 'Studio light and shadow', 'How a handful of studios shaped the look of an entire medium — and what they fought over.', 'animation', 'ren-takeda', 8, 1870, 84, '2026-06-04', ['studios','anime','business'], 144),
  p('today-the-rainy-season-begins', 'Today: the rainy season begins', 'Tsuyu has arrived. Hydrangeas, humidity, and the particular pleasure of staying in.', 'news', 'kage-loom', 3, 980, 41, '2026-06-16', ['tsuyu','weather','seasons'], 300),
];

// ------- helpers used above -------
function ts(d) { return new Date(d + 'T09:00:00').getTime(); }
function p(slug, title, excerpt, categoryId, authorHandle, readMins, likes, comments, date, tags, trendScore) {
  return {
    slug, titleEn: title, excerptEn: excerpt,
    categoryId, authorHandle, readMins, likes, comments,
    publishedAt: ts(date), tags, trendScore,
    cover: null, coverLabel: 'unsplash',
    bodyEn: [
      excerpt,
      'This is wireframe placeholder copy standing in for the full article body. The real reader renders stored bilingual prose; here we only need enough text to show the shape of the page — the measure of the column, the rhythm of paragraphs, and where the byline and engagement controls sit.',
      'Japan rewards slow attention. A thing looked at long enough stops being a thing and becomes a relationship — with a season, a street, a way of doing the small parts of a day. That is the register this magazine writes in.',
      'Scroll on. The point of the wireframe is not the words but the frame: how a story feels to read on nihon101 before a single real sentence is written.',
    ],
  };
}

window.NIHON_DATA = { CATEGORIES, AUTHORS, POSTS };
