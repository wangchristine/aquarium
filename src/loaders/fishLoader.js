import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

export function loadGoldfishModel() {
  return new Promise((resolve, reject) => {
    const mtlLoader = new MTLLoader();
    // Set path to the directory containing the MTL file
    mtlLoader.setPath('/fish/obj/');

    mtlLoader.load(
      'fish.mtl',
      (materials) => {
        materials.preload();

        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        // Set path to the directory containing the OBJ file
        objLoader.setPath('/fish/obj/');
        objLoader.load(
          'fish.obj',
          (object) => {
            // --- Centering and Scaling ---
            const box = new THREE.Box3().setFromObject(object);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            object.position.copy(center).negate();
            object.updateMatrixWorld(true);

            const maxDim = Math.max(size.x, size.y, size.z);
            const desiredSize = 120;
            const scale = desiredSize / maxDim;
            object.scale.set(scale, scale, scale);

            const fishGroup = new THREE.Group();
            fishGroup.add(object);

            resolve(fishGroup);
          },
          undefined, // onProgress
          (error) => {
            console.error('An error happened during OBJ loading.', error);
            reject(error);
          }
        );
      },
      undefined, // onProgress
      (error) => {
        console.error('An error happened during MTL loading.', error);
        reject(error);
      }
    );
  });
}