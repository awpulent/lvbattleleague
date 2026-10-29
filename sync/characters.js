// SF6 character data.
//
// Three maps, all keyed the way start.gg reports them:
//   CHARACTER_MAP     start.gg selection ID -> display name (used at ingest)
//   CHARACTER_ICONS   display name -> icon URL on start.gg's CDN (player pages, /api)
//   CHARACTER_BANNERS display name -> locally hosted banner art (player page header)
//
// The static entries below are the baseline the site ships with and the fallback
// when start.gg is unreachable. refreshCharacters() pulls the live roster from
// start.gg's `videogame` query and merges new characters into CHARACTER_MAP and
// CHARACTER_ICONS in place, so a DLC drop no longer needs a code change to be
// recognised. Only banners still need a local file (see docs/operations.md).

// start.gg videogame ID for Street Fighter 6. The sync path passes the event's
// own videogame ID, so this constant only matters for the startup refresh.
const SF6_VIDEOGAME_ID = 43868;

// Refresh at most this often. Sync forces a refresh regardless.
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

// start.gg selection ID -> character name
const CHARACTER_MAP = {
    2271: 'Blanka',
    2272: 'Cammy',
    2273: 'Chun-Li',
    2274: 'Dee Jay',
    2275: 'Dhalsim',
    2276: 'E. Honda',
    2277: 'Guile',
    2278: 'Jamie',
    2279: 'JP',
    2280: 'Juri',
    2281: 'Ken',
    2282: 'Kimberly',
    2283: 'Lily',
    2284: 'Luke',
    2285: 'Manon',
    2286: 'Marisa',
    2287: 'Ryu',
    2288: 'Zangief',
    2314: 'Rashid',
    2342: 'A.K.I.',
    2442: 'Ed',
    2495: 'Akuma',
    2506: 'M. Bison',
    2596: 'Terry',
    2602: 'Random',
    2616: 'Mai',
    2699: 'Elena',
    2745: 'Sagat',
    2798: 'C. Viper',
    2946: 'Alex',
    3014: 'Ingrid',
    3229: 'Yasmine',
    3464: 'Arjun'
};

// Character name -> icon URL (from start.gg's videogame query)
const CHARACTER_ICONS = {
    "Blanka": "https://images.start.gg/images/character/2271/image-95924a15ed652e225355ad5610cc8b2c.png",
    "Cammy": "https://images.start.gg/images/character/2272/image-485758eb4d57d368d73e99a0c11961aa.png",
    "Chun-Li": "https://images.start.gg/images/character/2273/image-bae050747e575ff2c9af1e55c9f39d02.png",
    "Dee Jay": "https://images.start.gg/images/character/2274/image-c95353c5bc9701aa0170ad9f55d0cfda.png",
    "Dhalsim": "https://images.start.gg/images/character/2275/image-56272f38695c9e794486dc43cfba5fc4.png",
    "E. Honda": "https://images.start.gg/images/character/2276/image-a5a8d4cc5be0e6752bdde22d9c125a81.png",
    "Guile": "https://images.start.gg/images/character/2277/image-30beec5ab35fdc224af193205b97bb5a.png",
    "Jamie": "https://images.start.gg/images/character/2278/image-882fab0330dd3829b1384b5ea7a8af8f.png",
    "JP": "https://images.start.gg/images/character/2279/image-cadf5a7a10434633b9c72decfdc595a6.png",
    "Juri": "https://images.start.gg/images/character/2280/image-f2926b15fadcb16384ee738ae396f9bc.png",
    "Ken": "https://images.start.gg/images/character/2281/image-a310f91f5413798628f4770f344a45e1.png",
    "Kimberly": "https://images.start.gg/images/character/2282/image-791c02e462a472ea6fe5a6883a4f4326.png",
    "Lily": "https://images.start.gg/images/character/2283/image-6c3e930ecd10b29df4f5c5dd550c8182.png",
    "Luke": "https://images.start.gg/images/character/2284/image-548791b1dd45536d4ed388c6be2f0c7c.png",
    "Manon": "https://images.start.gg/images/character/2285/image-d5d17dd28f9a23f004faa98f860ad94e.png",
    "Marisa": "https://images.start.gg/images/character/2286/image-e16477b4444fd4ea276851dc00961a78.png",
    "Ryu": "https://images.start.gg/images/character/2287/image-b079f61c9280d74c6dc3f30c48e1955d.png",
    "Zangief": "https://images.start.gg/images/character/2288/image-e05e4d2365cedbb0e9eafd8d2664fcb4.png",
    "Rashid": "https://images.start.gg/images/character/2314/image-7e00a01f043ecafd74d55513746c6eb3.png",
    "A.K.I.": "https://images.start.gg/images/character/2342/image-0b1ced2c8db4efa742ed29a8a96fc21f.png",
    "Ed": "https://images.start.gg/images/character/2442/image-de3d1ef8e6e41e0acc1cbc30d407f75e.png",
    "Akuma": "https://images.start.gg/images/character/2495/image-1872b29ff913c630fd5d6f508ddcc7e9.png",
    "M. Bison": "https://images.start.gg/images/character/2506/image-231f924cee3bb9d853c7803ee874ea65.png",
    "Terry": "https://images.start.gg/images/character/2596/image-bd32078e45f7112df0a7fe68c06f10b6.png",
    "Random": "https://images.start.gg/images/character/2602/image-0d5f1570ce4e52d0db1dd112efc2dfbd.png",
    "Mai": "https://images.start.gg/images/character/2616/image-0013fc5b9fe8b1aeeb693193f7a38831.png",
    "Elena": "https://images.start.gg/images/character/2699/image-4775f3474a73ff56c3ecb1e70ad09811.png",
    "Sagat": "https://images.start.gg/images/character/2745/image-676c8ad2e4f78862063552f82ccf38b3.png",
    "C. Viper": "https://images.start.gg/images/character/2798/image-234590ca6bf28a72baa21410874bfdce.png",
    "Alex": "https://images.start.gg/images/character/2946/image-4c3259ffbe946beba5236a7aea7e56f7.png",
    "Ingrid": "https://images.start.gg/images/character/3014/image-3e99142ff4a93ee209e56f098e0efa7c.png",
    "Yasmine": "https://images.start.gg/images/character/3229/image-6c5e1c89848f96ed016d1c1cc64d2566.png",
    "Arjun": "https://images.start.gg/images/character/3464/image-4bfc5f86993dd01d4ad6388098d55645.png"
};

