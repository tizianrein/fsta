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
  intent: { axes: DEFAULT_AXES.map(([label, value], i) => ({ id: `axis_${i+1}`, label, value })), summary: 'Balanced repair with moderate emphasis on structural performance and reasonable reversibility.' },
  constraints: { tools_available: '', materials_available: '', time_budget_minutes: 60, budget_limit: '', skill_level: 'intermediate', safety_level: 'normal', allowed_operations: '', avoid_operations: '', additional_constraints: '' },
  ui: { exploded: false, selectedPartId: null, selectedDamageId: null },
};

const el = {};
let scene, camera, renderer, controls, axesScene, axesCamera, raycaster, mouse;
const objectGroup = new THREE.Group();
const partMeshesMap = new Map();
const damageSpheres = [];
let activeAnimations = [];
const ANIMATION_DURATION = 800;
let draggingRadar = false;
let pointerDownHit = null;
let pointerDownPos = null;

const materials = {
  intact: new THREE.MeshBasicMaterial({ color: 0xd0d0d0, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.FrontSide }),
  defective: new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.FrontSide }),
  missing: new THREE.MeshBasicMaterial({ color: 0xffde59, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.FrontSide }),
  newPart: new THREE.MeshBasicMaterial({ color: 0xc000ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.FrontSide }),
  discarded: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.FrontSide }),
  selected: new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.FrontSide }),
  stepHighlight: new THREE.MeshBasicMaterial({ color: 0xa9d6ff, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.FrontSide }),
  outline: new THREE.LineBasicMaterial({ color: 0x000000 }),
  damage: new THREE.MeshBasicMaterial({ color: 0xc1121f, depthWrite: false }),
  selectedDamage: new THREE.MeshBasicMaterial({ color: 0x2f6bff, depthWrite: false }),
};

function qs(id) { return document.getElementById(id); }

function initDom() {
  [
    'object-name','viewer-canvas','viewer','info-box','step-overlay','step-overlay-title','step-overlay-body','step-overlay-meta',
    'axis-list','radar-canvas','intent-summary','tools-available','materials-available','time-budget','budget-limit','skill-level',
    'safety-level','allowed-ops','avoid-ops','additional-constraints','instruction-input','console-output','step-list','plan-section',
    'json-modal','json-textarea','example-path','detail-modal','detail-title','detail-grid','spatial-graph-modal','action-graph-canvas',
    'action-graph-viewport','spatial-graph-canvas','spatial-graph-viewport','assembly-file','damages-file','plan-file','photos-file',
    'intent-modal','constraints-modal'
  ].forEach(id => el[id] = qs(id));

  qs('upload-assembly-btn').onclick = () => el['assembly-file'].click();
  qs('upload-damages-btn').onclick = () => el['damages-file'].click();
  qs('upload-plan-btn').onclick = () => el['plan-file'].click();
  qs('add-photos-btn').onclick = () => el['photos-file'].click();
  qs('open-json-btn').onclick = openJsonModal;
  qs('close-json-btn').onclick = () => closeModal(el['json-modal']);
  qs('save-json-btn').onclick = saveJsonModal;
  qs('copy-json-btn').onclick = async () => navigator.clipboard.writeText(el['json-textarea'].value);
  qs('load-example-btn').onclick = loadExampleFromInput;

  qs('open-intent-btn').onclick = () => openModal(el['intent-modal']);
  qs('close-intent-btn').onclick = () => closeModal(el['intent-modal']);
  qs('open-constraints-btn').onclick = () => openModal(el['constraints-modal']);
  qs('close-constraints-btn').onclick = () => closeModal(el['constraints-modal']);
  qs('close-detail-btn').onclick = () => closeModal(el['detail-modal']);
  qs('open-spatial-graph-btn').onclick = () => { renderSpatialGraph(); openModal(el['spatial-graph-modal']); };
  qs('close-spatial-graph-btn').onclick = () => closeModal(el['spatial-graph-modal']);

  qs('download-state-btn').onclick = downloadWorkspace;
  qs('explode-btn').onclick = explodeView;
  qs('restore-btn').onclick = restoreView;
  qs('add-axis-btn').onclick = addAxis;
  qs('reset-intent-btn').onclick = resetIntent;
  qs('suggest-intent-btn').onclick = suggestIntent;
  qs('generate-assembly-btn').onclick = generateAssembly;
  qs('update-damages-btn').onclick = updateDamages;
  qs('update-assembly-btn').onclick = updateAssembly;
  qs('generate-plan-btn').onclick = () => generatePlan(false);
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
  const bindConstraint = (id, key, asNumber=false) => qs(id).addEventListener('input', () => state.constraints[key] = asNumber ? Number(qs(id).value || 0) : qs(id).value);
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

function openModal(node) { node.style.display = 'flex'; }
function closeModal(node) { node.style.display = 'none'; }

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.add(objectGroup);
  const wrap = el['viewer'];
  camera = new THREE.PerspectiveCamera(18, wrap.clientWidth / wrap.clientHeight, 0.01, 1000);
  camera.position.set(1.5, 1.2, 1.5);
  renderer = new THREE.WebGLRenderer({ canvas: el['viewer-canvas'], antialias: true, alpha: true });
  renderer.autoClear = false;
  renderer.sortObjects = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0,0,0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7); dir.position.set(2,3,2); scene.add(dir);
  axesScene = new THREE.Scene();
  axesCamera = new THREE.OrthographicCamera(-2.5,2.5,2.5,-2.5,-10,10);
  axesScene.add(new THREE.AxesHelper(1.5));
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('pointermove', onViewerPointerMove);
  renderer.domElement.addEventListener('pointerdown', onViewerPointerDown);
  renderer.domElement.addEventListener('pointerup', onViewerPointerUp);
}

