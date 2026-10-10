// Amara in the homepage header: toon-shaded, ink-outlined, watches the cursor and reacts to taps.
// Modeled, rigged and animated in Blender by KiteRandel.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('amara');
const bubble = document.getElementById('bubble');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fail = (e) => { if (e) console.error(e); stage.classList.add('failed'); };

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { fail(e); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const camBase = new THREE.Vector3(0, 0.98, 3.7);
  const lookAt = new THREE.Vector3(0, 0.84, 0);
  camera.position.copy(camBase);

  // lighting: warm key + the site's pink / cyan as rim lights so she sits in the page
  scene.add(new THREE.HemisphereLight(0xfff2f8, 0x3a2050, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(1.5, 2.5, 3); scene.add(key);
  const rimP = new THREE.DirectionalLight(0xff4fa3, 2.2); rimP.position.set(-3, 2, -2.5); scene.add(rimP);
  const rimC = new THREE.DirectionalLight(0x3ff2ff, 1.6); rimC.position.set(3, 1.2, -3); scene.add(rimC);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.16, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; scene.add(disc);

  // 3-step toon ramp, the same look as Paper Moths
  const ramp = new THREE.DataTexture(new Uint8Array([120, 195, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;

  // ink outline: a back-faced copy of the skinned mesh pushed out along its normals
  const inkMat = new THREE.MeshBasicMaterial({ color: 0x2a1626, side: THREE.BackSide });
  inkMat.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = { value: 0.0065 };
    sh.vertexShader = 'uniform float uInk;\n' + sh.vertexShader.replace('#include <project_vertex>',
      'transformed += normalize(objectNormal) * uInk;\n#include <project_vertex>');
  };

  // ---- state
  let model = null, mixer = null, head = null, neck = null;
  const actions = {}; let current = null, busy = false;
  const look = { x: 0, y: 0, tx: 0, ty: 0, last: -1e9 };   // head-follow (radians)
  const par = { x: 0, y: 0 };                              // camera parallax
  let squash = 0, visible = true, greeted = false, pointed = false;

  // ---- speech bubble
  let bubbleT = 0;
  function say(text, secs = 2.4) { bubble.textContent = text; bubble.classList.add('on'); bubbleT = secs; }

  // ---- animation helpers
  function play(name, { once = true, reps = 1, fade = 0.25 } = {}) {
    const a = actions[name]; if (!a) return;
    if (current && current !== a) current.fadeOut(fade);
    a.reset(); a.enabled = true; a.setEffectiveWeight(1);
    if (once) { a.setLoop(reps > 1 ? THREE.LoopRepeat : THREE.LoopOnce, reps); a.clampWhenFinished = true; busy = true; }
    else a.setLoop(THREE.LoopRepeat, Infinity);
    a.fadeIn(fade).play(); current = a;
  }
  function backToIdle() { busy = false; play('Idle', { once: false, fade: 0.35 }); }

  const reactions = [
    () => { play('Wave'); say('hi there! 👋'); },
    () => { play('Jump'); say('hup!'); },
    () => { play('Hit'); squash = 1; say('eep! that tickles'); },
    () => { play('Dance', { reps: 2 }); say('♪ ♫ ♪', 3.6); },
  ];
  let nextReaction = 0;
  function react() {
    if (!model) return;
    if (busy) { squash = 1; return; }
    reactions[nextReaction](); nextReaction = (nextReaction + 1) % reactions.length;
  }
  function pointAtProjects() { if (!model || busy) return; play('Point'); say('my projects are down here!', 2.6); }

  // ---- load Amara
  new GLTFLoader().load('amara.glb', (gltf) => {
    model = gltf.scene;
    const outlines = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const old = o.material;
      o.material = new THREE.MeshToonMaterial({ map: old.map, gradientMap: ramp, color: 0xffffff, emissive: new THREE.Color(0x2a1430), emissiveIntensity: 0.3 });
      if (o.isSkinnedMesh) outlines.push(o);
    });
    for (const m of outlines) {
      const ink = new THREE.SkinnedMesh(m.geometry, inkMat);
      ink.position.copy(m.position); ink.quaternion.copy(m.quaternion); ink.scale.copy(m.scale);
      ink.bind(m.skeleton, m.bindMatrix); ink.frustumCulled = false; m.parent.add(ink);
    }
    // stand her on the disc at ~1.6 units tall
    const box = new THREE.Box3().setFromObject(model);
    const s = 1.6 / (box.max.y - box.min.y); model.scale.setScalar(s); model.userData.s0 = s;
    const b2 = new THREE.Box3().setFromObject(model); const c = b2.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -b2.min.y, -c.z);
    scene.add(model);
    head = model.getObjectByName('Head'); neck = model.getObjectByName('Neck');

    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    mixer.addEventListener('finished', backToIdle);
    play('Idle', { once: false, fade: 0 });
    stage.classList.add('ready');
    if (!reduced) setTimeout(() => { if (!greeted && visible) { greeted = true; play('Wave'); say("hi, I'm Amara!", 2.6); } }, 700);
  }, undefined, fail);

  // ---- input: head follows the cursor anywhere on the page, or the last touch
  function aim(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const hx = r.left + r.width / 2, hy = r.top + r.height * 0.22;          // roughly where her face is
    const dx = (clientX - hx) / Math.max(innerWidth * 0.5, 300);
    const dy = (clientY - hy) / Math.max(innerHeight * 0.5, 300);
    look.tx = THREE.MathUtils.clamp(dx, -1, 1) * 0.6;    // yaw
    look.ty = THREE.MathUtils.clamp(dy, -1, 1) * 0.35;   // pitch
    look.last = performance.now();
  }
  addEventListener('pointermove', (e) => aim(e.clientX, e.clientY), { passive: true });
  addEventListener('pointerdown', (e) => aim(e.clientX, e.clientY), { passive: true });

  const ray = new THREE.Raycaster(); let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!model || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    // generous hit area: anywhere on her bounding box counts
    const box = new THREE.Box3().setFromObject(model).expandByScalar(0.08);
    if (ray.ray.intersectsBox(box)) react();
  });
  canvas.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); react(); } });
  canvas.tabIndex = 0;

  document.getElementById('seeProjects')?.addEventListener('pointerenter', () => { pointAtProjects(); pointed = true; });
  addEventListener('scroll', () => {
    if (pointed || reduced) return;
    const r = stage.getBoundingClientRect();
    if (scrollY > 40 && r.top > -r.height * 0.45) { pointed = true; pointAtProjects(); }
  }, { passive: true });

  // ---- head look: rotate Neck then Head in world space, on top of the animation
  const qW = new THREE.Quaternion(), qP = new THREE.Quaternion(), qD = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  function turn(bone, yaw, pitch) {
    bone.getWorldQuaternion(qW);
    bone.parent.getWorldQuaternion(qP);
    qD.setFromEuler(eul.set(pitch, yaw, 0));
    qW.premultiply(qD);
    bone.quaternion.copy(qP.invert().multiply(qW));
    bone.updateMatrixWorld(true);
  }

  // ---- render loop (paused while the header is off screen)
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  };
  const clock = new THREE.Clock();
  const v = new THREE.Vector3();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    resize();
    if (mixer) mixer.update(dt);
    if (model) {
      // drift back to the front if the cursor has been still for a while
      if (performance.now() - look.last > 4000) { look.tx *= 0.98; look.ty *= 0.98; }
      const k = 1 - Math.exp(-dt * 6);
      look.x += (look.tx - look.x) * k; look.y += (look.ty - look.y) * k;
      const lookAmt = current === actions.Dance ? 0.35 : 1;   // let the dance keep its own head bob
      model.updateMatrixWorld(true);
      if (neck) turn(neck, look.x * 0.35 * lookAmt, look.y * 0.3 * lookAmt);
      if (head) turn(head, look.x * 0.65 * lookAmt, look.y * 0.7 * lookAmt);

      squash = Math.max(0, squash - dt * 2.4);
      const w = Math.sin(squash * Math.PI * 4) * squash;
      const s0 = model.userData.s0;
      model.scale.set(s0 * (1 + w * 0.12), s0 * (1 - w * 0.14), s0 * (1 + w * 0.12));

      // keep the speech bubble beside her head
      if (head) {
        head.getWorldPosition(v); v.y += 0.32; v.x += 0.05; v.project(camera);
        bubble.style.left = `${(v.x * 0.5 + 0.5) * canvas.clientWidth}px`;
        const minTop = Math.max(0, -canvas.getBoundingClientRect().top) + 44;   // never above the top of the window
        bubble.style.top = `${Math.max((-v.y * 0.5 + 0.5) * canvas.clientHeight, minTop)}px`;
      }
    }
    if (bubbleT > 0) { bubbleT -= dt; if (bubbleT <= 0) bubble.classList.remove('on'); }

    // gentle camera parallax with the cursor
    par.x += (look.x * 0.25 - par.x) * 0.05; par.y += (look.y * 0.12 - par.y) * 0.05;
    camera.position.set(camBase.x + par.x, camBase.y - par.y, camBase.z);
    camera.lookAt(lookAt);
    disc.material.opacity = 0.12 + Math.sin(t * 2.5) * 0.04;
    renderer.render(scene, camera);
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    renderer.setAnimationLoop(visible ? frame : null);
    if (!visible) clock.getDelta();
  });
  io.observe(stage);
  renderer.setAnimationLoop(frame);

  // small hook for automated checks
  window.amaraHero = { get ready() { return !!model; }, react, pointAtProjects, get state() { return { anim: Object.keys(actions).find((n) => actions[n] === current), busy, look: [+look.x.toFixed(2), +look.y.toFixed(2)], bubble: bubble.classList.contains('on') ? bubble.textContent : '' }; } };
}
