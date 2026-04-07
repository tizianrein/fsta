import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_AXES = [
  ['Material Authenticity', 0.45],
  ['Structural Performance', 0.8],
  ['Economic Viability', 0.6],
  ['Cultural Continuity and Craft', 0.45],
  ['Ecological Sustainability', 0.5],
  ['Aesthetic Intervention', 0.35],
];

const state = {
  objectName: '',
  assembly: { objectName: '', parts: [{ id: 'cube', status: 'defective', origin: { x: 0, y: 0.25, z: 0 }, dimensions: { width: 0.5, height: 0.5, depth: 0.5 }, connections: [] }] },
  damages: [{ id: 'damage_01', type: 'Scratch', description: 'Default scratch on the top surface.', part_id: 'cube', coordinates: { x: 0, y: 0.5, z: 0 } }],
  plan: { steps: [] },
  planVersions: [],
  currentPlanVersionId: null,
  currentStepId: null,
  guidanceActive: false,
  photos: [],
  intent: {
    axes: DEFAULT_AXES.map(([label, value], i) => ({ id: `axis_${i+1}`, label, value })),
    summary: 'Balanced repair with moderate emphasis on structural performance and reasonable reversibility.',
  },
  constraints: {
    tools_available: '',
    materials_available: '',
    time_budget_minutes: 60,
    budget_limit: '',
    skill_level: 'intermediate',
    safety_level: 'normal',
    allowed_operations: '',
    avoid_operations: '',
    additional_constraints: '',
  },
  ui: { exploded: false, graphZoom: 1 },
};

const el = {};
let scene, camera, renderer, controls, axesScene, axesCamera, raycaster, mouse;
const objectGroup = new THREE.Group();
const partMeshesMap = new Map();
const damageSpheres = [];
let activeAnimations = [];
const ANIMATION_DURATION = 800;
let draggingRadar = false;

const materials = {
  intact: new THREE.MeshBasicMaterial({ color: 0xd0d0d0, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.FrontSide }),
  defective: new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.FrontSide }),
  missing: new THREE.MeshBasicMaterial({ color: 0xffde59, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.FrontSide }),
  newPart: new THREE.MeshBasicMaterial({ color: 0xc000ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.FrontSide }),
  discarded: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.FrontSide }),
  selected: new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.FrontSide }),
  outline: new THREE.LineBasicMaterial({ color: 0x000000 }),
  damage: new THREE.MeshBasicMaterial({ color: 0xc1121f, depthWrite: false }),
};

function qs(id) { return document.getElementById(id); }

