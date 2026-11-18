// Palm City Heat — boot, game state, the main loop, enter/exit cars, crime
// callbacks, save/load, pause/busted/wasted flow and screenshot posing.
window.PC = window.PC || {};

const S = {
  mode: 'foot',            // 'foot' | 'drive'
  state: 'menu',           // 'menu' | 'playing' | 'paused' | 'ended'
  car: null,               // car the player is driving
  cash: 250, totalEarned: 0,
  focusX: -196, focusZ: 150,
  keys: {}, cam: { yaw: 0.7, pitch: 0.32, dist: 10 },
  alarmX: null, alarmZ: null, alarmT: 0,
  objectiveDist: 0, nearestPoliceDist: null, policeSeePlayer: false,
  endKind: null, cleanHintT: 0, sceneRef: null,
  toast(text, secs) { PC.Hud.toast(text, secs); },
  banner(t, s, secs) { PC.Hud.banner(t, s, secs); },
  earn(amount) { S.cash += amount; S.totalEarned += amount; },
  save() {
    try {
      localStorage.setItem('palmCityHeat', JSON.stringify({
        cash: S.cash, completed: PC.Missions.completed, totalEarned: S.totalEarned,
      }));
    } catch (e) { /* private mode: play on without saving */ }
  },
  loadSave() {
    try {
      const raw = localStorage.getItem('palmCityHeat');
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (typeof d.cash === 'number') S.cash = d.cash;
      if (typeof d.totalEarned === 'number') S.totalEarned = d.totalEarned;
      if (typeof d.completed === 'number') PC.Missions.completed = PC.clamp(d.completed, 0, 3);
      return true;
    } catch (e) { return false; }
  },
};
// Crime + event callbacks used by the other systems.
S.onPedHit = function (ped, car) {
  PC.Police.addHeat(1.0, S);
  S.alarmX = ped.x; S.alarmZ = ped.z; S.alarmT = 4;
  PC.Hud.flashDamage(); PC.AudioSys.thud();
  S.toast('You hit a pedestrian! The heat is on.', 3);
};
S.onCrash = function (impact, x, z) {
  if (S.car) S.car.health -= impact * 0.55;
  PC.Hud.flashDamage(); PC.AudioSys.thud();
  if (impact > 16) { PC.Police.addHeat(0.35, S); S.alarmX = x; S.alarmZ = z; S.alarmT = 3; }
};
S.onPropertyHit = function () { PC.Police.addHeat(0.2, S); PC.AudioSys.thud(); };
S.onCarHit = function (other, impact) {
  if (S.car) S.car.health -= impact * 0.3;
  PC.Hud.flashDamage(); PC.AudioSys.thud();
  if (other.driver === 'police') PC.Police.addHeat(0.4, S);
  else if (impact > 12) PC.Police.addHeat(0.3, S);
};
S.onPoliceBump = function () { if (S.car) S.car.health -= 1.6; PC.AudioSys.thud(); };
S.onWantedUp = function (w) { S.toast('Wanted level: ' + w + ' star' + (w > 1 ? 's' : '') + '!', 2.5); };
S.onWantedDown = function (w) {
  S.toast(w === 0 ? 'You lost the heat.' : 'Heat cooling… ' + w + ' star' + (w > 1 ? 's' : '') + ' left.', 2.5);
};
S.onBusted = function () { endRun('busted'); };
PC.S = S;

// --- Scene setup -----------------------------------------------------------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
S.sceneRef = scene;
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

PC.buildCity(scene);
PC.Player.init(scene);
PC.setupTraffic(scene, 14);
PC.setupPeds(scene, 22);
PC.Missions.init(scene);
PC.Hud.init();
S.loadSave();
if (PC.Missions.completed > 0 || S.cash !== 250)
  document.getElementById('saveNote').textContent =
    'Progress saved: $' + S.cash + ' • ' + PC.Missions.completed + '/3 missions done. Starting keeps your cash and progress.';