// Character name -> banner image (locally hosted screenshots from Capcom)
const CHARACTER_BANNERS = {
    "Ryu": "/img/characters/ryu.jpg",
    "Ken": "/img/characters/ken.jpg",
    "Chun-Li": "/img/characters/chunli.jpg",
    "Luke": "/img/characters/luke.jpg",
    "Jamie": "/img/characters/jamie.jpg",
    "Kimberly": "/img/characters/kimberly.jpg",
    "Guile": "/img/characters/guile.jpg",
    "Juri": "/img/characters/juri.jpg",
    "JP": "/img/characters/jp.jpg",
    "Manon": "/img/characters/manon.jpg",
    "Marisa": "/img/characters/marisa.jpg",
    "Lily": "/img/characters/lily.jpg",
    "Dee Jay": "/img/characters/deejay.jpg",
    "Cammy": "/img/characters/cammy.jpg",
    "Zangief": "/img/characters/zangief.jpg",
    "Dhalsim": "/img/characters/dhalsim.jpg",
    "E. Honda": "/img/characters/ehonda.jpg",
    "Blanka": "/img/characters/blanka.jpg",
    "Rashid": "/img/characters/rashid.jpg",
    "A.K.I.": "/img/characters/aki.jpg",
    "Ed": "/img/characters/ed.jpg",
    "Akuma": "/img/characters/gouki_akuma.jpg",
    "M. Bison": "/img/characters/vega_mbison.jpg",
    "Terry": "/img/characters/terry.jpg",
    "Mai": "/img/characters/mai.jpg",
    "Elena": "/img/characters/elena.jpg",
    "Sagat": "/img/characters/sagat.jpg",
    "C. Viper": "/img/characters/cviper.jpg",
    "Alex": "/img/characters/alex.jpg"
};

// Name written to `games` when a selection ID is not in CHARACTER_MAP.
const PLACEHOLDER_RE = /^Character (\d+)$/;

function placeholderName(selectionValue) {
    return `Character ${selectionValue}`;
}

function resolveCharacter(selectionValue) {
    return CHARACTER_MAP[selectionValue] || placeholderName(selectionValue);
}

function getCharacterIcon(name) {
    return CHARACTER_ICONS[name] || null;
}

