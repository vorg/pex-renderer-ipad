import Signal from "signals";
import { vec3 } from "pex-math";

class LightHelper {
  constructor(opts) {
    this.type = "LightHelper";
    this.entity = null;
    this.changed = new Signal();
    this.dirty = false;
    this.enabled = true;

    if (opts) this.set(opts);
  }

  // this function gets called when the component is added
  // to an enity
  init(entity) {
    this.entity = entity;
  }

  set(opts) {
    Object.assign(this, opts);
    this.dirty = true;
    Object.keys(opts).forEach((prop) => this.changed.dispatch(prop));
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
  }

  getCirclePositions({ steps, axis, radius, center }) {
    const points = [];

    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const x = Math.cos(t);
      const y = Math.sin(t);
      const pos = [0, 0, 0];
      pos[axis ? axis[0] : 0] = x;
      pos[axis ? axis[1] : 1] = y;
      vec3.scale(pos, radius || 1);
      vec3.add(pos, center || [0, 0, 0]);
      points.push(pos);
    }

    const lines = points.reduce((lines, p, i) => {
      lines.push(p);
      lines.push(points[(i + 1) % points.length]);
      return lines;
    }, []);

    return lines;
  }

  getPrismPositions(opts) {
    const r = opts.radius;
    const position = opts.position || [0, 0, 0];
    // prettier-ignore
    const points = [
      [0, r, 0], [r, 0, 0],
      [0, -r, 0], [r, 0, 0],

      [0, r, 0], [-r, 0, 0],
      [0, -r, 0], [-r, 0, 0],

      [0, r, 0], [0, 0, r],
      [0, -r, 0], [0, 0, r],

      [0, r, 0], [0, 0, -r],
      [0, -r, 0], [0, 0, -r],

      [-r, 0, 0], [0, 0, -r],
      [r, 0, 0], [0, 0, -r],
      [r, 0, 0], [0, 0, r],
      [-r, 0, 0], [0, 0, r]
    ]
    points.forEach((p) => vec3.add(p, position));
    return points;
  }

  getQuadPositions(opts) {
    const w = opts.width;
    const h = opts.height;
    const position = opts.position || [0, 0, 0];
    // prettier-ignore
    const points = [
      [-1, -1, 0], [1, -1, 0],
      [1, -1, 0], [1, 1, 0],
      [1, 1, 0], [-1, 1, 0],
      [-1, 1, 0], [-1, -1, 0],
      [-1, -1, 0], [1, 1, 0],
      [-1, 1, 0], [1, -1, 0],

      [-1, -1, 0], [-1, -1, 1 / 2],
      [1, -1, 0], [1, -1, 1 / 2],
      [1, 1, 0], [1, 1, 1 / 2],
      [-1, 1, 0], [-1, 1, 1 / 2],
      [0, 0, 0], [0, 0, 1 / 2]
    ]
    points.forEach((p) => {
      p[0] *= w / 2;
      p[1] *= h / 2;
      vec3.add(p, position);
    });
    return points;
  }

  draw(geomBuilder) {
    let lType;
    lType = this.entity.getComponent("DirectionalLight");
    if (lType) {
      let dirLightTransform = this.entity.getComponent("Transform");
      const directionalLightGizmoPositions = this.getPrismPositions({
        radius: 0.3,
      }).concat(
        /* prettier-ignore */ [
          [0, 0, 0.3], [0, 0, 1],
          [0.3, 0, 0], [0.3, 0, 1],
          [-0.3, 0, 0], [-0.3, 0, 1],
          [0, 0.3, 0], [0, 0.3, 1],
          [0, -0.3, 0], [0, -0.3, 1]
        ]
      );
      directionalLightGizmoPositions.forEach((pos) => {
        vec3.multMat4(pos, dirLightTransform.modelMatrix);
        geomBuilder.addPosition(pos);
        geomBuilder.addColor(lType.color);
      });
    }
    lType = this.entity.getComponent("AreaLight");
    if (lType) {
      //area light
      let areaLightTransform = this.entity.getComponent("Transform");
      const areaLightHelperPositions = this.getQuadPositions({
        width: 1,
        height: 1,
      });
      areaLightHelperPositions.forEach((pos) => {
        vec3.multMat4(pos, areaLightTransform.modelMatrix);
        geomBuilder.addPosition(pos);
        geomBuilder.addColor(lType.color);
      });
    }
    lType = this.entity.getComponent("PointLight");
    if (lType) {
      //pointlight
      let pointLightTransform = this.entity.getComponent("Transform");
      const pointLightHelperPositions = this.getPrismPositions({
        radius: 0.2,
      }).concat(
        /* prettier-ignore */ [
        [0, 0.0, 0], [0, 0.6, 0],
        [0, -0.0, 0], [0, -0.6, 0],
        [0.0, 0, 0], [0.6, 0, 0],
        [-0.0, 0, 0], [-0.6, 0, 0],
        [0, 0, 0.0], [0, 0, 0.6],
        [0, 0, -0.0], [0, 0, -0.6]
      ]
      );
      pointLightHelperPositions.forEach((pos) => {
        vec3.multMat4(pos, pointLightTransform.modelMatrix);
        geomBuilder.addPosition(pos);
        geomBuilder.addColor(lType.color);
      });
    }
    lType = this.entity.getComponent("SpotLight");
    if (lType) {
      //spotlight
      let spotlightTransform = this.entity.getComponent("Transform");
      //the range seemed way too large ?
      const spotLightDistance = lType.range;
      const spotLightRadius = spotLightDistance * Math.tan(lType.angle);
      const spotLightHelperPositions = this.getPrismPositions({ radius: 0.2 })
        .concat([
          [0, 0, 0],
          [spotLightRadius, 0, spotLightDistance],
          [0, 0, 0],
          [-spotLightRadius, 0, spotLightDistance],
          [0, 0, 0],
          [0, spotLightRadius, spotLightDistance],
          [0, 0, 0],
          [0, -spotLightRadius, spotLightDistance],
        ])
        .concat(
          this.getCirclePositions({
            radius: spotLightRadius,
            center: [0, 0, spotLightDistance],
            steps: 64,
            axis: [0, 1],
          })
        );

      spotLightHelperPositions.forEach((pos) => {
        geomBuilder.addPosition(
          vec3.multMat4(vec3.copy(pos), spotlightTransform.modelMatrix)
        );
        geomBuilder.addColor(lType.color);
      });
    }
  }
}

// by pex-renderer convention we export factory function
// instead of the class type
export default function createLightHelper(opts) {
  return new LightHelper(opts);
}
