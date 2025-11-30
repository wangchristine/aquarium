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
import { ref, onMounted, onBeforeUnmount, reactive } from "vue";
import foodBagImg from "@/assets/foodbag.png";
import { loadGoldfishModel } from "./loaders/fishLoader.js";

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
let handleResize = null;
let goldfishModel = null; // Variable to hold the loaded goldfish model

// 改回使用 reactive 的 aquariumSize，尺寸與 window 連動
const aquariumSize = reactive({
  x: window.innerWidth,
  y: window.innerHeight,
  z: 300,
});

const clock = new THREE.Clock();

function createFish() {
  // Clone the loaded goldfish model
  const fishModelClone = goldfishModel.clone();

  // 使用一個 Group 來作為魚的容器，之後的操作都針對這個 group
  const fishGroup = new THREE.Group();
  fishGroup.add(fishModelClone);
  fishGroup.name = "fish"; // 為 group 命名

  // 在水族箱範圍內隨機生成
  fishGroup.position.set(
    (Math.random() - 0.5) * aquariumSize.x,
    (Math.random() - 0.5) * aquariumSize.y,
    (Math.random() - 0.5) * aquariumSize.z
  );
  return {
    mesh: fishGroup, // 返回 group 作為操作對象
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
    isFleeing: 0, // 吃完飼料後的逃離計時器
  };
}

function createFood(pos) {
  const geometry = new THREE.SphereGeometry(4, 8, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(pos);
  return { mesh, eaten: false };
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
    (Math.random() - 0.5) * aquariumSize.x * 0.9,
    -aquariumSize.y / 2,
    (Math.random() - 0.5) * aquariumSize.z * 0.9
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
    // 飼料模式: 投射到 Z=0 平面
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
      // Clamp X and Y to the aquarium bounds
      intersectPoint.x = Math.max(
        -aquariumSize.x / 2,
        Math.min(aquariumSize.x / 2, intersectPoint.x)
      );
      intersectPoint.y = Math.max(
        -aquariumSize.y / 2,
        Math.min(aquariumSize.y / 2, intersectPoint.y)
      );

      // Z 座標由與 Z=0 平面的交點決定，即為 0

      const food = createFood(intersectPoint);
      scene.add(food.mesh);
      foods.push(food);
    }
  } else {
    // 點擊魚模式
    const intersects = raycaster.intersectObjects(fishes.map((f) => f.mesh));
    if (intersects.length > 0) {
      const fishGroup = intersects[0].object.parent;
      if (fishGroup && fishGroup.name === "fish") {
        const intersectedFish = fishes.find((f) => f.mesh === fishGroup);
        if (intersectedFish) {
          intersectedFish.showBubble = true;
          intersectedFish.bubbleText =
            cuteSayings[Math.floor(Math.random() * cuteSayings.length)];
          intersectedFish.bubbleTimer = 0;
        }
      }
    }
  }
}

