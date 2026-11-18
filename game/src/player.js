// The player character on foot (procedural walk swing) and the pedestrians
// who wander the sidewalks and flee from danger.
window.PC = window.PC || {};

// A simple low-poly person: torso, head, swinging arms and legs.
PC.makePerson = function (shirt, pants, skin) {
  const g = new THREE.Group();
  const mShirt = new THREE.MeshLambertMaterial({ color: shirt });
  const mPants = new THREE.MeshLambertMaterial({ color: pants });
  const mSkin = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.45), mShirt);
  torso.position.y = 1.45; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), mSkin);
  head.position.y = 2.3; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56), mShirt);
  cap.position.y = 2.62; g.add(cap);
  function limb(mat, w, len) {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len / 2; pivot.add(m); return pivot;
  }
  const armL = limb(mSkin, 0.24, 0.95); armL.position.set(-0.56, 1.95, 0); g.add(armL);
  const armR = limb(mSkin, 0.24, 0.95); armR.position.set(0.56, 1.95, 0); g.add(armR);
  const legL = limb(mPants, 0.3, 0.95); legL.position.set(-0.22, 0.95, 0); g.add(legL);
  const legR = limb(mPants, 0.3, 0.95); legR.position.set(0.22, 0.95, 0); g.add(legR);
  g.userData.parts = { armL, armR, legL, legR };
  return g;
};
function animateWalk(mesh, phase, speed01, armsUp) {
  const p = mesh.userData.parts, s = Math.sin(phase) * (0.25 + speed01 * 0.5);
  p.legL.rotation.x = s; p.legR.rotation.x = -s;
  if (armsUp) { p.armL.rotation.z = 2.6; p.armR.rotation.z = -2.6; p.armL.rotation.x = 0; p.armR.rotation.x = 0; }
  else { p.armL.rotation.z = 0; p.armR.rotation.z = 0; p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8; }
}

PC.Player = {
  mesh: null, x: -196, z: 150, heading: 0.6, health: 100, walkPhase: 0, speedNow: 0,
  init(scene) {
    this.mesh = PC.makePerson(0xff7a3c, 0x2c4a6e, 0xe8b48c);
    scene.add(this.mesh); this.syncMesh();
  },
  syncMesh() {
    this.mesh.position.set(this.x, 0.45, this.z);
    this.mesh.rotation.y = this.heading + Math.PI;
  },
  // WASD relative to camera yaw. Returns nothing; S holds shared state.
  update(dt, keys, camYaw, S) {
    let mx = 0, mz = 0;
    const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const r = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    mx = sy * f + cy * r; mz = cy * f - sy * r;
    const len = Math.hypot(mx, mz);
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = sprint ? 13.5 : 8;
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
      this.x += mx * speed * dt; this.z += mz * speed * dt;
      this.walkPhase += dt * (sprint ? 13 : 9);
      this.speedNow = speed;
    } else this.speedNow = 0;
    animateWalk(this.mesh, this.walkPhase, this.speedNow / 13.5, false);
    const fixed = PC.resolveCollisions(this.x, this.z, 0.7);
    this.x = fixed[0]; this.z = fixed[1];
    const bob = len > 0.01 ? Math.abs(Math.sin(this.walkPhase)) * 0.09 : 0;
    this.syncMesh(); this.mesh.position.y = 0.45 + bob;
    S.focusX = this.x; S.focusZ = this.z;
  },
};

