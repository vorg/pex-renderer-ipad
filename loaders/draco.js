const { loadBinary } = require('pex-io')

const DracoWorker = require('./draco-worker.js')
const WorkerPool = require('./worker-pool.js')

let workerPool

// Decoder API
let transcoderPending

const getWorkerStringUrl = (transcoder, worker) => {
  const str = `
${transcoder}
${worker}
DracoWorker()
`
  return URL.createObjectURL(new Blob([str]))
}

// TODO: draco_decoder.js only
const getTranscoder = async (transcoderPath) =>
  transcoderPending ||
  Promise.all([
    getWorkerStringUrl(
      await (await fetch(`${transcoderPath}draco_wasm_wrapper.js`)).text(),
      DracoWorker.toString()
    ),
    await (await fetch(`${transcoderPath}draco_decoder.wasm`)).arrayBuffer()
  ])

function loadGeometry(buffer, taskConfig) {
  const taskKey = JSON.stringify(taskConfig)

  const cachedTask = workerPool.hasTask(taskKey, buffer)
  if (cachedTask) return cachedTask

  let worker
  let taskId

  const geometryPending = workerPool
    .getWorker(transcoderPending, buffer.byteLength)
    .then((workerData) => {
      ;({ worker: worker, taskId: taskId } = workerData)

      return new Promise((resolve, reject) => {
        worker._callbacks[taskId] = { resolve, reject }

        worker.postMessage({ type: 'decode', id: taskId, taskConfig, buffer }, [
          buffer
        ])
      })
    })
    .then((message) => message.geometry)

  // Remove task from the task list.
  geometryPending
    .catch(() => true)
    .then(() => {
      if (worker && taskId) {
        workerPool.releaseTask(worker, taskId)
      }
    })

  // Cache the task result.
  workerPool.taskCache.set(buffer, {
    key: taskKey,
    promise: geometryPending
  })

  return geometryPending
}

// Load
async function loadDraco(
  data,
  gl,
  {
    transcoderPath = 'assets/transcoder/',
    transcodeConfig = {
      attributeIDs: {
        positions: 'POSITION',
        normals: 'NORMAL',
        texCoords: 'TEX_COORD',
        colors: 'COLOR'
      },
      attributeTypes: {
        positions: 'Float32Array',
        normals: 'Float32Array',
        texCoords: 'Float32Array',
        colors: 'Float32Array'
      },
      useUniqueIDs: false
    },

    workerLimit,
    workerConfig
  } = {}
) {
  if (!workerPool) workerPool = new WorkerPool(workerLimit, workerConfig)

  transcoderPending = getTranscoder(transcoderPath)

  return await loadGeometry(
    data instanceof ArrayBuffer ? data : await loadBinary(data),
    transcodeConfig
  )
}

module.exports = loadDraco