function onResize() {
  const wrap = el['viewer'];
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
      const p = Math.min((now - anim.startTime) / ANIMATION_DURATION, 1);
      const e = 1 - Math.pow(1 - p, 3);
      anim.mesh.position.lerpVectors(anim.start, anim.end, e);
    });
    activeAnimations = activeAnimations.filter(anim => now - anim.startTime < ANIMATION_DURATION);
  }
  controls.update();
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.setViewport(10,10,80,80);
  axesCamera.quaternion.copy(camera.quaternion);
  renderer.render(axesScene, axesCamera);
  renderer.setViewport(0,0,renderer.domElement.clientWidth, renderer.domElement.clientHeight);
}

function log(message) { el['console-output'].textContent = message; }

function currentWorkspaceJson() {
  return { objectName: state.objectName || state.assembly?.objectName || '', assembly: state.assembly, damages: state.damages, intent: state.intent, constraints: state.constraints, plan: state.plan, planVersions: state.planVersions, currentPlanVersionId: state.currentPlanVersionId, currentStepId: state.currentStepId };
}

function openJsonModal() {
  el['json-textarea'].value = JSON.stringify(currentWorkspaceJson(), null, 2);
  openModal(el['json-modal']);
}

function saveJsonModal() {
  try {
    const parsed = JSON.parse(el['json-textarea'].value);
    applyWorkspaceJson(parsed);
    closeModal(el['json-modal']);
    log('Workspace JSON updated.');
  } catch (err) {
    log(`JSON save failed: ${err.message}`);
  }
}

async function loadExampleFromInput() {
  const raw = el['example-path'].value.trim();
  if (!raw) return log('Enter an example path first.');
  try {
    let data;
    if (raw.endsWith('.json')) {
      const res = await fetch(raw);
      if (!res.ok) throw new Error(`Could not load ${raw}`);
      data = await res.json();
      if (!data.assembly && !data.plan && !data.damages && !data.parts) {
        throw new Error('The JSON does not look like a workspace or assembly file.');
      }
    } else {
      const base = raw.replace(/\/$/, '');
      const [assembly, damages, plan] = await Promise.all([
        fetch(`${base}/assembly.json`).then(r => { if (!r.ok) throw new Error('assembly.json missing'); return r.json(); }),
        fetch(`${base}/damages.json`).then(r => { if (!r.ok) return []; return r.json(); }),
        fetch(`${base}/plan.json`).then(r => { if (!r.ok) return { steps: [] }; return r.json(); }),
      ]);
      data = { objectName: assembly.objectName, assembly, damages, plan };
    }
    applyWorkspaceJson(data);
    el['json-textarea'].value = JSON.stringify(currentWorkspaceJson(), null, 2);
    log('Example loaded.');
  } catch (err) {
    log(`Example load failed: ${err.message}`);
  }
}

function applyWorkspaceJson(data) {
  // workspace wrapper
  if (data.assembly || data.plan || data.damages || data.intent || data.constraints) {
    state.assembly = data.assembly || state.assembly;
    state.damages = Array.isArray(data.damages) ? data.damages : state.damages;
    state.intent = data.intent || state.intent;
    state.constraints = { ...state.constraints, ...(data.constraints || {}) };
    state.plan = data.plan || state.plan;
    state.planVersions = data.planVersions || [];
    state.currentPlanVersionId = data.currentPlanVersionId || null;
    state.currentStepId = data.currentStepId || null;
    state.objectName = data.objectName || state.assembly.objectName || state.objectName;
  } else if (data.parts) {
    state.assembly = data;
    state.objectName = data.objectName || state.objectName;
  } else if (Array.isArray(data)) {
    state.damages = data;
  } else if (data.steps) {
    state.plan = data;
  } else {
    throw new Error('Unsupported JSON structure.');
  }
  hydratePlanVersionIfNeeded();
  syncUiFromState();
}

