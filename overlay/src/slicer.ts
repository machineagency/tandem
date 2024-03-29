import { IR } from './type-utils';
import * as paper from 'paper'

type SliceMap = Record<Depth, Slice>;
type Depth = number;
type Slice = paper.Path;
type SectionAxis = 'x' | 'y'

interface Vec3 {
    x: number;
    y: number;
    z: number;
};
interface Segment3 {
    v1: Vec3;
    v2: Vec3;
};
interface Plane3 {
    v: Vec3;
    n: Ray3;
}
interface Ray3 {
    v: Vec3;
    j: Vec3;
}
type Intersect = Vec3 | Segment3;
function intersectIsVec3(intersect: Intersect): intersect is Vec3 {
    return intersect.hasOwnProperty('x')
            && intersect.hasOwnProperty('y')
            && intersect.hasOwnProperty('z');

}
function intersectIsSegment3(intersect: Intersect): intersect is Segment3 {
    return intersect.hasOwnProperty('v1')
            && intersect.hasOwnProperty('v2')
}

interface Vec2 {
    x: number;
    y: number;
};
type Plane2Vecs = Vec2[];

export function slice(toolpath: IR[], depths: Depth[]): SliceMap {
    let segments = toolpathSegments(toolpath);
    let planes = makePlanesAtDepths(depths);
    let intersectsPerDepth = planes.map((plane) => {
        return [
            plane.v.z,
            segments.map(seg => findIntersect(seg, plane))
        ];
    });
    let hullPerDepth = intersectsPerDepth.map((pair) => {
        let depth = pair[0] as number;
        let intersects = pair[1] as Intersect[];
        let projectIntersect = (intersect: Intersect): Vec2 | Vec2[] => {
            if (intersectIsSegment3(intersect)) {
                return [
                    {
                        x: intersect.v1.x,
                        y: intersect.v1.y
                    },
                    {
                        x: intersect.v2.x,
                        y: intersect.v2.y
                    }

                ];
            }
            else {
                return {
                    x: intersect.x,
                    y: intersect.y
                }
            }
        };
        let plane2Vecs = intersects.map(projectIntersect).flat();
        return [
            depth,
            findHull(plane2Vecs)
        ]
    });
    let pathPerDepth = hullPerDepth.map(pair => {
        let depth = pair[0] as number;
        let hull = pair[1] as Plane2Vecs;
        return [
            depth,
            makeSliceFromHull(hull)
        ]
    });
    return Object.fromEntries(pathPerDepth);
}

/**
 * Generates a 2D visualization of the 3D toolpath from the side. We generate
 * this toolpath by projecting toolpath moves onto a vertical plane.
 * @param toolpath A toolpath as represented by an array of IR objects.
 * @param sectionAxis The axis ('x' or 'y') from which we view the toolpath.
 * @returns A paper.js path representing the section.
 */
export function sideProfile(toolpath: IR[], sectionAxis: SectionAxis): paper.Path {
    // TODO: Thrisha implement
    return new paper.Path();
}

function toolpathSegments(toolpath: IR[]): Segment3[] {
    // The below code is adapted from Thrisha's basicViz.
    let currentPos = { x: 0, y: 0, z: 0 };
    let previousPos = { x: 0, y: 0, z: 0 };
    let segments: Segment3[] = [];

    toolpath.forEach((ir) => {
      let newPos = {
        x: ir.args.x || currentPos.x,
        y: ir.args.y || currentPos.y,
        z: ir.args.z || currentPos.z
      };

      // FIXME: we currently cheat and just turn arcs into two segments
      if (ir.op === "arc" && ir.args.dx !== null && ir.args.dy !== null) {
        // ending point of the arc is newPos
        // current position should be the starting point of the arc

        // calculate through point of the arc
        let radius = Math.sqrt(Math.pow(ir.args.dx, 2) + Math.pow(ir.args.dy, 2));
        let center = {
            x: currentPos.x + ir.args.dx,
            y: currentPos.y + ir.args.dy,
            z: currentPos.z
        };
        let throughPt;
        if (ir.state.clockwise === 1) {
          throughPt = { x: center.x - radius, y: center.y, z: center.z };
        } else {
          throughPt = { x: center.x + radius, y: center.y, z: center.z };
        }
        let seg1 = {
            v1: currentPos,
            v2: throughPt
        };
        let seg2 = {
            v1: throughPt,
            v2: newPos
        };
        segments.push(seg1, seg2);
      }

      else {
        let seg = {
            v1: currentPos,
            v2: newPos
        }
        segments.push(seg);
      }

      previousPos = currentPos;
      currentPos = newPos;
    });
    return segments;
}

