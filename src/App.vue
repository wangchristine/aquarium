<template>
  <div class="container">
    <div
      ref="canvasContainer"
      :class="{ 'feeding-cursor': feedingMode }"
      class="canvas-container"
      @click="onCanvasClick"
    >
      <!-- 魚頭上的對話泡泡 -->
      <template v-for="fish in fishes">
        <div
          v-if="fish.showBubble"
          :key="fish.mesh.id"
          class="bubble-dialog"
          :style="bubbleStyle(fish)"
        >
          {{ fish.bubbleText }}
        </div>
      </template>
    </div>
    <button @click="toggleFeeding" class="feed-btn">
      <img :src="foodBagImg" alt="Feed" />
    </button>
  </div>
</template>

<script setup>
import * as THREE from "three";
import { ref, onMounted, onBeforeUnmount, reactive, nextTick } from "vue";
import foodBagImg from "@/assets/foodbag.png";

// 可愛對話集
const cuteSayings = [
  "嗨嗨！",
  "今天心情好好魚～",
  "有吃的嗎？",
  "游來游去真開心",
  "我肚子餓了",
  "你今天也要加油喔",
  "泡泡好好玩",
  "我最可愛",
  "來玩呀！",
];

const feedingMode = ref(false);
const canvasContainer = ref(null);

let scene, camera, renderer;
let foods = [];
let bubbles = [];
const fishes = reactive([]);

const aquariumSize = reactive({
  x: window.innerWidth,
  y: window.innerHeight,
  z: 300,
});
const clock = new THREE.Clock();

function createFish() {
  const geometry = new THREE.BoxGeometry(60, 30, 20);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    roughness: 0.5,
    metalness: 0.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "fish"; // 為魚的 mesh 命名
  mesh.position.set(
    (Math.random() - 0.5) * aquariumSize.x,
    (Math.random() - 0.5) * aquariumSize.y,
    (Math.random() - 0.5) * aquariumSize.z
  );
  return {
    mesh,
    speed: 50 + Math.random() * 50, // 增加基礎速度和隨機範圍
    hunger: Math.random() * 0.8 + 0.2, // 0 = 吃飽，1 = 最餓
    targetFood: null,
    direction: new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize(),
    bubbleTimer: 0,
    showBubble: false,
    bubbleText: "",
    bubbleType: "", // 'greet' 或 'feed'
  };
}

function createFood(pos) {
  const geometry = new THREE.SphereGeometry(4, 8, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(pos);
  return { mesh };
}

function createBubble() {
  const geometry = new THREE.SphereGeometry(3, 8, 8);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    (Math.random() - 0.5) * aquariumSize.x * 0.8,
    -aquariumSize.y / 2,
    (Math.random() - 0.5) * aquariumSize.z * 0.8
  );
  mesh.userData.speed = 10 + Math.random() * 10;
  return { mesh };
}

function toggleFeeding(event) {
  event.stopPropagation();
  feedingMode.value = !feedingMode.value;
}

function onCanvasClick(event) {
  const rect = canvasContainer.value.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  if (feedingMode.value) {
    // 飼料模式
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
      intersectPoint.x = Math.max(
        -aquariumSize.x / 2,
        Math.min(aquariumSize.x / 2, intersectPoint.x)
      );
      intersectPoint.y = Math.max(
        -aquariumSize.y / 2,
        Math.min(aquariumSize.y / 2, intersectPoint.y)
      );
      const food = createFood(intersectPoint);
      scene.add(food.mesh);
      foods.push(food);
    }
  } else {
    // 點擊魚模式
    const intersects = raycaster.intersectObjects(fishes.map((f) => f.mesh));
    if (intersects.length > 0 && intersects[0].object.name === "fish") {
      console.log(121);

      const intersectedFish = fishes.find(
        (f) => f.mesh === intersects[0].object
      );
      if (intersectedFish) {
        intersectedFish.showBubble = true;
        intersectedFish.bubbleText =
          cuteSayings[Math.floor(Math.random() * cuteSayings.length)];
        intersectedFish.bubbleTimer = 0;
      }
    }
  }
}

