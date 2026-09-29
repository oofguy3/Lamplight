/* lamplight — background sounds: rain, fire, café, forest night and waves, made on the device with the Web Audio API (see llSounds) */
/* ============================================================
   Lamplight — background sounds
   Five ambiences, none of them a recording: each is a few seconds of
   noise (white, pink or brown) or of sparse events (rain drops, fire
   crackles, cricket chirps, cup clinks, the swell of waves) rendered
   once into an AudioBuffer and looped, then shaped by the browser's own
   filters, gains and slow oscillators. No per-sample JavaScript runs
   while they play, so they cost next to nothing. Loaded on demand by
   app.js (Sounds): the menu's "Background sounds" opens the panel.

   One sound can play alone (its chip) or several can be blended (a
   slider each, 0 = off), under a master volume and an on / off switch,
   all kept in local storage (ll_sounds). They play while a book is
   open, under read aloud too (a little quieter while it speaks), fade
   in and out over about a second, and pause while the page is hidden
   unless read aloud is playing. An AudioContext may only start from a
   user gesture: a book opened with sounds on starts them at once where
   the browser allows it, else at the next tap or key.
   ============================================================ */
(function(){
  "use strict";
  var LL = window.__ll || {};
  var Store = LL.Store || { get: function(){ return null; }, set: function(){} };
  var state = LL.state || {}, Side = LL.Side, Marks = LL.Marks, Speak = LL.Speak;
  var KEY = "ll_sounds", FADE = 1;
  var SOUNDS = [
    { id: "rain",   name: "Rain",         icon: "M8 4c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6z | M16 9c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6z" },
    { id: "fire",   name: "Fire",         icon: "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.7 1 2.7 2 3 0-3-.5-5.5.5-8z" },
    { id: "cafe",   name: "Café",         icon: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z | M16 10h1.5a2.5 2.5 0 0 1 0 5H16 | M8 3.5c0 1.5 1 1.5 1 3 M12 3.5c0 1.5 1 1.5 1 3" },
    { id: "forest", name: "Forest night", icon: "M17 14.5A7 7 0 0 1 9.5 7a7 7 0 0 0 7.5 11.5 7 7 0 0 0 3-4z | M6 21l3-6 3 6z" },
    { id: "waves",  name: "Waves",        icon: "M3 9c2 0 2-2 4.5-2S10 9 12 9s2-2 4.5-2S19 9 21 9 | M3 15c2 0 2-2 4.5-2S10 15 12 15s2-2 4.5-2 2.5 2 4.5 2" }
  ];
  /* each sound's trim, so that equal sliders sound about equally loud: measured with an OfflineAudioContext (measure()
     below) and set a little higher for the low, brown-noise ones (fire, waves) than for the bright ones (café), which the
     ear hears as louder at the same level; forest night checked again by perceived loudness (K-weighted, as BS.1770),
     which put it about 3.5 dB under rain at 2.2 */
  var TRIM = { rain: 2.05, fire: 1.45, cafe: 3.2, forest: 3.3, waves: 1.45 };
  var ids = SOUNDS.map(function(s){ return s.id; });
  function clamp(v, lo, hi, d){ v = typeof v === "number" && isFinite(v) ? v : d; return Math.max(lo, Math.min(hi, Math.round(v))); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }

  /* ---- settings: { on, master 0–100, mix: { id: 0–100 }, last } ---- */
  var cfg = (function(){
    var o = null, out = { on: false, master: 70, mix: {}, last: "rain" };
    try { o = JSON.parse(Store.get(KEY) || "null"); } catch(_){}
    ids.forEach(function(id){ out.mix[id] = 0; });
    if (o && typeof o === "object"){
      out.on = o.on === true;
      out.master = clamp(o.master, 0, 100, 70);
      if (o.mix && typeof o.mix === "object") ids.forEach(function(id){ out.mix[id] = clamp(o.mix[id], 0, 100, 0); });
      if (ids.indexOf(o.last) >= 0) out.last = o.last;
    }
    return out;
  })();
  function save(){ Store.set(KEY, JSON.stringify(cfg)); }
  function playingIds(){ return ids.filter(function(id){ return cfg.mix[id] > 0; }); }

  /* ============================================================
     1. The sounds, built into any BaseAudioContext (the live one, or an
     OfflineAudioContext in the tests): build(c, id, out) connects the
     sound to `out` and returns what must be stopped to take it down.
     ============================================================ */
  var R = Math.random;
  function rnd(a, b){ return a + (b - a) * R(); }
  /* buffers are made once per context and kept on it */
  function cache(c){ return c.__llSnd || (c.__llSnd = {}); }
  function finish(d){
    var i, n = d.length, mean = 0, peak = 0;
    for (i = 0; i < n; i++) mean += d[i];
    mean /= n;
    for (i = 0; i < n; i++){ d[i] -= mean; if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]); }
    if (peak > 0) for (i = 0; i < n; i++) d[i] *= 0.9 / peak;
  }
  /* five seconds of mono noise at 32 kHz that loops without a seam: the tail is cross-faded into the head */
  function noise(c, kind){
    var box = cache(c);
    if (box[kind]) return box[kind];
    var rate = 32000, n = 5 * rate, f = Math.round(0.3 * rate), x = new Float32Array(n + f), i, w;
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (i = 0; i < n + f; i++){
      w = R() * 2 - 1;
      if (kind === "white") x[i] = w;
      else if (kind === "pink"){     /* Paul Kellet's filter */
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; x[i] = last; }   /* brown */
    }
    var buf = c.createBuffer(1, n, rate), d = buf.getChannelData(0);
    for (i = 0; i < n; i++) d[i] = x[i];
    for (i = 0; i < f; i++){ var t = i / f; d[i] = x[i] * Math.sqrt(t) + x[n + i] * Math.sqrt(1 - t); }
    finish(d);
    return (box[kind] = buf);
  }
  /* sparse events rendered into a stereo loop at 24 kHz; add() writes around the end, so the loop has no seam */
  function events(c, key, seconds, fill){
    var box = cache(c);
    if (box[key]) return box[key];
    var rate = 24000, n = Math.round(seconds * rate), L = new Float32Array(n), Rt = new Float32Array(n);
    function add(at, samples, pan, gain){
      var s = Math.floor(at * rate), gl = Math.cos(pan * Math.PI / 2) * gain, gr = Math.sin(pan * Math.PI / 2) * gain;
      for (var k = 0; k < samples.length; k++){ var j = (s + k) % n; L[j] += samples[k] * gl; Rt[j] += samples[k] * gr; }
    }
    fill(add, rate, seconds);
    var buf = c.createBuffer(2, n, rate), peak = 0, i;
    for (i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rt[i]));
    var g = peak > 0 ? 0.9 / peak : 1, dl = buf.getChannelData(0), dr = buf.getChannelData(1);
    for (i = 0; i < n; i++){ dl[i] = L[i] * g; dr[i] = Rt[i] * g; }
    return (box[key] = buf);
  }
  /* a slow control signal (0…1) at 8 kHz — the swell of waves, the syllables of a murmur — looped like the rest */
  function envelope(c, key, seconds, fill){
    var box = cache(c);
    if (box[key]) return box[key];
    var rate = 8000, n = Math.round(seconds * rate), buf = c.createBuffer(1, n, rate);
    fill(buf.getChannelData(0), rate, n);
    return (box[key] = buf);
  }
  /* the one-off sounds of the events */
  function tick(rate, len, bright){             /* a drop's tap: a few milliseconds of noise, sharply decaying */
    var n = Math.max(2, Math.round(len * rate)), s = new Float32Array(n), prev = 0;
    for (var k = 0; k < n; k++){ var w = R() * 2 - 1, v = bright ? w - prev : w; prev = w; s[k] = v * Math.exp(-6 * k / n); }
    return s;
  }
  function plink(rate, f0, len){               /* a drop into water: a short, falling tone */
    var n = Math.round(len * rate), s = new Float32Array(n), ph = 0;
    for (var k = 0; k < n; k++){ var t = k / rate, f = f0 * (1 - 0.35 * k / n); ph += 2 * Math.PI * f / rate; s[k] = Math.sin(ph) * Math.exp(-t * 90) * Math.min(1, k / 20); }
    return s;
  }
  function chirp(rate, f, pulses){             /* a cricket: three or four quick pulses of one high tone */
    var pulse = 0.014, gap = 0.028, n = Math.round((gap * (pulses - 1) + pulse) * rate), s = new Float32Array(n);
    for (var p = 0; p < pulses; p++){
      var a = Math.round(p * gap * rate), m = Math.round(pulse * rate);
      for (var k = 0; k < m; k++){ var e = Math.sin(Math.PI * k / m); s[a + k] += Math.sin(2 * Math.PI * f * (a + k) / rate) * e * e; }
    }
    return s;
  }
  function clink(rate, f0, twice){             /* a spoon on a cup: a few bright, inharmonic partials that ring out */
    var len = 0.7, n = Math.round(len * rate), s = new Float32Array(n);
    var parts = [[1, 1, 7], [2.76, 0.5, 11], [5.4, 0.25, 16], [8.93, 0.12, 22]];
    function strike(at, amp){
      var a = Math.round(at * rate);
      parts.forEach(function(p){
        for (var k = a; k < n; k++){ var t = (k - a) / rate; s[k] += amp * p[1] * Math.sin(2 * Math.PI * f0 * p[0] * t) * Math.exp(-t * p[2]) * Math.min(1, (k - a) / 12); }
      });
    }
    strike(0, 1);
    if (twice) strike(rnd(0.07, 0.14), 0.55);
    return s;
  }

  /* graph helpers */
  function loop(c, buf, rate, offset, dest){
    var s = c.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1;
    s.connect(dest); s.start(c.currentTime, (offset || 0) % buf.duration);
    return s;
  }
  /* one mono loop as a wide stereo bed: the two sides read it half a loop apart */
  function wide(c, buf, dest, rate, srcs){
    var m = c.createChannelMerger(2), l = c.createBufferSource(), r = c.createBufferSource();
    [l, r].forEach(function(s, k){ s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1; s.connect(m, 0, k); s.start(c.currentTime, k ? buf.duration / 2 : rnd(0, 0.5)); srcs.push(s); });
    m.connect(dest);
    return m;
  }
  function filter(c, type, freq, q, dest){ var f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; f.connect(dest); return f; }
  /* a filter whose frequency a slow signal moves: its coefficients once per 128 samples, not every sample (an audio-rate
     input makes the parameter a-rate, and the sweep is far too slow to hear the difference); older browsers throw */
  function krate(f){ try { f.frequency.automationRate = "k-rate"; } catch(_){} return f; }
  function gain(c, v, dest){ var g = c.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  /* a slow sine that moves a parameter up and down around the value it has */
  function lfo(c, hz, depth, param, srcs){
    var o = c.createOscillator(), g = c.createGain();
    o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(param); o.start(c.currentTime + rnd(0, 0.2)); srcs.push(o);
  }
  /* an envelope buffer driving a parameter: value + env × depth */
  function drive(c, buf, param, depth, rate, offset, srcs){
    var g = c.createGain(); g.gain.value = depth; g.connect(param);
    srcs.push(loop(c, buf, rate, offset, g));
  }
  function pan(c, p, dest){
    if (!c.createStereoPanner) return dest;
    var s = c.createStereoPanner(); s.pan.value = p; s.connect(dest); return s;
  }

  var BUILD = {
    /* rain: a bright hiss and a low body of pink and brown noise, and a loop of drops — taps and a few plinks,
       most of them faint — heard twice at different speeds so they never line up the same way */
    rain: function(c, out, srcs){
      var hiss = gain(c, 0.32, out);
      wide(c, noise(c, "pink"), filter(c, "highpass", 450, 0.5, filter(c, "lowpass", 8500, 0.5, hiss)), 1, srcs);
      lfo(c, 0.06, 0.07, hiss.gain, srcs);
      wide(c, noise(c, "brown"), filter(c, "lowpass", 600, 0.5, gain(c, 0.22, out)), 1, srcs);
      var drops = events(c, "drops", 7, function(add, rate, secs){
        for (var k = 0, n = secs * 16; k < n; k++){
          var a = 0.08 + 0.92 * Math.pow(R(), 3);
          add(rnd(0, secs), R() < 0.8 ? tick(rate, rnd(0.002, 0.007), true) : plink(rate, rnd(1600, 4200), rnd(0.02, 0.05)), R(), a);
        }
      });
      var dg = gain(c, 0.22, out);
      srcs.push(loop(c, drops, 1, 0, dg), loop(c, drops, 0.87, 3.1, gain(c, 0.7, dg)));
    },
    /* fire: a roar of brown noise that flickers (three slow sines on its gain), a little hiss of flame, and
       crackles — bursts of tiny clicks with the odd deeper pop */
    fire: function(c, out, srcs){
      var roar = gain(c, 0.5, out);
      wide(c, noise(c, "brown"), filter(c, "lowpass", 520, 0.6, roar), 1, srcs);
      lfo(c, 0.37, 0.1, roar.gain, srcs); lfo(c, 1.13, 0.07, roar.gain, srcs); lfo(c, 2.9, 0.04, roar.gain, srcs);
      var hiss = gain(c, 0.035, out);
      wide(c, noise(c, "pink"), filter(c, "bandpass", 2600, 0.8, hiss), 1, srcs);
      lfo(c, 0.23, 0.02, hiss.gain, srcs);
      var crackle = events(c, "crackle", 9, function(add, rate, secs){
        for (var k = 0, n = secs * 2.4; k < n; k++){
          var at = rnd(0, secs), amp = 0.25 + 0.75 * Math.pow(R(), 2), p = rnd(0.25, 0.75), clicks = 1 + Math.floor(Math.pow(R(), 2) * 7);
          for (var j = 0; j < clicks; j++){ at += rnd(0.004, 0.045); add(at, tick(rate, rnd(0.0006, 0.0035), true), p, amp * rnd(0.3, 1)); }
          if (R() < 0.12) add(at + 0.01, plink(rate, rnd(90, 170), 0.03), p, amp * 0.9);
        }
      });
      var cg = gain(c, 0.3, out);
      srcs.push(loop(c, crackle, 1, 0, cg), loop(c, crackle, 0.81, 4.4, gain(c, 0.6, cg)));
    },
    /* café: three murmuring "voices" (band-passed noise whose loudness follows a loop of syllables and pauses),
       a low room tone, and now and then a soft clink of a cup (scheduled while it plays) */
    cafe: function(c, out, srcs, timers){
      var syll = envelope(c, "syllables", 23, function(d, rate, n){
        var t = 0, secs = n / rate;
        while (t < secs){
          var talk = t + rnd(1.2, 4);
          while (t < talk && t < secs){
            var len = rnd(0.09, 0.26), a = rnd(0.35, 1), s = Math.round(t * rate), m = Math.round(len * rate);
            for (var k = 0; k < m; k++){ var j = (s + k) % n, e = Math.sin(Math.PI * k / m); d[j] = Math.max(d[j], a * e * e); }
            t += len * rnd(0.8, 1.3);
          }
          t += rnd(0.25, 1.1);
        }
      });
      var pink = noise(c, "pink");
      [[420, -0.55, 1.0, 0], [760, 0.15, 0.94, 7.3], [1250, 0.6, 1.06, 13.9]].forEach(function(v){
        var vg = gain(c, 0, pan(c, v[1], out));
        srcs.push(loop(c, pink, rnd(0.9, 1.1), rnd(0, 5), filter(c, "bandpass", v[0], 1.6, vg)));
        drive(c, syll, vg.gain, 0.55, v[2], v[3], srcs);
      });
      wide(c, noise(c, "pink"), filter(c, "bandpass", 600, 0.7, gain(c, 0.1, out)), 0.97, srcs);
      wide(c, noise(c, "brown"), filter(c, "lowpass", 260, 0.5, gain(c, 0.16, out)), 1, srcs);
      var cl = [clink(24000, 2150, false), clink(24000, 2700, true), clink(24000, 3100, false), clink(24000, 2400, true)].map(function(s){
        var b = c.createBuffer(1, s.length, 24000); b.getChannelData(0).set(s); return b;
      });
      function one(when){
        var s = c.createBufferSource();
        s.buffer = cl[Math.floor(R() * cl.length)]; s.playbackRate.value = rnd(0.92, 1.12);
        s.connect(gain(c, rnd(0.03, 0.08), pan(c, rnd(-0.7, 0.7), out)));
        s.start(when);
      }
      if (timers){
        (function next(){ timers[0] = setTimeout(function(){ if (c.state === "running") one(c.currentTime + 0.05); next(); }, rnd(2500, 9000)); })();
      } else { one(c.currentTime + 1.5); one(c.currentTime + 5.2); }
    },
    /* forest night: crickets (two loops of chirping, each cricket on its own steady beat, the second loop slower
       and lower, like ones further off) over a light wind that rises and falls */
    forest: function(c, out, srcs){
      var crick = events(c, "crickets", 6, function(add, rate, secs){
        [[4500, 8, 0.2, 1], [4750, 10, 0.75, 0.7], [4300, 9, 0.5, 0.45]].forEach(function(cr){
          var period = secs / cr[1], phase = rnd(0, period), pulses = R() < 0.5 ? 3 : 4, s = chirp(rate, cr[0], pulses);
          for (var k = 0; k < cr[1]; k++) add(phase + k * period + rnd(-0.01, 0.01), s, cr[2], cr[3]);
        });
      });
      var cg = gain(c, 0.2, out);
      srcs.push(loop(c, crick, 1, 0, cg), loop(c, crick, 0.93, 2.3, gain(c, 0.45, cg)));
      var wind = gain(c, 0.3, out), bp = krate(filter(c, "bandpass", 480, 0.6, wind));
      wide(c, noise(c, "pink"), bp, 1, srcs);
      lfo(c, 0.061, 0.14, wind.gain, srcs); lfo(c, 0.137, 0.08, wind.gain, srcs); lfo(c, 0.05, 160, bp.frequency, srcs);
      wide(c, noise(c, "brown"), filter(c, "lowpass", 180, 0.5, gain(c, 0.1, out)), 1, srcs);
    },
    /* waves: brown noise opened and closed by a loop of swells (each wave rises, breaks, draws back), with a
       wash of foam that follows the break a moment later */
    waves: function(c, out, srcs){
      var swell = envelope(c, "swell", 41, function(d, rate, n){
        var periods = [], sum = 0, secs = n / rate;
        while (sum < secs - 6){ var p = rnd(6.5, 11.5); periods.push(p); sum += p; }
        var k = secs / sum, t = 0;
        periods.forEach(function(p){
          p *= k;
          var peak = rnd(0.6, 1), up = p * rnd(0.5, 0.62), s = Math.round(t * rate), m = Math.round(p * rate), u = Math.round(up * rate);
          for (var j = 0; j < m && s + j < n; j++){
            d[s + j] = j < u ? 0.06 + (peak - 0.06) * (1 - Math.cos(Math.PI * j / u)) / 2 : 0.06 + (peak - 0.06) * Math.exp(-4.2 * (j - u) / (m - u));
          }
          t += p;
        });
      });
      var body = gain(c, 0.12, out), lp = krate(filter(c, "lowpass", 320, 0.7, body));
      wide(c, noise(c, "brown"), lp, 1, srcs);
      drive(c, swell, body.gain, 0.8, 1, 0, srcs);
      drive(c, swell, lp.frequency, 1500, 1, 0, srcs);
      var foam = gain(c, 0.015, out);
      wide(c, noise(c, "pink"), filter(c, "highpass", 1100, 0.5, foam), 1, srcs);
      drive(c, swell, foam.gain, 0.26, 1, 40.2, srcs);
    }
  };

  /* ============================================================
     2. The live mix: sound → its level → read-aloud duck → fade →
     master volume → a gentle limiter → the speakers
     ============================================================ */
  var ctx = null, bus = null, fadeG = null, masterG = null, layers = {}, playing = false, downT = null, ticker = null, armed = false;
  function vol(v){ return Math.pow(v / 100, 2); }
  /* the last stage: a limiter (a fast, hard compressor: at the chips' levels nothing reaches it, a loud blend is held
     well under full scale), then a fixed step down. A compressor adds make-up gain of its own (about 6 dB here); the
     step takes most of it back, so a sound plays about as loud as it did through the old, gentler stage, whose make-up
     gain let two sounds at 100 % clip */
  function limiter(c, dest){
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 8; comp.ratio.value = 20; comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(gain(c, 0.67, dest));
    return comp;
  }
  function ensure(){
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: "playback" }); } catch(_){ try { ctx = new AC(); } catch(__){ return null; } }
    masterG = gain(ctx, vol(cfg.master), limiter(ctx, ctx.destination));
    fadeG = gain(ctx, 0, masterG);
    bus = gain(ctx, 1, fadeG);
    return ctx;
  }
  function ramp(param, to, secs){
    var t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(to, t + secs);
  }
  function build(id){
    var L = { g: gain(ctx, 0, bus), srcs: [], timers: [], off: null };
    try { BUILD[id](ctx, L.g, L.srcs, L.timers); } catch(err){ console.warn("sounds: " + id, err); }
    layers[id] = L;
    return L;
  }
  function drop(id){
    var L = layers[id];
    if (!L) return;
    delete layers[id];
    L.timers.forEach(clearTimeout);
    L.srcs.forEach(function(s){ try { s.stop(); } catch(_){} try { s.disconnect(); } catch(_){} });
    try { L.g.disconnect(); } catch(_){}
  }
  /* each sound follows its slider: built when it comes up from 0, taken down a moment after it goes back */
  function levels(){
    ids.forEach(function(id){
      var v = cfg.mix[id], L = layers[id];
      if (v > 0){
        if (!L) L = build(id);
        clearTimeout(L.off); L.off = null;
        L.g.gain.setTargetAtTime(TRIM[id] * vol(v), ctx.currentTime, 0.08);
      } else if (L && !L.off){
        L.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        L.off = setTimeout(function(){ if (!(cfg.mix[id] > 0)) drop(id); }, 700);
      }
    });
    masterG.gain.setTargetAtTime(vol(cfg.master), ctx.currentTime, 0.05);
    /* read aloud (or the recap read out) speaking: the sounds step back a little */
    bus.gain.setTargetAtTime(speaking() ? 0.65 : 1, ctx.currentTime, 0.3);
  }
  function speaking(){ return !!((Speak && Speak.isPlaying && Speak.isPlaying()) || (window.llRecap && window.llRecap.speaking && window.llRecap.speaking())); }
  function docOpen(){ return state.mode === "doc" || state.mode === "pdf"; }
  function wanted(){ return cfg.on && playingIds().length > 0 && docOpen() && (document.visibilityState !== "hidden" || speaking()); }
  /* the one place that starts and stops: called on every change of setting, page, book or read aloud */
  function sync(){
    var want = wanted();
    if (want){
      if (!ensure()) return;
      levels();
      if (!playing){
        playing = true;
        clearTimeout(downT); downT = null;
        var go = function(){ if (playing) ramp(fadeG.gain, 1, FADE); };
        if (ctx.state === "running") go();
        else {
          var p = null;
          try { p = ctx.resume(); } catch(_){}
          if (p && p.then) p.then(function(){ if (ctx.state === "running") go(); else arm(); }, arm); else arm();
          /* a resume the browser holds back until a gesture never settles: listen for one anyway */
          setTimeout(function(){ if (playing && ctx.state !== "running") arm(); }, 300);
        }
      }
    } else if (playing){
      playing = false;
      if (ctx){
        ramp(fadeG.gain, 0, FADE);
        clearTimeout(downT);
        /* faded out: the sounds are taken down and the context suspended, so nothing runs while silent */
        downT = setTimeout(function(){ if (playing) return; ids.forEach(drop); try { ctx.suspend(); } catch(_){} }, FADE * 1000 + 150);
      }
    }
    if (!ticker && (want || cfg.on)) ticker = setInterval(watch, 1000);
    else if (ticker && !want && !cfg.on){ clearInterval(ticker); ticker = null; }
    status();
  }
  /* read aloud starting or stopping (while the page is hidden too) is noticed within a second */
  var lastSpeak = false;
  function watch(){
    var s = speaking();
    if (s !== lastSpeak || wanted() !== playing){ lastSpeak = s; sync(); }
  }
  /* the AudioContext may start only from a user gesture: the next tap or key starts it */
  function arm(){
    if (armed) return;
    armed = true;
    var evs = ["pointerdown", "keydown", "touchend"];
    function fire(){
      armed = false;
      evs.forEach(function(e){ window.removeEventListener(e, fire, true); });
      if (!ctx || !playing) return;
      try {
        var p = ctx.resume();
        if (p && p.then) p.then(function(){ if (playing) ramp(fadeG.gain, 1, FADE); status(); });
      } catch(_){}
    }
    evs.forEach(function(e){ window.addEventListener(e, fire, true); });
    status();
  }
  document.addEventListener("visibilitychange", sync);
  if (window.MutationObserver) new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["data-mode"] });

  /* ============================================================
     3. The panel: a chip per sound to play it alone (again to stop),
     a slider each to blend them, the master volume, and the switch
     ============================================================ */
  function icon(d){
    return '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d.split(" | ").map(function(p){ return '<path d="' + p + '"/>'; }).join("") + '</svg>';
  }
  function nameOf(id){ for (var i = 0; i < SOUNDS.length; i++) if (SOUNDS[i].id === id) return SOUNDS[i].name; return id; }
  function stateText(){
    var on = playingIds();
    if (!cfg.on || !on.length) return "Off.";
    var names = on.map(nameOf), list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0];
    if (!docOpen()) return list + " — plays while a book is open.";
    if (playing && ctx && ctx.state !== "running") return list + " — tap anywhere to start the sound.";
    return list + (names.length > 1 ? " are playing." : " is playing.");
  }
  function render(body){
    var chips = SOUNDS.map(function(s){
      return '<button type="button" class="chip" data-snd="' + s.id + '" aria-pressed="false">' + icon(s.icon) + '<span>' + esc(s.name) + '</span></button>';
    }).join("");
    var rows = SOUNDS.map(function(s){
      return '<div class="rowline"><label for="snd-' + s.id + '">' + esc(s.name) + '</label><input type="range" id="snd-' + s.id + '" data-mix="' + s.id + '" min="0" max="100" step="1">' +
        '<span class="val" id="snd-' + s.id + 'V"></span></div>';
    }).join("");
    /* on a phone the sheet shows about its first 580 px: the switch, the chips, the volume and what is playing (or waiting
       for a tap) come first, the blend and the notes after */
    body.innerHTML = '<div class="snd-panel">' +
      '<div class="rowline"><label class="check"><input type="checkbox" id="sndOn">Play background sounds</label></div>' +
      '<div class="chips snd-chips" id="sndChips" role="group" aria-label="Play one sound on its own">' + chips + '</div>' +
      '<div class="rowline"><label for="sndMaster">Volume</label><input type="range" id="sndMaster" min="0" max="100" step="1"><span class="val" id="sndMasterV"></span></div>' +
      '<p class="hint snd-state" id="sndState" aria-live="polite"></p>' +
      '<div class="snd-mix" role="group" aria-labelledby="sndMixL"><div class="label sec" id="sndMixL">Mix</div>' + rows + '</div>' +
      '<p class="hint">Tap a sound to play it on its own, and again to stop it. The sliders blend several; 0 turns one off.</p>' +
      '<p class="hint">Made on this device as they play — no recordings, nothing to download. They play while a book is open, under read aloud too, and pause when you leave the page.</p>' +
      '</div>';
    paint(body);
  }
  function paint(body){
    body = body || (Side && Side.is && Side.is("sounds") ? Side.body : null);
    if (!body || !body.querySelector("#sndOn")) return;
    body.querySelector("#sndOn").checked = cfg.on;
    Array.prototype.forEach.call(body.querySelectorAll("#sndChips .chip"), function(ch){
      var on = cfg.on && cfg.mix[ch.dataset.snd] > 0;
      ch.classList.toggle("on", on); ch.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(body.querySelectorAll("input[data-mix]"), function(r){
      var v = cfg.mix[r.dataset.mix];
      if (document.activeElement !== r) r.value = v;
      body.querySelector("#" + r.id + "V").textContent = v ? v + " %" : "off";
      r.setAttribute("aria-valuetext", v ? v + " %" : "off");
    });
    var m = body.querySelector("#sndMaster");
    if (document.activeElement !== m) m.value = cfg.master;
    body.querySelector("#sndMasterV").textContent = cfg.master + " %";
    m.setAttribute("aria-valuetext", cfg.master + " %");
    status(body);
  }
  function status(body){
    body = body || (Side && Side.is && Side.is("sounds") ? Side.body : null);
    var el = body && body.querySelector("#sndState");
    if (el){ var t = stateText(); if (el.textContent !== t) el.textContent = t; }
  }
  function changed(){ save(); sync(); paint(); }
  /* one sound on its own; the same chip again stops it */
  function solo(id){
    if (ids.indexOf(id) < 0) return;
    var alone = cfg.on && cfg.mix[id] > 0 && playingIds().length === 1;
    if (alone){ cfg.on = false; changed(); return; }
    var v = cfg.mix[id] > 0 ? cfg.mix[id] : 60;
    ids.forEach(function(k){ cfg.mix[k] = k === id ? v : 0; });
    cfg.on = true; cfg.last = id;
    ensure();      /* inside the tap: the context may start */
    changed();
  }
  function setMix(id, v){
    cfg.mix[id] = clamp(v, 0, 100, 0);
    if (cfg.mix[id] > 0){ cfg.on = true; cfg.last = id; ensure(); }
    changed();
  }
  function setOn(on){
    cfg.on = !!on;
    if (cfg.on && !playingIds().length) cfg.mix[cfg.last] = 60;
    if (cfg.on) ensure();
    changed();
  }
  function setMaster(v){ cfg.master = clamp(v, 0, 100, 70); ensure(); changed(); }
  function openPanel(){
    if (!Side) return;
    Side.open("sounds", "Background sounds", render);
    if (!(window.AudioContext || window.webkitAudioContext) && Marks) Marks.toast("This browser can’t play sounds made on the device");
  }
  if (Side && Side.body){
    Side.body.addEventListener("click", function(e){
      if (!Side.is("sounds")) return;
      var ch = e.target.closest("#sndChips .chip");
      if (ch) solo(ch.dataset.snd);
    });
    Side.body.addEventListener("input", function(e){
      if (!Side.is("sounds")) return;
      var t = e.target;
      if (t.dataset && t.dataset.mix) setMix(t.dataset.mix, +t.value);
      else if (t.id === "sndMaster") setMaster(+t.value);
    });
    Side.body.addEventListener("change", function(e){
      if (Side.is("sounds") && e.target.id === "sndOn") setOn(e.target.checked);
    });
  }

  /* for app.js, the tests and the calibration: render(id, seconds) plays a sound into an OfflineAudioContext
     and reports its loudness */
  function measure(id, seconds){
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || !BUILD[id]) return Promise.reject(new Error("no offline audio"));
    var rate = 24000, c = new OAC(2, Math.round((seconds || 4) * rate), rate), out = c.createGain(), srcs = [];
    out.gain.value = TRIM[id]; out.connect(c.destination);
    BUILD[id](c, out, srcs, null);
    return c.startRendering().then(function(buf){
      var sum = 0, peak = 0, n = 0;
      for (var ch = 0; ch < 2; ch++){ var d = buf.getChannelData(ch); for (var i = 0; i < d.length; i++){ sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); n++; } }
      return { rms: Math.sqrt(sum / n), peak: peak };
    });
  }
  window.llSounds = {
    openPanel: openPanel, sync: sync, solo: solo, setMix: setMix, setOn: setOn, setMaster: setMaster, sounds: ids.slice(),
    settings: function(){ return JSON.parse(JSON.stringify(cfg)); },
    isPlaying: function(){ return playing; }, context: function(){ return ctx; }, layers: function(){ return Object.keys(layers); },
    fade: function(){ return fadeG ? fadeG.gain.value : 0; }, measure: measure
  };
  sync();
})();