function syncUiFromState() {
  el['object-name'].value = state.objectName || state.assembly.objectName || '';
  qs('tools-available').value = state.constraints.tools_available || '';
  qs('materials-available').value = state.constraints.materials_available || '';
  qs('time-budget').value = state.constraints.time_budget_minutes || 0;
  qs('budget-limit').value = state.constraints.budget_limit || '';
  qs('skill-level').value = state.constraints.skill_level || 'intermediate';
  qs('safety-level').value = state.constraints.safety_level || 'normal';
  qs('allowed-ops').value = state.constraints.allowed_operations || '';
  qs('avoid-ops').value = state.constraints.avoid_operations || '';
  qs('additional-constraints').value = state.constraints.additional_constraints || '';
  syncIntentUi();
  createModel();
  frameObject();
  renderPlan();
}

function hydratePlanVersionIfNeeded() {
  if (state.plan?.steps?.length && !state.planVersions.length) hydratePlanVersion(state.plan, 'Imported Plan');
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
    state.assembly = data.assembly || data;
    state.objectName = data.objectName || state.assembly.objectName || state.objectName;
    createModel(); frameObject(); renderSpatialGraph();
    log('Assembly loaded.');
  } else if (kind === 'damages') {
    state.damages = Array.isArray(data) ? data : data.damages || [];
    createDamages(); renderSpatialGraph();
    log('Damages loaded.');
  } else if (kind === 'plan') {
    state.plan = data.plan || data;
    hydratePlanVersion(state.plan, 'Imported Plan');
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
    reader.onload = () => resolve({ name:file.name, mimeType:file.type || 'application/octet-stream', data:String(reader.result).split(',')[1] });
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
    const mesh = new THREE.Mesh(geo, materialForPart(part.status));
    const origin = part.origin || { x:0, y:0, z:0 };
    mesh.position.set(origin.x || 0, origin.y || 0, origin.z || 0);
    mesh.userData.part = part;
    if (part.rotation) mesh.rotation.set(part.rotation.x || 0, part.rotation.y || 0, part.rotation.z || 0, 'YXZ');
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), materials.outline));
    objectGroup.add(mesh);
    partMeshesMap.set(part.id, mesh);
  });
  createDamages();
  apply3DSelection();
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
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.018, 18, 18), materials.damage);
    const p = dmg.coordinates || { x:0, y:0, z:0 };
    sphere.position.set(p.x || 0, p.y || 0, p.z || 0);
    sphere.userData.damage = dmg;
    damageSpheres.push(sphere); scene.add(sphere);
  });
}

function frameObject() {
  const box = new THREE.Box3().setFromObject(objectGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const fov = camera.fov * Math.PI / 180;
  let distance = maxDim / (2 * Math.tan(fov / 2)); distance *= 1.9;
  const dir = new THREE.Vector3(1, 0.85, 1).normalize();
  camera.position.copy(dir.multiplyScalar(distance).add(center));
  controls.target.copy(center); controls.update();
}

function explodeView() {
  if (state.ui.exploded) return; state.ui.exploded = true; activeAnimations = [];
  const center = new THREE.Box3().setFromObject(objectGroup).getCenter(new THREE.Vector3());
  partMeshesMap.forEach(mesh => {
    const direction = mesh.position.clone().sub(center); if (direction.length() < 0.001) direction.set(Math.random()-0.5, Math.random()-0.2, Math.random()-0.5); direction.normalize();
    activeAnimations.push({ mesh, start: mesh.position.clone(), end: mesh.position.clone().add(direction.multiplyScalar(0.18)), startTime: performance.now() });
  });
}
function restoreView() {
  if (!state.ui.exploded) return; state.ui.exploded = false; activeAnimations = [];
  (state.assembly.parts || []).forEach(part => {
    const mesh = partMeshesMap.get(part.id); if (!mesh) return; const o = part.origin || {x:0,y:0,z:0};
    activeAnimations.push({ mesh, start: mesh.position.clone(), end: new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0), startTime: performance.now() });
  });
}

function setMouseFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function hitTest(event) {
  setMouseFromEvent(event);
  raycaster.setFromCamera(mouse, camera);
  const rawHits = raycaster.intersectObjects([...damageSpheres, ...objectGroup.children], true);
  if (!rawHits.length) return null;
  const hits = rawHits.filter(h => h.object.type !== 'LineSegments');
  for (const h of hits) {
    let item = h.object;
    while (item && !item.userData.part && !item.userData.damage && item.parent && item.parent !== scene) item = item.parent;
    if (item?.userData?.damage) return { type:'damage', data:item.userData.damage };
    if (item?.userData?.part) return { type:'part', data:item.userData.part };
  }
  return null;
}