function initDom() {
  [
    'object-name','viewer-canvas','viewer-container','info-box','step-overlay','step-overlay-title','step-overlay-body','step-overlay-meta',
    'axis-list','radar-canvas','intent-summary','tools-available','materials-available','time-budget','budget-limit','skill-level',
    'safety-level','allowed-ops','avoid-ops','additional-constraints','instruction-input','console-output','graph-container',
    'step-list','json-modal','json-textarea','assembly-file','damages-file','plan-file','photos-file',
    'intent-modal','constraints-modal','plan-section','action-map-container','spatial-graph-modal','spatial-graph-container','example-path-input','graph-zoom-in-btn','graph-zoom-out-btn','graph-zoom-reset-btn','action-node-modal','action-node-detail'
  ].forEach(id => el[id] = qs(id));

  qs('upload-assembly-btn').onclick = () => el['assembly-file'].click();
  qs('upload-damages-btn').onclick = () => el['damages-file'].click();
  qs('upload-plan-btn').onclick = () => el['plan-file'].click();
  qs('add-photos-btn').onclick = () => el['photos-file'].click();
  qs('open-json-btn').onclick = openJsonModal;
  qs('close-json-btn').onclick = () => el['json-modal'].style.display = 'none';
  qs('open-intent-btn').onclick = () => el['intent-modal'].style.display = 'flex';
  qs('close-intent-btn').onclick = () => { el['intent-modal'].style.display = 'none'; };
  qs('open-constraints-btn').onclick = () => el['constraints-modal'].style.display = 'flex';
  qs('close-constraints-btn').onclick = () => { el['constraints-modal'].style.display = 'none'; };
  qs('view-spatial-graph-btn').onclick = openSpatialGraphModal;
  qs('copy-json-btn').onclick = async () => navigator.clipboard.writeText(el['json-textarea'].value);
  qs('save-json-btn').onclick = saveJsonModal;
  qs('load-example-btn').onclick = loadExamplePath;
  qs('close-spatial-graph-btn').onclick = () => el['spatial-graph-modal'].style.display = 'none';
  qs('graph-zoom-in-btn').onclick = () => { state.ui.graphZoom = Math.min(2.5, (state.ui.graphZoom || 1) + 0.2); renderPlanGraph(); };
  qs('graph-zoom-out-btn').onclick = () => { state.ui.graphZoom = Math.max(0.6, (state.ui.graphZoom || 1) - 0.2); renderPlanGraph(); };
  qs('graph-zoom-reset-btn').onclick = () => { state.ui.graphZoom = 1; renderPlanGraph(); };
  qs('close-action-node-btn').onclick = () => el['action-node-modal'].style.display = 'none';
  qs('download-state-btn').onclick = downloadWorkspace;
  qs('download-state-btn').title = 'Download assembly, damages, intent, constraints, plan, and versions as one JSON file';
  qs('explode-btn').onclick = explodeView;
  qs('restore-btn').onclick = restoreView;
  qs('add-axis-btn').onclick = addAxis;
  qs('reset-intent-btn').onclick = resetIntent;
  qs('suggest-intent-btn').onclick = suggestIntent;
  qs('generate-assembly-btn').onclick = generateAssembly;
  qs('update-damages-btn').onclick = updateDamages;
  qs('update-assembly-btn').onclick = updateAssembly;
  qs('generate-plan-btn').onclick = generatePlan;
  qs('replan-btn').onclick = () => generatePlan(true);
  qs('start-guidance-btn').onclick = startGuidance;
  qs('save-version-btn').onclick = savePlanVersion;
  qs('add-damage-note-btn').onclick = addDamageFromNote;

  el['assembly-file'].addEventListener('change', (e) => loadJsonFile(e.target.files[0], 'assembly'));
  el['damages-file'].addEventListener('change', (e) => loadJsonFile(e.target.files[0], 'damages'));
  el['plan-file'].addEventListener('change', (e) => loadJsonFile(e.target.files[0], 'plan'));
  el['photos-file'].addEventListener('change', handlePhotoFiles);

  el['object-name'].addEventListener('input', () => state.objectName = el['object-name'].value.trim());
  el['intent-summary'].addEventListener('input', () => state.intent.summary = el['intent-summary'].value);

  const bindConstraint = (id, key, asNumber = false) => qs(id).addEventListener('input', () => state.constraints[key] = asNumber ? Number(qs(id).value || 0) : qs(id).value);
  bindConstraint('tools-available', 'tools_available');
  bindConstraint('materials-available', 'materials_available');
  bindConstraint('time-budget', 'time_budget_minutes', true);
  bindConstraint('budget-limit', 'budget_limit');
  bindConstraint('skill-level', 'skill_level');
  bindConstraint('safety-level', 'safety_level');
  bindConstraint('allowed-ops', 'allowed_operations');
  bindConstraint('avoid-ops', 'avoid_operations');
  bindConstraint('additional-constraints', 'additional_constraints');

  el['radar-canvas'].addEventListener('pointerdown', onRadarPointerDown);
  el['radar-canvas'].addEventListener('pointermove', onRadarPointerMove);
  window.addEventListener('pointerup', () => draggingRadar = false);
  window.addEventListener('resize', onResize);
}

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.add(objectGroup);

  const wrap = el['viewer-container'];
  camera = new THREE.PerspectiveCamera(18, wrap.clientWidth / wrap.clientHeight, 0.01, 1000);
  camera.position.set(1.5, 1.2, 1.5);

  renderer = new THREE.WebGLRenderer({ canvas: el['viewer-canvas'], antialias: true, alpha: true });
  renderer.autoClear = false;
  renderer.sortObjects = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(2, 3, 2);
  scene.add(dir);

  axesScene = new THREE.Scene();
  axesCamera = new THREE.OrthographicCamera(-2.5, 2.5, 2.5, -2.5, -10, 10);
  axesScene.add(new THREE.AxesHelper(1.5));

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('pointermove', onViewerPointerMove);
  renderer.domElement.addEventListener('click', onViewerClick);
}

function onResize() {
  const wrap = el['viewer-container'];
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderRadar();
}

