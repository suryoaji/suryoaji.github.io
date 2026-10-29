// First-visit tips for the playground: a short tour per tab that dims the page,
// lights up one control at a time and explains it. Each tour shows once (kept in
// localStorage); the "?" button next to the tabs plays the current one again.
(function () {
    var root = document.documentElement;
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function group(selector) {
        return function () { var node = document.querySelector(selector); return node && node.closest('.pg-group'); };
    }
    function one(selector) { return function () { return document.querySelector(selector); }; }

    var TOURS = {
        sdui: [
            { target: one('.pg-tabs'),
              en: ['Two playgrounds', 'Server-driven UI and offline sync each have a tab. Switch any time.'],
              id: ['Dua playground', 'Server-driven UI dan offline sync punya tab masing-masing. Pindah kapan saja.'] },
            { target: group('button[data-preset]'),
              en: ['Start from a preset', 'Each preset is a payload the server could send: a campaign, an A/B test, or a component the old app doesn\'t know.'],
              id: ['Mulai dari contoh', 'Setiap contoh adalah payload yang bisa dikirim server: kampanye, eksperimen A/B, atau komponen yang belum dikenal aplikasi lama.'] },
            { target: one('.pg-editor'),
              en: ['Edit the JSON', 'You are the server. Change a title or reorder components and the phone redraws.'],
              id: ['Ubah JSON-nya', 'Kamu berperan sebagai server. Ubah judul atau urutan komponen, dan ponsel akan menggambar ulang.'] },
            { target: one('.sim-toolbar'),
              en: ['Use the phone', 'Tap banners and tabs on the screen. The toolbar switches light and dark, replays the animations and folds the iPhone Duo.'],
              id: ['Pakai ponselnya', 'Ketuk banner dan tab di layar. Toolbar mengganti mode terang/gelap, memutar ulang animasi, dan melipat iPhone Duo.'] },
            { target: group('button[data-network]'),
              en: ['Try a bad connection', 'Slow 3G shows a skeleton; offline keeps the cached screen until you are back online.'],
              id: ['Coba koneksi buruk', '3G lambat menampilkan skeleton; saat offline layar dari cache tetap tampil sampai online lagi.'] },
            { target: one('#pg-share'),
              en: ['Share what you built', 'Copies a link that opens this exact payload.'],
              id: ['Bagikan hasilnya', 'Menyalin link yang membuka payload ini.'] }
        ],
        'offline-sync': [
            { target: group('button[data-sq-net]'),
              en: ['You start offline', 'Like a field agent with no signal: jobs wait in the outbox. Tap the Wi-Fi icon to go online.'],
              id: ['Kamu mulai dalam kondisi offline', 'Seperti agen lapangan tanpa sinyal: job menunggu di outbox. Ketuk ikon Wi-Fi untuk online.'] },
            { target: group('button[data-sq-add]'),
              en: ['Add more work', 'Every tap puts a job at the end of the queue. Jobs always run in order.'],
              id: ['Tambah pekerjaan', 'Setiap ketukan menaruh job di akhir antrean. Job selalu dijalankan berurutan.'] },
            { target: one('.sq-grid'),
              en: ['Watch both sides', 'Left is the outbox on the phone, right is what the server received. Go offline halfway through the photo upload and see where it resumes.'],
              id: ['Lihat kedua sisi', 'Kiri adalah outbox di ponsel, kanan yang diterima server. Coba offline di tengah upload foto dan lihat dari mana ia lanjut.'] },
            { target: one('.sq-toggle'),
              en: ['Break it on purpose', 'Switch idempotency keys off, cut the signal right after a job is sent, and the server writes it twice.'],
              id: ['Coba rusak dengan sengaja', 'Matikan idempotency key, putuskan sinyal tepat setelah job terkirim, dan server akan mencatatnya dua kali.'] }
        ]
    };
    var COPY = {
        en: { skip: 'Skip', next: 'Next', done: 'Got it' },
        id: { skip: 'Lewati', next: 'Lanjut', done: 'Mengerti' }
    };
    function lang() { return root.lang === 'id' ? 'id' : 'en'; }

    function seen(name, value) {
        try {
            if (value) { localStorage.setItem('pg-tips-' + name, '1'); return true; }
            return localStorage.getItem('pg-tips-' + name) === '1';
        } catch (e) { return value ? true : false; }
    }

    // One overlay for every tour: a click blocker, the spotlight (its huge
    // shadow dims the rest of the page) and the card with the text
    var blocker = document.createElement('div');
    blocker.className = 'cm-block';
    var spot = document.createElement('div');
    spot.className = 'cm-spot';
    var card = document.createElement('div');
    card.className = 'cm-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.innerHTML = '<p class="cm-step"></p><h3 class="cm-title" id="cm-title"></h3><p class="cm-text"></p>' +
        '<div class="cm-actions"><button type="button" class="cm-skip"></button><button type="button" class="cm-next"></button></div>';
    card.setAttribute('aria-labelledby', 'cm-title');
    var skipButton = card.querySelector('.cm-skip');
    var nextButton = card.querySelector('.cm-next');

    var tour = null, name = '', index = 0, target = null, previousFocus = null;

    function open(tourName) {
        if (tour) close();
        tour = TOURS[tourName].filter(function (step) { var node = step.target(); return node && node.offsetParent; });
        if (!tour.length) { tour = null; return; }
        name = tourName;
        previousFocus = document.activeElement;
        document.body.append(blocker, spot, card);
        requestAnimationFrame(function () { blocker.classList.add('show'); });
        window.addEventListener('scroll', place, { passive: true });
        window.addEventListener('resize', place);
        document.addEventListener('keydown', onKey, true);
        go(0);
    }
    function close() {
        if (!tour) return;
        seen(name, true);
        tour = null;
        blocker.classList.remove('show');
        [blocker, spot, card].forEach(function (node) { node.remove(); });
        window.removeEventListener('scroll', place);
        window.removeEventListener('resize', place);
        document.removeEventListener('keydown', onKey, true);
        if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    }
    function go(i) {
        index = i;
        var step = tour[i];
        target = step.target();
        paint();
        target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        place();
        nextButton.focus({ preventScroll: true });
    }
    function paint() {
        if (!tour) return;
        var text = tour[index][lang()], copy = COPY[lang()];
        card.querySelector('.cm-step').textContent = (index + 1) + ' / ' + tour.length;
        card.querySelector('.cm-title').textContent = text[0];
        card.querySelector('.cm-text').textContent = text[1];
        skipButton.textContent = copy.skip;
        skipButton.hidden = index === tour.length - 1;
        nextButton.textContent = index === tour.length - 1 ? copy.done : copy.next;
    }
    // Spotlight on the target; the card goes below it, above it, or (when the
    // target is taller than the room left) pinned to the bottom of the screen
    function place() {
        if (!tour || !target) return;
        var r = target.getBoundingClientRect(), pad = 8;
        var vw = window.innerWidth, vh = window.innerHeight;
        spot.style.top = (r.top - pad) + 'px';
        spot.style.left = (r.left - pad) + 'px';
        spot.style.width = (r.width + pad * 2) + 'px';
        spot.style.height = (r.height + pad * 2) + 'px';
        var cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
        var left = Math.min(Math.max(16, r.left), vw - cw - 16);
        var top;
        if (r.bottom + pad + gap + ch <= vh - 16) top = r.bottom + pad + gap;
        else if (r.top - pad - gap - ch >= 16) top = r.top - pad - gap - ch;
        else { top = vh - ch - 16; left = (vw - cw) / 2; }
        card.style.top = top + 'px';
        card.style.left = left + 'px';
    }
    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        else if (e.key === 'Tab') {
            // Keep focus inside the card while it's open
            var buttons = [skipButton, nextButton].filter(function (b) { return !b.hidden; });
            var i = buttons.indexOf(document.activeElement);
            e.preventDefault();
            buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
        }
    }
    function next() { if (index < tour.length - 1) go(index + 1); else close(); }
    nextButton.addEventListener('click', next);
    skipButton.addEventListener('click', close);
    new MutationObserver(function () { paint(); place(); }).observe(root, { attributes: true, attributeFilter: ['lang'] });

    function activeTab() {
        var tab = document.querySelector('.pg-tab-btn[aria-selected="true"]');
        return tab ? tab.getAttribute('aria-controls') : 'sdui';
    }
    // First visit to each tab plays its tour once
    function maybeOpen() {
        var tabName = activeTab();
        if (!seen(tabName)) open(tabName);
    }
    document.querySelectorAll('.pg-tab-btn').forEach(function (tab) {
        tab.addEventListener('click', function () { setTimeout(maybeOpen, 350); });
    });
    var tipsButton = document.getElementById('pg-tips');
    if (tipsButton) tipsButton.addEventListener('click', function () { open(activeTab()); });
    if (document.readyState === 'complete') setTimeout(maybeOpen, 600);
    else window.addEventListener('load', function () { setTimeout(maybeOpen, 600); }, { once: true });
})();
