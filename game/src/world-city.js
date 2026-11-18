// Palm City: street grid, pastel buildings, palms, lights and the waterfront.
// Everything static is generated here once; dynamic systems read the shared
// PC namespace (colliders, road lines, spawn points) that this file fills in.
window.PC = window.PC || {};

PC.PITCH = 70;            // distance between neighbouring road centrelines
PC.ROAD_HALF = 7;         // half the road width
PC.ROADS = [-210, -140, -70, 0, 70, 140, 210];
PC.WORLD_EDGE = 252;      // playable half-extent before the sea / fences
PC.colliders = [];        // building AABBs {x0,x1,z0,z1,h}
PC.props = [];            // knockable props {mesh,x,z,down}
PC.stationPos = { x: -210, z: -238 };   // police station corner (SW waterfront road end)
PC.clinicPos = { x: 210, z: -238 };     // clinic corner (SE)
PC.garagePos = { x: -196, z: 196 };     // Marisol's Marina Garage (NW block corner)
PC.hideoutPos = { x: 196, z: 196 };     // Palms Hideout (NE)

// Deterministic RNG so screenshot poses and city layout are reproducible.
PC.makeRng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
PC.rng = PC.makeRng(20261118);
PC.rand = function (lo, hi) { return lo + PC.rng() * (hi - lo); };
PC.pick = function (arr) { return arr[Math.floor(PC.rng() * arr.length)]; };
PC.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
PC.dist2d = function (ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };

// Is a point inside any building footprint (optionally padded)?
PC.insideBuilding = function (x, z, pad) {
  pad = pad || 0;
  for (let i = 0; i < PC.colliders.length; i++) {
    const c = PC.colliders[i];
    if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return c;
  }
  return null;
};
// Push a circle (x,z,r) out of every building AABB; returns corrected [x,z].
PC.resolveCollisions = function (x, z, r) {
  for (let i = 0; i < PC.colliders.length; i++) {
    const c = PC.colliders[i];
    const nx = PC.clamp(x, c.x0, c.x1), nz = PC.clamp(z, c.z0, c.z1);
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) { const d = Math.sqrt(d2); x = nx + (dx / d) * r; z = nz + (dz / d) * r; }
      else { // centre inside the box: push out along the smallest penetration
        const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.x0 - r; else if (m === pr) x = c.x1 + r;
        else if (m === pt) z = c.z0 - r; else z = c.z1 + r;
      }
    }
  }
  x = PC.clamp(x, -PC.WORLD_EDGE, PC.WORLD_EDGE);
  z = PC.clamp(z, -PC.WORLD_EDGE, PC.WORLD_EDGE);
  return [x, z];
};
// Line-of-sight approximation: blocked if the segment passes through a block cell
// that holds a tall building. Sampled cheaply; good enough for heat decay.
PC.lineBlocked = function (ax, az, bx, bz) {
  const steps = 14;
  for (let i = 2; i < steps - 1; i++) {
    const t = i / steps;
    if (PC.insideBuilding(ax + (bx - ax) * t, az + (bz - az) * t, -1)) return true;
  }
  return false;
};
PC.nearestRoad = function (v) {
  let best = PC.ROADS[0], bd = 1e9;
  for (const r of PC.ROADS) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// Asphalt with a dashed centre line, drawn once and tiled along each road.
function roadTexture() {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#3d4148'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) { g.fillStyle = PC.rng() > .5 ? '#454a52' : '#363a41'; g.fillRect(PC.rng() * 128, PC.rng() * 128, 2, 2); }
    g.fillStyle = '#e8e4c8'; g.fillRect(6, 61, 44, 6); g.fillRect(78, 61, 44, 6);
    g.fillStyle = '#f5f2e2'; g.fillRect(0, 2, 128, 3); g.fillRect(0, 123, 128, 3);
  });
}
function sidewalkTexture() {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = '#b9b3a4'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#9d9789'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
    g.fillStyle = '#c4beb0'; g.fillRect(4, 4, 26, 26);
  });
}
// One window-grid texture per tint family; lit windows glow at dusk palette.
function buildingTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 5, rows = 10, cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = PC.rng() < 0.42;
      g.fillStyle = on ? lit : '#2c3e46';
      g.fillRect(x * cw + 4, y * ch + 5, cw - 8, ch - 10);
      if (on && PC.rng() < .4) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x * cw + 4, y * ch + 5, cw - 8, 4); }
    }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - 10, w, 10);
  });
}

