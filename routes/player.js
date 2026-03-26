const express = require('express');
const router = express.Router();
const { getPlayer, getOverallRecord, getHeadToHead, getCharacterUsage, getMatchHistory, getSeasonPlacements } = require('../queries/players');
const { CHARACTER_ICONS, getCharacterBanner } = require('../sync/characters');

router.get('/:id', async (req, res) => {
    try {
        const playerId = parseInt(req.params.id);
        const player = await getPlayer(playerId);

        if (!player) {
            return res.status(404).render('error', { message: 'Player not found' });
        }

        const [record, h2h, characters, matches, seasonHistory] = await Promise.all([
            getOverallRecord(playerId),
            getHeadToHead(playerId),
            getCharacterUsage(playerId),
            getMatchHistory(playerId),
            getSeasonPlacements(playerId)
        ]);

        const winrate = (parseInt(record.wins) + parseInt(record.losses)) > 0
            ? ((parseInt(record.wins) / (parseInt(record.wins) + parseInt(record.losses))) * 100).toFixed(1)
            : '0.0';

        // Get banner from most played character
        const topChar = characters.length > 0 ? characters[0].character : null;
        const bannerUrl = topChar ? getCharacterBanner(topChar) : null;

        res.render('player', {
            player,
            record,
            winrate,
            h2h,
            characters,
            matches,
            seasonHistory,
            charIcons: CHARACTER_ICONS,
            bannerUrl
        });
    } catch (err) {
        console.error('Player page error:', err);
        res.status(500).render('error', { message: 'Failed to load player data.' });
    }
});

module.exports = router;
