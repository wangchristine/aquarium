import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const info = document.querySelector("#info");
const clock = new THREE.Clock();
let mixer = null;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172333);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));

const keyLight = new THREE.DirectionalLight(0xffffff, 3);
keyLight.position.set(200, 300, 400);
scene.add(keyLight);

const axesHelper = new THREE.AxesHelper(100);
scene.add(axesHelper);

const gridHelper = new THREE.GridHelper(400, 20, 0x6688aa, 0x334455);
gridHelper.rotation.x = Math.PI / 2;
scene.add(gridHelper);

const loader = new GLTFLoader();
loader.load(
  "/koi_fish.glb",
  (gltf) => {
    const model = gltf.scene;
    // 將魚模型在水平面上旋轉 270 度，讓魚頭朝向相機
    // model.rotation.y = (Math.PI * 3) / 2;
    model.rotation.y = Math.PI * 2;
    scene.add(model);

    // 播放 GLB 內建的游泳動畫
    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(gltf.animations[0]).play();
    }

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    model.position.sub(center);

    const distance = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.position.set(0, maxDim * 0.15, distance * 1.4);
    camera.lookAt(0, 0, 0);

    const modelBox = new THREE.Box3().setFromObject(model);
    const modelSize = modelBox.getSize(new THREE.Vector3());
    info.innerHTML = `fish2 載入成功<br>原始尺寸：${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)}<br>目前畫面尺寸：${modelSize.x.toFixed(1)} × ${modelSize.y.toFixed(1)} × ${modelSize.z.toFixed(1)}`;
  },
  undefined,
  (error) => {
    console.error(error);
    info.textContent = "fish2 載入失敗，請查看瀏覽器主控台。";
  },
);

function animate() {
  requestAnimationFrame(animate);
  if (mixer) {
    mixer.update(clock.getDelta());
  }
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
