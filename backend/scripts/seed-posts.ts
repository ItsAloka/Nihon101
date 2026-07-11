/* Seed local-dev test content: 4 test authors + ~50 published bilingual posts
 * spread across categories, with staggered publish dates and varied likes so
 * home-feed ranking (hero/recent/top authors) has something real to chew on.
 *
 * Bodies are pre-written in BOTH locales (no OpenAI calls). Idempotent-ish:
 * skips any post whose slug already exists, skips accounts whose email exists.
 * NOTE: `posts.likes` counters are seeded without matching `post_likes` rows —
 * fine for local testing, never run against prod.
 *
 * Usage:  DATABASE_URL=postgres://... bun scripts/seed-posts.ts
 * Test account password (all four): nihon-test-2026   (see CLAUDE.md)
 */
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { standaloneDb } from '../src/db/client';
import { users, posts, categories } from '../src/db/schema';
import { id as newId } from '../src/lib/ids';
import { slugify, bumpCategoryCount } from '../src/db/queries/categories';

const url = process.env.DATABASE_URL ?? 'postgres://nihon101:nihon101@localhost:5432/nihon101';
const { db, pool } = standaloneDb({ DATABASE_URL: url });

const TEST_PASSWORD = 'nihon-test-2026';
const now = Date.now();
const DAY = 86_400_000;

// ---- Test authors -----------------------------------------------------------

const AUTHORS = [
  {
    key: 'yuki',
    email: 'yuki.writes@test.local',
    handle: 'yuki-shirakawa',
    displayName: 'Yuki Shirakawa',
    displayNameJa: '白川 ゆき',
    bio: 'Words, tea, and the spaces between them. Writing about the Japanese language from a small desk in Kyoto.',
    bioJa: '言葉とお茶と、その間にある余白について。京都の小さな机から日本語のことを書いています。',
    location: 'Kyoto, JP',
  },
  {
    key: 'kenta',
    email: 'kenta.eats@test.local',
    handle: 'kenta-hori',
    displayName: 'Kenta Hori',
    displayNameJa: '堀 健太',
    bio: 'Eating my way through Osaka one counter seat at a time. Former izakaya cook, full-time noodle apologist.',
    bioJa: '大阪のカウンター席をひとつずつ食べ歩く。元居酒屋の料理人、麺類擁護派。',
    location: 'Osaka, JP',
  },
  {
    key: 'mari',
    email: 'mari.travels@test.local',
    handle: 'mari-aoki',
    displayName: 'Mari Aoki',
    displayNameJa: '青木 まり',
    bio: 'Slow trains, small towns, and onsen steam. I write about the Japan you reach when you stop hurrying.',
    bioJa: '鈍行列車と小さな町と温泉の湯気。急ぐのをやめたときに辿り着く日本を書いています。',
    location: 'Sapporo, JP',
  },
  {
    key: 'ren',
    email: 'ren.frames@test.local',
    handle: 'ren-takeda',
    displayName: 'Ren Takeda',
    displayNameJa: '武田 蓮',
    bio: 'Animation, history, and everything in between. I pause anime frame by frame so you don’t have to.',
    bioJa: 'アニメと歴史、そのあいだのすべて。あなたの代わりにアニメを一コマずつ止めて観ています。',
    location: 'Tokyo, JP',
  },
] as const;

// ---- Per-category body paragraph pools (EN/JA parallel) ---------------------