function selectedInfoText() {
  if (state.ui.selectedDamageId) {
    const d = (state.damages || []).find(x => x.id === state.ui.selectedDamageId);
    if (!d) return '';
    return `Damage: ${d.id}\nType: ${d.type || '-'}\nPart: ${d.part_id || '-'}\n${d.description || ''}`;
  }
  if (state.ui.selectedPartId) {
    const p = (state.assembly.parts || []).find(x => x.id === state.ui.selectedPartId);
    if (!p) return '';
    const dims = p.dimensions || {};
    const w = Math.round(((dims.width||dims.w||0)*1000))/10;
    const h = Math.round(((dims.height||dims.h||0)*1000))/10;
    const d = Math.round(((dims.depth||dims.d||0)*1000))/10;
    return `Part: ${p.id}\nStatus: ${p.status || 'intact'}\nSize: ${w} x ${h} x ${d} cm`;
  }
  return '';
}

function refreshInfoBox(hoverHit=null) {
  const info = el['info-box'];
  const selected = selectedInfoText();
  if (selected) { info.textContent = selected; return; }
  if (hoverHit) {
    info.textContent = hoverHit.type === 'part'
      ? `Part: ${hoverHit.data.id}\nStatus: ${hoverHit.data.status || 'intact'}`
      : `Damage: ${hoverHit.data.id}\nType: ${hoverHit.data.type || '-'}\nPart: ${hoverHit.data.part_id || '-'}`;
    return;
  }
  info.textContent = '';
}

function onViewerPointerMove(event) {
  refreshInfoBox(hitTest(event));
}
function onViewerPointerDown(event) { pointerDownHit = hitTest(event); pointerDownPos = {x:event.clientX, y:event.clientY}; }
function onViewerPointerUp(event) {
  const hit = hitTest(event);
  const moved = !pointerDownPos ? 99 : Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
  pointerDownPos = null;
  if (moved > 6) return;
  if (!hit) { state.ui.selectedPartId = null; state.ui.selectedDamageId = null; apply3DSelection(); return; }
  if (hit.type === 'part') { state.ui.selectedPartId = hit.data.id; state.ui.selectedDamageId = null; openDetailForPart(hit.data.id); }
  else { state.ui.selectedDamageId = hit.data.id; state.ui.selectedPartId = hit.data.part_id; openDetailForDamage(hit.data.id); }
  apply3DSelection();
}

function apply3DSelection() {
  partMeshesMap.forEach((mesh, id) => mesh.material = id === state.ui.selectedPartId ? materials.selected : materialForPart(mesh.userData.part.status));
  damageSpheres.forEach(s => s.material = s.userData.damage.id === state.ui.selectedDamageId ? materials.selectedDamage : materials.damage);
  highlightCurrentStep();
  refreshInfoBox();
}