function animate() {
  requestAnimationFrame(animate);
  if (activeAnimations.length) {
    const now = performance.now();
    activeAnimations.forEach(anim => {
      const progress = Math.min((now - anim.startTime) / ANIMATION_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      anim.mesh.position.lerpVectors(anim.start, anim.end, eased);
    });
    activeAnimations = activeAnimations.filter(anim => now - anim.startTime < ANIMATION_DURATION);
  }
  controls.update();
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.setViewport(10, 10, 80, 80);
  axesCamera.quaternion.copy(camera.quaternion);
  renderer.render(axesScene, axesCamera);
  renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
}

function log(message) {
  el['console-output'].textContent = message;
}

function currentWorkspaceJson() {
  return {
    objectName: state.objectName || state.assembly?.objectName || '',
    assembly: state.assembly,
    damages: state.damages,
    intent: state.intent,
    constraints: state.constraints,
    plan: state.plan,
    planVersions: state.planVersions,
    currentPlanVersionId: state.currentPlanVersionId,
    currentStepId: state.currentStepId,
  };
}

function openJsonModal() {
  el['json-textarea'].value = JSON.stringify(currentWorkspaceJson(), null, 2);
  el['json-modal'].style.display = 'flex';
}

function saveJsonModal() {
  try {
    const parsed = JSON.parse(el['json-textarea'].value);
    if (parsed.objectName !== undefined) state.objectName = parsed.objectName || '';
    if (parsed.assembly) state.assembly = parsed.assembly;
    if (parsed.damages) state.damages = parsed.damages;
    if (parsed.intent) state.intent = parsed.intent;
    if (parsed.constraints) state.constraints = parsed.constraints;
    if (parsed.plan) state.plan = parsed.plan;
    if (parsed.planVersions) state.planVersions = parsed.planVersions;
    if (parsed.currentPlanVersionId) state.currentPlanVersionId = parsed.currentPlanVersionId;
    if (parsed.currentStepId) state.currentStepId = parsed.currentStepId;
    el['object-name'].value = state.objectName || state.assembly?.objectName || '';
    syncIntentUi();
    createModel();
    frameObject();
    renderPlan();
    el['json-modal'].style.display = 'none';
    log('Workspace JSON saved.');
  } catch (err) {
    log(`JSON save failed: ${err.message}`);
  }
}

async function loadExamplePath() {
  const path = el['example-path-input'].value.trim();
  if (!path) return log('Enter an example path first.');
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = await res.json();
    el['json-textarea'].value = JSON.stringify(parsed, null, 2);
    log(`Example loaded from ${path}. Click Save to apply it.`);
  } catch (err) {
    log(`Example load failed: ${err.message}`);
  }
}

function openSpatialGraphModal() {
  renderSpatialGraph();
  el['spatial-graph-modal'].style.display = 'flex';
}


function downloadWorkspace() {
  const blob = new Blob([JSON.stringify(currentWorkspaceJson(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'repair-workspace.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadJsonFile(file, kind) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  if (kind === 'assembly') {
    state.assembly = data;
    state.objectName = data.objectName || state.objectName;
    el['object-name'].value = state.objectName;
    createModel();
    frameObject();
    log('Assembly loaded.');
  } else if (kind === 'damages') {
    state.damages = Array.isArray(data) ? data : data.damages || [];
    createDamages();
    log('Damages loaded.');
  } else if (kind === 'plan') {
    state.plan = data;
    hydratePlanVersion(data, 'Imported Plan');
    renderPlan();
    log('Plan loaded.');
  }
}

async function handlePhotoFiles(e) {
  const files = [...(e.target.files || [])];
  state.photos = await Promise.all(files.map(fileToInline));
  log(`${state.photos.length} file(s) prepared for multimodal analysis.`);
}

function fileToInline(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type || 'application/octet-stream', data: String(reader.result).split(',')[1] });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createModel() {
  while (objectGroup.children.length) objectGroup.remove(objectGroup.children[0]);
  partMeshesMap.clear();
  const parts = state.assembly?.parts || [];
  parts.forEach(part => {
    const dims = part.dimensions || {};
    const geo = new THREE.BoxGeometry(dims.width || dims.w || 0.1, dims.height || dims.h || 0.1, dims.depth || dims.d || 0.1);
    const material = materialForPart(part.status);
    const mesh = new THREE.Mesh(geo, material);
    const origin = part.origin || { x: 0, y: 0, z: 0 };
    mesh.position.set(origin.x || 0, origin.y || 0, origin.z || 0);
    mesh.userData.part = part;
    if (part.rotation) {
      mesh.rotation.set(part.rotation.x || 0, part.rotation.y || 0, part.rotation.z || 0, 'YXZ');
    }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), materials.outline);
    mesh.add(edges);
    objectGroup.add(mesh);
    partMeshesMap.set(part.id, mesh);
  });
  createDamages();
}

function materialForPart(status) {
  if (status === 'missing') return materials.missing;
  if (status === 'new') return materials.newPart;
  if (status === 'discarded') return materials.discarded;
  if (status === 'defective' || status === 'damaged' || status === 'repaired') return materials.defective;
  return materials.intact;
}

