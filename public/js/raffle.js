/* LV Battle League — prize raffle.
 * Loaded as an external file because the site's CSP blocks inline scripts
 * (script-src 'self'). Entry data is handed over via a <script type=
 * "application/json" id="raffle-data"> block, which CSP treats as data, not code. */
(function () {
    'use strict';

    const data = JSON.parse(document.getElementById('raffle-data').textContent);
    const SEASON_NAME = data.season || 'Season';
    const INITIAL_ENTRIES = Array.isArray(data.entries) ? data.entries : [];

    // ---- state ----
    let pool = INITIAL_ENTRIES.map(e => ({ name: e.name, points: e.points }));
    const winners = [];
    let drawing = false;
    let prizeNo = 1;
    let muted = false;

    const $ = id => document.getElementById(id);
    const stage = $('stage'), reel = $('reel'), reelMeta = $('reelMeta'),
          stageLabel = $('stageLabel'), drawBtn = $('drawBtn'), redrawBtn = $('redrawBtn'),
          winnerList = $('winnerList'), prizeName = $('prizeName');

    function fmt(n) { return n.toLocaleString('en-US'); }
    function entriesLeft() { return pool.reduce((s, p) => s + p.points, 0); }

    function updateStats() {
        $('poolCount').textContent = fmt(pool.length);
        $('entryCount').textContent = fmt(entriesLeft());
        $('prizeNum').textContent = 'Prize #' + prizeNo;
        redrawBtn.disabled = drawing || !winners.length;
        if (!drawing) {
            if (!pool.length) {
                drawBtn.disabled = true;
                drawBtn.textContent = 'ALL PRIZES DRAWN';
            } else {
                drawBtn.disabled = false;
                drawBtn.textContent = 'DRAW WINNER';
            }
        }
    }

    function stageIdle(msg) {
        stage.className = 'stage idle';
        reel.textContent = msg || 'Tap DRAW';
        stageLabel.textContent = 'Ready';
        reelMeta.textContent = '';
    }

    // ---- weighted random pick ----
    function weightedPick() {
        const total = entriesLeft();
        let r = Math.random() * total;
        for (const p of pool) { r -= p.points; if (r < 0) return p; }
        return pool[pool.length - 1];
    }

    // ---- sound (WebAudio, no assets) ----
    let actx = null;
    function audio() {
        if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
        return actx;
    }
    function blip(freq, dur, type, gain) {
        if (muted) return; const a = audio(); if (!a) return;
        const o = a.createOscillator(), g = a.createGain();
        o.type = type || 'square'; o.frequency.value = freq;
        g.gain.value = gain || 0.04;
        o.connect(g); g.connect(a.destination);
        const t = a.currentTime;
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.05));
        o.start(t); o.stop(t + (dur || 0.05));
    }
    function tick() { blip(420 + Math.random() * 80, 0.03, 'square', 0.03); }
    function fanfare() {
        if (muted) return;
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.5, 'triangle', 0.06), i * 90));
    }

    // ---- draw ----
    function draw() {
        if (drawing || !pool.length) return;
        const winner = weightedPick();
        const oddsPct = winner.points / entriesLeft() * 100;
        drawing = true;
        drawBtn.classList.add('spinning');
        drawBtn.textContent = 'DRAWING…';
        redrawBtn.disabled = true;
        stage.className = 'stage spin';
        stageLabel.textContent = (prizeName.value.trim() || ('Prize #' + prizeNo)).toUpperCase();
        reelMeta.textContent = '';
        try { audio() && audio().resume && audio().resume(); } catch (e) {}

        const start = performance.now();
        const duration = 4200;
        let lastFlip = 0;
        function frame(now) {
            const t = Math.min(1, (now - start) / duration);
            if (t >= 1) { reel.textContent = winner.name; finish(winner, oddsPct); return; }
            const ease = 1 - Math.pow(1 - t, 3);     // slows toward the end
            const interval = 45 + ease * 280;
            if (now - lastFlip >= interval) {
                lastFlip = now;
                reel.textContent = pool[Math.floor(Math.random() * pool.length)].name;
                tick();
            }
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    function finish(winner, oddsPct) {
        stage.className = 'stage win';
        reelMeta.textContent = fmt(winner.points) + ' entries · ' + oddsPct.toFixed(1) + '% odds';
        fanfare();
        burst();
        if (navigator.vibrate) navigator.vibrate([0, 60, 40, 120]);

        const prizeLabel = prizeName.value.trim() || ('Prize #' + prizeNo);
        winners.push({ prize: prizeLabel, name: winner.name, points: winner.points });
        renderWinners();

        pool = pool.filter(p => p !== winner);   // winner out of the pool for later prizes
        prizeNo++;
        prizeName.value = '';

        drawing = false;
        drawBtn.classList.remove('spinning');
        updateStats();
    }

    // ---- redraw: last winner wasn't present, draw the SAME prize again ----
    function redraw() {
        if (drawing || !winners.length) return;
        const last = winners.pop();              // drop them from the results
        // NOT returned to the pool — absent means they forfeit this and later prizes
        prizeNo = Math.max(1, prizeNo - 1);      // step back to the same prize number
        if (last.prize && last.prize !== ('Prize #' + prizeNo)) prizeName.value = last.prize; // keep custom label
        renderWinners();
        if (!pool.length) { stageIdle('🏆'); updateStats(); toast('No players left to draw'); return; }
        toast(last.name + ' not present — redrawing prize #' + prizeNo);
        updateStats();
        draw();
    }

    function renderWinners() {
        if (!winners.length) {
            winnerList.innerHTML = '<li class="empty">No winners yet — draw the first prize!</li>';
            return;
        }
        winnerList.innerHTML = '';
        winners.forEach(w => {
            const li = document.createElement('li');
            const prize = document.createElement('span'); prize.className = 'w-prize'; prize.textContent = w.prize;
            const name = document.createElement('span'); name.className = 'w-name'; name.textContent = w.name;
            const pts = document.createElement('span'); pts.className = 'w-pts'; pts.textContent = fmt(w.points) + ' ent';
            li.append(prize, name, pts);
            winnerList.appendChild(li);
        });
        winnerList.scrollTop = winnerList.scrollHeight;
    }

    // ---- undo: put the last winner BACK in the pool (misdraw, not absence) ----
    function undo() {
        if (drawing || !winners.length) return;
        const last = winners.pop();
        pool.push({ name: last.name, points: last.points });
        prizeNo = Math.max(1, prizeNo - 1);
        renderWinners();
        stageIdle();
        updateStats();
        toast('Undid ' + last.name);
    }

    function copyResults() {
        if (!winners.length) return toast('No winners yet');
        const lines = [SEASON_NAME + ' — Raffle Winners', ''];
        winners.forEach(w => lines.push(w.prize + ': ' + w.name + ' (' + w.points + ' entries)'));
        const text = lines.join('\n');
        const done = () => toast('Results copied');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else { fallbackCopy(text, done); }
    }
    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea'); ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove();
    }

    function reset() {
        if (drawing) return;
        if (!confirm('Reset the raffle? All ' + winners.length + ' drawn winner(s) will be cleared and everyone returns to the pool.')) return;
        pool = INITIAL_ENTRIES.map(e => ({ name: e.name, points: e.points }));
        winners.length = 0; prizeNo = 1;
        renderWinners();
        stageIdle();
        updateStats();
        toast('Raffle reset');
    }

    // ---- toast ----
    let toastTimer;
    function toast(msg) {
        const el = $('toast'); el.textContent = msg; el.classList.add('show');
        clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
    }

    // ---- confetti ----
    const cv = $('confetti'), cx = cv.getContext('2d');
    let parts = [], rafC = null;
    function sizeCanvas() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
    sizeCanvas(); window.addEventListener('resize', sizeCanvas);
    const COLORS = ['#FFD700', '#FF1744', '#00E5FF', '#ffffff', '#ffb300'];
    function burst() {
        for (let i = 0; i < 140; i++) {
            parts.push({
                x: window.innerWidth / 2, y: window.innerHeight * 0.38,
                vx: (Math.random() - 0.5) * 16, vy: Math.random() * -16 - 4,
                g: 0.4 + Math.random() * 0.3, s: 4 + Math.random() * 6,
                rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
                c: COLORS[Math.floor(Math.random() * COLORS.length)], life: 120
            });
        }
        if (!rafC) loopC();
    }
    function loopC() {
        cx.clearRect(0, 0, cv.width, cv.height);
        parts.forEach(p => {
            p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
            cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c;
            cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); cx.restore();
        });
        parts = parts.filter(p => p.life > 0 && p.y < cv.height + 40);
        if (parts.length) { rafC = requestAnimationFrame(loopC); }
        else { cx.clearRect(0, 0, cv.width, cv.height); rafC = null; }
    }

    // ---- wiring ----
    drawBtn.addEventListener('click', draw);
    redrawBtn.addEventListener('click', redraw);
    $('undoBtn').addEventListener('click', undo);
    $('copyBtn').addEventListener('click', copyResults);
    $('resetBtn').addEventListener('click', reset);
    $('muteBtn').addEventListener('click', () => {
        muted = !muted;
        $('muteBtn').textContent = muted ? '🔇' : '🔊';
        if (!muted) blip(660, 0.06, 'triangle', 0.05);
    });
    $('fsBtn').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    });
    prizeName.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

    if (!pool.length) {
        reel.textContent = 'No entries';
        stageLabel.textContent = 'Nothing to raffle';
        drawBtn.disabled = true;
    }
    updateStats();
})();
