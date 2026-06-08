/* NOT BAGEL — seed / placeholder content.
 *
 * This is the single source of truth for the frontend until the backend
 * (Cloudflare Worker + D1) is wired up. The shapes here intentionally mirror
 * what the API will eventually return so the swap is a drop-in: replace the
 * arrays below with `await postApi.list()` etc. and keep the components.
 *
 * Portability note (see stack.txt): real IDs will become `<prefix>_<nanoid21>`.
 * The human-readable slugs here ("frieren-grief") double as the post slug.
 */

export interface Category {
  id: string;
  label: string;
  /** CSS custom-property name for this category's hue, e.g. "--c-anime". */
  var: string;
}

export interface Author {
  id: string;
  name: string;
  handle: string;
  color: string;
  bio: string;
  followers: string;
}

export type Block =
  | { t: 'p'; v: string }
  | { t: 'h2'; v: string }
  | { t: 'h3'; v: string }
  | { t: 'quote'; v: string };

export interface Verdict {
  score: number;
  label: string;
  text: string;
}

export interface Post {
  id: string;
  cat: string;
  author: string;
  date: string;
  read: string;
  title: string;
  excerpt: string;
  /** Cover gradient key into COV (falls back to category, then anime). */
  cov: string;
  /** Real uploaded cover image (url / data uri). Wins over the gradient. */
  coverImg?: string | null;
  /** Markdown body source for runtime posts (article renders this when set). */
  md?: string;
  score: number | null;
  kind: string;
  likes: number;
  saves: number;
  comments: number;
  tags: string[];
  featured?: boolean;
  body: Block[];
  verdict?: Verdict;
  /** Hydrated below from `author` / `cat`. */
  authorObj: Author;
  catObj: Category;
}

export interface Comment {
  author: string;
  color: string;
  time: string;
  text: string;
  likes: number;
}

export const CATEGORIES: Category[] = [
  { id: 'anime', label: 'Anime', var: '--c-anime' },
  { id: 'manga', label: 'Manga', var: '--c-manga' },
  { id: 'manhwa', label: 'Manhwa', var: '--c-manhwa' },
  { id: 'manhua', label: 'Manhua', var: '--c-manhua' },
  { id: 'novel', label: 'Light Novels', var: '--c-novel' },
  { id: 'games', label: 'Games', var: '--c-games' },
];

export const AUTHORS: Record<string, Author> = {
  rin: { id: 'rin', name: 'Rin Akiyama', handle: '@rinwatches', color: '#EC7E97', bio: 'Seasonal anime obsessive. I cry at episode 9, every time.', followers: '12.4k' },
  kai: { id: 'kai', name: 'Kai Moreno', handle: '@panelpilot', color: '#4FA3B3', bio: 'Manga & manhwa long-reads. Webtoon scroll-thumb of steel.', followers: '8.1k' },
  sora: { id: 'sora', name: 'Sora Tan', handle: '@soranovels', color: '#A98AD8', bio: 'Light novel translator turned reviewer. Footnotes are art.', followers: '5.6k' },
  devon: { id: 'devon', name: 'Devon Park', handle: '@devonplays', color: '#E08A6E', bio: 'JRPGs, gacha, and the occasional 200-hour side quest.', followers: '19.2k' },
  mei: { id: 'mei', name: 'Mei Lan', handle: '@meireads', color: '#DB9A55', bio: 'Cultivation manhua & xianxia. 3000 chapters deep, no regrets.', followers: '7.3k' },
};

/** Cover gradient color pairs [from, to]. */
export const COV: Record<string, [string, string]> = {
  anime: ['#F49CB0', '#E26283'],
  manga: ['#6FB9C7', '#3C8A99'],
  manhwa: ['#BBA0E6', '#8E6FC6'],
  manhua: ['#E6B475', '#C98736'],
  novel: ['#86C2A2', '#4E9476'],
  games: ['#EFA487', '#D5704F'],
  dawn: ['#F4A9A0', '#C77E97'],
  night: ['#7E8FD0', '#4A5699'],
};