function animate() {
  const delta = clock.getDelta();

  fishes.forEach((fish, index) => {
    // 魚群行為：避開其他魚
    const avoidance = new THREE.Vector3();
    const avoidanceRadius = 50; // 避開的半徑
    let neighborCount = 0;
    for (let i = 0; i < fishes.length; i++) {
      if (i === index) continue;
      const otherFish = fishes[i];
      const dist = fish.mesh.position.distanceTo(otherFish.mesh.position);
      if (dist < avoidanceRadius) {
        const away = new THREE.Vector3().subVectors(
          fish.mesh.position,
          otherFish.mesh.position
        );
        avoidance.add(away);
        neighborCount++;
      }
    }
    if (neighborCount > 0) {
      avoidance.divideScalar(neighborCount);
      avoidance.normalize();
      fish.direction.lerp(avoidance, 0.05); // 輕微地轉向避開
    }

    // 找食物
    if (fish.hunger > 0.15 && foods.length > 0) {
      let nearestFood = null;
      let nearestDist = Infinity;
      for (const food of foods) {
        const dist = fish.mesh.position.distanceTo(food.mesh.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestFood = food;
        }
      }
      fish.targetFood = nearestFood;
    } else {
      fish.targetFood = null;
    }

    if (fish.targetFood && fish.hunger > 0.15) {
      // 游向食物
      const dir = new THREE.Vector3()
        .subVectors(fish.targetFood.mesh.position, fish.mesh.position)
        .normalize();
      fish.direction.lerp(dir, 0.08);
      const dist = fish.mesh.position.distanceTo(fish.targetFood.mesh.position);
      const speedFactor = dist < 80 ? 2.5 : 1.5; // 靠近時加速
      fish.mesh.position.addScaledVector(
        fish.direction,
        fish.speed * delta * speedFactor
      );
      fish.mesh.rotation.y = fish.direction.x < 0 ? Math.PI : 0;

      if (dist < 10) {
        // 吃飼料
        if (fish.hunger > 0.15) {
          fish.hunger = Math.max(0, fish.hunger - 0.5);
          scene.remove(fish.targetFood.mesh);
          foods.splice(foods.indexOf(fish.targetFood), 1);
          fish.targetFood = null;
          fish.showBubble = true;
          fish.bubbleText = "吃飽飽，耶！";
          fish.bubbleType = "feed";
          fish.bubbleTimer = 0;
        }
      }
    } else {
      // 隨機游動
      if (Math.random() < 0.01) {
        // 降低轉向頻率
        const randomDir = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 0.2, // 大幅減少垂直移動
          (Math.random() - 0.5) * 2
        ).normalize();
        fish.direction.lerp(randomDir, 0.1);
      }
      fish.mesh.position.addScaledVector(fish.direction, fish.speed * delta);
      fish.mesh.rotation.y = fish.direction.x < 0 ? Math.PI : 0;
    }

    // 邊界反彈
    const p = fish.mesh.position;
    const bounceFactor = -1.2; // 增加反彈力道
    if (p.x < -aquariumSize.x / 2 || p.x > aquariumSize.x / 2) {
      fish.direction.x *= bounceFactor;
      p.x = Math.max(-aquariumSize.x / 2, Math.min(aquariumSize.x / 2, p.x));
    }
    if (p.y < -aquariumSize.y / 2 || p.y > aquariumSize.y / 2) {
      fish.direction.y *= bounceFactor;
      p.y = Math.max(-aquariumSize.y / 2, Math.min(aquariumSize.y / 2, p.y));
    }
    if (p.z < -aquariumSize.z / 2 || p.z > aquariumSize.z / 2) {
      fish.direction.z *= bounceFactor;
      p.z = Math.max(-aquariumSize.z / 2, Math.min(aquariumSize.z / 2, p.z));
    }

    // 飢餓度
    fish.hunger = Math.min(1, fish.hunger + delta * 0.03);

    // 對話泡泡計時
    if (fish.showBubble) {
      fish.bubbleTimer += delta;
      if (fish.bubbleTimer > 2) {
        // 顯示 2 秒
        fish.showBubble = false;
      }
    }
  });

  // 飼料下沉
  foods.forEach((food, index) => {
    food.mesh.position.y -= 30 * delta; // 增加下沉速度
    if (food.mesh.position.y < -aquariumSize.y / 2) {
      scene.remove(food.mesh);
      foods.splice(index, 1);
    }
  });

  // 氣泡上升
  bubbles.forEach((bubble) => {
    bubble.mesh.position.y += bubble.mesh.userData.speed * delta;
    if (bubble.mesh.position.y > aquariumSize.y / 2) {
      bubble.mesh.position.set(
        (Math.random() - 0.5) * aquariumSize.x * 0.8,
        -aquariumSize.y / 2,
        (Math.random() - 0.5) * aquariumSize.z * 0.8
      );
    }
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

let boxMesh;

onMounted(() => {
  scene = new THREE.Scene();

  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 600;
  camera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2,
    1,
    1000
  );
  camera.position.set(0, 0, 500);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasContainer.value.appendChild(renderer.domElement);

  // 水族箱立方體(透明玻璃)
  const boxGeo = new THREE.BoxGeometry(
    aquariumSize.x,
    aquariumSize.y,
    aquariumSize.z
  );
  const boxMat = new THREE.MeshPhysicalMaterial({
    color: 0x55aaff,
    opacity: 0.15,
    transparent: true,
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0,
    side: THREE.BackSide,
  });
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  scene.add(boxMesh);

  // 光源
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);

  // 產生魚
  for (let i = 0; i < 5; i++) {
    const fish = createFish();
    scene.add(fish.mesh);
    fishes.push(fish);
  }

  // 產生氣泡
  for (let i = 0; i < 20; i++) {
    const bubble = createBubble();
    scene.add(bubble.mesh);
    bubbles.push(bubble);
  }

  window.addEventListener("resize", () => {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 600;
    camera.left = (frustumSize * aspect) / -2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    aquariumSize.x = window.innerWidth;
    aquariumSize.y = window.innerHeight;

    if (boxMesh) {
      boxMesh.scale.set(aquariumSize.x / 600, aquariumSize.y / 400, 1);
    }
  });

  animate();

  // 確保頁面載入時游標為預設狀態
  document.body.style.cursor = "auto";
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", () => {});
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
  }
  // 確保游標還原
  document.body.style.cursor = "auto";
});

// 對話泡泡定位函數
function bubbleStyle(fish) {
  if (!renderer || !camera) return {};
  // 計算魚頭上方位置的屏幕座標
  const pos = fish.mesh.position.clone();
  pos.y += 18; // 往上偏移一點
  const vector = pos.project(camera);
  const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

  return {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    transform: "translate(-50%, -100%)",
    background: "rgba(255,255,255,0.9)",
    padding: "6px 14px",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    border: "1.5px solid #bde",
    color: "#333",
    fontSize: "1.1em",
    fontFamily: "cursive",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 100, // 確保在最上層
  };
}
</script>

<style>
@import "@/assets/base.css";

.container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.canvas-container {
  width: 100%;
  height: 100%;
  display: block;
  cursor: auto;
}

.canvas-container.feeding-cursor {
  cursor: url("@/assets/foodbag.png"), auto;
}

.feed-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  /* background: transparent; */
  border: 1px solid;
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  z-index: 10;
}
.feed-btn img {
  width: 48px;
  height: auto;
}
</style>