// --- Input -----------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  S.keys[e.code] = true;
  if (e.code === 'Enter' && S.state === 'menu') startGame();
  if ((e.code === 'Escape' || e.code === 'KeyP') && S.state === 'playing') pauseGame();
  else if ((e.code === 'Escape' || e.code === 'KeyP') && S.state === 'paused') resumeGame();
  if (e.code === 'KeyM') { const m = PC.AudioSys.toggleMute(); S.toast(m ? 'Sound off' : 'Sound on', 1.2); }
  if (e.code === 'KeyE' && S.state === 'playing') toggleCar();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { S.keys[e.code] = false; });
canvas.addEventListener('click', () => {
  PC.AudioSys.init();
  if (S.state === 'playing' && canvas.requestPointerLock) canvas.requestPointerLock();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  S.cam.yaw -= e.movementX * 0.0032;
  S.cam.pitch = PC.clamp(S.cam.pitch + e.movementY * 0.0024, 0.06, 1.15);
});
canvas.addEventListener('wheel', (e) => {
  S.cam.dist = PC.clamp(S.cam.dist + Math.sign(e.deltaY) * 1.6, 6, 22);
}, { passive: true });
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('respawnBtn').addEventListener('click', respawn);

function nearestCarToPlayer(maxD) {
  let best = null, bd = maxD;
  for (const c of PC.cars) {
    if (c.dead || c.driver === 'police' || c.driver === 'player') continue;
    if (c.driver === 'traffic' && Math.abs(c.speed) > 1) continue;
    const d = PC.dist2d(PC.Player.x, PC.Player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function toggleCar() {
  if (S.mode === 'foot') {
    const car = nearestCarToPlayer(4.2);
    if (!car) return;
    const wasTraffic = car.driver === 'traffic';
    car.driver = 'player'; car.speed = 0;
    S.car = car; S.mode = 'drive';
    PC.Player.mesh.visible = false;
    S.cam.dist = 13;
    if (wasTraffic) { // hot-wiring a moving car is a crime; parked is quieter
      PC.Police.addHeat(1.0, S);
      S.alarmX = car.x; S.alarmZ = car.z; S.alarmT = 4;
      S.toast('Car stolen! Palm City PD noticed.', 3);
    } else if (car === PC.Missions.missionCar) S.toast('Marisol: "Good. Now deliver — pier, south shore."', 3.5);
    PC.AudioSys.blip(300, 0.12, 0.1, 'square');
  } else {
    const car = S.car;
    car.driver = 'parked'; car.speed = 0;
    PC.Player.x = car.x + Math.cos(car.heading) * 2.4;
    PC.Player.z = car.z - Math.sin(car.heading) * 2.4;
    const fixed = PC.resolveCollisions(PC.Player.x, PC.Player.z, 0.7);
    PC.Player.x = fixed[0]; PC.Player.z = fixed[1];
    PC.Player.mesh.visible = true; PC.Player.syncMesh();
    S.car = null; S.mode = 'foot'; S.cam.dist = 10;
  }
}

// --- Run state ---------------------------------------------------------------
function startGame() {
  PC.AudioSys.init();
  document.getElementById('startScreen').classList.add('hidden');
  S.state = 'playing';
  S.toast('Find Marisol at the Marina Garage — follow the M on your minimap.', 5);
}
function pauseGame() {
  S.state = 'paused';
  document.getElementById('pauseStats').textContent =
    'Cash $' + S.cash + ' • Missions ' + PC.Missions.completed + '/3 • Total earned $' + S.totalEarned;
  document.getElementById('pauseScreen').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}
function resumeGame() {
  document.getElementById('pauseScreen').classList.add('hidden');
  S.state = 'playing';
}
function endRun(kind) {
  S.state = 'ended'; S.endKind = kind;
  const fine = kind === 'busted' ? Math.min(S.cash, 150 + PC.Police.wanted * 100) : Math.min(S.cash, 200);
  S.cash -= fine;
  PC.Police.clear();
  for (const u of [...PC.Police.units]) PC.Police.despawnUnit(scene, u);
  document.getElementById('endTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('endText').textContent = kind === 'busted'
    ? 'Palm City PD cuffed you on the street. Fine paid: $' + fine + '. You walk out of the station with your pride dented.'
    : 'You wake up at the Palm Clinic, patched up and billed $' + fine + '. The city keeps spinning.';
  document.getElementById('endScreen').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  PC.AudioSys.alarm();
  S.save();
}
function respawn() {
  document.getElementById('endScreen').classList.add('hidden');
  if (S.car) { S.car.driver = 'parked'; S.car = null; }
  S.mode = 'foot';
  PC.Player.mesh.visible = true;
  PC.Player.health = 100;
  const spot = S.endKind === 'busted' ? { x: -196, z: -138 } : { x: 196, z: -138 };
  PC.Player.x = spot.x; PC.Player.z = spot.z; PC.Player.syncMesh();
  S.focusX = spot.x; S.focusZ = spot.z;
  S.state = 'playing';
}

// --- Damage over time ---------------------------------------------------------
function checkWasted(dt) {
  // On foot: getting clipped by traffic drains health (hit test in peds is for
  // NPCs; the player takes a shove + damage instead of a ragdoll).
  if (S.mode === 'foot') {
    for (const c of PC.cars) {
      if (c.dead || Math.abs(c.speed) < 8) continue;
      if (PC.dist2d(PC.Player.x, PC.Player.z, c.x, c.z) < 2.2) {
        PC.Player.health -= 26;
        PC.Player.x += Math.sin(c.heading) * 3; PC.Player.z += Math.cos(c.heading) * 3;
        PC.Hud.flashDamage(); PC.AudioSys.thud();
        if (c.driver === 'police') PC.Police.addHeat(0.2, S);
        break;
      }
    }
    PC.Player.health = Math.min(100, PC.Player.health + dt * 1.6);
  } else if (S.car) {
    if (S.car.health <= 25 && !S.car.dead) { // smoke warning via toast once
      if (!S.car.warned) { S.car.warned = true; S.toast('This car is falling apart — get out!', 3); }
    }
    if (S.car.health <= 0 && !S.car.dead) {
      S.car.dead = true;
      const car = S.car;
      car.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
      S.toast('Wrecked! The car burns — you bail out.', 3);
      toggleCarExitOnly();
      PC.Player.health -= 25;
      PC.Hud.flashDamage();
    }
  }
  if (PC.Player.health <= 0 && S.state === 'playing') endRun('wasted');
}
function toggleCarExitOnly() {
  const car = S.car; if (!car) return;
  PC.Player.x = car.x + 2.6; PC.Player.z = car.z;
  const fixed = PC.resolveCollisions(PC.Player.x, PC.Player.z, 0.7);
  PC.Player.x = fixed[0]; PC.Player.z = fixed[1];
  PC.Player.mesh.visible = true; PC.Player.syncMesh();
  S.car = null; S.mode = 'foot';
}

// --- Main loop ------------------------------------------------------------------
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (S.state === 'playing') {
    if (S.keys['KeyQ']) S.cam.yaw += dt * 1.9;
    if (S.keys['ArrowLeft']) S.cam.yaw += dt * 1.9;
    if (S.keys['ArrowRight']) S.cam.yaw -= dt * 1.9;
    if (S.mode === 'foot') {
      PC.Player.update(dt, S.keys, S.cam.yaw, S);
      const near = nearestCarToPlayer(4.2);
      PC.Hud.setPrompt(near ? '<b>E</b> Enter car' : null);
      // Standing at the M marker starts the next mission.
      if (PC.Missions.canStart()) {
        const g = PC.Missions.giverPos();
        if (PC.dist2d(PC.Player.x, PC.Player.z, g.x, g.z) < 6) PC.Missions.start(scene, S);
      }
    } else if (S.car) {
      PC.Driving.update(dt, S.car, S.keys, S);
      PC.Hud.setPrompt('<b>E</b> Exit car');
      // Chase camera eases in behind the car when the mouse is not driving it.
      const targetYaw = S.car.heading;
      let dy = targetYaw - S.cam.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      if (!document.pointerLockElement) S.cam.yaw += dy * Math.min(1, dt * 2.2);
    }
    PC.updateTraffic(dt, S);
    PC.updatePeds(dt, S);
    PC.Police.update(dt, scene, S);
    PC.Missions.update(dt, scene, S);
    checkWasted(dt);
    if (S.alarmT > 0) { S.alarmT -= dt; if (S.alarmT <= 0) S.alarmX = null; }
    // Camera follows the focus (player or car).
    const fy = S.mode === 'drive' ? 1.2 : 1.6;
    PC.updateCamera(camera, S.cam, S.focusX, fy, S.focusZ, dt, false);
    PC.Hud.update(S);
    PC.AudioSys.update(dt, S.mode === 'drive', S.car ? Math.abs(S.car.speed) / 34 : 0, S.nearestPoliceDist);
    if (PC.seaMesh) PC.seaMesh.position.y = -0.4 + Math.sin(now * 0.0006) * 0.08;
  } else {
    renderer.render(scene, camera); // menus still show the city behind
    if (S.state === 'menu') { // slow menu orbit over the avenue
      const t = now * 0.00005;
      camera.position.set(Math.sin(t) * 150, 60, Math.cos(t) * 150);
      camera.lookAt(0, 0, 60);
    }
  }
  if (S.state === 'playing' || S.state === 'paused') renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// --- Screenshot posing (?shot=<name>&seed=1) -------------------------------------
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
if (shotName) {
  document.getElementById('startScreen').classList.add('hidden');
  S.state = 'playing';
  PC.rng = PC.makeRng(7);
  poseShot(shotName);
}
function poseShot(name) {
  const P = PC.Player;
  if (name === 'cover') {
    // Vista down the central avenue (road x=0) toward the waterfront: the hero
    // car waits in the southbound lane, the player beside it, sea beyond.
    PC.spawnCar(scene, 3.6, 148, 0, 0xe84f4f, 'sport', 'parked');
    P.x = -3; P.z = 146; P.heading = 0.2; P.syncMesh();
    S.focusX = 0; S.focusZ = 150;
    S.cam.yaw = 0; S.cam.pitch = 0.42; S.cam.dist = 17;
    PC.updateCamera(camera, S.cam, 0, 1.6, 150, 1, true);
  } else if (name === 'drive') {
    const car = PC.spawnCar(scene, 3.6, 20, 0, 0x4f8fe8, 'civil', 'player');
    car.speed = 16; car.cruise = 15; S.car = car; S.mode = 'drive'; P.mesh.visible = false;
    S.focusX = car.x; S.focusZ = car.z; S.cam.yaw = 0; S.cam.pitch = 0.3; S.cam.dist = 12;
    PC.updateCamera(camera, S.cam, car.x, 1.2, car.z, 1, true);
  } else if (name === 'chase') {
    const car = PC.spawnCar(scene, 3.6, -20, 0, 0xf2c14e, 'civil', 'player');
    car.speed = 23; car.cruise = 22; S.car = car; S.mode = 'drive'; P.mesh.visible = false;
    PC.Police.heat = 3.2; PC.Police.wanted = 3;
    const u1 = PC.Police.spawnUnit(scene, S); u1.x = -2; u1.z = -36; u1.heading = 0; u1.speed = 21;
    const u2 = PC.Police.spawnUnit(scene, S); u2.x = 10; u2.z = -46; u2.heading = 0.15; u2.speed = 20;
    PC.placeCarMesh(u1); PC.placeCarMesh(u2);
    S.focusX = car.x; S.focusZ = car.z; S.cam.yaw = 0; S.cam.pitch = 0.38; S.cam.dist = 19;
    PC.updateCamera(camera, S.cam, car.x, 1.2, car.z, 1, true);
  } else if (name === 'mission') {
    PC.Missions.completed = 0;
    PC.Missions.start(scene, S);
    P.x = -182; P.z = 138; P.heading = -0.86; P.syncMesh();
    S.focusX = P.x; S.focusZ = P.z;
    S.cam.yaw = -0.86; S.cam.pitch = 0.3; S.cam.dist = 11;
    PC.updateCamera(camera, S.cam, P.x, 1.6, P.z, 1, true);
  }
  PC.Hud.update(S);
}
