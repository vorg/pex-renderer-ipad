const createRenderer = require('../')
const createContext = require('pex-context')
const createCube = require('primitive-cube')
const GUI = require('pex-gui')

const ctx = createContext()
const renderer = createRenderer(ctx)
const gui = new GUI(ctx)

const State = {
  formats: ['Basis', 'Ktx2'],
  currentFormat: 0
}

// Setup
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

// Mesh
const baseColorMap = ctx.texture2D({})
const material = renderer.material({ baseColorMap })
renderer.add(renderer.entity([renderer.geometry(createCube()), material]))

const updateTexure = async () => {
  material.set({ enabled: false })

  const extension = State.formats[State.currentFormat]

  ctx.update(
    baseColorMap,
    await renderer[`load${extension}`](
      `assets/textures/compressed/Duck.${extension.toLowerCase()}`
    )
  )
  material.set({ enabled: true })
}

gui.addRadioList(
  'Format',
  State,
  'currentFormat',
  State.formats.map((name, value) => ({
    name,
    value
  })),
  updateTexure
)

updateTexure()

ctx.frame(() => {
  renderer.draw()
  gui.draw()

  window.dispatchEvent(new CustomEvent('pex-screenshot'))
})
