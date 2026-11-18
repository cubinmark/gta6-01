// Driving: arcade car physics for the player's car, crash resolution against
// buildings / other cars / props, and the chase camera.
window.PC = window.PC || {};

PC.Driving = {
  // Advance the player's car one step. S carries callbacks for crimes/damage.
  update(dt, car, keys, S) {
    const accel = 26, maxF = 34, maxR = -12;
    if (keys['KeyW']) car.speed += accel * dt * (car.speed < 0 ? 2.2 : 1);
    else if (keys['KeyS']) car.speed -= (car.speed > 0.5 ? 34 : accel * 0.7) * dt;
    else car.speed -= car.speed * 0.55 * dt;                 // rolling drag
    if (car.cruise && !keys['KeyW'] && !keys['KeyS'])        // posed cars hold speed
      car.speed += PC.clamp(car.cruise - car.speed, -8 * dt, 8 * dt);
    if (keys['Space']) car.speed -= car.speed * 2.6 * dt;    // handbrake
    car.speed = PC.clamp(car.speed, maxR, maxF);
    if (!keys['KeyW'] && !keys['KeyS'] && Math.abs(car.speed) < 0.25) car.speed = 0;
    const steerIn = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
    const grip = PC.clamp(Math.abs(car.speed) / 9, 0, 1);
    car.heading += steerIn * grip * dt * 1.9 * (car.speed < 0 ? -1 : 1) * (keys['Space'] ? 1.5 : 1);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let nx = car.x + fx * car.speed * dt, nz = car.z + fz * car.speed * dt;
    // Building collision: if the new spot is inside a footprint, kill the
    // speed into the wall, take damage on hard hits, and slide out.
    const hit = PC.insideBuilding(nx, nz, 1.4);
    if (hit) {
      const impact = Math.abs(car.speed);
      if (impact > 8 && S.onCrash) S.onCrash(impact, nx, nz);
      const fixed = PC.resolveCollisions(nx, nz, 1.9);
      nx = fixed[0]; nz = fixed[1];
      car.speed *= impact > 4 ? -0.18 : 0;
    }
    car.x = PC.clamp(nx, -PC.WORLD_EDGE, PC.WORLD_EDGE);
    car.z = PC.clamp(nz, -PC.WORLD_EDGE, PC.WORLD_EDGE);
    // Props: palms and lamps tip over when clipped.
    if (Math.abs(car.speed) > 3) {
      const p = PC.knockProp(car.x, car.z, 1.6);
      if (p && S.onPropertyHit) S.onPropertyHit(p);
    }
    // Car-to-car bumps.
    for (const o of PC.cars) {
      if (o === car || o.dead) continue;
      const d = PC.dist2d(car.x, car.z, o.x, o.z);
      if (d < 3.4) {
        const impact = Math.abs(car.speed) + Math.abs(o.speed || 0);
        const push = (3.4 - d) / 2;
        const ux = (o.x - car.x) / (d || 1), uz = (o.z - car.z) / (d || 1);
        if (o.driver !== 'parked') { o.x += ux * push; o.z += uz * push; }
        car.x -= ux * push * 0.6; car.z -= uz * push * 0.6;
        if (impact > 7) {
          if (o.driver === 'traffic') { o.speed = Math.max(0, (o.speed || 0) * 0.3); }
          if (S.onCarHit) S.onCarHit(o, impact);
          car.speed *= 0.45;
        }
      }
    }
    PC.placeCarMesh(car);
    S.focusX = car.x; S.focusZ = car.z;
  },
  speedKmh(car) { return Math.round(Math.abs(car.speed) * 3.6); },
};

// Shared third-person camera: orbits behind the focus point, eased.
// cam = {yaw, pitch, dist}; mouse or Q/E change yaw, wheel changes dist.
PC.updateCamera = function (camera, cam, tx, ty, tz, dt, snap) {
  const cx = tx - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cz = tz - Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cy = ty + Math.sin(cam.pitch) * cam.dist + 1.2;
  const k = snap ? 1 : 1 - Math.pow(0.0001, dt);
  camera.position.x += (cx - camera.position.x) * k;
  camera.position.z += (cz - camera.position.z) * k;
  camera.position.y += (Math.max(cy, 2.2) - camera.position.y) * k;
  camera.lookAt(tx, ty + 1.6, tz);
};
