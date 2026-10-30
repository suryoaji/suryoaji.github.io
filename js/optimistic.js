// Optimistic UI playground: a small feed where likes and deletes either show
// right away (optimistic) or wait for a simulated server. Each post keeps the
// value the server last confirmed, so a failed request rolls back to that, not
// to whatever was on screen. The bill payment always waits: money is never
// shown as done before the server says so.
(function () {
    var root = document.documentElement;
    var app = document.getElementById('ou-app');
    if (!app) return;
    var log = document.getElementById('ou-log');
    var stats = document.getElementById('ou-stats');
    var toast = document.getElementById('ou-toast');
    var latency = document.getElementById('ou-latency');
    var latencyOut = document.getElementById('ou-latency-out');
    var fail = document.getElementById('ou-fail');
    var failOut = document.getElementById('ou-fail-out');
    var modeButtons = document.querySelectorAll('button[data-ou-mode]');

    var copy = {
        en: {
            seconds: function (ms) { return (ms / 1000).toFixed(1) + ' s'; },
            pending: 'waiting…',
            confirmed: 'confirmed',
            rolled: 'rolled back',
            unchanged: 'nothing changed',
            superseded: 'a newer tap decides',
            stats: function (instant, taps, rolled) { return instant + '/' + taps + ' taps instant · ' + rolled + ' rolled back'; },
            likeFailed: 'Couldn\'t save your like. Try again.',
            deleteFailed: 'Couldn\'t delete the post. It\'s back.',
            deleteFailedWait: 'Couldn\'t delete the post. Try again.',
            payFailed: 'Payment didn\'t go through. Nothing was charged.',
            empty: 'Tap something on the phone'
        },
        id: {
            seconds: function (ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' dtk'; },
            pending: 'menunggu…',
            confirmed: 'dikonfirmasi',
            rolled: 'dikembalikan',
            unchanged: 'tidak ada yang berubah',
            superseded: 'ketukan terbaru yang menentukan',
            stats: function (instant, taps, rolled) { return instant + '/' + taps + ' ketukan instan · ' + rolled + ' dikembalikan'; },
            likeFailed: 'Gagal menyimpan suka. Coba lagi.',
            deleteFailed: 'Gagal menghapus postingan. Postingan dikembalikan.',
            deleteFailedWait: 'Gagal menghapus postingan. Coba lagi.',
            payFailed: 'Pembayaran gagal. Tidak ada dana yang terpotong.',
            empty: 'Ketuk sesuatu di ponsel'
        }
    };
    function t() { return copy[root.lang === 'id' ? 'id' : 'en']; }

    var POSTS = [
        ['👩🏻', 'Prita Pitri', 'Paid off my second loan today. The stall is finally full for Eid!', 24],
        ['🧑🏽', 'Connor Wicks', 'Tip: pay installments on Monday, the queue at the agent is shorter.', 11],
        ['🧑🏻', 'Jared Leto', 'Anyone in Group Mawar selling kue basah? Need 50 for Friday.', 6],
        ['👩🏽‍💻', 'Morgan Stark', 'The new savings goal feature is great. Rp 10.000 a day adds up.', 32],
        ['👵🏽', 'Bu Rina', 'Group meeting moved to Thursday 09:00 at my house.', 18]
    ];

    var mode = 'optimistic', posts = [], bill = null, entries = [], taps = 0, instant = 0, rolled = 0;

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }
    var toastTimer = 0;
    function say(text) {
        toast.textContent = text;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
    }

    // The server: answers after the chosen time, sometimes with an error
    function send(method, path, done) {
        var entry = { method: method, path: path, state: 'pending' };
        entries.push(entry);
        paintLog();
        var ms = Number(latency.value) * (0.85 + Math.random() * 0.3);
        var ok = Math.random() * 100 >= Number(fail.value);
        setTimeout(function () {
            entry.ms = ms;
            entry.ok = ok;
            entry.outcome = done(ok);
            entry.state = ok ? 'ok' : 'rolled';
            paintLog();
            paintStats();
        }, ms);
    }
    function logRow(e) {
        var row = el('li', 'sq-' + e.state);
        row.appendChild(el('span', 'sq-time', e.method));
        row.appendChild(el('span', null, e.path));
        var result = e.state === 'pending' ? t().pending
            : (e.ok ? '200 OK' : '500 Error') + ' · ' + t().seconds(e.ms) + ' · ' + t()[e.outcome];
        row.appendChild(el('span', 'sq-result', result));
        return row;
    }
    function paintLog() {
        log.replaceChildren();
        if (!entries.length) { log.appendChild(el('li', 'sq-empty', t().empty)); return; }
        entries.forEach(function (e) { log.appendChild(logRow(e)); });
        log.scrollTop = log.scrollHeight;
    }
    function paintStats() { stats.textContent = t().stats(instant, taps, rolled); }
    function tapped(isInstant) { taps++; if (isInstant) instant++; paintStats(); }

    // ---- Likes ----------------------------------------------------------------
    function paintLike(p) {
        p.likeButton.classList.toggle('is-liked', p.liked);
        p.likeButton.classList.toggle('is-pending', p.inflight > 0 && mode === 'optimistic');
        p.likeButton.disabled = mode === 'wait' && p.inflight > 0;
        p.likeIcon.textContent = p.liked ? '♥' : '♡';
        p.likeCount.textContent = p.base + (p.liked ? 1 : 0);
    }
    function like(p) {
        var want = !p.liked;
        var seq = ++p.seq;
        p.inflight++;
        if (mode === 'optimistic') { p.liked = want; tapped(true); } else { tapped(false); }
        paintLike(p);
        var waiting = mode === 'wait';
        if (waiting) p.likeButton.classList.add('is-busy');
        send(want ? 'POST' : 'DELETE', '/posts/' + p.id + '/like', function (ok) {
            p.inflight--;
            p.likeButton.classList.remove('is-busy');
            var outcome;
            if (ok) {
                if (seq > p.confirmedSeq) { p.confirmed = want; p.confirmedSeq = seq; }
                if (waiting) p.liked = want;
                outcome = 'confirmed';
            } else if (waiting) {
                say(t().likeFailed);
                outcome = 'unchanged';
            } else if (seq === p.seq) {
                // Back to what the server last confirmed, with a message
                p.liked = p.confirmed;
                rolled++;
                p.likeButton.classList.remove('is-wrong');
                void p.likeButton.offsetWidth;
                p.likeButton.classList.add('is-wrong');
                say(t().likeFailed);
                outcome = 'rolled';
            } else {
                outcome = 'superseded';
            }
            paintLike(p);
            return outcome;
        });
    }

    // ---- Delete ---------------------------------------------------------------
    function remove(p) {
        var index = posts.indexOf(p);
        if (index < 0 || p.busy) return;
        p.busy = true;
        if (mode === 'optimistic') {
            tapped(true);
            p.node.classList.add('is-leaving');
            setTimeout(function () { if (p.busy) p.node.remove(); }, 300);
        } else {
            tapped(false);
            p.node.classList.add('is-busy');
            p.deleteButton.replaceChildren(el('span', 'ou-spin'));
        }
        var waiting = mode === 'wait';
        send('DELETE', '/posts/' + p.id, function (ok) {
            if (ok) {
                posts.splice(posts.indexOf(p), 1);
                p.node.classList.add('is-leaving');
                setTimeout(function () { p.node.remove(); }, 300);
                return 'confirmed';
            }
            p.busy = false;
            p.node.classList.remove('is-leaving', 'is-busy');
            p.deleteButton.textContent = '🗑';
            if (waiting) { say(t().deleteFailedWait); return 'unchanged'; }
            // Put it back where it was, and say so
            var next = posts.slice(posts.indexOf(p) + 1).filter(function (q) { return q.node.isConnected; })[0];
            feed.insertBefore(p.node, next ? next.node : null);
            p.node.classList.remove('is-back');
            void p.node.offsetWidth;
            p.node.classList.add('is-back');
            rolled++;
            say(t().deleteFailed);
            return 'rolled';
        });
    }

    // ---- Bill: always waits --------------------------------------------------
    function pay() {
        if (bill.busy || bill.paid) return;
        bill.busy = true;
        tapped(false);
        bill.button.disabled = true;
        bill.button.replaceChildren(el('span', 'ou-spin'), document.createTextNode(' Processing…'));
        send('POST', '/payments', function (ok) {
            bill.busy = false;
            if (ok) {
                bill.paid = true;
                bill.button.textContent = 'Paid ✓';
                bill.button.classList.add('is-done');
                bill.sub.textContent = 'Paid just now';
                return 'confirmed';
            }
            bill.button.disabled = false;
            bill.button.textContent = 'Pay Rp 250.000';
            say(t().payFailed);
            return 'unchanged';
        });
    }

    var feed;
    function build() {
        app.replaceChildren();
        app.appendChild(el('p', 'ou-label', 'Due today'));
        var billRow = el('div', 'ou-bill');
        var info = el('div');
        info.appendChild(el('strong', null, 'Installment 16'));
        var sub = info.appendChild(el('span', null, 'Rp 250.000 · due 12 Nov'));
        billRow.appendChild(info);
        var payButton = el('button', 'ou-btn', 'Pay Rp 250.000');
        payButton.type = 'button';
        payButton.addEventListener('click', pay);
        billRow.appendChild(payButton);
        app.appendChild(billRow);
        bill = { button: payButton, sub: sub, busy: false, paid: false };

        app.appendChild(el('p', 'ou-label', 'Community'));
        feed = el('div', 'ou-feed');
        app.appendChild(feed);
        posts = POSTS.map(function (d, i) {
            var p = { id: i + 1, base: d[3], liked: false, confirmed: false, seq: 0, confirmedSeq: 0, inflight: 0, busy: false };
            var node = el('div', 'ou-post');
            node.appendChild(el('span', 'ou-avatar', d[0]));
            node.appendChild(el('span', 'ou-name', d[1]));
            node.appendChild(el('span', 'ou-text', d[2]));
            var actions = el('div', 'ou-actions');
            var likeButton = el('button', 'ou-act');
            likeButton.type = 'button';
            likeButton.setAttribute('aria-label', 'Like');
            p.likeIcon = likeButton.appendChild(el('span', null, '♡'));
            p.likeCount = likeButton.appendChild(el('span'));
            likeButton.addEventListener('click', function () { like(p); });
            var deleteButton = el('button', 'ou-act', '🗑');
            deleteButton.type = 'button';
            deleteButton.setAttribute('aria-label', 'Delete');
            deleteButton.addEventListener('click', function () { remove(p); });
            actions.appendChild(likeButton);
            actions.appendChild(deleteButton);
            node.appendChild(actions);
            feed.appendChild(node);
            p.node = node;
            p.likeButton = likeButton;
            p.deleteButton = deleteButton;
            paintLike(p);
            return p;
        });
    }
    function reset() {
        entries = []; taps = 0; instant = 0; rolled = 0;
        build();
        paintLog();
        paintStats();
    }

    modeButtons.forEach(function (b) {
        b.addEventListener('click', function () {
            mode = b.dataset.ouMode;
            modeButtons.forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
            posts.forEach(paintLike);
        });
    });
    latency.addEventListener('input', function () { latencyOut.textContent = (Number(latency.value) / 1000).toFixed(1) + ' s'; });
    fail.addEventListener('input', function () { failOut.textContent = fail.value + '%'; });
    document.getElementById('ou-reset').addEventListener('click', reset);
    new MutationObserver(function () { paintLog(); paintStats(); })
        .observe(root, { attributes: true, attributeFilter: ['lang'] });
    reset();
})();