type RawPost = Omit<Post, 'authorObj' | 'catObj'>;

const RAW_POSTS: RawPost[] = [
  {
    id: 'frieren-grief',
    cat: 'anime', author: 'rin', date: 'May 28, 2026', read: '8 min',
    title: 'Frieren and the Quiet Grammar of Grief',
    excerpt: "An elf mage outlives everyone she loves. The genius of Frieren isn't the magic — it's how it makes a thousand years feel like a missed goodbye.",
    cov: 'dawn', score: 9.4, kind: 'Review', likes: 2480, saves: 612, comments: 84,
    tags: ['Frieren', 'Fantasy', 'Seasonal', 'Madhouse'],
    featured: true,
    body: [
      { t: 'p', v: "There's a specific kind of sadness that only arrives in hindsight — the realization that an ordinary afternoon was, in fact, the last one. <strong>Frieren: Beyond Journey's End</strong> builds its entire emotional architecture around that feeling, and it does so with a patience almost no other show on air would dare attempt." },
      { t: 'p', v: "We open after the adventure is over. The demon king is dead. The party has disbanded. And our protagonist, an elf who measures time in centuries, simply... continues. It's the inverse of every shonen you've seen." },
      { t: 'h2', v: 'Time as the real antagonist' },
      { t: 'p', v: "Frieren never raises its voice. The conflict isn't a villain — it's the gap between how Frieren experiences time and how everyone around her does. To her, ten years is a coffee break. To Himmel, it was a life." },
      { t: 'quote', v: "\"Why didn't I try to get to know him better?\"" },
      { t: 'p', v: 'That single line, delivered at a funeral in the first episode, is the thesis of the entire series. The show spends the next twenty-some episodes answering it — not with a plot, but with a pilgrimage.' },
      { t: 'h2', v: 'Madhouse at the top of its game' },
      { t: 'p', v: 'Visually, this is restraint as a flex. Backgrounds breathe. Combat, when it finally comes, lands harder precisely because the show withheld it for so long. The sound design lets silence do the heavy lifting.' },
      { t: 'p', v: "If you've been burned by hype before, I understand the hesitation. But <a href='#'>Frieren</a> earns every tear it asks for. It is, simply, the best thing I've watched this decade." },
    ],
    verdict: { score: 9.4, label: 'Masterpiece', text: 'A meditation on memory disguised as a fantasy anime. Slow by design, devastating by execution. Watch it twice.' },
  },
  {
    id: 'solo-leveling-spectacle',
    cat: 'manhwa', author: 'kai', date: 'May 26, 2026', read: '6 min',
    title: 'Solo Leveling and the Art of the Power Fantasy Done Right',
    excerpt: "Most power fantasies collapse under their own weight. Here's how the manhwa kept its glow-up satisfying for 179 chapters without ever feeling cheap.",
    cov: 'manhwa', score: 8.7, kind: 'Review', likes: 1920, saves: 488, comments: 61,
    tags: ['Solo Leveling', 'Webtoon', 'Action', 'Dungeon'],
    featured: true,
    body: [
      { t: 'p', v: 'The power fantasy is the most maligned genre in fiction, and usually for good reason. <strong>Solo Leveling</strong> is the exception that proves the rule — a story so confident in its own escalation that it turns numbers-going-up into genuine spectacle.' },
      { t: 'h2', v: 'Art that hits like a freight train' },
      { t: 'p', v: "DUBU's linework does something most action comics only dream of: it makes you feel the weight of an impact through static panels. The shadow army splash pages remain some of the most screenshotted in webtoon history." },
      { t: 'p', v: 'Is it deep? Not particularly. But it never pretends to be. It promises a thrilling ride and delivers, panel after vertical-scroll panel.' },
    ],
    verdict: { score: 8.7, label: 'Excellent', text: "The gold standard for action manhwa. Pure adrenaline with art to match. Don't overthink it — just scroll." },
  },
  {
    id: 'chainsaw-man-part2',
    cat: 'manga', author: 'kai', date: 'May 25, 2026', read: '7 min',
    title: "Chainsaw Man Part 2 Is a Different Beast — That's the Point",
    excerpt: "Fujimoto traded chaos for melancholy and a lot of readers are confused. I think it's the boldest move in modern shonen.",
    cov: 'manga', score: 8.9, kind: 'Editorial', likes: 1640, saves: 401, comments: 73,
    tags: ['Chainsaw Man', 'Fujimoto', 'Shonen Jump'],
    body: [
      { t: 'p', v: "Tatsuki Fujimoto has never been interested in giving readers what they want. <strong>Chainsaw Man</strong>'s second part is a coming-of-age story wearing the skin of a battle manga, and the tonal whiplash is entirely intentional." },
      { t: 'p', v: 'Asa Mitaka is not Denji. The story knows this and uses it as a scalpel.' },
      { t: 'h2', v: 'Awkwardness as horror' },
      { t: 'p', v: "The most unsettling panels in Part 2 aren't the devils — they're the school hallways. Fujimoto draws teenage social anxiety with the same dread he reserves for body horror." },
    ],
    verdict: { score: 8.9, label: 'Excellent', text: "Divisive by design. If you wanted more of Part 1, you'll be frustrated. If you trust Fujimoto, you'll be rewarded." },
  },
  {
    id: 'honkai-star-rail-3',
    cat: 'games', author: 'devon', date: 'May 24, 2026', read: '9 min',
    title: "Honkai: Star Rail's Penacony Arc Set a New Bar for Gacha Storytelling",
    excerpt: 'A dream-world murder mystery with the production values of a console RPG. HoYo proved a free-to-play game can out-write most of its full-price peers.',
    cov: 'games', score: 9.1, kind: 'Feature', likes: 3120, saves: 902, comments: 128,
    tags: ['Honkai Star Rail', 'HoYoverse', 'Gacha', 'JRPG'],
    featured: true,
    body: [
      { t: 'p', v: "Let's get the skepticism out of the way: yes, it's a gacha game, and yes, the monetization is real. But to dismiss <strong>Honkai: Star Rail</strong> on those grounds is to miss one of the most ambitious story arcs in the medium right now." },
      { t: 'h2', v: 'Penacony, the dream hotel' },
      { t: 'p', v: 'The Penacony arc is structured like a locked-room mystery stretched across dozens of hours. Every character has a motive. Every dream has rules. And the soundtrack — a jazz-noir fusion — does an enormous amount of narrative lifting.' },
    ],
    verdict: { score: 9.1, label: 'Outstanding', text: 'Free-to-play with the soul of a premium RPG. The story alone justifies the install. Just set a wallet limit.' },
  },
  {
    id: 'omniscient-reader',
    cat: 'novel', author: 'sora', date: 'May 22, 2026', read: '10 min',
    title: "Omniscient Reader's Viewpoint Is the Best Argument for Web Novels as Literature",
    excerpt: "A reader gets trapped inside the apocalyptic novel he's the only person to have finished. It's meta-fiction with genuine emotional stakes.",
    cov: 'novel', score: 9.0, kind: 'Review', likes: 1410, saves: 522, comments: 47,
    tags: ['ORV', 'Web Novel', 'Apocalypse', 'Meta'],
    body: [
      { t: 'p', v: "<strong>Omniscient Reader's Viewpoint</strong> asks a deceptively simple question: what if the story you loved became real, and you were the only one who knew how it ends?" },
      { t: 'h2', v: 'Kim Dokja, the reader-protagonist' },
      { t: 'p', v: "Our hero's superpower is, essentially, having read the book. It sounds gimmicky until you realize the novel is constantly rewriting itself around his choices, stripping away his advantage chapter by chapter." },
    ],
    verdict: { score: 9.0, label: 'Outstanding', text: 'Dense, emotional, and structurally brilliant. The 551-chapter commitment is real, but so is the payoff.' },
  },
  {
    id: 'spring-2026-roundup',
    cat: 'anime', author: 'rin', date: 'May 20, 2026', read: '12 min',
    title: 'Spring 2026 Anime: The 7 Shows Actually Worth Your Time',
    excerpt: "Forty-something premieres, dozens of hours, one very tired reviewer. Here's the cream of the season, ranked and sorted by exactly who should watch them.",
    cov: 'anime', score: null, kind: 'List', likes: 2210, saves: 740, comments: 96,
    tags: ['Spring 2026', 'Seasonal', 'Roundup'],
    body: [
      { t: 'p', v: "Every season I watch the first three episodes of nearly everything so you don't have to. This spring was unusually stacked. Here's what survived the cull." },
      { t: 'h2', v: '1. The obvious masterpiece' },
      { t: 'p', v: "You already know. It's good. Watch it." },
    ],
  },
  {
    id: 'lookism-comeback',
    cat: 'manhwa', author: 'kai', date: 'May 18, 2026', read: '5 min',
    title: "Why 'Lookism' Still Matters 500 Chapters In",
    excerpt: 'A webtoon about a kid with two bodies became one of the longest-running social dramas in the medium. It earned every chapter.',
    cov: 'manhwa', score: 8.2, kind: 'Editorial', likes: 980, saves: 230, comments: 38,
    tags: ['Lookism', 'Webtoon', 'Drama'],
    body: [{ t: 'p', v: 'Few webtoons sustain momentum past chapter 100. Lookism did it for five times that.' }],
    verdict: { score: 8.2, label: 'Great', text: 'Uneven in stretches, but its highs are genuinely moving. A webtoon that grew up alongside its readers.' },
  },
  {
    id: 'cultivation-manhua-guide',
    cat: 'manhua', author: 'mei', date: 'May 16, 2026', read: '11 min',
    title: "A Beginner's Map to Cultivation Manhua (Without the 3000-Chapter Fear)",
    excerpt: "Xianxia, xuanhuan, qi, golden cores — the genre's jargon scares people off. Here's your gentle on-ramp into the world of cultivation comics.",
    cov: 'manhua', score: null, kind: 'Guide', likes: 1180, saves: 690, comments: 52,
    tags: ['Cultivation', 'Xianxia', 'Beginner', 'Manhua'],
    body: [{ t: 'p', v: 'The cultivation genre is an ocean. Let me hand you a paddle.' }],
  },
  {
    id: 'delicious-dungeon',
    cat: 'anime', author: 'rin', date: 'May 14, 2026', read: '6 min',
    title: 'Delicious in Dungeon Made Me Care About Monster Recipes',
    excerpt: "A dungeon-crawler that's secretly a cooking show, secretly a meditation on grief and ecosystems. Trigger's best work in years.",
    cov: 'night', score: 8.8, kind: 'Review', likes: 1520, saves: 360, comments: 44,
    tags: ['Dungeon Meshi', 'Trigger', 'Fantasy', 'Comedy'],
    body: [{ t: 'p', v: 'Who knew a show about eating slimes could be this tender?' }],
    verdict: { score: 8.8, label: 'Excellent', text: 'Cozy, clever, and quietly profound. Studio Trigger reined in, to wonderful effect.' },
  },
  {
    id: 'persona-handheld',
    cat: 'games', author: 'devon', date: 'May 12, 2026', read: '7 min',
    title: 'Replaying Persona 5 on Handheld Reframed the Whole Game for Me',
    excerpt: 'Two hundred hours later, in bed at midnight, I finally understood what Atlus was going for with all those calendar systems.',
    cov: 'dawn', score: 9.2, kind: 'Feature', likes: 2640, saves: 580, comments: 91,
    tags: ['Persona 5', 'Atlus', 'JRPG', 'Handheld'],
    body: [{ t: 'p', v: 'Some games are different in the dark. P5 is one of them.' }],
    verdict: { score: 9.2, label: 'Outstanding', text: 'Still the high-water mark for stylish JRPGs. The handheld format only deepens the intimacy.' },
  },
  {
    id: 'mushoku-debate',
    cat: 'novel', author: 'sora', date: 'May 10, 2026', read: '8 min',
    title: 'The Mushoku Tensei Discourse, Explained Without the Yelling',
    excerpt: "The isekai that defined a genre is also its most controversial. Let's talk about it like adults, for once.",
    cov: 'novel', score: 7.6, kind: 'Editorial', likes: 870, saves: 190, comments: 142,
    tags: ['Mushoku Tensei', 'Isekai', 'Discourse'],
    body: [{ t: 'p', v: "It's possible to hold two thoughts at once. Let me show you." }],
    verdict: { score: 7.6, label: 'Good', text: 'Genre-defining craft tangled up with genuinely uncomfortable content. Worth discussing, hard to recommend cleanly.' },
  },
  {
    id: 'tower-of-god-s3',
    cat: 'manhwa', author: 'kai', date: 'May 8, 2026', read: '6 min',
    title: 'Tower of God Season 3 Finally Looks Like the Webtoon Deserved',
    excerpt: "After a rocky anime start, the adaptation's animation has caught up to SIU's sprawling ambition. A redemption arc in production form.",
    cov: 'night', score: 8.0, kind: 'Review', likes: 1100, saves: 270, comments: 58,
    tags: ['Tower of God', 'Webtoon', 'Adaptation'],
    body: [{ t: 'p', v: 'Sometimes a second chance is all an adaptation needs.' }],
    verdict: { score: 8.0, label: 'Great', text: 'The adaptation we wanted from the start. Newcomers may still feel lost, but fans will rejoice.' },
  },
];

