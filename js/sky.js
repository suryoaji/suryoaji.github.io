// Sky behind the hero and the footer, plus the pointer sheen on liquid glass.
// One WebGL shader with two scenes that cross-fade with the theme:
//   light: daytime sky with drifting clouds that part around the pointer
//   dark:  space with parallax stars, a slowly moving organic nebula,
//          the odd shooting star, and a gravitational-lens bend around the pointer;
//          and now and then an aurora
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
        // sun: time of day in light mode, 0 = sunrise, 0.5 = noon, 1 = sunset
        'uniform float sun;',
        // wind: how far the pointer's breeze has pushed the clouds (light mode)
        'uniform vec2 wind;',
        // aurora: progress 0..1 while one is showing, below 0 = none
        'uniform float aurora;',
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
        'vec3 space(vec2 p, vec2 aspect, vec2 sky) {',
        '    vec2 drift = vec2(time * 0.014, time * 0.006);',
        '    vec2 par = (mouse - 0.5) * 0.03;',
        '    vec3 col = vec3(0.043, 0.043, 0.078);',
        // Slowly undulating organic cosmic nebula: drifting, billowing gas clouds
        '    vec2 swirl = vec2(sin(time * 0.022 + p.y * 1.3), cos(time * 0.018 + p.x * 1.3)) * 0.14;',
        '    vec2 q1 = p * 1.6 + drift + swirl;',
        '    float warp = fbm(q1);',
        '    vec2 q2 = p * 2.0 - vec2(drift.y * 1.2, drift.x * 1.2) + warp * 0.55;',
        '    float gas1 = fbm(q2);',
        '    float gas2 = fbm(q2 * 1.8 + vec2(1.7, 4.3) + drift * 0.6);',
        // Celestial dust band across space
        '    float lane = smoothstep(1.25, 0.15, abs(p.y - 0.52 - 0.20 * sin(p.x * 0.85 + time * 0.010)));',
        '    float d1 = smoothstep(0.32, 0.78, gas1) * (0.5 + 0.5 * lane);',
        '    float d2 = smoothstep(0.40, 0.85, gas2);',
        // Ethereal cosmic tones: deep violet, teal/cyan edge, rose core, and amber dust
        '    vec3 nebCol = mix(vec3(0.20, 0.08, 0.36), vec3(0.06, 0.25, 0.40), smoothstep(0.2, 0.75, gas2));',
        '    nebCol = mix(nebCol, vec3(0.44, 0.12, 0.28), smoothstep(0.50, 0.82, gas1) * 0.75);',
        '    nebCol = mix(nebCol, vec3(0.36, 0.18, 0.06), smoothstep(0.55, 0.88, gas2 * lane) * 0.5);',
        '    float density = clamp(d1 * 0.85 + d2 * 0.35, 0.0, 1.0);',
        '    float intensity = density * (0.85 - calm * 0.42);',
        '    col += nebCol * intensity;',
        '    col = stars(col, p + drift * 0.4 + par * 0.3, 90.0, 0.86, 1.0);',
        '    col = stars(col, p + drift * 0.8 + par * 0.6, 48.0, 0.88, 17.0);',
        '    col = stars(col, p + drift * 1.6 + par * 1.0, 24.0, 0.95, 41.0);',
        // Aurora: soft curtains across the top, swaying with the pointer's breeze.
        // It only costs anything while it is showing, and uses the unbent position
        // (sky) so the pointer's lens doesn't distort it.
        '    if (aurora >= 0.0) {',
        '        float env = smoothstep(0.0, 0.2, aurora) * smoothstep(1.0, 0.75, aurora);',
        '        float ax = sky.x + wind.x * 0.25;',
        '        float base = 0.84 + 0.06 * noise(vec2(ax * 1.1, time * 0.05)) + 0.03 * sin(ax * 2.3 + time * 0.2);',
        '        float h = sky.y - base;',
        '        float rays = smoothstep(0.25, 0.9, noise(vec2(ax * 9.0 + noise(vec2(ax * 1.5, time * 0.08)) * 4.0, time * 0.2)));',
        '        float curtain = smoothstep(-0.06, 0.02, h) * exp(-max(h, 0.0) * 6.0) * (0.25 + 0.75 * rays);',
        '        vec3 ac = mix(vec3(0.15, 0.85, 0.55), vec3(0.45, 0.30, 0.90), smoothstep(0.0, 0.25, h));',
        '        col += ac * curtain * env * 0.4 * (1.0 - calm * 0.6);',
        '    }',
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
        'vec3 clouds(vec3 col, vec2 p, float scale, float speed, float depth, float amount, vec3 shadow, vec3 light) {',
        '    vec2 q = p * vec2(scale * 0.55, scale) + vec2(time * speed, 0.0) - wind * depth * scale * 0.55;',
        // A fine noise layer roughens the edges so puffs read crisper, not blurred
        '    float n = fbm(q) + (noise(q * 6.0) - 0.5) * 0.06;',
        '    float cover = smoothstep(0.43, 0.58, n);',
        '    float below = fbm(q + vec2(0.0, -0.18));',
        '    float lit = clamp(0.55 + (n - below) * 2.8, 0.0, 1.0);',
        '    vec3 puff = mix(shadow, light, lit);',
        '    return mix(col, puff, cover * amount * (1.0 - calm * 0.5));',
        '}',
        // Day cycle: the sun climbs from the left, peaks at noon and sets on the right.
        // Morning and late afternoon are warm (peach, then gold); noon is clear blue.
        'vec3 day(vec2 p, vec2 uv, vec2 aspect) {',
        '    float arc = sin(3.14159 * sun);',
        '    float warm = 1.0 - arc;',
        '    float evening = smoothstep(0.5, 1.0, sun);',
        '    vec3 sunCol = mix(vec3(1.0, 0.96, 0.86), mix(vec3(1.0, 0.84, 0.62), vec3(1.0, 0.66, 0.38), evening), warm);',
        '    vec3 top = mix(vec3(0.46, 0.69, 0.95), mix(vec3(0.62, 0.77, 0.95), vec3(0.55, 0.60, 0.86), evening), warm);',
        '    vec3 horizon = mix(vec3(0.93, 0.95, 0.97), mix(vec3(1.0, 0.86, 0.76), vec3(1.0, 0.76, 0.56), evening), warm);',
        '    vec3 col = mix(horizon, top, smoothstep(0.0, 0.9, uv.y));',
        '    col = mix(col, vec3(0.969, 0.965, 0.953), calm * 0.75);',
        // The sun. Light is blended with "screen" so it brightens the sky like real
        // light instead of blowing it out to white.
        '    vec2 sunPos = vec2(aspect.x * (0.08 + 0.84 * sun), 0.58 + 0.42 * arc);',
        '    float seen = smoothstep(0.0, 0.06, sun) * smoothstep(1.0, 0.94, sun) * (1.0 - calm * 0.7);',
        '    vec2 sv = p - sunPos; float sd = length(sv);',
        // Atmospheric scattering: a wide soft halo that grows and warms as the sun gets low
        '    float spread = mix(2.2, 1.3, warm);',
        '    float haze = exp(-sd * spread) * mix(0.22, 0.36, warm);',
        '    float bloom = exp(-sd * 7.0) * 0.30 + exp(-sd * 15.0) * 0.30;',
        // No hard edge: the disc is a soft gaussian that melts into its bloom
        '    float disc = exp(-sd * sd * 650.0) * 0.5;',
        '    vec3 behind = sunCol * (haze + bloom) * seen + vec3(1.0, 0.99, 0.95) * disc * seen;',
        '    col = 1.0 - (1.0 - col) * (1.0 - clamp(behind, 0.0, 1.0));',
        // Clouds take the colour of the light: white at noon, peach or gold at the edges of the day.
        // They are drawn over the sun, so a passing cloud dims it.
        '    vec3 light = mix(vec3(1.0), sunCol, 0.45 * warm);',
        '    vec3 shade = mix(vec3(0.74, 0.80, 0.90), vec3(0.80, 0.70, 0.72), 0.5 * warm);',
        '    col = clouds(col, p, 1.4, 0.010, 0.3, 0.7, shade + 0.04, light);',
        '    col = clouds(col, p + vec2(3.7, 1.9), 2.2, 0.018, 0.6, 0.9, shade, light);',
        '    col = clouds(col, p + vec2(8.1, 4.4), 3.2, 0.030, 1.0, 0.95, shade - 0.04, light);',
        // Light that gets through: a glow over the clouds near the sun (silver lining)
        // and faint, uneven shafts that drift slowly, never a regular starburst
        '    float ang = atan(sv.y, sv.x);',
        '    float shafts = noise(vec2(ang * 5.0, time * 0.04)) * noise(vec2(ang * 11.0 + 3.1, time * 0.03 + 7.0));',
        '    shafts = smoothstep(0.25, 0.75, shafts) * exp(-sd * 2.6) * 0.07;',
        '    vec3 through = sunCol * (exp(-sd * 5.0) * 0.22 + exp(-sd * 12.0) * 0.16 + shafts) * seen;',
        '    col = 1.0 - (1.0 - col) * (1.0 - clamp(through, 0.0, 1.0));',
        // A warm wash over everything in golden hour
        '    col = mix(col, col * sunCol, 0.18 * warm * (1.0 - calm * 0.6));',
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
        '    if (night > 0.001) col = space(q - d * (0.012 + push * 0.03) * pull / (r2 + 0.01), aspect, q);',
        // Day has no pointer distortion; the pointer only stirs a breeze (see wind)
        '    if (night < 0.999) col = mix(day(q, uv, aspect), col, night);',
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
        ['res', 'time', 'mouse', 'push', 'night', 'calm', 'offset', 'sun', 'wind', 'aurora'].forEach(function (n) {
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
                // A single NaN here would turn the whole sky black, so only ease towards real numbers
                if (isFinite(tx) && isFinite(ty)) {
                    sky.mouse.x += (tx - sky.mouse.x) * 0.06;
                    sky.mouse.y += (ty - sky.mouse.y) * 0.06;
                }
                if (!isFinite(sky.mouse.x) || !isFinite(sky.mouse.y)) { sky.mouse.x = 0.7; sky.mouse.y = 0.6; }
                gl.uniform2f(u.res, canvas.width, canvas.height);
                gl.uniform1f(u.time, seconds);
                gl.uniform2f(u.mouse, sky.mouse.x, sky.mouse.y);
                gl.uniform1f(u.push, push);
                gl.uniform1f(u.night, night);
                gl.uniform1f(u.calm, opts.calm || 0);
                gl.uniform1f(u.sun, dayPhase);
                gl.uniform2f(u.wind, wind.x, wind.y);
                gl.uniform1f(u.aurora, auroraPhase);
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
    // Breeze: moving the pointer pushes the clouds the same way, then it dies down.
    // Only horizontal movement counts, and only a little of the vertical, like wind.
    var gust = { x: 0, y: 0 }, wind = { x: 0, y: 0 }, last = null;
    window.addEventListener('pointermove', function (e) {
        if (!isFinite(e.clientX) || !isFinite(e.clientY)) return;
        if (last && !reduceMotion) {
            gust.x += (e.clientX - last.x) / window.innerWidth * 0.6;
            gust.y += (last.y - e.clientY) / window.innerHeight * 0.15;
        }
        last = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    window.addEventListener('pointermove', function (e) {
        if (isFinite(e.clientX) && isFinite(e.clientY)) { pointer.x = e.clientX; pointer.y = e.clientY; }
    }, { passive: true });
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
    // The full sky sits behind the top of the page: the hero on the home page, the intro on the playground
    var hero = document.querySelector('.hero, .pg-intro');
    var heroCanvas = document.querySelector('.sky-hero');
    // Drawn at a higher resolution than the others so cloud edges stay crisp up front
    if (hero && heroCanvas) skies.push(makeSky(heroCanvas, function () { return hero.offsetTop + hero.offsetHeight + 120; }, {
        scale: Math.min(window.devicePixelRatio || 1, 2) * 0.8
    }));
    var footer = document.querySelector('.footer');
    var footerCanvas = document.querySelector('.sky-footer');
    if (footer && footerCanvas) skies.push(makeSky(footerCanvas, function () { return footer.offsetHeight; }));
    skies = skies.filter(Boolean);
    if (!skies.length) return;
    window.addEventListener('resize', function () { skies.forEach(function (s) { s.resize(); }); });

    // Aurora: shows for 34 s, then the sky stays plain for 20-40 s before the next
    // one. It only starts while the sky is dark.
    var AURORA_LENGTH = 34, auroraStart = -1, auroraPhase = -1, nextAurora = 6;
    function updateAurora(seconds) {
        auroraPhase = auroraStart < 0 ? -1 : (seconds - auroraStart) / AURORA_LENGTH;
        if (auroraPhase > 1) { auroraPhase = -1; auroraStart = -1; nextAurora = seconds + 20 + Math.random() * 20; }
        if (auroraStart < 0 && night > 0.5 && seconds >= nextAurora) auroraStart = seconds;
    }

    var start = performance.now(), frame = 0, dayPhase = 0.15;
    function drawAll(now, force) {
        night += (isDark() - night) * 0.06;
        if (Math.abs(isDark() - night) < 0.002) night = isDark();
        push += (pushTarget - push) * 0.06;
        var seconds = reduceMotion ? 3 : (now - start) / 1000;
        // One day every 90 seconds; with reduced motion, hold a late-morning sky
        dayPhase = reduceMotion ? 0.35 : (seconds / 90 + 0.15) % 1;
        if (!reduceMotion) updateAurora(seconds);
        // Let the gust carry the clouds, then fade, so the sky settles back to its own drift
        gust.x = Math.max(-0.6, Math.min(0.6, gust.x)) * 0.94;
        gust.y = Math.max(-0.2, Math.min(0.2, gust.y)) * 0.94;
        wind.x += gust.x * 0.02;
        wind.y += gust.y * 0.02;
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