PC.buildCity = function (scene) {
  const rng = PC.rng;
  scene.background = new THREE.Color(0x87c5d6);
  scene.fog = new THREE.Fog(0xf2c99a, 260, 720);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.05);
  sun.position.set(-180, 260, 120); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ef, 0x8a6f4d, 0.75));
  const warm = new THREE.AmbientLight(0xffd9a8, 0.22); scene.add(warm);

  const MAT = {
    ground: new THREE.MeshLambertMaterial({ color: 0x77a75e }),
    sand: new THREE.MeshLambertMaterial({ color: 0xe8d193 }),
    sea: new THREE.MeshLambertMaterial({ color: 0x2e9db4 }),
    road: new THREE.MeshLambertMaterial({ map: roadTexture() }),
    walk: new THREE.MeshLambertMaterial({ map: sidewalkTexture() }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
    frond: new THREE.MeshLambertMaterial({ color: 0x3f9e4d }),
    pole: new THREE.MeshLambertMaterial({ color: 0x39424a }),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    white: new THREE.MeshLambertMaterial({ color: 0xf4f1e6 }),
    neonPink: new THREE.MeshBasicMaterial({ color: 0xff5da2 }),
    neonTeal: new THREE.MeshBasicMaterial({ color: 0x3ae0d0 }),
    gold: new THREE.MeshBasicMaterial({ color: 0xffd94d }),
  };
  PC.MAT = MAT;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), MAT.ground);
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  // Waterfront: sand strip then teal sea along the south edge (z+).
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(900, 60), MAT.sand);
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, 282); scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), MAT.sea);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, 560); scene.add(sea);
  PC.seaMesh = sea;
  // Boardwalk pier near the marina (east side of the south shore).
  const pier = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 44), new THREE.MeshLambertMaterial({ color: 0xa9835a }));
  pier.position.set(150, 0.5, 268); scene.add(pier);

  // Roads: long thin planes with the rotation baked into the geometry (a
  // mesh-level rotation.z on a ground plane flips its face away from the sky).
  const roadGeoX = new THREE.PlaneGeometry(518, PC.ROAD_HALF * 2);
  roadGeoX.rotateX(-Math.PI / 2);
  const roadGeoZ = new THREE.PlaneGeometry(518, PC.ROAD_HALF * 2);
  roadGeoZ.rotateX(-Math.PI / 2); roadGeoZ.rotateY(Math.PI / 2);
  for (const rz of PC.ROADS) {
    const t = MAT.road.map.clone(); t.needsUpdate = true; t.repeat.set(36, 1);
    const m = new THREE.Mesh(roadGeoX, new THREE.MeshLambertMaterial({ map: t }));
    m.position.set(0, 0.03, rz); scene.add(m);
  }
  for (const rx of PC.ROADS) {
    const t = MAT.road.map.clone(); t.needsUpdate = true; t.repeat.set(36, 1);
    const m = new THREE.Mesh(roadGeoZ, new THREE.MeshLambertMaterial({ map: t }));
    m.position.set(rx, 0.03, 0); scene.add(m);
  }

  // Blocks: sidewalk slab + buildings + palms + lamps.
  const pastels = ['#f2b8a0', '#f7d08a', '#a8d8b9', '#9fc6e8', '#e8a8c8', '#f4ead2', '#b5a8e0', '#8fd0c8'];
  const litCols = ['#ffd97a', '#ffe9b0', '#ffc46b'];
  const texCache = pastels.map((p, i) => buildingTexture(p, litCols[i % litCols.length]));
  const blockCenters = [-175, -105, -35, 35, 105, 175];
  const slabGeo = new THREE.BoxGeometry(54, 0.5, 54);
  const lampGeo = new THREE.CylinderGeometry(0.18, 0.24, 5.4, 5);
  const lampHeadGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 5.6, 6);
  const frondGeo = new THREE.BoxGeometry(3.6, 0.16, 0.85);

  function addPalm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, MAT.trunk);
    trunk.position.y = 2.8; trunk.rotation.z = PC.rand(-0.08, 0.08); g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const pivot = new THREE.Group();
      pivot.position.y = 5.7; pivot.rotation.y = (i / 6) * Math.PI * 2 + PC.rand(-0.3, 0.3);
      const f = new THREE.Mesh(frondGeo, MAT.frond);
      f.position.x = 1.7; f.rotation.z = -0.48;
      pivot.add(f); g.add(pivot);
    }
    g.position.set(x, 0, z); scene.add(g);
    PC.props.push({ mesh: g, x, z, down: false, kind: 'palm' });
  }
  function addLamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(lampGeo, MAT.pole); pole.position.y = 2.7; g.add(pole);
    const head = new THREE.Mesh(lampHeadGeo, MAT.lampGlow); head.position.y = 5.5; g.add(head);
    g.position.set(x, 0, z); scene.add(g);
    PC.props.push({ mesh: g, x, z, down: false, kind: 'lamp' });
  }

  for (const bx of blockCenters) for (const bz of blockCenters) {
    const slab = new THREE.Mesh(slabGeo, MAT.walk);
    slab.position.set(bx, 0.25, bz); scene.add(slab);
    // Skip buildings on the special corners: garage (NW), hideout (NE), station (SW), clinic (SE).
    const special = (bx === -175 && bz === 175) || (bx === 175 && bz === 175) ||
      (bx === -175 && bz === -175) || (bx === 175 && bz === -175);
    if (!special) {
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const w = PC.rand(13, 22), d = PC.rand(13, 22), h = PC.rand(12, 46);
        const ox = n === 1 ? 0 : PC.rand(-15, 15), oz = n === 1 ? 0 : PC.rand(-15, 15);
        const x = bx + ox, z = bz + oz;
        if (PC.insideBuilding(x, z, 12)) continue;
        const mat = new THREE.MeshLambertMaterial({ map: texCache[Math.floor(rng() * texCache.length)] });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2 + 0.4, z); scene.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1, d + 1), MAT.pole);
        roof.position.set(x, h + 0.9, z); scene.add(roof);
        PC.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
      }
    }
    // Palms + lamps around each block's corners.
    for (const sx of [-24, 24]) for (const sz of [-24, 24]) {
      if (rng() < 0.75) addPalm(bx + sx, bz + sz);
      if (rng() < 0.5) addLamp(bx + sx * 0.9, bz + sz * 0.9);
    }
  }

  // Landmark buildings: garage, hideout, station, clinic — low, wide, signed with neon.
  function landmark(x, z, color, signMat, label) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 30),
      new THREE.MeshLambertMaterial({ color }));
    b.position.set(x, 5.4, z); scene.add(b);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(20, 2.4, 0.6), signMat);
    sign.position.set(x, 11.6, z); scene.add(sign);
    PC.colliders.push({ x0: x - 17, x1: x + 17, z0: z - 15, z1: z + 15, h: 10 });
    return { x, z, label };
  }
  PC.landmarks = [
    landmark(-196, 175, 0xe8875a, MAT.neonPink, 'Marina Garage'),
    landmark(196, 175, 0x5aa8e8, MAT.neonTeal, 'Palms Hideout'),
    landmark(-196, -175, 0xdfe6ea, MAT.neonTeal, 'Palm City PD'),
    landmark(196, -175, 0xf4f1e6, MAT.neonPink, 'Palm Clinic'),
  ];
  // A few palms along the boardwalk.
  for (let x = -240; x <= 240; x += 30) if (rng() < 0.8) addPalm(x + PC.rand(-4, 4), 246);
  return MAT;
};

// Knock a prop over (cartoon tip) when a car clips it.
PC.knockProp = function (x, z, r) {
  for (const p of PC.props) {
    if (!p.down && PC.dist2d(x, z, p.x, p.z) < r + 0.8) {
      p.down = true;
      p.mesh.rotation.z = 1.35; p.mesh.position.y = 0.4;
      return p;
    }
  }
  return null;
};