/** Posts with `authorObj` / `catObj` hydrated — mirrors the prototype's join. */
export const POSTS: Post[] = RAW_POSTS.map((p) => ({
  ...p,
  authorObj: AUTHORS[p.author],
  catObj: CATEGORIES.find((c) => c.id === p.cat)!,
}));

export const COMMENTS: Comment[] = [
  { author: 'Devon Park', color: '#E08A6E', time: '2h ago', text: 'Episode 9 broke me in public. On a train. No regrets. This review captures exactly why it hits so hard.', likes: 48 },
  { author: 'Mei Lan', color: '#DB9A55', time: '5h ago', text: '"The quiet grammar of grief" — okay that\'s going straight into my vocabulary. Beautiful write-up.', likes: 31 },
  { author: 'Sora Tan', color: '#A98AD8', time: '1d ago', text: 'I was hesitant because of the hype but you\'ve convinced me to finally start it tonight. Wish me (emotional) luck.', likes: 17 },
];

/** Per-category hero blurb shown on the category landing page. */
export const CAT_BLURB: Record<string, string> = {
  anime: 'Seasonal reviews, sakuga breakdowns, and the shows worth your evenings.',
  manga: 'Weekly chapter reactions, completed-series verdicts, and hidden gems.',
  manhwa: 'Vertical-scroll obsessions, webtoon deep-dives, and the next big thing.',
  manhua: 'Cultivation epics, donghua adaptations, and your gateway into the genre.',
  novel: 'Web novels, light novels, and the translations worth committing to.',
  games: 'JRPGs, gacha, visual novels — the otaku side of the games world.',
};

/* Convenience lookups used across views. */
export const postById = (id: string): Post | undefined => POSTS.find((p) => p.id === id);
export const postsByCat = (cat: string): Post[] => POSTS.filter((p) => p.cat === cat);
export const postsByAuthor = (author: string): Post[] => POSTS.filter((p) => p.author === author);
