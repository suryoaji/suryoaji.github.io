// Sky behind the hero and the footer, plus the pointer sheen on liquid glass.
// One WebGL shader with two scenes that cross-fade with the theme:
//   light: daytime sky with drifting clouds that part around the pointer
//   dark:  space with parallax stars, a faint nebula, the odd shooting star,
//          and a gravitational-lens bend around the pointer
(function () {
    var root = document.documentElement;
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Chromium can refract through an SVG filter in backdrop-filter; others keep plain blur
    var brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
    if (brands.some(function (b) { return /Chromium/.test(b.brand); })) root.classList.add('refract');

    // Specular highlight that follows the pointer across each glass surface
    var glass = document.querySelectorAll('.glass');
    document.addEventListener('pointermove', function (e) {
        glass.forEach(function (el) {
            var r = el.getBoundingClientRect();
            el.style.setProperty('--gx', (e.clientX - r.left) + 'px');
            el.style.setProperty('--gy', (e.clientY - r.top) + 'px');
        });
    }, { passive: true });

    var vertex = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
    var fragment = [
        'precision mediump float;',
        'uniform vec2 res; uniform float time; uniform vec2 mouse; uniform float push; uniform float night;',
        // calm = 1 for the page-wide sky: quieter so body text stays easy to read
        'uniform float calm; uniform vec2 offset;',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float noise(vec2 p) {',
        '    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
        '    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
        '               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
        '}',
        'float fbm(vec2 p) {',
        '    float v = 0.0; float a = 0.5;',
        '    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }',
        '    return v;',
        '}',

        // ---- Night: space ----
        // One layer of stars: at most one star per grid cell, sized and twinkling by hash
        'vec3 stars(vec3 col, vec2 p, float scale, float density, float seed) {',
        '    vec2 g = p * scale; vec2 id = floor(g); vec2 f = fract(g) - 0.5;',
        '    float h = hash(id + seed);',
        '    vec2 o = (vec2(hash(id + seed + 1.3), hash(id + seed + 7.1)) - 0.5) * 0.7;',
        '    float d = length(f - o);',
        '    float size = mix(0.035, 0.11, hash(id + seed + 3.7));',
        '    float twinkle = 0.55 + 0.45 * sin(time * (0.8 + 2.5 * h) + h * 40.0);',
        '    float lit = step(density, h) * twinkle * (smoothstep(size, 0.0, d) + smoothstep(size * 5.0, 0.0, d) * 0.18);',
        '    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash(id + seed + 9.2));',
        '    return mix(col, mix(vec3(1.0), tint, 0.6), clamp(lit * (1.0 - calm * 0.6), 0.0, 1.0));',
        '}',
        'vec3 space(vec2 p, vec2 aspect) {',
        '    vec2 drift = vec2(time * 0.006, time * 0.002);',
        '    vec2 par = (mouse - 0.5) * 0.03;',
        '    vec3 col = vec3(0.043, 0.043, 0.078);',
        // Faint nebula, kept thin so it reads as space and not smoke
        '    float band = smoothstep(0.45, 0.85, fbm(p * 2.2 + drift * 0.5)) * smoothstep(1.2, 0.2, abs(p.y - 0.55 - 0.15 * sin(p.x * 1.3)));',
        '    col = mix(col, vec3(0.165, 0.122, 0.302), band * 0.6 * (1.0 - calm * 0.5));',
        '    col = mix(col, vec3(0.29, 0.141, 0.063), smoothstep(0.55, 0.9, fbm(p * 3.1 - drift)) * 0.35);',
        '    col = stars(col, p + drift * 0.4 + par * 0.3, 90.0, 0.86, 1.0);',
        '    col = stars(col, p + drift * 0.8 + par * 0.6, 48.0, 0.88, 17.0);',
        '    col = stars(col, p + drift * 1.6 + par * 1.0, 24.0, 0.95, 41.0);',
        // A shooting star every few seconds, on a random line
        '    float period = 7.0; float k = floor(time / period); float ph = fract(time / period);',
        '    vec2 start = vec2(hash(vec2(k, 1.0)) * aspect.x, 0.6 + 0.4 * hash(vec2(k, 2.0)));',
        '    vec2 dir = normalize(vec2(-1.0, -0.45));',
        '    vec2 rel = p - (start + dir * ph * 3.0); float along = dot(rel, -dir); float across = length(rel + dir * along);',
        '    float trail = step(0.0, along) * smoothstep(0.25, 0.0, along) * smoothstep(0.004, 0.0, across);',
        '    return mix(col, vec3(1.0), clamp(trail * smoothstep(0.0, 0.05, ph) * smoothstep(0.35, 0.2, ph) * 1.4, 0.0, 1.0));',
        '}',

        // ---- Day: clouds ----
        // One cloud layer: fbm thresholded into puffs, lit from above, shaded underneath
        'vec3 clouds(vec3 col, vec2 p, float scale, float speed, float depth, float amount, vec3 shadow) {',
        '    vec2 q = p * vec2(scale * 0.55, scale) + vec2(time * speed, 0.0) + (mouse - 0.5) * 0.08 * depth;',
        '    float n = fbm(q);',
        '    float cover = smoothstep(0.40, 0.62, n);',
        '    float below = fbm(q + vec2(0.0, -0.18));',
        '    float lit = clamp(0.55 + (n - below) * 2.2, 0.0, 1.0);',
        '    vec3 puff = mix(shadow, vec3(1.0), lit);',
        '    return mix(col, puff, cover * amount * (1.0 - calm * 0.5));',
        '}',
        'vec3 day(vec2 p, vec2 uv, vec2 aspect) {',
        '    vec3 col = mix(vec3(0.969, 0.965, 0.953), vec3(0.55, 0.74, 0.94), smoothstep(0.0, 0.85, uv.y));',
        '    col = mix(col, vec3(0.969, 0.965, 0.953), calm * 0.75);',
        '    float sd = length(p - vec2(aspect.x * 0.85, 0.95));',
        '    col += vec3(1.0, 0.86, 0.62) * (exp(-sd * 5.0) * 0.35 + exp(-sd * 22.0) * 0.35) * (1.0 - calm);',
        '    col = clouds(col, p, 1.4, 0.010, 0.3, 0.7, vec3(0.78, 0.84, 0.93));',
        '    col = clouds(col, p + vec2(3.7, 1.9), 2.2, 0.018, 0.6, 0.9, vec3(0.74, 0.80, 0.90));',
        '    col = clouds(col, p + vec2(8.1, 4.4), 3.2, 0.030, 1.0, 0.95, vec3(0.70, 0.76, 0.87));',
        '    return col;',
        '}',

        'void main() {',
        '    vec2 uv = gl_FragCoord.xy / res;',
        '    vec2 aspect = vec2(res.x / res.y, 1.0);',
        '    vec2 p = uv * aspect;',
        '    vec2 d = p - mouse * aspect; float r2 = dot(d, d);',
        '    float pull = 1.0 - calm * 0.6;',
        '    vec2 q = p + offset;',
        '    vec3 col = vec3(0.0);',
        // Space bends inward around the pointer, like a lens
        '    if (night > 0.001) col = space(q - d * (0.012 + push * 0.03) * pull / (r2 + 0.01), aspect);',
        // Clouds part outward around the pointer, like a hand through mist
        '    if (night < 0.999) col = mix(day(q + d * (0.35 + push * 0.6) * pull * exp(-r2 * 14.0), uv, aspect), col, night);',
        '    gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    // One canvas = one GL context running the shader above
    function makeSky(canvas, measure, opts) {
        opts = opts || {};
        var res = opts.scale || scale;
        var gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
        if (!gl) { canvas.remove(); return null; }
        function shader(type, src) {
            var s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        }
        var program = gl.createProgram();
        gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { canvas.remove(); return null; }
        gl.useProgram(program);

        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(program, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        var u = {};
        ['res', 'time', 'mouse', 'push', 'night', 'calm', 'offset'].forEach(function (n) {
            u[n] = gl.getUniformLocation(program, n);
        });

        var sky = {
            canvas: canvas,
            visible: true,
            // Pointer in 0..1 canvas space, eased so the sky lags behind the finger
            mouse: { x: 0.7, y: 0.6 },
            resize: function () {
                var height = measure();
                canvas.style.height = height + 'px';
                canvas.width = Math.max(1, Math.round(canvas.clientWidth * res));
                canvas.height = Math.max(1, Math.round(height * res));
                gl.viewport(0, 0, canvas.width, canvas.height);
            },
            draw: function (seconds) {
                var r = canvas.getBoundingClientRect();
                var tx = (pointer.x - r.left) / r.width, ty = 1 - (pointer.y - r.top) / r.height;
                sky.mouse.x += (tx - sky.mouse.x) * 0.06;
                sky.mouse.y += (ty - sky.mouse.y) * 0.06;
                gl.uniform2f(u.res, canvas.width, canvas.height);
                gl.uniform1f(u.time, seconds);
                gl.uniform2f(u.mouse, sky.mouse.x, sky.mouse.y);
                gl.uniform1f(u.push, push);
                gl.uniform1f(u.night, night);
                gl.uniform1f(u.calm, opts.calm || 0);
                var off = opts.offset ? opts.offset() : [0, 0];
                gl.uniform2f(u.offset, off[0], off[1]);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
        };
        sky.resize();
        return sky;
    }

    var scale = Math.min(window.devicePixelRatio || 1, 2) * 0.6;
    var pointer = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.4 }, push = 0, pushTarget = 0;
    window.addEventListener('pointermove', function (e) { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    window.addEventListener('pointerdown', function () { pushTarget = 1; }, { passive: true });
    window.addEventListener('pointerup', function () { pushTarget = 0; }, { passive: true });

    function isDark() { return root.dataset.theme === 'dark' ? 1 : 0; }
    var night = isDark();

    var skies = [];
    // Page-wide sky, fixed behind everything; drifts a little as you scroll
    var pageCanvas = document.querySelector('.sky-page');
    if (pageCanvas) skies.push(makeSky(pageCanvas, function () { return window.innerHeight; }, {
        calm: 1,
        scale: Math.min(window.devicePixelRatio || 1, 2) * 0.45,
        offset: function () { return [0, -window.scrollY / window.innerHeight * 0.12]; }
    }));
    var hero = document.querySelector('.hero');
    var heroCanvas = document.querySelector('.sky-hero');
    if (hero && heroCanvas) skies.push(makeSky(heroCanvas, function () { return hero.offsetTop + hero.offsetHeight + 120; }));
    var footer = document.querySelector('.footer');
    var footerCanvas = document.querySelector('.sky-footer');
    if (footer && footerCanvas) skies.push(makeSky(footerCanvas, function () { return footer.offsetHeight; }));
    skies = skies.filter(Boolean);
    if (!skies.length) return;
    window.addEventListener('resize', function () { skies.forEach(function (s) { s.resize(); }); });

    var start = performance.now(), frame = 0;
    function drawAll(now, force) {
        night += (isDark() - night) * 0.06;
        if (Math.abs(isDark() - night) < 0.002) night = isDark();
        push += (pushTarget - push) * 0.06;
        var seconds = reduceMotion ? 3 : (now - start) / 1000;
        skies.forEach(function (s) { if (force || s.visible) s.draw(seconds); });
    }
    function anyVisible() { return skies.some(function (s) { return s.visible; }); }
    function loop(now) {
        drawAll(now);
        frame = anyVisible() && !document.hidden ? requestAnimationFrame(loop) : 0;
    }
    function wake() { if (!frame && anyVisible() && !document.hidden) frame = requestAnimationFrame(loop); }

    if (reduceMotion) {
        // One still frame per sky; redraw only when the theme flips
        drawAll(start, true);
        new MutationObserver(function () { night = isDark(); drawAll(start, true); })
            .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
        return;
    }

    // Only render skies that are on screen, and nothing while the tab is hidden
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            skies.forEach(function (s) { if (s.canvas === e.target) s.visible = e.isIntersecting; });
        });
        wake();
    });
    skies.forEach(function (s) { io.observe(s.canvas); });
    document.addEventListener('visibilitychange', wake);
    wake();
})();