function makePlanesAtDepths(depths: Depth[]): Plane3[] {
    function planeAtDepth(depth: Depth) {
        return {
            v: { x: 0, y: 0, z: depth },
            n: {
                v: { x: 0, y: 0, z: depth },
                j: { x: 0, y: 0, z: depth + 1 }
            }
        };
    }
    return depths.map(planeAtDepth);
}

function filterSegments(segments: Segment3[], planeDepth: Depth) {
    let judgeSegment = (s: Segment3): boolean => {
        let upper = Math.max(s.v1.z, s.v2.z);
        let lower = Math.min(s.v1.z, s.v2.z);
        return planeDepth >= lower && planeDepth <= upper;
    };
    return segments.filter(judgeSegment);
}

function findIntersect(seg: Segment3, plane: Plane3): Intersect {
    return { x: 0, y: 0, z: 0 };
}

// FIXME: taking the convex hull of an entire plane of Vec2 will not
// preserve distinctions between discontinuous sets of Vec2s. This will
// produce "silhouettes" for now but we should improve this later.
function findHull(vecs: Plane2Vecs): Plane2Vecs {
    return [];
}

function makeSliceFromHull(hull: Plane2Vecs): Slice {
    return new paper.Path();
}

/*
 * Convex hull algorithm - Library (compiled from TypeScript)
 *
 * Copyright (c) 2021 Project Nayuki
 * https://www.nayuki.io/page/convex-hull-algorithm
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program (see COPYING.txt and COPYING.LESSER.txt).
 * If not, see <http://www.gnu.org/licenses/>.
 */
interface HullBuilder {
    makeHull: (vecs: Vec2[]) => Vec2[];
    makeHullPresorted: (vecs: Vec2[]) => Vec2[];
    POINT_COMPARATOR: (a: Vec2, b: Vec2) => -1 | 0 | 1;
};
const hullBuilder: HullBuilder = (function (convexhull: HullBuilder) {
    // Returns a new array of points representing the convex hull of
    // the given set of points. The convex hull excludes collinear points.
    // This algorithm runs in O(n log n) time.
    function makeHull(points: Vec2[]) {
      var newPoints = points.slice();
      newPoints.sort(convexhull.POINT_COMPARATOR);
      return convexhull.makeHullPresorted(newPoints);
    }
    convexhull.makeHull = makeHull;
    // Returns the convex hull, assuming that each points[i] <= points[i + 1]. Runs in O(n) time.
    function makeHullPresorted(points: Vec2[]) {
      if (points.length <= 1) return points.slice();
      // Andrew's monotone chain algorithm. Positive y coordinates correspond to "up"
      // as per the mathematical convention, instead of "down" as per the computer
      // graphics convention. This doesn't affect the correctness of the result.
      var upperHull = [];
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        while (upperHull.length >= 2) {
          var q = upperHull[upperHull.length - 1];
          var r = upperHull[upperHull.length - 2];
          if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x))
            upperHull.pop();
          else break;
        }
        upperHull.push(p);
      }
      upperHull.pop();
      var lowerHull = [];
      for (var i = points.length - 1; i >= 0; i--) {
        var p = points[i];
        while (lowerHull.length >= 2) {
          var q = lowerHull[lowerHull.length - 1];
          var r = lowerHull[lowerHull.length - 2];
          if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x))
            lowerHull.pop();
          else break;
        }
        lowerHull.push(p);
      }
      lowerHull.pop();
      if (
        upperHull.length == 1 &&
        lowerHull.length == 1 &&
        upperHull[0].x == lowerHull[0].x &&
        upperHull[0].y == lowerHull[0].y
      )
        return upperHull;
      else return upperHull.concat(lowerHull);
    }
    convexhull.makeHullPresorted = makeHullPresorted;
    function POINT_COMPARATOR(a: Vec2, b: Vec2) {
      if (a.x < b.x) return -1;
      else if (a.x > b.x) return +1;
      else if (a.y < b.y) return -1;
      else if (a.y > b.y) return +1;
      else return 0;
    }
    convexhull.POINT_COMPARATOR = POINT_COMPARATOR;
    return convexhull;
  })({} as HullBuilder);