function renderRadar() {
  const canvas = el['radar-canvas']; const ctx = canvas.getContext('2d'); const width = canvas.width; const height = canvas.height;
  ctx.clearRect(0,0,width,height); const cx = width/2, cy = height/2, r = Math.min(width,height)*0.37; const axes = state.intent.axes; const n = Math.max(axes.length,3);
  ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 1;
  for (let ring=1; ring<=5; ring++) { ctx.beginPath(); axes.forEach((_,i)=>{ const a = -Math.PI/2 + i*((Math.PI*2)/n); const px = cx + Math.cos(a)*r*(ring/5); const py = cy + Math.sin(a)*r*(ring/5); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }); ctx.closePath(); ctx.stroke(); }
  axes.forEach((axis,i)=>{ const a=-Math.PI/2+i*((Math.PI*2)/n); const ex = cx + Math.cos(a)*r; const ey = cy + Math.sin(a)*r; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke(); ctx.fillStyle='#111'; ctx.font='18px sans-serif'; const lx=cx+Math.cos(a)*(r+30), ly=cy+Math.sin(a)*(r+30); ctx.textAlign = lx > cx+6 ? 'left' : lx < cx-6 ? 'right' : 'center'; ctx.textBaseline = ly > cy+6 ? 'top' : ly < cy-6 ? 'bottom' : 'middle'; wrapText(ctx, axis.label, lx, ly, 140, 18); });
  ctx.fillStyle='rgba(17,17,17,.16)'; ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.beginPath(); axes.forEach((axis,i)=>{ const a=-Math.PI/2+i*((Math.PI*2)/n); const px=cx+Math.cos(a)*r*axis.value, py=cy+Math.sin(a)*r*axis.value; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }); ctx.closePath(); ctx.fill(); ctx.stroke();
  axes.forEach((axis,i)=>{ const a=-Math.PI/2+i*((Math.PI*2)/n); const px=cx+Math.cos(a)*r*axis.value, py=cy+Math.sin(a)*r*axis.value; ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fillStyle='#111'; ctx.fill(); });
}
function wrapText(ctx,text,x,y,maxWidth,lineHeight){ const words=text.split(' '); let line=''; let oy=0; for(let n=0;n<words.length;n++){ const test=line+words[n]+' '; if(ctx.measureText(test).width>maxWidth&&n>0){ ctx.fillText(line.trim(),x,y+oy); line=words[n]+' '; oy+=lineHeight; } else line=test; } ctx.fillText(line.trim(),x,y+oy); }
function renderAxisList(){ const c=el['axis-list']; c.innerHTML=''; state.intent.axes.forEach((axis,idx)=>{ const row=document.createElement('div'); row.className='axis-row'; row.innerHTML=`<div><input type="text" value="${escapeHtml(axis.label)}" data-kind="label" data-idx="${idx}"><input type="range" min="0" max="1" step="0.01" value="${axis.value}" data-kind="value" data-idx="${idx}"></div><div class="axis-value">${Math.round(axis.value*100)}%</div><button class="mini-btn" data-kind="remove" data-idx="${idx}">×</button>`; c.appendChild(row); }); c.querySelectorAll('input,button').forEach(n=>{ n.addEventListener('input', onAxisInput); n.addEventListener('click', onAxisInput); }); }
function onAxisInput(e){ const idx=Number(e.target.dataset.idx), kind=e.target.dataset.kind; if(!Number.isFinite(idx)) return; if(kind==='label') state.intent.axes[idx].label=e.target.value; if(kind==='value') state.intent.axes[idx].value=Number(e.target.value); if(kind==='remove'&&state.intent.axes.length>3) state.intent.axes.splice(idx,1); syncIntentUi(); }
function addAxis(){ state.intent.axes.push({ id:`axis_${Date.now()}`, label:'New Axis', value:.5 }); syncIntentUi(); }
function resetIntent(){ state.intent.axes=DEFAULT_AXES.map(([label,value],i)=>({id:`axis_${i+1}`,label,value})); state.intent.summary='Balanced repair with moderate emphasis on structural performance and reasonable reversibility.'; syncIntentUi(); }
function syncIntentUi(){ el['intent-summary'].value = state.intent.summary; renderAxisList(); renderRadar(); }
function radarHit(event){ const rect=el['radar-canvas'].getBoundingClientRect(), canvas=el['radar-canvas']; const x=((event.clientX-rect.left)/rect.width)*canvas.width, y=((event.clientY-rect.top)/rect.height)*canvas.height; const cx=canvas.width/2, cy=canvas.height/2; const angle=Math.atan2(y-cy,x-cx); const normalized=(angle+Math.PI/2+Math.PI*2)%(Math.PI*2); const n=state.intent.axes.length; const idx=Math.round(normalized/((Math.PI*2)/n))%n; const r=Math.min(canvas.width,canvas.height)*0.37; const dist=Math.min(1,Math.hypot(x-cx,y-cy)/r); return { idx, value:Math.max(0,Math.min(1,dist)) }; }
function onRadarPointerDown(event){ draggingRadar=true; const hit=radarHit(event); state.intent.axes[hit.idx].value=hit.value; syncIntentUi(); }
function onRadarPointerMove(event){ if(!draggingRadar) return; const hit=radarHit(event); state.intent.axes[hit.idx].value=hit.value; syncIntentUi(); }

async function suggestIntent(){
  const prompt = el['instruction-input'].value.trim() || state.intent.summary || 'Suggest a balanced repair intent';
  try { log('Generating intent suggestion...'); const res = await fetch('./api/repair-intent-helper.js', postJson({ prompt, currentIntent: state.intent, constraints: state.constraints })); const parsed = unwrapGeminiJson(await res.json()); if(parsed.axes?.length) state.intent.axes = parsed.axes.map((a,i)=>({ id:a.id || `axis_${i+1}`, label:a.label, value:Number(a.value) })); if(parsed.summary) state.intent.summary = parsed.summary; syncIntentUi(); log('Intent suggestion applied.'); } catch(err){ log(`Intent suggestion failed: ${err.message}`); }
}

function collectConstraintsFromUi(){ state.objectName = el['object-name'].value.trim(); state.intent.summary = el['intent-summary'].value; return { tools_available:qs('tools-available').value, materials_available:qs('materials-available').value, time_budget_minutes:Number(qs('time-budget').value || 0), budget_limit:qs('budget-limit').value, skill_level:qs('skill-level').value, safety_level:qs('safety-level').value, allowed_operations:qs('allowed-ops').value, avoid_operations:qs('avoid-ops').value, additional_constraints:qs('additional-constraints').value }; }

