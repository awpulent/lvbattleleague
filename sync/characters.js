// SF6 character name to icon URL mapping (from start.gg API)
// Update when new DLC characters are added

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
    "Alex": "https://images.start.gg/images/character/2946/image-4c3259ffbe946beba5236a7aea7e56f7.png"
};

// Character name to banner image (locally hosted screenshots from Capcom)
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

function getCharacterIcon(name) {
    return CHARACTER_ICONS[name] || null;
}

function getCharacterBanner(name) {
    return CHARACTER_BANNERS[name] || null;
}

module.exports = { CHARACTER_ICONS, CHARACTER_BANNERS, getCharacterIcon, getCharacterBanner };
