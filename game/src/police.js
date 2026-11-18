// Wanted system and Palm City PD: heat from crimes, police spawns at the city
// edges, pursuit steering, line-of-sight decay, the bust meter and WASTED checks.
window.PC = window.PC || {};

PC.Police = {
  wanted: 0,            // 0..5 stars
  heat: 0,              // fractional heat; each whole point is a star
  hiddenT: 0,           // time since any police unit last saw the player
  bust: 0,              // 0..1 bust meter while on foot
  units: [],            // police car objects (also in PC.cars)
  flashT: 0,

  addHeat(amount, S) {
    this.heat = PC.clamp(this.heat + amount, 0, 5.99);
    const w = Math.floor(this.heat);
    if (w > this.wanted) { this.wanted = w; if (S.onWantedUp) S.onWantedUp(w); }
  },
  setWanted(stars, S) {
    this.heat = Math.max(this.heat, stars + 0.05);
    if (stars > this.wanted) { this.wanted = stars; if (S.onWantedUp) S.onWantedUp(stars); }
  },
  clear() { this.wanted = 0; this.heat = 0; this.hiddenT = 0; this.bust = 0; },

  desiredUnits() { return this.wanted === 0 ? 0 : 1 + this.wanted; }, // 2..6 cars

  spawnUnit(scene, S) {
    // Spawn at a city-edge road end, away from the player's view if possible.
    const edges = [[-252, 0], [252, 0], [0, -252], [0, 252], [-252, -140], [252, 140], [-140, -252], [140, 252]];
    let best = edges[0], bd = -1;
    for (const e of edges) {
      const d = PC.dist2d(e[0], e[1], S.focusX, S.focusZ);
      if (d > bd) { bd = d; best = e; }
    }
    const car = PC.spawnCar(scene, best[0], best[1], 0, 0xf4f6f8, 'police', 'police');
    car.targetSpeed = 30; car.speed = 8;
    this.units.push(car);
    return car;
  },
  despawnUnit(scene, car) {
    scene.remove(car.mesh);
    PC.cars.splice(PC.cars.indexOf(car), 1);
    this.units.splice(this.units.indexOf(car), 1);
  },

  update(dt, scene, S) {
    this.flashT += dt;
    // Keep the fleet sized to the wanted level.
    const want = this.desiredUnits();
    if (this.units.length < want) this.spawnUnit(scene, S);
    if (this.units.length > want) {
      // Remove the farthest unit first.
      let far = null, fd = -1;
      for (const u of this.units) { const d = PC.dist2d(u.x, u.z, S.focusX, S.focusZ); if (d > fd) { fd = d; far = u; } }
      if (far && (fd > 60 || this.wanted === 0)) this.despawnUnit(scene, far);
    }
    const px = S.focusX, pz = S.focusZ;
    const pSpeed = S.mode === 'drive' && S.car ? Math.abs(S.car.speed) : PC.Player.speedNow;
    let anySee = false, nearest = null, nd = 1e9;
    for (const u of this.units) {
      const d = PC.dist2d(u.x, u.z, px, pz);
      if (d < nd) { nd = d; nearest = u; }
      const sees = d < 95 && !PC.lineBlocked(u.x, u.z, px, pz);
      if (sees) anySee = true;
      // Pursuit steering: aim at an intercept point ahead of the player.
      const lead = sees ? PC.clamp(d / 22, 0, 1.4) : 0;
      const pvx = S.mode === 'drive' && S.car ? Math.sin(S.car.heading) * S.car.speed : 0;
      const pvz = S.mode === 'drive' && S.car ? Math.cos(S.car.heading) * S.car.speed : 0;
      const tx = px + pvx * lead * 0.6, tz = pz + pvz * lead * 0.6;
      const desired = Math.atan2(tx - u.x, tz - u.z);
      let dh = desired - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const topSpeed = 21 + this.wanted * 2.6;
      const target = d > 7 ? topSpeed : topSpeed * 0.35;
      u.speed += PC.clamp(target - u.speed, -26 * dt, 11 * dt);
      u.heading += PC.clamp(dh, -1.7 * dt * (30 / Math.max(10, Math.abs(u.speed))), 1.7 * dt * (30 / Math.max(10, Math.abs(u.speed))));
      let nx = u.x + Math.sin(u.heading) * u.speed * dt;
      let nz = u.z + Math.cos(u.heading) * u.speed * dt;
      if (PC.insideBuilding(nx, nz, 1.3)) {
        const fixed = PC.resolveCollisions(nx, nz, 1.9);
        nx = fixed[0]; nz = fixed[1]; u.speed *= 0.4;
      }
      u.x = PC.clamp(nx, -254, 254); u.z = PC.clamp(nz, -254, 254);
      // Bump the player's car: shove + a little damage at speed.
      if (S.mode === 'drive' && S.car && PC.dist2d(u.x, u.z, S.car.x, S.car.z) < 3.6) {
        if (Math.abs(u.speed) > 6 && S.onPoliceBump) S.onPoliceBump(u);
        u.speed *= 0.55;
      }
      PC.placeCarMesh(u);
      // Flashing light bar: alternate red/blue emissive boxes.
      if (u.mesh.userData.lightRed) {
        const ph = Math.floor(this.flashT * 5) % 2 === 0;
        u.mesh.userData.lightRed.material.color.setHex(ph ? 0xff2a2a : 0x571010);
        u.mesh.userData.lightBlue.material.color.setHex(ph ? 0x102a57 : 0x2a6bff);
      }
      // A unit stuck against geometry for a while teleports to a road nearby.
      if (Math.abs(u.speed) < 1.2 && d > 26) {
        u.stuckT = (u.stuckT || 0) + dt;
        if (u.stuckT > 3.5) {
          u.stuckT = 0;
          u.x = PC.nearestRoad(px + PC.rand(-60, 60)); u.z = PC.nearestRoad(pz + PC.rand(-60, 60));
          if (PC.insideBuilding(u.x, u.z, 2)) { u.x = PC.nearestRoad(px); u.z = pz; }
        }
      } else u.stuckT = 0;
    }
    // Heat decay: hidden from every unit, stars bleed off one at a time.
    if (this.wanted > 0) {
      if (anySee) this.hiddenT = 0; else this.hiddenT += dt;
      if (this.hiddenT > 7) {
        this.hiddenT = 0;
        this.heat = Math.max(0, Math.floor(this.heat) - 1 + 0.02);
        this.wanted = Math.floor(this.heat);
        if (S.onWantedDown) S.onWantedDown(this.wanted);
      }
    } else this.hiddenT = 0;
    // Bust meter: on foot, close police + slow player = trouble.
    if (S.mode === 'foot' && this.wanted > 0 && nearest && nd < 9 && pSpeed < 3.2) {
      this.bust += dt / 2.4;
      if (this.bust >= 1 && S.onBusted) { S.onBusted(); this.bust = 0; }
    } else this.bust = Math.max(0, this.bust - dt * 0.8);
    S.nearestPoliceDist = this.units.length ? nd : null;
    S.policeSeePlayer = anySee;
  },
};
