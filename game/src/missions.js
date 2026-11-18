// The 3-mission story arc for fixer Marisol Vega, plus objective markers.
// One mission at a time; between missions a gold "M" blip at the Marina
// Garage starts the next job. Markers are glowing light pillars in the world.
window.PC = window.PC || {};

PC.Missions = {
  list: [
    {
      id: 'wheels', title: 'First Wheels', reward: 500, time: 150,
      steps: [
        { kind: 'goto', x: -196, z: 150, r: 7, text: 'Reach the marked car at the Marina Garage', car: true },
        { kind: 'deliver', x: 150, z: 238, r: 8, text: 'Deliver the package to the marina drop point', needCar: true },
      ],
      intro: 'Marisol: "New face, old city. Take the teal coupe outside my garage and drop a package at the pier. Easy money."',
      done: 'Marisol: "Clean run. The city notices people who deliver."',
    },
    {
      id: 'merch', title: 'Hot Merchandise', reward: 900, time: 0,
      steps: [
        { kind: 'goto', x: 77, z: -63, r: 7, text: 'Pick up the courier case across town' },
        { kind: 'deliver', x: 7, z: 7, r: 8, text: 'Deliver the case to the buyer downtown', heatOnPickup: 0 },
      ],
      intro: 'Marisol: "A courier case is sitting pretty across town. Grab it, bring it to my buyer downtown. It may be... warm."',
      done: 'Buyer: "Pleasure doing business. Tell Marisol the next one pays double."',
      pickupHeat: 2, pickupLine: 'The case is hot — Palm City PD is rolling!',
    },
    {
      id: 'getaway', title: 'The Getaway', reward: 1500, time: 0,
      steps: [
        { kind: 'goto', x: 150, z: 232, r: 7, text: 'Pick up Tico at the pier' },
        { kind: 'deliver', x: 196, z: 150, r: 9, text: 'Reach the Palms Hideout — only completes at 0 stars', needClean: true },
      ],
      intro: 'Marisol: "My brother Tico needs out, now. He is at the pier. Get him to the Palms Hideout — and lose the heat first."',
      done: 'Tico: "You drive like the city owes you. We are family now."',
      pickupHeat: 3, pickupLine: 'Tico: "That is a lot of sirens. Drive!"',
    },
  ],
  active: null,       // index into list while a mission runs
  step: 0,
  completed: 0,       // missions finished (persisted)
  timer: 0,
  marker: null, markerMat: null, ringMat: null,
  missionCar: null,

  init(scene) {
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 42, 12, 1, true);
    this.markerMat = new THREE.MeshBasicMaterial({
      color: 0xffd94d, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.marker = new THREE.Mesh(geo, this.markerMat);
    this.marker.position.y = 21; this.marker.visible = false;
    scene.add(this.marker);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.28, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.6;
    this.marker.add(ring); ring.position.y = -20.4;
    this.ringMat = ring.material;
  },
  giverPos() { return { x: PC.garagePos.x, z: 150 }; },
  currentStep() {
    if (this.active === null) return null;
    return this.list[this.active].steps[this.step];
  },
  canStart() { return this.active === null && this.completed < this.list.length; },
  storyDone() { return this.completed >= this.list.length; },

  start(scene, S) {
    if (!this.canStart()) return;
    this.active = this.completed;
    this.step = 0;
    const m = this.list[this.active];
    this.timer = m.time;
    // Mission 1 spawns its marked coupe by the garage.
    if (m.id === 'wheels') {
      this.missionCar = PC.spawnCar(scene, -186, 152, Math.PI / 2, 0x2fb3a6, 'sport', 'parked');
    }
    S.toast(m.intro, 7);
    PC.AudioSys.blip(520, 0.15, 0.12, 'triangle');
  },
  placeMarker(x, z) {
    this.marker.visible = true;
    this.marker.position.x = x; this.marker.position.z = z;
  },
  hideMarker() { this.marker.visible = false; },

  update(dt, scene, S) {
    const pulse = 0.3 + Math.sin(performance.now() * 0.004) * 0.1;
    if (this.markerMat) this.markerMat.opacity = pulse;
    if (this.active === null) {
      // Idle: the giver marker waits at the garage until the story is done.
      if (this.canStart()) { const g = this.giverPos(); this.placeMarker(g.x, g.z); }
      else this.hideMarker();
      return;
    }
    const m = this.list[this.active];
    const st = this.currentStep();
    this.placeMarker(st.x, st.z);
    if (m.time > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail(S, 'Out of time. Marisol shrugs: "Traffic, eh? Try again."'); return; }
    }
    const px = S.focusX, pz = S.focusZ;
    const d = PC.dist2d(px, pz, st.x, st.z);
    S.objectiveDist = Math.round(d);
    // Mission 1's first step completes by getting into the marked coupe.
    if (st.car) {
      if (S.mode === 'drive' && S.car === this.missionCar) {
        PC.AudioSys.pickup();
        S.toast('Marisol: "Good. Now deliver — pier, south shore."', 3.5);
        this.step++;
      } else if (S.mode === 'foot' && d < 12) {
        if (!S.carHintT || performance.now() - S.carHintT > 5000) {
          S.carHintT = performance.now();
          S.toast('Marisol: "That teal coupe by the garage. E to get in — then drive."', 3.5);
        }
      }
      return;
    }
    if (d > st.r) return;
    // --- Arrived at the step target ---
    if (st.kind === 'goto') {
      if (m.pickupHeat) {
        PC.Police.setWanted(m.pickupHeat, S);
        S.toast(m.pickupLine, 5); PC.AudioSys.alarm();
      } else if (this.step === 0 && m.id === 'getaway') {
        PC.Police.setWanted(m.pickupHeat, S);
        S.toast(m.pickupLine, 5); PC.AudioSys.alarm();
      } else {
        PC.AudioSys.pickup();
        S.toast(m.id === 'merch' ? 'Case secured. Move!' : 'Package on board. Move!', 3.5);
      }
      this.step++;
      return;
    }
    if (st.kind === 'deliver') {
      if (st.needCar && S.mode !== 'drive') { S.toast('You need to arrive in the car.', 2.5); return; }
      if (st.needClean && PC.Police.wanted > 0) {
        if (!S.cleanHintT || performance.now() - S.cleanHintT > 6000) {
          S.cleanHintT = performance.now();
          S.toast('Tico: "Not with the heat on us! Lose the stars first."', 4);
        }
        return;
      }
      this.complete(S);
    }
  },
  complete(S) {
    const m = this.list[this.active];
    S.earn(m.reward);
    S.toast(m.done, 6);
    S.banner('MISSION COMPLETE', m.title + '  •  +$' + m.reward, 3.4);
    PC.AudioSys.jingle();
    if (this.missionCar && this.missionCar.driver === 'parked') { /* stays in the world as a free car */ }
    this.missionCar = null;
    this.active = null; this.step = 0; this.completed++;
    S.save();
    if (this.storyDone()) {
      setTimeout(() => S.banner('STORY COMPLETE', 'Palm City is yours to roam.', 4), 3600);
    }
  },
  fail(S, why) {
    S.toast(why, 5);
    S.banner('MISSION FAILED', 'Head back to the M marker to retry.', 3);
    PC.AudioSys.alarm();
    if (this.missionCar && this.missionCar.driver === 'parked') {
      const i = PC.cars.indexOf(this.missionCar);
      if (i >= 0) { S.sceneRef.remove(this.missionCar.mesh); PC.cars.splice(i, 1); }
    }
    this.missionCar = null;
    this.active = null; this.step = 0;
  },
};
