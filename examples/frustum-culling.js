const createRenderer = require('../')
const createContext = require('pex-context')
const createGUI = require('pex-gui')
const createCube = require('primitive-cube')
const mat4 = require('pex-math/mat4')
const quat = require('pex-math/quat')
const vec3 = require('pex-math/vec3')
const io = require('pex-io')

const ctx = createContext()

var geometriesInScene = []

const renderer = createRenderer(ctx)
const gui = createGUI(ctx)
var cullingActive = true
gui.addFPSMeeter()
gui.addButton('toggle frustum culling', () => {
  toggleCulling()
})

var cameraCmp = renderer.camera({
  fov: Math.PI / 3,
  aspect: ctx.gl.drawingBufferWidth / ctx.gl.drawingBufferHeight,
  exposure: 2,
  near: 0.1,
  far: 40
})
postProcessingCmp = renderer.postProcessing({
  ssao: false,
  dof: false,
  fxaa: false
})
const cameraEntity = renderer.entity(
  [
    postProcessingCmp,
    cameraCmp,
    renderer.flyControls({
      position: [0, 1, 1],
      sensitivityX: 0.002, // this is sensitivity mouse in the x direction
      sensitivityY: 0.002, // this is sensitivity mouse  in the y direction
      releaseOnMouseUp: true
    })
  ],
  ['main']
)
renderer.add(cameraEntity)
gui.addParam('SSAO bias', postProcessingCmp, 'ssaoBias', { min: 0, max: 1 })

const cameraEntityTop = renderer.entity(
  [
    renderer.postProcessing({
      ssao: false,
      dof: false,
      fxaa: false
    }),
    renderer.camera({
      fov: Math.PI / 3,
      aspect: [ctx.gl.drawingBufferWidth / ctx.gl.drawingBufferHeight],
      viewport: [
        ctx.gl.drawingBufferWidth - ctx.gl.drawingBufferHeight * 0.4,
        ctx.gl.drawingBufferHeight * 0.6,
        ctx.gl.drawingBufferHeight * 0.4,
        ctx.gl.drawingBufferHeight * 0.4
      ],
      exposure: 2,
      near: 20,
      far: 60
    }),
    renderer.transform({
      position: [0, 55, 0],
      rotation: quat.fromAxisAngle(quat.create(), [-1, 0, 0], Math.PI / 2)
    })
  ],
  ['gui']
)
renderer.add(cameraEntityTop)
//gui.addTexture2D('culled example', cameraEntityTop.viewport)

// Lights
const sunDir = vec3.normalize([1, -1, 1])
const sunPosition = vec3.addScaled([0, 0, 0], sunDir, -2)
const sunLight = renderer.directionalLight({
  color: [1, 1, 1, 1],
  intensity: 2,
  castShadows: true,
  bias: 0.1
})
const sunTransform = renderer.transform({
  position: [2, 2, 2],
  rotation: quat.fromTo([0, 0, 1], vec3.normalize([-1, -1, -1]), [0, 1, 0])
})
const sunEntity = renderer.entity([sunTransform, sunLight])
renderer.add(sunEntity)

const skyboxCmp = renderer.skybox({
  sunPosition: sunPosition
})
const reflectionProbeCmp = renderer.reflectionProbe()
const skyEntity = renderer.entity([skyboxCmp, reflectionProbeCmp])
renderer.add(skyEntity)

function imageFromFile(file) {
  const tex = ctx.texture2D({
    width: 1,
    height: 1,
    pixelFormat: ctx.PixelFormat.RGBA8,
    encoding: ctx.Encoding.SRGB
  })
  io.loadImage(
    file,
    function(err, image, encoding) {
      if (err) throw err
      ctx.update(tex, {
        data: image,
        width: image.width,
        height: image.height,
        wrap: ctx.Wrap.Repeat,
        flipY: true,
        mag: ctx.Filter.Linear,
        min: ctx.Filter.LinearMipmapLinear,
        aniso: 16,
        pixelFormat: ctx.PixelFormat.RGBA8,
        encoding: encoding
      })
      ctx.update(tex, { mipmap: true })
    },
    true
  )
  return tex
}

