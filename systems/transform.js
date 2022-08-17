import { mat4, vec3, vec4 } from "pex-math";
import { aabb } from "pex-geom";

var tempMat4multQuatMat4 = mat4.create();
function mat4multQuat(m, q) {
  mat4.fromQuat(tempMat4multQuatMat4, q);
  mat4.mult(m, tempMat4multQuatMat4);
  return m;
}

function updateModelMatrix(matrix, transform) {
  mat4.identity(matrix);
  if (transform.position) mat4.translate(matrix, transform.position);
  if (transform.rotation) mat4multQuat(matrix, transform.rotation);
  if (transform.scale) mat4.scale(matrix, transform.scale);
  if (transform.matrix) mat4.mult(matrix, transform.matrix);
}

function vec4set4(v, x, y, z, w) {
  v[0] = x;
  v[1] = y;
  v[2] = z;
  v[3] = w;
  return v;
}

// TODO remove, should in AABB
function emptyAABB(a) {
  a[0][0] = Infinity;
  a[0][1] = Infinity;
  a[0][2] = Infinity;
  a[1][0] = -Infinity;
  a[1][1] = -Infinity;
  a[1][2] = -Infinity;
}

// TODO remove, should in AABB
function aabbToPoints(points, box) {
  vec4set4(points[0], box[0][0], box[0][1], box[0][2], 1);
  vec4set4(points[1], box[1][0], box[0][1], box[0][2], 1);
  vec4set4(points[2], box[1][0], box[0][1], box[1][2], 1);
  vec4set4(points[3], box[0][0], box[0][1], box[1][2], 1);
  vec4set4(points[4], box[0][0], box[1][1], box[0][2], 1);
  vec4set4(points[5], box[1][0], box[1][1], box[0][2], 1);
  vec4set4(points[6], box[1][0], box[1][1], box[1][2], 1);
  vec4set4(points[7], box[0][0], box[1][1], box[1][2], 1);
  return points;
}

function aabbFromPoints(aabb, points) {
  var min = aabb[0];
  var max = aabb[1];

  for (var i = 0, len = points.length; i < len; i++) {
    var p = points[i];
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    min[2] = Math.min(min[2], p[2]);
    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
    max[2] = Math.max(max[2], p[2]);
  }

  return aabb;
}

