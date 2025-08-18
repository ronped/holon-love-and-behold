import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import TWEEN from '@tweenjs/tween.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';

const imageExtension = ['gif','jpg','jpeg','png'];
const videoExtension = ['mpg', 'mp2', 'mpeg', 'mpe', 'mpv', 'mp4', 'webm', 'mov']

// Make a default zero displacement texture
const defaultDisplacementMap = new THREE.DataTexture( new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType,
						      THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);

const defaultTextureMap = new THREE.DataTexture( new Uint8Array(4*4).fill(255), 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType,
						 THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);

const _instanceLocalMatrix = /*@__PURE__*/ new THREE.Matrix4();
const _box3 = /*@__PURE__*/ new THREE.Box3();
const _sphere = /*@__PURE__*/ new THREE.Sphere();
const x_unit = /*@__PURE__*/ new THREE.Vector3(1,0,0);
const y_unit = /*@__PURE__*/ new THREE.Vector3(0,1,0);
const z_unit = /*@__PURE__*/ new THREE.Vector3(0,0,1);

class cloudBounds {

    constructor(geometry){
	this.geometry = geometry;
	this.lowerLeftCorner = new THREE.Vector3();
	this.lowerLeftCornerDepth = new THREE.Vector3();
	this.upperLeftCorner = new THREE.Vector3();
	this.lowerRightCorner = new THREE.Vector3();

	this.update();
    }

    update(){
	this.geometry.computeBoundingBox();
	this.lowerLeftCorner.set(this.geometry.boundingBox.min.x,
				 this.geometry.boundingBox.min.y,
				 this.geometry.boundingBox.min.z);
	this.lowerLeftCornerDepth.set(this.geometry.boundingBox.min.x,
				      this.geometry.boundingBox.min.y,
				      this.geometry.boundingBox.max.z);
	this.upperLeftCorner.set(this.geometry.boundingBox.min.x,
				 this.geometry.boundingBox.max.y,
				 this.geometry.boundingBox.min.z);
	this.lowerRightCorner.set(this.geometry.boundingBox.max.x,
				  this.geometry.boundingBox.min.y,
				  this.geometry.boundingBox.min.z);
    }

    center(){
	return this.lowerLeftCorner.clone()
            .add(this.upperLeftCorner.clone()
                 .sub(this.lowerLeftCorner)
	         .add(this.lowerRightCorner)
	         .sub(this.lowerLeftCorner)
	         .add(this.lowerLeftCornerDepth)
	         .sub(this.lowerLeftCorner)
                 .multiplyScalar(0.5));
    }

    data(){
        return {
            upperLeftCorner: this.upperLeftCorner,
            lowerLeftCorner: this.lowerLeftCorner,
            lowerLeftCornerDepth: this.lowerLeftCornerDepth,
            lowerRightCorner: this.lowerRightCorner
        }
    }

    rotateX(angle){
	this.lowerLeftCorner.applyAxisAngle(x_unit, angle);
	this.lowerLeftCornerDepth.applyAxisAngle(x_unit, angle);
	this.upperLeftCorner.applyAxisAngle(x_unit, angle);
	this.lowerRightCorner.applyAxisAngle(x_unit, angle);
    }

    rotateY(angle){
	this.lowerLeftCorner.applyAxisAngle(y_unit, angle);
	this.lowerLeftCornerDepth.applyAxisAngle(y_unit, angle);
	this.upperLeftCorner.applyAxisAngle(y_unit, angle);
	this.lowerRightCorner.applyAxisAngle(y_unit, angle);
    }

    rotateZ(angle){
	this.lowerLeftCorner.applyAxisAngle(z_unit, angle);
	this.lowerLeftCornerDepth.applyAxisAngle(z_unit, angle);
	this.upperLeftCorner.applyAxisAngle(z_unit, angle);
	this.lowerRightCorner.applyAxisAngle(z_unit, angle);
    }

    copy(from){
	this.lowerLeftCorner.copy(from.lowerLeftCorner);
	this.lowerLeftCornerDepth.copy(from.lowerLeftCornerDepth);
	this.upperLeftCorner.copy(from.upperLeftCorner);
	this.lowerRightCorner.copy(from.lowerRightCorner);
    }

};

const commonShader = `
  float random (vec3 st) {
      return fract(sin(dot(st.xyz,
                           vec3(12.9898,78.233, 42.116)))*
          43758.5453123);
  }
`;

// Mostly based on https://thebookofshaders.com/13/
const fbmShader = `
      float hash(float p) { p = fract(p * 0.011); p *= p + 7.5; p *= p + p; return fract(p); }

      float noise(vec3 x) {
          const vec3 step = vec3(110, 241, 171);

          vec3 i = floor(x);
          vec3 f = fract(x);

          // For performance, compute the base input to a 1D hash from the integer part of the argument and the
          // incremental change to the 1D based on the 3D -> 1D wrapping
          float n = dot(i, step);

          vec3 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix( hash(n + dot(step, vec3(0, 0, 0))), hash(n + dot(step, vec3(1, 0, 0))), u.x),
                         mix( hash(n + dot(step, vec3(0, 1, 0))), hash(n + dot(step, vec3(1, 1, 0))), u.x), u.y),
                     mix(mix( hash(n + dot(step, vec3(0, 0, 1))), hash(n + dot(step, vec3(1, 0, 1))), u.x),
                         mix( hash(n + dot(step, vec3(0, 1, 1))), hash(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);
      }

      #define NUM_OCTAVES 10

      float fbm(vec3 x) {
  	float v = 0.0;
  	float a = 0.5;
  	vec3 shift = vec3(100);
  	for (int i = 0; i < NUM_OCTAVES; ++i) {
  		v += a * noise(x);
  		x = x * 2.0 + shift;
  		a *= 0.5;
  	}
  	return v;
      }

      bool isNan(float val)
      {
        return (val <= 0.0 || 0.0 <= val) ? false : true;
      }

      vec3 get_st(vec3 posInCloud, vec3 posDepth, vec3 cloudHeight, vec3 cloudWidth, vec3 cloudDepth){
        vec3 st;
        vec3 cloudSize = vec3(length(cloudWidth), length(cloudHeight), length(cloudDepth));
        if (length(posInCloud) == 0.0){
          st.x = 0.0;
          st.y = 0.0;
        } else {
          float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
          st.x = length(posInCloud)*sin(pointAngle);
          st.y = length(posInCloud)*cos(pointAngle);
        }
        st.z = length(posDepth);
        st = st/cloudSize;
        return clamp(st, 0.0, 1.0);
      }

      float multi_fbm(vec3 posInCloud, vec3 posDepth, vec3 cloudHeight, vec3 cloudWidth, vec3 cloudDepth){
           vec3 st = get_st(posInCloud, posDepth, cloudHeight, cloudWidth, cloudDepth)*4.0;
           st += vec3(uTime[FBM_TIME]/3.0);
           vec3 q = vec3(0.);
           q.x = fbm( st );
           q.y = fbm( st + vec3(1.0));
           q.z = fbm( st + vec3(2.0));

           vec3 r = vec3(0.);
           float scaleTime = 3.0;
           r.x = fbm( st + 1.0*q + vec3(1.7,9.2,4.7)+ scaleTime*0.15*uTime[FBM_TIME] );
           r.y = fbm( st + 1.0*q + vec3(8.3,2.8,3.5)+ scaleTime*0.126*uTime[FBM_TIME]);
           r.z = fbm( st + 1.0*q + vec3(5.3,1.8,8.5)+ scaleTime*0.1*uTime[FBM_TIME]);

           return clamp((fbm(2.0*st+r)-0.5)*2.0, 0.0, 1.0);
      }


`;

const spiralVortexShader = `
      vec2 spiralVortexTransform(vec2 uv, float curveStrength){
          uv *= curveStrength;
          float dist = length(uv);
          float angle = atan(uv.y,uv.x);
          return vec2(cos(angle+dist*5.),dist+(uTime[FBM_TIME]*0.2));
      }
`;

const kaleidoShader = `
      // https://www.shadertoy.com/view/4sfGzs
      vec2 kaleido(vec2 uv)
      {
	float angle = atan(uv.y, uv.x);
	float r = pow(length(uv), .9);
	float f = 3.14159 / 3.5;

	angle = abs(mod(angle + f/4.0, f) - f/2.0) / (1.0 + r);
	//angle = sin(angle * 6.283 / f);

	return vec2(cos(angle), sin(angle)) * r * .1;
      }


      vec2 kaleido_transform(vec2 at)
      {
	vec2 v;
	float th = .02 * uTime[FBM_TIME];
	v.x = at.x * cos(th) - (at.y + 0.2) * sin(th);
	v.y = at.x * sin(th) + (at.y + 0.2) * cos(th);
	return v;
      }

`;

const simplexNoiseShader = `

//	Simplex 3D Noise
//	by Ian McEwan, Stefan Gustavson (https://github.com/stegu/webgl-noise)
//
vec4 permuteSimplex(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

// Simplex 2D noise
//
vec3 permuteSimplex(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permuteSimplex(permuteSimplex(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Helper function to calculate elevation at any point
float getSimplexDisplacement(vec2 pos, vec4 params) {
  float displacement = 0.0;
  float amplitude = 1.0;
  float frequency = params.x;
  float iterations = params.y;
  float wavesSpeed = params.z;
  float wavesPersistence = params.w;

  for(float i = 0.0; i < iterations; i++) {
    float noiseValue = snoise(pos * frequency + uTime[PERLIN_TIME] * wavesSpeed);
    displacement += amplitude * noiseValue;
    amplitude *= wavesPersistence;
    frequency *= 2.0;//uWavesLacunarity;
  }

  return displacement;
}
`;


const perlinNoiseShader = `

      vec3 mod289(vec3 x)
      {
        return x - floor(x * (1.0 / 289.0)) * 289.0;
      }

      vec4 mod289(vec4 x)
      {
        return x - floor(x * (1.0 / 289.0)) * 289.0;
      }

      vec4 permute(vec4 x)
      {
        return mod289(((x*34.0)+10.0)*x);
      }

      vec4 taylorInvSqrt(vec4 r)
      {
        return 1.79284291400159 - 0.85373472095314 * r;
      }

      vec3 fade(vec3 t) {
        return t*t*t*(t*(t*6.0-15.0)+10.0);
      }

      // Classic Perlin noise, periodic variant
      float pnoise(vec3 P, vec3 rep)
      {
        vec3 Pi0 = mod(floor(P), rep); // Integer part, modulo period
        vec3 Pi1 = mod(Pi0 + vec3(1.0), rep); // Integer part + 1, mod period
        Pi0 = mod289(Pi0);
        Pi1 = mod289(Pi1);
        vec3 Pf0 = fract(P); // Fractional part for interpolation
        vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
        vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
        vec4 iy = vec4(Pi0.yy, Pi1.yy);
        vec4 iz0 = Pi0.zzzz;
        vec4 iz1 = Pi1.zzzz;

        vec4 ixy = permute(permute(ix) + iy);
        vec4 ixy0 = permute(ixy + iz0);
        vec4 ixy1 = permute(ixy + iz1);

        vec4 gx0 = ixy0 * (1.0 / 7.0);
        vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
        gx0 = fract(gx0);
        vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
        vec4 sz0 = step(gz0, vec4(0.0));
        gx0 -= sz0 * (step(0.0, gx0) - 0.5);
        gy0 -= sz0 * (step(0.0, gy0) - 0.5);

        vec4 gx1 = ixy1 * (1.0 / 7.0);
        vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
        gx1 = fract(gx1);
        vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
        vec4 sz1 = step(gz1, vec4(0.0));
        gx1 -= sz1 * (step(0.0, gx1) - 0.5);
        gy1 -= sz1 * (step(0.0, gy1) - 0.5);

        vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
        vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
        vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
        vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
        vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
        vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
        vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
        vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

        vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
        g000 *= norm0.x;
        g010 *= norm0.y;
        g100 *= norm0.z;
        g110 *= norm0.w;
        vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
        g001 *= norm1.x;
        g011 *= norm1.y;
        g101 *= norm1.z;
        g111 *= norm1.w;

        float n000 = dot(g000, Pf0);
        float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
        float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
        float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
        float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
        float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
        float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
        float n111 = dot(g111, Pf1);

        vec3 fade_xyz = fade(Pf0);
        vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
        vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
        float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
        return 2.2 * n_xyz;
      }`;

const morphCloud = (Base) =>
class extends Base {

    static allObjects = [];

    static updateAll(){
	const allPromises = [];
	this.allObjects.forEach( (obj) => {
	    const retVal = obj.update();
	    if (retVal)
		allPromises.push(retVal);
	})

	return Promise.all(allPromises);
    }


    static setAllClocks(elapsedTime){
	this.allObjects.forEach( (obj) => {
	    obj.clock.start();
            obj.clock.elapsedTime = elapsedTime;
	});
    }

    static downloadAllPosMaps(){
	this.allObjects.forEach( (obj) => {
	    obj.downloadPosMaps();
	});
    }

    // Do logarithmic mapping in the U direction
    static DISPLACEMENT_MAP_LOG_U_MAPPING = 1 << 0;
    // Set the U coordinate as distance from the center
    // of the geometry
    static DISPLACEMENT_MAP_RADIAL_U_MAPPING = 1 << 1;
    // Set the U coordinate as normalised angle
    // meaning 0 degress is 0 and 360 degress is 1
    static DISPLACEMENT_MAP_ANGULAR_U_MAPPING = 1 << 2;
    // Set the V coordinate as distance from the center
    // of the geometry
    static DISPLACEMENT_MAP_RADIAL_V_MAPPING = 1 << 3;
    // Set the V coordinate as normalised angle
    // meaning 0 degress is 0 and 360 degress is 1
    static DISPLACEMENT_MAP_ANGULAR_V_MAPPING = 1 << 4;
    // Set the U coordinate of the texture as normalised
    // instance number - that is instance_id/(nr_instances)
    static DISPLACEMENT_MAP_INSTANCE_U_MAPPING = 1 << 5;
    // Set the V coordinate of the texture as normalised
    // instance number - that is instance_id/(nr_instances)
    static DISPLACEMENT_MAP_INSTANCE_V_MAPPING = 1 << 6;

    // Force displacement to be from center of the geometry
    // rather than in the direction of the normal
    static DISPLACEMENT_MAP_DISPLACE_FROM_CENTER = 1 << 8;
    // Force displacement direction to be random
    static DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM = 1 << 9;
    // Force displacement direction to be perpendicular to normal
    static DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL = 1 << 10;

    // Add perlin noise to displacement
    static DISPLACEMENT_MAP_ADD_PERLIN_NOISE = 1 << 11;
    // Add simplex noise to displacement - use xz plane position as input
    static DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE = 1 << 12;
    // Specify if XY plane for a point should be used as input
    static DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE_XY = 1 << 13;
    // Add FBM noise to displacement
    static DISPLACEMENT_MAP_ADD_FBM = 1 << 14;
    // Multiply the displacement from the map with perlin or fbm
    static DISPLACEMENT_MAP_MULTIPLY = 1 << 15;

    // Swap U and V axis of the texture
    static DISPLACEMENT_MAP_SWAP_UV = 1 << 16;
    // Use depth position for U
    static DISPLACEMENT_MAP_DEPTH_IS_U = 1 << 17;
    // Use depth position for V
    static DISPLACEMENT_MAP_DEPTH_IS_V = 1 << 18;
    // Use normal given in displacementMapNormal
    static DISPLACEMENT_MAP_USE_CUSTOM_NORMAL = 1 << 19;
    // Displace outwards perpendicular from displacementMapNormal vector
    // outwards from the line given by the vector
    static DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL = 1 << 20;
    // Signal if displacement map is enabled
    static DISPLACEMENT_MAP_ENABLE = Number(1n << 31n);

    // Signal if texture map is enabled
    static TEXTURE_MAP_ENABLE = Number(1n << 31n);
    // Add FBM noise as texture
    static TEXTURE_MAP_ADD_FBM_NOISE = 1 << 0;
    // Add Kaleidoscope effect to texture
    static TEXTURE_MAP_KALEIDO = 1 << 1;
    // Add spiral vortex effect to texture
    static TEXTURE_MAP_VORTEX = 1 << 2;
    // Blend this texture layer with point color or previous applied texture
    // using
    //
    // Averaging:
    static TEXTURE_MAP_BLEND_AVG = 1 << 16;
    // Addition with clamping:
    static TEXTURE_MAP_BLEND_ADD = 1 << 17;
    // Multiplication
    static TEXTURE_MAP_BLEND_MUL = 1 << 18;

    // Averaging alpha:
    static TEXTURE_MAP_BLEND_AVG_ALPHA = 1 << 19;
    // Addition with clamping of alpha:
    static TEXTURE_MAP_BLEND_ADD_ALPHA = 1 << 20;
    // Multiplication of alpha
    static TEXTURE_MAP_BLEND_MUL_ALPHA = 1 << 21;

    // Use uv attribute for doing texure mapping
    // If not enabled then we assume the texture map is
    // a 2-d image that we will try to project on the points
    // in the point cloud based on the cloud bounds.
    static TEXTURE_MAP_USE_UV = 1 << 4;
    // Use viewPoint uniform to make sure that texture is as if
    // projected on the backside of the bounding box from that view
    static TEXTURE_MAP_VIEW_POS_EN = 1 << 5;
    // Signal that view position is relatice to point cloud not absolute world coordinates
    static TEXTURE_MAP_VIEW_POS_RELATIVE = 1 << 6;
    // Texture color below a certain threshold is transparent
    static TEXTURE_MAP_BLACK_IS_TRANSPARENT = 1 << 7;
    // Size the texture to the view frustrum so that the size is constant
    // no matter the distance from the camera
    static TEXTURE_MAP_SIZE_TO_VIEW_FRUSTRUM = 1 << 8;

    hasAnyDisplacementMaps(){
	var found = false;
	this.descriptor.forEach( (d) => {
	    if (d.displacementMap || d.displacementMapFlags){
		found = true;
	    }
	})
	return found;
    }

    usesUvAttr(){
	var found = false;
	this.descriptor.forEach( (d) => {
	    if (d.textureMapFlags){
		if (d.textureMapFlags.constructor === Array){
		    const idx = d.textureMapFlags.findIndex((elmt) =>  (elmt & this.constructor.TEXTURE_MAP_USE_UV) != 0);
		    if (idx != -1) found = true;
		} else {
		    const match = (d.textureMapFlags & this.constructor.TEXTURE_MAP_USE_UV) != 0;
		    if (match) found = true;
		}
	    }
	})
	return found;
    }