const ASSETS_DIR = 'assets'

let baseColor = imageFromFile(
  `${ASSETS_DIR}/plastic-green.material/plastic-green_basecolor.png`
)
let metallic = imageFromFile(
  `${ASSETS_DIR}/plastic-green.material/plastic-green_metallic.png`
)
let normal = imageFromFile(
  `${ASSETS_DIR}/plastic-green.material/plastic-green_n.png`
)
let roughness = imageFromFile(
  `${ASSETS_DIR}/plastic-green.material/plastic-green_roughness.png`
)

const noOfBoxes = 200
const demoScale = 50
const cube = createCube()

let cubePositions = []
let cubeScales = []
let cubeTints = []
for (let i = 0; i < noOfBoxes; i++) {
  cubePositions.push([
    Math.random() * demoScale - demoScale / 2,
    0,
    Math.random() * demoScale - demoScale / 2
  ])
  cubeScales.push([1, 1, 1])
  cubeTints.push([0, 0, 1, 1])
}
for (let i = 0; i < noOfBoxes; i++) {
  let boxEntity = renderer.entity(
    [
      renderer.geometry(cube),
      renderer.transform({
        position: cubePositions[i]
      }),
      renderer.material({
        baseColorMap: baseColor,
        rougness: 0.7,
        roughnessMap: roughness,
        metallic: 0.8,
        metallicMap: metallic,
        normalMap: normal,
        castShadows: true,
        receiveShadows: true
      })
    ],
    ['main']
  )
  renderer.add(boxEntity)
  geometriesInScene.push(boxEntity)
}

var tintBuffer = ctx.vertexBuffer(cubeTints)
var cubeforInstance = createCube()
cubeforInstance.offsets = {
  buffer: ctx.vertexBuffer(cubePositions),
  divisor: 1
}
cubeforInstance.scales = { buffer: ctx.vertexBuffer(cubeScales), divisor: 1 }
cubeforInstance.colors = { buffer: tintBuffer, divisor: 1 }
cubeforInstance.instances = cubePositions.length
renderer.add(
  renderer.entity(
    [
      renderer.geometry(cubeforInstance),
      renderer.transform(),
      renderer.material({
        baseColor: [1, 1, 1, 1],
        unlit: true
      })
    ],
    ['gui']
  )
)

const floorEntity = renderer.entity([
  renderer.transform({
    position: [0, -0.5, 0]
  }),
  renderer.geometry(createCube(60, 0.02, 60)),
  renderer.material({
    baseColor: [1, 1, 1, 1],
    castShadows: true,
    receiveShadows: true
  })
])
renderer.add(floorEntity)

ctx.frame(() => {
  let tempGeo
  for (let i = 0; i < geometriesInScene.length; i++) {
    tempGeo = geometriesInScene[i].getComponent('Transform')
    if (cullingActive) {
      tempGeo.isInFrustum(cameraCmp.frustum)
        ? (cubeTints[i] = [0, 1, 0, 1])
        : (cubeTints[i] = [1, 0, 0, 1])
    } else {
      cubeTints[i] = [0, 1, 0, 1]
    }
  }

  ctx.update(tintBuffer, { data: cubeTints })
  //cubeforInstance.colors = { buffer: tintBuffer, divisor: 1 }

  renderer.draw()

  gui.draw()

  window.dispatchEvent(new CustomEvent('pex-screenshot'))
})

function toggleCulling() {
  if (!geometriesInScene.length) {
    console.log('geometries not yet added')
    return
  }

  cullingActive ? (cullingActive = false) : (cullingActive = true)
  let geom
  for (let i = 0; i < geometriesInScene.length; i++) {
    geom = geometriesInScene[i].getComponent('Geometry')
    geom.frustumCulled = cullingActive
  }

  console.log(cameraEntity)
}
