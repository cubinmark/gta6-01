// Cars: a low-poly box-built car factory plus the traffic system that drives
// unoccupied cars around the road grid on right-hand lanes.
window.PC = window.PC || {};

PC.CAR_COLORS = [0xe84f4f, 0x4f8fe8, 0xf2c14e, 0x62c370, 0xe88fc0, 0xf0f0ea, 0x8a8f98, 0x7a5fd0, 0x2fb3a6, 0xe87e3a];
PC.cars = [];   // every car: {mesh,x,z,heading,speed,health,driver:'traffic'|'player'|'parked'|'police',...}

const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10);
const bodyGeo = new THREE.BoxGeometry(2.1, 0.75, 4.4);
const cabinGeo = new THREE.BoxGeometry(1.8, 0.7, 2.2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x2c4a5a });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4040 });

// Build one car mesh. kind: 'civil' | 'police' | 'sport'. Returns a Group whose
// forward is -Z... we keep forward as +Z rotated by heading; see PC.carForward.
PC.makeCarMesh = function (color, kind) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, paint); body.position.y = 0.72; g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, kind === 'police' ? paint : glassMat);
  cabin.position.set(0, 1.42, -0.25); g.add(cabin);
  if (kind === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.3, 4.44),
      new THREE.MeshLambertMaterial({ color: 0x2fb3a6 }));
    stripe.position.y = 0.62; g.add(stripe);
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    base.position.y = 1.86; bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(-0.38, 2.02, 0); bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.set(0.38, 2.02, 0); bar.add(blue);
    g.add(bar); g.userData.lightBar = bar; g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  if (kind === 'sport') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), paint);
    wing.position.set(0, 1.25, 2.0); g.add(wing);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.1), lightMat);
  hl.position.set(0, 0.78, -2.21); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.1), tailMat);
  tl.position.set(0, 0.78, 2.21); g.add(tl);
  const wheels = [];
  for (const [wx, wz] of [[-1.0, -1.45], [1.0, -1.45], [-1.0, 1.45], [1.0, 1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.55, wz); g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
};
// Heading convention: forward vector = (sin h, cos h) in xz; mesh faces -Z at h=0
// after rotation.y = h + PI, handled here so callers just set position/rotation.
PC.placeCarMesh = function (car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading + Math.PI;
  const spin = car.speed * 0.12;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
};

PC.spawnCar = function (scene, x, z, heading, color, kind, driver) {
  const mesh = PC.makeCarMesh(color, kind || 'civil');
  scene.add(mesh);
  const car = {
    mesh, x, z, heading, speed: 0, health: 100, driver: driver || 'parked',
    color, kind: kind || 'civil', smokeT: 0, dead: false,
    axis: null, dir: 1, lane: 0, targetSpeed: 11, waitT: 0,
  };
  PC.placeCarMesh(car);
  PC.cars.push(car);
  return car;
};

// --- Traffic -------------------------------------------------------------
// A traffic car state: it travels along one road centreline (axis 'x' means it
// moves in x at fixed z = lane line). Right-hand traffic: lane offset +3.6 in
// the direction's right side.
function laneCoord(car) { return car.axis === 'x' ? car.z : car.x; }
function setLaneFromRoad(car, roadCoord) {
  // roadCoord is the centreline of the road it now travels along.
  if (car.axis === 'x') car.z = roadCoord + (car.dir > 0 ? 3.6 : -3.6);
  else car.x = roadCoord + (car.dir > 0 ? -3.6 : 3.6);
}
PC.initTrafficCar = function (car) {
  car.axis = PC.rng() < 0.5 ? 'x' : 'z';
  car.dir = PC.rng() < 0.5 ? 1 : -1;
  const road = PC.pick(PC.ROADS);
  if (car.axis === 'x') { car.z = road; car.x = PC.rand(-240, 240); }
  else { car.x = road; car.z = PC.rand(-240, 240); }
  setLaneFromRoad(car, road);
  car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (car.dir > 0 ? 0 : Math.PI);
  car.targetSpeed = PC.rand(9, 14);
  car.speed = car.targetSpeed;
};
PC.setupTraffic = function (scene, count) {
  for (let i = 0; i < count; i++) {
    const car = PC.spawnCar(scene, 0, 0, 0, PC.pick(PC.CAR_COLORS), 'civil', 'traffic');
    PC.initTrafficCar(car);
    PC.placeCarMesh(car);
  }
  // Parked cars hugging the kerbs: [x, z, heading] chosen on real road lines.
  const parkSpots = [
    [-40, -134.2, Math.PI / 2], [30, -145.8, Math.PI / 2], [75.8, -40, 0], [-75.8, 30, 0],
    [110, 145.8, Math.PI / 2], [-145.8, -100, 0], [145.8, 90, 0], [-30, 64.2, Math.PI / 2],
  ];
  for (const [px, pz, ph] of parkSpots) {
    PC.spawnCar(scene, px, pz, ph, PC.pick(PC.CAR_COLORS), 'civil', 'parked');
  }
};
// Something solid right ahead of a traffic car? (player, player car, other car)
function blockedAhead(car, S) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const check = (ox, oz, r) => {
    const dx = ox - car.x, dz = oz - car.z;
    const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    return ahead > 0 && ahead < r && side < 2.2;
  };
  if (S.mode === 'foot' && check(PC.Player.x, PC.Player.z, 7)) return true;
  if (S.mode === 'drive' && S.car && check(S.car.x, S.car.z, 9)) return true;
  for (const o of PC.cars) {
    if (o === car || o.dead) continue;
    if ((o.driver === 'traffic' || o.driver === 'parked') && check(o.x, o.z, 8)) return true;
  }
  return false;
}
PC.updateTraffic = function (dt, S) {
  for (const car of PC.cars) {
    if (car.driver !== 'traffic' || car.dead) continue;
    // Despawn far traffic and respawn it near the action to keep streets alive.
    if (PC.dist2d(car.x, car.z, S.focusX, S.focusZ) > 330) { PC.initTrafficCar(car); PC.placeCarMesh(car); continue; }
    const want = blockedAhead(car, S) ? 0 : car.targetSpeed;
    car.speed += PC.clamp(want - car.speed, -22 * dt, 7 * dt);
    const step = car.speed * dt;
    if (car.axis === 'x') car.x += car.dir * step; else car.z += car.dir * step;
    // At an intersection, sometimes turn onto the crossing road: snap to the
    // junction, pick a new axis/direction, and join that road's right lane.
    const along = car.axis === 'x' ? car.x : car.z;
    const cross = PC.nearestRoad(along);
    const atJunction = Math.abs(along - cross) < Math.max(1.4, step);
    const onRoad = car.axis === 'x'
      ? Math.abs(car.z - PC.nearestRoad(car.z)) < 8
      : Math.abs(car.x - PC.nearestRoad(car.x)) < 8;
    if (atJunction && onRoad && car.speed > 1 && PC.rng() < 0.5 * dt + 0.004) {
      if (car.axis === 'x') {
        car.axis = 'z'; car.x = cross;
        car.dir = PC.rng() < 0.5 ? 1 : -1;
        car.x = cross + (car.dir > 0 ? -3.6 : 3.6);
      } else {
        car.axis = 'x'; car.z = cross;
        car.dir = PC.rng() < 0.5 ? 1 : -1;
        car.z = cross + (car.dir > 0 ? 3.6 : -3.6);
      }
      car.speed = Math.min(car.speed, 6);
    }
    if (car.axis === 'x') car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    else car.heading = car.dir > 0 ? 0 : Math.PI;
    if (Math.abs(car.x) > 250 || Math.abs(car.z) > 250) PC.initTrafficCar(car);
    PC.placeCarMesh(car);
  }
};
