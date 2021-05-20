const createRenderer = require('..')
const createContext = require('pex-context')

const ctx = createContext()
const renderer = createRenderer(ctx)

const cameraEntity = renderer.entity([
  renderer.camera({
    aspect: ctx.gl.drawingBufferWidth / ctx.gl.drawingBufferHeight
  }),
  renderer.orbiter({
    position: [3, 3, 3]
  })
])
renderer.add(cameraEntity)

const skyboxEntity = renderer.entity([
  renderer.skybox({
    sunPosition: [1, 1, 1]
  })
])
renderer.add(skyboxEntity)

const axesEntity = renderer.entity([renderer.axisHelper()])
renderer.add(axesEntity)

const reflectionProbeEntity = renderer.entity([renderer.reflectionProbe()])
renderer.add(reflectionProbeEntity)
;(async () => {
  const scene = await renderer.loadScene(
    'assets/models/Duck.basis.draco.glb'
    // 'assets/models/CesiumMan/CesiumMan.basis.draco.glb'
  )
  renderer.add(scene.root)
})()

ctx.frame(() => {
  renderer.draw()

  window.dispatchEvent(new CustomEvent('pex-screenshot'))
})
