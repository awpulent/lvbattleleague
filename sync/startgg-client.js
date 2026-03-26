const STARTGG_API = 'https://api.start.gg/gql/alpha';

// Simple rate limiter: max 80 requests per 60 seconds
const requestTimestamps = [];
const MAX_REQUESTS = 75; // leave a small buffer
const WINDOW_MS = 60000;

async function rateLimit() {
    const now = Date.now();
    // Remove timestamps outside the window
    while (requestTimestamps.length && requestTimestamps[0] < now - WINDOW_MS) {
        requestTimestamps.shift();
    }
    if (requestTimestamps.length >= MAX_REQUESTS) {
        const waitMs = requestTimestamps[0] + WINDOW_MS - now + 100;
        console.log(`Rate limit: waiting ${waitMs}ms`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    requestTimestamps.push(Date.now());
}

async function gqlQuery(query, variables = {}) {
    await rateLimit();

    const res = await fetch(STARTGG_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.STARTGG_API_TOKEN}`
        },
        body: JSON.stringify({ query, variables })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`start.gg API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (json.errors) {
        throw new Error(`start.gg GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
}

// Get tournament info and SF6 event ID
async function getTournamentEvent(tournamentSlug) {
    const data = await gqlQuery(`
        query TournamentEvents($slug: String!) {
            tournament(slug: $slug) {
                id
                name
                startAt
                events {
                    id
                    name
                    numEntrants
                    videogame { id, name }
                }
            }
        }
    `, { slug: tournamentSlug });

    return data.tournament;
}

// Get event standings
async function getEventStandings(eventId, page = 1, perPage = 50) {
    const data = await gqlQuery(`
        query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
            event(id: $eventId) {
                standings(query: { page: $page, perPage: $perPage }) {
                    pageInfo { totalPages }
                    nodes {
                        placement
                        entrant {
                            id
                            name
                            participants {
                                player { id, gamerTag }
                            }
                        }
                    }
                }
            }
        }
    `, { eventId: String(eventId), page, perPage });

    return data.event.standings;
}

// Get event sets with game data
async function getEventSets(eventId, page = 1, perPage = 10) {
    const data = await gqlQuery(`
        query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {
            event(id: $eventId) {
                sets(page: $page, perPage: $perPage, sortType: ROUND) {
                    pageInfo { totalPages }
                    nodes {
                        id
                        fullRoundText
                        winnerId
                        displayScore
                        slots {
                            entrant {
                                id
                                participants {
                                    player { id, gamerTag }
                                }
                            }
                            standing {
                                stats {
                                    score { value }
                                }
                            }
                        }
                        games {
                            orderNum
                            winnerId
                            selections {
                                entrant {
                                    id
                                    participants {
                                        player { id }
                                    }
                                }
                                selectionValue
                            }
                        }
                    }
                }
            }
        }
    `, { eventId: String(eventId), page, perPage });

    return data.event.sets;
}

module.exports = { gqlQuery, getTournamentEvent, getEventStandings, getEventSets };