type Para = [en: string, ja: string];
const POOL: Record<string, Para[]> = {
  culture: [
    ['There is a particular quiet that settles over a Japanese neighborhood at dusk. The tofu seller’s horn fades, shutters come down with a soft rattle, and the streetlights blink on one by one, as if the town itself were exhaling after a long day.', '日本の住宅街には、夕暮れどきに訪れる独特の静けさがある。豆腐売りのラッパが遠ざかり、シャッターが柔らかな音を立てて下り、街灯がひとつずつ点っていく。まるで町そのものが、長い一日の終わりに息を吐いているかのようだ。'],
    ['So much of Japanese culture lives in what is not said. The pause before an answer, the gift that is refused twice before it is accepted, the bow held a beat longer than necessary — these are sentences in a grammar with no textbook.', '日本文化の多くは、語られないものの中に息づいている。返事の前の間、二度遠慮してから受け取る贈り物、必要以上に一拍長く保たれるお辞儀。これらは教科書のない文法で書かれた文章なのだ。'],
    ['I used to think tradition meant preservation, keeping things exactly as they were. But watch a festival float being rebuilt every year by new hands, and you realize tradition here is closer to a verb than a noun.', 'かつて私は、伝統とは保存のこと、物事をそのまま保つことだと思っていた。しかし毎年新しい手によって組み直される祭りの山車を見ていると、ここでの伝統は名詞というより動詞に近いのだと気づく。'],
    ['The convenience store at the corner knows the rhythm of the town better than anyone: salarymen at seven, students at three-thirty, the old man who buys one onigiri and a newspaper at exactly nine each night.', '角のコンビニは、誰よりもこの町のリズムを知っている。朝七時のサラリーマン、三時半の学生たち、そして毎晩きっかり九時におにぎりひとつと新聞を買う老人。'],
  ],
  food: [
    ['The first slurp is the honest one. Before you have decided what to think, before you have composed a review in your head, the noodles tell you everything: the firmness of the water, the patience of the broth, the temper of the cook.', '最初のひと啜りが、いちばん正直だ。感想を決める前に、頭の中でレビューを組み立てる前に、麺がすべてを教えてくれる。水の硬さ、出汁の根気、作り手の気性までも。'],
    ['A good counter seat is a theater ticket. You watch the knife work, the flick of the wrist over the charcoal, the quiet argument between the chef and his apprentice conducted entirely in glances.', '良いカウンター席は観劇のチケットだ。包丁さばきを眺め、炭火の上で返る手首を眺め、視線だけで交わされる大将と弟子の静かな問答を眺める。'],
    ['Seasonality in Japan is not a marketing word; it is a deadline. The first bamboo shoots, the last of the sanma, the two-week window when the persimmons are exactly right — miss it and you wait a year.', '日本における旬は、マーケティング用語ではなく締め切りである。初物の筍、終わりかけの秋刀魚、柿がちょうど良くなる二週間。逃せば、また一年待つことになる。'],
    ['The vending machine ticket system is the great equalizer of Japanese dining. No small talk, no menu anxiety — just a button, a clunk, and a small paper promise that something hot is coming.', '券売機は日本の食の偉大な平等装置だ。世間話も、メニューを前にした緊張もいらない。ボタンを押せば、ガタンと音がして、温かい何かがやってくるという小さな紙の約束が手に入る。'],
  ],
  travel: [
    ['The local train does not apologize for its pace. It stops at platforms with no station building, waits for a high schooler running up the stairs, and gives you eleven unhurried minutes to watch rice fields turn gold.', '鈍行列車は、その遅さを詫びたりしない。駅舎のないホームに停まり、階段を駆け上がる高校生を待ち、稲田が金色に変わるのを眺める、急かされない十一分間をくれる。'],
    ['Every small town in Japan has the same four things: a shrine up some stairs, a shuttered shopping street, one bakery that is inexplicably excellent, and an old man who will tell you the history of all three.', '日本の小さな町には、決まって四つのものがある。階段の上の神社、シャッターの下りた商店街、なぜか異様に美味いパン屋がひとつ、そしてその三つすべての歴史を語ってくれるおじいさんだ。'],
    ['Onsen etiquette looks complicated from the outside, but it reduces to one principle: you are sharing the water. Wash first, soak quietly, and let the heat take the trip out of your shoulders.', '温泉の作法は外から見ると複雑そうだが、突き詰めればひとつの原則になる。湯はみんなのものだ、ということ。まず体を洗い、静かに浸かり、旅の疲れを肩から湯に溶かしていく。'],
    ['I keep a rule for ferries and ropeways: if it runs less than once an hour, take it. Infrequency is the landscape’s way of telling you that something up there is worth the wait.', 'フェリーとロープウェイについて、自分なりの決まりがある。一時間に一本以下なら、乗ること。本数の少なさは、その先に待つ価値のある何かがあるという、風景からの合図なのだ。'],
  ],
  language: [
    ['Japanese has a word for almost every kind of light. Komorebi for sun through leaves, yūbae for the evening glow, kagerō for the shimmer of heat — a vocabulary that assumes you have time to stand still and look.', '日本語には、ほとんどあらゆる種類の光に名前がある。木漏れ日、夕映え、陽炎。立ち止まって眺める時間があることを前提とした語彙たちだ。'],
    ['Keigo is less a politeness system than a distance-measuring instrument. Every verb ending tells the listener exactly how far away you are standing, and whether you intend to come closer.', '敬語は丁寧さの体系というより、距離の測定器だ。動詞の語尾のひとつひとつが、自分が相手からどれほどの距離に立っているか、そして近づくつもりがあるのかを正確に伝えている。'],
    ['Learners ask for shortcuts, but the particles refuse to be rushed. Wa and ga sit a hair’s width apart and mean entirely different worlds; the only way through is a thousand small sentences.', '学習者は近道を求めるが、助詞は急かされることを拒む。「は」と「が」は紙一重の距離に座りながら、まったく別の世界を意味している。通り抜ける道はただひとつ、千の小さな例文だけだ。'],
    ['Onomatopoeia is where Japanese stops being a language and becomes a sound effect track. Rain falls shito-shito or zaa-zaa; hearts beat doki-doki; silence itself goes shiin.', 'オノマトペにおいて、日本語は言語であることをやめ、効果音のトラックになる。雨はしとしと、あるいはざあざあと降り、心臓はどきどきと打ち、静寂さえもしいんと鳴る。'],
  ],
  animation: [
    ['Watch any great anime cut frame by frame and you will find the money is not where you think. The fireworks are cheap; the way a character hesitates before closing a door is where the animator spent their week.', '優れたアニメのカットを一コマずつ見ていくと、手間のかかった場所は思いがけないところにあると気づく。花火は安い。本当に作画者が一週間を費やしたのは、登場人物がドアを閉める前に一瞬ためらう、その仕草なのだ。'],
    ['The background art tradition in Japanese animation is a quiet national archive: train crossings, utility poles against an evening sky, the exact green of a school corridor. Future historians will study anime backgrounds the way we study woodblock prints.', '日本のアニメにおける背景美術の伝統は、静かな国民的アーカイブだ。踏切、夕空に立つ電柱、学校の廊下のあの緑色。未来の歴史家は、私たちが浮世絵を研究するようにアニメの背景を研究するだろう。'],
    ['Sakuga fans talk about animators the way jazz fans talk about sidemen: not who the director was, but who drew the run in episode seven, and how you can tell from the way the coat moves.', '作画ファンはアニメーターについて、ジャズファンがサイドマンを語るように語る。監督が誰かではなく、七話のあの走りを描いたのは誰か、コートの揺れ方でどう見分けるか、と。'],
    ['Every generation gets the slow, quiet show it needs — the one about nothing in particular, where the plot is four friends and a river, and somehow it carries you through a hard year.', 'どの世代にも、その世代に必要な、ゆっくりとした静かな作品がある。特に何も起こらない、四人の友人と一本の川だけの物語。それがなぜか、つらい一年を運んでくれたりするのだ。'],
  ],
  history: [
    ['Edo was a city of half a million people with no police force to speak of, held together by neighborhood associations, fire brigades, and an intricate web of obligation that functioned better than most modern bureaucracies.', '江戸は、警察と呼べるものがほとんど存在しないまま五十万人が暮らした都市だった。町内会と火消し、そして大半の近代官僚制よりもよく機能した、義理の細やかな網の目がそれを支えていた。'],
    ['History in Japan is rarely behind glass. It is the temple you cut through on the way to the station, the castle stones reused in a harbor wall, the family business on its nineteenth generation.', '日本の歴史は、めったにガラスケースの中にいない。駅への近道に通り抜ける寺であり、港の石垣に転用された城の石であり、十九代目を数える家業なのだ。'],
    ['The Tokaido was the busiest road on earth in the eighteenth century, and walking its surviving stretches today you can still read the economy of the era in the spacing of the post towns.', '東海道は十八世紀、地球上でもっとも交通量の多い道だった。現存する区間を歩けば、宿場町の間隔の中に、いまもあの時代の経済を読み取ることができる。'],
    ['Every period drama gets the swords wrong and the paperwork right is a joke historians like to tell — because the real engine of the shogunate was not the blade but the brush, the seal, and the ledger.', '「時代劇は刀の描写を間違え、書類仕事だけは正確に描く」というのは歴史家の好む冗談だ。幕府を動かしていた本当の原動力は刃ではなく、筆と印と帳簿だったのだから。'],
  ],
  philosophy: [
    ['Wabi-sabi is usually translated as the beauty of imperfection, but it is closer to a kind of honesty: the cup admits it was made by hands, the wood admits it has lived through seasons.', '侘び寂びはふつう「不完全の美」と訳されるが、それはむしろ一種の正直さに近い。茶碗は手で作られたことを認め、木材は幾つもの季節を生きてきたことを認めている。'],
    ['Mono no aware is not sadness exactly. It is the small ache of noticing that the cherry blossoms are at their peak, which means they have already begun to fall.', 'もののあわれは、正確には悲しみではない。桜がいま満開だと気づくこと、それはつまり、もう散り始めているのだと気づくこと。その小さな疼きのことだ。'],
    ['The Japanese garden does not imitate nature; it concentrates it. Fifteen rocks and raked gravel can hold an entire coastline, the way a haiku holds a season in seventeen sounds.', '日本庭園は自然を模倣しない。凝縮するのだ。十五の石と掃き清められた砂利が海岸線の全体を抱え込む。十七音の中に季節を抱く俳句のように。'],
  ],
  fashion: [
    ['Japanese street fashion runs on a paradox: total conformity in the office by day, total invention in Harajuku by weekend, often by the same people.', '日本のストリートファッションは逆説の上に成り立っている。平日はオフィスで完全な同調、週末は原宿で完全な発明。しかも、しばしば同じ人々によって。'],
    ['Denim made in Kojima is woven slowly on looms the rest of the world threw away, and you can feel the disobedience in the fabric: it refuses to be cheap, refuses to be fast.', '児島のデニムは、世界が捨てた織機の上でゆっくりと織られる。その布には不服従が宿っている。安くなることを拒み、速くなることを拒んでいる。'],
    ['The kimono never died; it changed jobs. Once daily wear, it is now ceremony, costume, canvas — and lately, in the hands of young designers, a streetwear ingredient nobody saw coming.', '着物は死ななかった。転職したのだ。かつての日常着は、いまや儀式となり、衣装となり、キャンバスとなった。そして最近では若いデザイナーたちの手で、誰も予想しなかったストリートウェアの素材になっている。'],
  ],
  news: [
    ['The slow news of a small town: the bakery is closing after sixty years, the river path has new lanterns, the station cat has been promoted again. None of it trends; all of it matters.', '小さな町のゆっくりとしたニュース。六十年続いたパン屋が店を閉じること、川沿いの道に新しい灯籠がついたこと、駅の猫がまた昇進したこと。どれも話題にはならない。どれも大切なことだ。'],
    ['Japan’s local newspapers still print the things algorithms ignore: school lunch menus, fishing forecasts, the names of every child who won the calligraphy contest.', '日本の地方新聞は、アルゴリズムが無視するものをいまも印刷している。給食の献立、釣りの予報、書道コンクールに入賞したすべての子どもの名前。'],
  ],
};

