/* global DracoDecoderModule */
const { loadBinary } = require('pex-io')

// TODO: dequantization, version support

const DRACO_TO_PEX_ATTRIBUTE_NAME_MAP = {
  positions: 'POSITION',
  normals: 'NORMAL',
  vertexColors: 'COLOR',
  texCoords: 'TEX_COORD'
}

// Utils
async function loadScript(src) {
  var prevScript = document.getElementById('decoder_script')
  if (prevScript !== null) {
    prevScript.parentNode.removeChild(prevScript)
  }
  var head = document.getElementsByTagName('head')[0]
  var script = document.createElement('script')
  script.id = 'decoder_script'
  script.type = 'text/javascript'
  script.src = src

  return new Promise(function(resolve) {
    script.onload = resolve
    head.appendChild(script)
  })
}

function getAttributeOptions(options, attributeName) {
  if (typeof options.attributeOptions[attributeName] === 'undefined') {
    options.attributeOptions[attributeName] = {}
  }

  return options.attributeOptions[attributeName]
}

const DRACO_TYPED_ARRAY_BY_JS_TYPED_ARRAY = {
  Int8Array: {
    interface: 'DracoInt8Array',
    getAttribute: 'GetAttributeInt8ForAllPoints'
  },
  Uint8Array: {
    interface: 'DracoUInt8Array',
    getAttribute: 'GetAttributeUInt8ForAllPoints'
  },
  Int16Array: {
    interface: 'DracoInt16Array',
    getAttribute: 'GetAttributeInt16ForAllPoints'
  },
  Uint16Array: {
    interface: 'DracoUInt16Array',
    getAttribute: 'GetAttributeUInt16ForAllPoints'
  },
  Uint32Array: {
    interface: 'DracoInt32Array',
    getAttribute: 'GetAttributeInt32ForAllPoints'
  },
  Float32Array: {
    interface: 'DracoFloat32Array',
    getAttribute: 'GetAttributeFloatForAllPoints'
  }
}