export default function createTransformSystem(opts) {
  const transformSystem = {
    cache: {},
    debug: false,
  };

  function updateModelMatrixHierarchy(matrix, transform) {
    // console.log("updateModelMatrixHierarchy", matrix, transform);

    mat4.identity(matrix);
    var parents = [];
    var parent = transform;
    let iter = 0;
    // log("updateModelMatrixHierarchy", iter, parent);
    while (parent) {
      // && transformSystem.cache[parent.entity.id].localModelMatrix) {
      iter++;
      // log("updateModelMatrixHierarchy", iter, parent);
      parents.unshift(parent); // TODO: GC
      parent = parent.parent;
    }
    parents.forEach((p) => {
      //TODO: there are transforms without entities ?
      if (p.entity) {
        const cachedTransform = transformSystem.cache[p.entity.id];
        //TODO: how this can be null
        if (cachedTransform) {
          mat4.mult(matrix, cachedTransform.localModelMatrix);
        }
      }
    });
  }

  //TODO: should geometry components have their own id?
  const updateTransform = (id, transform) => {
    let cachedTransform = transformSystem.cache[id];

    let needsFirstUpdate = false;
    if (!cachedTransform) {
      cachedTransform = transformSystem.cache[id] = {
        transform: transform,
        modelMatrix: mat4.create(),
        localModelMatrix: mat4.create(),
        worldPosition: [0, 0, 0],
      };
      needsFirstUpdate = true;
    }

    if (!transform.worldBounds) transform.worldBounds = aabb.create();
    if (!transform.worldPosition) transform.worldPosition = [0, 0, 0];

    // This assumes whole object has changed
    // i could do more detailed checks prop by prop
    if (
      cachedTransform.transform !== transform ||
      needsFirstUpdate ||
      transform.dirty
    ) {
      transform.dirty = false;
      if (transformSystem.debug) console.debug("update transform", transform);
      cachedTransform.transform = transform;
      if (transformSystem.debug) console.debug("update", transform);

      // console.log("localModelMatrix", cachedTransform.localModelMatrix);
      updateModelMatrix(cachedTransform.localModelMatrix, transform);
    }
  };

  const localBounds = aabb.create();
  const boundsPoints = new Array(8).fill(0).map(() => vec4.create());
  // going backwards from leaves to root
  // 1. update local bounds if i have geo
  // 2. transform them to world space
  // 3. add them to my parent worldBounds
  function updateBoundingBox(transform) {
    if (
      transform.entity &&
      transform.entity.geometry &&
      transform.entity.geometry.bounds
    ) {
      try {
        if (
          transform.entity.geometry.bounds &&
          !aabb.isEmpty(transform.entity.geometry.bounds)
        ) {
          aabbToPoints(boundsPoints, transform.entity.geometry.bounds);
          for (var i = 0; i < boundsPoints.length; i++) {
            vec3.multMat4(
              boundsPoints[i],
              transformSystem.cache[transform.entity.id].modelMatrix
            );
          }
          emptyAABB(localBounds);
          aabbFromPoints(localBounds, boundsPoints);
          aabb.includeAABB(transform.worldBounds, localBounds);
        }
      } catch (e) {
        debugger;
      }
    }
    // TODO: what if transform is immutable?
    if (transform.parent && transform.parent.worldBounds) {
      aabb.includeAABB(transform.parent.worldBounds, transform.worldBounds);
    }

    // TODO: what if transform is immutable?
    vec3.scale(transformSystem.cache[transform.entity.id].worldPosition, 0);
    vec3.multMat4(
      transformSystem.cache[transform.entity.id].worldPosition,
      transformSystem.cache[transform.entity.id].modelMatrix
    );
  }

  function update(transformEntities) {
    for (let transformEntity of transformEntities) {
      if (!transformEntity.transform.entity) {
        transformEntity.transform.entity = transformEntity;
      }
      //TODO: can we use component id, not entity id?
      updateTransform(transformEntity.id, transformEntity.transform);
      transformEntity._transform = transformSystem.cache[transformEntity.id];
    }

    //Note: this is fine as long our components are sorted by depth
    for (let transformEntity of transformEntities) {
      if (transformEntity.transform.parent) {
        mat4.set(
          transformSystem.cache[transformEntity.id].modelMatrix,
          transformSystem.cache[transformEntity.transform.parent.entity.id]
            .modelMatrix
        );
      } else {
        mat4.identity(transformSystem.cache[transformEntity.id].modelMatrix);
      }

      mat4.mult(
        transformSystem.cache[transformEntity.id].modelMatrix,
        transformSystem.cache[transformEntity.id].localModelMatrix
      );
      updateModelMatrixHierarchy(
        transformSystem.cache[transformEntity.id].modelMatrix,
        transformEntity.transform
      );
      vec3.scale(transformSystem.cache[transformEntity.id].worldPosition, 0);
      vec3.multMat4(
        transformSystem.cache[transformEntity.id].worldPosition,
        transformSystem.cache[transformEntity.id].modelMatrix
      );
    }

    for (let i = transformEntities.length - 1; i >= 0; i--) {
      const entity = transformEntities[i];
      emptyAABB(entity.transform.worldBounds);
    }

    //TODO: can we not do updateBoundingBox every frame?
    for (let i = transformEntities.length - 1; i >= 0; i--) {
      const entity = transformEntities[i];
      //TODO: check for dirty
      if (
        entity.transform.worldBounds
        //&& (entity.transform.aabbDirty || entity.transform.aabbDirty == undefined)
      ) {
        //} && aabb.isEmpty(entity.transform.worldBounds)) {
        entity.transform.aabbDirty = false;
        updateBoundingBox(entity.transform);
      }
    }
  }

  transformSystem.update = (entities) => {
    const transformEntities = entities.filter((e) => e.transform);
    update(transformEntities);
  };

  return transformSystem;
}