function animate() {
  const delta = clock.getDelta();

  fishes.forEach((fish, index) => {
    fish.isFleeing = Math.max(0, fish.isFleeing - delta);
    // 魚群行為：避開其他魚
    const distToFood = fish.targetFood
      ? fish.mesh.position.distanceTo(fish.targetFood.mesh.position)
      : Infinity;

    // 只有在離食物較遠時才進行避讓，搶食時(距離小於30)則專心衝刺
    if (distToFood > 30) {
      const avoidance = new THREE.Vector3();
      const avoidanceRadius = 50; // 避開的半徑
      let neighborCount = 0;
      for (let i = 0; i < fishes.length; i++) {
        if (i === index) continue;
        const otherFish = fishes[i];
        const dist = fish.mesh.position.distanceTo(otherFish.mesh.position);
        if (dist < avoidanceRadius) {
          let away = new THREE.Vector3().subVectors(
            fish.mesh.position,
            otherFish.mesh.position
          );
          // If fish are perfectly overlapped, give them a random nudge
          if (away.lengthSq() === 0) {
            away.set(
              Math.random() - 0.5,
              Math.random() - 0.5,
              Math.random() - 0.5
            );
          }
          avoidance.add(away);
          neighborCount++;
        }
      }
      if (neighborCount > 0) {
        avoidance.divideScalar(neighborCount);
        if (avoidance.lengthSq() > 0) {
          avoidance.normalize();
          fish.direction.lerp(avoidance, 0.05); // 輕微地轉向避開
        }
      }
    }

    const hadTarget = !!fish.targetFood;
    // 找食物
    if (fish.isFleeing <= 0 && fish.hunger > 0.15 && foods.length > 0) {
      let nearestFood = null;
      let nearestDist = Infinity;
      // 使用魚嘴的位置來找最近的食物
      const mouthOffsetFind = new THREE.Vector3(0, -10, 35);
      const mouthPositionFind = fish.mesh.localToWorld(mouthOffsetFind.clone());
      for (const food of foods) {
        const dist = mouthPositionFind.distanceTo(food.mesh.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestFood = food;
        }
      }
      fish.targetFood = nearestFood;
    } else if (fish.isFleeing > 0) {
      // is fleeing, do not look for food
    } else {
      fish.targetFood = null;
    }

    // 如果飼料被搶走，立即重新導向
    if (hadTarget && !fish.targetFood) {
      const randomDir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 2
      ).normalize();
      fish.direction.lerp(randomDir, 0.2);
    }

    if (fish.targetFood && fish.hunger > 0.15) {
      // 游向食物
      const dir = new THREE.Vector3()
        .subVectors(fish.targetFood.mesh.position, fish.mesh.position)
        .normalize();
      fish.direction.lerp(dir, 0.08);

      // 計算嘴巴到食物的距離來判斷是否吃到
      const mouthOffsetEat = new THREE.Vector3(0, -10, 35);
      const mouthPositionEat = fish.mesh.localToWorld(mouthOffsetEat.clone());
      const distToEat = mouthPositionEat.distanceTo(
        fish.targetFood.mesh.position
      );

      if (distToEat < 6) {
        // 吃飼料
        if (fish.hunger > 0.15 && !fish.targetFood.eaten) {
          fish.hunger = Math.max(0, fish.hunger - 0.5);
          fish.targetFood.eaten = true; // 標記為被吃掉，但不立即移除
          fish.targetFood = null;
          fish.isFleeing = 1.2; // 設定1.2秒的「逃離」狀態

          // 吃完後，平滑地轉向一個新方向
          const randomDir = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 0.2, // 維持原本的隨機垂直移動
            (Math.random() - 0.5) * 2
          ).normalize();
          // 使用 lerp 平滑轉向，0.1 的係數表示一個較緩的自然轉彎
          fish.direction.lerp(randomDir, 0.1);

          fish.showBubble = true;
          fish.bubbleText = "吃飽飽，耶！";
          fish.bubbleType = "feed";
          fish.bubbleTimer = 0;
        } else if (fish.targetFood.eaten) {
          // 如果食物已經被吃掉，就放棄目標
          fish.targetFood = null;
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
    }

    // --- 統一更新位置與姿態 ---
    let speedFactor = 1.0;
    const maxSpeed = 1.8;
    const defaultSpeed = 1.0;

    if (fish.isFleeing > 0) {
      // 剛吃完，維持較高速度游開
      speedFactor = maxSpeed;
    } else if (fish.targetFood) {
      const dist = fish.mesh.position.distanceTo(fish.targetFood.mesh.position);
      const slowingRadius = 150; // 在這個半徑內，魚會開始反應
      if (dist < slowingRadius) {
        // 當靠近食物時，平滑地加速
        speedFactor =
          defaultSpeed +
          (maxSpeed - defaultSpeed) * (1.0 - dist / slowingRadius);
      } else {
        speedFactor = defaultSpeed;
      }
    }

    fish.mesh.position.addScaledVector(
      fish.direction,
      fish.speed * delta * speedFactor
    );
    // fish.mesh.lookAt(fish.mesh.position.clone().add(fish.direction));

    // -- 平滑旋轉 --
    // 1. 計算目標旋轉 (一個四元數)
    const targetQuaternion = new THREE.Quaternion();
    const dummy = new THREE.Object3D();
    dummy.lookAt(fish.direction);
    targetQuaternion.copy(dummy.quaternion);

    // 2. 使用 slerp 平滑地插值到目標旋轉
    fish.mesh.quaternion.slerp(targetQuaternion, 0.05);

    // --- 邊界處理 ---
    const p = fish.mesh.position;
    const margin = 15; // 因為魚會傾斜，邊界計算需要基於魚的中心點
    const bounds = {
      left: -aquariumSize.x / 2 + margin,
      right: aquariumSize.x / 2 - margin,
      top: aquariumSize.y / 2 - margin,
      bottom: -aquariumSize.y / 2 + margin,
      back: -aquariumSize.z / 2 + margin,
      front: aquariumSize.z / 2 - margin,
    };

    const steer = new THREE.Vector3();
    let isSteering = false;
    if (p.x < bounds.left) {
      steer.x = 1;
      isSteering = true;
    }
    if (p.x > bounds.right) {
      steer.x = -1;
      isSteering = true;
    }
    if (p.y < bounds.bottom) {
      steer.y = 1;
      isSteering = true;
    }
    if (p.y > bounds.top) {
      steer.y = -1;
      isSteering = true;
    }
    if (p.z < bounds.back) {
      steer.z = 1;
      isSteering = true;
    }
    if (p.z > bounds.front) {
      steer.z = -1;
      isSteering = true;
    }

    if (isSteering) {
      // 碰到邊界時，讓轉向帶點隨機性，更自然
      steer.add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 1.5, // 增加水平隨機性
          (Math.random() - 0.5) * 0.2, // 減少垂直隨機性
          (Math.random() - 0.5) * 1.5 // 增加水平隨機性
        )
      );
      steer.normalize();
      fish.direction.lerp(steer, 0.2);
    }

    // 確保魚不會超出邊界
    p.x = Math.max(bounds.left, Math.min(bounds.right, p.x));
    p.y = Math.max(bounds.bottom, Math.min(bounds.top, p.y));
    p.z = Math.max(bounds.back, Math.min(bounds.front, p.z));

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

  // 更新飼料狀態（下沉、移除被吃掉的）
  foods = foods.filter((food) => {
    if (food.eaten) {
      scene.remove(food.mesh); // 在此處統一移除被吃掉的食物
      return false;
    }
    const bottomBoundary = -aquariumSize.y / 2;
    // 飼料下沉
    if (food.mesh.position.y > bottomBoundary) {
      food.mesh.position.y -= 30 * delta;
      if (food.mesh.position.y < bottomBoundary) {
        food.mesh.position.y = bottomBoundary; // 觸底
      }
    }

    // 如果飼料在底部，一段時間後移除
    if (food.mesh.position.y === bottomBoundary) {
      food.restTimer = (food.restTimer || 0) + delta;
      if (food.restTimer > 20) { // 20秒後消失
        scene.remove(food.mesh);
        return false;
      }
    }
    return true;
  });

  // 氣泡上升
  bubbles.forEach((bubble) => {
    bubble.mesh.position.y += bubble.mesh.userData.speed * delta;
    if (bubble.mesh.position.y > aquariumSize.y / 2) {
      bubble.mesh.position.set(
        (Math.random() - 0.5) * aquariumSize.x * 0.9,
        -aquariumSize.y / 2,
        (Math.random() - 0.5) * aquariumSize.z * 0.9
      );
    }
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

let boxMesh, boxHelper;

onMounted(async () => {
  // Load the model first
  try {
    goldfishModel = await loadGoldfishModel();
  } catch (error) {
    console.error("Failed to load goldfish model, using fallback cube.", error);
    // As a fallback, create a simple cube geometry so the app doesn't crash
    const fallbackGeo = new THREE.BoxGeometry(60, 30, 20);
    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
    goldfishModel = new THREE.Group();
    const body = new THREE.Mesh(fallbackGeo, fallbackMat);
    body.rotation.y = -Math.PI / 2;
    goldfishModel.add(body);
  }

  scene = new THREE.Scene();
  const aspect = window.innerWidth / window.innerHeight;

  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 5000);
  // 動態計算攝影機距離，並拉遠 20% 以創造邊界
  const fov = 75;
  let distance = (aquariumSize.y / 2) / Math.tan((fov / 2) * (Math.PI / 180));
  distance *= 1.2;
  camera.position.set(0, 0, distance);

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
  boxMesh = new THREE.Mesh(boxGeo, boxMat);
  scene.add(boxMesh);

  // 新增 BoxHelper 來繪製邊框
  boxHelper = new THREE.BoxHelper(boxMesh, 0x000000);
  scene.add(boxHelper);

  // 光源
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);

  // 移除 XYZ 軸輔助線
  // const axesHelper = new THREE.AxesHelper(500);
  // scene.add(axesHelper);

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

  handleResize = () => {
    aquariumSize.x = window.innerWidth;
    aquariumSize.y = window.innerHeight;

    camera.aspect = window.innerWidth / window.innerHeight;
    const fov = 75;
    let distance = (aquariumSize.y / 2) / Math.tan((fov / 2) * (Math.PI / 180));
    distance *= 1.2;
    camera.position.z = distance;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    boxMesh.geometry.dispose();
    boxMesh.geometry = new THREE.BoxGeometry(
      aquariumSize.x,
      aquariumSize.y,
      aquariumSize.z
    );
    boxHelper.update();
  };
  window.addEventListener("resize", handleResize);

  animate();

  // 確保頁面載入時游標為預設狀態
  document.body.style.cursor = "auto";
});

onBeforeUnmount(() => {
  if (handleResize) {
    window.removeEventListener("resize", handleResize);
  }
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