    hasAnyTextureMaps(){
	var found = false;
	this.descriptor.forEach( (d) => {
	    if (d.textureMap || d.textureMapFlags){
		found = true;
	    }
	})
	return found;
    }

    makeMaterial() {
	const extraPointMaps = [];
	if (this instanceof THREE.Points){
	    this.material = new THREE.PointsMaterial( { vertexColors: true, color: 0xffffff, size: this.point_size, blending: THREE.NormalBlending, transparent: true, depthTest: true, alphaTest: 0.1, depthWrite: true } );
	    if (this.point_sprite_file){
		var mainSpriteFile = this.point_sprite_file;
		const extraSpriteFiles = [];
		if (this.point_sprite_file.constructor === Array){
		    mainSpriteFile = this.point_sprite_file[0];
		    extraSpriteFiles.push(...this.point_sprite_file.slice(1));
		}
		const sprite = new THREE.TextureLoader().load( mainSpriteFile );
		sprite.colorSpace = THREE.SRGBColorSpace;
		this.material.map = sprite;
		extraSpriteFiles.forEach( (x) => {
		    const sprite = new THREE.TextureLoader().load( x );
		    sprite.colorSpace = THREE.SRGBColorSpace;
		    extraPointMaps.push(sprite);
		});
	    }
	} else if (this instanceof THREE.Line) {
	    this.material = new THREE.LineBasicMaterial( { vertexColors: true, color: 0xffffff, linewidth: this.point_size, blending: THREE.NormalBlending, transparent: true, depthTest: true, depthWrite: true } );
	}


	const hasDisplacementMaps = this.hasAnyDisplacementMaps();
	const hasTextureMaps = this.hasAnyTextureMaps();
	if (hasDisplacementMaps || hasTextureMaps || this.enableBloom || extraPointMaps.length){
	    this.geometry.computeBoundingBox ();

	    // We need to make a custom cache key which considers the number of
	    // uniforms expected for this material
	    this.material.customProgramCacheKey = () => {
		const key = {};
		if (hasDisplacementMaps){
		    key.numDisplacementMaps = this.displacementMap.value.length;
		    key.numDisplacementDescriptors = this.displacementMapUniform.value.length;
		}
    		if (hasTextureMaps){
		    key.numTextureMapDescriptors = this.textureMapUniform.value.length;
		    key.numTextureMaps = this.textureMap.value.length;
		}
    		if (hasTextureMaps || hasDisplacementMaps){
		    key.numMorphBounds = this.morphBoundsUniform.value.length;
		}
		if (extraPointMaps.length){
		    key.numExtraPointMaps = extraPointMaps.length;
		}
		key.nextFreeMorphId = this.nextFreeMorphId;
		key.point = this instanceof THREE.Points;
		return JSON.stringify(key);
	    }

	    // Do updates to the shader based on the number of descriptors and maps we have
	    this.material.onBeforeCompile = shader => {
		var vertexShaderBegin = "";
		if (this.enableBloom){
		    shader.vertexShader =
    			shader.vertexShader.replace(
    			    '#include <project_vertex>',
                            `#ifdef DARKEN_BLOOM
                             vColor.rgb = vec3(0.0);
                             #endif
                             #include <project_vertex>
                            `);
		}

		if (extraPointMaps.length){
		    shader.uniforms.uPointMaps = { value: extraPointMaps };
    		    shader.fragmentShader =
    			shader.fragmentShader.replace(
    			    '#include <map_particle_pars_fragment>',
    			    `#include <map_particle_pars_fragment>
                             varying float vPointMapSelect;
                             uniform sampler2D uPointMaps[${extraPointMaps.length}];`);

    		    var mapSelect =
                        `vec4  pointMapValue = vec4(1);
                         switch (uint(vPointMapSelect)){
                           case 0u: pointMapValue = texture2D(map, uv); break;
                        `;
    		    for (let i=0; i<extraPointMaps.length; i++){
    			mapSelect += `case ${i+1}u: pointMapValue=texture2D(uPointMaps[${i}],uv);break;\n`;
    		    }
    		    mapSelect += "}\n";
		    shader.fragmentShader =
                        shader.fragmentShader.replace(
			    '#include <map_particle_fragment>',
                            `vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
                             ${mapSelect}
 	                     diffuseColor *= pointMapValue;
                             `);

		    vertexShaderBegin +=
			`varying float vPointMapSelect;
                         attribute float pointmapindex;`;

		    shader.vertexShader =
        		shader.vertexShader.replace(
        		    '#include <morphtarget_vertex>',
        		    `vPointMapSelect = pointmapindex;
                             #include <morphtarget_vertex>`);

		}

		if (hasDisplacementMaps){
		    shader.uniforms.uDisplacementMap = this.displacementMap;
		    shader.uniforms.uDisplacement = this.displacementMapUniform;
		}
		if (hasTextureMaps){
		    shader.uniforms.uTextureMap = this.textureMap;
		    shader.uniforms.uTextureMapParams = this.textureMapUniform;
		}

		if (this.enableBloom){
                    shader.uniforms.uBloomIntensity = this.bloomIntensityUniform;
		    vertexShaderBegin += `
                         #if defined( USE_BLOOM_INTENSITY )
                         uniform float uBloomIntensity[MORPHTARGETS_COUNT+1];
                         #endif
                        `;
                    if (!hasTextureMaps){
		        shader.vertexShader =
        		    shader.vertexShader.replace(
                                "#include <morphcolor_vertex>",
                                `
                        	// morphTargetBaseInfluence is set based on BufferGeometry.morphTargetsRelative value:
                          	// When morphTargetsRelative is false, this is set to 1 - sum(influences); this results in normal = sum((target - base) * influence)
	                        // When morphTargetsRelative is true, this is set to 1; as a result, all morph targets are simply added to the base after weighting
	                        vColor *= morphTargetBaseInfluence;

                                #if defined( USE_BLOOM_INTENSITY )
                                vColor *= uBloomIntensity[0];
                                #endif
                	        for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
                                        vec4 color = getMorph( gl_VertexID, i, 2 );
                                #if defined( USE_BLOOM_INTENSITY )
                                        color *= uBloomIntensity[i+1];
                                #endif
                		#if defined( USE_COLOR_ALPHA )
                			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += color * morphTargetInfluences[ i ];
                		#elif defined( USE_COLOR )
                			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += color.rgb * morphTargetInfluences[ i ];
                		#endif
                                }
                            `);
                    }
                }

                if (hasDisplacementMaps || hasTextureMaps){
                    shader.uniforms.uMorphBounds = this.morphBoundsUniform;
		    shader.uniforms.uTime = this.currentTime;
                    var timeIndexOffset;
                    if (this.currentTime.value.length > 2){
                        timeIndexOffset = "gl_InstanceID*2";
                    } else {
                        timeIndexOffset = "0";
                    }

		    vertexShaderBegin +=
			`struct MorphBounds {
                            vec3 upperLeftCorner;
                            vec3 lowerLeftCorner;
                            vec3 lowerLeftCornerDepth;
                            vec3 lowerRightCorner;
                         };



                         uniform MorphBounds uMorphBounds[MORPHTARGETS_COUNT+1];
	                 uniform float uTime[${this.currentTime.value.length}];

                         #define PERLIN_TIME ${timeIndexOffset} + 0
                         #define FBM_TIME ${timeIndexOffset} + 1

	                 #undef USE_POINTS_UV
                         ${commonShader}
                         ${fbmShader}
                        `;

    		    var returnIfNotLineEnd = "";
    		    if (!(this instanceof THREE.Points))
    			returnIfNotLineEnd =
    			`if ((gl_VertexID & int(1)) == 0)
                            return vec3(0.0,0.0,0.0);`;


    		    // Remove the code for checking USE_POINTS_UV since we use uv's for only setting the vertex colors in the vertex shader
    		    shader.fragmentShader =
    			shader.fragmentShader.replace(
    			    '#include <map_particle_pars_fragment>',
    			    `#undef USE_POINTS_UV
                             #include <map_particle_pars_fragment>`);

    		    // Some common code for both displacement and texture maps
    		    shader.vertexShader =
        		shader.vertexShader.replace(
        			'#include <morphtarget_vertex>',
        			`#include <morphtarget_vertex>
                                 vec3 llc = uMorphBounds[0].lowerLeftCorner * morphTargetBaseInfluence;
                                 vec3 llcd = uMorphBounds[0].lowerLeftCornerDepth * morphTargetBaseInfluence;
                                 vec3 ulc = uMorphBounds[0].upperLeftCorner * morphTargetBaseInfluence;
                                 vec3 lrc = uMorphBounds[0].lowerRightCorner * morphTargetBaseInfluence;
                                 for ( int i = 0; i < MORPHTARGETS_COUNT; i++ ) {
                                      if (morphTargetInfluences[i] > 0.0) {
                                          llc += morphTargetInfluences[ i ] * uMorphBounds[i+1].lowerLeftCorner;
                                          llcd += morphTargetInfluences[ i ] * uMorphBounds[i+1].lowerLeftCornerDepth;
                                          ulc += morphTargetInfluences[ i ] * uMorphBounds[i+1].upperLeftCorner;
                                          lrc += morphTargetInfluences[ i ] * uMorphBounds[i+1].lowerRightCorner;
                                      }
                                 }

                                 vec3 cloudHeight = ulc - llc;
                                 vec3 cloudWidth = lrc - llc;
                                 vec3 cloudDepth = llcd - llc;
                                 vec3 posInCloud = transformed - llc;
                                 vec3 posDepth = vec3(0.0);
                                 if (length(cloudDepth) > 0.0){
                                   // Find part of posInCloud vector that is parallel to the cloudDepth vector
                                   // That will give us the depth of the vertex inside the bounding box
                                   posDepth = (dot(posInCloud, cloudDepth)/dot(cloudDepth, cloudDepth))*cloudDepth;
                                   // Remove the depth part fromt he posInCloud vector so that it purely represents the
                                   // the width and height position inside the bounding box
                                   posInCloud -= posDepth;
                                 } else {
                                   cloudDepth = cross(cloudWidth, cloudHeight)*0.0001;
                                 }
                                 vec3 cloudCenter = llc + 0.5*(cloudHeight + cloudWidth + cloudDepth);
                                 vec3 posFromCenter = transformed - cloudCenter;
                                 //Appendpoint
                                 `);

    		    if (hasDisplacementMaps){
    			const numDisplacementMaps = this.displacementMap.value.length;
    			const numDisplacementDescriptors = this.displacementMapUniform.value.length;
    			vertexShaderBegin +=
    			`
                             struct DisplacementParams {
                               int mapIdx;
                               uint flags;
                               float scale;
                               float offset;
                               int morphIdx;
                               vec4 params;
                               vec3 normal;
                             };
                             uniform sampler2D uDisplacementMap[${numDisplacementMaps}];
                             uniform DisplacementParams uDisplacement[${numDisplacementDescriptors}];
                             #define M_PI 3.1415926535897932384626433832795
                             ${perlinNoiseShader}
                             ${simplexNoiseShader}

                             vec3 getDisplacement(DisplacementParams disp, sampler2D dispMap, vec3 posInCloud, vec3 posFromCenter, vec3 posDepth, vec3 cloudHeight, vec3 cloudWidth, vec3 cloudDepth, vec3 cloudCenter, vec3 transformed, vec3 objectNormal){
                               vec2 dispUv;
                               ${returnIfNotLineEnd}

                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_RADIAL_U_MAPPING}u) != 0u){
                                 float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                                 pointAngleFromCenter = abs(pointAngleFromCenter) > M_PI*0.5 ? M_PI - abs(pointAngleFromCenter) : abs(pointAngleFromCenter);
                                 pointAngleFromCenter /= M_PI*0.5;
                                 dispUv.x = length(posFromCenter)/(0.5*mix(length(cloudWidth), length(cloudHeight), pointAngleFromCenter));
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ANGULAR_U_MAPPING}u) != 0u){
                                 float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                                 dispUv.x = pointAngleFromCenter/(2.0*M_PI);
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_INSTANCE_U_MAPPING}u) != 0u){
                                 dispUv.x = float(gl_InstanceID)/float(${this.count});
                               } else {
                                 float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
                                 dispUv.x = length(posInCloud)*sin(pointAngle)/length(cloudWidth);
                               }
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_RADIAL_V_MAPPING}u) != 0u){
                                 float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                                 pointAngleFromCenter = abs(pointAngleFromCenter) > M_PI*0.5 ? M_PI - abs(pointAngleFromCenter) : abs(pointAngleFromCenter);
                                 pointAngleFromCenter /= M_PI*0.5;
                                 dispUv.y = length(posFromCenter)/(0.5*mix(length(cloudWidth), length(cloudHeight), pointAngleFromCenter));
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ANGULAR_V_MAPPING}u) != 0u){
                                 float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                                 float pointAngleFromCenterHeight = acos(dot(cloudHeight, posFromCenter)/(length(cloudHeight)*length(posFromCenter)));
                                 dispUv.y = pointAngleFromCenterHeight > 0.5*M_PI ? 2.0*M_PI-pointAngleFromCenter : pointAngleFromCenter;
                                 dispUv.y /= (2.0*M_PI);
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_INSTANCE_V_MAPPING}u) != 0u){
                                 dispUv.y = float(gl_InstanceID)/float(${this.count});
                               } else {
                                 float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
                                 dispUv.y = length(posInCloud)*cos(pointAngle)/length(cloudHeight);
                               }
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_LOG_U_MAPPING}u)!=0u){
                                 dispUv.x = max(1.0-dispUv.x, 0.001);
                                 dispUv.x = 1.0 - (log(dispUv.x)/2.303+3.0)/3.0;
                               }
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_SWAP_UV}u)!=0u)
                                  dispUv.xy = dispUv.yx;

                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_DEPTH_IS_U}u)!=0u)
                                  dispUv.x = length(posDepth)/length(cloudDepth);
                               else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_DEPTH_IS_V}u)!=0u)
                                  dispUv.y = length(posDepth)/length(cloudDepth);

                               float displacement = ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ENABLE}u) != 0u) ? texture2D( dispMap, dispUv ).x : 0.0;
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ADD_PERLIN_NOISE}u)!=0u){
                                 float perlinNoise = pnoise(transformed + uTime[PERLIN_TIME], vec3(10.0))/10.0;
                                 if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_MULTIPLY}u)!=0u)
                                    displacement *= perlinNoise;
                                 else
                                    displacement += perlinNoise;
                               }
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE}u)!=0u){
                                 vec2 simplexPos = ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE_XY}u)!=0u) ? transformed.xy : transformed.xz;
                                 float simplexNoise = getSimplexDisplacement(simplexPos, disp.params);
                                 if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_MULTIPLY}u)!=0u)
                                    displacement *= simplexNoise;
                                 else
                                    displacement += simplexNoise;
                               }
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ADD_FBM}u)!=0u){
                                  float fbmNoise = (1.0-multi_fbm(posInCloud,posDepth,cloudHeight,cloudWidth,cloudDepth));
                                  if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_MULTIPLY}u)!=0u)
                                     displacement *= fbmNoise;
                                  else
                                     displacement += fbmNoise;
                               }

                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM}u)!=0u){
                                 vec3 randDir = vec3(random(transformed+vec3(2.0*uTime[PERLIN_TIME], 0.0, 0.0)), random(transformed+vec3(0.0, 0.0, 5.0*uTime[PERLIN_TIME])), random(transformed+vec3(0.0, uTime[PERLIN_TIME]*3.0, 0.0)));
                                 return disp.scale*((displacement+disp.offset)/length(randDir))*randDir;
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL}u)!=0u){
                                 vec3 randDir = vec3(random(transformed+vec3(2.0, 0.0, 0.0)), random(transformed+vec3(0.0, 0.0, 5.0)), random(transformed+vec3(0.0, 3.0, 0.0)));
                                 randDir = cross(randDir, objectNormal);
                                 return disp.scale*((displacement+disp.offset)/length(randDir))*randDir;
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER}u)!=0u){
                                 return disp.scale*((displacement+disp.offset)/length(posFromCenter))*posFromCenter;
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL}u)!=0u){
                                 return disp.scale*(displacement+disp.offset)*disp.normal;
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL}u)!=0u){
                                 // The closest point on the line given by the normal vector, assuming normal is a unit vector, is given by
                                 vec3 pos = disp.normal*dot(transformed, disp.normal);
                                 return disp.scale*(displacement+disp.offset)*normalize(transformed-pos);
                               } else {
                                 return disp.scale*(displacement+disp.offset)*objectNormal;
                               }
                             }
                             `;
    			var displacement_switch = "vec3 displacement;\nswitch (map){\n";
    			for (let i=0; i<numDisplacementMaps; i++){
    			    displacement_switch += `case ${i}: displacement=getDisplacement(uDisplacement[i], uDisplacementMap[${i}],
                                                                                            posInCloud, posFromCenter, posDepth, cloudHeight, cloudWidth, cloudDepth, cloudCenter, transformed, objectNormal);break;\n`;
    			}
    			displacement_switch += "}\n";
    			shader.vertexShader =
        		    shader.vertexShader.replace(
        			    '//Appendpoint',
        			    `//Appendpoint
                                     #include <beginnormal_vertex>
       			             #include <morphnormal_vertex>
                                     vec3 transformedNoDisp = transformed;
    				     for ( int i = 0; i < ${numDisplacementDescriptors}; i++ ) {
                                       int morphIdx = uDisplacement[i].morphIdx;
                                       float influence;
    	             		       if ( morphIdx == 0 )
                                          influence = morphTargetBaseInfluence;
                                       else
                                          influence = morphTargetInfluences[ morphIdx-1 ];

                                       if ( influence != 0.0){
                                         for (int map=0; map < ${numDisplacementMaps}; map++){
                                            if (uDisplacement[i].mapIdx == map){
                                               ${displacement_switch}
                                               transformed += influence * displacement;
                                            }
                                         }
                                       }
                                     }
                                   `
        		    );
        	    }

    		    if (hasTextureMaps){
                        const numTextureMapDescriptors = this.textureMapUniform.value.length;
    			const numTextureMaps = this.textureMap.value.length;
    			vertexShaderBegin +=
    			`
                             ${kaleidoShader}
                             ${spiralVortexShader}

                             struct TextureParams {
                               int mapIdx;
                               uint flags;
                               vec2 scale;
                               vec2 offset;
                               vec3 viewPos;
                               vec3 up;
                               vec4 blendCoeffs;
                               int morphIdx;
                             };

                             uniform sampler2D uTextureMap[${numTextureMaps}];
        		         uniform TextureParams uTextureMapParams[${numTextureMapDescriptors}];

                             vec4 getTextureValue(vec4 color, TextureParams mapParams, sampler2D textureMap, vec3 worldPosition, vec3 posInCloud, vec3 posDepth, vec3 cloudHeight, vec3 cloudWidth, vec3 cloudDepth, vec3 cloudCenter){
                               vec2 texUv;
                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_USE_UV}u) != 0u){
                                   if (mapParams.morphIdx == 0){
                                      texUv = uv;
                                    } else {
                                      // Uvs are packed into unused z-component of postiion and normal morph attributes
                                      texUv = vec2(getMorph( gl_VertexID, mapParams.morphIdx-1, 0 ).w, getMorph( gl_VertexID, mapParams.morphIdx-1, 1 ).w);
                                    }
                               } else {
      			            // https://en.wikipedia.org/wiki/Line%E2%80%93plane_intersection
                                    // Find intersection between line from camera position or fixed postion through the current vertex position and
                                    // and into the plane that is perpendicular to the view position and that intersects the center of the morph cloud
                                    // Get view position - this is either camera or a fixed point given with the morph parameters
                                    vec3 viewPos = ((mapParams.flags & ${this.constructor.TEXTURE_MAP_VIEW_POS_RELATIVE}u) != 0u) ? (modelMatrix * vec4(mapParams.viewPos, 1.0)).xyz : mapParams.viewPos;
                                    viewPos = ((mapParams.flags & ${this.constructor.TEXTURE_MAP_VIEW_POS_EN}u) != 0u) ? mapParams.viewPos : cameraPosition;
                                    // Get center point world coordinates
                                    vec3 cloudCenterWorld = (modelMatrix * vec4(cloudCenter,1.0)).xyz;
                                    // Get the projection plane normal
                                    vec3 planeNormal = cloudCenterWorld - viewPos;
                                    // Get vector pointing from view position to world position of this point
                                    vec3 viewPosPointDir = worldPosition-viewPos;
                                    // Get the projected position of this point into the projection plane
                                    float t = dot(planeNormal, planeNormal)/dot(planeNormal,viewPosPointDir);
                                    vec3 projPos = viewPos + t*(viewPosPointDir);
                                    // Get the up vector for the texture - if it is a fixed point then the up is also fixed - if it is following the camera then
                                    // we use the up direction of the camera. We need to convert this into world space
                                    vec3 texWorldUp =  ((mapParams.flags & ${this.constructor.TEXTURE_MAP_VIEW_POS_EN}u) != 0u) ? mat3(modelMatrix) * mapParams.up : inverse(mat3(viewMatrix)) * mapParams.up;
                                    vec3 texWorldRight = cross(planeNormal, texWorldUp);
                                    float radius;
                                    if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_SIZE_TO_VIEW_FRUSTRUM}u) != 0u){
                                      // Get the bounding box radius by taking the length of the longest dimension that is just within the camera
                                      // viewport at a distance from the camera as the cloud center is
                                      // We have that projectionMatrix[1][1] = 2 * near / ( right - left ) and
                                      //              projectionMatrix[0][0] = 2 * near / ( top - bottom )
                                      // So if we invert them we basically get the rate of increase of the viewing frustrum
                                      // in width and heigh. We can therefore just multiply these with distance from the camera
                                      // to get the bounding box at a given distance
                                      float maxRate = max(1.0/projectionMatrix[1][1],  1.0/projectionMatrix[0][0]);
                                      radius = maxRate*length(planeNormal);
                                    } else {
                                      // Get the bounding radius by taking the length of the longest bounding box dimension
                                      radius = max(max(length(cloudHeight), length(cloudWidth)), length(cloudDepth))/2.0;
                                    }
                                    vec3 texLowerLeft = cloudCenterWorld - radius*normalize(texWorldUp) - radius*normalize(texWorldRight);
                                    vec3 posInPlane = projPos - texLowerLeft;
                                    float pointAngle = acos(dot(texWorldUp, posInPlane)/(length(texWorldUp)*length(posInPlane)));
                                    texUv.x = length(posInPlane)*sin(pointAngle)/(2.0*radius);
                                    texUv.y = length(posInPlane)*cos(pointAngle)/(2.0*radius);
                               }

                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_KALEIDO}u) != 0u){
                                   texUv.x = mix(-1.0, 1.0, texUv.x);
      	                           texUv.y = mix(-1.0, 1.0, texUv.y);
                                   texUv.y *= length(cloudHeight)/length(cloudWidth);
                                   texUv = kaleido_transform(kaleido(texUv));
                               }

                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_VORTEX}u) != 0u){
                                   texUv.x = mix(-1.0, 1.0, texUv.x);
      	                           texUv.y = mix(-1.0, 1.0, texUv.y);
                                   texUv.y *= length(cloudHeight)/length(cloudWidth);
                                   texUv = spiralVortexTransform(texUv,5.0);
                               }

                               vec4 texColor = ((mapParams.flags & ${this.constructor.TEXTURE_MAP_ENABLE}u) != 0u) ? texture2D(textureMap, mapParams.offset + texUv/mapParams.scale) : color;

                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLACK_IS_TRANSPARENT}u) != 0u){
                                  texColor.a = length(texColor.rgb) < 0.3 ? length(texColor.rgb) : 1.0;
                               }

                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_ADD_FBM_NOISE}u) != 0u){
                                  float f = multi_fbm(posInCloud, posDepth, cloudHeight, cloudWidth, cloudDepth);
                                  texColor = vec4(texColor.rgb, f);
                               }

                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_AVG}u) != 0u){
                                  texColor.rgb = 0.5*color.rgb + 0.5*texColor.rgb;
                               } else if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_ADD}u) != 0u){
                                  texColor.rgb = clamp(mapParams.blendCoeffs.x*color.rgb + mapParams.blendCoeffs.y*texColor.rgb, 0.0, 1.0);;
                               } else if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_MUL}u) != 0u){
                                  texColor.rgb = color.rgb * texColor.rgb;
                               }

                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_AVG_ALPHA}u) != 0u){
                                  texColor.a = 0.5*color.a + 0.5*texColor.a;
                               } else if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_ADD_ALPHA}u) != 0u){
                                  texColor.a = clamp(mapParams.blendCoeffs.z*color.a + mapParams.blendCoeffs.w*texColor.a, 0.0, 1.0);;
                               } else if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_MUL_ALPHA}u) != 0u){
                                  texColor.a = color.a * texColor.a;
                               }

                               return texColor;
                             }
                             `;


    			shader.vertexShader = shader.vertexShader.replace("#include <morphcolor_vertex>", "");
    			var texture_switch = "switch (map){\n";
    			for (let i=0; i<numTextureMaps; i++){
    			    texture_switch += `case ${i}: color=getTextureValue(color, uTextureMapParams[i], uTextureMap[${i}], worldPosition, posInCloud, posDepth, cloudHeight, cloudWidth, cloudDepth, cloudCenter);break;\n`;
    			}
    			texture_switch += "}\n";

                        var setWorldPos;
                        if (hasDisplacementMaps)
                            setWorldPos = "vec3 worldPosition = (modelMatrix * vec4(transformedNoDisp, 1.0)).xyz;";
                        else
                            setWorldPos = "vec3 worldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;";

    			shader.vertexShader =
        		        shader.vertexShader.replace(
        			    '#include <worldpos_vertex>',
    			            `#include <worldpos_vertex>
                                     ${setWorldPos}
                                     #if defined( USE_COLOR_ALPHA )
                                     vec4 color = vColor;
                                     vColor = vec4(0.0);
        	                     #elif defined( USE_COLOR )
                                     vec4 color = vec4(vColor.rgb, 1.0);
                                     vColor = vec3(0.0);
        	                     #endif
        			     for ( int morphTarget = 0; morphTarget <= MORPHTARGETS_COUNT;  morphTarget++ ) {
                                         float influence = morphTargetBaseInfluence;
        	             	    	 if ( morphTarget > 0 )
                                             influence = morphTargetInfluences[ morphTarget-1 ];

                                         if (influence == 0.0)
                                             continue;

                                         if ( morphTarget != 0 ){
                                             color = getMorph( gl_VertexID, morphTarget-1, 2 );
                                         }

        			    	 for ( int i = 0; i < ${numTextureMapDescriptors}; i++ ) {
                                               int morphIdx = uTextureMapParams[i].morphIdx;

                                               if ( morphIdx == morphTarget ){
                                                 for ( int map = 0; map < ${numTextureMaps}; map++ ){
                                                    if (uTextureMapParams[i].mapIdx == map){
                                                      ${texture_switch}
                                                    }
                                                 }
                                               }
                                         }
                                     #if defined( USE_BLOOM_INTENSITY )
                                         float bloomIntensity = uBloomIntensity[morphTarget];
                                         color *= bloomIntensity;
                                     #endif
                                     #if defined( USE_COLOR_ALPHA )
                                         vColor += color * influence;
            	                     #elif defined( USE_COLOR )
                                         vColor += (color * influence).rgb;
            	                     #endif
            	                    }
                                 `);
    		    }
    		}

                if (hasDisplacementMaps || hasTextureMaps || this.enableBloom){
    		    shader.vertexShader = shader.vertexShader.replace("#include <clipping_planes_pars_vertex>",
                                                                      "#include <clipping_planes_pars_vertex>\n" + vertexShaderBegin);
                }
            }
	}

	this.castShadow = true;

	if (this.onclick){
	    this.raycaster = new THREE.Raycaster();
	    this.raycaster.params.Points.threshold = 0.1;
	    this.renderer.domElement.addEventListener('click', function (event){
		this.raycaster.setFromCamera(
		    {
			x: (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1,
			y: -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1,
		    },
		    this.camera
		)

		// Make a geometry of the current morph shape so that we only
		// check intersection against that
		const morphId = this.getMorphId();
		var posAttr = this.geometry.attributes.position;
		if (morphId >= 0){
		    posAttr = this.geometry.morphAttributes.position[morphId];

		}
		const newObj = this.clone();
		newObj.geometry.attributes.position = posAttr;

		const intersects = this.raycaster.intersectObject(newObj, true);
		if (intersects.length > 0) {
		    this.onclick(this);
		    console.log(this);
		}

	    }.bind(this), false);

	}

	return this;
    }


    static getPerpendicular(vec){
        // Just multiply the vector with a random direction vector and we will get
        // a vector that is perpendicular to the input vector
        const randDir = new THREE.Vector3().randomDirection();
        return randDir.cross(vec).normalize();
    }

    static addPositionNoise(geometry, positionNoise, alongNormal=false){
	if (positionNoise){
	    const position = geometry.getAttribute("position");
	    const normal = geometry.getAttribute("normal");
	    const pos = new THREE.Vector3();
	    const norm = new THREE.Vector3();
	    for (let i=0; i<position.count; i++){
		pos.fromBufferAttribute(position, i);
		norm.fromBufferAttribute(normal, i);
		var direction;
		if (alongNormal)
		    direction = norm;
		else
		    // Find a vector that is perpendicular to the normal
		    // Use the fact that the dot product of two perpendicular vectors
		    // is 0 and set x=rand_x and y=random_y for the perpendicular vector
		    // We then get z=(-rand.x*norm.x-rand.y*norm.y)/norm.z
		    direction = this.getPerpendicular(norm);
                if (direction)
		    pos.add(direction.multiplyScalar(positionNoise*Math.random()));
		position.setXYZ(i, pos.x, pos.y, pos.z);
	    }
	}
    }

    static sortPositionsBasedOnNearest(geometry,  refPosAttr, pointCount, morphAttrId=null, line=false, refIsSortedOnOctant=false, refIsSphericalSorted=false, searchWindow=null){
	const pos = new THREE.Vector3();
	const ref = new THREE.Vector3();
        var posAttrToSort = null;
	var normalAttribute = null;
	var colorAttribute = null;
	var uvAttribute = null;
        if (morphAttrId != null){
	    posAttrToSort = geometry.morphAttributes.position[morphAttrId];
	    normalAttribute = geometry.morphAttributes.normal[morphAttrId];
	    colorAttribute = geometry.morphAttributes.color[morphAttrId];
            if (geometry.morphAttributes.uv)
	        uvAttribute = geometry.morphAttributes.uv[morphAttrId];
        } else {
	    posAttrToSort  = geometry.getAttribute("position");
	    normalAttribute = geometry.getAttribute("normal");
	    colorAttribute = geometry.getAttribute("color");
	    uvAttribute = geometry.getAttribute("uv");
        }
        const newPosAttr = new THREE.BufferAttribute(new Float32Array(pointCount*3), 3);
        const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(pointCount*3), 3);
        const newColorAttribute = new THREE.BufferAttribute(new Float32Array(pointCount*4), 4);
	var newUvAttribute;
	if (uvAttribute){
	    newUvAttribute = new THREE.BufferAttribute(new Float32Array(pointCount*2), 2);
	}
	var refPosCount = refPosAttr.count;
	var curPosCount = posAttrToSort.count;

	var refStride = 1;
	if (line){
	    refPosCount /= 2;
            curPosCount /= 2;
	    refStride = 2;
            pointCount /= 2;
	}

        const octantEndIndex = new Array(8);
        const octantFull = new Array(8).fill(false);
        if (refIsSortedOnOctant){
            var curOctant = 0;
	    for (let i=0; i<pointCount; i++){
		ref.fromBufferAttribute(refPosAttr, refStride*i);
                const nextOctant = 4*(ref.x >= 0) + 2*(ref.y >= 0) + (ref.z >= 0);
                if (curOctant != nextOctant){
                    for (let octant=curOctant; octant < nextOctant; octant++)
                        octantEndIndex[octant] = i;
                }
                curOctant = nextOctant;
            }
            for (let octant=curOctant; octant < 8; octant++)
                octantEndIndex[octant] = pointCount;

        }
	console.assert(refPosCount >= pointCount);

	const usedIdx = Array(pointCount).fill(false);
	for (let i=0; i<pointCount; i++){
	    const oldIdx = i%curPosCount;
	    const duplicatePos = i>=curPosCount;
            var nearestValue = Infinity;
	    pos.fromBufferAttribute(posAttrToSort, refStride*oldIdx);
            if (refIsSphericalSorted){
                nearestIdx = this.findNeareastSphericalPos(pos, refPosAttr, refStride, refPosCount, usedIdx);
            } else {
	        var nearestIdx = null;
                var startIndex = 0;
                var stopIndex = searchWindow ? Math.min(i + searchWindow, pointCount) : pointCount;
                var octant;
                do {
                    if (refIsSortedOnOctant){
                        // Find octant to search
                        octant = 4*(pos.x >= 0) + 2*(pos.y >= 0) + (pos.z >= 0);
                        var tryOctant = octant;
                        var flipBits = 1;
                        var flipBitNum = 0;
                        while (octantFull[tryOctant]){
                            const mask = ((1<<flipBits)-1) << flipBitNum;
                            tryOctant = octant ^ ((mask | ((mask >> 3) & 1))&7);
                            if (flipBitNum == 2){
                                console.assert(flipBits < 3);
                                flipBits++;
                            }
                            flipBitNum = (flipBitNum+1)%3;;
                        }
                        octant = tryOctant;
                        if (octant > 0)
                            startIndex = octantEndIndex[octant-1];
                        stopIndex = octantEndIndex[octant];
                    }
                    for (let j=startIndex; j<stopIndex; j++){
		        if (usedIdx[j] != false)
		            continue;
                        if (searchWindow && ((stopIndex - j) > 2*searchWindow)){
                            // If we have leftover points not chosen yet that are 2*searchWindow
                            // from current last point to search then use that point
                            nearestIdx = j;
                            break;
                        }
		        ref.fromBufferAttribute(refPosAttr, refStride*j);
		        const distVect = ref.sub(pos);
                        //if (scale)
                        //    distVect.multiply(scale);
                        const dist = distVect.length();
		        if (dist < nearestValue){
		            nearestValue = dist;
		            nearestIdx = j;
		        }
	            }
                    if (refIsSortedOnOctant && nearestIdx == null){
                        // Nothing found in octant so search whole geometry
                        console.log("Octant " + octant + " is full.");
                        octantFull[octant] = true;
                        startIndex = 0;
                    }
                } while (nearestIdx == null);
            }
            for (let j=0; j<refStride; j++){
	        newPosAttr.setXYZ(refStride*nearestIdx+j,
			          posAttrToSort.getX(refStride*oldIdx+j),
			          posAttrToSort.getY(refStride*oldIdx+j),
			          posAttrToSort.getZ(refStride*oldIdx+j));

	        if (normalAttribute)
		    newNormalAttribute.setXYZ(refStride*nearestIdx+j,
					      normalAttribute.getX(refStride*oldIdx+j),
					      normalAttribute.getY(refStride*oldIdx+j),
					      normalAttribute.getZ(refStride*oldIdx+j));

	        if (colorAttribute)
		    newColorAttribute.setXYZW(refStride*nearestIdx+j,
					      colorAttribute.getX(refStride*oldIdx+j),
					      colorAttribute.getY(refStride*oldIdx+j),
					      colorAttribute.getZ(refStride*oldIdx+j),
					      duplicatePos ? 0 : colorAttribute.getW(refStride*oldIdx+j)
					     );
	        if (uvAttribute)
		    newUvAttribute.setXY(refStride*nearestIdx+j,
				         uvAttribute.getX(refStride*oldIdx+j),
				         uvAttribute.getY(refStride*oldIdx+j)
				        );
	    }
	    usedIdx[nearestIdx] = i;

	    if ((i % 1000) == 0)
		console.log("Processing " + i);

	}

        if (morphAttrId != null){
	    geometry.morphAttributes.position[morphAttrId] = newPosAttr;
	    if (normalAttribute)
	        geometry.morphAttributes.normal[morphAttrId] = newNormalAttribute;
	    if (colorAttribute)
	        geometry.morphAttributes.color[morphAttrId] = newColorAttribute;
	    if (uvAttribute)
	        geometry.morphAttributes.uv[morphAttrId] = newUvAttribute;
        } else {
	    geometry.setAttribute("position", newPosAttr);
	    if (normalAttribute)
	        geometry.setAttribute("normal", newNormalAttribute);
	    if (colorAttribute)
	        geometry.setAttribute("color", newColorAttribute);
	    if (uvAttribute)
	        geometry.setAttribute("uv", newUvAttribute);
	}
	return usedIdx;
    }

