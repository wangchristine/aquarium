<template>
  <div class="container">
    <div
      ref="canvasContainer"
      :class="{ 'feeding-cursor': feedingMode }"
      :style="{ '--aquarium-wallpaper': `url(${aquariumWallpaper})` }"
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
    <div class="control-panel" aria-label="水族箱控制項">
      <button
        class="control-btn feed-btn"
        :class="{ active: feedingMode }"
        @click="toggleFeeding"
        :aria-pressed="feedingMode"
      >
        <img :src="foodBagImg" alt="" />
        <span>投餵飼料</span>
      </button>
      <button
        class="control-btn edge-btn"
        :class="{ active: showTankEdges }"
        @click="toggleTankEdges"
        :aria-pressed="showTankEdges"
      >
        <span class="edge-icon" aria-hidden="true">◇</span>
        <span>水箱邊框</span>
        <span class="control-state">{{ showTankEdges ? "開" : "關" }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import * as THREE from "three";
import { ref, onMounted, onBeforeUnmount, reactive } from "vue";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import foodBagImg from "@/assets/foodbag.png";
import aquariumWallpaper from "@/assets/aquarium-wallpaper.jpg";
import { loadGuppyFishModel } from "./loaders/fishLoader.js";

const clickSayings = [
  "嗨嗨！",
  "今天心情好好魚～",
  "有吃的嗎？",
  "游來游去真開心",
  "我肚子餓了",
  "你今天也要加油喔",
  "咕嚕咕嚕",
  "(吐出一個小泡泡)",
  "來玩呀！",
  "你好呀",
  "你找到我了！",
  "一起游泳吧",
  "今天水裡很舒服",
];

const eatSayings = [
  "吃飽飽，耶！",
  "嚼嚼嚼...味道真不錯！",
  "嗝～滿足～",
  "一口接一口！",
  "超好吃～",
];

const feedingMode = ref(false);
const showTankEdges = ref(false);
const canvasContainer = ref(null);

let scene, camera, renderer;
let foods = [];
let bubbles = [];
let fishRaycastTargets = [];
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
const clickRaycaster = new THREE.Raycaster();
const clickMouse = new THREE.Vector2();
let animationFrameId = null;

const baseFishSize = 180;

function getFishScale() {
  const targetFishSize = Math.min(aquariumSize.x, aquariumSize.y) * 0.45 * 1.5;
  return targetFishSize / baseFishSize;
}

function createFreeSwimDirection() {
  const direction = new THREE.Vector3(
    Math.random() - 0.5,
    0,
    Math.random() - 0.5,
  ).normalize();

  // 自由游動時只保留少量上下角度，避免接近垂直游泳
  direction.y = (Math.random() - 0.5) * 0.3;
  return direction.normalize();
}

function getFoodPlacementMargin() {
  const fishHalfLength =
    Math.min(aquariumSize.x, aquariumSize.y) * 0.45 * 1.5 * 0.5;
  return Math.min(
    fishHalfLength,
    Math.min(aquariumSize.x, aquariumSize.y) / 2 - 4,
  );
}

function createFish() {
  // Clone the loaded goldfish model
  const fishModelClone = cloneSkeleton(goldfishModel);
  const fishMixer = new THREE.AnimationMixer(fishModelClone);
  const fishAnimations = goldfishModel.userData.animations || [];
  if (fishAnimations.length > 0) {
    fishMixer.clipAction(fishAnimations[0]).play();
  }

  // 使用一個 Group 來作為魚的容器，之後的操作都針對這個 group
  const visualGroup = new THREE.Group();
  visualGroup.add(fishModelClone);
  visualGroup.scale.setScalar(getFishScale());

  const fishGroup = new THREE.Group();
  fishGroup.add(visualGroup);
  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(baseFishSize * 0.15, 8, 8),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  hitArea.scale.setScalar(getFishScale());
  hitArea.name = "fish-click-area";
  fishGroup.add(hitArea);
  fishGroup.name = "fish"; // 為 group 命名

  // 在水族箱範圍內隨機生成
  fishGroup.position.set(
    (Math.random() - 0.5) * aquariumSize.x,
    (Math.random() - 0.5) * aquariumSize.y,
    (Math.random() - 0.5) * aquariumSize.z,
  );
  fishGroup.position.set(
    (Math.random() - 0.5) * aquariumSize.x,
    (Math.random() - 0.5) * aquariumSize.y,
    (Math.random() - 0.5) * aquariumSize.z,
  );

  const hunger = Math.random() * 0.8 + 0.2;
  const targetFood = null;

  return {
    mesh: fishGroup, // 返回 group 作為操作對象
    speed: 70 + Math.random() * 80, // 增加基礎速度和隨機範圍
    hunger: Math.random() * 0.8 + 0.2, // 0 = 吃飽，1 = 最餓
    targetFood: null,
    hunger,
    targetFood,
    mixer: fishMixer,
    visual: visualGroup,
    direction: createFreeSwimDirection(),
    bubbleTimer: 0,
    showBubble: false,
    bubbleText: "",
    bubbleType: "", // 'greet' 或 'feed'
    isFleeing: 0, // 吃完飼料後的逃離計時器
  };
}

function createFood(pos) {
  const geometry = new THREE.SphereGeometry(5.2, 8, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(pos);
  return { mesh, eaten: false };
}

function createBubble() {
  const geometry = new THREE.SphereGeometry(4.5, 8, 8);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    (Math.random() - 0.5) * aquariumSize.x * 0.9,
    -aquariumSize.y / 2,
    (Math.random() - 0.5) * aquariumSize.z * 0.9,
  );
  mesh.userData.speed = 10 + Math.random() * 10;
  return { mesh };
}

function toggleFeeding(event) {
  event.stopPropagation();
  feedingMode.value = !feedingMode.value;
}

function toggleTankEdges(event) {
  event.stopPropagation();
  showTankEdges.value = !showTankEdges.value;
  if (boxHelper) {
    boxHelper.visible = showTankEdges.value;
  }
  if (boxMesh) {
    boxMesh.visible = showTankEdges.value;
  }
}

function onCanvasClick(event) {
  const rect = canvasContainer.value.getBoundingClientRect();
  clickMouse.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );

  clickRaycaster.setFromCamera(clickMouse, camera);

  if (feedingMode.value) {
    // 飼料模式: 投射到 Z=0 平面
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();
    if (clickRaycaster.ray.intersectPlane(plane, intersectPoint)) {
      // Clamp X and Y to the aquarium bounds
      const foodMargin = getFoodPlacementMargin();
      const foodHalfWidth = Math.max(1, aquariumSize.x / 2 - foodMargin);
      const foodHalfHeight = Math.max(1, aquariumSize.y / 2 - foodMargin);
      intersectPoint.x = Math.max(
        -foodHalfWidth,
        Math.min(foodHalfWidth, intersectPoint.x),
      );
      intersectPoint.y = Math.max(
        -foodHalfHeight,
        Math.min(foodHalfHeight, intersectPoint.y),
      );

      // Z 座標由與 Z=0 平面的交點決定，即為 0

      const food = createFood(intersectPoint);
      scene.add(food.mesh);
      foods.push(food);
    }
  } else {
    // 點擊魚模式
    const intersects = clickRaycaster.intersectObjects(fishRaycastTargets);
    if (intersects.length > 0) {
      let fishGroup = intersects[0].object;
      while (fishGroup && !fishGroup.userData.fish) {
        fishGroup = fishGroup.parent;
      }
      if (fishGroup) {
        const intersectedFish = fishGroup.userData.fish;
        if (intersectedFish) {
          intersectedFish.showBubble = true;
          intersectedFish.bubbleText =
            clickSayings[Math.floor(Math.random() * clickSayings.length)];
          intersectedFish.bubbleTimer = 0;
        }
      }
    }
  }
}

