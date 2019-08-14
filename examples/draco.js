const createRenderer = require('../')
const createContext = require('pex-context')
const angleNormals = require('angle-normals')

const ctx = createContext()
const renderer = createRenderer(ctx)

const cameraEntity = renderer.entity([
  renderer.camera({
    aspect: ctx.gl.drawingBufferWidth / ctx.gl.drawingBufferHeight
  }),
  renderer.orbiter({
    position: [0, 0.25, 0.25],
    target: [0, 0.1, 0]
  })
])
renderer.add(cameraEntity)

const skyboxEntity = renderer.entity([
  renderer.skybox({
    sunPosition: [1, 1, 1]
  })
])
renderer.add(skyboxEntity)

const groupArray = (array, n) => {
  const group = []

  for (let i = 0; i < array.length / n; i++) {
    group.push(array.slice(i * n, (i + 1) * n))
  }

  return group
}

const reflectionProbeEntity = renderer.entity([renderer.reflectionProbe()])
renderer.add(reflectionProbeEntity)
;(async () => {
  const geometry = await renderer.loadDraco('assets/bunny.drc', {
    path: 'assets/draco/'
  })

  geometry.set({
    normals: angleNormals(
      groupArray(geometry.indices.data, 3),
      groupArray(geometry.positions.data, 3)
    )
  })

  renderer.add(
    renderer.entity([
      geometry,
      renderer.material({ baseColor: [0.9, 0.1, 0.1, 1] })
    ])
  )
})()

ctx.frame(() => {
  renderer.draw()

  window.dispatchEvent(new CustomEvent('pex-screenshot'))
})
