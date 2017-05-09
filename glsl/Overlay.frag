#ifdef GL_ES
precision highp float;
#endif
#pragma glslify: decodeRGBM = require(../local_modules/glsl-rgbm/decode)
#pragma glslify: toGamma = require(glsl-gamma/out)
#pragma glslify: toLinear = require(glsl-gamma/in)

uniform vec2 uScreenSize;
uniform sampler2D uOverlay;
uniform float uExposure;
uniform bool uHDR;

void main() {
    vec2 texCoord = gl_FragCoord.xy / uScreenSize.xy;

    if (uHDR) {
      vec3 color = decodeRGBM(texture2D(uOverlay, texCoord));
      color *= uExposure;
      color = color / (1.0 + color);
      color = toGamma(color);
      gl_FragColor = vec4(color, 1.0);
    } else {
      vec3 color = texture2D(uOverlay, texCoord).rgb;
      gl_FragColor = vec4(color, 1.0);
    }
}