// --- Pedestrians -----------------------------------------------------------
PC.peds = [];
const PED_SHIRTS = [0xffe08a, 0x8fd0ff, 0xff9db0, 0xb0ffb0, 0xffffff, 0xc0a8ff, 0xffb060];
PC.setupPeds = function (scene, count) {
  const blockCenters = [-175, -105, -35, 35, 105, 175];
  for (let i = 0; i < count; i++) {
    const mesh = PC.makePerson(PC.pick(PED_SHIRTS), PC.pick([0x33415c, 0x6e5136, 0x444444, 0x7a3b4f]),
      PC.pick([0xe8b48c, 0xc98a5e, 0x8a5a34, 0xf2cda8]));
    scene.add(mesh);
    const bx = PC.pick(blockCenters), bz = PC.pick(blockCenters);
    const ped = {
      mesh, x: bx + PC.rand(-24, 24), z: bz + PC.rand(-24, 24),
      tx: 0, tz: 0, heading: 0, walkPhase: PC.rand(0, 6), state: 'walk', fallT: 0, speed: 0,
    };
    ped.tx = ped.x; ped.tz = ped.z;
    PC.peds.push(ped);
  }
};
function pedPickTarget(ped) {
  // Wander to another point on a sidewalk ring around a nearby block.
  const bx = PC.nearestRoad(ped.x) + (PC.rng() < .5 ? -35 : 35);
  const bz = PC.nearestRoad(ped.z) + (PC.rng() < .5 ? -35 : 35);
  ped.tx = PC.clamp(bx + PC.rand(-25, 25), -245, 245);
  ped.tz = PC.clamp(bz + PC.rand(-25, 25), -245, 245);
  if (PC.insideBuilding(ped.tx, ped.tz, 1)) { ped.tx = PC.nearestRoad(ped.tx); ped.tz = PC.nearestRoad(ped.tz); }
}
PC.updatePeds = function (dt, S) {
  for (const ped of PC.peds) {
    if (ped.state === 'down') {
      ped.fallT -= dt;
      if (ped.fallT <= 0) { ped.state = 'walk'; ped.mesh.rotation.x = 0; ped.mesh.position.y = 0.45; }
      continue;
    }
    // Danger: a fast car close by, or any crime flash the game flagged.
    let danger = null, fleeing = false;
    for (const car of PC.cars) {
      if (car.dead || Math.abs(car.speed) < 9) continue;
      const d = PC.dist2d(ped.x, ped.z, car.x, car.z);
      if (d < 11) { danger = car; fleeing = true; break; }
    }
    if (S.alarmX !== null && PC.dist2d(ped.x, ped.z, S.alarmX, S.alarmZ) < 26) fleeing = true;
    let speed = 2.6;
    if (fleeing) {
      speed = 8.5;
      const ax = danger ? danger.x : S.alarmX, az = danger ? danger.z : S.alarmZ;
      ped.tx = ped.x + (ped.x - ax) * 2; ped.tz = ped.z + (ped.z - az) * 2;
    } else if (PC.dist2d(ped.x, ped.z, ped.tx, ped.tz) < 1.6 || ped.tx === ped.x) pedPickTarget(ped);
    const dx = ped.tx - ped.x, dz = ped.tz - ped.z, len = Math.hypot(dx, dz);
    if (len > 0.05) {
      ped.heading = Math.atan2(dx / len, dz / len);
      ped.x += (dx / len) * speed * dt; ped.z += (dz / len) * speed * dt;
      ped.walkPhase += dt * (fleeing ? 14 : 7);
    }
    const fixed = PC.resolveCollisions(ped.x, ped.z, 0.6);
    ped.x = fixed[0]; ped.z = fixed[1];
    ped.mesh.position.set(ped.x, 0.45, ped.z);
    ped.mesh.rotation.y = ped.heading + Math.PI;
    animateWalk(ped.mesh, ped.walkPhase, speed / 8.5, fleeing);
    ped.speed = speed;
    // Run over? Only by a genuinely moving car; cartoon tip-over, no gore.
    for (const car of PC.cars) {
      if (car.dead || Math.abs(car.speed) < 7) continue;
      if (PC.dist2d(ped.x, ped.z, car.x, car.z) < 2.1) {
        ped.state = 'down'; ped.fallT = 5;
        ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.35;
        if (car.driver === 'player' && S.onPedHit) S.onPedHit(ped, car);
        break;
      }
    }
  }
};
PC.knockPed = function (ped) { // used by shot posing
  ped.state = 'down'; ped.fallT = 999;
  ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.35;
  ped.mesh.position.set(ped.x, 0.35, ped.z);
};