    downloadPosMaps(){
	this.descriptor.forEach( (d,i) => {
	    if (d.posMapToDownload){
                if (!Array.isArray(d.posMapToDownload))
                    d.posMapToDownload = [d.posMapToDownload];

                d.posMapToDownload.forEach( (x) => {
		    setTimeout(function() {
		        console.log("Downloading " + x.downloadFile);
		        download(JSON.stringify(x.map), x.downloadFile, "application/json");
		    }, 1000*i);
                });
	    }
	});
    }

    static applyPosMapFile(geometry, posMap, morphAttrId=null, line=false){
        var positionAttribute = null;
	var normalAttribute = null;
	var colorAttribute = null;
	var uvAttribute = null;

        if (morphAttrId != null){
	    positionAttribute = geometry.morphAttributes.position[morphAttrId];
	    normalAttribute = geometry.morphAttributes.normal[morphAttrId];
	    colorAttribute = geometry.morphAttributes.color[morphAttrId];
            if (geometry.morphAttributes.uv)
	        uvAttribute = geometry.morphAttributes.uv[morphAttrId];
        } else {
	    positionAttribute = geometry.getAttribute("position");
	    normalAttribute = geometry.getAttribute("normal");
	    colorAttribute = geometry.getAttribute("color");
	    uvAttribute = geometry.getAttribute("uv");
        }
        const stride = line ? 2 : 1;
        const posCount = line ? positionAttribute.count/2: positionAttribute.count;
	const newPosAttr = new THREE.BufferAttribute(new Float32Array(posMap.length*stride*3), 3);
	const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(posMap.length*stride*3), 3);
	const newColorAttribute = new THREE.BufferAttribute(new Float32Array(posMap.length*stride*4), 4);
	var newUvAttribute;
	if (uvAttribute){
	    newUvAttribute = new THREE.BufferAttribute(new Float32Array(posMap.length*stride*2), 2);
	}
	for (let i=0; i<posMap.length; i++){
	    var fromPos = posMap[i];
	    const duplicatePos = fromPos >= posCount;
	    fromPos %= posCount;
            for (let j=0; j<stride; j++){
	        newPosAttr.setXYZ(stride*i+j,
			          positionAttribute.getX(stride*fromPos+j),
			          positionAttribute.getY(stride*fromPos+j),
			          positionAttribute.getZ(stride*fromPos+j));

	        if (normalAttribute)
		    newNormalAttribute.setXYZ(stride*i+j,
					      normalAttribute.getX(stride*fromPos+j),
					      normalAttribute.getY(stride*fromPos+j),
					      normalAttribute.getZ(stride*fromPos+j));

	        if (colorAttribute)
		    newColorAttribute.setXYZW(stride*i+j,
					      colorAttribute.getX(stride*fromPos+j),
					      colorAttribute.getY(stride*fromPos+j),
					      colorAttribute.getZ(stride*fromPos+j),
					      duplicatePos ? 0 : colorAttribute.getW(stride*fromPos+j)
					     );
	        if (uvAttribute)
		    newUvAttribute.setXY(stride*i+j,
				         uvAttribute.getX(stride*fromPos+j),
				         uvAttribute.getY(stride*fromPos+j)
				        );
	    }
        }

