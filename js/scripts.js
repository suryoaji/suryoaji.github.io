// Keep the footer year current
document.getElementById('year').textContent = new Date().getFullYear();

// Clean URLs: links to the home page use "./", which a server opens as index.html.
// Opened straight from disk (file://) nothing does that, so point them at index.html there.
// And if someone lands on /index.html, drop it from the address bar.
if (location.protocol === 'file:') {
    document.querySelectorAll('a[href^="./"]').forEach(function (a) {
        a.setAttribute('href', a.getAttribute('href').replace(/^\.\//, 'index.html'));
    });
} else if (/\/index\.html$/.test(location.pathname)) {
    history.replaceState(null, '', location.pathname.replace(/index\.html$/, '') + location.search + location.hash);
}

var root = document.documentElement;

function store(key, value) {
    try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
    } catch (e) { return null; }
}

// Language: English is in the HTML, Indonesian comes from js/i18n.js
var lang = (function () {
    var button = document.getElementById('lang-toggle');
    var nodes = document.querySelectorAll('[data-i18n]');
    var english = new Map();
    var meta = document.querySelector('meta[name="description"]');
    var metaEnglish = meta.content;
    // Each page carries its Indonesian description in data-id
    var metaIndonesian = meta.dataset.id || meta.content;

    nodes.forEach(function (node) { english.set(node, node.innerHTML); });

    function apply(code) {
        var id = code === 'id';
        nodes.forEach(function (node) {
            node.innerHTML = id ? window.I18N_ID[node.dataset.i18n] : english.get(node);
        });
        root.lang = code;
        meta.content = id ? metaIndonesian : metaEnglish;
        // The button names the language you can switch to
        button.textContent = id ? 'EN' : 'ID';
        button.lang = id ? 'en' : 'id';
        button.setAttribute('aria-label', id ? 'Switch to English' : 'Ganti ke Bahasa Indonesia');
        lang.current = code;
        if (window.updateThemeLabel) window.updateThemeLabel();
    }

    // Switching languages: text on screen blurs out top to bottom, swaps, then settles back in.
    // Text off screen swaps instantly so long pages stay cheap.
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var busy = false;

    function onScreen(node) {
        var r = node.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
    }

    function transition(code) {
        if (reduceMotion || !Element.prototype.animate) { apply(code); return; }
        busy = true;
        var shown = Array.prototype.filter.call(nodes, onScreen);
        var stagger = function (i) { return Math.min(i * 14, 180); };
        var out = shown.map(function (node, i) {
            return node.animate([
                { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
                { opacity: 0, filter: 'blur(8px)', transform: 'translateY(-6px)' }
            ], { duration: 200, delay: stagger(i), easing: 'ease-in', fill: 'forwards' }).finished;
        });
        button.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }],
            { duration: 180, easing: 'ease-in', fill: 'forwards' });

        Promise.all(out).then(function () {
            apply(code);
            shown.forEach(function (node, i) {
                node.getAnimations().forEach(function (a) { a.cancel(); });
                node.animate([
                    { opacity: 0, filter: 'blur(8px)', transform: 'translateY(6px)' },
                    { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }
                ], { duration: 420, delay: stagger(i), easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
            });
            button.getAnimations().forEach(function (a) { a.cancel(); });
            button.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }],
                { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
            setTimeout(function () { busy = false; }, 600);
        });
    }

    var lang = { current: 'en' };
    var saved = store('lang');
    var initial = saved || ((navigator.language || '').toLowerCase().indexOf('id') === 0 ? 'id' : 'en');
    if (initial === 'id') apply('id');

    button.addEventListener('click', function () {
        if (busy) return;
        var next = lang.current === 'id' ? 'en' : 'id';
        store('lang', next);
        transition(next);
    });

    return lang;
})();

// Light / night toggle. The initial theme is set inline in <head>.
(function () {
    var button = document.getElementById('theme-toggle');
    var media = matchMedia('(prefers-color-scheme: dark)');
    var labels = {
        en: { dark: 'Switch to dark mode', light: 'Switch to light mode' },
        id: { dark: 'Ganti ke mode gelap', light: 'Ganti ke mode terang' }
    };

    function apply(theme) {
        root.dataset.theme = theme;
        window.updateThemeLabel();
    }

    window.updateThemeLabel = function () {
        var text = labels[lang.current] || labels.en;
        button.setAttribute('aria-label', root.dataset.theme === 'dark' ? text.light : text.dark);
    };

    apply(root.dataset.theme || (media.matches ? 'dark' : 'light'));

    button.addEventListener('click', function () {
        var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        apply(next);
        store('theme', next);
    });

    // Follow the system while the visitor hasn't picked a theme
    media.addEventListener('change', function (e) {
        if (!store('theme')) apply(e.matches ? 'dark' : 'light');
    });
})();

// Header links scroll sideways on narrow screens: fade the edge that has more
// links behind it, and start with the current page's link in view
(function () {
    var bar = document.querySelector('.nav nav');
    if (!bar) return;
    function edges() {
        bar.classList.toggle('can-left', bar.scrollLeft > 2);
        bar.classList.toggle('can-right', bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2);
    }
    var current = bar.querySelector('[aria-current="page"]');
    if (current && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = current.offsetLeft - (bar.clientWidth - current.offsetWidth) / 2;
    bar.addEventListener('scroll', edges, { passive: true });
    window.addEventListener('resize', edges);
    if (window.ResizeObserver) new ResizeObserver(edges).observe(bar);
    edges();
})();
