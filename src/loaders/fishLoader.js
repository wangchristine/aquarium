import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export function loadGuppyFishModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      `${import.meta.env.BASE_URL}koi_fish.glb`,
      (gltf) => {
        const object = gltf.scene;
        const fishGroup = new THREE.Group();
        fishGroup.add(object);

        // 讓魚頭方向與測試頁一致，並朝向魚的游泳前進方向
        object.rotation.y = (Math.PI * 3) / 2;

        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const desiredSize = 180;
        const scale = desiredSize / maxDim;
        object.scale.setScalar(scale);
        object.updateMatrixWorld(true);

        // 縮放後重新計算中心，避免 GLB 的根節點旋轉造成模型偏移
        const scaledBox = new THREE.Box3().setFromObject(object);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        fishGroup.position.copy(scaledCenter).negate();

        // 確保模型的網格不會因 GLB 的裁切設定而消失
        object.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false;
          }
        });

        // 將 GLB 內建動畫交給建立魚群的程式使用
        fishGroup.userData.animations = gltf.animations;
        resolve(fishGroup);
      },
      undefined,
      (error) => {
        console.error("鯉魚模型載入失敗。", error);
        reject(error);
      }
    );
  });
}
