import Signal from "signals";
import { mat4 } from "pex-math";
import { reflectionProbe as SHADERS } from "pex-shaders";
import hammersley from "hammersley";

class ReflectionProbe {
  constructor(opts) {
    this.type = "ReflectionProbe";
    this.enabled = true;
    this.changed = new Signal();
    this.rgbm = false;

    this.set(opts);

    const ctx = opts.ctx;
    this._ctx = ctx;
    this.dirty = true;

    const CUBEMAP_SIZE = 512;
    const dynamicCubemap = (this._dynamicCubemap = ctx.textureCube({
      width: CUBEMAP_SIZE,
      height: CUBEMAP_SIZE,
      pixelFormat: this.rgbm ? ctx.PixelFormat.RGBA8 : ctx.PixelFormat.RGBA,
      encoding: this.rgbm ? ctx.Encoding.RGBM : ctx.Encoding.Linear,
    }));

    const sides = [
      { eye: [0, 0, 0], target: [1, 0, 0], up: [0, -1, 0] },
      { eye: [0, 0, 0], target: [-1, 0, 0], up: [0, -1, 0] },
      { eye: [0, 0, 0], target: [0, 1, 0], up: [0, 0, 1] },
      { eye: [0, 0, 0], target: [0, -1, 0], up: [0, 0, -1] },
      { eye: [0, 0, 0], target: [0, 0, 1], up: [0, -1, 0] },
      { eye: [0, 0, 0], target: [0, 0, -1], up: [0, -1, 0] },
    ].map((side, i) => {
      side.projectionMatrix = mat4.perspective(
        mat4.create(),
        Math.PI / 2,
        1,
        0.1,
        100
      ); // TODO: change this to radians
      side.viewMatrix = mat4.lookAt(
        mat4.create(),
        side.eye,
        side.target,
        side.up
      );
      side.drawPassCmd = {
        name: "ReflectionProbe.sidePass",
        pass: ctx.pass({
          name: "ReflectionProbe.sidePass",
          color: [
            {
              texture: dynamicCubemap,
              target: ctx.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
            },
          ],
          clearColor: [0, 0, 0, 1],
          clearDepth: 1,
        }),
      };
      return side;
    });
    const quadPositions = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const quadTexCoords = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const quadFaces = [
      [0, 1, 2],
      [0, 2, 3],
    ];
    const attributes = {
      aPosition: ctx.vertexBuffer(quadPositions),
      aTexCoord: ctx.vertexBuffer(quadTexCoords),
    };

    const indices = ctx.indexBuffer(quadFaces);

    const octMap = (this._octMap = ctx.texture2D({
      width: 1024,
      height: 1024,
      pixelFormat: this.rgbm ? ctx.PixelFormat.RGBA8 : ctx.PixelFormat.RGBA,
      encoding: this.rgbm ? ctx.Encoding.RGBM : ctx.Encoding.Linear,
    }));

    const irradianceOctMapSize = 64;

    const octMapAtlas = (this._reflectionMap = ctx.texture2D({
      width: 2 * 1024,
      height: 2 * 1024,
      min: ctx.Filter.Linear,
      mag: ctx.Filter.Linear,
      pixelFormat: this.rgbm ? ctx.PixelFormat.RGBA8 : ctx.PixelFormat.RGBA,
      encoding: this.rgbm ? ctx.Encoding.RGBM : ctx.Encoding.Linear,
    }));

    const cubemapToOctMap = {
      name: "ReflectionProbe.cubemapToOctMap",
      pass: ctx.pass({
        name: "ReflectionProbe.cubemapToOctMap",
        color: [octMap],
      }),
      pipeline: ctx.pipeline({
        vert: SHADERS.fullscreenQuad.vert,
        frag: SHADERS.cubemapToOctMap.frag,
      }),
      attributes,
      indices,
      uniforms: {
        uTextureSize: octMap.width,
        uCubemap: dynamicCubemap,
      },
    };

    const convolveOctmapAtlasToOctMap = {
      name: "ReflectionProbe.convolveOctmapAtlasToOctMap",
      pass: ctx.pass({
        name: "ReflectionProbe.convolveOctmapAtlasToOctMap",
        color: [octMap],
      }),
      pipeline: ctx.pipeline({
        vert: SHADERS.fullscreenQuad.vert,
        frag: SHADERS.convolveOctMapAtlasToOctMap.frag,
      }),
      attributes,
      indices,
      uniforms: {
        uTextureSize: irradianceOctMapSize,
        uSource: octMapAtlas,
        uSourceSize: octMapAtlas.width,
        uSourceEncoding: octMapAtlas.encoding,
        uOutputEncoding: octMap.encoding,
      },
    };

    const clearOctMapAtlasCmd = {
      name: "ReflectionProbe.clearOctMapAtlas",
      pass: ctx.pass({
        name: "ReflectionProbe.clearOctMapAtlas",
        color: [octMapAtlas],
        clearColor: [0, 0, 0, 0],
      }),
    };

    const blitToOctMapAtlasCmd = {
      name: "ReflectionProbe.blitToOctMapAtlasCmd",
      pass: ctx.pass({
        name: "ReflectionProbe.blitToOctMapAtlasCmd",
        color: [octMapAtlas],
      }),
      pipeline: ctx.pipeline({
        vert: SHADERS.fullscreenQuad.vert,
        frag: SHADERS.blitToOctMapAtlas.frag,
      }),
      uniforms: {
        uSource: octMap,
        uSourceSize: octMap.width,
      },
      attributes,
      indices,
    };

    const downsampleFromOctMapAtlasCmd = {
      name: "ReflectionProbe.downsampleFromOctMapAtlasCmd",
      pass: ctx.pass({
        name: "ReflectionProbe.downsampleFromOctMapAtlasCmd",
        color: [octMap],
        clearColor: [0, 1, 0, 1],
      }),
      pipeline: ctx.pipeline({
        vert: SHADERS.fullscreenQuad.vert,
        frag: SHADERS.downsampleFromOctMapAtlas.frag,
      }),
      uniforms: {
        uSource: octMapAtlas,
        uSourceSize: octMapAtlas.width,
      },
      attributes,
      indices,
    };

    const prefilterFromOctMapAtlasCmd = {
      name: "ReflectionProbe.prefilterFromOctMapAtlasCmd",
      pass: ctx.pass({
        name: "ReflectionProbe.prefilterFromOctMapAtlasCmd",
        color: [octMap],
        clearColor: [0, 1, 0, 1],
      }),
      pipeline: ctx.pipeline({
        vert: SHADERS.fullscreenQuad.vert,
        frag: SHADERS.prefilterFromOctMapAtlas.frag,
      }),
      uniforms: {
        uSource: octMapAtlas,
        uSourceSize: octMapAtlas.width,
        uSourceEncoding: octMapAtlas.encoding,
        uOutputEncoding: octMap.encoding,
      },
      attributes,
      indices,
    };

    const numSamples = 128;
    const hammersleyPointSet = new Float32Array(4 * numSamples);
    for (let i = 0; i < numSamples; i++) {
      const p = hammersley(i, numSamples);
      hammersleyPointSet[i * 4] = p[0];
      hammersleyPointSet[i * 4 + 1] = p[1];
      hammersleyPointSet[i * 4 + 2] = 0;
      hammersleyPointSet[i * 4 + 3] = 0;
    }

    const hammersleyPointSetMap = ctx.texture2D({
      data: hammersleyPointSet,
      width: 1,
      height: numSamples,
      pixelFormat: ctx.PixelFormat.RGBA32F,
      encoding: ctx.Encoding.Linear,
    });

    function blitToOctMapAtlasLevel(
      mipmapLevel,
      roughnessLevel,
      sourceRegionSize
    ) {
      const width = octMapAtlas.width;
      const levelSize = Math.max(
        64,
        width / (2 << (mipmapLevel + roughnessLevel))
      );
      const roughnessLevelWidth = width / (2 << roughnessLevel);
      const vOffset = width - 2 ** (Math.log2(width) - roughnessLevel);
      const hOffset =
        2 * roughnessLevelWidth -
        2 ** (Math.log2(2 * roughnessLevelWidth) - mipmapLevel);
      ctx.submit(blitToOctMapAtlasCmd, {
        viewport: [hOffset, vOffset, levelSize, levelSize],
        uniforms: {
          uLevelSize: levelSize,
          uSourceRegionSize: sourceRegionSize,
        },
      });
    }

    function downsampleFromOctMapAtlasLevel(
      mipmapLevel,
      roughnessLevel,
      targetRegionSize
    ) {
      ctx.submit(downsampleFromOctMapAtlasCmd, {
        viewport: [0, 0, targetRegionSize, targetRegionSize],
        uniforms: {
          uMipmapLevel: mipmapLevel,
          uRoughnessLevel: roughnessLevel,
        },
      });
    }

    function prefilterFromOctMapAtlasLevel(
      sourceMipmapLevel,
      sourceRoughnessLevel,
      roughnessLevel,
      targetRegionSize
    ) {
      ctx.submit(prefilterFromOctMapAtlasCmd, {
        viewport: [0, 0, targetRegionSize, targetRegionSize],
        uniforms: {
          uSourceMipmapLevel: sourceMipmapLevel,
          uSourceRoughnessLevel: sourceRoughnessLevel,
          uRoughnessLevel: roughnessLevel,
          uNumSamples: numSamples,
          uHammersleyPointSetMap: hammersleyPointSetMap,
        },
      });
    }

    this.update = function (drawScene) {
      if (!drawScene) return;
      this.dirty = false;

      sides.forEach((side) => {
        ctx.submit(side.drawPassCmd, () =>
          drawScene(side, dynamicCubemap.encoding)
        );
      });

      ctx.submit(cubemapToOctMap);

      ctx.submit(clearOctMapAtlasCmd);

      // mipmap levels go horizontally
      // roughness levels go vertically

      const maxLevel = 5;
      blitToOctMapAtlasLevel(0, 0, octMap.width);

      for (let i = 0; i < maxLevel - 1; i++) {
        downsampleFromOctMapAtlasLevel(i, 0, octMap.width / 2 ** (i + 1));
        blitToOctMapAtlasLevel(i + 1, 0, octMap.width / 2 ** (1 + i));
      }
      blitToOctMapAtlasLevel(maxLevel, 0, 64);

      for (let i = 1; i <= maxLevel; i++) {
        // prefilterFromOctMapAtlasLevel(i, 0, i, Math.max(64, octMap.width / Math.pow(2, i + 1)))
        prefilterFromOctMapAtlasLevel(
          0,
          Math.max(0, i - 1),
          i,
          Math.max(64, octMap.width / 2 ** (i + 1))
        );
        blitToOctMapAtlasLevel(0, i, Math.max(64, octMap.width / 2 ** (1 + i)));
      }

      ctx.submit(convolveOctmapAtlasToOctMap, {
        viewport: [0, 0, irradianceOctMapSize, irradianceOctMapSize],
      });

      ctx.submit(blitToOctMapAtlasCmd, {
        viewport: [
          octMapAtlas.width - irradianceOctMapSize,
          octMapAtlas.height - irradianceOctMapSize,
          irradianceOctMapSize,
          irradianceOctMapSize,
        ],
        uniforms: {
          uSourceRegionSize: irradianceOctMapSize,
        },
      });
    };
  }

  init(entity) {
    this.entity = entity;
  }

  set(opts) {
    Object.assign(this, opts);
    Object.keys(opts).forEach((prop) => this.changed.dispatch(prop));
  }
}

export default (opts = {}) => {
  return {
    ...opts,
  };
  // return new ReflectionProbe(opts);
};
