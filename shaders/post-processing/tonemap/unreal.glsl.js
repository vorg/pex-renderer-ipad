module.exports = `
// Unreal 3, Documentation: "Color Grading"
// Adapted to be close to Tonemap_ACES, with similar range
// Gamma 2.2 correction is baked in, don't use with sRGB conversion!
vec3 unreal(vec3 x) {
  //PEX: have to undo gamma
  return pow(x / (x + 0.155) * 1.019, vec3(2.2));
}

float unreal(float x) {
  //PEX: have to undo gamma
  return pow(x / (x + 0.155) * 1.019, 2.2);
}

#define tonemap unreal
`