async function generateAssembly(){
  try { state.constraints = collectConstraintsFromUi(); log('Generating or updating assembly...'); const res = await fetch('./api/generate-assembly.js', postJson({ prompt: el['instruction-input'].value || `Generate an assembly for ${state.objectName || 'the object'}`, modelJson: state.assembly, files: state.photos, temperature:.4, geminiModel:'gemini-2.5-pro', allowRotations:true })); state.assembly = unwrapGeminiJson(await res.json()); state.objectName = state.assembly.objectName || state.objectName; syncUiFromState(); log('Assembly updated.'); } catch(err){ log(`Assembly generation failed: ${err.message}`); }
}
async function updateDamages(){
  try { state.constraints = collectConstraintsFromUi(); log('Updating damages from current evidence...'); const res = await fetch('./api/catalog-damages.js', postJson({ prompt: el['instruction-input'].value, modelJson: state.assembly, damageJson: state.damages, files: state.photos })); const parsed = unwrapGeminiJson(await res.json()); state.assembly = parsed.updatedModel || state.assembly; state.damages = parsed.updatedDamages || state.damages; syncUiFromState(); log('Damage model updated.'); } catch(err){ log(`Damage update failed: ${err.message}`); }
}
async function updateAssembly(){
  try { log('Applying assembly intervention...'); const res = await fetch('./api/create-intervention.js', postJson({ modelJson: state.assembly, userPrompt: el['instruction-input'].value, geminiModel:'gemini-2.5-flash', temperature:.4 })); state.assembly = unwrapGeminiJson(await res.json()); syncUiFromState(); log('Assembly intervention applied.'); } catch(err){ log(`Assembly intervention failed: ${err.message}`); }
}
async function generatePlan(isReplan=false){
  try {
    state.constraints = collectConstraintsFromUi();
    if (!state.assembly?.parts?.length) throw new Error('Load or generate an assembly first.');
    log(isReplan ? 'Replanning from current state...' : 'Generating repair plan...');
    const res = await fetch('./api/repair-plan.js', postJson({ modelJson: state.assembly, damageJson: state.damages, userPrompt: el['instruction-input'].value, repairIntent: state.intent, constraints: state.constraints, existingPlan: isReplan ? state.plan : null }));
    state.plan = unwrapGeminiJson(await res.json());
    hydratePlanVersion(state.plan, isReplan ? 'Replan' : 'Generated Plan');
    renderPlan();
    log('Plan ready.');
  } catch (err) { log(`Plan generation failed: ${err.message}`); }
}

function hydratePlanVersion(plan, label='Plan') {
  const id = `plan_v_${state.planVersions.length + 1}`;
  const version = { id, label, savedAt: new Date().toISOString(), plan: JSON.parse(JSON.stringify(plan)) };
  state.planVersions.push(version); state.currentPlanVersionId = id;
  if (!state.currentStepId && plan.steps?.length) {
    const start = plan.steps.find(s => !s.prerequisites || !s.prerequisites.length) || plan.steps[0];
    state.currentStepId = start?.step_id || null;
  }
}
function savePlanVersion(){ if(!state.plan?.steps?.length) return log('No plan to version yet.'); hydratePlanVersion(state.plan, 'Manual Save'); renderPlan(); log('Plan version saved.'); }

function renderPlan() { renderActionGraph(); renderStepList(); updateStepOverlay(); }

