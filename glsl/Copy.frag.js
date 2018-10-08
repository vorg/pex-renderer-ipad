module.exports = `
precision highp float;

uniform sampler2D colorTex;
varying vec2 vTexCoord0;

void main() {
  gl_FragColor = texture2D(colorTex, vTexCoord0);
}
`