function animate() {
  const delta = clock.getDelta();

  fishes.forEach((fish, index) => {
    fish.mixer.update(delta);
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
            otherFish.mesh.position,
          );
          // If fish are perfectly overlapped, give them a random nudge
          if (away.lengthSq() === 0) {
            away.set(
              Math.random() - 0.5,
              Math.random() - 0.5,
              Math.random() - 0.5,
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
      const mouthOffsetFind = new THREE.Vector3(0, -5, 75);
      const mouthPositionFind = fish.mesh.localToWorld(mouthOffsetFind.clone());
      for (const food of foods) {
        if (food.eaten) continue;
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
      const randomDir = createFreeSwimDirection();
      fish.direction.lerp(randomDir, 0.2);
    }

    if (fish.targetFood && fish.hunger > 0.15) {
      // 游向食物
      const mouthPositionEat = fish.mesh.localToWorld(
        new THREE.Vector3(0, -5, 75),
      );
      const toFood = new THREE.Vector3().subVectors(
        fish.targetFood.mesh.position,
        mouthPositionEat,
      );
      if (toFood.lengthSq() > 0.0001) {
        fish.direction.lerp(toFood.normalize(), 0.08);
      }

      // 計算嘴巴到食物的距離來判斷是否吃到
      const mouthOffsetEat = new THREE.Vector3(0, -5, 75);
      const distToEat = mouthPositionEat.distanceTo(
        fish.targetFood.mesh.position,
      );
      if (distToEat < 6) {
        // 吃飼料
        if (fish.hunger > 0.15 && !fish.targetFood.eaten) {
          fish.hunger = Math.max(0, fish.hunger - 0.5);
          fish.targetFood.eaten = true; // 標記為被吃掉，但不立即移除
          fish.targetFood = null;
          fish.isFleeing = 1.2; // 設定1.2秒的「逃離」狀態

          // 吃完後，平滑地轉向一個新方向
          const randomDir = createFreeSwimDirection();
          /*
            (Math.random() - 0.5) * 0.2, // 維持原本的隨機垂直移動
            (Math.random() - 0.5) * 2,
          ).normalize(); */
          // 使用 lerp 平滑轉向，0.1 的係數表示一個較緩的自然轉彎
          fish.direction.lerp(randomDir, 0.1);

          fish.showBubble = true;
          fish.bubbleText =
            eatSayings[Math.floor(Math.random() * eatSayings.length)];
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
        const randomDir = createFreeSwimDirection();
        /*
          (Math.random() - 0.5) * 0.2, // 大幅減少垂直移動
          (Math.random() - 0.5) * 2,
        ).normalize(); */
        fish.direction.lerp(randomDir, 0.1);
      }
    }

    // --- 統一更新位置與姿態 ---
    let speedFactor = 1.2;
    const maxSpeed = 2.0;
    const fleeSpeed = 1.8;
    const foodSpeed = 1.5;

    if (fish.isFleeing > 0) {
      // 剛吃完，維持較高速度游開
      speedFactor = fleeSpeed;
    } else if (fish.targetFood) {
      const mouthPosition = fish.mesh.localToWorld(
        new THREE.Vector3(0, -5, 75),
      );
      const dist = mouthPosition.distanceTo(fish.targetFood.mesh.position);
      const slowingRadius = 150; // 在這個半徑內，魚會開始反應
      if (dist < slowingRadius) {
        // 當靠近食物時，平滑地加速
        speedFactor = 0.75 + (foodSpeed - 0.75) * (dist / slowingRadius);
      } else {
        speedFactor = foodSpeed;
      }
    }

    fish.direction.normalize();
    fish.mesh.position.addScaledVector(
      fish.direction,
      fish.speed * delta * speedFactor,
    );
    // fish.mesh.lookAt(fish.mesh.position.clone().add(fish.direction));

    // -- 平滑旋轉 --
    // 1. 計算目標旋轉 (一個四元數)
    const targetQuaternion = new THREE.Quaternion();
    const dummy = new THREE.Object3D();
    const orientationDirection = fish.direction.clone();
    const nearBottomFood =
      fish.targetFood &&
      fish.targetFood.mesh.position.y <= -aquariumSize.y / 2 + 24 &&
      fish.mesh.position.distanceTo(fish.targetFood.mesh.position) < 180;

    if (nearBottomFood) {
      const directionToFood = new THREE.Vector3()
        .subVectors(fish.targetFood.mesh.position, fish.mesh.position)
        .normalize();
      // Keep the movement direction unchanged, but gently pitch the body
      // toward a food pellet that has reached the tank bottom.
      orientationDirection.lerp(directionToFood, 0.35).normalize();
    }

    dummy.lookAt(orientationDirection);
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
          (Math.random() - 0.5) * 1.5, // 增加水平隨機性
        ),
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
      food.mesh.geometry.dispose();
      food.mesh.material.dispose();
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
      if (food.restTimer > 8) {
        // 8秒後消失
        scene.remove(food.mesh);
        food.mesh.geometry.dispose();
        food.mesh.material.dispose();
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
        (Math.random() - 0.5) * aquariumSize.z * 0.9,
      );
    }
  });

  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(animate);
}