// pex
function addAttributeToGeometry(
  dracoDecoder,
  decoder,
  dracoGeometry,
  attributeName,
  attributeType,
  attribute,
  attributes
) {
  if (attribute.ptr === 0) {
    const errorMessage = `Draco Loader: No attribute ${attributeName}`
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  const numComponents = attribute.num_components()
  const numPoints = dracoGeometry.num_points()
  const numValues = numPoints * numComponents

  let attributeData

  const typeString = attributeType.name.toString()
  const attributeTypeDraco = DRACO_TYPED_ARRAY_BY_JS_TYPED_ARRAY[typeString]

  if (!Object.keys(DRACO_TYPED_ARRAY_BY_JS_TYPED_ARRAY).includes(typeString)) {
    const errorMessage = `Draco Loader: Unexpected attribute type ${typeString}`
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  attributeData = new dracoDecoder[attributeTypeDraco.interface]()
  decoder[attributeTypeDraco.getAttribute](
    dracoGeometry,
    attribute,
    attributeData
  )

  const data = new attributeType(numValues)
  for (let i = 0; i < numValues; i++) {
    data[i] = attributeData.GetValue(i)
  }

  attributes[attributeName] = { data }

  dracoDecoder.destroy(attributeData)
}

function getGeometry(
  renderer,
  decoderModuleInstance,
  dracoDecoder,
  dracoGeometry,
  decodingStatus,
  geometryType,
  buffer,
  attributeUniqueIdMap,
  attributeTypeMap,
  options
) {
  const ctx = renderer._ctx
  const isTriangularMesh =
    geometryType === decoderModuleInstance.TRIANGULAR_MESH

  const startTime = performance.now()

  // TODO: Should not assume native Draco attribute IDs apply.
  if (getAttributeOptions(options, 'POSITION').skipDequantization === true) {
    dracoDecoder.SkipAttributeTransform(decoderModuleInstance.POSITION)
  }

  // Check decoding
  if (!decodingStatus.ok() || dracoGeometry.ptr == 0) {
    const errorMessage = `Draco Loader: Decoding error ${decodingStatus.error_msg()}`
    decoderModuleInstance.destroy(dracoDecoder)
    decoderModuleInstance.destroy(dracoGeometry)
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  const decodeEndTime = performance.now()
  decoderModuleInstance.destroy(buffer)

  let numFaces = isTriangularMesh ? dracoGeometry.num_faces() : 0
  let numPoints = dracoGeometry.num_points()
  let numAttributes = dracoGeometry.num_attributes()

  if (options.verbose) {
    console.log(`Number of faces: ${numFaces.toString()}`)
    console.log(`Number of points: ${numPoints.toString()}`)
    console.log(`Number of attributes: ${numAttributes.toString()}`)
  }

  // Check position attribute.
  // TODO: Should not assume native Draco attribute IDs apply.
  const positionAttributeId = dracoDecoder.GetAttributeId(
    dracoGeometry,
    decoderModuleInstance.POSITION
  )
  if (positionAttributeId == -1) {
    const errorMessage = 'Draco Loader: No position attribute found.'
    decoderModuleInstance.destroy(dracoDecoder)
    decoderModuleInstance.destroy(dracoGeometry)
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  const positionAttribute = dracoDecoder.GetAttribute(
    dracoGeometry,
    positionAttributeId
  )

  const geometry = renderer.geometry({
    primitive: options.primitive
  })

  let attributes = {}

  // Do not use both the native attribute map and a provided (e.g. glTF) map.
  if (attributeUniqueIdMap) {
    // Add attributes of user specified unique id. E.g. GLTF models.
    for (let attributeName in attributeUniqueIdMap) {
      const attributeType = attributeTypeMap[attributeName]
      const attribute = dracoDecoder.GetAttributeByUniqueId(
        dracoGeometry,
        attributeUniqueIdMap[attributeName]
      )

      console.log(attributeType)

      addAttributeToGeometry(
        decoderModuleInstance,
        dracoDecoder,
        dracoGeometry,
        DRACO_TO_PEX_ATTRIBUTE_NAME_MAP[attributeName] || attributeName,
        attributeType,
        attribute,
        attributes,
        ctx
      )
    }
  } else {
    // https://github.com/google/draco/blob/master/src/draco/javascript/emscripten/draco_web_decoder.idl#L22
    for (let attributeName in DRACO_TO_PEX_ATTRIBUTE_NAME_MAP) {
      const attributeId = dracoDecoder.GetAttributeId(
        dracoGeometry,
        decoderModuleInstance[DRACO_TO_PEX_ATTRIBUTE_NAME_MAP[attributeName]]
      )

      if (attributeId !== -1) {
        const attribute = dracoDecoder.GetAttribute(dracoGeometry, attributeId)
        addAttributeToGeometry(
          decoderModuleInstance,
          dracoDecoder,
          dracoGeometry,
          attributeName,
          Float32Array,
          attribute,
          attributes,
          ctx
        )
      }
    }
  }

  // Get indices
  let indices
  if (isTriangularMesh) {
    if (options.primitive === ctx.Primitive.TriangleStrip) {
      const stripsArray = new decoderModuleInstance.DracoInt32Array()
      dracoDecoder.GetTriangleStripsFromMesh(dracoGeometry, stripsArray)
      indices = new Uint32Array(stripsArray.size())

      for (let i = 0; i < stripsArray.size(); ++i) {
        indices[i] = stripsArray.GetValue(i)
      }
      decoderModuleInstance.destroy(stripsArray)
    } else {
      const numIndices = numFaces * 3
      indices = new Uint32Array(numIndices)

      const ia = new decoderModuleInstance.DracoInt32Array()
      for (let i = 0; i < numFaces; ++i) {
        dracoDecoder.GetFaceFromMesh(dracoGeometry, i, ia)
        indices[i * 3] = ia.GetValue(0)
        indices[i * 3 + 1] = ia.GetValue(1)
        indices[i * 3 + 2] = ia.GetValue(2)
      }
      decoderModuleInstance.destroy(ia)
    }
  }

  if (isTriangularMesh) {
    geometry.set({
      indices: { data: indices }
    })
  }

  // const posTransform = new decoderModuleInstance.AttributeQuantizationTransform()
  // if (posTransform.InitFromAttribute(positionAttribute)) {
  //   const range = posTransform.range()
  //   const quantizationBits = posTransform.quantization_bits()
  //   const minValues = new Float32Array(3)
  //   for (let i = 0; i < 3; ++i) {
  //     minValues[i] = posTransform.min_value(i)
  //   }

  //   geometry.set({
  //     range,
  //     quantizationBits,
  //     minValues
  //   })
  // }

  // Clean up
  // decoderModuleInstance.destroy(posTransform)
  decoderModuleInstance.destroy(dracoDecoder)
  decoderModuleInstance.destroy(dracoGeometry)

  if (options.verbose) {
    console.log(`Draco Loader: decode time ${decodeEndTime - startTime}`)
    console.log(
      `Draco Loader: import time ${performance.now() - decodeEndTime}`
    )
  }

  geometry.set({
    ...attributes
  })

  return geometry
}

// Decoder API
// https://github.com/google/draco#javascript-decoder-api
function decodeDracoFileInternal(bin, decoderModule) {
  // Create the Draco decoder.
  const dracoBuffer = new decoderModule.DecoderBuffer()
  dracoBuffer.Init(new Int8Array(bin), bin.byteLength)

  // Create a buffer to hold the encoded data.
  const dracoDecoder = new decoderModule.Decoder()
  const geometryType = dracoDecoder.GetEncodedGeometryType(dracoBuffer)

  // Decode the encoded geometry.
  let dracoGeometry
  let decodingStatus

  if (geometryType == decoderModule.TRIANGULAR_MESH) {
    dracoGeometry = new decoderModule.Mesh()
    decodingStatus = dracoDecoder.DecodeBufferToMesh(dracoBuffer, dracoGeometry)
  } else {
    dracoGeometry = new decoderModule.PointCloud()
    decodingStatus = dracoDecoder.DecodeBufferToPointCloud(
      dracoBuffer,
      dracoGeometry
    )
  }

  return {
    dracoBuffer,
    dracoDecoder,
    dracoGeometry,
    geometryType,
    decodingStatus
  }
}

async function getDecoderModule(options) {
  if (typeof DracoDecoderModule !== 'undefined') {
    return DracoDecoderModule
  }

  if (typeof WebAssembly !== 'object' || options.type === 'js') {
    // Asm
    await loadScript(`${options.path}draco_decoder.js`)
  } else {
    // WebAssembly
    options.wasmBinaryFile = `${options.path}draco_decoder.wasm`
    await loadScript(`${options.path}draco_wasm_wrapper.js`)
      .then(() => loadBinary(options.wasmBinaryFile))
      .then((wasmBinary) => (options.wasmBinary = wasmBinary))
  }

  return DracoDecoderModule
}

const DEFAULT_OPTIONS = {
  type: 'js',
  wasmBinaryFile: null,
  wasmBinary: null,
  path: '/',
  attributeOptions: {},
  attributeUniqueIdMap: null,
  attributeTypeMap: null
}

async function loadDraco(data, renderer, options) {
  const ctx = renderer._ctx

  const opts = Object.assign({}, DEFAULT_OPTIONS, options)
  opts.primitive = opts.primitive || ctx.Primitive.Triangles

  const bin = data instanceof ArrayBuffer ? data : await loadBinary(data)

  const dracoDecoderModule = await getDecoderModule(opts)
  const decoderModuleInstance = dracoDecoderModule()

  const {
    dracoDecoder,
    dracoGeometry,
    decodingStatus,
    geometryType,
    dracoBuffer
  } = decodeDracoFileInternal(bin, decoderModuleInstance)

  return getGeometry(
    renderer,
    decoderModuleInstance,
    dracoDecoder,
    dracoGeometry,
    decodingStatus,
    geometryType,
    dracoBuffer,
    opts.attributeUniqueIdMap,
    opts.attributeTypeMap,
    opts
  )
}

module.exports = loadDraco