// ---- Posts ------------------------------------------------------------------
// [authorKey, category, titleEn, titleJa, excerptEn, excerptJa, tags, likes, daysAgo]
type Seed = [string, string, string, string, string, string, string[], number, number];

const SEEDS: Seed[] = [
  // -- yuki (language / culture / philosophy) --
  ['yuki', 'language', 'The Word for Light Through Leaves', '木漏れ日という言葉', 'Why komorebi exists in Japanese and not in English, and what that says about who stops to look.', 'なぜ「木漏れ日」は日本語にあって英語にないのか。立ち止まって見上げる人について。', ['language', 'words'], 84, 2],
  ['yuki', 'language', 'Keigo Is a Distance, Not a Decoration', '敬語は飾りではなく距離である', 'Honorific Japanese measured as a coordinate system: where you stand, and whether you may approach.', '敬語を座標系として読む。あなたがどこに立ち、近づくことが許されるのか。', ['language', 'keigo'], 56, 9],
  ['yuki', 'language', 'Wa and Ga: A Hair’s Width Apart', '「は」と「が」、紙一重の距離', 'The two smallest words in Japanese and the thousand sentences it takes to feel the difference.', '日本語でいちばん小さなふたつの言葉と、その違いを体得するための千の例文。', ['language', 'grammar'], 47, 16],
  ['yuki', 'language', 'Rain Goes Shito-Shito: An Onomatopoeia Field Guide', '雨はしとしと降る：オノマトペ採集記', 'A field guide to the sound effects Japanese speakers live inside without noticing.', '日本語話者が気づかぬまま暮らしている効果音の世界を採集する。', ['language', 'onomatopoeia'], 91, 23],
  ['yuki', 'culture', 'The Grammar of Silence', '沈黙の文法', 'The pause before an answer, the twice-refused gift: reading the sentences Japan writes without words.', '返事の前の間、二度遠慮される贈り物。言葉を使わずに書かれる日本の文章を読む。', ['culture', 'communication'], 73, 30],
  ['yuki', 'philosophy', 'Wabi-Sabi Is Honesty', '侘び寂びとは正直のことだ', 'Not the beauty of imperfection, exactly — something closer to a cup admitting it was made by hands.', '「不完全の美」ではなく、手で作られたことを認める茶碗の正直さについて。', ['philosophy', 'aesthetics'], 102, 38],
  ['yuki', 'philosophy', 'The Ache of Full Bloom', '満開という疼き', 'Mono no aware, explained through the moment you notice the blossoms have already begun to fall.', 'もののあわれを、桜がもう散り始めていると気づく瞬間から説明してみる。', ['philosophy', 'seasons'], 66, 45],
  ['yuki', 'philosophy', 'Fifteen Rocks, One Coastline', '十五の石、ひとつの海岸線', 'How the Japanese garden concentrates nature the way a haiku concentrates a season.', '俳句が季節を凝縮するように、日本庭園が自然を凝縮する方法について。', ['philosophy', 'gardens'], 39, 52],
  ['yuki', 'culture', 'Tradition Is a Verb', '伝統は動詞である', 'Watching a festival float rebuilt by new hands every year, and unlearning what preservation means.', '毎年新しい手で組み直される山車を眺めながら、「保存」の意味を学び直す。', ['culture', 'festivals'], 58, 60],
  ['yuki', 'language', 'A Vocabulary of Evening Glow', '夕映えの語彙', 'Yūbae, kagerō, and the long Japanese tradition of naming kinds of light.', '夕映え、陽炎。光の種類に名前をつけてきた日本語の長い伝統。', ['language', 'words'], 31, 68],

  // -- kenta (food, mostly) --
  ['kenta', 'food', 'The First Slurp Is the Honest One', '最初のひと啜りがいちばん正直だ', 'Everything a bowl of ramen tells you before you have decided what to think.', '感想を決める前に、一杯のラーメンが教えてくれるすべてのこと。', ['food', 'ramen'], 120, 1],
  ['kenta', 'food', 'A Counter Seat Is a Theater Ticket', 'カウンター席は観劇のチケット', 'On watching knife work, charcoal, and the silent arguments of a great kitchen.', '包丁さばきと炭火と、優れた厨房の静かな問答を観るということ。', ['food', 'izakaya'], 88, 5],
  ['kenta', 'food', 'Seasonality Is a Deadline', '旬とは締め切りである', 'First bamboo shoots, last sanma: the two-week windows that organize the Japanese year.', '初物の筍、終わりの秋刀魚。日本の一年を組み立てる二週間の窓。', ['food', 'seasons'], 64, 12],
  ['kenta', 'food', 'In Praise of the Ticket Machine', '券売機礼賛', 'No small talk, no menu anxiety: the vending machine ticket as the great equalizer of Japanese dining.', '世間話も緊張もいらない。日本の食の偉大な平等装置としての券売機。', ['food', 'ramen'], 95, 19],
  ['kenta', 'food', 'Osaka Eats Standing Up', '大阪は立って食べる', 'Kushikatsu rails, standing bars, and the city that turned impatience into a cuisine.', '串カツの手すりと立ち飲み屋。せっかちを料理に変えた街について。', ['food', 'osaka'], 77, 26],
  ['kenta', 'food', 'The 7-Eleven Egg Sandwich Discourse', 'コンビニの卵サンドをめぐる議論', 'A serious inquiry into why the convenience store tamago sando refuses to be bad.', 'なぜコンビニの卵サンドは不味くなることを拒むのか、真剣に考える。', ['food', 'konbini'], 110, 33],
  ['kenta', 'food', 'Broth Patience', '出汁の根気', 'What twelve hours of simmering does to pork bones, and what it does to the person watching the pot.', '十二時間の煮込みが豚骨に何をするのか。そして鍋を見つめる人間に何をするのか。', ['food', 'ramen'], 42, 40],
  ['kenta', 'food', 'The Last Sanma of the Season', '今季最後の秋刀魚', 'Notes from the morning market on the day the fishmonger said “that’s it until next year.”', '「今年はこれで終わりや」と魚屋が言った日の朝市の記録。', ['food', 'seasons'], 53, 47],
  ['kenta', 'culture', 'The Konbini Knows Your Rhythm', 'コンビニはあなたのリズムを知っている', 'Salarymen at seven, students at three-thirty: the corner store as the town’s metronome.', '朝七時のサラリーマン、三時半の学生。町のメトロノームとしての角のコンビニ。', ['culture', 'konbini'], 69, 55],
  ['kenta', 'food', 'Soba at Zero Degrees', '零度の蕎麦', 'Cold noodles in cold weather and other hills I am prepared to die on.', '寒い日の冷たい蕎麦、その他、譲るつもりのない主張について。', ['food', 'soba'], 36, 62],
  ['kenta', 'food', 'How to Order Without Words', '言葉を使わない注文の作法', 'A pointing-and-nodding survival guide for the gloriously menu-less restaurants of Japan.', 'メニューなき名店を生き抜くための、指差しと頷きのガイド。', ['food', 'guide'], 48, 70],
  ['kenta', 'food', 'The Apprentice’s Glance', '弟子の視線', 'Three months watching one sushi counter, and the entire curriculum passed in eye contact.', 'ひとつの鮨カウンターを三ヶ月眺めて見えた、視線だけで受け継がれる教育課程。', ['food', 'sushi'], 60, 78],

  // -- mari (travel, mostly) --
  ['mari', 'travel', 'Eleven Unhurried Minutes', '急かされない十一分間', 'The local train does not apologize for its pace, and neither should you.', '鈍行列車はその遅さを詫びない。あなたも詫びなくていい。', ['travel', 'trains'], 105, 3],
  ['mari', 'travel', 'Every Small Town Has Four Things', '小さな町にはいつも四つのものがある', 'A shrine up some stairs, a shuttered arcade, one excellent bakery, and the man who knows their history.', '階段の上の神社、シャッター商店街、異様に美味いパン屋、そして語り部のおじいさん。', ['travel', 'small-towns'], 82, 8],
  ['mari', 'travel', 'You Are Sharing the Water', '湯はみんなのもの', 'Onsen etiquette reduced to its single underlying principle.', '温泉の作法を、たったひとつの原則まで煮詰める。', ['travel', 'onsen'], 97, 15],
  ['mari', 'travel', 'Take the Infrequent Ferry', '本数の少ないフェリーに乗れ', 'If it runs less than once an hour, the landscape is telling you something is worth the wait.', '一時間に一本以下なら、それは待つ価値があるという風景からの合図だ。', ['travel', 'islands'], 71, 22],
  ['mari', 'travel', 'Sapporo After the Snow Stops', '雪がやんだあとの札幌', 'The hour after a snowfall when the city goes quiet and the streetlights double in the drifts.', '降雪のあとの一時間。街が静まり、街灯が雪溜まりの中で倍になる。', ['travel', 'hokkaido'], 89, 29],
  ['mari', 'travel', 'The Station Bento Decision', '駅弁という決断', 'Forty seconds on the platform, two hundred choices, no wrong answers: a defense of the ekiben panic.', 'ホームでの四十秒、二百の選択肢、間違いなし。駅弁パニックを擁護する。', ['travel', 'trains', 'food'], 58, 36],
  ['mari', 'travel', 'Walking the Old Tokaido', '旧東海道を歩く', 'Reading the eighteenth-century economy in the spacing of the post towns, one blister at a time.', '宿場町の間隔から十八世紀の経済を読む。靴擦れひとつぶんずつ。', ['travel', 'history'], 44, 44],
  ['mari', 'travel', 'A Ryokan Teaches You to Do Nothing', '旅館は「何もしない」を教えてくれる', 'The yukata, the tea, the view: an institution designed to dismantle your itinerary.', '浴衣とお茶と窓の景色。あなたの旅程表を解体するための装置。', ['travel', 'onsen'], 63, 51],
  ['mari', 'culture', 'Lanterns on the River Path', '川沿いの灯籠', 'The town installed new lanterns this spring. This is the entire news, and it is enough.', 'この春、町は川沿いに新しい灯籠を立てた。ニュースはそれだけ。それで十分。', ['culture', 'small-towns'], 27, 58],
  ['mari', 'travel', 'Mistakes Were Made in Shikoku', '四国でやらかした話', 'On missing the last bus in a town with one bus, and the kindness that followed.', 'バスが一日一本の町で最終バスを逃した話と、そのあとに続いた親切について。', ['travel', 'shikoku'], 76, 66],

  // -- ren (animation / history) --
  ['ren', 'animation', 'The Money Is in the Hesitation', '作画の予算はためらいに使われる', 'Frame-by-frame through a famous cut: the fireworks are cheap, the closing door is expensive.', '有名カットを一コマずつ。花火は安く、閉まりかけのドアは高い。', ['anime', 'sakuga'], 115, 4],
  ['ren', 'animation', 'Anime Backgrounds Are a National Archive', 'アニメ背景という国民的アーカイブ', 'Train crossings, utility poles, the exact green of a school corridor: what future historians will study.', '踏切、電柱、学校の廊下のあの緑。未来の歴史家が研究するもの。', ['anime', 'background-art'], 92, 11],
  ['ren', 'animation', 'Who Drew the Run in Episode Seven', '七話のあの走りを描いたのは誰か', 'Sakuga fandom as jazz fandom: knowing the sidemen by the way the coat moves.', 'コートの揺れ方でサイドマンを聞き分ける、ジャズファンとしての作画オタク。', ['anime', 'sakuga'], 68, 18],
  ['ren', 'animation', 'The Quiet Show You Needed', 'あなたに必要だった静かなアニメ', 'Four friends and a river: in defense of the series where nothing happens and everything matters.', '四人の友人と一本の川。何も起こらず、すべてが大切な作品を擁護して。', ['anime', 'slice-of-life'], 86, 25],
  ['ren', 'history', 'Edo Ran on Obligation', '江戸は義理で動いていた', 'Half a million people, no police force, and a web of neighborhood duty that outperformed bureaucracy.', '五十万人、警察なし。官僚制を凌駕した町内の義理の網の目。', ['history', 'edo'], 79, 32],
  ['ren', 'history', 'History Is Not Behind Glass Here', 'ここでは歴史はガラスケースの中にいない', 'The temple shortcut, the castle stones in the harbor wall, the shop on its nineteenth generation.', '近道の寺、港の石垣の城石、十九代目の店。', ['history'], 51, 39],
  ['ren', 'history', 'The Brush, the Seal, the Ledger', '筆と印と帳簿', 'Period dramas get the swords wrong and the paperwork right: the real engine of the shogunate.', '時代劇は刀を間違え書類を正確に描く。幕府の本当の原動力について。', ['history', 'edo'], 38, 46],
  ['ren', 'animation', 'Pause Button Criticism', '一時停止ボタンの批評', 'What you owe an animator when you freeze their two seconds of work for twenty minutes of analysis.', '二秒の仕事を二十分停止して分析するとき、私たちがアニメーターに負うもの。', ['anime', 'criticism'], 57, 54],
  ['ren', 'history', 'The Busiest Road on Earth', '地球でいちばん混んだ道', 'The Tokaido in the eighteenth century, when a footpath out-trafficked every highway in Europe.', '十八世紀の東海道。一本の徒歩道がヨーロッパのあらゆる街道を凌いだ時代。', ['history', 'tokaido'], 45, 61],
  ['ren', 'fashion', 'Denim That Refuses to Hurry', '急ぐことを拒むデニム', 'Kojima weaves on the looms the world threw away, and you can feel the disobedience in the fabric.', '世界が捨てた織機で織る児島。布に宿る不服従を、手は感じ取る。', ['fashion', 'denim'], 72, 69],

  // -- kageloom (mixed) --
  ['kage', 'culture', 'The Town Exhales at Dusk', '夕暮れ、町が息を吐く', 'The tofu seller’s horn, the shutters, the streetlights: an anatomy of the Japanese evening.', '豆腐売りのラッパ、シャッター、街灯。日本の夕方の解剖学。', ['culture', 'evening'], 98, 6],
  ['kage', 'fashion', 'Conformity by Day, Harajuku by Weekend', '平日は同調、週末は原宿', 'The paradox at the heart of Japanese street fashion, often inside the same closet.', '同じクローゼットの中に共存する、日本のストリートファッションの逆説。', ['fashion', 'harajuku'], 61, 13],
  ['kage', 'fashion', 'The Kimono Changed Jobs', '着物は転職した', 'From daily wear to ceremony to streetwear ingredient: a garment’s second career.', '日常着から儀式へ、そしてストリートの素材へ。ある衣服の第二のキャリア。', ['fashion', 'kimono'], 54, 20],
  ['kage', 'news', 'The Station Cat Was Promoted Again', '駅の猫、また昇進', 'Slow news from a small town, where none of it trends and all of it matters.', '小さな町のゆっくりとしたニュース。話題にはならず、すべてが大切。', ['news', 'small-towns'], 83, 27],
  ['kage', 'news', 'What Local Papers Still Print', '地方紙がいまも刷っているもの', 'School lunch menus, fishing forecasts, every calligraphy contest winner by name.', '給食の献立、釣り予報、書道コンクール入賞者全員の名前。', ['news', 'media'], 40, 34],
  ['kage', 'culture', 'An Apartment of Borrowed Light', '借りた光のアパート', 'Living small in Japan and discovering how much of a home can be window.', '日本で小さく暮らし、家のどれほどが窓でできているかを知る。', ['culture', 'living'], 66, 41],
  ['kage', 'animation', 'The Green of School Corridors', '学校の廊下のあの緑', 'One color, three decades of anime, and the collective memory it stores.', 'ひとつの色、三十年のアニメ、そこに保存された集合的記憶。', ['anime', 'background-art'], 74, 48],
  ['kage', 'travel', 'Night Buses and Their Philosophers', '夜行バスとその哲学者たち', 'Nobody is their daytime self at a 3 a.m. service area. Field notes from the slow way to Tokyo.', '午前三時のサービスエリアに、昼間の自分はいない。東京への遅い道の記録。', ['travel', 'night-bus'], 49, 56],
  ['kage', 'language', 'Shiin: The Sound Silence Makes', 'しいん：静寂の鳴る音', 'Japanese gives silence its own onomatopoeia, which tells you everything about listening here.', '日本語は静寂にさえオノマトペを与える。それがこの国の「聞く」を物語る。', ['language', 'onomatopoeia'], 87, 63],
  ['kage', 'history', 'Stones That Remember Being a Castle', '城だったことを覚えている石', 'Harbor walls, garden borders, doorsteps: tracking a demolished castle through the town it became.', '港の壁、庭の縁石、家の踏み石。解体された城を、城が変わった町の中に追う。', ['history', 'castles'], 33, 72],
];