        if (morphAttrId != null){
	    geometry.morphAttributes.position[morphAttrId] = newPosAttr;
	    if (normalAttribute)
	        geometry.morphAttributes.normal[morphAttrId] = newNormalAttribute;
	    if (colorAttribute)
	        geometry.morphAttributes.color[morphAttrId] = newColorAttribute;
	    if (uvAttribute)
	        geometry.morphAttributes.uv[morphAttrId] = newUvAttribute;
        } else {
	    geometry.setAttribute("position", newPosAttr);
	    if (normalAttribute)
	        geometry.setAttribute("normal", newNormalAttribute);
	    if (colorAttribute)
	        geometry.setAttribute("color", newColorAttribute);
	    if (uvAttribute)
	        geometry.setAttribute("uv", newUvAttribute);
	}
	return geometry;
    }

    static mortonEncodePhiTheta(phi, theta){
        const quantBits = 8;
        if (theta < 0)
            theta += 2*Math.PI;
        const phiNormaliser = (2**quantBits-1)/Math.PI;
        const thetaNormaliser = (2**quantBits-1)/(2*Math.PI);
        const phiQuant = Math.round(phi*phiNormaliser);
        const thetaQuant = Math.round(theta*thetaNormaliser);
        var phiInterleaved = (phiQuant | (phiQuant << 4)) & 0x0f0f;
        phiInterleaved = (phiInterleaved | (phiInterleaved << 2)) & 0x3333;
        phiInterleaved = (phiInterleaved | (phiInterleaved << 1)) & 0x5555;
        var thetaInterleaved = (thetaQuant | (thetaQuant << 4)) & 0x0f0f;
        thetaInterleaved = (thetaInterleaved | (thetaInterleaved << 2)) & 0x3333;
        thetaInterleaved = (thetaInterleaved | (thetaInterleaved << 1)) & 0x5555;
        return (phiInterleaved << 1) | thetaInterleaved;
    }


    static findNeareastSphericalPos(pos, searchBufAttr, searchBufAttrStride, pointCount, usedPos){
        const spherical = new THREE.Spherical().setFromVector3(pos);
        const phiThetaInterleaved = this.mortonEncodePhiTheta(spherical.phi, spherical.theta);
        // Do a binary search
        var lowerBound = 0;
        var upperBound = pointCount-1;
        const refSpherical = new THREE.Spherical();
        const refVec3 = new THREE.Vector3();
        var curIndex;

        do {
            // Read next searchpoint from reference and convert to spherical and convert Phi and Theta component
            // to interleaved format
            curIndex = Math.floor((upperBound + lowerBound)/2);
            refSpherical.setFromVector3(refVec3.fromBufferAttribute(searchBufAttr, searchBufAttrStride*curIndex));
            const refPhiThetaInterleaved = this.mortonEncodePhiTheta(refSpherical.phi, refSpherical.theta);
            const phiThetaEqual = phiThetaInterleaved == refPhiThetaInterleaved;
            // Check if we should go up or down in our search
            if (phiThetaInterleaved > refPhiThetaInterleaved || (phiThetaEqual && (spherical.radius > refSpherical.radius))){
                lowerBound = curIndex+1;
            } else {
                upperBound = curIndex-1;
            }
        } while (lowerBound>=upperBound);

        // Found closest match so check if position is already used - if it is then we search outwards for first unused
        curIndex = lowerBound;
        var incr = 1;
        var sign = 1;
        while (curIndex < 0 || usedPos[curIndex]){
            curIndex = lowerBound + sign*incr;
            if (sign < 0)
                incr += 1;
            sign = sign*-1;
        }
        return curIndex;
    }

    static sortPosition(geometry, sortFunc, morphAttrId=null, line=false){
        var positionAttribute = null;
	var normalAttribute = null;
	var colorAttribute = null;
	var uvAttribute = null;

        if (morphAttrId != null){
	    positionAttribute = geometry.morphAttributes.position[morphAttrId];
	    normalAttribute = geometry.morphAttributes.normal[morphAttrId];
	    colorAttribute = geometry.morphAttributes.color[morphAttrId];
            if (geometry.morphAttributes.uv)
	        uvAttribute = geometry.morphAttributes.uv[morphAttrId];
        } else {
	    positionAttribute = geometry.getAttribute("position");
	    normalAttribute = geometry.getAttribute("normal");
	    colorAttribute = geometry.getAttribute("color");
	    uvAttribute = geometry.getAttribute("uv");
        }
        const newPositionAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newColorAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*4), 4);
	var newUvAttribute;
	if (uvAttribute){
	    newUvAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*2), 2);
	}


        // Create an array of indices to sort, then reorder the original array
        const indices = Array.from({ length: line ? positionAttribute.count/2 : positionAttribute.count }, (_, i) => i);
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();

        const stride = line ? 2 : 1;

        indices.sort((a,b) => {
            v1.fromBufferAttribute(positionAttribute, a*stride);
            v2.fromBufferAttribute(positionAttribute, b*stride);
            return sortFunc(v1, v2)
        });

        // Reorder the positions based on the sorted indices
	const posMap = new Array(indices.length).fill(false);
        for (let i = 0; i < indices.length; i++) {
            const originalIndex = indices[i];
            posMap[i] = originalIndex;
            for (let j=0; j<stride; j++){
	        newPositionAttribute.setXYZ(i*stride+j,
					    positionAttribute.getX(originalIndex*stride+j),
					    positionAttribute.getY(originalIndex*stride+j),
					    positionAttribute.getZ(originalIndex*stride+j));
	        if (normalAttribute)
		    newNormalAttribute.setXYZ(i*stride+j,
					      normalAttribute.getX(originalIndex*stride+j),
					      normalAttribute.getY(originalIndex*stride+j),
					      normalAttribute.getZ(originalIndex*stride+j));

	        if (colorAttribute)
		    newColorAttribute.setXYZW(i*stride+j,
					      colorAttribute.getX(originalIndex*stride+j),
					      colorAttribute.getY(originalIndex*stride+j),
					      colorAttribute.getZ(originalIndex*stride+j),
					      colorAttribute.getW(originalIndex*stride+j)
					     );
	        if (uvAttribute)
		    newUvAttribute.setXY(i*stride+j,
				         uvAttribute.getX(originalIndex*stride+j),
				         uvAttribute.getY(originalIndex*stride+j)
				        );
            }
        }


        if (morphAttrId != null){
	    geometry.morphAttributes.position[morphAttrId] = newPositionAttribute;
	    if (normalAttribute)
	        geometry.morphAttributes.normal[morphAttrId] = newNormalAttribute;
	    if (colorAttribute)
	        geometry.morphAttributes.color[morphAttrId] = newColorAttribute;
	    if (uvAttribute)
	        geometry.morphAttributes.uv[morphAttrId] = newUvAttribute;
        } else {
	    geometry.setAttribute("position", newPositionAttribute);
	    if (normalAttribute)
	        geometry.setAttribute("normal", newNormalAttribute);
	    if (colorAttribute)
	        geometry.setAttribute("color", newColorAttribute);
	    if (uvAttribute)
	        geometry.setAttribute("uv", newUvAttribute);
	}

        return posMap;
    }

    static sortOnSphericCoords(geometry, morphAttrId=null, line=false){
        var positionAttribute = null;
	var normalAttribute = null;
	var colorAttribute = null;
	var uvAttribute = null;

        if (morphAttrId != null){
	    positionAttribute = geometry.morphAttributes.position[morphAttrId];
	    normalAttribute = geometry.morphAttributes.normal[morphAttrId];
	    colorAttribute = geometry.morphAttributes.color[morphAttrId];
            if (geometry.morphAttributes.uv)
	        uvAttribute = geometry.morphAttributes.uv[morphAttrId];
        } else {
	    positionAttribute = geometry.getAttribute("position");
	    normalAttribute = geometry.getAttribute("normal");
	    colorAttribute = geometry.getAttribute("color");
	    uvAttribute = geometry.getAttribute("uv");
        }
        const newPositionAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newColorAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*4), 4);
	var newUvAttribute;
	if (uvAttribute){
	    newUvAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*2), 2);
	}


        // Create an array of indices to sort, then reorder the original array
        const indices = Array.from({ length: line ? positionAttribute.count/2 : positionAttribute.count }, (_, i) => i);
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();
        const s1 = new THREE.Spherical();
        const s2 = new THREE.Spherical();

        const stride = line ? 2 : 1;

        indices.sort((a, b) => {
            s1.setFromVector3(v1.fromBufferAttribute(positionAttribute, a*stride));
            s2.setFromVector3(v2.fromBufferAttribute(positionAttribute, b*stride));

            // Morton encode phi and theta and then sort by that
            const s1PhiThetaInterleaved = this.mortonEncodePhiTheta(s1.phi, s1.theta);
            const s2PhiThetaInterleaved = this.mortonEncodePhiTheta(s2.phi, s2.theta);

            if (s1PhiThetaInterleaved != s2PhiThetaInterleaved)
                return s1PhiThetaInterleaved - s2PhiThetaInterleaved;

            // If they match then use radius for sorting
            return s1.radius - s2.radius;
        });

        // Reorder the positions based on the sorted indices
	const posMap = new Array(indices.length).fill(false);
        for (let i = 0; i < indices.length; i++) {
            const originalIndex = indices[i];
            posMap[i] = originalIndex;
            for (let j=0; j<stride; j++){
	        newPositionAttribute.setXYZ(i*stride+j,
					    positionAttribute.getX(originalIndex*stride+j),
					    positionAttribute.getY(originalIndex*stride+j),
					    positionAttribute.getZ(originalIndex*stride+j));
	        if (normalAttribute)
		    newNormalAttribute.setXYZ(i*stride+j,
					      normalAttribute.getX(originalIndex*stride+j),
					      normalAttribute.getY(originalIndex*stride+j),
					      normalAttribute.getZ(originalIndex*stride+j));

	        if (colorAttribute)
		    newColorAttribute.setXYZW(i*stride+j,
					      colorAttribute.getX(originalIndex*stride+j),
					      colorAttribute.getY(originalIndex*stride+j),
					      colorAttribute.getZ(originalIndex*stride+j),
					      colorAttribute.getW(originalIndex*stride+j)
					     );
	        if (uvAttribute)
		    newUvAttribute.setXY(i*stride+j,
				         uvAttribute.getX(originalIndex*stride+j),
				         uvAttribute.getY(originalIndex*stride+j)
				        );
            }
        }


        if (morphAttrId != null){
	    geometry.morphAttributes.position[morphAttrId] = newPositionAttribute;
	    if (normalAttribute)
	        geometry.morphAttributes.normal[morphAttrId] = newNormalAttribute;
	    if (colorAttribute)
	        geometry.morphAttributes.color[morphAttrId] = newColorAttribute;
	    if (uvAttribute)
	        geometry.morphAttributes.uv[morphAttrId] = newUvAttribute;
        } else {
	    geometry.setAttribute("position", newPositionAttribute);
	    if (normalAttribute)
	        geometry.setAttribute("normal", newNormalAttribute);
	    if (colorAttribute)
	        geometry.setAttribute("color", newColorAttribute);
	    if (uvAttribute)
	        geometry.setAttribute("uv", newUvAttribute);
	}

        return posMap;
    }

    static sortAttrOnOctantAndLength(geometry, morphAttrId=null, line=false){
        var positionAttribute = null;
	var normalAttribute = null;
	var colorAttribute = null;
	var uvAttribute = null;

        if (morphAttrId != null){
	    positionAttribute = geometry.morphAttributes.position[morphAttrId];
	    normalAttribute = geometry.morphAttributes.normal[morphAttrId];
	    colorAttribute = geometry.morphAttributes.color[morphAttrId];
            if (geometry.morphAttributes.uv)
	        uvAttribute = geometry.morphAttributes.uv[morphAttrId];
        } else {
	    positionAttribute = geometry.getAttribute("position");
	    normalAttribute = geometry.getAttribute("normal");
	    colorAttribute = geometry.getAttribute("color");
	    uvAttribute = geometry.getAttribute("uv");
        }
        const newPositionAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newColorAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*4), 4);
	var newUvAttribute;
	if (uvAttribute){
	    newUvAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*2), 2);
	}


        // Create an array of indices to sort, then reorder the original array
        const indices = Array.from({ length: line ? positionAttribute.count/2 : positionAttribute.count }, (_, i) => i);
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();

        const stride = line ? 2 : 1;

        indices.sort((a, b) => {
            v1.fromBufferAttribute(positionAttribute, a*stride);
            v2.fromBufferAttribute(positionAttribute, b*stride);

            // Check octant
            if (Math.sign(v1.x) != Math.sign(v2.x))
                return Math.sign(v1.x) - Math.sign(v2.x);

            if (Math.sign(v1.y) != Math.sign(v2.y))
                return Math.sign(v1.y) - Math.sign(v2.y);

            if (Math.sign(v1.z) != Math.sign(v2.z))
                return Math.sign(v1.z) - Math.sign(v2.z);

            // Same Octant - compare the length of positions at position a and b
            return v1.fromBufferAttribute(positionAttribute, a*stride).length() - v2.fromBufferAttribute(positionAttribute, b*stride).length();
        });

        // Reorder the positions based on the sorted indices
	const posMap = new Array(indices.length).fill(false);
        for (let i = 0; i < indices.length; i++) {
            const originalIndex = indices[i];
            posMap[i] = originalIndex;
            for (let j=0; j<stride; j++){
	        newPositionAttribute.setXYZ(i*stride+j,
					    positionAttribute.getX(originalIndex*stride+j),
					    positionAttribute.getY(originalIndex*stride+j),
					    positionAttribute.getZ(originalIndex*stride+j));
	        if (normalAttribute)
		    newNormalAttribute.setXYZ(i*stride+j,
					      normalAttribute.getX(originalIndex*stride+j),
					      normalAttribute.getY(originalIndex*stride+j),
					      normalAttribute.getZ(originalIndex*stride+j));

	        if (colorAttribute)
		    newColorAttribute.setXYZW(i*stride+j,
					      colorAttribute.getX(originalIndex*stride+j),
					      colorAttribute.getY(originalIndex*stride+j),
					      colorAttribute.getZ(originalIndex*stride+j),
					      colorAttribute.getW(originalIndex*stride+j)
					     );
	        if (uvAttribute)
		    newUvAttribute.setXY(i*stride+j,
				         uvAttribute.getX(originalIndex*stride+j),
				         uvAttribute.getY(originalIndex*stride+j)
				        );
            }
        }


        if (morphAttrId != null){
	    geometry.morphAttributes.position[morphAttrId] = newPositionAttribute;
	    if (normalAttribute)
	        geometry.morphAttributes.normal[morphAttrId] = newNormalAttribute;
	    if (colorAttribute)
	        geometry.morphAttributes.color[morphAttrId] = newColorAttribute;
	    if (uvAttribute)
	        geometry.morphAttributes.uv[morphAttrId] = newUvAttribute;
        } else {
	    geometry.setAttribute("position", newPositionAttribute);
	    if (normalAttribute)
	        geometry.setAttribute("normal", newNormalAttribute);
	    if (colorAttribute)
	        geometry.setAttribute("color", newColorAttribute);
	    if (uvAttribute)
	        geometry.setAttribute("uv", newUvAttribute);
	}

        return posMap;
    }

    static randomizePositionOrder(geometry, morphAttrId=null, line=false){
        var positionAttribute = null;
	var normalAttribute = null;
	var colorAttribute = null;
	var uvAttribute = null;

        if (morphAttrId != null){
	    positionAttribute = geometry.morphAttributes.position[morphAttrId];
	    normalAttribute = geometry.morphAttributes.normal[morphAttrId];
	    colorAttribute = geometry.morphAttributes.color[morphAttrId];
            if (geometry.morphAttributes.uv)
	        uvAttribute = geometry.morphAttributes.uv[morphAttrId];
        } else {
	    positionAttribute = geometry.getAttribute("position");
	    normalAttribute = geometry.getAttribute("normal");
	    colorAttribute = geometry.getAttribute("color");
	    uvAttribute = geometry.getAttribute("uv");
        }
        const newPositionAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newColorAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*4), 4);
	var newUvAttribute;
	if (uvAttribute){
	    newUvAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*2), 2);
	}
	var posCount = line ? positionAttribute.count/2 : positionAttribute.count;
        var posRemaining = posCount;
	const posUsed = new Array(posCount).fill(false);
	const posMap = new Array(posCount).fill(false);
        const stride = line ? 2 : 1;
	while (posRemaining){
	    var random_idx;
	    do {
		random_idx = Math.floor(Math.random()*posCount);
	    } while (posUsed[random_idx] != false)

	    posRemaining -= 1;
	    posUsed[random_idx] = posRemaining;
	    posMap[posRemaining] = random_idx;

            for (let i=0; i<stride; i++){
	        newPositionAttribute.setXYZ(stride*posRemaining+i,
					    positionAttribute.getX(stride*random_idx+i),
					    positionAttribute.getY(stride*random_idx+i),
					    positionAttribute.getZ(stride*random_idx+i));
	        if (normalAttribute)
		    newNormalAttribute.setXYZ(stride*posRemaining+i,
					      normalAttribute.getX(stride*random_idx+i),
					      normalAttribute.getY(stride*random_idx+i),
					      normalAttribute.getZ(stride*random_idx+i));

	        if (colorAttribute)
		    newColorAttribute.setXYZW(stride*posRemaining+i,
					      colorAttribute.getX(stride*random_idx+i),
					      colorAttribute.getY(stride*random_idx+i),
					      colorAttribute.getZ(stride*random_idx+i),
					      colorAttribute.getW(stride*random_idx+i)
					     );
	        if (uvAttribute)
		    newUvAttribute.setXY(stride*posRemaining+i,
				         uvAttribute.getX(stride*random_idx+i),
				         uvAttribute.getY(stride*random_idx+i)
				        );
	    }
        }

        if (morphAttrId != null){
	    geometry.morphAttributes.position[morphAttrId] = newPositionAttribute;
	    if (normalAttribute)
	        geometry.morphAttributes.normal[morphAttrId] = newNormalAttribute;
	    if (colorAttribute)
	        geometry.morphAttributes.color[morphAttrId] = newColorAttribute;
	    if (uvAttribute)
	        geometry.morphAttributes.uv[morphAttrId] = newUvAttribute;
        } else {
	    geometry.setAttribute("position", newPositionAttribute);
	    if (normalAttribute)
	        geometry.setAttribute("normal", newNormalAttribute);
	    if (colorAttribute)
	        geometry.setAttribute("color", newColorAttribute);
	    if (uvAttribute)
	        geometry.setAttribute("uv", newUvAttribute);
	}

	return posMap;
    }

    static collectGLTFGeometryAttributes(obj, attributes, index, recursive=true, filterName=null){
	var map = null;
	if (obj.children && recursive && !obj.isBone){
	    obj.children.forEach((o) => {
		const foundMap = this.collectGLTFGeometryAttributes(o, attributes, index, recursive);
		if (foundMap){
		    if (map)
			console.warn("Found multiple maps in GLTF" + obj);
		    map = foundMap;
		}
	    });
	}
	if (obj.geometry && (!filterName || obj.name.match(filterName))){
	    if (obj.geometry.index){
		// Need to offset the index with the offset of the
		// positions we add to the attributes
		const indexOffset = attributes.position.length/3;
		for (let i=0; i<obj.geometry.index.array.length; i++){
		    index.push(obj.geometry.index.array[i] + indexOffset);
		}
	    }

	    for(var key in attributes) {
		const geomAttr = obj.geometry.getAttribute(key);
		if (geomAttr){
		    if (key == "color" && geomAttr.itemSize != 4){
			// If this is a color attribute and it does not have alpha
			// then change it to use alpha
			for (let i=0; i<geomAttr.count; i++){
			    attributes[key].push(geomAttr.array[i*3+0]);
			    attributes[key].push(geomAttr.array[i*3+1]);
			    attributes[key].push(geomAttr.array[i*3+2]);
			    attributes[key].push(1.0);
			}
		    } else if (key == "position" && obj.getVertexPosition){
			// If this is an object that has getVertexPosition then
			// it is an object that has either morph targets or skinning
			// so use this function to get the positions so that we get
			// the animation state of the positions included
			const vec3 = new THREE.Vector3();
			for (let i=0; i<geomAttr.count; i++){
			    obj.getVertexPosition(i, vec3);
			    attributes[key].push(vec3.x);
			    attributes[key].push(vec3.y);
			    attributes[key].push(vec3.z);
			}
		    } else {
			attributes[key] = attributes[key].concat(Array.from(geomAttr.array));
		    }
		} else if (key == "color" && obj.material && obj.material.color){
		    // No color present but we have a material with color so use that
		    const posAttr = obj.geometry.getAttribute("position");
		    for (let i=0; i<posAttr.count; i++){
			attributes[key].push(obj.material.color.r);
			attributes[key].push(obj.material.color.g);
			attributes[key].push(obj.material.color.b);
			attributes[key].push(1.0);
		    }
		} else if (key == "normal"){
                    if (obj.isPoints){
                        // Just set normal to same value as position
		        attributes[key] = attributes[key].concat(Array.from(obj.geometry.getAttribute("position").array));
                    } else {
                        obj.geometry.computeVertexNormals();
		        attributes[key] = attributes[key].concat(Array.from(obj.geometry.getAttribute("normal").array));
                    }
		} else if (attributes[key].length != 0) {
		    console.warn("Did not find attribute '" + key + "' in geometry: " + obj.geometry);
		}
	    }

	    if (obj.material && obj.material.map){
		if (map)
		    console.warn("Found multiple maps in GLTF" + obj);
		map = obj.material.map;
	    }
	}
	return map;
    }

    static loadJSON(descriptor, loadDone = null){
	const thisClass = this;
	const loader = new THREE.BufferGeometryLoader();
	loader.load(descriptor.filename, function ( geom ) {
	    loadDone(geom, null);
	})
    }

    static loadGLTF(descriptor, loadDone = null){
	const thisClass = this;
	const loader = new GLTFLoader();
	loader.load(descriptor.filename, function ( gltf ) {
	    var obj = gltf.scene;

	    if (descriptor.animationName){
		const clip = THREE.AnimationClip.findByName( gltf, descriptor.animationName );
		if (clip){
		    const mixer = new THREE.AnimationMixer( obj );
		    const action = mixer.clipAction( clip )
		    action.play();
		    mixer.setTime(descriptor.animationTime);
		    obj.updateMatrixWorld(false);
		} else {
		    console.warn("Found no animation named '" + descriptor.animationName + "' in obj " + gltf);
		}
	    }

	    const attributes = {
		position: [],
		normal: [],
		color: [],
		uv: []
	    };
	    const attributeItemCounts = {
		position: 3,
		normal: 3,
		color: 4,
		uv: 2
	    };
	    const index = [];
	    const map = thisClass.collectGLTFGeometryAttributes(obj, attributes, index);
	    const geometry = new THREE.BufferGeometry();
	    var prevCount;
	    for(var key in attributes) {
                if (key == "color" && descriptor.color != null) continue;

		const itemCount = attributeItemCounts[key];
		const count = attributes[key].length/itemCount;
		if (count == 0) continue;

		if (prevCount && prevCount != count)
		    console.error("Mismatched attribute count for '" + key + "' - was " + count + " expceted " + prevCount);
		geometry.setAttribute( key, new THREE.BufferAttribute(new Float32Array(attributes[key]), itemCount));
		prevCount = count;
	    }

	    if (index.length > 0)
		geometry.index = new THREE.BufferAttribute(new Float32Array(index), 1);

	    if (!descriptor.animationName){
		geometry.center();
	    }

	    loadDone(geometry, map);
	}, undefined, function ( error ) {
	    console.error( error );
	} );
    }

    static SVGtoObject3D(file, color, loadDone = null){
	// instantiate a loader
	const loader = new SVGLoader();

	loader.load(
	    // resource URL
	    file,
	    // called when the resource is loaded
	    function ( data ) {
		const geometry_list = [];
		const paths = data.paths;
		for ( let i = 0; i < paths.length; i ++ ) {
		    const path = paths[ i ];


		    //const shapes = SVGLoader.createShapes( path );
		    //for ( let j = 0; j < shapes.length; j ++ ) {

		    for ( const subPath of path.subPaths ) {

			//const shape = shapes[ j ];
			subPath.curves.forEach((curve) => {
			    var points;
			    if (curve.type == "EllipseCurve"){
				points = curve.getPoints(360);
			    } else if (curve.type == "LineCurve"){
				points = curve.getPoints(1);
			    } else {
				points = curve.getPoints(360);
			    }
			    //const geometry = make_cylinder_from_path(points, 2, 8);
			    const geometry = SVGLoader.pointsToStroke( points, path.userData.style);
			    //const geometry = SVGLoader.pointsToStroke( subPath.getPoints(), path.userData.style, 500 );
			    //const geometry = new THREE.ShapeGeometry( shape );
			    if (geometry){
				geometry_list.push(geometry);
			    }
			});

		    }
		}

		const merged_geometry = BufferGeometryUtils.mergeGeometries(geometry_list, true);

		merged_geometry.deleteAttribute("uv");
		if (!merged_geometry.hasAttribute("color")){
		    const position = merged_geometry.getAttribute("position");
		    const colors = new Float32Array(position.count*4);
		    color = new THREE.Color(color);
		    for (let i=0; i<position.count; i++){
			colors[i*4] = color.r;
			colors[i*4+1] = color.g;
			colors[i*4+2] = color.b;
			colors[i*4+3] = 1.0;
		    }
		    merged_geometry.setAttribute('color',new THREE.BufferAttribute(colors, 4));
		}
		loadDone( merged_geometry );
	    },
	    // called when loading is in progresses
	    function ( xhr ) {

		console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

	    },
	    // called when loading has errors
	    function ( error ) {

		console.log( 'An error happened' );
		console.log( error );

	    }
	);
    }


    /**
     * These are taken from InstancedMesh to support instancing
     *
     */

    computeBoundingBox() {
        if (instanceCount == 1)
            return super.computeBoundingBox();

	const geometry = this.geometry;
	const count = this.count;

	if ( this.boundingBox === null ) {
	    this.boundingBox = new THREE.Box3();
	}

	if ( geometry.boundingBox === null ) {
	    geometry.computeBoundingBox();
	}

	this.boundingBox.makeEmpty();

	for ( let i = 0; i < count; i ++ ) {
	    this.getMatrixAt( i, _instanceLocalMatrix );
	    _box3.copy( geometry.boundingBox ).applyMatrix4( _instanceLocalMatrix );
	    this.boundingBox.union( _box3 );
	}
    }

    computeBoundingSphere() {
	const geometry = this.geometry;
	const count = this.count;

	if ( this.boundingSphere === null ) {
	    this.boundingSphere = new THREE.Sphere();
	}

	if ( geometry.boundingSphere === null ) {
	    geometry.computeBoundingSphere();
	}

	this.boundingSphere.makeEmpty();

	for ( let i = 0; i < count; i ++ ) {
	    this.getMatrixAt( i, _instanceLocalMatrix );
	    _sphere.copy( geometry.boundingSphere ).applyMatrix4( _instanceLocalMatrix );
	    this.boundingSphere.union( _sphere );
	}
    }

    getMorphAt(index) {
	const array = this.morphTexture.source.data.data;
	const len = this.morphTargetInfluences.length + 1; // All influences + the baseInfluenceSum
	const dataIndex = index * len + 1; // Skip the baseInfluenceSum at the beginning

        return array.slice(dataIndex, dataIndex + len - 1);
    }

    setMorphAt(index, morphTargetInfluences) {
	const objectInfluences = morphTargetInfluences;
	const len = objectInfluences.length + 1; // morphBaseInfluence + all influences

	if ( this.morphTexture === null ) {
	    this.morphTexture = new THREE.DataTexture( new Float32Array( len * this.count ), len, this.count, THREE.RedFormat, THREE.FloatType );
	}

	const array = this.morphTexture.source.data.data;

	let morphInfluencesSum = 0;

	for ( let i = 0; i < objectInfluences.length; i ++ ) {
	    morphInfluencesSum += objectInfluences[ i ];
	}

	const morphBaseInfluence = this.geometry.morphTargetsRelative ? 1 : 1 - morphInfluencesSum;

	const dataIndex = len * index;
	array[ dataIndex ] = morphBaseInfluence;
	array.set( objectInfluences, dataIndex + 1 );
        this.morphTexture.needsUpdate = true;
    }

    initializeInstances(x) {
        if (this.count > 1){
            for (let i=0; i < this.count; i++){
                this.setMorphAt(i, this.morphTargetInfluences);
            }
        }
        this.currentMorphDescIdForInstance = Array(this.count).fill(this.currentMorphDescId);
        return this
    }


    setMatrixAt( index, matrix ) {
	matrix.toArray( this.instanceMatrix.array, index * 16 );
    }

    getMatrixAt( index, matrix ) {
	matrix.fromArray( this.instanceMatrix.array, index * 16 );
    }

    constructor(params){
	super();

	if (!params.num_points)
	    return;

	this.point_sprite_file = params.point_sprite_file || null;
	this.num_points = params.num_points;
	if (this.point_sprite_file && this.point_sprite_file.constructor === Array){
	    console.assert(params.pointMapIndex && params.pointMapIndex.length == this.num_points);
	    this.pointMapIndex = params.pointMapIndex;
	}

        this.count = params.instanceCount || 1;
        if (this.count > 1){
            this.isInstancedMesh = true;
            this.instanceMatrix = new THREE.InstancedBufferAttribute( new Float32Array( this.count * 16 ), 16 );
            this.instanceColor = null;
            this.morphTexture = null;
	    this.boundingBox = null;
	    this.boundingSphere = null;
            this.instanceScaleTimeFBM = params.instanceScaleTimeFBM || null;
            this.instanceScaleTimePerlin = params.instanceScaleTimePerlin || null;

            // Make an Object3D object for each instance that can be used to
            // easily change position and rotation with
            this.instance = new Array(this.count);
            for (let i=0; i<this.count; i++){
                this.instance[i] = new THREE.Object3D();
            }
        }

	this.isMorphCloud = true;
	this.point_size = params.point_size;
	this.color = params.color;
	this.alpha = params.alpha;
	this.renderer = params.renderer;
	this.camera = params.camera;
	this.onclick = params.onclick;
	this.enableBloom = params.enableBloom;
        this.name = params.name || "";

	this.displacementMap = { value: [] };
	this.displacementMapUniform = { value: [] };
	this.displacementMapDescIdx = [];
	this.textureMap = { value: [] };
	this.textureMapUniform = { value: [] };
	this.textureMapDescIdx = [];
	this.morphBoundsUniform = { value: [] };
	this.bloomIntensityUniform = { value: [] };
	this.clock = new THREE.Clock();
	this.clock.start();
        const timeValues = this.instanceScaleTimeFBM || this.instanceScaleTimePerlin ? 2*this.count : 2;
	this.currentTime = {value: new Array(timeValues).fill(this.clock.getElapsedTime())};

	//console.log(num_points);
	this.constructor.allObjects.push(this);
        this.updateFuncs = [];
    }


    getMorphId(morphDescID=this.currentMorphDescId){
	var morphId = this.descriptorToMorphIdMap[morphDescID];

	if (this.descriptor[morphDescID].video){
	    morphId=-1;
	}

	return morphId;
    }

    morphTo(index, easing=TWEEN.Easing.Cubic.Out, time=1000, onStart=null, onComplete=null, instance=0){
        if (index >= this.descriptor.length || index < 0){
	    console.warn("Trying to morph to non-existent index: " + index);
	    return
	}

        const currentMorphDescId = this.currentMorphDescIdForInstance[instance];
	const prevDescriptor = this.descriptor[currentMorphDescId];
	const newDescriptor = this.descriptor[index];
	newDescriptor.morphLastStartTime = this.clock.getElapsedTime();
	if (index != currentMorphDescId){
	    //if (prevDescriptor.video){
	    //	prevDescriptor.video.pause();
	    //}

	    if (newDescriptor.video){
		newDescriptor.videoStartTime = this.clock.getElapsedTime();
		newDescriptor.video.pause();
		newDescriptor.video.currentTime = 0;
	    }
	}

	const morphId = this.getMorphId(index);

	if (morphId < 0){
            this.currentMorphDescIdForInstance[instance] = index;
	    this.update().then( (() => {
		var curDispMapIdx = 0;
		var curTextureMapIdx = 0;
		this.displacementMapDescIdx.forEach( (desc_idx, i) => {
		    if (desc_idx == index){
			// Set enable flag for this displacement map
			if (newDescriptor.displacementMapFlags && newDescriptor.displacementMapFlags.constructor === Array)
			    this.displacementMapUniform.value[i].flags = newDescriptor.displacementMapFlags[curDispMapIdx++];
			else
			    this.displacementMapUniform.value[i].flags = newDescriptor.displacementMapFlags || 0;
		    } else if (this.displacementMapUniform.value[i].morphIdx == 0){
			// Clear flags for other displacement maps that uses morph index 0
			this.displacementMapUniform.value[i].flags = 0;
		    }
		});
		this.textureMapDescIdx.forEach( (desc_idx, i) => {
		    if (desc_idx == index){
			// Set enable flag for this texture map
			if (newDescriptor.textureMapFlags && newDescriptor.textureMapFlags.constructor === Array)
			    this.textureMapUniform.value[i].flags = newDescriptor.textureMapFlags[curTextureMapIdx++];
			else
			    this.textureMapUniform.value[i].flags = newDescriptor.textureMapFlags || 0;
		    } else if (this.textureMapUniform.value[i].morphIdx == 0){
			// Clear flags for other displacement maps that uses morph index 0
			this.textureMapUniform.value[i].flags = 0;
		    }
		});

                this.morphBoundsUniform.value[0] = newDescriptor.cloudBounds.data();
                if (this.enableBloom)
                    this.bloomIntensityUniform.value[0] = newDescriptor.bloomIntensity || 1.0;
	    }).bind(this));
	}

	const newMorphTargetInfluences = Array(this.morphTargetInfluences.length).fill(0);

	if (morphId >= 0 && morphId < this.morphTargetInfluences.length){
	    newMorphTargetInfluences[morphId] = 1;
	}

        if (this.pendingMorphTween == null)
            this.pendingMorphTween = Array(this.count).fill(null);

	if (this.pendingMorphTween && this.pendingMorphTween[instance]){
            //console.warn(this.name + " killing of morph to " + this.nextMorphDescId + " in progress (New index " + index + ")");
            const tweenToEnd = this.pendingMorphTween[instance];
	    this.pendingMorphTween[instance].end();
            TWEEN.remove(tweenToEnd);
        }

	if (time == 0){
            if (this.count > 1)
                this.setMorphAt(instance, newMorphTargetInfluences);
            else
	        this.morphTargetInfluences = newMorphTargetInfluences;

	    this.currentMorphDescIdForInstance[instance] = index;
	    if (onComplete)
		onComplete();
	} else {
            this.nextMorphDescId = this.nextMorphDescId || new Array(this.count).fill(null);
	    this.nextMorphDescId[instance] = index;

            if (this.count > 1){
                const dummyTarget = this.getMorphAt(instance);
                this.pendingMorphTween[instance] =
		    new TWEEN.Tween(dummyTarget)
		    .to(newMorphTargetInfluences,time)
		    .easing(easing)
	            .onUpdate(() => {
                        this.setMorphAt(instance, dummyTarget);
                    })
	            .onStart(() => {
		        if (onStart){
			    onStart();
                        }
		    });
            } else {
                this.pendingMorphTween[instance] =
		    new TWEEN.Tween(this.morphTargetInfluences)
		    .to(newMorphTargetInfluences,time)
		    .easing(easing)
	            .onStart(() => {
		        if (onStart){
			    onStart();
                        }
		    });
            }
            //console.warn(this.name + " start morphing from " + this.currentMorphDescId + " to " + index);
            this.pendingMorphTween[instance].onComplete(
                function (tweenObj, onComplete, index, curIndex){
                    // If this tween is currently what is in pendingMorphTween
                    // then remove it - if not it means that a new tween has
                    // started before this complete has run as this seems like
                    // it can happen when we end a tween prematurely
                    if (tweenObj === this.pendingMorphTween[instance]){
		        this.currentMorphDescIdForInstance[instance] = index;
		        this.nextMorphDescId[instance] = null;
		        this.pendingMorphTween[instance] = null;
                        //const prevMorphIndex = curIndex;
                        //console.warn(this.name + " onComplete() run when morphing from " + prevMorphIndex + " to " + this.currentMorphDescId);
                    }
		    if (onComplete){
		        onComplete();
                    }
                }.bind(this, this.pendingMorphTween[instance], onComplete, index, this.currentMorphDescIdForInstance[instance])
	    ).start();

	}
    }

    getNextMorphInfluence(instance=0){
	const curMorphId = this.getMorphId(this.currentMorphDescIdForInstance[instance]);
	const nextMorphId = this.getMorphId(this.nextMorphDescId[instance]);
	var curInfluence = curMorphId >= 0 ? this.morphTargetInfluences[curMorphId] : null;
	var nextInfluence = nextMorphId >= 0? this.morphTargetInfluences[nextMorphId] : null;

	if (curInfluence === null)
	    curInfluence = nextInfluence === null ? 1 : 1 - nextInfluence;
	if (nextInfluence === null)
	    nextInfluence = curInfluence === null ? 0 : 1 - curInfluence;

        return nextInfluence;
    }

    getCurrentMorphCenter(instance=0){
	const curDescr = this.descriptor[this.currentMorphDescIdForInstance[instance]];
	const curMorphId = this.getMorphId(this.currentMorphDescIdForInstance[instance]);
	const curCenter = this.localToWorld(curDescr.cloudBounds.center());
	if (this.nextMorphDescId && (this.nextMorphDescId[instance] != null) && this.descriptor[this.nextMorphDescId[instance]].cloudBounds){
	    const nextDescr = this.descriptor[this.nextMorphDescId[instance]];
            const nextInfluence = this.getNextMorphInfluence();
	    const nextCenter = this.localToWorld(nextDescr.cloudBounds.center());
	    return curCenter.lerp(nextCenter, nextInfluence);
	}
	return curCenter;
    }

    setCurrentTimeUniform(instance=0){
	const currentMorphDescId = this.currentMorphDescIdForInstance[instance];
	const d = this.descriptor[currentMorphDescId];
        var scaleTimePerlin = d.scaleTimePerlin != null ? d.scaleTimePerlin : 1.0;
        var scaleTimeFBM = d.scaleTimeFBM != null ? d.scaleTimeFBM : 1.0;
        if (this.nextMorphDescId && this.nextMorphDescId[instance] != null){
            const nextDescr = this.descriptor[this.nextMorphDescId[instance]];
            const nextInfluence = this.getNextMorphInfluence();
            scaleTimePerlin = scaleTimePerlin*(1-nextInfluence) + nextInfluence*(nextDescr.scaleTimePerlin || 1.0);
            scaleTimeFBM = scaleTimeFBM*(1-nextInfluence) + nextInfluence*(nextDescr.scaleTimeFBM || 1.0);
        }

        const instanceScaleTimePerlin = (this.instanceScaleTimePerlin && this.instanceScaleTimePerlin[instance]) || 1.0;
        const instanceScaleTimeFBM = (this.instanceScaleTimeFBM && this.instanceScaleTimeFBM[instance]) || 1.0;

        this.currentTime.value[instance*2+0] = instanceScaleTimePerlin*scaleTimePerlin*this.clock.getElapsedTime();
	this.currentTime.value[instance*2+1] = instanceScaleTimeFBM*scaleTimeFBM*this.clock.getElapsedTime();
    }

    setCurrentPointSize(instance=0){
	const currentMorphDescId = this.currentMorphDescIdForInstance[instance];
	const d = this.descriptor[currentMorphDescId];
        var newPointSize = d.pointSize || this.point_size;
        if (this.nextMorphDescId && this.nextMorphDescId[instance] != null){
            const nextDescr = this.descriptor[this.nextMorphDescId[instance]];
            const nextInfluence = this.getNextMorphInfluence();
            newPointSize = newPointSize*(1-nextInfluence) + nextInfluence*(nextDescr.pointSize || this.point_size);
        }

        this.material.size = newPointSize;
    }

    onUpdate(func){
        this.updateFuncs.push(func);
    }

    clearUpdate(){
        this.updateFuncs = [];
    }

    popUpdate(){
        return this.updateFuncs.pop();
    }

    update(){
        if (this.currentMorphDescIdForInstance == null)
            return

        // Run all update functions
        this.updateFuncs.forEach((x) => {x(this, this.clock.getElapsedTime())});

        if (this.count > 1){
            // Check if any of the instance proxy objects for position and rotation
            // have changed. If so we need to update the instance matrix
            this.prevInstance = this.prevInstance || new Array(this.count);
            var instanceMatrixUpdated = false;
            for (let i=0; i<this.count; i++){
                var update = false;

                if (this.prevInstance[i] == null ||
                    !this.prevInstance[i].position.equals(this.instance[i].position) ||
                    !this.prevInstance[i].rotation.equals(this.instance[i].rotation))
                    update = true;

                if (this.prevInstance[i] == null)
                    this.prevInstance[i] = this.instance[i].clone();

                this.prevInstance[i].position.copy(this.instance[i].position);
                this.prevInstance[i].rotation.copy(this.instance[i].rotation);

                if (update){
                    this.instance[i].updateMatrix();
                    this.setMatrixAt(i, this.instance[i].matrix);
                    instanceMatrixUpdated = true;
                }
            }

            if (instanceMatrixUpdated){
                this.instanceMatrix.needsUpdate = true;
                this.computeBoundingSphere();
            }
        }


        // Update some uniforms
        if (this.count > 1 && (this.instanceScaleTimeFBM || this.instanceScaleTimePerlin)){
            for (let i=0; i<this.count; i++)
                this.setCurrentTimeUniform(i);
        } else {
            this.setCurrentTimeUniform();
        }
        this.setCurrentPointSize();

	const promises = [];
        const currentMorphDescActive = new Set(this.currentMorphDescIdForInstance);
        currentMorphDescActive.forEach( (currentMorphDescId) => {
	    const d = this.descriptor[currentMorphDescId];

	    // Update any texture maps that has video texture
	    promises.push(...this.updateVideoMap(currentMorphDescId, this.textureMap.value, this.textureMapUniform.value, this.textureMapDescIdx));
	    promises.push(...this.updateVideoMap(currentMorphDescId, this.displacementMap.value, this.displacementMapUniform.value, this.displacementMapDescIdx));
	    if (d.video) {
	        var time = this.clock.getElapsedTime() - d.videoStartTime;
	        var play = true;
	        if (time > d.video.duration){
		    if (d.video.loop)
		        time -= d.video.duration;
		    else
		        play = false;
	        }

	        if (play){
		    d.video.currentTime = time;
		    promises.push(d.video.play().then( _ => {
		        this.addFromDescriptor(d, currentMorphDescId);
		        d.video.pause();
		    }));
	        }
	    }
        });

	return Promise.all(promises);
    }

    updateVideoMap(descIdx, mapArray, mapUniform, mapDescIdxArray){
	const promises = [];
	mapArray.forEach( (map, i) => {
	    // Find all entries that use this texture map
	    if (map.isVideoTexture){
		// Check if this texture is used in this morph
		const match = mapUniform.filter((uniform, idx) =>
		    (uniform.mapIdx == i) && (mapDescIdxArray[idx] == descIdx));
		if (match.length > 0){
		    var time = this.clock.getElapsedTime() - this.descriptor[descIdx].morphLastStartTime;
		    if (time > map.videoElmt.duration){
			time -= map.videoElmt.duration;
		    }
		    map.videoElmt.currentTime = time;
		    promises.push(map.videoElmt.play().then( _ => {
			//map.videoElmt.pause();
		    }));
		}
	    }

	});

	return promises;
    }


    genColorAttr(num_points, color=null, alpha=null){
	const colors = new Float32Array(num_points*4);
	color = color == null ? this.color : color;
	alpha = alpha == null ? this.alpha : alpha;
	var colorFunc, alphaFunc;
	if (color.isBufferGeometry){
	    const colorAttr = color.getAttribute("color");
	    colorFunc = function (i){
		return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
	    }
	} else if (typeof color === 'function'){
	    colorFunc = color;
	} else {
	    color = new THREE.Color(color);
	    colorFunc = function (i){
		return color;
	    }

	}

	if (alpha.isBufferGeometry){
	    const colorAttr = alpha.getAttribute("color");
	    alphaFunc = function (i){
		return colorAttr.getW(i);
	    }
	} else if (typeof alpha === 'function'){
	    alphaFunc = alpha;
	} else {
	    alphaFunc = function (i){
		return alpha;
	    }

	}

	for (let i=0; i<num_points; i++){
	    const c = colorFunc(i, this);
	    const alpha = alphaFunc(i, this);
	    colors[i*4] = c.r;
	    colors[i*4+1] = c.g;
	    colors[i*4+2] = c.b;
	    colors[i*4+3] = alpha;
	}
	return new THREE.BufferAttribute(colors, 4);
    }

    createVideoTexture(file){
	if (this.videoTextures && this.videoTextures[file])
	    return this.videoTextures[file];

	const video = document.createElement('video');
	video.src = file;
	video.loop = true;
	this.videoTextures = this.videoTextures || {};
	this.videoTextures[file] = new THREE.VideoTexture( video );
	this.videoTextures[file].videoElmt = video;
	return this.videoTextures[file];
    }


    resolveTexture(texture){
	if (texture.isTexture)
	    return texture;

	const file_ext = texture.split(".").pop();
	if (videoExtension.includes(file_ext))
	    return this.createVideoTexture(texture);
	else if (imageExtension.includes(file_ext)){
	    if (this.imageTextures && this.imageTextures[texture])
		return this.imageTextures[texture];

	    this.imageTextures = this.imageTextures || {};
	    this.imageTextures[texture] = new THREE.TextureLoader().load(texture);
	    this.imageTextures[texture].colorSpace = THREE.SRGBColorSpace;
	    this.imageTextures[texture].wrapS = THREE.RepeatWrapping;
	    this.imageTextures[texture].wrapT = THREE.RepeatWrapping;

	    return this.imageTextures[texture];
	}

	console.error("Not able to handle texture " + texture);
	return null;
    }

    updateTextureMapUniforms(d, index, morphId=-1){
    	// Update texture map uniform values
	if (d.textureMap || d.textureMapFlags){
	    // Check if we already have this descriptor in the uniforms
	    // if so then update existing entries
	    var updateIndex = this.textureMapDescIdx.length;
	    const existingIndex = this.textureMapDescIdx.indexOf(index);
	    if (existingIndex != -1)
		updateIndex = existingIndex

	    // Check number of maps for this morph
	    var numMaps = 1;
	    if (d.textureMap && d.textureMap.constructor === Array){
		numMaps = d.textureMap.length;
	    }
	    for (let i=0; i<numMaps; i++){
		this.textureMapUniform.value[updateIndex+i] = this.textureMapUniform.value[updateIndex+i] || {};
		// Update texture map flags
		if (d.textureMapFlags && d.textureMapFlags.constructor === Array)
		    this.textureMapUniform.value[updateIndex+i].flags = d.textureMapFlags[i] || 0;
		else
		    this.textureMapUniform.value[updateIndex+i].flags = d.textureMapFlags || 0;

		// Add texture - check if the same texture is already used and
		// keep a map with the index of the texture
		var texture;
		if (((this.textureMapUniform.value[updateIndex+i].flags & this.constructor.TEXTURE_MAP_USE_UV) != 0) &&
		    !(d.textureMap != null && (d.textureMap.constructor !== Array ||  d.textureMap[i] != null)))
		    // This texture uses uv attribute - assume we find the actual texture in d.map
		    // as this is not given as input in the descriptor and we assume it is given in
		    // the 3d model
		    texture = d.map;
		else if (d.textureMap && d.textureMap.constructor === Array)
		    texture = d.textureMap[i] || defaultTextureMap;
                // If the value is a number then take the map from another descriptor
		else if (Number.isInteger(d.textureMap))
                    texture = this.descriptor[d.textureMap].map;
		else
                    texture = d.textureMap || defaultTextureMap;
		texture = this.resolveTexture(texture);
		var textureIdx = this.textureMap.value.findIndex((elmt) => texture === elmt);
		if (textureIdx == -1){
		    this.textureMap.value.push(texture);
		    textureIdx = this.textureMap.value.length - 1;
		}
		this.textureMapUniform.value[updateIndex+i].mapIdx = textureIdx;
		if (d.textureMapScale && d.textureMapScale.constructor === Array)
		    this.textureMapUniform.value[updateIndex+i].scale = d.textureMapScale[i] ||  new THREE.Vector2(1,1);
		else
		    this.textureMapUniform.value[updateIndex+i].scale = d.textureMapScale ||  new THREE.Vector2(1,1);
		if (d.textureMapOffset && d.textureMapOffset.constructor === Array)
		    this.textureMapUniform.value[updateIndex+i].offset = d.textureMapOffset[i] ||  new THREE.Vector2(0,0);
		else
		    this.textureMapUniform.value[updateIndex+i].offset = d.textureMapOffset ||  new THREE.Vector2(0,0);
		if (d.textureMapViewPos && d.textureMapViewPos.constructor === Array)
		    this.textureMapUniform.value[updateIndex+i].viewPos = d.textureMapViewPos[i] ||  new THREE.Vector3(0,0,0);
		else
		    this.textureMapUniform.value[updateIndex+i].viewPos = d.textureMapViewPos ||  new THREE.Vector3(0,0,0);
		if (d.textureMapUp && d.textureMapUp.constructor === Array)
		    this.textureMapUniform.value[updateIndex+i].up = d.textureMapUp[i] ||  new THREE.Vector3(0,1,0);
		else
		    this.textureMapUniform.value[updateIndex+i].up = d.textureMapUp ||  new THREE.Vector3(0,1,0);
		if (d.textureMapBlendCoeffs && d.textureMapBlendCoeffs.constructor === Array)
		    this.textureMapUniform.value[updateIndex+i].blendCoeffs = d.textureMapBlendCoeffs[i] ||  new THREE.Vector4(0.5, 0.5, 0.5, 0.5);
		else
		    this.textureMapUniform.value[updateIndex+i].blendCoeffs = d.textureMapBlendCoeffs ||  new THREE.Vector4(0.5, 0.5, 0.5, 0.5);
		// Video will always we with the base geometry which we set as morphId 0
		this.textureMapUniform.value[updateIndex+i].morphIdx = d.video ? 0 : morphId+1;
		this.textureMapDescIdx[updateIndex+i] = index;
	    }
	}
    }

    updateDisplacementMapUniforms(d, index, morphId=-1){
	// Update displacement map uniform values
	if (d.displacementMap || d.displacementMapFlags){
	    // Check if we already have this descriptor in the uniforms
	    // if so then update existing entries
	    var updateIndex = this.displacementMapDescIdx.length;
	    const existingIndex = this.displacementMapDescIdx.indexOf(index);
	    if (existingIndex != -1)
		updateIndex = existingIndex

	    // Check number of maps for this morph
	    var numMaps = 1;
	    if (d.displacementMap && d.displacementMap.constructor === Array){
		numMaps = d.displacementMap.length;
	    }
	    for (let i=0; i<numMaps; i++){
		var displacementMap;
		if (d.displacementMap && d.displacementMap.constructor === Array)
		    displacementMap = d.displacementMap[i] || defaultDisplacementMap;
		else
		    displacementMap = d.displacementMap || defaultDisplacementMap;

		displacementMap = this.resolveTexture(displacementMap);
		var displacementMapIdx = this.displacementMap.value.findIndex((elmt) => displacementMap === elmt);
		if (displacementMapIdx == -1){
		    this.displacementMap.value.push(displacementMap);
		    displacementMapIdx = this.displacementMap.value.length - 1;
		}
		this.displacementMapUniform.value[updateIndex+i] = this.displacementMapUniform.value[updateIndex+i] || {};
		this.displacementMapUniform.value[updateIndex+i].mapIdx = displacementMapIdx;
		if (d.displacementMapFlags && d.displacementMapFlags.constructor === Array)
		    this.displacementMapUniform.value[updateIndex+i].flags = d.displacementMapFlags[i] || 0;
		else
		    this.displacementMapUniform.value[updateIndex+i].flags = d.displacementMapFlags || 0;
		if (d.displacementMapScale && d.displacementMapScale.constructor === Array)
		    this.displacementMapUniform.value[updateIndex+i].scale = d.displacementMapScale[i] || 1;
		else
		    this.displacementMapUniform.value[updateIndex+i].scale = d.displacementMapScale || 1;
		if (d.displacementMapOffset && d.displacementMapOffset.constructor === Array)
		    this.displacementMapUniform.value[updateIndex+i].offset = d.displacementMapOffset[i] || 0;
		else
		    this.displacementMapUniform.value[updateIndex+i].offset = d.displacementMapOffset || 0;
		if (d.displacementMapNormal && d.displacementMapNormal.constructor === Array)
		    this.displacementMapUniform.value[updateIndex+i].normal = d.displacementMapNormal[i] || new THREE.Vector3(0,0,0);
		else
		    this.displacementMapUniform.value[updateIndex+i].normal = d.displacementMapNormal || new THREE.Vector3(0,0,0);
		if (d.displacementMapParams && d.displacementMapParams.constructor === Array)
		    this.displacementMapUniform.value[updateIndex+i].params = d.displacementMapParams[i] || new THREE.Vector4();
		else
		    this.displacementMapUniform.value[updateIndex+i].params = d.displacementMapParams || new THREE.Vector4();
		// Video will always we with the base geometry which we set as morphId 0
		this.displacementMapUniform.value[updateIndex+i].morphIdx = d.video ? 0 : morphId+1;
		this.displacementMapDescIdx[updateIndex+i] = index;
	    }
	}
    }



    addFromDescriptor(d, index){
	var new_geom = null;
	var scale_width = null, scale_height = null, scale_depth = null;
	const usesUv = this.usesUvAttr();
	if (d.texture || d.video){
	    // If this is a video cloud then we might not have geometry but we should still update the uniforms for this
	    // so that the material can be properly made before we need to morph to the video
	    if (d.video){
		this.updateTextureMapUniforms(d, index, -1);
		this.updateDisplacementMapUniforms(d, index, -1);
	    }
	    if (!d.canvas){
		var width, height;
		if (d.video){
		    width = d.video.videoWidth;
		    height = d.video.videoHeight;
		    if (width == 0 || height == 0){
			// Video not ready so just return
			return;
		    }
		} else {
		    width = d.texture.image.width;
		    height = d.texture.image.height;
		}
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height= height;
		d.canvas = canvas;
	    }
	    const ctx = d.canvas.getContext('2d', { willReadFrequently: (d.video != null)});
	    if (!d.video || (!d.video.ended)){
		ctx.drawImage(d.video || d.texture.image, 0, 0, d.canvas.width, d.canvas.height);
		const image = ctx.getImageData(0,0,d.canvas.width,d.canvas.height);
		const normal = new THREE.Vector3(0, 0, 1);
		if (d.colorCloud){
		    new_geom = this.makeColorPointGeometryFromImage(image, d.num_points || this.num_points, normal, d.point_space_ratio || 0.01, d.intensity_scale || 1.0, d.tileDim || 8, d.pos_noise || null, d.threshold || 0,
								    d.extrude_depth || 0.0);
		} else {
		    new_geom = this.makePointGeometryFromImage(image, d.num_points || this.num_points, normal, d.invert, d.point_space_ratio || 0.01,
							       d.intensity_scale || 1.0, d.normalise, d.threshold || 0, d.tileDim || 8, d.extrude_depth || 0.2,
							       d.spheric_extrude || false,
							       d.color, d.pos_noise || null, d.alpha);
		}
		d.geometry = new_geom;

		if (new_geom.attributes.position.count == 0)
		    return;
	    }

	} else if (d.geometry){
	    if (d.tesselate){
		const tessellateModifier = new TessellateModifier(... d.tesselate);
		d.geometry = tessellateModifier.modify( d.geometry );
	    }

	    if (d.geometry.index)
		d.geometry.index = null;

	    new_geom = d.geometry;

	    if (!usesUv){
		d.geometry.deleteAttribute("uv");
		d.geometry.deleteAttribute("uv1");
		d.geometry.deleteAttribute("uv2");
	    }

	    if (d.pos_noise)
		this.constructor.addPositionNoise(d.geometry, d.pos_noise, d.pos_noise_normal || false);

	    if (!d.geometry.getAttribute('color')){
		d.geometry.setAttribute('color',this.genColorAttr(d.geometry.getAttribute("position").count, d.color, d.alpha));
	    }
	} else {
	    console.error("Unknown descriptor entry:");
	    console.error(d);
	    return;
	}

	if (!new_geom){
	    return
	}

	new_geom.computeBoundingBox();
	if (d.width){
	    const geom_width = new_geom.boundingBox.max.x - new_geom.boundingBox.min.x;
	    scale_width = d.width/geom_width;
	}

	if (d.height){
	    const geom_height = new_geom.boundingBox.max.y - new_geom.boundingBox.min.y;
	    scale_height = d.height/geom_height;
	}

	if (d.depth){
	    const geom_depth = new_geom.boundingBox.max.z - new_geom.boundingBox.min.z;
	    if (geom_depth == 0)
		scale_depth = 1;
	    else
		scale_depth = d.depth/geom_depth;
	}

	if (d.scale || scale_width || scale_height){
	    new_geom.scale(scale_width || (d.scale && d.scale.x) || 1.0 , scale_height || (d.scale && d.scale.y) || 1.0, scale_depth || (d.scale && d.scale.z) || 1.0);
	}

	if (d.pos){
	    new_geom.translate(d.pos.x, d.pos.y, d.pos.z);
	}

	// Get the boundaries of the generated point cloud
	d.cloudBounds = new cloudBounds(new_geom);

	if (d.rotate){
	    if (d.rotate.x != 0.0){
		new_geom.rotateX(d.rotate.x);
                if (d.rotateCloudBounds)
		    d.cloudBounds.rotateX(d.rotate.x);
	    }
	    if (d.rotate.y != 0.0){
		new_geom.rotateY(d.rotate.y);
                if (d.rotateCloudBounds)
		    d.cloudBounds.rotateY(d.rotate.y);
	    }
	    if (d.rotate.z != 0.0){
		new_geom.rotateZ(d.rotate.z);
                if (d.rotateCloudBounds)
		    d.cloudBounds.rotateZ(d.rotate.z);
	    }
            if (!d.rotateCloudBounds)
                d.cloudBounds.update();
	}

        if (d.downloadGeometry){
	    download(JSON.stringify(new_geometry.toJSON()), d.downloadGeometry, "application/json");
	}

	// Add the rest of the position and color attributes as morph attributes
	var position = new_geom.getAttribute("position");
	var color = new_geom.getAttribute("color");
	var normal = new_geom.getAttribute("normal");
	var uv;
	if (usesUv){
	    if (new_geom.hasAttribute("uv"))
		uv = new_geom.getAttribute("uv");
   	    else
		uv = new THREE.BufferAttribute(new Float32Array(position.count*2).fill(0), 2);
	}

	if (position.count > this.num_points){
	    console.warn("New geometry for descriptor index " + index + " " +
                         (d.filename ? "(" + d.filename + ")" : "") + "has more points (" + position.count + ") than the morph cloud (" + this.num_points + ")");
	}

	if (position.count != this.num_points){
	    const positions_array = new Float32Array(this.num_points*3);
	    const colors_array = new Float32Array(this.num_points*4);
	    const normals_array = new Float32Array(this.num_points*3);
	    for (let point=0; point<this.num_points*3; point++){
		positions_array[point] = position.array[point%(position.count*3)];
		normals_array[point] = normal.array[point%(position.count*3)];
	    }
	    for (let point=0; point<position.count*4; point++){
		colors_array[point] = color.array[point%(position.count*4)];
	    }
	    for (let point=position.count*4; point<this.num_points*4; point++){
		// Set alpha to 0 for color for extra points to make them transparent
		if (point % 4 == 3)
		    colors_array[point] = 0.0;
		else
		    colors_array[point] = color.array[point%(position.count*4)];
	    }
	    position = new THREE.BufferAttribute(positions_array, 3);
	    color = new THREE.BufferAttribute(colors_array, 4);
	    normal = new THREE.BufferAttribute(normals_array, 3);
	    if (usesUv){
		const uv_array = new Float32Array(this.num_points*2);
		for (let i=0; i<this.num_points*2; i++){
		    uv_array[i] = uv.array[i%(uv.count*2)];
		}
		uv = new THREE.BufferAttribute(uv_array, 2);
	    }
	}

	if (!(this instanceof THREE.Points)){
	    // If this is a line cloud then duplicate all positions to make lines
	    // that are collapsed in a single point
	    const positions_array = new Float32Array(this.num_points*3*2);
	    const colors_array = new Float32Array(this.num_points*4*2);
	    const normals_array = new Float32Array(this.num_points*3*2);
	    const line_position = new THREE.BufferAttribute(positions_array, 3);
	    const line_color = new THREE.BufferAttribute(colors_array, 4);
	    const line_normal = new THREE.BufferAttribute(normals_array, 3);
	    var line_uv;
	    if (usesUv){
		const uv_array = new Float32Array(this.num_points*2*2);
		line_uv = new THREE.BufferAttribute(uv_array, 2);
	    }
	    const vec4 = new THREE.Vector4();
	    const vec3 = new THREE.Vector3();
	    const vec2 = new THREE.Vector2();
	    for (let i=0; i<this.num_points; i++){
		vec3.fromBufferAttribute(normal, i);
		line_normal.setXYZ(2*i, vec3.x, vec3.y, vec3.z);
		line_normal.setXYZ(2*i+1, vec3.x, vec3.y, vec3.z);
		const normal_vec3 = vec3.clone();

		vec4.fromBufferAttribute(color, i);
		line_color.setXYZW(2*i, vec4.x, vec4.y, vec4.z, vec4.w);
		line_color.setXYZW(2*i+1, vec4.x, vec4.y, vec4.z, vec4.w);

		vec3.fromBufferAttribute(position, i);
		line_position.setXYZ(2*i, vec3.x, vec3.y, vec3.z);
		// Line size is equal to point_size - let the line follow the normal
		vec3.add(normal_vec3.multiplyScalar(this.point_size));
		line_position.setXYZ(2*i+1, vec3.x, vec3.y, vec3.z);

		if (usesUv){
		    vec2.fromBufferAttribute(uv, i);
		    line_uv.setXY(2*i, vec2.x, vec2.y);
		    line_uv.setXY(2*i+1, vec2.x, vec2.y);
		}
	    }
	    position = line_position;
	    color = line_color;
	    normal = line_normal;
	    if (usesUv){
		uv = line_uv;
	    }
	}


	for (let i=0; i < position.count*3; i++){
	    if (isNaN(position.array[i])){
		console.error("NaN in position array!");
	    }
	}

	for (let i=0; i < position.count*4; i++){
	    if (isNaN(color.array[i])){
		console.error("NaN in color array!");
	    }
	}

	if (!this.materialMade){
	    position.needsUpdate = true;
	    new_geom.setAttribute("position", position);
	    new_geom.setAttribute("color", color);
	    new_geom.setAttribute("normal", normal);
	    if (usesUv) new_geom.setAttribute("uv", uv);

	    this.geometry = new_geom;
	    this.makeMaterial();
	    this.materialMade = true;
	    this.geometry.buffersNeedUpdate = true;

            this.morphBoundsUniform.value[0] = d.cloudBounds.data();
            if (this.enableBloom)
                this.bloomIntensityUniform.value[0] = d.bloomIntensity != null ? d.bloomIntensity : 1.0;

	    this.morphTargetInfluences = [];
	    this.geometry.morphAttributes.position = [];
	    this.geometry.morphAttributes.color = [];
	    this.geometry.morphAttributes.normal = [];
	    if (usesUv) this.geometry.morphAttributes.uv = [];
	    if (this.pointMapIndex){
		this.geometry.setAttribute("pointmapindex", new THREE.BufferAttribute(Float32Array.from(this.pointMapIndex), 1));
	    }
	}

	var morphId;
	if (d.video){
	    morphId = -1;
	} else if (this.descriptorToMorphIdMap[index]){
	    morphId = this.descriptorToMorphIdMap[index];
	} else {
	    morphId = this.nextFreeMorphId;
	    this.descriptorToMorphIdMap[index] = this.nextFreeMorphId++;
	}

	// Update texture and displacement map uniforms if needed
	this.updateTextureMapUniforms(d, index, morphId);
	this.updateDisplacementMapUniforms(d, index, morphId);

	if (d.video){
	    position.setUsage( THREE.DynamicDrawUsage );
	    position.needsUpdate = true;
	    this.geometry.setAttribute("position", position);
	    this.geometry.setAttribute("normal", normal);
            // Check if we should take color attribute from other morph - it might be that the rest of
            // the morphs havent been loaded yet so check for that
            if (d.colorFromMorph != null && this.descriptorToMorphIdMap[d.colorFromMorph] != null){
                const srcMorphId = this.descriptorToMorphIdMap[d.colorFromMorph];
                this.geometry.setAttribute("color", this.geometry.morphAttributes.color[srcMorphId]);
            } else {
	        this.geometry.setAttribute("color", color);
            }
	    if (usesUv) new_geom.setAttribute("uv", uv);
	} else {
	    position.needsUpdate = true;
            this.morphBoundsUniform.value[morphId+1] = d.cloudBounds.data();
            if (this.enableBloom)
                this.bloomIntensityUniform.value[morphId+1] = d.bloomIntensity != null ?  d.bloomIntensity : 1.0;
	    this.geometry.morphAttributes.position[morphId] = position;
	    this.geometry.morphAttributes.color[morphId] = color;
	    this.geometry.morphAttributes.normal[morphId] = normal;
	    if (usesUv) this.geometry.morphAttributes.uv[morphId] = uv;
	    this.morphTargetInfluences[morphId] = (index == this.currentMorphDescId) ? 1 : 0;
	    this.geometry.buffersNeedUpdate = true;
	}
    }

    finalizeLoad(x) {
	const [descriptor, firstDescriptor] = x;
	// First load any position mappings
	const allPromises = [];
	descriptor.forEach( (d, i) => {
	    if (i < firstDescriptor)
		return;
	    if (d.posMapFile){
                if (!Array.isArray(d.posMapFile))
                    d.posMapFile = [d.posMapFile];
                d.posMap = new Array(d.posMapFile.length);
                d.posMapFile.forEach( (posMapFile, i) => {
		    allPromises.push(fetch(posMapFile)
				     .then( (response) => {
				         if (!response.ok)
					     return null;
				         return response.json();
				     })
				     .then( (posMap) => {
				         d.posMap[i] = posMap;
				     }));
                });
	    }
	});

	// When all position mappings have loaded then start adding geometry
	// from descriptors
	return Promise.all(allPromises).then(
	       (x) => {
		   descriptor.forEach( (d, i) => {
		       if (i < firstDescriptor)
			   return;
		       this.addFromDescriptor(d, i);

		       // If we are appending to the descriptor then we need to update
		       // the material in case we have added clouds that have features
		       // like texture map or displacement map that we did not have to
		       // support before
		       if (firstDescriptor > 0){
			   this.makeMaterial();
		       }

		   });
                   // Go through the whole descriptor to check if we have morphs reorders the positions, but not depend on other morphs
		   descriptor.forEach( (d, i) => {
                       const morphId = this.descriptorToMorphIdMap[i];
                       const isLine = !(this instanceof THREE.Points);
                       if (d.sortPos){
                           console.assert(d.sortPos.constructor == Object);
                           const posMap = this.constructor.sortPosition(this.geometry, d.sortPos.sortFunc, morphId, isLine);
	                   if (d.sortPos.downloadFile){
		               d.posMapToDownload = {downloadFile: d.sortPos.downloadFile,
				                     map: posMap};
	                   }
                       } else if (d.sortPosOnOctant){
                           const posMap = this.constructor.sortAttrOnOctantAndLength(this.geometry, morphId, isLine);
	                   if (d.sortPosOnOctant.constructor == Object && d.sortPosOnOctant.downloadFile){
		               d.posMapToDownload = {downloadFile: d.sortPosOnOctant.downloadFile,
				                     map: posMap};
	                   }
                       } else if (d.sortPosSpheric){
                           const posMap = this.constructor.sortOnSphericCoords(this.geometry, morphId, isLine);
	                   if (d.sortPosSpheric.constructor == Object && d.sortPosSpheric.downloadFile){
		               d.posMapToDownload = {downloadFile: d.sortPosSpheric.downloadFile,
				                     map: posMap};
	                   }
	               } else if (d.randPosOrder){
	                   const posMap = this.constructor.randomizePositionOrder(this.geometry, morphId, isLine);
	                   if (d.randPosOrder.constructor == Object && d.randPosOrder.downloadFile){
		               d.posMapToDownload = {downloadFile: d.randPosOrder.downloadFile,
				                     map: posMap};
	                   }
                       } else if (d.posMap){
                           if (!Array.isArray(d.posMap))
                               d.posMap = [d.posMap];
                           d.posMap.forEach( (posMap) => {
	                       this.constructor.applyPosMapFile(this.geometry, posMap, morphId, isLine);
                           });
                       }
                   });

                   // Go through the whole descriptor to check if we have morphs that
                   descriptor.forEach( (d, i) => {
                       const morphId = this.descriptorToMorphIdMap[i];
                       const isLine = !(this instanceof THREE.Points);
                       if (d.posNearestTo && d.posNearestTo.descId != null){
                           const points = this instanceof THREE.Points ? this.num_points : this.num_points*2;
	                   const posMap = this.constructor.sortPositionsBasedOnNearest(this.geometry,
									               this.geometry.morphAttributes.position[this.descriptorToMorphIdMap[d.posNearestTo.descId]],
									               points,
                                                                                       morphId,
                                                                                       isLine,
                                                                                       this.descriptor[d.posNearestTo.descId].sortPosOnOctant || false,
                                                                                       this.descriptor[d.posNearestTo.descId].sortPosSpheric || false,
                                                                                       d.posNearestTo.searchRange
                                                                                      );
	                   if (d.posNearestTo.downloadFile){
                               if (d.posMapToDownload)
		                   d.posMapToDownload = [d.posMapToDownload,
                                                         {downloadFile: d.posNearestTo.downloadFile,
				                          map: posMap}];
                               else
		                   d.posMapToDownload = {downloadFile: d.posNearestTo.downloadFile,
				                         map: posMap};
	                   }
	               }

                   });
                   // Go through the whole descriptor to check if we have morphs that copy color or uv attribute from another morph
                   // do this last so that we know the other reordering operations has finished
		   descriptor.forEach( (d, i) => {
                       if (d.colorFromMorph != null && !d.video){
                           const dstMorphId = this.descriptorToMorphIdMap[i];
                           const srcMorphId = this.descriptorToMorphIdMap[d.colorFromMorph];
                           this.geometry.morphAttributes.color[dstMorphId] = this.geometry.morphAttributes.color[srcMorphId];
                       }
                       if (d.uvFromMorph != null && !d.video){
                           const dstMorphId = this.descriptorToMorphIdMap[i];
                           const srcMorphId = this.descriptorToMorphIdMap[d.uvFromMorph];
                           this.geometry.morphAttributes.uv[dstMorphId] = this.geometry.morphAttributes.uv[srcMorphId];
                       }
                   });

		   return this;
	       });
    }

    load(descriptor, initMorphId=0){
	var firstDescriptor;
	if (this.descriptor){
	    // Already have descriptor loaded so merge this with the
	    // one that is already loaded
	    firstDescriptor = this.descriptor.length;
	    this.descriptor.push(...descriptor);
	} else {
	    firstDescriptor = 0;
	    this.descriptor = descriptor;
	    this.descriptorToMorphIdMap = Array(descriptor.length);
	    this.nextFreeMorphId = 0;
	    this.currentMorphDescId = initMorphId;
	}
	const color = this.color;

	var loaderPromise = new Promise(function(resolve, reject) {
            function loadDone(descriptor,obj,map,idx) {
		if (obj.constructor.name === "Texture"){
		    descriptor[idx].texture = obj;
		    descriptor[idx].texture.colorSpace = THREE.SRGBColorSpace;
		    descriptor[idx].texture.needsUpdate;
		} else if (!descriptor[idx].video) {
		    descriptor[idx].geometry = obj;
		    descriptor[idx].map = map;
		}
		// Check if all entries that requires a texture load
		// are done - if not return without calling resolve
		var done = true;
		descriptor.forEach( (d) => {
		    if ((d.hasOwnProperty("filename") || d.hasOwnProperty("webcam")) && !d.hasOwnProperty("texture") && !d.hasOwnProperty("video") && !d.hasOwnProperty("geometry")){
			done = false;
		    }
		});
		if (done){
		    resolve([descriptor, firstDescriptor]);
		}
	    }
	    const texture_loader = new THREE.TextureLoader();

	    // Start loading all textures
	    this.descriptor.forEach( (d, idx, descriptor) => {
		if (idx < firstDescriptor)
		    return;
		if (d.filename){
		    const file_ext = d.filename.split(".").pop();
		    if (file_ext == "json"){
			this.constructor.loadJSON(d,
						  function (g, m) { loadDone(descriptor, g, m, idx); } );
		    } else if (["gltf", "glb"].includes(file_ext)){
			this.constructor.loadGLTF(d,
						  function (g, m) { loadDone(descriptor, g, m, idx); } );
		    } else if (file_ext == "svg"){
			this.constructor.SVGtoObject3D(d.filename,
						       d.color == null ? this.color : d.color,
						       function (t) { loadDone(descriptor, t, null, idx); } );
		    } else if (imageExtension.includes(file_ext)){
			texture_loader.load( d.filename,
					     function (t) { loadDone(descriptor, t, null, idx); } );
		    } else if (videoExtension.includes(file_ext)){
			const video = document.createElement('video');
			video.src = d.filename;
			video.autoplay = false;
			video.style = "display:none";
			video.muted = true;
			video.loop = d.loop || false;
			video.preload = "auto";
			d.video = video;
			loadDone(descriptor, d, null, idx);
		    }
		} else if (d.webcam){
		    if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) {
			const constraints = { video: { width: 1280, height: 720, facingMode: 'user' } };
			navigator.mediaDevices.getUserMedia( constraints ).then( function ( stream ) {
			    // apply the stream to the video element used in the texture
			    const video = document.createElement('video');
			    video.id = "webcam";
			    video.srcObject = stream;
			    video.autoplay = true;
			    video.style = "display:none";
			    video.muted = true;
			    video.play();
			    d.video = video;
			    loadDone(descriptor, d, null, idx)
			} ).catch( function ( error ) {
			    console.error( 'Unable to access the camera/webcam.', error );
			} );
		    } else {
			console.error( 'MediaDevices interface not available.' );
		    }
		} else {
		    loadDone(descriptor, d.geometry.clone(), null, idx);
		}
	    });

	}.bind(this));

	return loaderPromise
            .then(this.finalizeLoad.bind(this),
		  function(err) {
		      console.log(err);
		  })
            .then(this.initializeInstances.bind(this));
    }


    makeColorPointGeometryFromImage(image, num_points, normal=null, space_to_fill_ratio=0.1, intensity_scale = 1.0, tile_dim=8, pos_noise=null, threshold=0, depth=null){
	const data = image.data;
	const [w, h] = [image.width, image.height];
	var image_pixels = w*h;
	depth = depth == null ? this.point_size : depth;

	if (threshold){
	    image_pixels = 0;
	    for (let i=0; i<data.length/4; i++){
		var level = (data[i*4+0] + data[i*4+1] + data[i*4+2])*(data[i*4+3]/255) * intensity_scale;
		if (level >= threshold){
		    image_pixels++;
		}
	    }
	}

	num_points = num_points || image_pixels;

	const scale_factor_dim = Math.sqrt(image_pixels / num_points);
	const points_w = Math.ceil(w/scale_factor_dim);
	const points_h = Math.ceil(h/scale_factor_dim);

	const positions = new Float32Array(num_points*3);
	const colors = new Float32Array(num_points*4);

	const point_distance = this.point_size*(1+space_to_fill_ratio);
	const space_size = this.point_size*space_to_fill_ratio;

	// Get final dimensions
	const final_width = points_w * point_distance;
	const final_height = points_h * point_distance;

	const center_adjust_x = -final_width/2;
	const center_adjust_y = -final_height/2;

	var pos=0;

	const sample_offset_x = 0; // (w-1-(scale_factor_dim*(points_w-1)))/2;
	const sample_offset_y = 0; // (h-1-(scale_factor_dim*(points_h-1)))/2;

	const c00 = new THREE.Color();
	const c01 = new THREE.Color();
	const c10 = new THREE.Color();
	const c11 = new THREE.Color();

	function sample_image(x, y){
	    const pos_x = sample_offset_x+x*scale_factor_dim;
	    const pos_y = sample_offset_y+y*scale_factor_dim;

	    const pos_x_floor = Math.floor(pos_x);
	    const pos_y_floor = Math.floor(pos_y);

            const pos_x_floor_p1 = Math.min(pos_x_floor + 1, w - 1);
            const pos_y_floor_p1 = Math.min(pos_y_floor + 1, h - 1);

	    const pos_x_frac = pos_x - pos_x_floor;
	    const pos_y_frac = pos_y - pos_y_floor;

	    c00.set(data[4*(pos_x_floor+pos_y_floor*w)+0]/255,
		    data[4*(pos_x_floor+pos_y_floor*w)+1]/255,
		    data[4*(pos_x_floor+pos_y_floor*w)+2]/255);
	    c01.set(data[4*(pos_x_floor_p1+pos_y_floor*w)+0]/255,
		    data[4*(pos_x_floor_p1+pos_y_floor*w)+1]/255,
		    data[4*(pos_x_floor_p1+pos_y_floor*w)+2]/255);
	    c10.set(data[4*(pos_x_floor+(pos_y_floor_p1)*w)+0]/255,
		    data[4*(pos_x_floor+(pos_y_floor_p1)*w)+1]/255,
		    data[4*(pos_x_floor+(pos_y_floor_p1)*w)+2]/255);
	    c11.set(data[4*(pos_x_floor_p1+(pos_y_floor_p1)*w)+0]/255,
		    data[4*(pos_x_floor_p1+(pos_y_floor_p1)*w)+1]/255,
		    data[4*(pos_x_floor_p1+(pos_y_floor_p1)*w)+2]/255);

	    c00.multiplyScalar(1-pos_x_frac).add(c01.multiplyScalar(pos_x_frac));
	    c10.multiplyScalar(1-pos_x_frac).add(c11.multiplyScalar(pos_x_frac));
	    c00.multiplyScalar(1-pos_y_frac).add(c10.multiplyScalar(pos_y_frac));

	    var a00 = data[4*(pos_x_floor+pos_y_floor*w)+3]/255;
	    const a01 = data[4*(pos_x_floor_p1+pos_y_floor*w)+3]/255;
	    var a10 = data[4*(pos_x_floor+(pos_y_floor_p1)*w)+3]/255;
	    const a11 = data[4*(pos_x_floor_p1+(pos_y_floor_p1)*w)+3]/255;

	    a00 = a00*(1-pos_x_frac) + a01*pos_x_frac;
	    a10 = a10*(1-pos_x_frac) + a11*pos_x_frac;
	    a00 = a00*(1-pos_y_frac) + a10*pos_y_frac;

	    return [c00, a00];
	}


	for (let tile_y=0; tile_y<points_h; tile_y+=tile_dim){
	    for (let tile_x=0; tile_x<points_w; tile_x+=tile_dim){
		for (let y=tile_y; y<(Math.min(points_h,tile_y+tile_dim)); y+=1){
		    for (let x=tile_x; x<(Math.min(points_w,tile_x+tile_dim)); x+=1){
			if (pos/3 < num_points){
        		    const rand_x = pos_noise ? Math.random()*space_size*pos_noise : 0;
        		    const rand_y = pos_noise ? Math.random()*space_size*pos_noise : 0;
        		    const rand_z = pos_noise ? (Math.random()-0.5)*depth*pos_noise : 0;
			    const [color, alpha] = sample_image(x, y);
			    if (!threshold || ((color.r*255 + color.g*255 + color.b*255)*alpha >= threshold)){
				colors[4*(pos/3)+0] = Math.min(1.0, color.r*intensity_scale);
				colors[4*(pos/3)+1] = Math.min(1.0, color.g*intensity_scale);
				colors[4*(pos/3)+2] = Math.min(1.0, color.b*intensity_scale);
				colors[4*(pos/3)+3] = alpha;
        			positions[pos++] = x*point_distance + rand_x + center_adjust_x;
        			positions[pos++] = -(y*point_distance + rand_y + center_adjust_y);
        			positions[pos++] = rand_z;
			    }
			}
		    }
		}
	    }
	}

        for (let i=0; i < 4*pos/3; i++){
	    if (isNaN(colors[i])){
		console.error("NaN in color array2!");
	    }
	}

	const geometry = new THREE.BufferGeometry();
	const positionAttribute = new THREE.BufferAttribute(positions.slice(0, pos), 3);
	const colorAttribute = new THREE.BufferAttribute(colors.slice(0, 4*pos/3), 4);
	geometry.setAttribute('position', positionAttribute);
	geometry.setAttribute('color', colorAttribute);

	if (normal){
	    const normals = new Float32Array(pos);
	    for (let i=0; i<pos/3; i++){
		normals[i*3] = normal.x;
		normals[i*3+1] = normal.y;
		normals[i*3+2] = normal.z;
	    }
	    geometry.setAttribute('normal',new THREE.BufferAttribute(normals, 3));
	}
	return geometry;
    }

    makePointGeometryFromImage(image, num_points, normal=null, invert_colors, space_to_fill_ratio=0.1, intensity_scale=1.0,
			       normalise=true, threshold=0, tile_dim=8, depth=null, sphere_depth=false, color=null,
			       pos_noise=null, alpha=null
			      ){
	const data = image.data;
	const [w, h] = [image.width, image.height];
	const max_points_per_pixel = 255*3;
	const quant_image = new Uint16Array(w*h);
	var sum_points = 0;
	var max_level = 0;
	depth = depth == null ? this.point_size : depth;


	// Find out how many pixels are of the various levels
	for (let i=0; i<data.length/4; i++){
	    var level = (data[i*4+0] + data[i*4+1] + data[i*4+2]);
	    if (invert_colors){
		level = 255*3-level;
	    }
	    max_level = Math.max(max_level, level);
	    level *= intensity_scale*(data[i*4+3]/255);
	    if (level < threshold){
		level = 0;
	    }
	    quant_image[i] = level;
	    sum_points += level;
	}

	var norm_scale = 1.0;
	if (normalise){
	    norm_scale = 255*3/max_level;
	    sum_points *= norm_scale;
	}

	// sum_points is how many points we need to represents the image with
	// the current resolution. Check how that compares to how many points
	// we have and then scale the number of levels accordingly.
	const scale_points = num_points/sum_points;
	var actual_max_points_per_pixel = 255*3*scale_points;
	// We need to have at least two levels - if not we need to process
	// a group of pixels. Make sure we process square subset then.
	var scale_pixels_per_dim = 1.0;
	if (actual_max_points_per_pixel < 1.0){
	    scale_pixels_per_dim = Math.ceil(Math.sqrt(1/actual_max_points_per_pixel));
	    actual_max_points_per_pixel *= Math.pow(scale_pixels_per_dim, 2);
	}

	// Round up to nearest square
	const actual_max_points_per_pixel_sqrt = Math.ceil(Math.sqrt(Math.floor(actual_max_points_per_pixel)));
	const max_points_per_pixel_sqrt = Math.ceil(Math.sqrt(Math.floor(max_points_per_pixel)));

	const point_distance = this.point_size*(1+space_to_fill_ratio)*scale_pixels_per_dim*(max_points_per_pixel_sqrt/actual_max_points_per_pixel_sqrt);
	var space_size = point_distance - this.point_size;
	if (space_size < 0){
	    space_size = this.point_size*space_to_fill_ratio;
	}

	// Get final dimensions
	const final_width = (w/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_distance;
	const final_height = (h/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_distance;

	const center_adjust_x = -final_width/2;
	const center_adjust_y = -final_height/2;

	const positions = new Float32Array(num_points*3);
	var pos = 0;
	var dither = 0;

	// Tile dimension must be bigger than the group of pixels we process
	// and a multiple of the scale_pixels_per_dim
	tile_dim = Math.max(scale_pixels_per_dim, tile_dim);
	tile_dim = scale_pixels_per_dim*Math.floor(tile_dim/scale_pixels_per_dim);

	for (let tile_y=0; tile_y<h; tile_y+=tile_dim){
	    for (let tile_x=0; tile_x<w; tile_x+=tile_dim){
		for (let y=tile_y; y<(tile_y+tile_dim); y+=scale_pixels_per_dim){
		    for (let x=tile_x; x<(tile_x+tile_dim); x+=scale_pixels_per_dim){
        		// Sum pixels
        		var value = 0;
        		for (let y_sub=0; y_sub<scale_pixels_per_dim; y_sub++){
        		    for (let x_sub=0; x_sub<scale_pixels_per_dim; x_sub++){
        			const y_sub_pos = y+y_sub;
        			const x_sub_pos = x+x_sub;
        			if (y_sub_pos < h && x_sub_pos < w){
        			    value += quant_image[x+x_sub+(y+y_sub)*w];
        			}
        		    }
        		}
        		value *= scale_points;

        		if (dither != 0){
        		    value += dither;
        		    dither = 0;
        		}

			if (value == 0 || isNaN(value)){
			    continue;
			}

        		// Distribute the points that will make up this intensity value over a grid with some random
        		// noise displacements to make it look a bit more natural

        		// Find out how many points in the grid is needed to output this value
        		const value_sqrt = Math.ceil(Math.sqrt(Math.floor(value)));
        		// Distance between points in this grid
        		const cur_point_distance = (actual_max_points_per_pixel_sqrt+1)*point_distance / (value_sqrt + 1);

        		// Select random points in the grid to use if the grid is not full
        		const all_grid_points = [];
        		for (let y_grid=0; y_grid<value_sqrt; y_grid++){
        		    for (let x_grid=0; x_grid<value_sqrt; x_grid++){
        			all_grid_points.push([x_grid, y_grid]);
        		    }
        		}


        		const used_grid_points = Array(value_sqrt*value_sqrt).fill(false);
        		while (value >= 1){
        		    const selected_point = Math.floor(Math.random()*all_grid_points.length);
        		    used_grid_points[all_grid_points[selected_point][0]+all_grid_points[selected_point][1]*value_sqrt] = true;
        		    all_grid_points.splice(selected_point, 1);
        		    value--;
        		}

        		dither += value;


        		// Coordinates to upper left corner of this grid
        		const pixel_pos_x = (x/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_distance;
        		const pixel_pos_y = (y/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_distance;

        		var depth_range = depth;
			var pixel_pos_z = 0;
			if (sphere_depth){
			    // Get distance from center
			    const dist_from_center = Math.sqrt((pixel_pos_x - final_width/2)**2 + (pixel_pos_y - final_height/2)**2);
			    const radius = Math.sqrt((final_width/2)**2-dist_from_center**2);
			    if (dist_from_center > final_width/2)
				pixel_pos_z = 0;
			    else
				pixel_pos_z = ((Math.random()-0.5)/0.5)*radius;
			}

        		for (let y_grid=0; y_grid<value_sqrt; y_grid++){
        		    for (let x_grid=0; x_grid<value_sqrt; x_grid++){
        			if ( used_grid_points[x_grid + value_sqrt*y_grid] && pos < num_points*3){
        			    // Add some randomness to points so that things does not look so straight
        			    const rand_x = pos_noise ? Math.random()*space_size*pos_noise : 0;
        			    const rand_y = pos_noise ? Math.random()*space_size*pos_noise : 0;
        			    const rand_z = pos_noise ? (Math.random()-0.5)*depth_range*pos_noise : 0;
        			    positions[pos++] = (pixel_pos_x+x_grid*cur_point_distance -
        						rand_x + center_adjust_x);
        			    positions[pos++] = -(pixel_pos_y+y_grid*cur_point_distance -
        						 rand_y + center_adjust_y);
        			    positions[pos++] = pixel_pos_z + rand_z;
        			}
        		    }
        		}
        	    }
		}
	    }
	}

	const geometry = new THREE.BufferGeometry();
	const positionAttribute = new THREE.BufferAttribute(positions.slice(0, pos), 3);
	geometry.setAttribute('position', positionAttribute);
	geometry.setAttribute('color',this.genColorAttr(pos/3, color, alpha));

	if (normal){
	    const normals = new Float32Array(pos);
	    for (let i=0; i<pos/3; i++){
		normals[i*3] = normal.x;
		normals[i*3+1] = normal.y;
		normals[i*3+2] = normal.z;
	    }
	    geometry.setAttribute('normal',new THREE.BufferAttribute(normals, 3));
	}
	return geometry;
    }

};

class morphPointCloud extends morphCloud(THREE.Points) {

}

class morphLineCloud extends morphCloud(THREE.LineSegments) {

}


export {morphPointCloud, morphLineCloud};