function renderActionGraph() {
  const steps = state.plan?.steps || [];
  if (!steps.length) {
    el['action-graph-canvas'].innerHTML = '<div style="padding:16px;color:#666">No plan loaded.</div>';
    return;
  }
  const lines = [
    'digraph G {',
    'rankdir=LR;',
    'graph [pad="0.55", nodesep="0.65", ranksep="0.95", bgcolor="transparent", splines=ortho];',
    'node [shape=circle, fixedsize=true, width=1.65, height=1.65, style="solid,filled", fillcolor="#ffffff", color="#111111", fontname="Helvetica", fontsize=14, margin="0.08,0.08"];',
    'edge [color="#111111", arrowsize=0.8, penwidth=1.2];'
  ];
  const incoming = new Map(steps.map(s => [s.step_id, 0]));
  steps.forEach(step => (step.prerequisites || []).forEach(() => incoming.set(step.step_id, (incoming.get(step.step_id) || 0) + 1)));
  steps.forEach(step => {
    const active = step.step_id === state.currentStepId;
    const done = !!step.completed;
    const optional = !!step.optional || /optional|parallel/i.test(step.description || '');
    const per = incoming.get(step.step_id) > 1 || done ? 2 : 1;
    const displayTitle = step.title || humanizeId(step.step_id);
    const lbl = escapeDot(oneWordPerLine(displayTitle));
    const fill = active ? '#cfe8ff' : '#ffffff';
    const style = optional ? 'dashed,filled' : 'solid,filled';
    lines.push(`"${step.step_id}" [label="${lbl}", style="${style}", peripheries=${per}, penwidth=${active ? 2.8 : 1.5}, fillcolor="${fill}"];`);
  });
  steps.forEach(step => (step.prerequisites || []).forEach(pre => lines.push(`"${pre}" -> "${step.step_id}";`)));
  lines.push('}');
  renderGraphviz(el['action-graph-canvas'], lines.join('
'), (id) => openDetailForStep(id));
}

function oneWordPerLine(text) {
  return String(text || '').trim().split(/\s+/).slice(0, 4).join('\n');
}

function renderSpatialGraph() {
  const parts = state.assembly?.parts || [];
  const damages = state.damages || [];
  if (!parts.length) {
    el['spatial-graph-canvas'].innerHTML = '<div style="padding:16px;color:#666">No assembly loaded.</div>';
    return;
  }
  const lines = ['graph G {', 'layout=neato;', 'overlap=false;', 'splines=true;', 'pad="0.35";', 'nodesep="0.4";', 'bgcolor="transparent";', 'node [shape=box, style="solid", color="#111111", fontname="Helvetica", fontsize=11, margin="0.12,0.08"];', 'edge [color="#444444", penwidth=1.0];'];
  parts.forEach((part, idx) => {
    const fill = part.status === 'missing' ? '#efe7b0' : part.status === 'defective' || part.status === 'damaged' ? '#efc0c0' : part.status === 'new' ? '#efd1ff' : '#ffffff';
    const label = escapeDot(`${part.id}\n(${part.status || 'intact'})`);
    lines.push(`"part:${part.id}" [label="${label}", shape=box, style="filled", fillcolor="${fill}", pos="${(idx%4)*2},${-Math.floor(idx/4)*1.4}!" ];`);
  });
  const seen = new Set();
  parts.forEach(part => (part.connections || []).forEach(conn => {
    const key = [part.id, conn].sort().join('|'); if (seen.has(key)) return; seen.add(key);
    lines.push(`"part:${part.id}" -- "part:${conn}";`);
  }));
  damages.forEach((dmg, idx) => {
    const label = escapeDot((dmg.type || 'damage').toLowerCase());
    const targetIdx = Math.max(parts.findIndex(p => p.id === dmg.part_id), 0);
    const x = (targetIdx%4)*2 - 1.2; const y = -Math.floor(targetIdx/4)*1.4 + 0.8 + (idx%3)*0.6;
    lines.push(`"damage:${dmg.id}" [label="${label}", shape=circle, style="filled", fillcolor="#e99292", pos="${x},${y}!" ];`);
    lines.push(`"damage:${dmg.id}" -- "part:${dmg.part_id}";`);
  });
  lines.push('}');
  renderGraphviz(el['spatial-graph-canvas'], lines.join('\n'), (id) => {
    if (id.startsWith('part:')) openDetailForPart(id.slice(5));
    else if (id.startsWith('damage:')) openDetailForDamage(id.slice(7));
  });
}

function renderGraphviz(container, dot, onClick) {
  container.innerHTML = '';
  const selection = d3.select(container).graphviz({ useWorker: false, zoom: true, fit: false });
  selection.renderDot(dot);
  return new Promise(resolve => {
    selection.on('end', () => {
      normalizeGraphSvg(container);
      attachGraphNodeClicks(container, onClick);
      resolve();
    });
  });
}

function normalizeGraphSvg(container) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  svg.removeAttribute('width'); svg.removeAttribute('height');
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/\s+/).map(Number);
    if (parts.length === 4) {
      svg.style.width = `${parts[2] + 40}px`;
      svg.style.height = `${parts[3] + 40}px`;
    }
  }
}

function attachGraphNodeClicks(container, onClick) {
  container.querySelectorAll('.node').forEach(node => {
    const title = node.querySelector('title')?.textContent;
    if (!title) return;
    node.dataset.nodeId = title;
    node.style.cursor = 'pointer';
    node.querySelectorAll('*').forEach(child => child.style.pointerEvents = 'none');
    node.onclick = () => { if (onClick) onClick(title); };
  });
}

function renderStepList() {
  const wrap = el['step-list']; wrap.innerHTML = '';
  if (state.planVersions.length) {
    const v = state.planVersions[state.planVersions.length - 1];
    const head = document.createElement('div'); head.className = 'step-card';
    head.innerHTML = `<div class="step-title">Current version</div><div class="step-meta">${escapeHtml(v.id)} • ${escapeHtml(v.label)}</div>`;
    wrap.appendChild(head);
  }
  (state.plan?.steps || []).forEach(step => {
    const card = document.createElement('div');
    card.className = `step-card ${step.step_id === state.currentStepId ? 'active' : ''} ${step.completed ? 'done' : ''}`;
    card.innerHTML = `<div class="step-title">${escapeHtml(step.title || step.step_id)}</div><div class="step-meta">Tools: ${escapeHtml((step.tools_required || []).join(', ') || '-')}</div><div class="step-meta">Prerequisites: ${escapeHtml((step.prerequisites || []).join(', ') || 'none')}</div><div class="step-meta">Parts: ${escapeHtml((step.affected_parts || []).join(', ') || '-')}</div>`;
    card.onclick = () => { state.currentStepId = step.step_id; updateStepOverlay(); highlightCurrentStep(); renderStepList(); renderActionGraph(); };
    wrap.appendChild(card);
  });
}