// ---- Run --------------------------------------------------------------------

const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10);
const authorIds: Record<string, string> = {};

// kageloom: reuse if present, otherwise create (dev branches start empty —
// the real account was purged from prod 2026-07-10; this one is test-only).
{
  const [kage] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'kageloom@gmail.com'));
  if (kage) {
    authorIds.kage = kage.id;
  } else {
    const uid = newId('usr');
    await db.insert(users).values({
      id: uid,
      email: 'kageloom@gmail.com',
      passwordHash,
      displayName: 'Kage Loom',
      displayNameJa: '',
      handle: 'kage-loom',
      bio: 'Editor-in-residence. Slow walks, old shrines, long reads.',
      bioJa: '',
      location: 'Tokyo, JP',
      avatarUrl: null,
      role: 'admin',
      emailVerified: true,
      createdAt: now - 120 * DAY,
      updatedAt: now - 120 * DAY,
    });
    authorIds.kage = uid;
    console.log('created account: kageloom@gmail.com (@kage-loom, admin, test pw)');
  }
}

for (const a of AUTHORS) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, a.email));
  if (existing) {
    authorIds[a.key] = existing.id;
    console.log(`account exists: ${a.email}`);
    continue;
  }
  const uid = newId('usr');
  await db.insert(users).values({
    id: uid,
    email: a.email,
    passwordHash,
    displayName: a.displayName,
    displayNameJa: a.displayNameJa,
    handle: a.handle,
    bio: a.bio,
    bioJa: a.bioJa,
    location: a.location,
    avatarUrl: null,
    role: 'user',
    emailVerified: true,
    createdAt: now - 90 * DAY,
    updatedAt: now - 90 * DAY,
  });
  authorIds[a.key] = uid;
  console.log(`created account: ${a.email} (@${a.handle})`);
}

