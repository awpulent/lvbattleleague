// LVBL Overlay Configuration
// Edit these values for your setup

const LVBL_CONFIG = {
    // API endpoint — your LVBL site URL
    apiUrl: 'https://lvbattleleague-version2-5pyo8.ondigitalocean.app',

    // Overlay API key — get this from your league admin
    apiKey: 'YOUR_OVERLAY_API_KEY',

    // Path to StreamControl's JSON output (relative to this file)
    streamControlJson: '../sc/streamcontrol.json',

    // How often to poll streamcontrol.json (ms)
    pollInterval: 500,

    // How often to refresh stats from API (ms) — only fetches when players change
    statsRefreshInterval: 5000
};
