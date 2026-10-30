// SDUI playground: parse the JSON payload and render it into the phone mockup.
// The renderer only knows a fixed set of component types and animations, like a
// real app build. Payload values are always written as text, never as HTML.
(function () {
    var root = document.documentElement;
    var editor = document.getElementById('pg-json');
    var body = document.getElementById('pg-body');
    var screen = document.getElementById('pg-screen');
    var scroller = document.getElementById('pg-scroll');
    var tabbarSlot = document.getElementById('pg-tabbar');
    var status = document.getElementById('pg-status');
    var toast = document.getElementById('pg-toast');
    var version = document.getElementById('pg-version');
    var presetButtons = document.querySelectorAll('button[data-preset]');
    var themeSelect = document.getElementById('pg-theme');
    if (!editor || !body) return;
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Code editor: CodeMirror when it loaded (line numbers, bracket folding),
    // otherwise the plain textarea underneath keeps working.
    var cm = null;
    if (window.CodeMirror) {
        cm = CodeMirror.fromTextArea(editor, {
            mode: { name: 'javascript', json: true },
            lineNumbers: true,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            matchBrackets: true,
            tabSize: 2,
            indentUnit: 2,
            screenReaderLabel: 'SDUI payload JSON',
            extraKeys: {
                Tab: function (c) { c.replaceSelection('  '); },
                'Ctrl-Q': function (c) { c.foldCode(c.getCursor()); }
            }
        });
    }
    function getCode() { return cm ? cm.getValue() : editor.value; }
    function setCode(text) {
        if (!cm) { editor.value = text; return; }
        cm.setValue(text);
        cm.clearHistory();
        // Keep long payloads readable: start with the other screens folded away
        for (var i = 0; i < cm.lineCount(); i++) {
            if (/^  "screens": \{/.test(cm.getLine(i))) { cm.foldCode(CodeMirror.Pos(i, 0), null, 'fold'); break; }
        }
    }
    // Collapse every block below the top level, so the payload reads as an outline
    function collapseAll() {
        if (!cm) return;
        cm.operation(function () {
            for (var i = cm.lineCount() - 1; i > 0; i--) {
                if (/[\[{]\s*$/.test(cm.getLine(i))) cm.foldCode(CodeMirror.Pos(i, 0), null, 'fold');
            }
        });
    }

    var copy = {
        en: {
            valid: function (n, bytes) { return 'Valid · ' + n + ' components · ' + bytes + ' bytes'; },
            invalid: 'Invalid JSON: ',
            shape: 'Expected { "screen": { "children": [ ... ] } }',
            skipped: function (type, v) { return 'v' + v + ' skips "' + type + '"'; },
            skippedNote: 'This app version has no widget for it.',
            action: 'Action: ',
            ends: 'Ended',
            copied: 'Copied: ',
            field: {
                required: 'Required',
                minLength: function (n) { return 'At least ' + n + ' characters'; },
                maxLength: function (n) { return 'At most ' + n + ' characters'; },
                min: function (n) { return 'Minimum ' + n; },
                max: function (n) { return 'Maximum ' + n; },
                email: 'Enter a valid email',
                pattern: 'Check the format',
                choose: 'Choose…'
            },
            submitted: function (to, n) { return 'submit → ' + to + ' · ' + n + ' fields valid'; },
            fixErrors: function (n) { return n + (n === 1 ? ' field needs' : ' fields need') + ' fixing'; },
            fold: 'Fold',
            unfold: 'Unfold',
            updating: 'Updating…',
            offline: function (ago) { return 'Offline · showing the copy saved ' + ago; },
            offlineEmpty: 'Offline · nothing cached yet, showing the built-in screen',
            ago: function (s) { return s < 60 ? 'just now' : Math.round(s / 60) + ' min ago'; },
            held: 'Phone is offline: it keeps the cached copy until it reconnects',
            linkCopied: 'Link copied: it opens this payload',
            linkFailed: 'Could not build a link'
        },
        id: {
            valid: function (n, bytes) { return 'Valid · ' + n + ' komponen · ' + bytes + ' byte'; },
            invalid: 'JSON tidak valid: ',
            shape: 'Format yang diharapkan: { "screen": { "children": [ ... ] } }',
            skipped: function (type, v) { return 'v' + v + ' melewati "' + type + '"'; },
            skippedNote: 'Versi aplikasi ini belum punya widget untuknya.',
            action: 'Aksi: ',
            ends: 'Selesai',
            copied: 'Disalin: ',
            field: {
                required: 'Wajib diisi',
                minLength: function (n) { return 'Minimal ' + n + ' karakter'; },
                maxLength: function (n) { return 'Maksimal ' + n + ' karakter'; },
                min: function (n) { return 'Minimal ' + n; },
                max: function (n) { return 'Maksimal ' + n; },
                email: 'Masukkan email yang valid',
                pattern: 'Periksa formatnya',
                choose: 'Pilih…'
            },
            submitted: function (to, n) { return 'submit → ' + to + ' · ' + n + ' field valid'; },
            fixErrors: function (n) { return n + ' field perlu diperbaiki'; },
            fold: 'Lipat',
            unfold: 'Buka lipatan',
            updating: 'Memperbarui…',
            offline: function (ago) { return 'Offline · menampilkan salinan yang disimpan ' + ago; },
            offlineEmpty: 'Offline · belum ada cache, menampilkan layar bawaan',
            ago: function (s) { return s < 60 ? 'baru saja' : Math.round(s / 60) + ' menit lalu'; },
            held: 'Ponsel offline: tetap pakai salinan cache sampai tersambung lagi',
            linkCopied: 'Link disalin: membuka payload ini',
            linkFailed: 'Gagal membuat link'
        }
    };
    function t() { return copy[root.lang === 'id' ? 'id' : 'en']; }
    // Umami custom event (clicks are tracked from data-umami-event). The script
    // loads deferred, so an event sent before it's ready waits for page load.
    function track(name, data) {
        if (window.umami && umami.track) { umami.track(name, data); return; }
        if (document.readyState !== 'complete') {
            window.addEventListener('load', function () { if (window.umami && umami.track) umami.track(name, data); }, { once: true });
        }
    }

    // What each app build can draw. v2 shipped the countdown widget.
    var BASE = ['text', 'banner', 'hero', 'section', 'grid', 'carousel', 'progress', 'row', 'chip', 'list', 'button', 'spacer', 'tabbar', 'form'];
    var SUPPORTED = { 1: BASE, 2: BASE.concat(['countdown']) };

    // Animations the app knows. Entry ones play once; loop ones keep going after it.
    var ENTRY = { fadeUp: 1, fadeIn: 1, slideLeft: 1, scaleIn: 1, bounce: 1 };
    var LOOP = { pulse: 1, shimmer: 1, float: 1, wiggle: 1 };

    // ---- Presets -------------------------------------------------------------
    // Each app theme gets the same four scenarios, so the SDUI idea stays the same
    // while the content changes: home, a seasonal campaign, an A/B variant, and a
    // screen that uses a component only v2 knows.
    function build(d) {
        function nav(to) { return { type: 'navigate', to: to }; }
        function hero(h, animation) {
            var o = { type: 'hero', title: h[0], subtitle: h[1], emoji: h[2], colors: [h[3], h[4]], action: nav(h[5]) };
            if (animation) o.animation = animation;
            return o;
        }
        function grid(extra) {
            return { type: 'grid', columns: 4, items: d.grid.concat(extra ? [extra] : []).slice(0, 8).map(function (g) {
                return { emoji: g[0], label: g[1], action: nav(g[2]) };
            }) };
        }
        function carousel(cards, animation) {
            var o = { type: 'carousel', items: cards.map(function (c) {
                return { title: c[0], subtitle: c[1], emoji: c[2], colors: [c[3], c[4]], badge: c[5] || undefined };
            }) };
            if (animation) o.animation = animation;
            return o;
        }
        function button(b, style, animation) {
            var o = { type: 'button', label: b[0], action: nav(b[1]) };
            if (style) o.style = style;
            if (animation) o.animation = animation;
            return o;
        }
        var head = [
            { type: 'text', style: 'caption', value: d.hello },
            { type: 'text', style: 'title', value: d.title }
        ];
        var list = { type: 'list', title: d.list[0], items: d.list.slice(1).map(function (i) {
            return { title: i[0], subtitle: i[1], trailing: i[2] };
        }) };
        var progress = { type: 'progress', label: d.progress[0], caption: d.progress[1], value: d.progress[2] };
        var tabbar = { type: 'tabbar', items: d.tabs.map(function (tab) { return { emoji: tab[0], label: tab[1], screen: tab[2] }; }) };

        // The other tabs are screens in the same payload: navigation is data too
        var SETTINGS = [['⚙️', 'Settings'], ['🔒', 'Security'], ['💬', 'Help'], ['🌐', 'Language']];
        function block(b) {
            var v = b[1];
            switch (b[0]) {
                case 'caption': return { type: 'text', style: 'caption', value: v };
                case 'list': return { type: 'list', title: v[0], items: v.slice(1).map(function (i) {
                    return { title: i[0], subtitle: i[1], trailing: i[2] || undefined };
                }) };
                case 'progress': return { type: 'progress', label: v[0], caption: v[1], value: v[2] };
                case 'hero': return hero(v.concat(['/' + d.id + '/profile/edit']), 'scaleIn');
                case 'grid': return { type: 'grid', columns: 4, items: (v || SETTINGS).map(function (g) { return { emoji: g[0], label: g[1] }; }) };
                case 'carousel': return carousel(v);
                case 'button': return button(v, b[2]);
            }
        }
        var screens = {};
        d.tabs.slice(1).forEach(function (tab) {
            var pg = d.pages[tab[2]];
            screens[tab[2]] = { background: d.bg[0], stagger: 60, children: [
                { type: 'text', style: 'title', value: pg.title }
            ].concat(pg.blocks.map(block)) };
        });
        function section(title) { return { type: 'section', title: title, actionLabel: 'See all', action: nav('/' + d.id + '/all') }; }

        var scenarios = {
            home: { version: 1, screen: { background: d.bg[0], stagger: 70, children: head.concat([
                hero(d.hero.home, 'scaleIn'),
                grid(),
                section(d.sections[0]),
                carousel(d.promos),
                progress,
                list,
                button(d.button.home),
                tabbar
            ]) } },
            campaign: { version: 1, campaign: d.campaign, screen: { background: d.bg[1], stagger: 70, children: head.concat([
                hero(d.hero.campaign, { name: 'shimmer', duration: 2400 }),
                grid(d.extra),
                section(d.sections[1]),
                carousel(d.campaignPromos, 'slideLeft'),
                list,
                button(d.button.campaign, null, { name: 'pulse', delay: 800 }),
                tabbar
            ]) } },
            experiment: { version: 1, experiment: d.id + '-home-b', screen: { background: d.bg[2], stagger: 90, children: head.concat([
                section(d.sections[0]),
                carousel(d.promos, 'slideLeft'),
                button(d.button.experiment, 'secondary'),
                grid(),
                hero(d.hero.experiment, 'fadeIn'),
                progress,
                tabbar
            ]) } },
            countdown: { version: 2, screen: { background: d.bg[3], stagger: 70, children: head.concat([
                { type: 'countdown', label: d.countdown, until: '2026-12-31T23:59:59+07:00', animation: 'bounce' },
                hero(d.hero.countdown, { name: 'float', duration: 3200 }),
                grid(),
                button(d.button.countdown, null, 'pulse'),
                tabbar
            ]) } }
        };
        // A form is data too: fields, rules and messages come from the server,
        // the app only knows how to draw and check each field type
        scenarios.form = { version: 1, screen: { background: d.bg[0], stagger: 60, children: [
            { type: 'text', style: 'caption', value: d.form.caption },
            { type: 'text', style: 'title', value: d.form.title },
            { type: 'form', id: d.id + '-form', fields: d.form.fields, submit: { label: d.form.submit[0], action: { type: 'submit', to: d.form.submit[1] } } }
        ] } };
        Object.keys(scenarios).forEach(function (k) { scenarios[k].screens = screens; });
        return scenarios;
    }

    var THEMES = {
        lending: build({
            id: 'lending',
            bg: ['#f5f3ff', '#ecfdf5', '#fff7ed', '#eff6ff'],
            hello: 'Good morning, Prita',
            title: 'Your business, one tap away',
            hero: {
                home: ['Business loan up to Rp 10 juta', 'Decision in minutes for active partners', '💸', '#6d28d9', '#c026d3', '/loan/apply'],
                campaign: ['Ramadan cashback 20%', 'On every installment paid before Eid', '🌙', '#047857', '#0d9488', '/promo/ramadan'],
                experiment: ['Grow your stall this month', 'Top-up loans after 6 on-time payments', '🛒', '#c2410c', '#e11d48', '/loan/topup'],
                countdown: ['Send money with no fee', 'To any bank, until the end of the year', '⚡', '#1d4ed8', '#7c3aed', '/transfer']
            },
            grid: [['📱', 'Credit', '/ppob/credit'], ['💡', 'Electricity', '/ppob/electricity'], ['💸', 'Transfer', '/transfer'], ['🧾', 'Bills', '/bills'], ['💧', 'Water', '/ppob/water'], ['🏦', 'Savings', '/savings'], ['📈', 'Invest', '/invest']],
            extra: ['🕌', 'Zakat', '/zakat'],
            sections: ['For you', 'Ramadan offers'],
            promos: [['10% cashback', 'Your first electricity token', '🎁', '#0ea5e9', '#6366f1', 'New'], ['Agent bonus', 'Sell 20 credits this week', '🏆', '#f59e0b', '#ef4444'], ['Safe savings', 'Start from Rp 10.000', '🌱', '#10b981', '#059669']],
            campaignPromos: [['Iftar treat', 'Free transfer after Maghrib', '🍵', '#0d9488', '#047857', 'Today'], ['Zakat made easy', 'Pay in two taps', '🕌', '#16a34a', '#15803d'], ['Eid top-up', 'Credit for the family', '📱', '#ca8a04', '#b45309']],
            progress: ['Loan repaid', '15 of 25 installments', 0.6],
            list: ['Coming up', ['Installment 16', 'Due 12 Nov', 'Rp 250.000'], ['Group meeting', 'Thursday, 09:00', 'Mawar']],
            button: { home: ['Pay installment', '/repayment'], campaign: ['Pay and get cashback', '/repayment?promo=ramadan'], experiment: ['Check my loan limit', '/loan/limit'], countdown: ['Send money', '/transfer'] },
            countdown: 'Free transfer promo ends in',
            form: {
                caption: 'Step 1 of 2',
                title: 'Apply for a business loan',
                submit: ['Apply now', 'POST /loans'],
                fields: [
                    { name: 'fullName', type: 'text', label: 'Full name (as on KTP)', required: true, minLength: 3 },
                    { name: 'phone', type: 'tel', label: 'Phone number', placeholder: '08…', required: true, pattern: '^08[0-9]{8,11}$', error: { en: 'Use a number that starts with 08', id: 'Gunakan nomor yang diawali 08' } },
                    { name: 'business', type: 'select', label: 'Business', required: true, options: ['Warung', 'Food stall', 'Tailor', 'Farming', 'Other'] },
                    { name: 'businessOther', type: 'text', label: 'What do you sell?', required: true, showIf: { field: 'business', equals: 'Other' } },
                    { name: 'income', type: 'number', label: 'Monthly income', prefix: 'Rp', required: true, min: 500000, help: 'Rough is fine' },
                    { name: 'amount', type: 'select', label: 'Loan amount', required: true, options: ['Rp 3.000.000', 'Rp 5.000.000', 'Rp 10.000.000'] },
                    { name: 'terms', type: 'checkbox', label: 'I agree to the loan terms', required: true }
                ]
            },
            tabs: [['🏠', 'Home', 'home'], ['📄', 'Loans', 'loans'], ['🔔', 'Inbox', 'inbox'], ['👤', 'Profile', 'profile']],
            pages: {
                loans: { title: 'My loans', blocks: [
                    ['progress', ['Loan repaid', '15 of 25 installments', 0.6]],
                    ['list', ['Active loan', ['Business loan', 'Rp 5.000.000 · 25 weeks', 'Active'], ['Next installment', 'Due 12 Nov', 'Rp 250.000'], ['Paid so far', '15 installments', 'Rp 3.750.000']]],
                    ['list', ['History', ['First loan', 'Paid off · March 2025', 'Rp 3.000.000']]],
                    ['button', ['Pay installment', '/repayment']]
                ] },
                inbox: { title: 'Inbox', blocks: [
                    ['list', ['Today', ['Installment reminder', 'Rp 250.000 due on Thursday', '09:00'], ['Cashback received', 'Rp 25.000 from your last payment', '08:12']]],
                    ['list', ['Earlier', ['Group meeting moved', "Thursday 09:00 at Bu Rina's house", 'Mon'], ['New: water bills', 'Pay PDAM from the app', 'Sun']]]
                ] },
                profile: { title: 'Profile', blocks: [
                    ['hero', ['Prita Pitri', 'Partner since 2021 · Group Mawar', '👩🏻', '#6d28d9', '#c026d3']],
                    ['grid'],
                    ['list', ['Account', ['Phone', '0812 •••• 4410'], ['Bank account', 'BRI •••• 2231', 'Verified']]],
                    ['button', ['Log out', '/logout'], 'secondary']
                ] }
            }
        }),
        food: build({
            id: 'food',
            bg: ['#fff7ed', '#fffbeb', '#fff1f2', '#fdf2f8'],
            hello: 'Delivering to Jl. Darmo 12',
            title: 'What are you craving?',
            hero: {
                home: ['Free delivery over Rp 50.000', 'From restaurants within 3 km', '🛵', '#dc2626', '#f97316', '/promo/free-delivery'],
                campaign: ['Iftar bundles from Rp 25.000', 'Delivered before Maghrib', '🌙', '#b45309', '#7c2d12', '/promo/iftar'],
                experiment: ['Lunch under Rp 30.000', 'Picked from places near your office', '🍱', '#ea580c', '#db2777', '/promo/lunch'],
                countdown: ['Half price desserts', 'Cakes, es campur and more', '🍰', '#db2777', '#9333ea', '/promo/desserts']
            },
            grid: [['🍚', 'Rice', '/c/rice'], ['🍜', 'Noodles', '/c/noodles'], ['☕', 'Coffee', '/c/coffee'], ['🥞', 'Martabak', '/c/martabak'], ['🍗', 'Chicken', '/c/chicken'], ['🥗', 'Healthy', '/c/healthy'], ['🧋', 'Drinks', '/c/drinks']],
            extra: ['🥟', 'Takjil', '/c/takjil'],
            sections: ['Near you', 'Iftar picks'],
            promos: [['Warung Bu Tini', 'Nasi goreng · 15 min', '🍳', '#f97316', '#dc2626', '4.8 ★'], ['Kopi Pojok', 'Es kopi susu · 10 min', '🧊', '#78350f', '#a16207', 'Promo'], ['Bakso Pak Man', 'Bakso urat · 20 min', '🍲', '#b91c1c', '#ea580c']],
            campaignPromos: [['Kolak & es buah', 'Bundle for four', '🍧', '#b45309', '#f59e0b', 'Iftar'], ['Kurma box', 'Ajwa and sukari', '🌴', '#7c2d12', '#b45309'], ['Sahur set', 'Rice, egg and tea', '🍳', '#4338ca', '#1e3a8a']],
            progress: ['Next free delivery', '3 of 5 orders this week', 0.6],
            list: ['Order again', ['Nasi goreng kampung', 'Warung Bu Tini', 'Rp 28.000'], ['Es kopi susu', 'Kopi Pojok', 'Rp 18.000']],
            button: { home: ['Track my order', '/orders/active'], campaign: ['Order for iftar', '/promo/iftar'], experiment: ['Browse nearby', '/nearby'], countdown: ['See the flash sale', '/promo/flash'] },
            countdown: 'Flash sale ends in',
            form: {
                caption: 'Checkout',
                title: 'Where should we deliver?',
                submit: ['Save address', 'POST /addresses'],
                fields: [
                    { name: 'recipient', type: 'text', label: 'Recipient name', required: true, minLength: 2 },
                    { name: 'phone', type: 'tel', label: 'Phone number', placeholder: '08…', required: true, pattern: '^08[0-9]{8,11}$', error: { en: 'Use a number that starts with 08', id: 'Gunakan nomor yang diawali 08' } },
                    { name: 'address', type: 'text', label: 'Street address', required: true, minLength: 10, help: 'Street, number and area' },
                    { name: 'building', type: 'select', label: 'Building', required: true, options: ['House', 'Apartment', 'Office'] },
                    { name: 'unit', type: 'text', label: 'Tower and unit', required: true, showIf: { field: 'building', equals: 'Apartment' } },
                    { name: 'notes', type: 'text', label: 'Note for the driver', maxLength: 80, help: 'Optional' },
                    { name: 'default', type: 'checkbox', label: 'Use as my default address' }
                ]
            },
            tabs: [['🏠', 'Home', 'home'], ['🧾', 'Orders', 'orders'], ['❤️', 'Saved', 'saved'], ['👤', 'Profile', 'profile']],
            pages: {
                orders: { title: 'Orders', blocks: [
                    ['progress', ['Nasi goreng kampung', 'Your driver is 4 minutes away', 0.75]],
                    ['list', ['Past orders', ['Es kopi susu × 2', 'Kopi Pojok · Yesterday', 'Rp 36.000'], ['Bakso urat', 'Bakso Pak Man · Monday', 'Rp 32.000'], ['Martabak manis', 'Martabak Bangka · Saturday', 'Rp 45.000']]],
                    ['button', ['Order the last meal again', '/orders/reorder']]
                ] },
                saved: { title: 'Saved', blocks: [
                    ['caption', 'Places you keep coming back to'],
                    ['carousel', [['Warung Bu Tini', 'Rice · 1.2 km', '🍳', '#f97316', '#dc2626', '4.8 ★'], ['Soto Cak Har', 'Soup · 2.4 km', '🍲', '#ca8a04', '#b45309'], ['Kopi Pojok', 'Coffee · 0.8 km', '☕', '#78350f', '#a16207']]],
                    ['list', ['Saved dishes', ['Nasi goreng kampung', 'Warung Bu Tini', 'Rp 28.000'], ['Soto ayam', 'Soto Cak Har', 'Rp 22.000']]]
                ] },
                profile: { title: 'Profile', blocks: [
                    ['hero', ['Connor Wicks', 'Gold member · 128 orders', '🧑🏽', '#dc2626', '#f97316']],
                    ['grid'],
                    ['list', ['Account', ['Address', 'Jl. Darmo 12, Surabaya'], ['Payment', 'E-wallet •••• 0912', 'Default']]],
                    ['button', ['Log out', '/logout'], 'secondary']
                ] }
            }
        }),
        travel: build({
            id: 'travel',
            bg: ['#f0f9ff', '#f0fdf4', '#eef2ff', '#fff1f2'],
            hello: 'Hi Jared',
            title: 'Where to next?',
            hero: {
                home: ['A weekend in Bali from Rp 1,2 juta', 'Flight and two nights included', '🏝️', '#0369a1', '#06b6d4', '/deals/bali'],
                campaign: ['Book your year-end holiday', 'Free cancellation until 1 December', '🎄', '#15803d', '#0f766e', '/deals/holiday'],
                experiment: ['Last-minute deals tonight', 'Hotels under Rp 400.000 near you', '🌃', '#4338ca', '#1e1b4b', '/deals/tonight'],
                countdown: ['Japan from Rp 4,9 juta', 'Return flights for spring', '🗾', '#be123c', '#f472b6', '/deals/japan']
            },
            grid: [['✈️', 'Flights', '/flights'], ['🏨', 'Hotels', '/hotels'], ['🚆', 'Trains', '/trains'], ['⛴️', 'Ferries', '/ferries'], ['🚗', 'Cars', '/cars'], ['🎟️', 'Tickets', '/tickets'], ['🛂', 'Visa', '/visa']],
            extra: ['🧳', 'Tours', '/tours'],
            sections: ['Trending', 'Holiday picks'],
            promos: [['Labuan Bajo', '3D2N sailing trip', '⛵', '#0284c7', '#0e7490', 'Hot'], ['Yogyakarta', 'Temples and food tour', '🛕', '#a16207', '#c2410c'], ['Bromo sunrise', 'Jeep and guide', '🌄', '#7c3aed', '#db2777']],
            campaignPromos: [['Singapore', 'Christmas lights tour', '🎆', '#15803d', '#166534', 'Dec'], ['Lombok', 'Beach villa week', '🏖️', '#0891b2', '#0e7490'], ['Seoul', 'Winter in the city', '❄️', '#1d4ed8', '#4338ca']],
            progress: ['Gold tier', '2 more trips to unlock', 0.7],
            list: ['Your trips', ['SUB → DPS', 'Fri 14 Nov, 07:40', 'GA 345'], ['Villa in Ubud', '2 nights from 14 Nov', 'Confirmed']],
            button: { home: ['Check in online', '/trips/checkin'], campaign: ['Plan my holiday', '/deals/holiday'], experiment: ['Search flights', '/flights/search'], countdown: ['See fares', '/deals/japan'] },
            countdown: 'Early-bird fares end in',
            form: {
                caption: 'SUB → DPS · Fri 14 Nov',
                title: 'Passenger details',
                submit: ['Continue to payment', 'POST /bookings/passengers'],
                fields: [
                    { name: 'title', type: 'select', label: 'Title', required: true, options: ['Mr', 'Mrs', 'Ms'] },
                    { name: 'fullName', type: 'text', label: 'Full name (as on ID)', required: true, minLength: 3 },
                    { name: 'birthDate', type: 'date', label: 'Date of birth', required: true },
                    { name: 'idType', type: 'select', label: 'ID type', required: true, options: ['KTP', 'Passport'] },
                    { name: 'passport', type: 'text', label: 'Passport number', placeholder: 'A1234567', required: true, pattern: '^[A-Z][0-9]{7}$', error: { en: 'One letter, then 7 digits', id: 'Satu huruf, lalu 7 angka' }, showIf: { field: 'idType', equals: 'Passport' } },
                    { name: 'email', type: 'email', label: 'Email for the e-ticket', required: true },
                    { name: 'terms', type: 'checkbox', label: 'Names match the ID exactly', required: true }
                ]
            },
            tabs: [['🧭', 'Explore', 'home'], ['🎫', 'Trips', 'trips'], ['💬', 'Inbox', 'inbox'], ['👤', 'Profile', 'profile']],
            pages: {
                trips: { title: 'Trips', blocks: [
                    ['progress', ['Bali, 14–16 Nov', 'Tickets, hotel and check-in ready', 0.9]],
                    ['list', ['Itinerary', ['SUB → DPS', 'Fri 14 Nov, 07:40', 'GA 345'], ['Villa in Ubud', 'Check-in 14:00', '2 nights'], ['DPS → SUB', 'Sun 16 Nov, 18:10', 'GA 348']]],
                    ['list', ['Past trips', ['Yogyakarta', 'August 2026', '3 nights']]],
                    ['button', ['Check in online', '/trips/checkin']]
                ] },
                inbox: { title: 'Inbox', blocks: [
                    ['list', ['Today', ['Gate change', 'GA 345 now boards at gate 4', '10:20'], ['Hotel confirmed', 'Villa in Ubud, 2 nights', '09:02']]],
                    ['list', ['Earlier', ['Price drop', 'Jakarta → Tokyo now Rp 4,9 juta', 'Mon'], ['Points added', '+320 from your last trip', 'Sat']]]
                ] },
                profile: { title: 'Profile', blocks: [
                    ['hero', ['Jared Leto', 'Gold tier · 14 trips', '🧑🏻', '#0369a1', '#06b6d4']],
                    ['grid'],
                    ['list', ['Travel documents', ['Passport', 'Valid until 2031', 'Saved'], ['ID card', 'KTP', 'Saved']]],
                    ['button', ['Log out', '/logout'], 'secondary']
                ] }
            }
        }),
        learning: build({
            id: 'learning',
            bg: ['#faf5ff', '#f0fdfa', '#fdf4ff', '#eff6ff'],
            hello: '12-day streak 🔥',
            title: 'Keep going, Morgan',
            hero: {
                home: ['Finish Kotlin basics this week', 'Two lessons left in this module', '📘', '#7c3aed', '#2563eb', '/course/kotlin'],
                campaign: ['Exam prep plans, 40% off', 'Practice tests with worked answers', '📝', '#0f766e', '#0369a1', '/promo/exams'],
                experiment: ['Ten minutes a day', 'Short lessons that fit a commute', '⏱️', '#9333ea', '#db2777', '/plans/daily'],
                countdown: ['Free mentoring for top learners', 'One-on-one sessions every month', '🎓', '#1d4ed8', '#0891b2', '/scholarship']
            },
            grid: [['🤖', 'Kotlin', '/topic/kotlin'], ['💙', 'Flutter', '/topic/flutter'], ['🎨', 'Design', '/topic/ui'], ['🗄️', 'SQL', '/topic/sql'], ['🧪', 'Testing', '/topic/testing'], ['☁️', 'Cloud', '/topic/cloud'], ['🧠', 'AI', '/topic/ai']],
            extra: ['❓', 'Quizzes', '/quizzes'],
            sections: ['Continue learning', 'Exam season'],
            promos: [['Coroutines 101', 'Lesson 4 of 9', '⚙️', '#7c3aed', '#4f46e5', '18 min'], ['Flutter layouts', 'Lesson 2 of 7', '📐', '#0284c7', '#2563eb', '12 min'], ['SQL joins', 'Lesson 1 of 5', '🔗', '#059669', '#0d9488']],
            campaignPromos: [['Mock exam', '60 questions, timed', '⏳', '#0f766e', '#115e59', 'New'], ['Formula sheet', 'One page per topic', '📄', '#0369a1', '#1e40af'], ['Study group', 'Every Saturday', '👥', '#7c3aed', '#6d28d9']],
            progress: ['Kotlin basics', '7 of 9 lessons done', 0.78],
            list: ['This week', ['Live class: State in Compose', 'Wed, 19:00', 'Join'], ['Quiz: Null safety', '10 questions', '5 min']],
            button: { home: ['Resume lesson', '/lesson/resume'], campaign: ['Start a practice test', '/tests/new'], experiment: ['Browse courses', '/courses'], countdown: ['Apply now', '/scholarship/apply'] },
            countdown: 'Scholarship applications close in',
            form: {
                caption: 'Kotlin basics',
                title: 'Set up your study plan',
                submit: ['Start learning', 'POST /enrollments'],
                fields: [
                    { name: 'name', type: 'text', label: 'Your name', required: true, minLength: 2 },
                    { name: 'email', type: 'email', label: 'Email', required: true },
                    { name: 'level', type: 'select', label: 'Your level', required: true, options: ['Beginner', 'Some experience', 'Working developer'] },
                    { name: 'hours', type: 'number', label: 'Hours per week', required: true, min: 1, max: 40 },
                    { name: 'goal', type: 'text', label: 'What do you want to build?', maxLength: 60, help: 'Optional', showIf: { field: 'level', equals: 'Working developer' } },
                    { name: 'reminder', type: 'checkbox', label: 'Remind me on study days' }
                ]
            },
            tabs: [['🏠', 'Learn', 'home'], ['📚', 'Courses', 'courses'], ['🏅', 'Progress', 'progress'], ['👤', 'Profile', 'profile']],
            pages: {
                courses: { title: 'My courses', blocks: [
                    ['list', ['In progress', ['Kotlin basics', '7 of 9 lessons', '78%'], ['Flutter layouts', '2 of 7 lessons', '28%'], ['SQL joins', '1 of 5 lessons', '20%']]],
                    ['caption', 'Recommended for you'],
                    ['carousel', [['Compose state', 'Android · 6 lessons', '🧩', '#7c3aed', '#4f46e5', 'New'], ['Testing in Flutter', 'Flutter · 5 lessons', '🧪', '#0284c7', '#2563eb'], ['REST basics', 'Backend · 4 lessons', '🔌', '#059669', '#0d9488']]],
                    ['button', ['Browse all courses', '/courses']]
                ] },
                progress: { title: 'Progress', blocks: [
                    ['progress', ['Weekly goal', '5 of 7 days', 0.71]],
                    ['grid', [['🔥', '12-day streak'], ['🏅', 'First course'], ['⚡', 'Fast learner'], ['🎯', 'Quiz ace']]],
                    ['list', ['This month', ['Lessons finished', 'Since 1 Oct', '23'], ['Quizzes passed', 'Out of 11', '9'], ['Time spent', 'About 13 min a day', '6 h 40 min']]]
                ] },
                profile: { title: 'Profile', blocks: [
                    ['hero', ['Morgan Stark', 'Learning since 2024 · Level 7', '👩🏽‍💻', '#7c3aed', '#2563eb']],
                    ['grid'],
                    ['list', ['Account', ['Email', 'morgan@•••.com'], ['Plan', 'Pro · renews 1 Dec']]],
                    ['button', ['Log out', '/logout'], 'secondary']
                ] }
            }
        })
    };

    // ---- Rendering -----------------------------------------------------------
    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = String(text);
        return node;
    }
    function safeColor(value, fallback) {
        return /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : fallback;
    }
    function gradient(colors, fallback) {
        var c = Array.isArray(colors) ? colors : [colors];
        var a = safeColor(c[0], fallback), b = safeColor(c[1], a);
        return 'linear-gradient(135deg, ' + a + ', ' + b + ')';
    }
    // In dark mode the payload's (light) background is pulled towards iOS black,
    // so each app theme keeps a hint of its colour
    var lastBackground = '#ffffff';
    // Phone appearance: follows the site theme, unless the Simulator button flips it
    var appearance = null;
    function phoneDark() { return appearance !== null ? appearance === 'dark' : root.dataset.theme === 'dark'; }
    function paintBackground(hex) {
        lastBackground = hex;
        if (!phoneDark()) { screen.style.background = hex; return; }
        var h = hex.replace('#', '');
        if (h.length === 3) h = h.replace(/./g, '$&$&');
        var rgb = [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16) || 255; });
        var base = [17, 17, 20];
        screen.style.background = 'rgb(' + rgb.map(function (v, i) { return Math.round(base[i] + (v - base[i]) * 0.1); }).join(',') + ')';
    }
    function bindAction(node, action) {
        if (!action || typeof action !== 'object') return;
        node.classList.add('pg-tappable');
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        var fire = function () { showToast(t().action + (action.type || '?') + ' → ' + (action.to || '')); };
        node.addEventListener('click', fire);
        node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    }
    function ms(value, fallback, max) {
        var n = Number(value);
        return isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
    }

    // "animation": "pulse" or { "name": "pulse", "delay": 200, "duration": 1200 }.
    // Unknown names are ignored, the same way unknown components fall back.
    function animate(node, spec, baseDelay) {
        if (reduceMotion) return;
        var a = typeof spec === 'string' ? { name: spec } : (spec && typeof spec === 'object' ? spec : {});
        var delay = baseDelay + ms(a.delay, 0, 3000);
        var entry = ENTRY[a.name] ? a.name : 'fadeUp';
        var parts = ['pg-' + entry + ' ' + (ENTRY[a.name] ? ms(a.duration, 520, 3000) : 450) + 'ms cubic-bezier(0.22, 1, 0.36, 1) ' + delay + 'ms both'];
        if (LOOP[a.name]) {
            var loopMs = ms(a.duration, a.name === 'shimmer' ? 2200 : 1800, 8000);
            if (a.name === 'shimmer') {
                node.classList.add('pg-shimmer');
                node.style.setProperty('--pg-shimmer', loopMs + 'ms');
                node.style.setProperty('--pg-shimmer-delay', (delay + 450) + 'ms');
            } else {
                parts.push('pg-' + a.name + ' ' + loopMs + 'ms ease-in-out ' + (delay + 450) + 'ms infinite');
            }
        }
        node.style.animation = parts.join(', ');
    }

    // What the user typed survives re-renders (theme, language, edits elsewhere)
    var formState = {};
    // A message from the server can be one string or one per language: { "en": …, "id": … }
    function localized(text) {
        if (!text || typeof text !== 'object') return text;
        return text[root.lang === 'id' ? 'id' : 'en'] || text.en || '';
    }
    function fieldError(f, value) {
        var copy = t().field;
        var custom = localized(f.error);
        var empty = f.type === 'checkbox' ? value !== true : value == null || String(value).trim() === '';
        if (empty) return f.required ? (f.type === 'checkbox' ? (custom || copy.required) : copy.required) : '';
        if (f.type === 'checkbox') return '';
        var text = String(value).trim();
        if (f.minLength && text.length < f.minLength) return copy.minLength(f.minLength);
        if (f.maxLength && text.length > f.maxLength) return copy.maxLength(f.maxLength);
        if (f.type === 'number') {
            var n = Number(text);
            if (f.min != null && n < f.min) return copy.min(f.min);
            if (f.max != null && n > f.max) return copy.max(f.max);
        }
        if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return custom || copy.email;
        if (f.pattern) {
            var re = null;
            try { re = new RegExp(f.pattern); } catch (e) { /* a bad pattern from the server is ignored */ }
            if (re && !re.test(text)) return custom || copy.pattern;
        }
        return '';
    }
    function renderForm(c) {
        var form = el('form', 'pg-form');
        form.noValidate = true;
        var id = String(c.id || 'form');
        var state = formState[id] = formState[id] || {};
        var touched = state['@touched'] = state['@touched'] || {};
        var fields = (Array.isArray(c.fields) ? c.fields : []).filter(function (f) { return f && f.name; });
        var rows = {};
        function shown(f) {
            var rule = f.showIf;
            if (!rule || !rule.field) return true;
            var v = state[rule.field];
            return Array.isArray(rule.in) ? rule.in.indexOf(v) >= 0 : v === rule.equals;
        }
        function check(f) {
            var row = rows[f.name];
            var message = touched[f.name] && shown(f) ? fieldError(f, state[f.name]) : '';
            row.error.textContent = message;
            row.node.classList.toggle('is-invalid', !!message);
            row.input.setAttribute('aria-invalid', String(!!message));
            return !message;
        }
        function refresh() { fields.forEach(function (f) { rows[f.name].node.hidden = !shown(f); }); }
        fields.forEach(function (f) {
            var inputId = 'pg-f-' + id + '-' + f.name;
            var row = el('div', 'pg-field pg-field-' + (f.type || 'text'));
            var input;
            if (f.type === 'checkbox') {
                var box = el('label', 'pg-check');
                input = el('input');
                input.type = 'checkbox';
                input.checked = state[f.name] === true;
                box.appendChild(input);
                box.appendChild(el('span', null, f.label));
                row.appendChild(box);
            } else {
                var label = el('label', 'pg-field-label', f.label);
                if (f.required) label.appendChild(el('span', 'pg-field-required', ' *'));
                label.htmlFor = inputId;
                row.appendChild(label);
                box = el('div', 'pg-input');
                if (f.prefix) box.appendChild(el('span', 'pg-input-prefix', f.prefix));
                if (f.type === 'select') {
                    input = el('select');
                    var none = el('option', null, f.placeholder || t().field.choose);
                    none.value = '';
                    input.appendChild(none);
                    (Array.isArray(f.options) ? f.options : []).forEach(function (o) {
                        var opt = el('option', null, typeof o === 'object' ? o.label : o);
                        opt.value = typeof o === 'object' ? o.value : o;
                        input.appendChild(opt);
                    });
                } else {
                    input = el('input');
                    input.type = ['text', 'number', 'tel', 'email', 'date'].indexOf(f.type) >= 0 ? f.type : 'text';
                    if (f.placeholder) input.placeholder = f.placeholder;
                    // Phone numbers: digits only, with the number pad on phones
                    if (f.type === 'number' || f.type === 'tel') input.inputMode = 'numeric';
                    if (f.type === 'tel') input.autocomplete = 'tel';
                }
                input.value = state[f.name] == null ? '' : state[f.name];
                box.appendChild(input);
                row.appendChild(box);
                if (f.help) row.appendChild(el('span', 'pg-field-help', f.help));
            }
            input.id = inputId;
            input.name = f.name;
            var error = el('span', 'pg-field-error');
            error.setAttribute('aria-live', 'polite');
            row.appendChild(error);
            rows[f.name] = { node: row, input: input, error: error };
            // Errors appear once a field is left, then update while typing
            input.addEventListener(f.type === 'checkbox' || f.type === 'select' ? 'change' : 'input', function () {
                if (f.type === 'tel' && /\D/.test(input.value)) {
                    // Drop anything that isn't a digit, keeping the caret where it was
                    var caret = input.selectionStart - (input.value.slice(0, input.selectionStart).match(/\D/g) || []).length;
                    input.value = input.value.replace(/\D/g, '');
                    input.setSelectionRange(caret, caret);
                }
                state[f.name] = f.type === 'checkbox' ? input.checked : input.value;
                if (f.type === 'checkbox' || f.type === 'select') touched[f.name] = true;
                refresh();
                check(f);
            });
            input.addEventListener('blur', function () { touched[f.name] = true; check(f); });
            form.appendChild(row);
        });
        refresh();
        fields.forEach(function (f) { if (touched[f.name]) check(f); });
        var submit = c.submit && typeof c.submit === 'object' ? c.submit : {};
        var button = el('button', 'pg-button', submit.label || 'Submit');
        button.type = 'submit';
        form.appendChild(button);
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var bad = [];
            fields.forEach(function (f) {
                touched[f.name] = true;
                if (!check(f)) bad.push(f);
            });
            if (bad.length) {
                showToast(t().fixErrors(bad.length));
                rows[bad[0].name].input.focus();
                return;
            }
            var action = submit.action || {};
            showToast(t().submitted(action.to || '?', fields.filter(shown).length));
        });
        return form;
    }

    var counted = 0;
    function render(c, appVersion) {
        if (!c || typeof c !== 'object') return null;
        counted++;
        var type = c.type;
        if (SUPPORTED[appVersion].indexOf(type) === -1) {
            // A real app would hide this; the playground shows where it would have been
            var skip = el('div', 'pg-skipped');
            skip.appendChild(el('strong', null, t().skipped(type, appVersion)));
            skip.appendChild(el('span', null, t().skippedNote));
            return skip;
        }
        var node, items;
        switch (type) {
            case 'text':
                node = el('p', 'pg-text pg-text-' + (['title', 'body', 'caption'].indexOf(c.style) >= 0 ? c.style : 'body'), c.value);
                break;
            case 'banner':
                node = el('div', 'pg-banner');
                node.style.background = c.color2 ? gradient([c.color, c.color2], '#6d28d9') : safeColor(c.color, '#6d28d9');
                var copyBox = el('div');
                copyBox.appendChild(el('strong', null, c.title));
                if (c.subtitle) copyBox.appendChild(el('span', null, c.subtitle));
                node.appendChild(copyBox);
                if (c.emoji) node.appendChild(el('span', 'pg-banner-emoji', c.emoji));
                bindAction(node, c.action);
                break;
            case 'hero':
                node = el('div', 'pg-hero');
                node.style.background = gradient(c.colors, '#6d28d9');
                var heroText = el('div', 'pg-hero-text');
                heroText.appendChild(el('strong', null, c.title));
                if (c.subtitle) heroText.appendChild(el('span', null, c.subtitle));
                node.appendChild(heroText);
                if (c.emoji) node.appendChild(el('span', 'pg-hero-emoji', c.emoji));
                node.appendChild(el('span', 'pg-hero-orb'));
                bindAction(node, c.action);
                break;
            case 'section':
                node = el('div', 'pg-section');
                node.appendChild(el('strong', null, c.title));
                if (c.actionLabel) {
                    var more = el('span', 'pg-section-more', c.actionLabel);
                    bindAction(more, c.action);
                    node.appendChild(more);
                }
                break;
            case 'grid':
                node = el('div', 'pg-grid-tiles');
                node.style.gridTemplateColumns = 'repeat(' + Math.max(2, Math.min(5, Number(c.columns) || 4)) + ', 1fr)';
                items = Array.isArray(c.items) ? c.items : [];
                items.forEach(function (item, i) {
                    var tile = el('div', 'pg-tile');
                    tile.appendChild(el('span', 'pg-tile-icon', item.emoji));
                    tile.appendChild(el('span', 'pg-tile-label', item.label));
                    bindAction(tile, item.action);
                    if (!reduceMotion) tile.style.animation = 'pg-scaleIn 420ms cubic-bezier(0.34, 1.56, 0.64, 1) ' + (i * 45) + 'ms both';
                    node.appendChild(tile);
                });
                break;
            case 'carousel':
                node = el('div', 'pg-carousel');
                items = Array.isArray(c.items) ? c.items : [];
                items.forEach(function (item, i) {
                    var card = el('div', 'pg-card');
                    card.style.background = gradient(item.colors, '#6366f1');
                    if (item.badge) card.appendChild(el('span', 'pg-card-badge', item.badge));
                    card.appendChild(el('span', 'pg-card-emoji', item.emoji));
                    card.appendChild(el('strong', null, item.title));
                    if (item.subtitle) card.appendChild(el('span', 'pg-card-sub', item.subtitle));
                    bindAction(card, item.action || { type: 'navigate', to: '/item/' + i });
                    if (!reduceMotion) card.style.animation = 'pg-slideLeft 520ms cubic-bezier(0.22, 1, 0.36, 1) ' + (i * 90) + 'ms both';
                    node.appendChild(card);
                });
                break;
            case 'progress':
                node = el('div', 'pg-progress');
                var top = el('div', 'pg-progress-top');
                top.appendChild(el('strong', null, c.label));
                var value = Math.max(0, Math.min(1, Number(c.value) || 0));
                top.appendChild(el('span', null, Math.round(value * 100) + '%'));
                node.appendChild(top);
                var track = el('div', 'pg-progress-track');
                var fill = el('div', 'pg-progress-fill');
                fill.style.setProperty('--pg-value', value);
                track.appendChild(fill);
                node.appendChild(track);
                if (c.caption) node.appendChild(el('span', 'pg-progress-caption', c.caption));
                break;
            case 'row':
                node = el('div', 'pg-row');
                (Array.isArray(c.children) ? c.children : []).forEach(function (child) {
                    var n = render(child, appVersion);
                    if (n) node.appendChild(n);
                });
                break;
            case 'chip':
                node = el('span', 'pg-chip-item', c.label);
                bindAction(node, c.action);
                break;
            case 'list':
                node = el('div', 'pg-list');
                if (c.title) node.appendChild(el('p', 'pg-list-title', c.title));
                (Array.isArray(c.items) ? c.items : []).forEach(function (item) {
                    var row = el('div', 'pg-list-item');
                    var left = el('div');
                    left.appendChild(el('strong', null, item.title));
                    if (item.subtitle) left.appendChild(el('span', null, item.subtitle));
                    row.appendChild(left);
                    if (item.trailing) row.appendChild(el('span', 'pg-list-trailing', item.trailing));
                    node.appendChild(row);
                });
                break;
            case 'button':
                node = el('button', 'pg-button' + (c.style === 'secondary' ? ' pg-button-secondary' : ''), c.label);
                node.type = 'button';
                bindAction(node, c.action);
                break;
            case 'spacer':
                node = el('div');
                node.style.height = Math.max(0, Math.min(64, Number(c.height) || 12)) + 'px';
                break;
            case 'form':
                node = renderForm(c);
                break;
            case 'countdown':
                node = el('div', 'pg-countdown');
                node.appendChild(el('span', null, c.label));
                var clock = el('strong', 'pg-clock');
                clock.dataset.until = c.until || '';
                node.appendChild(clock);
                break;
            case 'tabbar':
                // Drawn over the bottom of the screen, outside the scrolling area
                node = el('nav', 'pg-tabbar');
                var tabs = Array.isArray(c.items) ? c.items.slice(0, 5) : [];
                var active = Number(c.active) || 0;
                tabs.forEach(function (item, i) { if (item.screen && item.screen === currentScreen) active = i; });
                tabs.forEach(function (item, i) {
                    var tab = el('span', 'pg-tab' + (i === active ? ' is-active' : ''));
                    tab.setAttribute('role', 'button');
                    tab.tabIndex = 0;
                    tab.dataset.screen = item.screen || '';
                    tab.appendChild(el('span', 'pg-tab-icon', item.emoji));
                    tab.appendChild(el('span', 'pg-tab-label', item.label));
                    var go = function () {
                        if (item.screen) { openScreen(item.screen); return; }
                        node.querySelectorAll('.pg-tab').forEach(function (other) { other.classList.toggle('is-active', other === tab); });
                    };
                    tab.addEventListener('click', go);
                    tab.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
                    node.appendChild(tab);
                });
                node.dataset.slot = 'tabbar';
                break;
        }
        return node;
    }

    function tick() {
        body.querySelectorAll('.pg-clock').forEach(function (clock) {
            var left = Math.max(0, Date.parse(clock.dataset.until) - Date.now());
            if (!left) { clock.textContent = t().ends; return; }
            var s = Math.floor(left / 1000);
            var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
            clock.textContent = d + 'd ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        });
    }
    setInterval(tick, 1000);

    // The payload can carry more than one screen: "screen" is home, and "screens"
    // holds the rest by id. The tab bar comes from the home screen and stays put.
    var lastPayload = null;
    var currentScreen = 'home';
    function screenById(id) {
        if (id === 'home') return lastPayload.screen;
        var other = lastPayload.screens && lastPayload.screens[id];
        return other && Array.isArray(other.children) ? other : null;
    }
    // fromTab: switching tabs only swaps the content with a short fade; the tab
    // bar stays in place, like a native tab bar, instead of the whole screen
    // playing its entry animation again.
    function show(fromTab) {
        var target = screenById(currentScreen);
        if (!target) { currentScreen = 'home'; target = lastPayload.screen; }
        counted = 0;
        var appVersion = Number(version.value) === 1 ? 1 : 2;
        var stagger = ms(target.stagger, 0, 400);
        var frag = document.createDocumentFragment();
        var index = 0;
        target.children.forEach(function (c) {
            if (c && c.type === 'tabbar') return;
            var n = render(c, appVersion);
            if (!n) return;
            if (fromTab) {
                if (!reduceMotion) n.style.animation = 'pg-fadeIn 220ms ease both';
            } else {
                animate(n, c.animation, index++ * stagger);
            }
            frag.appendChild(n);
        });
        body.replaceChildren(frag);
        if (fromTab) {
            tabbarSlot.querySelectorAll('.pg-tab').forEach(function (tab) {
                tab.classList.toggle('is-active', tab.dataset.screen === currentScreen);
            });
        } else {
            var barSpec = null;
            lastPayload.screen.children.forEach(function (c) { if (c && c.type === 'tabbar') barSpec = c; });
            var bar = barSpec ? render(barSpec, appVersion) : null;
            tabbarSlot.replaceChildren(bar || '');
            screen.classList.toggle('has-tabbar', !!bar);
        }
        paintBackground(safeColor(target.background || lastPayload.screen.background, '#ffffff'));
        tick();
        status.textContent = t().valid(counted, new Blob([getCode()]).size);
        status.className = 'pg-status';
    }
    function openScreen(id) {
        if (!lastPayload || !screenById(id)) return;
        // Tapping the tab you're already on scrolls to the top, like iOS
        if (id === currentScreen) { scroller.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        currentScreen = id;
        scroller.scrollTop = 0;
        show(true);
    }

    // cold: a fresh launch (preset, replay), which may show a skeleton. Edits
    // are warm: the phone keeps its current screen while the new one loads.
    function update(cold) {
        var payload;
        try {
            payload = JSON.parse(getCode());
        } catch (e) {
            status.textContent = t().invalid + e.message;
            status.className = 'pg-status pg-error';
            return; // keep showing the last good screen, like a cached payload
        }
        var children = payload && payload.screen && payload.screen.children;
        if (!Array.isArray(children)) {
            status.textContent = t().shape;
            status.className = 'pg-status pg-error';
            return;
        }
        deliver(payload, cold === true);
    }
    // Redraw what the phone already has (app version, language, device)
    function rerender() { if (lastPayload) show(); }

    // Network simulator. The editor plays the server: the phone only sees a
    // payload after it downloads, and keeps the last one it got as its cache.
    var LATENCY = { wifi: 150, '4g': 600, '3g': 2400 };
    var NET_LABEL = { wifi: '', '4g': '4G', '3g': '3G', offline: '✈︎' };
    var network = 'wifi';
    var cache = null;
    var request = 0;
    var skeletonTimer = 0;
    var pill = document.getElementById('pg-netpill');
    function setPill(kind, text) {
        pill.className = 'pg-netpill' + (kind ? ' show is-' + kind : '');
        if (text) pill.textContent = text;
    }
    function showSkeleton() {
        var tiles = '';
        for (var i = 0; i < 8; i++) tiles += '<span class="pg-skel"></span>';
        body.innerHTML = '<div class="pg-skel pg-skel-line"></div><div class="pg-skel pg-skel-hero"></div>' +
            '<div class="pg-skel pg-skel-line"></div><div class="pg-skel-grid">' + tiles + '</div>' +
            '<div class="pg-skel pg-skel-line"></div><div class="pg-skel-cards"><span class="pg-skel"></span><span class="pg-skel"></span></div>';
        scroller.setAttribute('aria-busy', 'true');
    }
    function deliver(payload, cold) {
        var id = ++request;
        clearTimeout(skeletonTimer);
        if (network === 'offline') {
            // No connection: a launch falls back to the cache (or the screen
            // bundled with the app); an edit never reaches the phone
            if (cold || !lastPayload) {
                lastPayload = cache ? cache.payload : THEMES[themeSelect.value].home;
                show();
            }
            setPill('offline', cache ? t().offline(t().ago((Date.now() - cache.at) / 1000)) : t().offlineEmpty);
            if (!cold) { status.textContent = t().held; status.className = 'pg-status'; }
            return;
        }
        if (cold || !lastPayload) {
            // Only show a skeleton when the download is slow enough to notice
            skeletonTimer = setTimeout(showSkeleton, 250);
            setPill(null);
        } else {
            setPill('loading', t().updating);
        }
        setTimeout(function () {
            if (id !== request) return; // a newer request replaced this one
            clearTimeout(skeletonTimer);
            scroller.removeAttribute('aria-busy');
            setPill(null);
            cache = { payload: payload, at: Date.now() };
            lastPayload = payload;
            show();
        }, LATENCY[network]);
    }
    var networkButtons = document.querySelectorAll('button[data-network]');
    function setNetwork(id) {
        var wasOffline = network === 'offline';
        network = id;
        document.querySelector('.pg-device').dataset.network = id;
        networkButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.network === id)); });
        document.querySelectorAll('.pg-net-label').forEach(function (n) { n.textContent = NET_LABEL[id]; });
        document.querySelector('.pg-ring-net').textContent = NET_LABEL[id];
        // Coming back online updates the screen in place; switching between
        // networks relaunches so the new speed shows from the first frame
        update(!wasOffline && id !== 'offline');
    }
    networkButtons.forEach(function (b) {
        b.addEventListener('click', function () { if (b.dataset.network !== network) setNetwork(b.dataset.network); });
    });

    var timer = 0;
    function schedule() { clearTimeout(timer); timer = setTimeout(update, 150); }
    if (cm) {
        // setValue comes from loading a preset, which renders on its own
        cm.on('change', function (c, change) { if (change.origin !== 'setValue') schedule(); });
    }
    editor.addEventListener('input', schedule);
    var collapseButton = document.getElementById('pg-collapse');
    var expandButton = document.getElementById('pg-expand');
    if (cm) {
        collapseButton.addEventListener('click', collapseAll);
        expandButton.addEventListener('click', function () { cm.execCommand('unfoldAll'); });
    } else {
        collapseButton.hidden = true;
        expandButton.hidden = true;
    }
    // Tab inserts two spaces instead of leaving the editor
    editor.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab' || e.shiftKey) return;
        e.preventDefault();
        editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
        update();
    });
    version.addEventListener('change', function () { rerender(); track('Playground app version', { version: 'v' + version.value }); });

    var scenario = 'home';
    function load(name) {
        scenario = name;
        // A preset replaces a shared payload, so drop it from the URL too
        if (/^#p=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
        currentScreen = 'home';
        setCode(JSON.stringify(THEMES[themeSelect.value][name], null, 2));
        presetButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.preset === name)); });
        update(true);
        scroller.scrollTop = 0;
    }
    presetButtons.forEach(function (b) {
        b.addEventListener('click', function () { load(b.dataset.preset); });
    });
    themeSelect.addEventListener('change', function () { load(scenario); track('Playground app theme', { theme: themeSelect.value }); });

    // Device picker. The open Duo is wide, so it stacks above the editor, and the
    // whole frame is zoomed down when it doesn't fit the column.
    var DEVICES = {
        pro: { name: 'iPhone 18 Pro', width: 320 },
        pixel: { name: 'Pixel 11 Pro', width: 318 },
        'duo-closed': { name: 'iPhone Duo', width: 372 },
        'duo-open': { name: 'iPhone Duo', width: 719 }
    };
    var deviceBox = document.querySelector('.pg-device');
    var frame = document.querySelector('.pg-frame');
    var gridBox = document.querySelector('.pg-grid');
    var deviceButtons = document.querySelectorAll('button[data-device]');
    var current = 'pro';
    function fit() {
        frame.style.zoom = '';
        var room = deviceBox.clientWidth;
        var need = DEVICES[current].width + 8;
        if (room && room < need) frame.style.zoom = (room / need).toFixed(3);
    }
    // The Duo is one device: the toolbar fold button switches it between folded and open
    var foldButton = document.getElementById('sim-fold');
    var duoOpen = false;
    function setDevice(id) {
        if (id === 'duo') id = duoOpen ? 'duo-open' : 'duo-closed';
        current = id;
        deviceBox.dataset.device = id;
        gridBox.classList.toggle('is-wide-device', id === 'duo-open');
        screen.classList.toggle('is-wide', id === 'duo-open');
        document.getElementById('sim-title').textContent = DEVICES[id].name;
        deviceButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.device === id.split('-')[0])); });
        foldButton.hidden = id.indexOf('duo') !== 0;
        foldButton.setAttribute('aria-pressed', String(duoOpen));
        foldButton.title = duoOpen ? t().fold : t().unfold;
        foldButton.setAttribute('aria-label', foldButton.title);
        fit();
        // The editor changes width when the layout stacks; CodeMirror has to re-measure
        if (cm) cm.refresh();
        scroller.scrollTop = 0;
        rerender();
    }
    deviceButtons.forEach(function (b) {
        b.addEventListener('click', function () { setDevice(b.dataset.device); });
    });
    foldButton.addEventListener('click', function () {
        duoOpen = !duoOpen;
        setDevice('duo');
    });
    window.addEventListener('resize', fit);

    // Simulator toolbar: Home scrolls back to the top, Replay plays the animations again
    document.getElementById('sim-home').addEventListener('click', function () {
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.getElementById('sim-replay').addEventListener('click', function () {
        scroller.scrollTop = 0;
        update(true);
    });

    // Reference panel: click a name to copy a snippet you can paste into the payload
    document.querySelectorAll('[data-snippet]').forEach(function (chip) {
        chip.addEventListener('click', function () {
            var text = chip.dataset.snippet;
            var done = function () { showToast(t().copied + text); };
            if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
        });
    });

    var toastTimer = 0;
    function showToast(text) {
        toast.textContent = text;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
    }

    // Status and skipped-component labels follow the site language
    // Icon buttons show their (translated) label as a tooltip
    function iconTitles() {
        document.querySelectorAll('.pg-icon-btn, .sq-net-btn').forEach(function (b) { b.title = b.textContent.trim(); });
    }
    iconTitles();
    new MutationObserver(function () { rerender(); iconTitles(); }).observe(root, { attributes: true, attributeFilter: ['lang'] });
    // The phone follows the site theme: repaint the screen colour, nothing else re-renders
    var appearanceButton = document.getElementById('sim-appearance');
    var deviceFrame = document.querySelector('.pg-device');
    function applyAppearance() {
        deviceFrame.classList.toggle('is-dark', phoneDark());
        appearanceButton.setAttribute('aria-pressed', String(phoneDark()));
        paintBackground(lastBackground);
    }
    appearanceButton.addEventListener('click', function () {
        appearance = phoneDark() ? 'light' : 'dark';
        applyAppearance();
    });
    // Changing the site theme hands the phone back to following it
    new MutationObserver(function () { appearance = null; applyAppearance(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    applyAppearance();

    // Share: the payload travels in the URL hash, deflated and base64url-encoded,
    // so it never reaches a server and the link opens the same screen
    function toBase64Url(bytes) {
        var bin = '';
        for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function fromBase64Url(text) {
        var bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
    function pipe(bytes, transform) {
        return new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    function encodePayload(text) {
        var bytes = new TextEncoder().encode(text);
        if (!window.CompressionStream) return Promise.resolve('u' + toBase64Url(bytes));
        return pipe(bytes, new CompressionStream('deflate-raw')).then(function (z) { return 'z' + toBase64Url(z); });
    }
    function decodePayload(data) {
        var bytes = fromBase64Url(data.slice(1));
        var text = data[0] === 'z' ? pipe(bytes, new DecompressionStream('deflate-raw')) : Promise.resolve(bytes);
        return text.then(function (b) { return new TextDecoder().decode(b); });
    }
    document.getElementById('pg-share').addEventListener('click', function () {
        var text = getCode();
        try { text = JSON.stringify(JSON.parse(text)); } catch (e) { /* share it as typed */ }
        encodePayload(text).then(function (data) {
            history.replaceState(null, '', location.pathname + location.search + '#p=' + data);
            var done = function () { showToast(t().linkCopied); };
            if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
        }).catch(function () { showToast(t().linkFailed); });
    });

    // Topic tabs. A panel id in the URL (#offline-sync, #frame-budget) opens that tab.
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.pg-tab-btn'));
    function selectTab(tab, focus) {
        tabs.forEach(function (other) {
            var on = other === tab;
            other.setAttribute('aria-selected', String(on));
            other.tabIndex = on ? 0 : -1;
            document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
        });
        if (focus) tab.focus();
        var panel = tab.getAttribute('aria-controls');
        if (!/^#p=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + (panel === 'sdui' ? '' : '#' + panel));
        // A panel shown after being hidden needs measuring again: the sky, the phone and the editor
        window.dispatchEvent(new Event('resize'));
        if (cm) cm.refresh();
    }
    tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { selectTab(tab); });
        tab.addEventListener('keydown', function (e) {
            var move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (move) { e.preventDefault(); selectTab(tabs[(i + move + tabs.length) % tabs.length], true); }
        });
    });
    tabs.forEach(function (tab) { if (location.hash === '#' + tab.getAttribute('aria-controls') && tab !== tabs[0]) selectTab(tab); });

    // Opened from a shared link: start from that payload instead of a preset
    var shared = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (shared) {
        track('Playground shared link opened');
        decodePayload(shared[1]).then(function (text) {
            try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* show it as sent */ }
            setCode(text);
            presetButtons.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
            update(true);
        }).catch(function () { load('home'); });
    } else {
        load('home');
    }
    fit();
})();