let boxMesh, boxHelper;

onMounted(async () => {
  // Load the model first
  try {
    goldfishModel = await loadGuppyFishModel();
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
  let distance = aquariumSize.y / 2 / Math.tan((fov / 2) * (Math.PI / 180));
  distance *= 1.2;
  camera.position.set(0, 0, distance);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasContainer.value.appendChild(renderer.domElement);

  // 水族箱立方體(透明玻璃)
  const boxGeo = new THREE.BoxGeometry(
    aquariumSize.x,
    aquariumSize.y,
    aquariumSize.z,
  );
  const boxMat = new THREE.MeshPhysicalMaterial({
    color: 0x55aaff,
    opacity: 0.03,
    transparent: true,
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0,
    side: THREE.BackSide,
  });
  boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.visible = showTankEdges.value;
  scene.add(boxMesh);

  // 將水族箱背景圖片放在立體水箱的後方
  // 新增 BoxHelper 來繪製邊框
  boxHelper = new THREE.BoxHelper(boxMesh, 0x000000);
  boxHelper.visible = showTankEdges.value;
  scene.add(boxHelper);

  // 光源
  // 使用與 fish2 測試頁相近的光源，讓魚的材質更明亮並保留光澤
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x334455, 2);
  scene.add(hemisphereLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
  directionalLight.position.set(200, 300, 400);
  scene.add(directionalLight);

  // 移除 XYZ 軸輔助線
  // const axesHelper = new THREE.AxesHelper(500);
  // scene.add(axesHelper);

  // 產生魚
  for (let i = 0; i < 5; i++) {
    const fish = createFish();
    fish.mesh.userData.fish = fish;
    scene.add(fish.mesh);
    fishes.push(fish);
    fish.mesh.traverse((child) => {
      if (child.isMesh) {
        fishRaycastTargets.push(child);
      }
    });
  }

  fishes.forEach((fish) => {
    fish.visual.scale.setScalar(getFishScale());
  });

  // 產生氣泡
  for (let i = 0; i < 20; i++) {
    const bubble = createBubble();
    scene.add(bubble.mesh);
    bubbles.push(bubble);
  }

  handleResize = () => {
    aquariumSize.x = window.innerWidth;
    aquariumSize.y = window.innerHeight;

    fishes.forEach((fish) => {
      fish.visual.scale.setScalar(getFishScale());
    });

    camera.aspect = window.innerWidth / window.innerHeight;
    const fov = 75;
    let distance = aquariumSize.y / 2 / Math.tan((fov / 2) * (Math.PI / 180));
    distance *= 1.2;
    camera.position.z = distance;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    boxMesh.geometry.dispose();
    boxMesh.geometry = new THREE.BoxGeometry(
      aquariumSize.x,
      aquariumSize.y,
      aquariumSize.z,
    );
    boxHelper.update();
  };
  window.addEventListener("resize", handleResize);

  animate();

  // 確保頁面載入時游標為預設狀態
  document.body.style.cursor = "auto";
});

onBeforeUnmount(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (handleResize) {
    window.removeEventListener("resize", handleResize);
  }
  foods.forEach((food) => {
    food.mesh.geometry.dispose();
    food.mesh.material.dispose();
  });
  bubbles.forEach((bubble) => {
    bubble.mesh.geometry.dispose();
    bubble.mesh.material.dispose();
  });
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
  const bubblePos = fish.mesh.position.clone();
  bubblePos.y += 18;
  const bubbleVector = bubblePos.project(camera);
  // 計算魚頭上方位置的屏幕座標
  const pos = fish.mesh.position.clone();
  pos.y += 18; // 往上偏移一點
  const vector = pos.project(camera);
  const x = (bubbleVector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-bubbleVector.y * 0.5 + 0.5) * window.innerHeight;

  return {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    transform: "translate(-50%, -100%)",
    background: "rgb(8 27 48 / 78%)",
    padding: "8px 14px",
    borderRadius: "14px",
    boxShadow: "0 8px 24px rgb(0 0 0 / 20%)",
    border: "1px solid rgb(255 255 255 / 45%)",
    color: "#fff",
    fontSize: "16px",
    fontFamily: "inherit",
    fontWeight: "600",
    backdropFilter: "blur(10px)",
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
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.canvas-container {
  width: 100%;
  height: 100%;
  display: block;
  cursor: auto;
  background-color: #79b8ca;
  background-image:
    linear-gradient(rgb(85 170 255 / 15%), rgb(85 170 255 / 15%)),
    var(--aquarium-wallpaper);
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}

.canvas-container.feeding-cursor {
  cursor: url("@/assets/foodbag.png"), auto;
}

.control-panel {
  position: absolute;
  top: 24px;
  left: 24px;
  display: flex;
  gap: 10px;
  z-index: 10;
}

.control-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 8px 14px 8px 10px;
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: 14px;
  background: rgb(8 27 48 / 78%);
  box-shadow: 0 8px 24px rgb(0 0 0 / 20%);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  backdrop-filter: blur(10px);
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.control-btn:hover {
  border-color: rgb(255 255 255 / 80%);
  background: rgb(20 61 91 / 88%);
  transform: translateY(-1px);
}

.control-btn.active {
  border-color: #8fe9ff;
  background: rgb(21 116 145 / 88%);
}

.feed-btn img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.edge-icon {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 65%);
  border-radius: 9px;
  color: #9eeeff;
  font-size: 24px;
  line-height: 1;
}

.control-state {
  min-width: 20px;
  margin-left: 2px;
  color: #a7d4df;
  font-size: 12px;
}

@media (max-width: 560px) {
  .control-panel {
    top: 14px;
    left: 14px;
    right: 14px;
  }

  .control-btn {
    flex: 1;
    justify-content: center;
    padding-right: 10px;
  }
}
</style>
