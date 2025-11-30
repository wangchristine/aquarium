import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

// Instantiate loaders
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
const textureLoader = new THREE.TextureLoader();

/**
 * HYBRID STRATEGY: Uses MTL for base properties and programmatically applies the correct texture.
 * @returns {Promise<THREE.Group>} A promise that resolves with the final loaded fish model.
 */
export function loadGoldfishModel() {
  return new Promise((resolve, reject) => {
    
    const objBasePath = '/fish/obj/';
    const textureBasePath = '/fish/';
    mtlLoader.setPath(objBasePath);
    textureLoader.setPath(textureBasePath);

    // --- Load texture and materials in parallel ---
    const texturePromise = textureLoader.loadAsync('fish.jpg');
    const materialsPromise = mtlLoader.loadAsync('fish.mtl');

    Promise.all([texturePromise, materialsPromise])
      .then(([texture, materials]) => {
        
        materials.preload();
        objLoader.setMaterials(materials);
        objLoader.setPath(objBasePath);

        // --- Load model after materials are set ---
        return objLoader.loadAsync('fish.obj').then(object => ({ texture, object }));
      })
      .then(({ texture, object }) => {

        // --- Manually apply the correct texture to the loaded materials ---
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Assuming the model has one primary material
            if (child.material) {
              child.material.map = texture;
              child.material.needsUpdate = true;
            }
          }
        });
        
        // --- Robust Centering and Scaling ---
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        object.position.copy(center).negate();
        object.updateMatrixWorld(true);

        const maxDim = Math.max(size.x, size.y, size.z);
        const desiredSize = 120; // Doubled the size
        const scale = desiredSize / maxDim;
        object.scale.set(scale, scale, scale);

        const fishGroup = new THREE.Group();
        fishGroup.add(object);
        // fishGroup.rotation.y = -Math.PI / 2; // Removed fixed initial rotation

        resolve(fishGroup);
      })
      .catch(error => {
        console.error('An error happened during hybrid loading.', error);
        reject(error);
      });
  });
}
