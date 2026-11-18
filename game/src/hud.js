// HUD: cash, stars, objective bar, prompts, toasts, banners, speedometer,
// damage vignette and the 2D canvas minimap.
window.PC = window.PC || {};

PC.Hud = {
  els: {},
  toastUntil: 0, bannerUntil: 0, vigUntil: 0,
  init() {
    for (const id of ['cash', 'story', 'health', 'stars', 'objective', 'speedo', 'prompt',
      'toast', 'banner', 'vignette', 'bustbar', 'bustfill'])
      this.els[id] = document.getElementById(id);
    this.mapCtx = document.getElementById('minimap').getContext('2d');
  },
  toast(text, secs) {
    this.els.toast.textContent = text;
    this.els.toast.classList.remove('hidden');
    this.toastUntil = performance.now() + secs * 1000;
  },
  banner(title, sub, secs) {
    this.els.banner.innerHTML = '';
    this.els.banner.appendChild(document.createTextNode(title));
    const small = document.createElement('small');
    small.textContent = sub || ''; this.els.banner.appendChild(small);
    this.els.banner.classList.remove('hidden');
    this.bannerUntil = performance.now() + secs * 1000;
  },
  flashDamage() { this.vigUntil = performance.now() + 350; },
  setPrompt(html) {
    if (html) { this.els.prompt.innerHTML = html; this.els.prompt.classList.remove('hidden'); }
    else this.els.prompt.classList.add('hidden');
  },
  update(S) {
    const now = performance.now();
    this.els.cash.textContent = '$' + S.cash.toLocaleString('en-US');
    this.els.story.textContent = PC.Missions.storyDone()
      ? 'Story complete — free roam'
      : 'Story: ' + PC.Missions.completed + ' / 3 missions';
    this.els.health.textContent = S.mode === 'drive' && S.car
      ? 'Car health ' + Math.max(0, Math.round(S.car.health)) + '%'
      : 'Health ' + Math.max(0, Math.round(PC.Player.health)) + '%';
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i++)
      stars += '<span class="' + (i < PC.Police.wanted ? '' : 'off') + '">★</span>';
    this.els.stars.innerHTML = stars;
    // Objective bar.
    const M = PC.Missions;
    if (M.active !== null) {
      const st = M.currentStep(), m = M.list[M.active];
      let t = '<b>' + m.title + ':</b> ' + st.text + ' — ' + (S.objectiveDist || 0) + 'm';
      if (m.time > 0) t += ' • ⏱ ' + Math.max(0, Math.ceil(M.timer)) + 's';
      this.els.objective.innerHTML = t;
    } else if (M.canStart()) {
      const g = M.giverPos();
      const d = Math.round(PC.dist2d(S.focusX, S.focusZ, g.x, g.z));
      this.els.objective.innerHTML = '<b>Next job:</b> meet Marisol at the Marina Garage (M) — ' + d + 'm';
    } else this.els.objective.innerHTML = '<b>Palm City</b> — free roam. The city is yours.';
    // Speedometer while driving.
    this.els.speedo.innerHTML = S.mode === 'drive' && S.car
      ? '<b>' + PC.Driving.speedKmh(S.car) + '</b> km/h' : '';
    // Bust meter.
    if (PC.Police.bust > 0.02) {
      this.els.bustbar.classList.remove('hidden');
      this.els.bustfill.style.width = Math.round(PC.Police.bust * 100) + '%';
    } else this.els.bustbar.classList.add('hidden');
    if (now > this.toastUntil) this.els.toast.classList.add('hidden');
    if (now > this.bannerUntil) this.els.banner.classList.add('hidden');
    this.els.vignette.style.opacity = now < this.vigUntil ? 1 : 0;
    this.drawMinimap(S);
  },
  drawMinimap(S) {
    const g = this.mapCtx, W = 180, scale = W / 560;
    const px = (x) => (x + 280) * scale, pz = (z) => (z + 280) * scale;
    g.fillStyle = '#77a75e'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#2e9db4'; g.fillRect(0, pz(252), W, W - pz(252));
    g.strokeStyle = '#3d4148'; g.lineWidth = 5;
    for (const r of PC.ROADS) {
      g.beginPath(); g.moveTo(0, pz(r)); g.lineTo(W, pz(r)); g.stroke();
      g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), W); g.stroke();
    }
    g.fillStyle = '#8a8f98';
    for (const c of PC.cars) {
      if (c.driver === 'traffic') g.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3);
    }
    g.fillStyle = '#ff4040';
    for (const u of PC.Police.units) {
      g.beginPath(); g.arc(px(u.x), pz(u.z), 3.4, 0, 7); g.fill();
    }
    const M = PC.Missions;
    if (M.active !== null) {
      const st = M.currentStep();
      g.fillStyle = '#ffd94d';
      g.beginPath(); g.arc(px(st.x), pz(st.z), 5, 0, 7); g.fill();
      g.strokeStyle = '#7a5b00'; g.stroke();
    } else if (M.canStart()) {
      const gp = M.giverPos();
      g.fillStyle = '#ffd94d'; g.font = 'bold 12px Verdana'; g.textAlign = 'center';
      g.fillText('M', px(gp.x), pz(gp.z) + 4);
    }
    // Player arrow.
    const hx = S.mode === 'drive' && S.car ? S.car.heading : PC.Player.heading;
    g.save();
    g.translate(px(S.focusX), pz(S.focusZ)); g.rotate(Math.PI - hx);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(-4.4, 5); g.closePath(); g.fill();
    g.strokeStyle = '#123'; g.stroke();
    g.restore();
  },
};