function createDamages() {
  damageSpheres.forEach(s => scene.remove(s));
  damageSpheres.length = 0;
  (state.damages || []).forEach(dmg => {
    const geo = new THREE.SphereGeometry(0.018, 18, 18);
    const sphere = new THREE.Mesh(geo, materials.damage);
    const p = dmg.coordinates || { x: 0, y: 0, z: 0 };
    sphere.position.set(p.x || 0, p.y || 0, p.z || 0);
    sphere.userData.damage = dmg;
    damageSpheres.push(sphere);
    scene.add(sphere);
  });
}

function frameObject() {
  const box = new THREE.Box3().setFromObject(objectGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const fov = camera.fov * (Math.PI / 180);
  let distance = maxDim / (2 * Math.tan(fov / 2));
  distance *= 1.9;
  const dir = new THREE.Vector3(1, 0.85, 1).normalize();
  camera.position.copy(dir.multiplyScalar(distance).add(center));
  controls.target.copy(center);
  controls.update();
}

function explodeView() {
  if (state.ui.exploded) return;
  state.ui.exploded = true;
  const box = new THREE.Box3().setFromObject(objectGroup);
  const center = box.getCenter(new THREE.Vector3());
  activeAnimations = [];
  partMeshesMap.forEach(mesh => {
    const direction = mesh.position.clone().sub(center);
    if (direction.length() < 0.001) direction.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5);
    direction.normalize();
    activeAnimations.push({ mesh, start: mesh.position.clone(), end: mesh.position.clone().add(direction.multiplyScalar(0.18)), startTime: performance.now() });
  });
}

function restoreView() {
  if (!state.ui.exploded) return;
  state.ui.exploded = false;
  activeAnimations = [];
  (state.assembly.parts || []).forEach(part => {
    const mesh = partMeshesMap.get(part.id);
    if (!mesh) return;
    const origin = part.origin || { x: 0, y: 0, z: 0 };
    activeAnimations.push({ mesh, start: mesh.position.clone(), end: new THREE.Vector3(origin.x || 0, origin.y || 0, origin.z || 0), startTime: performance.now() });
  });
}

function pickSceneItem(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const candidates = [...damageSpheres, ...objectGroup.children];
  const hits = raycaster.intersectObjects(candidates, true);
  for (const hit of hits) {
    let item = hit.object;
    while (item && !item.userData.part && !item.userData.damage && item.parent && item.parent !== scene) item = item.parent;
    if (item?.userData?.damage) return { type: 'damage', object: item.userData.damage };
    if (item?.userData?.part) return { type: 'part', object: item.userData.part };
  }
  return null;
}

function onViewerPointerMove(event) {
  const picked = pickSceneItem(event);
  const info = el['info-box'];
  if (!picked) { info.style.display = 'none'; return; }
  if (picked.type === 'part') {
    const p = picked.object;
    info.textContent = `${p.id} status: ${p.status || 'intact'}`;
  } else {
    const d = picked.object;
    info.textContent = `${d.id} ${d.type} ${d.part_id}`;
  }
  info.style.display = 'block';
}

function onViewerClick(event) {
  const picked = pickSceneItem(event);
  partMeshesMap.forEach(mesh => mesh.material = materialForPart(mesh.userData.part.status));
  damageSpheres.forEach(s => s.material = materials.damage);
  if (!picked) { updateStepOverlay(); return; }
  if (picked.type === 'part') {
    const mesh = partMeshesMap.get(picked.object.id);
    if (mesh) mesh.material = materials.selected;
    const related = (state.damages || []).filter(d => d.part_id === picked.object.id);
    related.forEach(d => { const sphere = damageSpheres.find(s => s.userData.damage?.id === d.id); if (sphere) sphere.material = materials.selected; });
    log(`Selected part: ${picked.object.id}`);
  } else {
    const sphere = damageSpheres.find(s => s.userData.damage?.id === picked.object.id);
    if (sphere) sphere.material = materials.selected;
    const mesh = partMeshesMap.get(picked.object.part_id);
    if (mesh) mesh.material = materials.selected;
    log(`Selected damage: ${picked.object.id}`);
  }
}

