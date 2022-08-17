import { pipeline as SHADERS, chunks as SHADERS_CHUNKS } from "pex-shaders";
import { patchVS, patchFS } from "../utils.js";
import { vec3, vec4, mat3, mat4 } from "pex-math";
import { aabb } from "pex-geom";
import createPassDescriptors from "./renderer/passes.js";
import directionalLight from "../components/directional-light.js";

export default function createrendererSystem(opts) {
  const { ctx, resourceCache, renderGraph } = opts;

  ctx.gl.getExtension("WEBGL_color_buffer_float");
  ctx.gl.getExtension("WEBGL_color_buffer_half_float");
  ctx.gl.getExtension("EXT_color_buffer_half_float");
  ctx.gl.getExtension("EXT_color_buffer_half_float");
  ctx.gl.getExtension("EXT_shader_texture_lod");
  ctx.gl.getExtension("OES_standard_derivatives");
  ctx.gl.getExtension("WEBGL_draw_buffers");
  ctx.gl.getExtension("OES_texture_float");

  const dummyTexture2D = ctx.texture2D({ width: 4, height: 4 });
  const dummyTextureCube = ctx.textureCube({ width: 4, height: 4 });
  const tempMat4 = mat4.create(); //FIXME
  const passes = createPassDescriptors(ctx);

  let clearCmd = {
    pass: ctx.pass({
      clearColor: [0, 0, 0, 0],
      clearDepth: 1,
    }),
  };

  const pipelineCache = {};
  const programCacheMap = {
    values: [],
    getValue(flags, vert, frag) {
      for (let i = 0; i < this.values.length; i++) {
        const v = this.values[i];
        if (v.frag === frag && v.vert === vert) {
          if (v.flags.length === flags.length) {
            let found = true;
            for (let j = 0; j < flags.length; j++) {
              if (v.flags[j] !== flags[j]) {
                found = false;
                break;
              }
            }
            if (found) {
              return v.program;
            }
          }
        }
      }
      return false;
    },
    setValue(flags, vert, frag, program) {
      this.values.push({ flags, vert, frag, program });
    },
  };

  const rendererSystem = {
    cache: {},
    debug: true,
    shadowQuality: 1, //TODO: not implemented  shadowQuality
    outputEncoding: opts.outputEncoding || ctx.Encoding.Linear,
  };

  function buildProgram(vertSrc, fragSrc) {
    let program = null;
    try {
      program = ctx.program({ vert: vertSrc, frag: fragSrc });
    } catch (e) {
      console.error("pex-renderer glsl error", e, fragSrc);
      program = ctx.program({
        vert: SHADERS.error.vert,
        frag: SHADERS.error.frag,
      });
      throw e;
    }
    return program;
  }

  // prettier-ignore
  const flagDefs = [
    [["options", "depthPassOnly"], "DEPTH_PASS_ONLY", { type: "boolean" }],
    [["options", "depthPassOnly"], "USE_UNLIT_WORKFLOW", { type: "boolean" }], //force unlit in depth pass mode
    [["options", "ambientLights", "length"], "NUM_AMBIENT_LIGHTS", { type: "counter" }],
    [["options", "directionalLights", "length"], "NUM_DIRECTIONAL_LIGHTS", { type: "counter" }],
    [["options", "pointLights", "length"], "NUM_POINT_LIGHTS", { type: "counter" }],
    [["options", "spotLights", "length"], "NUM_SPOT_LIGHTS", { type: "counter" }],
    [["options", "areaLights", "length"], "NUM_AREA_LIGHTS", { type: "counter" }],
    [["options", "reflectionProbes", "length"], "USE_REFLECTION_PROBES", { type: "boolean" }],
    [["options", "useTonemapping"], "USE_TONEMAPPING", { type: "boolean" }],
    [["material", "unlit"], "USE_UNLIT_WORKFLOW", { type: "boolean", fallback: "USE_METALLIC_ROUGHNESS_WORKFLOW" }],
    [["material", "blend"], "USE_BLEND", { type: "boolean" }],
    [["skin"], "USE_SKIN"],
    [["skin", "joints", "length"], "NUM_JOINTS", { type: "counter", requires: "USE_SKIN" }],
    [["skin", "jointMatrices"], "", { uniform: "uJointMat", requires: "USE_SKIN" }],
    [["material", "baseColor"], "", { uniform: "uBaseColor"}],
    [["material", "metallic"], "", { uniform: "uMetallic"}],
    [["material", "roughness"], "", { uniform: "uRoughness"}],
    [["material", "emissiveColor"], "USE_EMISSIVE_COLOR", { uniform: "uEmissiveColor"}],
    [["material", "emissiveIntensity"], "", { uniform: "uEmissiveIntensity", default: 1}],
    [["material", "baseColorMap"], "BASE_COLOR_MAP", { type: "texture", uniform: "uBaseColorMap"}],
    [["material", "emissiveColorMap"], "EMISSIVE_COLOR_MAP", { type: "texture", uniform: "uEmissiveColorMap"}],
    [["material", "normalMap"], "NORMAL_MAP", { type: "texture", uniform: "uNormalMap"}],
    [["material", "roughnessMap"], "ROUGHNESS_MAP", { type: "texture", uniform: "uRoughnessMap"}],
    [["material", "metallicMap"], "METALLIC_MAP", { type: "texture", uniform: "uMetallicMap"}],
    [["material", "metallicRoughnessMap"], "METALLIC_ROUGHNESS_MAP", { type: "texture", uniform: "uMetallicRoughnessMap"}],
    [["material", "alphaTest"], "USE_ALPHA_TEST"],
    [["material", "alphaMap"], "ALPHA_MAP", { type: "texture", uniform: "uAlphaMap"}],
    [["material", "clearCoat"], "USE_CLEAR_COAT", { uniform: "uClearCoat"}],
    [["material", "clearCoatRoughness"], "USE_CLEAR_COAT_ROUGHNESS", { uniform: "uClearCoatRoughness"}],
    [["material", "clearCoatMap"], "CLEAR_COAT_MAP", { type: "texture", uniform: "uClearCoatMap"}],
    [["material", "clearCoatNormalMap"], "CLEAR_COAT_NORMAL_MAP", { type: "texture", uniform: "uClearCoatNormalMap"}],
    [["material", "sheenColor"], "USE_SHEEN", { uniform: "uSheenColor"}],
    [["material", "sheenRoughness"], "", { uniform: "uSheenRoughness", requires: "USE_SHEEN"}],
    [["geometry", "attributes", "aNormal"], "USE_NORMALS", { fallback: "USE_UNLIT_WORKFLOW" }],
    [["geometry", "attributes", "aTangent"], "USE_TANGENTS"],
    [["geometry", "attributes", "aTexCoord0"], "USE_TEXCOORD_0"],
    [["geometry", "attributes", "aTexCoord1"], "USE_TEXCOORD_1"],
    [["geometry", "attributes", "aOffset"], "USE_INSTANCED_OFFSET"],
    [["geometry", "attributes", "aScale"], "USE_INSTANCED_SCALE"],
    [["geometry", "attributes", "aRotation"], "USE_INSTANCED_ROTATION"],
    [["geometry", "attributes", "aColor"], "USE_INSTANCED_COLOR"],
    [["geometry", "attributes", "aVertexColor"], "USE_VERTEX_COLORS"],
  ];

  let frameCount = 0;

  function getMaterialProgramAndFlags(
    ctx,
    entity,
    options = {},
    // TODO: pass shadowQuality as option
    State
  ) {
    const { _geometry: geometry, material } = entity;

    let flags = [
      //[["ctx", "capabilities", "maxColorAttachments"], "USE_DRAW_BUFFERS"
      ctx.capabilities.maxColorAttachments > 1 && "USE_DRAW_BUFFERS",
      // (!geometry.attributes.aNormal || material.unlit) && "USE_UNLIT_WORKFLOW",
      // "USE_UNLIT_WORKFLOW",
      "SHADOW_QUALITY 2",
    ];
    let materialUniforms = {};

    for (let i = 0; i < flagDefs.length; i++) {
      const [path, defineName, opts = {}] = flagDefs[i];

      if (opts.requires && !flags.includes(opts.requires)) {
        continue;
      }

      //TODO: GC
      const obj = {
        ...entity,
        geometry,
        options,
      };
      let value = obj;

      for (let j = 0; j < path.length; j++) {
        value = value[path[j]];
      }

      if (opts.type == "counter") {
        flags.push(`${defineName} ${value}`);
      } else if (opts.type == "texture" && value) {
        flags.push(`USE_${defineName}`);
        flags.push(`${defineName}_TEX_COORD_INDEX 0`);
        materialUniforms[opts.uniform] = value.texture || value;
        if (value.texCoordTransformMatrix) {
          materialUniforms[opts.uniform + "TexCoordTransform"] =
            value.texCoordTransformMatrix;
        }
      } else if (value !== undefined || opts.default !== undefined) {
        if (opts.type !== "boolean" || value) {
          flags.push(defineName);
        } else {
          if (opts.fallback) {
            flags.push(opts.fallback);
          }
        }
        if (opts.uniform) {
          materialUniforms[opts.uniform] =
            value !== undefined ? value : opts.default;
        }
      } else if (opts.fallback) {
        flags.push(opts.fallback);
      }
    }

    let { vert, frag } = material;

    vert ||= SHADERS.material.vert;
    frag ||= SHADERS.material.frag;
    return {
      flags: flags
        .flat()
        .filter(Boolean)
        .map((flag) => `#define ${flag}`),
      vert,
      frag,
      materialUniforms,
    };
  }

  function getExtensions() {
    return ctx.capabilities.isWebGL2
      ? ""
      : /* glsl */ `
#extension GL_OES_standard_derivatives : require
${
  ctx.capabilities.maxColorAttachments > 1
    ? `#extension GL_EXT_draw_buffers : enable`
    : ""
}
`;
  }

  function parseShader(string, options) {
    // Unroll loop
    const unrollLoopPattern =
      /#pragma unroll_loop[\s]+?for \(int i = (\d+); i < (\d+|\D+); i\+\+\) \{([\s\S]+?)(?=\})\}/g;

    string = string.replace(unrollLoopPattern, (match, start, end, snippet) => {
      let unroll = "";

      // Replace lights number
      end = end
        .replace(/NUM_AMBIENT_LIGHTS/g, options.ambientLights.length || 0)
        .replace(
          /NUM_DIRECTIONAL_LIGHTS/g,
          options.directionalLights.length || 0
        )
        .replace(/NUM_POINT_LIGHTS/g, options.pointLights.length || 0)
        .replace(/NUM_SPOT_LIGHTS/g, options.spotLights.length || 0)
        .replace(/NUM_AREA_LIGHTS/g, options.areaLights.length || 0);

      for (let i = Number.parseInt(start); i < Number.parseInt(end); i++) {
        unroll += snippet.replace(/\[i\]/g, `[${i}]`);
      }

      return unroll;
    });

    return string;
  }

  function getMaterialProgram(ctx, entity, options) {
    const { flags, vert, frag, materialUniforms } = getMaterialProgramAndFlags(
      ctx,
      entity,
      options
    );
    const extensions = getExtensions();
    const flagsStr = `${flags.join("\n")}\n`;
    entity._flags = flags;
    const vertSrc = flagsStr + vert;
    const fragSrc = extensions + flagsStr + frag;
    let program = programCacheMap.getValue(flags, vert, frag);
    try {
      if (!program) {
        console.log("render-system", "New program", flags, entity);
        program = buildProgram(
          parseShader(
            ctx.capabilities.isWebGL2 ? patchVS(vertSrc) : vertSrc,
            options
          ),
          parseShader(
            ctx.capabilities.isWebGL2 ? patchFS(fragSrc, 3) : fragSrc,
            options
          )
        );
        programCacheMap.setValue(flags, vert, frag, program);
      }
    } catch (e) {
      console.error(e);
      console.log(vert);
      // console.log(frag);
    }
    return { program, materialUniforms };
  }

  function getGeometryPipeline(ctx, entity, opts) {
    const { material, _geometry: geometry } = entity;
    const { program, materialUniforms } = getMaterialProgram(ctx, entity, opts);
    if (!pipelineCache) {
      pipelineCache = {};
    }
    const hash = `${material.id}_${program.id}_${geometry.primitive}`;
    let pipeline = pipelineCache[hash];
    if (!pipeline || material.needsPipelineUpdate) {
      material.needsPipelineUpdate = false;
      pipeline = ctx.pipeline({
        program,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
        depthFunc: material.depthFunc || ctx.DepthFunc.Less,
        blend: material.blend,
        blendSrcRGBFactor: material.blendSrcRGBFactor,
        blendSrcAlphaFactor: material.blendSrcAlphaFactor,
        blendDstRGBFactor: material.blendDstRGBFactor,
        blendDstAlphaFactor: material.blendDstAlphaFactor,
        cullFace: material.cullFace !== undefined ? material.cullFace : true,
        cullFaceMode: material.cullFaceMode || ctx.Face.Back,
        primitive: geometry.primitive || ctx.Primitive.Triangles,
      });
      pipelineCache[hash] = pipeline;
    }

    return { pipeline, materialUniforms };
  }

  function drawMeshes(
    cameraEntity,
    shadowMapping,
    shadowMappingLight,
    entities,
    renderableEntities,
    skybox,
    forward
  ) {
    const camera = cameraEntity?.camera;
    // if (!cameraEntity._transform) {
    // camera not ready yet
    // return;
    // }

    const sharedUniforms = {
      uOutputEncoding: rendererSystem.outputEncoding,
    };

    // prettier-ignore
    const ambientLights = shadowMapping ? [] : entities.filter((e) => e.ambientLight);
    // prettier-ignore
    const directionalLights = shadowMapping ? [] : entities.filter((e) => e.directionalLight);
    // prettier-ignore
    const pointLights = shadowMapping ? [] : entities.filter((e) => e.pointLight);
    // prettier-ignore
    const spotLights = shadowMapping ? [] : entities.filter((e) => e.spotLight);
    // prettier-ignore
    const areaLights = shadowMapping ? [] : entities.filter((e) => e.areaLight);
    // prettier-ignore
    const reflectionProbes = shadowMapping ? [] : entities.filter((e) => e.reflectionProbe);

    const opaqueEntities = renderableEntities.filter((e) => !e.material.blend);

    //TODO: add some basic sorting of transparentEntities
    // prettier-ignore
    const transparentEntities = shadowMapping ? [] : renderableEntities.filter((e) => e.material.blend);

    // sharedUniforms.uCameraPosition = camera.entity.transform.worldPosition;
    if (shadowMappingLight) {
      sharedUniforms.uProjectionMatrix = shadowMappingLight._projectionMatrix;
      sharedUniforms.uViewMatrix = shadowMappingLight._viewMatrix;
      sharedUniforms.uInverseViewMatrix = mat4.create();
      sharedUniforms.uCameraPosition = [0, 0, 5];
    } else {
      sharedUniforms.uProjectionMatrix = camera.projectionMatrix;
      sharedUniforms.uViewMatrix = camera.viewMatrix;
      sharedUniforms.uInverseViewMatrix =
        camera.invViewMatrix || camera.inverseViewMatrix; //TODO: settle on invViewMatrix
      sharedUniforms.uCameraPosition =
        cameraEntity.camera.position || cameraEntity.transform.worldPosition; //TODO: ugly
    }

    ambientLights.forEach((lightEntity, i) => {
      // console.log(
      //   "lightEntity.ambientLight.color",
      //   lightEntity.ambientLight.color
      // );
      sharedUniforms[`uAmbientLights[${i}].color`] =
        lightEntity.ambientLight.color;
    });

    /*
    const light = lightEntity.directionalLight;
    const dir4 = [0, 0, 0, 1]; // TODO: GC
    const dir = [0, 0, 0];
    vec4.multMat4(dir4, lightEntity._transform.modelMatrix);
    vec3.set(dir, dir4);
    vec3.scale(dir, -1);
    vec3.normalize(dir);

    const position = lightEntity._transform.worldPosition;
    const target = [0, 0, 0, 0];
    const up = [0, 1, 0, 0];
    vec4.multMat4(up, lightEntity._transform.modelMatrix);
    if (!light._viewMatrix) {
      light._viewMatrix = mat4.create();
    }
    mat4.lookAt(light._viewMatrix, position, target, up);
    */

    directionalLights.forEach((lightEntity, i) => {
      const light = lightEntity.directionalLight;
      // const dir4 = [0, 0, 0]; // TODO: GC
      // const dir = [0, 0, 0];
      const dir = [...lightEntity._transform.worldPosition];
      vec3.scale(dir, -1);
      vec3.normalize(dir);
      // vec4.multMat4(dir4, lightEntity._transform.modelMatrix);
      // vec3.set(dir, dir4);

      let useNodeNodeOrientationLikeOldPexRenderer = true;
      if (useNodeNodeOrientationLikeOldPexRenderer) {
        const position = lightEntity._transform.worldPosition;
        const target = [0, 0, 1, 0];
        const up = [0, 1, 0];
        vec4.multMat4(target, lightEntity._transform.modelMatrix);
        vec3.add(target, position);

        vec3.set(dir, target);
        vec3.sub(dir, position);
        vec3.normalize(dir);
        // vec4.multMat4(up, lightEntity._transform.modelMatrix);
        if (!light._viewMatrix) {
          light._viewMatrix = mat4.create();
        }
        mat4.lookAt(light._viewMatrix, position, target, up);
      } else {
        const position = lightEntity._transform.worldPosition;
        const target = [0, 0, 0];
        const up = [0, 1, 0, 0];
        vec4.multMat4(up, lightEntity._transform.modelMatrix);
        if (!light._viewMatrix) {
          light._viewMatrix = mat4.create();
        }
        mat4.lookAt(light._viewMatrix, position, target, up);
      }

      // prettier-ignore
      {
      sharedUniforms[`uDirectionalLights[${i}].direction`] = dir;
      sharedUniforms[`uDirectionalLights[${i}].color`] = light.color.map((c, j) => {
        if (j < 3)
          return Math.pow(
            c * light.intensity,
            1.0 / 2.2
          );
        else return c;
      });;
      sharedUniforms[`uDirectionalLights[${i}].castShadows`] = light.castShadows;
      sharedUniforms[`uDirectionalLights[${i}].projectionMatrix`] = light._projectionMatrix || tempMat4; //FIXME
      sharedUniforms[`uDirectionalLights[${i}].viewMatrix`] = light._viewMatrix || tempMat4; //FIXME;
      sharedUniforms[`uDirectionalLights[${i}].near`] = light._near || 0.1;
      sharedUniforms[`uDirectionalLights[${i}].far`] = light._far || 100;
      sharedUniforms[`uDirectionalLights[${i}].bias`] = light.bias || 0.1;
      sharedUniforms[`uDirectionalLights[${i}].shadowMapSize`] = light.castShadows ? [light._shadowMap.width, light._shadowMap.height] : [0, 0];
      sharedUniforms[`uDirectionalLightShadowMaps[${i}]`] = light.castShadows ? light._shadowMap : dummyTexture2D;
      }
    });

    if (reflectionProbes.length > 0) {
      // && reflectionProbes[0]._reflectionMap) {
      sharedUniforms.uReflectionMap =
        reflectionProbes[0]._reflectionProbe._reflectionMap;
      sharedUniforms.uReflectionMapEncoding =
        reflectionProbes[0]._reflectionProbe._reflectionMap.encoding;
    }

    const geometryPasses = [opaqueEntities, transparentEntities];

    for (let passIndex = 0; passIndex < geometryPasses.length; passIndex++) {
      const passEntities = geometryPasses[passIndex];

      // Draw skybox before transparent meshes
      if (
        passEntities == transparentEntities &&
        skybox &&
        !shadowMappingLight
      ) {
        skybox.draw(camera, {
          outputEncoding: sharedUniforms.uOutputEncoding,
          backgroundMode: true,
        });
      }

      for (let i = 0; i < passEntities.length; i++) {
        const renderableEntity = passEntities[i];
        const {
          _geometry: geometry,
          _transform: transform,
          material,
          skin,
        } = renderableEntity;
        const cachedUniforms = {};
        cachedUniforms.uModelMatrix = transform.modelMatrix; //FIXME: bypasses need for transformSystem access
        cachedUniforms.uNormalScale = 1;
        cachedUniforms.uAlphaTest = material.alphaTest || 1;
        cachedUniforms.uAlphaMap = material.alphaMap;
        cachedUniforms.uReflectance =
          material.reflectance !== undefined ? material.reflectance : 0.5;
        cachedUniforms.uExposure = 1.0;

        cachedUniforms.uPointSize = 1;
        cachedUniforms.uMetallicRoughnessMap = material.metallicRoughnessMap;
        renderableEntity._uniforms = cachedUniforms;

        const { pipeline, materialUniforms } = getGeometryPipeline(
          ctx,
          renderableEntity,
          {
            ambientLights,
            directionalLights,
            pointLights,
            spotLights,
            areaLights,
            reflectionProbes,
            depthPassOnly: shadowMapping,
            useSSAO: false,
            // postProcessingCmp &&
            // postProcessingCmp.enabled &&
            // postProcessingCmp.ssao,
            useTonemapping: false, //!(postProcessingCmp && postProcessingCmp.enabled),
          }
        );

        Object.assign(cachedUniforms, sharedUniforms);
        Object.assign(cachedUniforms, materialUniforms);

        // FIXME: this is expensive and not cached
        let viewMatrix;
        if (shadowMappingLight) {
          viewMatrix = shadowMappingLight._viewMatrix;
        } else {
          viewMatrix = camera.viewMatrix;
        }

        const normalMat = mat4.copy(viewMatrix);
        mat4.mult(normalMat, transform.modelMatrix);
        mat4.invert(normalMat);
        mat4.transpose(normalMat);
        cachedUniforms.uNormalMatrix = mat3.fromMat4(mat3.create(), normalMat);

        const cmd = {
          name: "drawGeometry",
          attributes: geometry.attributes,
          indices: geometry.indices,
          count: geometry.count,
          pipeline,
          uniforms: cachedUniforms,
          instances: geometry.instances,
        };
        if (camera?.viewport) {
          // cmd.viewport = camera.viewport;
          // cmd.scissor = camera.viewport;
        }
        ctx.submit(cmd);
      }
    }

    //TODO: draw skybox before first transparent
  }

  // TODO remove, should be in AABB
  function aabbToPoints(bbox) {
    if (aabb.isEmpty(bbox)) return [];
    return [
      [bbox[0][0], bbox[0][1], bbox[0][2], 1],
      [bbox[1][0], bbox[0][1], bbox[0][2], 1],
      [bbox[1][0], bbox[0][1], bbox[1][2], 1],
      [bbox[0][0], bbox[0][1], bbox[1][2], 1],
      [bbox[0][0], bbox[1][1], bbox[0][2], 1],
      [bbox[1][0], bbox[1][1], bbox[0][2], 1],
      [bbox[1][0], bbox[1][1], bbox[1][2], 1],
      [bbox[0][0], bbox[1][1], bbox[1][2], 1],
    ];
  }

  rendererSystem.updateDirectionalLightShadowMap = function (
    lightEnt,
    entities,
    shadowCastingEntities
  ) {
    const light = lightEnt.directionalLight;
    // const position = lightEnt._transform.worldPosition;
    // const target = [0, 0, 1, 0];
    // const up = [0, 1, 0, 0];
    // vec4.multMat4(target, lightEnt._transform.modelMatrix);
    // vec3.add(target, position);
    // vec4.multMat4(up, lightEnt._transform.modelMatrix);
    // mat4.lookAt(light._viewMatrix, position, target, up);

    const shadowBboxPoints = shadowCastingEntities.reduce(
      (points, entity) =>
        points.concat(aabbToPoints(entity.transform.worldBounds)),
      []
    );

    // TODO: gc vec3.copy, all the bounding box creation
    const bboxPointsInLightSpace = shadowBboxPoints.map((p) =>
      vec3.multMat4(vec3.copy(p), light._viewMatrix)
    );
    const sceneBboxInLightSpace = aabb.create();
    aabb.fromPoints(sceneBboxInLightSpace, bboxPointsInLightSpace);

    // console.log("sceneBboxInLightSpace", ...sceneBboxInLightSpace);

    const lightNear = -sceneBboxInLightSpace[1][2];
    const lightFar = -sceneBboxInLightSpace[0][2];

    light._near = lightNear;
    light._far = lightFar;

    mat4.ortho(
      light._projectionMatrix,
      sceneBboxInLightSpace[0][0],
      sceneBboxInLightSpace[1][0],
      sceneBboxInLightSpace[0][1],
      sceneBboxInLightSpace[1][1],
      lightNear,
      lightFar
    );

    light.sceneBboxInLightSpace = sceneBboxInLightSpace;

    //TODO: can this be all done at once?
    let colorMap = resourceCache.texture2D(
      passes.directionalLightShadows.colorMapDesc
    );
    colorMap.name = "TempColorMap\n" + colorMap.id;

    let shadowMap = resourceCache.texture2D(
      passes.directionalLightShadows.shadowMapDesc
    );
    shadowMap.name = "ShadowMap\n" + shadowMap.id;

    //TODO: need to create new descriptor to get uniq
    let passDesc = {
      ...passes.directionalLightShadows.pass,
    };
    passDesc.color[0] = colorMap;
    passDesc.depth = shadowMap;

    let shadowMapPass = resourceCache.pass(passDesc);

    renderGraph.renderPass({
      name: "RenderShadowMap",
      pass: shadowMapPass,
      render: () => {
        drawMeshes(null, true, light, entities, shadowCastingEntities);
      },
    });

    light._shadowMap = shadowMap; // TODO: we borrow it for a frame
    // ctx.submit(shadowMapDrawCommand, () => {
    // drawMeshes(null, true, light, entities, shadowCastingEntities);
    // });
  };

  rendererSystem.patchDirectionalLight = (directionalLight) => {
    directionalLight._viewMatrix = mat4.create();
    directionalLight._projectionMatrix = mat4.create();

    //TODO: who will release those?
    // directionalLight._colorMap = ctx.texture2D({
    //   name: "directionalLightColorMap",
    //   width: 2048,
    //   height: 2048,
    //   pixelFormat: ctx.PixelFormat.RGBA8,
    //   encoding: ctx.Encoding.Linear,
    //   min: ctx.Filter.Linear,
    //   mag: ctx.Filter.Linear,
    // });

    // directionalLight._shadowMap =
    //   directionalLight._shadowMap ||
    //   ctx.texture2D({
    //     name: "directionalLightShadowMap",
    //     width: 2048,
    //     height: 2048,
    //     pixelFormat: ctx.PixelFormat.Depth,
    //     encoding: ctx.Encoding.Linear,
    //     min: ctx.Filter.Nearest,
    //     mag: ctx.Filter.Nearest,
    //   });

    // directionalLight._shadowMapDrawCommand = {
    //   name: "DirectionalLight.shadowMap",
    //   pass: ctx.pass({
    //     name: "DirectionalLight.shadowMap",
    //     color: [directionalLight._colorMap],
    //     depth: directionalLight._shadowMap,
    //     clearColor: [0, 0, 0, 1],
    //     clearDepth: 1,
    //   }),
    //   viewport: [0, 0, 2048, 2048], // TODO: viewport bug
    //   scissor: [0, 0, 2048, 2048], //TODO: disable that and try with new render pass system
    //   // colorMask: [0, 0, 0, 0] // TODO
    // };
  };

  rendererSystem.update = (entities, options = {}) => {
    ctx.submit(clearCmd);

    const rendererableEntities = entities.filter(
      (e) => e.geometry && e.material
    );

    const cameraEntities = entities.filter((e) => e.camera);
    const skyboxEntities = entities.filter((e) => e.skybox);
    const directionalLightEntities = entities.filter((e) => e.directionalLight);
    const shadowCastingEntities = rendererableEntities.filter(
      (e) => e.material.castShadows
    );

    directionalLightEntities.forEach((lightEntity) => {
      if (!lightEntity.directionalLight._viewMatrix) {
        rendererSystem.patchDirectionalLight(lightEntity.directionalLight);
      }
      if (
        lightEntity.directionalLight.castShadows &&
        options.shadowPass !== false
      ) {
        rendererSystem.updateDirectionalLightShadowMap(
          lightEntity,
          entities,
          shadowCastingEntities
        );
      }
    });

    const shadowMaps = directionalLightEntities.map((e) => {
      return e.directionalLight._shadowMap;
    });
    cameraEntities.forEach((camera) => {
      let entitiesToDraw = rendererableEntities;
      if (camera.layer) {
        entitiesToDraw = rendererableEntities.filter((e) => {
          return !e.layer || e.layer == camera.layer;
        });
      }
      //TODO: this should be done on the fly by render graph
      passes.mainPass.outputTextureDesc.width = ctx.gl.drawingBufferWidth;
      passes.mainPass.outputTextureDesc.height = ctx.gl.drawingBufferHeight;
      const mainPassOutputTexture = resourceCache.texture2D(
        passes.mainPass.outputTextureDesc
      );
      mainPassOutputTexture.name = `mainPassOutput\n${mainPassOutputTexture.id}`;

      passes.mainPass.outputDepthTextureDesc.width = ctx.gl.drawingBufferWidth;
      passes.mainPass.outputDepthTextureDesc.height =
        ctx.gl.drawingBufferHeight;
      const outputDepthTexture = resourceCache.texture2D(
        passes.mainPass.outputDepthTextureDesc
      );
      outputDepthTexture.name = `mainPassDepth\n${outputDepthTexture.id}`;

      const mainPass = resourceCache.pass({
        color: [mainPassOutputTexture],
        depth: outputDepthTexture,
        clearColor: [0, 0, 0, 1],
        clearDepth: 1,
      });
      renderGraph.renderPass({
        name: "MainPass",
        uses: [...shadowMaps],
        pass: mainPass,
        render: () => {
          drawMeshes(
            camera,
            false,
            null,
            entities,
            entitiesToDraw,
            skyboxEntities[0]?._skybox,
            true
          );
        },
      });

      const postProcessingPipeline = resourceCache.pipeline(
        passes.tonemap.pipelineDesc
      );
      const fullscreenTriangle = resourceCache.fullscreenTriangle();

      const postProcessingCmd = {
        attributes: fullscreenTriangle.attributes,
        count: fullscreenTriangle.count,
        pipeline: postProcessingPipeline,
        uniforms: {
          uViewportSize: [
            ctx.gl.drawingBufferWidth,
            ctx.gl.drawingBufferHeight,
          ],
          uTexture: mainPassOutputTexture,
        },
      };
      renderGraph.renderPass({
        name: "PostProcessingPass",
        // pass: ctx.pass({ color: [{ id: -1 }] }),
        uses: [mainPassOutputTexture],
        render: () => {
          ctx.submit(postProcessingCmd);
        },
      });
    });
  };

  return rendererSystem;
}
