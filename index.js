import createWorld from "./world.js";

import createEntity from "./entity.js";

import createAmbientLight from "./components/ambient-light.js";
import createAnimation from "./components/animation.js";
import createAreaLight from "./components/area-light.js";
import createCamera from "./components/camera.js";
import createDirectionalLight from "./components/directional-light.js";
import createGeometry from "./components/geometry.js";
import createPointLight from "./components/point-light.js";
import createMaterial from "./components/material.js";
import createMorph from "./components/morph.js";
import createOrbiter from "./components/orbiter.js";
import createReflectionProbe from "./components/reflection-probe.js";
import createSkin from "./components/skin.js";
import createSkybox from "./components/skybox.js";
import createSpotLight from "./components/spot-light.js";
import createTransform from "./components/transform.js";

import boundingBoxHelper from "./components/bounding-box-helper.js";
import lightHelper from "./components/light-helper.js";
import cameraHelper from "./components/camera-helper.js";

import createAnimationSystem from "./systems/animation.js";
import createCameraSystem from "./systems/camera.js";
import createGeometrySystem from "./systems/geometry.js";
import createHelperSystem from "./systems/helper.js";
import createReflectionProbeSystem from "./systems/reflection-probe.js";
import createRendererSystem from "./systems/renderer.js";
import createSkyboxSystem from "./systems/skybox.js";
import createTransformSystem from "./systems/transform.js";

import createRenderGraph from "./render-graph.js";

import loadGltf from "./loaders/glTF.js";
import createResourceCache from "./resource-cache.js";

export let world = createWorld;

export let entity = createEntity;

export let components = {
  ambientLight: createAmbientLight,
  animation: createAnimation,
  areaLight: createAreaLight,
  camera: createCamera,
  directionalLight: createDirectionalLight,
  geometry: createGeometry,
  pointLight: createPointLight,
  material: createMaterial,
  morph: createMorph,
  orbiter: createOrbiter,
  reflectionProbe: createReflectionProbe,
  skin: createSkin,
  skybox: createSkybox,
  spotLight: createSpotLight,
  transform: createTransform,

  boundingBoxHelper: boundingBoxHelper,
  cameraHelper: cameraHelper,
  lightHelper: lightHelper,
};

export let systems = {
  animation: createAnimationSystem,
  camera: createCameraSystem,
  geometry: createGeometrySystem,
  helper: createHelperSystem,
  reflectionProbe: createReflectionProbeSystem,
  renderer: createRendererSystem,
  skybox: createSkyboxSystem,
  transform: createTransformSystem,
};

export let loaders = {
  gltf: loadGltf,
};

export let renderGraph = createRenderGraph;
export let resourceCache = createResourceCache;
