// Keep the footer year current
document.getElementById('year').textContent = new Date().getFullYear();

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
    var metaIndonesian = 'Saya Suryo Aji, mobile engineer di Surabaya, Indonesia. Saya membangun aplikasi mobile dengan Kotlin dan Flutter.';

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

    var lang = { current: 'en' };
    var saved = store('lang');
    var initial = saved || ((navigator.language || '').toLowerCase().indexOf('id') === 0 ? 'id' : 'en');
    if (initial === 'id') apply('id');

    button.addEventListener('click', function () {
        var next = lang.current === 'id' ? 'en' : 'id';
        apply(next);
        store('lang', next);
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
