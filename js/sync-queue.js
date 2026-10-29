// Offline sync playground: a phone's outbox of field-work jobs that run in
// order, stop when the connection drops and pick up again when it's back.
// Uploads resume from the last confirmed chunk. A request that reached the
// server but lost its reply is sent again with the same idempotency key, so
// the server returns the record it already has instead of writing a second one.
(function () {
    var root = document.documentElement;
    var list = document.getElementById('sq-jobs');
    if (!list) return;
    var log = document.getElementById('sq-log');
    var netLabel = document.getElementById('sq-net-label');
    var countLabel = document.getElementById('sq-count');
    var idempotency = document.getElementById('sq-idem');
    var netButtons = document.querySelectorAll('button[data-sq-net]');

    var copy = {
        en: {
            online: 'Online',
            offline: function (n) { return 'Offline · ' + n + (n === 1 ? ' job waiting' : ' jobs waiting'); },
            states: { queued: 'Queued', sending: 'Sending', paused: 'Waiting for signal', unconfirmed: 'Sent, no reply', done: 'Synced' },
            resumed: function (kb) { return 'resumes at ' + kb + ' KB'; },
            created: '201 Created',
            replayed: '200 Already processed · same record',
            duplicate: '201 Created · duplicate!',
            count: function (r, d) { return r + (r === 1 ? ' record' : ' records') + ' · ' + d + (d === 1 ? ' duplicate' : ' duplicates'); },
            empty: 'No requests yet'
        },
        id: {
            online: 'Online',
            offline: function (n) { return 'Offline · ' + n + ' job menunggu'; },
            states: { queued: 'Antre', sending: 'Mengirim', paused: 'Menunggu sinyal', unconfirmed: 'Terkirim, belum dibalas', done: 'Tersinkron' },
            resumed: function (kb) { return 'lanjut dari ' + kb + ' KB'; },
            created: '201 Created',
            replayed: '200 Sudah diproses · record yang sama',
            duplicate: '201 Created · duplikat!',
            count: function (r, d) { return r + ' record · ' + d + ' duplikat'; },
            empty: 'Belum ada request'
        }
    };
    function t() { return copy[root.lang === 'id' ? 'id' : 'en']; }

    var TYPES = {
        visit: { icon: '📍', en: 'Visit check-in', id: 'Check-in kunjungan', endpoint: 'POST /visits', kb: 4 },
        loan: { icon: '📝', en: 'Loan application', id: 'Pengajuan pinjaman', endpoint: 'POST /loans', kb: 36 },
        photo: { icon: '🪪', en: 'KTP photo', id: 'Foto KTP', endpoint: 'PUT /uploads', kb: 900, chunk: 256 },
        repay: { icon: '💵', en: 'Repayment Rp 250.000', id: 'Pembayaran Rp 250.000', endpoint: 'POST /repayments', kb: 3 }
    };
    var RATE = 180; // KB per second; any request takes at least MIN seconds
    var MIN = 0.6;
    var REPLY = 0.35; // seconds between the server writing and the phone hearing back

    // Starts offline, like an agent out of signal: jobs pile up until you go online
    var online = false, jobs = [], records = {}, recordCount = 0, duplicates = 0, entries = [];
    // The queue waits until the section is on screen, so visitors see it run
    var started = false;

    function key() { return Math.random().toString(16).slice(2, 10); }
    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function addJob(type) {
        var spec = TYPES[type];
        var job = { type: type, spec: spec, key: key(), state: 'queued', sent: 0, wait: 0, resumeAt: 0 };
        var row = el('li', 'sq-job');
        row.appendChild(el('span', 'sq-icon', spec.icon));
        job.name = row.appendChild(el('span', 'sq-name'));
        job.badge = row.appendChild(el('span', 'sq-state'));
        job.meta = row.appendChild(el('span', 'sq-meta'));
        var bar = row.appendChild(el('span', 'sq-bar'));
        job.fill = bar.appendChild(el('i'));
        job.row = row;
        list.appendChild(row);
        jobs.push(job);
        paintJob(job);
        paintHeader();
    }

    function paintJob(job) {
        var lang = root.lang === 'id' ? 'id' : 'en';
        job.row.dataset.state = job.state;
        job.name.textContent = job.spec[lang];
        job.badge.textContent = t().states[job.state];
        var meta = job.spec.endpoint + ' · key ' + job.key;
        if (job.spec.chunk && job.state !== 'done') meta += ' · ' + Math.round(job.sent) + ' / ' + job.spec.kb + ' KB';
        if (job.state === 'paused' && job.resumeAt) meta += ' · ' + t().resumed(job.resumeAt);
        job.meta.textContent = meta;
        job.fill.style.width = (job.state === 'done' ? 100 : Math.min(100, job.sent / job.spec.kb * 100)) + '%';
    }
    function paintHeader() {
        var waiting = jobs.filter(function (j) { return j.state !== 'done'; }).length;
        netLabel.textContent = online ? t().online : t().offline(waiting);
        netLabel.dataset.online = String(online);
        countLabel.textContent = t().count(recordCount, duplicates);
    }
    function paintLog() {
        log.replaceChildren();
        if (!entries.length) { log.appendChild(el('li', 'sq-empty', t().empty)); return; }
        entries.forEach(function (e) { log.appendChild(logRow(e)); });
    }
    function logRow(e) {
        var row = el('li', 'sq-' + e.kind);
        row.appendChild(el('span', 'sq-time', e.time));
        row.appendChild(el('span', null, e.endpoint + ' · key ' + e.key));
        row.appendChild(el('span', 'sq-result', t()[e.kind]));
        return row;
    }

    // The server: one record per idempotency key, unless keys are switched off
    function serverReceive(job) {
        var kind;
        if (idempotency.checked && records[job.key]) {
            kind = 'replayed';
        } else {
            kind = records[job.key] ? 'duplicate' : 'created';
            if (kind === 'duplicate') duplicates++;
            records[job.key] = true;
            recordCount++;
        }
        var now = new Date();
        var entry = { time: now.toTimeString().slice(0, 8), endpoint: job.spec.endpoint, key: job.key, kind: kind };
        entries.push(entry);
        if (entries.length === 1) log.replaceChildren();
        log.appendChild(logRow(entry));
        log.scrollTop = log.scrollHeight;
    }

    // Jobs run one at a time, in the order they were made
    function step(dt) {
        if (!online || !started) return;
        var job = jobs.filter(function (j) { return j.state !== 'done'; })[0];
        if (!job) return;
        if (job.state !== 'sending') {
            // unconfirmed: only the reply was lost, so the same request (same key) goes out again
            job.state = 'sending';
            job.resumeAt = 0;
            job.wait = 0;
        }
        if (job.sent < job.spec.kb) {
            job.sent = Math.min(job.spec.kb, job.sent + job.spec.kb / Math.max(MIN, job.spec.kb / RATE) * dt);
            if (job.sent >= job.spec.kb) serverReceive(job);
        } else if (job.retry) {
            job.retry = false;
            serverReceive(job);
        } else {
            job.wait += dt;
            if (job.wait >= REPLY) job.state = 'done';
        }
        paintJob(job);
        if (job.state === 'done') paintHeader();
    }

    function setOnline(value) {
        if (online === value) return;
        online = value;
        netButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sqNet === (value ? 'online' : 'offline'))); });
        if (!value) {
            jobs.forEach(function (job) {
                if (job.state !== 'sending') return;
                if (job.sent >= job.spec.kb) {
                    // The server already has it; the phone just never heard back
                    job.state = 'unconfirmed';
                    job.retry = true;
                } else if (job.spec.chunk) {
                    // Chunked upload: keep every chunk the server confirmed
                    job.sent = Math.floor(job.sent / job.spec.chunk) * job.spec.chunk;
                    job.resumeAt = job.sent;
                    job.state = 'paused';
                } else {
                    // A small request that never arrived starts over
                    job.sent = 0;
                    job.state = 'paused';
                }
                paintJob(job);
            });
        }
        paintHeader();
    }

    function reset() {
        jobs = []; records = {}; recordCount = 0; duplicates = 0; entries = [];
        list.replaceChildren();
        paintLog();
        ['loan', 'photo', 'repay', 'visit'].forEach(addJob);
        paintHeader();
    }

    netButtons.forEach(function (b) {
        b.addEventListener('click', function () { setOnline(b.dataset.sqNet === 'online'); });
    });
    document.querySelectorAll('button[data-sq-add]').forEach(function (b) {
        b.addEventListener('click', function () { addJob(b.dataset.sqAdd); });
    });
    document.getElementById('sq-reset').addEventListener('click', reset);
    new MutationObserver(function () { jobs.forEach(paintJob); paintHeader(); paintLog(); })
        .observe(root, { attributes: true, attributeFilter: ['lang'] });

    var last = performance.now();
    setInterval(function () {
        var now = performance.now();
        step(Math.min(0.25, (now - last) / 1000));
        last = now;
    }, 100);
    reset();
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            if (entries.some(function (e) { return e.isIntersecting; })) { started = true; io.disconnect(); }
        }, { threshold: 0.3 });
        io.observe(list);
    } else {
        started = true;
    }
})();