function renderRadar() {
  const canvas = el['radar-canvas'];
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.37;
  const axes = state.intent.axes;
  const n = Math.max(axes.length, 3);

  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 5; ring++) {
    ctx.beginPath();
    axes.forEach((_, i) => {
      const ang = -Math.PI / 2 + i * ((Math.PI * 2) / n);
      const px = cx + Math.cos(ang) * r * (ring / 5);
      const py = cy + Math.sin(ang) * r * (ring / 5);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  axes.forEach((axis, i) => {
    const ang = -Math.PI / 2 + i * ((Math.PI * 2) / n);
    const ex = cx + Math.cos(ang) * r;
    const ey = cy + Math.sin(ang) * r;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = '18px sans-serif';
    const lx = cx + Math.cos(ang) * (r + 30);
    const ly = cy + Math.sin(ang) * (r + 30);
    ctx.textAlign = lx > cx + 6 ? 'left' : lx < cx - 6 ? 'right' : 'center';
    ctx.textBaseline = ly > cy + 6 ? 'top' : ly < cy - 6 ? 'bottom' : 'middle';
    wrapText(ctx, axis.label, lx, ly, 140, 18);
  });

  ctx.fillStyle = 'rgba(17,17,17,0.16)';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  axes.forEach((axis, i) => {
    const ang = -Math.PI / 2 + i * ((Math.PI * 2) / n);
    const px = cx + Math.cos(ang) * r * axis.value;
    const py = cy + Math.sin(ang) * r * axis.value;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  axes.forEach((axis, i) => {
    const ang = -Math.PI / 2 + i * ((Math.PI * 2) / n);
    const px = cx + Math.cos(ang) * r * axis.value;
    const py = cy + Math.sin(ang) * r * axis.value;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let offsetY = 0;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y + offsetY);
      line = words[n] + ' ';
      offsetY += lineHeight;
    } else line = test;
  }
  ctx.fillText(line.trim(), x, y + offsetY);
}

function renderAxisList() {
  const container = el['axis-list'];
  container.innerHTML = '';
  state.intent.axes.forEach((axis, idx) => {
    const row = document.createElement('div');
    row.className = 'axis-row';
    row.innerHTML = `
      <div>
        <input type="text" value="${escapeHtml(axis.label)}" data-kind="label" data-idx="${idx}" />
        <input type="range" min="0" max="1" step="0.01" value="${axis.value}" data-kind="value" data-idx="${idx}" />
      </div>
      <div class="axis-value">${Math.round(axis.value * 100)}%</div>
      <button class="mini-btn" data-kind="remove" data-idx="${idx}">×</button>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('input,button').forEach(node => {
    node.addEventListener('input', onAxisInput);
    node.addEventListener('click', onAxisInput);
  });
}

function onAxisInput(e) {
  const idx = Number(e.target.dataset.idx);
  const kind = e.target.dataset.kind;
  if (!Number.isFinite(idx)) return;
  if (kind === 'label') state.intent.axes[idx].label = e.target.value;
  if (kind === 'value') state.intent.axes[idx].value = Number(e.target.value);
  if (kind === 'remove' && state.intent.axes.length > 3) state.intent.axes.splice(idx, 1);
  syncIntentUi();
}

function addAxis() {
  state.intent.axes.push({ id: `axis_${Date.now()}`, label: 'New Axis', value: 0.5 });
  syncIntentUi();
}

function resetIntent() {
  state.intent.axes = DEFAULT_AXES.map(([label, value], i) => ({ id: `axis_${i+1}`, label, value }));
  state.intent.summary = 'Balanced repair with moderate emphasis on structural performance and reasonable reversibility.';
  syncIntentUi();
}

function syncIntentUi() {
  el['intent-summary'].value = state.intent.summary;
  renderAxisList();
  renderRadar();
}

function radarHit(event) {
  const rect = el['radar-canvas'].getBoundingClientRect();
  const canvas = el['radar-canvas'];
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const angle = Math.atan2(y - cy, x - cx);
  const normalized = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  const n = state.intent.axes.length;
  const idx = Math.round(normalized / ((Math.PI * 2) / n)) % n;
  const r = Math.min(canvas.width, canvas.height) * 0.37;
  const dist = Math.min(1, Math.hypot(x - cx, y - cy) / r);
  return { idx, value: Math.max(0, Math.min(1, dist)) };
}

function onRadarPointerDown(event) {
  draggingRadar = true;
  const hit = radarHit(event);
  state.intent.axes[hit.idx].value = hit.value;
  syncIntentUi();
}

function onRadarPointerMove(event) {
  if (!draggingRadar) return;
  const hit = radarHit(event);
  state.intent.axes[hit.idx].value = hit.value;
  syncIntentUi();
}

async function suggestIntent() {
  const prompt = el['instruction-input'].value.trim() || state.intent.summary || 'Suggest a balanced repair intent';
  try {
    log('Generating intent suggestion...');
    const payload = { prompt, currentIntent: state.intent, constraints: state.constraints };
    const res = await fetch('./api/repair-intent-helper.js', postJson(payload));
    const data = await res.json();
    const parsed = unwrapGeminiJson(data);
    if (parsed.axes?.length) state.intent.axes = parsed.axes.map((a, i) => ({ id: a.id || `axis_${i+1}`, label: a.label, value: Number(a.value) }));
    if (parsed.summary) state.intent.summary = parsed.summary;
    syncIntentUi();
    log('Intent suggestion applied.');
  } catch (err) {
    log(`Intent suggestion failed: ${err.message}`);
  }
}

function renderPreviewCards() {}

function collectConstraintsFromUi() {
  state.objectName = el['object-name'].value.trim();
  state.intent.summary = el['intent-summary'].value;
  return {
    tools_available: el['tools-available'].value,
    materials_available: el['materials-available'].value,
    time_budget_minutes: Number(el['time-budget'].value || 0),
    budget_limit: el['budget-limit'].value,
    skill_level: el['skill-level'].value,
    safety_level: el['safety-level'].value,
    allowed_operations: el['allowed-ops'].value,
    avoid_operations: el['avoid-ops'].value,
    additional_constraints: el['additional-constraints'].value,
  };
}

async function generateAssembly() {
  try {
    state.constraints = collectConstraintsFromUi();
    log('Generating or updating assembly...');
    const payload = {
      prompt: el['instruction-input'].value || `Generate an assembly for ${state.objectName || 'the object'}`,
      modelJson: state.assembly,
      files: state.photos,
      temperature: 0.4,
      geminiModel: 'gemini-2.5-pro',
      allowRotations: true,
    };
    const res = await fetch('./api/generate-assembly.js', postJson(payload));
    const data = await res.json();
    state.assembly = unwrapGeminiJson(data);
    state.objectName = state.assembly.objectName || state.objectName;
    el['object-name'].value = state.objectName;
    createModel();
    frameObject();
    log('Assembly updated.');
  } catch (err) {
    log(`Assembly generation failed: ${err.message}`);
  }
}

async function updateDamages() {
  try {
    state.constraints = collectConstraintsFromUi();
    log('Updating damages from current evidence...');
    const payload = {
      prompt: el['instruction-input'].value,
      modelJson: state.assembly,
      damageJson: state.damages,
      files: state.photos,
    };
    const res = await fetch('./api/catalog-damages.js', postJson(payload));
    const data = await res.json();
    const parsed = unwrapGeminiJson(data);
    state.assembly = parsed.updatedModel || state.assembly;
    state.damages = parsed.updatedDamages || state.damages;
    createModel();
    frameObject();
    log('Damage model updated.');
  } catch (err) {
    log(`Damage update failed: ${err.message}`);
  }
}

async function updateAssembly() {
  try {
    log('Applying assembly intervention...');
    const payload = {
      modelJson: state.assembly,
      userPrompt: el['instruction-input'].value,
      geminiModel: 'gemini-2.5-flash',
      temperature: 0.3,
    };
    const res = await fetch('./api/create-intervention.js', postJson(payload));
    const data = await res.json();
    state.assembly = unwrapGeminiJson(data);
    createModel();
    frameObject();
    log('Assembly changed.');
  } catch (err) {
    log(`Assembly intervention failed: ${err.message}`);
  }
}

async function generatePlan(isReplan = false) {
  try {
    state.constraints = collectConstraintsFromUi();
    log(isReplan ? 'Replanning from current state...' : 'Generating repair plan...');
    const payload = {
      modelJson: state.assembly,
      damageJson: state.damages,
      userPrompt: el['instruction-input'].value,
      existingPlan: isReplan ? state.plan : null,
      repairIntent: {
        axes: state.intent.axes,
        summary: state.intent.summary,
        constraints: state.constraints,
      },
      geminiModel: 'gemini-2.5-pro',
      temperature: 0.45,
    };
    const res = await fetch('./api/repair-plan.js', postJson(payload));
    const data = await res.json();
    state.plan = unwrapGeminiJson(data);
    hydratePlanVersion(state.plan, isReplan ? 'Replan' : 'Initial Plan');
    renderPlan();
    log('Repair plan ready.');
  } catch (err) {
    log(`Plan generation failed: ${err.message}`);
  }
}

function hydratePlanVersion(plan, label) {
  const id = `plan_v_${state.planVersions.length + 1}`;
  const version = {
    id,
    label,
    createdAt: new Date().toISOString(),
    basedOn: state.currentPlanVersionId,
    trigger: label,
    plan: JSON.parse(JSON.stringify(plan)),
  };
  state.planVersions.push(version);
  state.currentPlanVersionId = id;
  if (!state.currentStepId && plan.steps?.length) {
    const start = plan.steps.find(s => !s.prerequisites || !s.prerequisites.length) || plan.steps[0];
    state.currentStepId = start?.step_id || null;
  }
}

function savePlanVersion() {
  if (!state.plan?.steps?.length) return log('No plan to version yet.');
  hydratePlanVersion(state.plan, 'Manual Save');
  renderPlan();
  log('Plan version saved.');
}

function renderPlan() {
  renderPlanGraph();
  renderStepList();
  updateStepOverlay();
}

function renderPlanGraph() {
  const steps = state.plan?.steps || [];
  const wrap = el['action-map-container'];
  if (!steps.length) {
    wrap.innerHTML = '<div style="padding:16px;color:#666">No action graph loaded.</div>';
    return;
  }
  const stepMap = new Map(steps.map(s => [s.step_id, s]));
  const memo = new Map();
  const levelOf = (step) => {
    if (memo.has(step.step_id)) return memo.get(step.step_id);
    const pres = (step.prerequisites || []).map(id => stepMap.get(id)).filter(Boolean);
    const level = pres.length ? Math.max(...pres.map(levelOf)) + 1 : 0;
    memo.set(step.step_id, level);
    return level;
  };
  const lanes = new Map();
  steps.forEach(step => {
    const lvl = levelOf(step);
    if (!lanes.has(lvl)) lanes.set(lvl, []);
    lanes.get(lvl).push(step);
  });
  const ordered = [...lanes.entries()].sort((a,b)=>a[0]-b[0]);
  const zoom = state.ui.graphZoom || 1;
  let html = `<div style="overflow:auto;padding:14px;"><div class="action-map-grid" style="transform:scale(${zoom});transform-origin:top left;width:max-content;min-width:${Math.max(100/zoom,100)}%;">`;
  ordered.forEach(([lvl, lane]) => {
    html += `<div class="action-lane"><div class="action-lane-title">Stage ${lvl + 1}</div><div class="action-lane-body">`;
    lane.forEach(step => {
      const prereqText = (step.prerequisites || []).join(', ') || 'start';
      const partText = (step.affected_parts || []).join(', ') || '-';
      html += `<div class="action-node ${step.step_id === state.currentStepId ? 'active' : ''}" data-step-id="${escapeHtml(step.step_id)}"><strong>${escapeHtml(step.title || step.step_id)}</strong><small>Needs: ${escapeHtml(prereqText)}</small><small>Parts: ${escapeHtml(partText)}</small></div>`;
    });
    html += '</div></div>';
  });
  html += '</div></div>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.action-node').forEach(node => node.onclick = () => openActionNode(node.dataset.stepId));
}

function openActionNode(stepId) {
  state.currentStepId = stepId;
  const step = (state.plan?.steps || []).find(s => s.step_id === stepId);
  if (!step) return;
  highlightCurrentStep();
  renderStepList();
  updateStepOverlay();
  const detail = el['action-node-detail'];
  detail.innerHTML = `
    <h3 style="margin:0 0 12px 0;text-align:left;">${escapeHtml(step.title || step.step_id)}</h3>
    <div style="display:grid;gap:10px;">
      <div class="summary-box"><div class="title">Step ID</div><div class="body">${escapeHtml(step.step_id || '-')}</div></div>
      <div class="summary-box"><div class="title">Description</div><div class="body">${escapeHtml(step.description || '-')}</div></div>
      <div class="summary-box"><div class="title">Rationale</div><div class="body">${escapeHtml(step.rationale || '-')}</div></div>
      <div class="summary-box"><div class="title">Tools and Materials</div><div class="body">${escapeHtml((step.tools_required || []).join(', ') || '-')}</div></div>
      <div class="summary-box"><div class="title">Affected Parts</div><div class="body">${escapeHtml((step.affected_parts || []).join(', ') || '-')}</div></div>
      <div class="summary-box"><div class="title">Affected Damages</div><div class="body">${escapeHtml((step.affected_damages || []).join(', ') || '-')}</div></div>
      <div class="summary-box"><div class="title">Prerequisites</div><div class="body">${escapeHtml((step.prerequisites || []).join(', ') || 'start')}</div></div>
      ${step.expected_outcome ? `<div class="summary-box"><div class="title">Expected Outcome</div><div class="body">${escapeHtml(step.expected_outcome)}</div></div>` : ''}
      ${step.safety_notes ? `<div class="summary-box"><div class="title">Safety Notes</div><div class="body">${escapeHtml(step.safety_notes)}</div></div>` : ''}
    </div>`;
  el['action-node-modal'].style.display = 'flex';
}

function renderSpatialGraph() {
  const parts = state.assembly?.parts || [];
  if (!parts.length) {
    el['spatial-graph-container'].innerHTML = '<div style="padding:16px;color:#666">No assembly loaded.</div>';
    return;
  }
  const lines = ['digraph G {','rankdir=LR;','graph [pad="0.2", nodesep="0.25", ranksep="0.45"];','node [shape=box, style="rounded,filled", fillcolor="#ffffff", color="#111111", fontname="Helvetica", fontsize=11];','edge [color="#666666"];'];
  parts.forEach(part => {
    const label = `${part.id}\n${part.status || 'intact'}`.replace(/"/g,'\\"');
    lines.push(`"${part.id}" [label="${label}"];`);
  });
  const seen = new Set();
  parts.forEach(part => (part.connections || []).forEach(other => {
    const key = [part.id, other].sort().join('::');
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(`"${part.id}" -> "${other}" [dir=none];`);
  }));
  lines.push('}');
  el['spatial-graph-container'].innerHTML = '';
  d3.select(el['spatial-graph-container']).graphviz().fit(true).renderDot(lines.join('\n'));
}

function renderStepList() {
  const wrap = el['step-list'];
  wrap.innerHTML = '';
  const versions = state.planVersions.slice().reverse();
  if (versions.length) {
    const versionCard = document.createElement('div');
    versionCard.className = 'step-card';
    versionCard.innerHTML = `<strong>Current version</strong><div class="step-meta">${escapeHtml(state.currentPlanVersionId || '-')} • ${versions[0].label}</div>`;
    wrap.appendChild(versionCard);
  }
  (state.plan?.steps || []).forEach((step, idx) => {
    const card = document.createElement('div');
    card.className = `step-card ${step.step_id === state.currentStepId ? 'active' : ''} ${step.completed ? 'done' : ''}`;
    card.innerHTML = `<strong>${escapeHtml(step.title || step.step_id)}</strong>
      <div class="step-meta">${escapeHtml((step.tools_required || []).join(', ') || 'No tools listed')}</div>
      <div class="step-meta">Prerequisites: ${escapeHtml((step.prerequisites || []).join(', ') || 'start / parallel')}</div>
      <div class="step-meta">Parts: ${escapeHtml((step.affected_parts || []).join(', ') || '-')}</div>`;
    card.onclick = () => openActionNode(step.step_id);
    wrap.appendChild(card);
  });
}

function currentStep() {
  return (state.plan?.steps || []).find(step => step.step_id === state.currentStepId) || null;
}

function updateStepOverlay() {
  const step = currentStep();
  if (!step || !state.guidanceActive) {
    el['step-overlay'].style.display = 'none';
    return;
  }
  el['step-overlay'].style.display = 'block';
  el['step-overlay-title'].textContent = step.title || step.step_id;
  el['step-overlay-body'].textContent = step.description || '';
  el['step-overlay-meta'].textContent = `Tools: ${(step.tools_required || []).join(', ') || '-'} • Prerequisites: ${(step.prerequisites || []).join(', ') || '-'}`;
}


function highlightCurrentStep() {
  const step = currentStep();
  partMeshesMap.forEach(mesh => mesh.material = materialForPart(mesh.userData.part.status));
  damageSpheres.forEach(s => s.material = materials.damage);
  if (!step) return;
  (step.affected_parts || []).forEach(id => {
    const mesh = partMeshesMap.get(id);
    if (mesh) mesh.material = materials.selected;
  });
  (step.affected_damages || []).forEach(id => {
    const sphere = damageSpheres.find(s => s.userData.damage?.id === id);
    if (sphere) sphere.material = materials.selected;
  });
}

function startGuidance() {
  const hasPlan = state.plan?.steps?.length;
  if (!hasPlan) return log('Generate a plan first.');
  state.guidanceActive = true;
  if (!state.currentStepId) {
    const start = state.plan.steps.find(s => !s.prerequisites?.length) || state.plan.steps[0];
    state.currentStepId = start.step_id;
  }
  updateStepOverlay();
  highlightCurrentStep();
  renderStepList();
  log('Guidance started.');
}

async function addDamageFromNote() {
  const note = el['instruction-input'].value.trim();
  if (!note) return log('Add a note in the instruction field first.');
  const id = `damage_${String(state.damages.length + 1).padStart(2, '0')}`;
  const partId = state.assembly.parts?.[0]?.id || 'unknown_part';
  state.damages.push({ id, type: 'Observed Issue', description: note, part_id: partId, coordinates: { ...(state.assembly.parts?.[0]?.origin || { x: 0, y: 0.2, z: 0 }) } });
  createDamages();
  log('Damage note added as a provisional issue.');
}

function postJson(body) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function unwrapGeminiJson(response) {
  if (!response) throw new Error('Empty response');
  if (response.steps || response.parts || response.updatedModel || response.updatedDamages || response.axes) return response;
  const text = response?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || response?.answer;
  if (!text) throw new Error(response.error || response.message || 'Invalid API response');
  try { return JSON.parse(text); } catch {
    const match = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse JSON from model response');
    return JSON.parse(match[0]);
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}

initDom();
init3D();
syncIntentUi();
createModel();
frameObject();
renderPlan();
animate();