function currentStep() { return (state.plan?.steps || []).find(s => s.step_id === state.currentStepId) || null; }
function updateStepOverlay() {
  const step = currentStep();
  if (!step) { el['step-overlay'].style.display = 'none'; return; }
  el['step-overlay'].style.display = 'block';
  el['step-overlay-title'].textContent = step.title || step.step_id;
  el['step-overlay-body'].textContent = step.description || '';
  el['step-overlay-meta'].textContent = `Tools: ${(step.tools_required || []).join(', ') || '-'} • Prerequisites: ${(step.prerequisites || []).join(', ') || '-'}`;
}
function highlightCurrentStep() {
  partMeshesMap.forEach((mesh,id) => mesh.material = id === state.ui.selectedPartId ? materials.selected : materialForPart(mesh.userData.part.status));
  damageSpheres.forEach(s => s.material = s.userData.damage.id === state.ui.selectedDamageId ? materials.selectedDamage : materials.damage);
  const step = currentStep(); if (!step) return;
  (step.affected_parts || []).forEach(id => { const mesh = partMeshesMap.get(id); if (mesh && id !== state.ui.selectedPartId) mesh.material = materials.stepHighlight; });
  (step.affected_damages || []).forEach(id => { const sphere = damageSpheres.find(s => s.userData.damage?.id === id); if (sphere) sphere.material = materials.selectedDamage; });
}
function startGuidance() { if (!state.plan?.steps?.length) return log('Generate a plan first.'); state.guidanceActive = true; if (!state.currentStepId) state.currentStepId = (state.plan.steps.find(s => !s.prerequisites?.length) || state.plan.steps[0]).step_id; updateStepOverlay(); highlightCurrentStep(); renderStepList(); renderActionGraph(); log('Guidance started.'); }

async function addDamageFromNote() {
  const note = el['instruction-input'].value.trim(); if (!note) return log('Add a note in the instruction field first.');
  const id = `damage_${String(state.damages.length + 1).padStart(2,'0')}`; const partId = state.ui.selectedPartId || state.assembly.parts?.[0]?.id || 'unknown_part';
  const base = state.assembly.parts?.find(p => p.id === partId)?.origin || { x:0, y:0.2, z:0 };
  state.damages.push({ id, type:'Observed Issue', description:note, part_id:partId, coordinates:{ ...base } });
  createDamages(); renderSpatialGraph(); log('Damage note added as a provisional issue.');
}

function openDetailForStep(stepId) {
  const step = (state.plan?.steps || []).find(s => s.step_id === stepId);
  if (!step) return;
  state.currentStepId = stepId;
  state.guidanceActive = true;
  updateStepOverlay();
  highlightCurrentStep();
  renderStepList();
  renderActionGraph();
}
function openDetailForPart(partId) {
  const part = (state.assembly.parts || []).find(p => p.id === partId); if (!part) return;
  state.ui.selectedPartId = partId; state.ui.selectedDamageId = null; apply3DSelection();
}
function openDetailForDamage(damageId) {
  const dmg = (state.damages || []).find(d => d.id === damageId); if (!dmg) return;
  state.ui.selectedDamageId = damageId; state.ui.selectedPartId = dmg.part_id || null; apply3DSelection();
}
function renderDetailModal(title, entries) {
  el['detail-title'].textContent = title;
  el['detail-grid'].innerHTML = entries.map(([label, value]) => `<div class="detail-box"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`).join('');
  openModal(el['detail-modal']);
}

function postJson(body) { return { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) }; }
function unwrapGeminiJson(response) {
  if (!response) throw new Error('Empty response');
  if (response.steps || response.parts || response.updatedModel || response.updatedDamages || response.axes) return response;
  const text = response?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || response?.answer;
  if (!text) throw new Error(response.error || response.message || 'Invalid API response');
  try { return JSON.parse(text); } catch { const match = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (!match) throw new Error('Could not parse JSON from model response'); return JSON.parse(match[0]); }
}
function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
function escapeDot(str) { return String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function multilineLabel(text, maxChars=16) {
  const words = String(text || '').split(/\s+/); let lines=[''];
  words.forEach(word => { const current = lines[lines.length - 1]; if ((current + ' ' + word).trim().length > maxChars && current) lines.push(word); else lines[lines.length - 1] = (current + ' ' + word).trim(); });
  return lines.join('\\n');
}

initDom();
init3D();
syncUiFromState();
renderSpatialGraph();
animate();

function humanizeId(id) { return String(id || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\w/g, c => c.toUpperCase()); }