/** Deterministic body: intro from the excerpt + 3-5 pool paragraphs (rotated by seed index). */
function buildBody(cat: string, i: number, excerpt: string, ja: boolean): string {
  const pool = POOL[cat] ?? POOL.culture;
  const n = 3 + (i % 3); // 3..5 paragraphs
  const paras: string[] = [`<p>${excerpt}</p>`];
  for (let k = 0; k < n; k++) {
    const p = pool[(i + k) % pool.length];
    paras.push(`<p>${ja ? p[1] : p[0]}</p>`);
  }
  return paras.join('');
}

let inserted = 0;
const catBumps: Record<string, number> = {};

for (let i = 0; i < SEEDS.length; i++) {
  const [aKey, cat, tEn, tJa, xEn, xJa, tags, likes, daysAgo] = SEEDS[i];
  const slug = slugify(tEn);
  const [exists] = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug));
  if (exists) { console.log(`skip (slug exists): ${slug}`); continue; }

  const publishedAt = now - daysAgo * DAY - (i % 24) * 3_600_000;
  await db.insert(posts).values({
    id: newId('post'),
    authorId: authorIds[aKey],
    categoryId: cat,
    slug,
    lang: i % 3 === 0 ? 'ja' : 'en',
    titleEn: tEn,
    titleJa: tJa,
    excerptEn: xEn,
    excerptJa: xJa,
    bodyEn: buildBody(cat, i, xEn, false),
    bodyJa: buildBody(cat, i, xJa, true),
    cover: null, // exercises the tint-gradient fallback everywhere
    coverLabel: '',
    coverCredit: '',
    status: 'published',
    density: (['compact', 'normal', 'relaxed'] as const)[i % 3],
    score: null,
    tags,
    likes,
    saves: Math.floor(likes / 4),
    comments: 0,
    publishedAt,
    createdAt: publishedAt,
    updatedAt: publishedAt,
  });
  catBumps[cat] = (catBumps[cat] ?? 0) + 1;
  inserted++;
}

for (const [cat, delta] of Object.entries(catBumps)) {
  await bumpCategoryCount(db, cat, delta);
}

console.log(`inserted ${inserted} posts; bumped counts:`, catBumps);
await pool.end();