function getCharacterBanner(name) {
    return CHARACTER_BANNERS[name] || null;
}

// Same hygiene as gamertags: a start.gg-controlled string must never carry
// markup or control characters into the DB or a template.
function cleanName(name) {
    return String(name || '').replace(/[<>\x00-\x1F\x7F]/g, '').trim().slice(0, 64);
}

// Only the host the Content Security Policy allows for img-src. start.gg returns
// the URL with a signed query string (ehk=...); the bare path serves the same
// file and is what the static map stores, so the query string is dropped.
// Image types seen: "icon" (the portrait used here) and "stockIcon".
function cleanIconUrl(images) {
    if (!Array.isArray(images)) return null;
    const candidates = images.filter(i => typeof i?.url === 'string' && i.url.startsWith('https://images.start.gg/'));
    const icon = candidates.find(i => i.type === 'icon') || candidates[0];
    return icon ? icon.url.split('?')[0] : null;
}

let lastRefreshAt = 0;
let inflight = null;

// Pull the live roster from start.gg and merge anything new into CHARACTER_MAP
// and CHARACTER_ICONS. Existing entries are left alone. Never throws for a
// missing token; network and API errors propagate so callers can log them.
async function refreshCharacters({ videogameId = SF6_VIDEOGAME_ID, force = false } = {}) {
    if (!process.env.STARTGG_API_TOKEN) {
        return { refreshed: false, reason: 'STARTGG_API_TOKEN not set', added: [] };
    }
    if (!force && Date.now() - lastRefreshAt < REFRESH_INTERVAL_MS) {
        return { refreshed: false, reason: 'recently refreshed', added: [] };
    }
    if (inflight) return inflight;

    inflight = (async () => {
        const { gqlQuery } = require('./startgg-client');
        const data = await gqlQuery(`
            query VideogameCharacters($id: ID!) {
                videogame(id: $id) {
                    id
                    name
                    characters {
                        id
                        name
                        images { url type }
                    }
                }
            }
        `, { id: String(videogameId || SF6_VIDEOGAME_ID) });

        const characters = data?.videogame?.characters || [];
        const added = [];
        for (const c of characters) {
            const id = parseInt(c?.id, 10);
            const name = cleanName(c?.name);
            if (!Number.isInteger(id) || id <= 0 || !name) continue;

            if (!CHARACTER_MAP[id]) {
                CHARACTER_MAP[id] = name;
                added.push(name);
            }
            if (!CHARACTER_ICONS[name]) {
                const icon = cleanIconUrl(c.images);
                if (icon) CHARACTER_ICONS[name] = icon;
            }
        }

        lastRefreshAt = Date.now();
        if (added.length) console.log(`Characters: learned ${added.length} new from start.gg: ${added.join(', ')}`);
        return { refreshed: true, total: characters.length, added };
    })().finally(() => { inflight = null; });

    return inflight;
}

// Games synced before a character was known were stored as "Character <id>".
// Rename those rows to the real name now that CHARACTER_MAP has it.
async function repairPlaceholderCharacters() {
    const pool = require('../db/pool');
    const { rows } = await pool.query(`
        SELECT DISTINCT c FROM (
            SELECT winner_char AS c FROM games
            UNION
            SELECT loser_char AS c FROM games
        ) t
        WHERE c LIKE 'Character %'
    `);

    let updated = 0;
    const renamed = [];
    for (const { c } of rows) {
        const match = PLACEHOLDER_RE.exec(c);
        if (!match) continue;
        const name = CHARACTER_MAP[parseInt(match[1], 10)];
        if (!name) continue;

        const w = await pool.query('UPDATE games SET winner_char = $1 WHERE winner_char = $2', [name, c]);
        const l = await pool.query('UPDATE games SET loser_char = $1 WHERE loser_char = $2', [name, c]);
        updated += w.rowCount + l.rowCount;
        renamed.push(`${c} -> ${name}`);
    }

    if (updated) console.log(`Characters: repaired ${updated} game rows (${renamed.join(', ')})`);
    return { updated, renamed };
}

module.exports = {
    SF6_VIDEOGAME_ID,
    CHARACTER_MAP,
    CHARACTER_ICONS,
    CHARACTER_BANNERS,
    resolveCharacter,
    getCharacterIcon,
    getCharacterBanner,
    refreshCharacters,
    repairPlaceholderCharacters
};
