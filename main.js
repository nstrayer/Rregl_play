// !preview r2d3 data=c(0.3, 0.6, 0.8, 0.95, 0.40, 0.20), dependencies = c('libs/regl.min.js', "helpers.js"), container = 'canvas'
//
// r2d3: https://rstudio.github.io/r2d3
//
const numPoints = 10000;
const pointWidth = 4;
const pointMargin = 1;
// duration of the animation ignoring delays
const duration = 2500;
// multiply this value by the index of a point to get its delay
const delayByIndex = 500 / numPoints;
// include max delay in here
const maxDuration = duration + delayByIndex * numPoints;

// create initial set of points
const points = createPoints(numPoints, pointWidth, width, height);

function main(err, regl) {

  // create helpers that will layout the points in different ways (see helpers.js)
  const toPhyllotaxis = points => phyllotaxisLayout(points, pointWidth + pointMargin, width / 2, height / 2);
  const toSine        = points => sineLayout(points, pointWidth + pointMargin, width, height);
  const toSpiral      = points => spiralLayout(points, pointWidth + pointMargin, width, height);
  const toRandom      = points => randomLayout(points, pointWidth, width, height);

  // set the order of the layouts and some initial animation state
  const layouts = [toPhyllotaxis, toSpiral, toRandom];
  let currentLayout = 0;
  let startTime = null; // in seconds

  // wrap d3 color scales so they produce vec3s with values 0-1
  function wrapColorScale(scale) {
    return t => {
      const rgb = d3.rgb(scale(1 - t));
      return [rgb.r / 255, rgb.g / 255, rgb.b / 255];
    };
  }

  // the order of color scales to loop through
  const colorScales = [
    d3.scaleSequential(d3.interpolateViridis),
    d3.scaleSequential(d3.interpolateInferno),
    d3.scaleSequential(d3.interpolateRdYlGn),
  ].map(wrapColorScale);
  let currentColorScale = 0;

  // function to compile a draw points regl func
  function createDrawPoints(points) {
    const drawPoints = regl({
      frag: `
			// set the precision of floating point numbers
		  precision highp float;

		  // this value is populated by the vertex shader
			varying vec3 fragColor;

			void main() {
				// gl_FragColor is a special variable that holds the color of a pixel
				gl_FragColor = vec4(fragColor, 1);
			}
			`,

      vert: `
			// per vertex attributes
			attribute vec2 positionStart;
			attribute vec2 positionEnd;
			attribute float index;
			attribute vec3 colorStart;
			attribute vec3 colorEnd;

			// variables to send to the fragment shader
			varying vec3 fragColor;

			// values that are the same for all vertices
			uniform float pointWidth;
			uniform float stageWidth;
			uniform float stageHeight;
			uniform float elapsed;
			uniform float duration;
			uniform float delayByIndex;

			// helper function to transform from pixel space to normalized device coordinates (NDC)
			// in NDC (0,0) is the middle, (-1, 1) is the top left and (1, -1) is the bottom right.
			vec2 normalizeCoords(vec2 position) {
				// read in the positions into x and y vars
	      float x = position[0];
	      float y = position[1];

				return vec2(
		      2.0 * ((x / stageWidth) - 0.5),
		      // invert y since we think [0,0] is bottom left in pixel space
		      -(2.0 * ((y / stageHeight) - 0.5)));
			}

			// helper function to handle cubic easing (copied from d3 for consistency)
			// note there are pre-made easing functions available via glslify.
			float easeCubicInOut(float t) {
				t *= 2.0;
        t = (t <= 1.0 ? t * t * t : (t -= 2.0) * t * t + 2.0) / 2.0;

        if (t > 1.0) {
          t = 1.0;
        }

        return t;
			}

			void main() {
				// update the size of a point based on the prop pointWidth
				gl_PointSize = pointWidth;

				float delay = delayByIndex * index;

				// number between 0 and 1 indicating how far through the animation this
				// vertex is.
	      float t;

	      // drawing without animation, so show end state immediately
	      if (duration == 0.0) {
	        t = 1.0;

	      // still delaying before animating
	      } else if (elapsed < delay) {
	        t = 0.0;

	      // otherwise we are animating, so use cubic easing
	      } else {
	        t = easeCubicInOut((elapsed - delay) / duration);
	      }

				// interpolate position
	      vec2 position = mix(positionStart, positionEnd, t);

	      // interpolate and send color to the fragment shader
	      fragColor = mix(colorStart, colorEnd, t);

				// scale to normalized device coordinates
				// gl_Position is a special variable that holds the position of a vertex
	      gl_Position = vec4(normalizeCoords(position), 0.0, 1.0);
			}
			`,

      attributes: {
        positionStart: points.map(d => [d.sx, d.sy]),
        positionEnd: points.map(d => [d.x, d.y]),
        colorStart: points.map(d => d.colorStart),
        colorEnd: points.map(d => d.colorEnd),
        index: d3.range(points.length),
      },

      uniforms: {
        pointWidth: regl.prop('pointWidth'),
        stageWidth: regl.prop('stageWidth'),
        stageHeight: regl.prop('stageHeight'),
        delayByIndex: regl.prop('delayByIndex'),
        duration: regl.prop('duration'),

        // time in milliseconds since the prop startTime (i.e. time elapsed)
        elapsed: ({ time }, { startTime = 0 }) => (time - startTime) * 1000,
      },

      count: points.length,
      primitive: 'points',
    });

    return drawPoints;
  }

  // start animation loop (note: time is in seconds)
  function animate(layout, points) {
    
    // Swap positions as neccesary 
    setupNewTransition(points, layout, colorScales[currentColorScale]);

    // create the regl function with the new start and end points
    const drawPoints = createDrawPoints(points);

    const frameLoop = regl.frame(({ time }) => {
      if (startTime === null) {
        startTime = time;
      }

      // clear the buffer
      regl.clear({
        color: [1, 1, 1, 1],
        depth: 1,
      });

      // draw the points using our created regl func
      drawPoints({
        pointWidth,
        stageWidth: width,
        stageHeight: height,
        duration,
        delayByIndex,
        startTime,
      });

      // if we have exceeded the maximum duration, move on to the next animation
      if (time - startTime > maxDuration / 1000) {
        // Stop current animation loop
        frameLoop.cancel();
        // Update to the next layout
        currentLayout = (currentLayout + 1) % layouts.length;
        // Get the new color scale
        currentColorScale = (currentColorScale + 1) % colorScales.length;
        // Reset start time
        startTime = null;
        // Kickoff the new animation
        animate(layouts[currentLayout], points);
      }
    });
  }




  animate(layouts[currentLayout], points);
}

// initialize regl
createREGL({
  // callback when regl is initialized
  onDone: main,
});