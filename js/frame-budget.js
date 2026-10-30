// Frame budget playground: a list that scrolls on its own while each new row
// costs some work. On the main thread that work lands inside the frame, so a
// frame that runs past the budget (16.7 ms at 60 Hz, 8.3 ms at 120 Hz) keeps
// the old picture on screen and the list jumps. On a background thread the
// frame stays cheap and the row shows a placeholder until its data is ready.
// Nothing here really blocks the browser: frame costs are simulated.
(function () {
    var root = document.documentElement;
    var list = document.getElementById('fb-list');
    if (!list) return;
    var canvas = document.getElementById('fb-chart');
    var ctx = canvas.getContext('2d');
    var stats = document.getElementById('fb-stats');
    var fps = document.getElementById('fb-fps');
    var budgetLabel = document.getElementById('fb-budget');
    var slider = document.getElementById('fb-work');
    var sliderOut = document.getElementById('fb-work-out');
    var playButton = document.getElementById('fb-play');
    var playLabel = document.getElementById('fb-play-label');
    var hzButtons = document.querySelectorAll('button[data-fb-hz]');
    var threadButtons = document.querySelectorAll('button[data-fb-thread]');
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var copy = {
        en: {
            play: 'Play', pause: 'Pause',
            stats: function (late, pct) { return late + (late === 1 ? ' late frame' : ' late frames') + ' · ' + pct + '% on time'; },
            budget: function (ms) { return 'budget ' + ms + ' ms'; }
        },
        id: {
            play: 'Putar', pause: 'Jeda',
            stats: function (late, pct) { return late + ' frame terlambat · ' + pct + '% tepat waktu'; },
            budget: function (ms) { return 'anggaran ' + ms.replace('.', ',') + ' ms'; }
        }
    };
    function t() { return copy[root.lang === 'id' ? 'id' : 'en']; }

    var ROWS = [
        ['💸', 'Transfer to Prita', 'Today, 09:12', '−Rp 150.000'],
        ['🧾', 'Electricity token', 'Today, 08:40', '−Rp 100.000'],
        ['💵', 'Installment paid', 'Yesterday', '−Rp 250.000'],
        ['🎁', 'Cashback', 'Yesterday', '+Rp 25.000'],
        ['📱', 'Phone credit', 'Mon, 19:03', '−Rp 50.000'],
        ['🏦', 'Savings top-up', 'Mon, 08:00', '−Rp 200.000'],
        ['🍜', 'Warung Bu Tini', 'Sun, 12:41', '−Rp 28.000'],
        ['💧', 'Water bill', 'Sat, 10:15', '−Rp 82.000'],
        ['📈', 'Investment return', 'Fri', '+Rp 41.500'],
        ['🚌', 'Bus ticket', 'Thu, 07:20', '−Rp 12.000']
    ];
    var ROW_H = 64;
    var SPEED = 0.42; // px per ms of scrolling
    var BASE = 3.2; // ms every frame costs anyway (layout, paint)

    var hz = 60, thread = 'main', work = Number(slider.value), playing = !reduceMotion, visible = false;
    var simNow = 0, last = 0, nextPresent = 0, shownAt = 0, bound = -1, workerFree = 0;
    var ready = {}; // row index -> sim time its data is ready (background mode)
    var history = []; // { cost, late }
    var presents = []; // sim times of presented frames, for the fps badge

    // A pool of row views, moved as the list scrolls
    var pool = [];
    for (var i = 0; i < 12; i++) {
        var row = document.createElement('div');
        row.className = 'fb-row';
        row.innerHTML = '<span class="fb-avatar"></span><span class="fb-text"><strong></strong><span></span></span><span class="fb-amount"></span>';
        list.appendChild(row);
        pool.push({ node: row, avatar: row.children[0], title: row.children[1].children[0], sub: row.children[1].children[1], amount: row.children[2], index: -1, pending: null });
    }

    function budget() { return 1000 / hz; }
    // Switching threads rebinds only the rows on screen now, not the whole list so far
    function reset() {
        bound = Math.floor(shownAt * SPEED / ROW_H) - 1; ready = {}; workerFree = simNow; history = [];
    }

    // One device frame: the work it does decides when the next one can show
    function frame(at) {
        shownAt = at;
        presents.push(at);
        var pos = at * SPEED;
        var lastRow = Math.floor((pos + list.clientHeight) / ROW_H);
        var fresh = Math.max(0, lastRow - bound);
        var cost = BASE + Math.random() * 1.4;
        if (fresh > 0) {
            if (thread === 'main') {
                cost += fresh * work;
            } else {
                // The worker takes rows one by one; the frame only posts the job
                for (var i = bound + 1; i <= lastRow; i++) {
                    workerFree = Math.max(workerFree, at) + work;
                    ready[i] = workerFree;
                }
                cost += 0.4 * fresh;
            }
            bound = lastRow;
        }
        var b = budget();
        history.push({ cost: cost, late: cost > b });
        if (history.length > hz * 2) history.shift();
        // A late frame holds the screen until the next vsync after it finishes
        return at + Math.max(1, Math.ceil(cost / b)) * b;
    }

    function paintList() {
        var pos = shownAt * SPEED;
        var first = Math.floor(pos / ROW_H);
        pool.forEach(function (view, k) {
            var index = first + k;
            var data = ROWS[((index % ROWS.length) + ROWS.length) % ROWS.length];
            if (view.index !== index) {
                view.index = index;
                view.avatar.textContent = data[0];
                view.title.textContent = data[1];
                view.sub.textContent = data[2];
                view.amount.textContent = data[3];
                view.amount.classList.toggle('is-in', data[3][0] === '+');
            }
            var pending = thread === 'background' && ready[index] > shownAt;
            if (pending !== view.pending) { view.pending = pending; view.node.classList.toggle('is-pending', pending); }
            view.node.style.transform = 'translateY(' + (index * ROW_H - pos) + 'px)';
        });
    }

    function color(name) { return getComputedStyle(canvas).getPropertyValue(name).trim(); }
    function paintChart() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        var b = budget(), top = b * 3; // the chart shows up to three budgets
        var slots = hz * 2, bw = w / slots;
        var ok = color('--ok'), bad = color('--bad');
        history.forEach(function (f, i) {
            var bh = Math.min(h, f.cost / top * h);
            ctx.fillStyle = f.late ? bad : ok;
            ctx.globalAlpha = f.late ? 0.9 : 0.55;
            ctx.fillRect(i * bw + bw * 0.15, h - bh, Math.max(1, bw * 0.7), bh);
        });
        ctx.globalAlpha = 1;
        var y = h - b / top * h;
        ctx.strokeStyle = color('--muted');
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.setLineDash([]);
        var late = history.filter(function (f) { return f.late; }).length;
        stats.textContent = t().stats(late, history.length ? Math.round((1 - late / history.length) * 100) : 100);
        budgetLabel.textContent = t().budget(b.toFixed(1));
        while (presents.length && presents[0] < simNow - 1000) presents.shift();
        fps.textContent = presents.length + ' fps';
    }

    var raf = 0;
    function tick(now) {
        var dt = Math.min(100, now - last);
        last = now;
        if (playing) {
            simNow += dt;
            // 120 Hz in a 60 Hz browser: several device frames can happen per tick
            while (nextPresent <= simNow) nextPresent = frame(nextPresent);
            paintList();
        }
        paintChart();
        raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
    }
    function wake() {
        if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    function press(buttons, attr, value) {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value))); });
    }
    hzButtons.forEach(function (b) {
        b.addEventListener('click', function () { hz = Number(b.dataset.fbHz); press(hzButtons, 'fbHz', hz); history = []; nextPresent = simNow; paintChart(); });
    });
    threadButtons.forEach(function (b) {
        b.addEventListener('click', function () { thread = b.dataset.fbThread; press(threadButtons, 'fbThread', thread); reset(); paintList(); });
    });
    slider.addEventListener('input', function () { work = Number(slider.value); sliderOut.textContent = work + ' ms'; });
    function paintPlay() {
        playButton.setAttribute('aria-pressed', String(playing));
        playLabel.textContent = playing ? t().pause : t().play;
        playButton.title = playLabel.textContent;
    }
    playButton.addEventListener('click', function () { playing = !playing; paintPlay(); });
    new MutationObserver(function () { paintPlay(); paintChart(); }).observe(root, { attributes: true, attributeFilter: ['lang'] });

    // Only run while the tab is open and on screen
    new IntersectionObserver(function (entries) {
        visible = entries.some(function (e) { return e.isIntersecting; });
        wake();
    }).observe(list);
    document.addEventListener('visibilitychange', wake);
    paintPlay();
    paintList();
    paintChart();
})();
