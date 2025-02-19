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

const x_unit = new THREE.Vector3(1,0,0);
const y_unit = new THREE.Vector3(0,1,0);
const z_unit = new THREE.Vector3(0,0,1);

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
	return this.lowerLeftCorner.clone().add(
	        this.upperLeftCorner.clone().sub(this.lowerLeftCorner)
		.multiplyScalar(0.5)
		.add(this.lowerRightCorner.clone()
		     .sub(this.lowerLeftCorner).multiplyScalar(0.5))
		.add(this.lowerLeftCornerDepth.clone()
		     .sub(this.lowerLeftCorner).multiplyScalar(0.5)));
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
           st += vec3(uTime[1]/3.0);
           vec3 q = vec3(0.);
           q.x = fbm( st );
           q.y = fbm( st + vec3(1.0));
           q.z = fbm( st + vec3(2.0));

           vec3 r = vec3(0.);
           float scaleTime = 3.0;
           r.x = fbm( st + 1.0*q + vec3(1.7,9.2,4.7)+ scaleTime*0.15*uTime[1] );
           r.y = fbm( st + 1.0*q + vec3(8.3,2.8,3.5)+ scaleTime*0.126*uTime[1]);
           r.z = fbm( st + 1.0*q + vec3(5.3,1.8,8.5)+ scaleTime*0.1*uTime[1]);

           return clamp((fbm(2.0*st+r)-0.5)*2.0, 0.0, 1.0);
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
	float th = .02 * uTime[1];
	v.x = at.x * cos(th) - (at.y + 0.2) * sin(th);
	v.y = at.x * sin(th) + (at.y + 0.2) * cos(th);
	return v;
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
    // Add perlin noise to displacement 
    static DISPLACEMENT_MAP_ADD_PERLIN_NOISE = 1 << 5;
    // Add FBM noise to displacement 
    static DISPLACEMENT_MAP_ADD_FBM = 1 << 6;
    // Multiply the displacement from the map with perlin or fbm
    static DISPLACEMENT_MAP_MULTIPLY = 1 << 7;

    // Force displacement to be from center of the geometry
    // rather than in the direction of the normal
    static DISPLACEMENT_MAP_DISPLACE_FROM_CENTER = 1 << 8;
    // Force displacement direction to be random
    static DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM = 1 << 9;
    // Swap U and V axis of the texture
    static DISPLACEMENT_MAP_SWAP_UV = 1 << 10;
    // Signal if displacement map is enabled
    static DISPLACEMENT_MAP_ENABLE = Number(1n << 31n);


    // Signal if texture map is enabled
    static TEXTURE_MAP_ENABLE = Number(1n << 31n);
    // Add FBM noise as texture 
    static TEXTURE_MAP_ADD_FBM_NOISE = 1 << 0;
    // Add Kaleidoscope effect to texture
    static TEXTURE_MAP_KALEIDO = 1 << 1;
    // Blend this texture layer with point color or previous applied texture
    // using
    //
    // Averaging:
    static TEXTURE_MAP_BLEND_AVG = 1 << 16;
    // Addition with clamping:
    static TEXTURE_MAP_BLEND_ADD = 1 << 17;
    // Multiplication
    static TEXTURE_MAP_BLEND_MUL = 1 << 18;

    // Use uv attribute for doing texure mapping
    // If not enabled then we assume the texture map is
    // a 2-d image that we will try to project on the points
    // in the point cloud based on the cloud bounds.
    static TEXTURE_MAP_USE_UV = 1 << 4;
    
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
	if (this instanceof THREE.Points){
	    this.material = new THREE.PointsMaterial( { vertexColors: true, color: this.color, size: this.point_size, blending: THREE.NormalBlending, transparent: true, depthTest: true, alphaTest: 0.1, depthWrite: true } );
	    if (this.point_sprite_file){
		const sprite = new THREE.TextureLoader().load( this.point_sprite_file );
		sprite.colorSpace = THREE.SRGBColorSpace;
		this.material.map = sprite;
	    }
	} else if (this instanceof THREE.Line) {
	    this.material = new THREE.LineBasicMaterial( { vertexColors: true, color: this.color, linewidth: this.point_size, blending: THREE.NormalBlending, transparent: true, depthTest: true, depthWrite: true } );
	}
	
	
	const hasDisplacementMaps = this.hasAnyDisplacementMaps();
	const hasTextureMaps = this.hasAnyTextureMaps();
	if (hasDisplacementMaps || hasTextureMaps || this.enableBloomDarken){
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
		key.nextFreeMorphId = this.nextFreeMorphId;
		key.point = this instanceof THREE.Points;
		return JSON.stringify(key);
	    }

	    // Do updates to the shader based on the number of descriptors and maps we have 
	    this.material.onBeforeCompile = shader => {
		if (this.enableBloomDarken){
		    shader.vertexShader =
    			shader.vertexShader.replace(
    			    '#include <project_vertex>',
                            `#ifdef DARKEN_BLOOM
                             vColor.rgb = vec3(0.0);
                             #endif
                             #include <project_vertex>
                            `);
		}

		if (hasDisplacementMaps){
		    shader.uniforms.uDisplacementMap = this.displacementMap;
		    shader.uniforms.uDisplacement = this.displacementMapUniform;
		}
		if (hasTextureMaps){
		    shader.uniforms.uTextureMap = this.textureMap;
		    shader.uniforms.uTextureMapParams = this.textureMapUniform;
		}
		
		if (hasDisplacementMaps || hasTextureMaps){
		    shader.uniforms.upperLeftCorner =  this.cloudBounds.upperLeftCorner;
		    shader.uniforms.lowerLeftCorner =  this.cloudBounds.lowerLeftCorner;
		    shader.uniforms.lowerLeftCornerDepth =  this.cloudBounds.lowerLeftCornerDepth;
		    shader.uniforms.lowerRightCorner = this.cloudBounds.lowerRightCorner;
		    shader.uniforms.uTime = this.currentTime;
		    
		    var vertexShaderBegin = 
			`uniform vec3 upperLeftCorner[${this.nextFreeMorphId+1}], lowerLeftCorner[${this.nextFreeMorphId+1}], lowerLeftCornerDepth[${this.nextFreeMorphId+1}], lowerRightCorner[${this.nextFreeMorphId+1}];
	                 uniform float uTime[2];
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
                                 vec3 llc = lowerLeftCorner[0] * morphTargetBaseInfluence;
                                 vec3 llcd = lowerLeftCornerDepth[0] * morphTargetBaseInfluence;
                                 vec3 ulc = upperLeftCorner[0] * morphTargetBaseInfluence;
                                 vec3 lrc = lowerRightCorner[0] * morphTargetBaseInfluence;
                                 for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
                                      if (morphTargetInfluences[i] > 0.0) {
                                          llc += morphTargetInfluences[ i ] * lowerLeftCorner[i+1];
                                          llcd += morphTargetInfluences[ i ] * lowerLeftCornerDepth[i+1];
                                          ulc += morphTargetInfluences[ i ] * upperLeftCorner[i+1];
                                          lrc += morphTargetInfluences[ i ] * lowerRightCorner[i+1];
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
                                 vec3 cloudCenter = cloudHeight/2.0 + cloudWidth/2.0;
                                 vec3 posFromCenter = posInCloud - cloudCenter;
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
                             };
                             uniform sampler2D uDisplacementMap[${numDisplacementMaps}];
                             uniform DisplacementParams uDisplacement[${numDisplacementDescriptors}];
                             #define M_PI 3.1415926535897932384626433832795
                             ${perlinNoiseShader}
    
                             vec3 getDisplacement(DisplacementParams disp, sampler2D dispMap, vec3 posInCloud, vec3 posFromCenter, vec3 posDepth, vec3 cloudHeight, vec3 cloudWidth, vec3 cloudDepth, vec3 cloudCenter, vec3 transformed, vec3 objectNormal){
                               vec2 dispUv;
                               ${returnIfNotLineEnd}
          			 
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_RADIAL_U_MAPPING}u) != 0u){
                                 dispUv.x = length(posFromCenter)/length(cloudHeight-cloudCenter);
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ANGULAR_U_MAPPING}u) != 0u){
                                 float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                                 dispUv.x = pointAngleFromCenter/(2.0*M_PI);
                               } else {
                                 float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
                                 dispUv.x = length(posInCloud)*sin(pointAngle)/length(cloudWidth);
                               }
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_RADIAL_V_MAPPING}u) != 0u){
                                 dispUv.y = length(posFromCenter)/length(cloudHeight-cloudCenter);
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ANGULAR_V_MAPPING}u) != 0u){
                                 float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                                 float pointAngleFromCenterHeight = acos(dot(cloudHeight, posFromCenter)/(length(cloudHeight)*length(posFromCenter)));
                                 dispUv.y = pointAngleFromCenterHeight > 0.5*M_PI ? 2.0*M_PI-pointAngleFromCenter : pointAngleFromCenter;
                                 dispUv.y /= (2.0*M_PI);
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
    
                               float displacement = ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ENABLE}u) != 0u) ? texture2D( dispMap, dispUv ).x : 0.0;
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ADD_PERLIN_NOISE}u)!=0u){
                                 float perlinNoise = pnoise(transformed + uTime[0], vec3(10.0))/10.0;
                                 if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_MULTIPLY}u)!=0u)
                                    displacement *= perlinNoise;
                                 else
                                    displacement += perlinNoise;
                               } 
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_ADD_FBM}u)!=0u){
                                  float fbmNoise = (1.0-multi_fbm(posInCloud,posDepth,cloudHeight,cloudWidth,cloudDepth));
                                  if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_MULTIPLY}u)!=0u)
                                     displacement *= fbmNoise;
                                  else
                                     displacement += fbmNoise;
                               }
    
                               if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM}u)!=0u){
                                 vec3 randDir = vec3(random(transformed), random(transformed+vec3(0.0, 0.0, 1.0)), random(transformed+vec3(0.0, 1.0, 0.0))); 
                                 return disp.scale*((displacement+disp.offset)/length(randDir))*randDir;
                               } else if ((disp.flags & ${this.constructor.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER}u)!=0u){
                                 vec3 posFromCenterDepth, cloudCenterDepth;
                                 cloudCenter += cloudDepth/2.0;
                                 posFromCenter = (posInCloud + posDepth) - cloudCenter;
                                 return disp.scale*((displacement+disp.offset)/length(posFromCenter))*posFromCenter;
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
    
                             struct TextureParams { 
                               int mapIdx;
                               uint flags;
                               vec2 scale;
                               vec2 offset;
                               int morphIdx;
                             };
    
                             uniform sampler2D uTextureMap[${numTextureMaps}];	
        		         uniform TextureParams uTextureMapParams[${numTextureMapDescriptors}];
    
                             vec4 getTextureValue(vec4 color, TextureParams mapParams, sampler2D textureMap, vec2 texUv, vec3 posInCloud, vec3 posDepth, vec3 cloudHeight, vec3 cloudWidth, vec3 cloudDepth){
                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_KALEIDO}u) != 0u){
                                   texUv.x = mix(-1.0, 1.0, texUv.x);
    	                       texUv.y = mix(-1.0, 1.0, texUv.y);
                                   texUv.y *= length(cloudHeight)/length(cloudWidth);
                                   texUv = kaleido_transform(kaleido(texUv));
                               }
    
                               vec4 texColor = ((mapParams.flags & ${this.constructor.TEXTURE_MAP_ENABLE}u) != 0u) ? texture2D(textureMap, mapParams.offset + texUv/mapParams.scale) : color;
    
                               //texColor = clamp(vec4(texUv, 0.0, 1.0), 0.0, 1.0);
    
    
                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_ADD_FBM_NOISE}u) != 0u){
                                  float f = multi_fbm(posInCloud, posDepth, cloudHeight, cloudWidth, cloudDepth);
                                  texColor = vec4(texColor.rgb, f);
                               }
    
              
                               if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_AVG}u) != 0u){
                                  texColor.rgb = 0.5*color.rgb + 0.5*texColor.rgb;
                               } else if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_ADD}u) != 0u){
                                  texColor.rgb = clamp(color.rgb + texColor.rgb, 0.0, 1.0);;
                               } else if ((mapParams.flags & ${this.constructor.TEXTURE_MAP_BLEND_MUL}u) != 0u){
                                  texColor.rgb = color.rgb * texColor.rgb;
                               }

                               return texColor;
                             }
                             `;
    			shader.vertexShader = shader.vertexShader.replace("#include <morphcolor_vertex>", "");
    			var texture_switch = "switch (map){\n";
    			for (let i=0; i<numTextureMaps; i++){
    			    texture_switch += `case ${i}: color=getTextureValue(color, uTextureMapParams[i], uTextureMap[${i}], morphUv, posInCloud, posDepth, cloudHeight, cloudWidth, cloudDepth);break;\n`;
    			}
    			texture_switch += "}\n";
    
    			shader.vertexShader =
        		        shader.vertexShader.replace(
        			    '//Appendpoint',
    
    			    `
                                 // https://en.wikipedia.org/wiki/Line%E2%80%93plane_intersection
                                 // Find intersection between line from camera position through the current vertex position and
                                 // and into back plane of bounding box 
                                 float t = dot(cloudDepth, llc-cameraPosition)/dot(cloudDepth,-cameraPosition+transformed);
                                 vec3 projPosInCloud = cameraPosition + t*(-cameraPosition+transformed) - llc;
                                 float pointAngle = acos(dot(cloudHeight, projPosInCloud)/(length(cloudHeight)*length(projPosInCloud)));
                                 vec2 texUv;
                                 texUv.x = length(projPosInCloud)*sin(pointAngle)/length(cloudWidth);
                                 texUv.y = length(projPosInCloud)*cos(pointAngle)/length(cloudHeight);
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
                                         vec2 morphUv;
                                         if ((uTextureMapParams[i].flags & ${this.constructor.TEXTURE_MAP_USE_UV}u) != 0u){
                                            if (morphTarget == 0){
                                              morphUv = uv;
                                            } else {
                                              // Uvs are packed into unused z-component of postiion and normal morph attributes 
                                              morphUv = vec2(getMorph( gl_VertexID, morphTarget-1, 0 ).w, getMorph( gl_VertexID, morphTarget-1, 1 ).w);
                                            }
                                         } else {
                                            morphUv = texUv;
                                         }
                                         for ( int map = 0; map < ${numTextureMaps}; map++ ){
                                            if (uTextureMapParams[i].mapIdx == map){
                                              ${texture_switch}
                                            }
                                         }
                                       }
                                 }
                                 #if defined( USE_COLOR_ALPHA )
                                 vColor += color * influence;
        	                 #elif defined( USE_COLOR )
                                 vColor += (color * influence).rgb;
       	                 #endif
        	             }

                             `);
    		    }
    
    		    shader.vertexShader = vertexShaderBegin + shader.vertexShader;
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
	// Find a vector that is perpendicular to the normal
	// Use the fact that the dot product of two perpendicular vectors
	// is 0. We find the value of the first non-zero component
	// while the two remaining gets set to random values
	// We then get perp.comp=(-rand.comp1*norm.comp1-rand.comp2*norm.comp2)/norm.comp
	const perp = new THREE.Vector3(Math.random()+0.001, Math.random()+0.001, Math.random()+0.001);
	for (let i=0; i<3; i++){
	    if (vec.getComponent(i)!=0){
		const comp1=(i+1)%3;
		const comp2=(i+2)%3;
		perp.setComponent(i,(-perp.getComponent(comp1)*vec.getComponent(comp1)-
				     perp.getComponent(comp2)*vec.getComponent(comp2))/vec.getComponent(i));
		return perp.normalize();
	    }
	}
	console.error("Error input vec to getPerpendicular is zero vector");
	return null;
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
		pos.add(direction.multiplyScalar(positionNoise*Math.random()));
		position.setXYZ(i, pos.x, pos.y, pos.z);
	    }
	}
    }
    
    static randomizePositionOrder(geometry){
	const positionAttribute = geometry.getAttribute("position");
	const normalAttribute = geometry.getAttribute("normal");
	const colorAttribute = geometry.getAttribute("color");
	const uvAttribute = geometry.getAttribute("uv");
        const newPositionAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newColorAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*4), 4);
	var newUvAttribute;
	if (uvAttribute){
	    newUvAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*2), 2);
	}
	var pos_remaining = positionAttribute.count;
	const selected_pos = new Array(positionAttribute.count);
	while (pos_remaining){
	    var random_idx;
	    do {
		random_idx = Math.floor(Math.random()*positionAttribute.count);
	    } while (selected_pos[random_idx])
		
	    selected_pos[random_idx] = true;
	    pos_remaining -= 1;
	    newPositionAttribute.setXYZ(pos_remaining,
					positionAttribute.getX(random_idx),
					positionAttribute.getY(random_idx),
					positionAttribute.getZ(random_idx));
	    if (normalAttribute)
		newNormalAttribute.setXYZ(pos_remaining,
					  normalAttribute.getX(random_idx),
					  normalAttribute.getY(random_idx),
					  normalAttribute.getZ(random_idx));
		
	    if (colorAttribute)
		newColorAttribute.setXYZW(pos_remaining,
					  colorAttribute.getX(random_idx),
					  colorAttribute.getY(random_idx),
					  colorAttribute.getZ(random_idx),
					  colorAttribute.getW(random_idx)
					 );
	    if (uvAttribute)
		newUvAttribute.setXY(pos_remaining,
				     uvAttribute.getX(random_idx),
				     uvAttribute.getY(random_idx)
				    );
	}

	geometry.setAttribute("position", newPositionAttribute);
	if (normalAttribute)
	    geometry.setAttribute("normal", newNormalAttribute);
	if (colorAttribute)
	    geometry.setAttribute("color", newColorAttribute);
	if (uvAttribute)
	    geometry.setAttribute("uv", newUvAttribute);

    }

    static collectGLTFGeometryAttributes(obj, attributes, index, recursive=true, filterName=null){
	var map = null;
	if (obj.children && recursive && !obj.isBone){
	    obj.children.forEach((o) => {
		const foundMap = this.collectGLTFGeometryAttributes(o, attributes, index, recursive);
		if (foundMap){
		    if (map)
			console.warning("Found multiple maps in GLTF" + obj);
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
		    obj.geometry.computeVertexNormals();
		    attributes[key] = attributes[key].concat(Array.from(obj.geometry.getAttribute("normal").array));
		} else if (attributes[key].length != 0) {
		    console.warn("Did not find attribute '" + key + "' in geometry: " + obj.geometry);
		}
	    }
	    		
	    if (obj.material && obj.material.map){
		if (map)
		    console.warning("Found multiple maps in GLTF" + obj);
		map = obj.material.map;
	    }
	}
	return map;
    }
    
    static loadGLTF(descriptor, color, loadDone = null){
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


    constructor(num_points, point_size, color, alpha=1.0, point_sprite_file = null, onclick=null, renderer = null, camera = null, enableBloomDarken = false){
	super();

	if (!num_points)
	    return;

	this.isMorphCloud = true;
	this.point_sprite_file = point_sprite_file;
	this.num_points = num_points;
	this.point_size = point_size;
	this.color = color;
	this.alpha = alpha;
	this.renderer = renderer;
	this.camera = camera;
	this.onclick = onclick;
	this.enableBloomDarken = enableBloomDarken;

	this.displacementMap = { value: [] };
	this.displacementMapUniform = { value: [] };
	this.displacementMapDescIdx = [];
	this.textureMap = { value: [] };
	this.textureMapUniform = { value: [] };
	this.textureMapDescIdx = [];
	this.cloudBounds = { lowerLeftCorner : { value: [] },
			     lowerLeftCornerDepth : { value: [] },
			     upperLeftCorner : { value: [] },
			     lowerRightCorner : { value: [] } };
	this.clock = new THREE.Clock();
	this.clock.start();
	this.currentTime = {value: [this.clock.getElapsedTime(), this.clock.getElapsedTime()]};

	//console.log(num_points);
	this.constructor.allObjects.push(this);
    }

    getMorphId(morphDescID=this.currentMorphDescId){
	var morphId = this.descriptorToMorphIdMap[morphDescID];

	if (this.descriptor[morphDescID].video){
	    morphId=-1;
	}

	return morphId;
    }
    
    morphTo(index, easing=TWEEN.Easing.Cubic.Out, time=1000, onStart=null, onComplete=null){
	if (index >= this.descriptor.length){
	    return
	}
	
	const prevDescriptor = this.descriptor[this.currentMorphDescId];
	const newDescriptor = this.descriptor[index];
	newDescriptor.morphLastStartTime = this.clock.getElapsedTime();
	if (index != this.currentMorphDescId){
	    if (prevDescriptor.video){
		prevDescriptor.video.pause();
	    }

	    if (newDescriptor.video){
		newDescriptor.videoStartTime = this.clock.getElapsedTime();
		newDescriptor.video.pause();
		newDescriptor.video.currentTime = 0;
	    }
	}
	
	const morphId = this.getMorphId(index);

	if (morphId < 0){
	    this.currentMorphDescId = index;
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

		this.cloudBounds.lowerLeftCorner.value[0] = newDescriptor.cloudBounds.lowerLeftCorner;
		this.cloudBounds.lowerLeftCornerDepth.value[0] = newDescriptor.cloudBounds.lowerLeftCornerDepth;
		this.cloudBounds.upperLeftCorner.value[0] = newDescriptor.cloudBounds.upperLeftCorner;
		this.cloudBounds.lowerRightCorner.value[0] = newDescriptor.cloudBounds.lowerRightCorner;
	    }).bind(this));
	}

	const newMorphTargetInfluences = Array(this.morphTargetInfluences.length).fill(0);

	if (morphId >= 0 && morphId < this.morphTargetInfluences.length){
	    newMorphTargetInfluences[morphId] = 1;
	}

	if (this.pendingMorphTween)
	    this.pendingMorphTween.end();
	
	if (time == 0){
	    this.morphTargetInfluences = newMorphTargetInfluences;
	    this.currentMorphDescId = index;
	    if (onComplete)
		onComplete();
	} else {
	    this.pendingMorphTween =
		new TWEEN.Tween(this.morphTargetInfluences)
		.to(newMorphTargetInfluences,time)
		.easing(easing)
	        .onStart(() => {
		    if (onStart)
			onStart();
		})
		.onComplete(() => {
		    this.currentMorphDescId = index;
		    this.pendingMorphTween = null;
		    if (onComplete)
			onComplete();
		})
		.start();

	}
    }

    getCurrentMorphCenter(){
	const d = this.descriptor[this.currentMorphDescId];
	return this.localToWorld(d.cloudBounds.center());
    }

    
    update(){
	const currentMorphDescId = this.currentMorphDescId;
	const d = this.descriptor[currentMorphDescId];
	var scaleTimeUniform = d.scaleTime || 1.0;
	this.currentTime.value = [(d.scaleTimePerlin || 1.0)*this.clock.getElapsedTime(),
				  (d.scaleTimeFBM || 1.0)*this.clock.getElapsedTime()];

	// Update any texture maps that has video texture
	const promisesTextureMap = this.updateVideoMap(currentMorphDescId, this.textureMap.value, this.textureMapUniform.value, this.textureMapDescIdx);
	const promisesDisplacementMap = this.updateVideoMap(currentMorphDescId, this.displacementMap.value, this.displacementMapUniform.value, this.displacementMapDescIdx);
	const promisesVideo = [];
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
		promisesVideo.push(d.video.play().then( _ => {
		    this.addFromDescriptor(d, currentMorphDescId);
		    d.video.pause();
		}));
	    }
	}

	return Promise.all(promisesVideo.concat(promisesTextureMap, promisesDisplacementMap));
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
			map.videoElmt.pause();
		    }));
		}
	    }
	    
	});
	
	return promises;
    }
    
    
    genColorAttr(num_points, color=null, alpha=null){
	const colors = new Float32Array(num_points*4);
	color = color || this.color;
	alpha = alpha || this.alpha;
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
		    !(d.textureMap && (d.textureMap.constructor !== Array ||  d.textureMap[i])))
		    // This texture uses uv attribute - assume we find the actual texture in d.map
		    // as this is not given as input in the descriptor and we assume it is given in
		    // the 3d model
		    texture = d.map;
		else if (d.textureMap && d.textureMap.constructor === Array)
		    texture = d.textureMap[i] || defaultTextureMap;
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
							       d.color || null, d.pos_noise || null, d.alpha || null);
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
	    if (d.pos_noise)
		this.constructor.addPositionNoise(d.geometry, d.pos_noise, d.pos_noise_normal || false);

	    if (!usesUv){
		d.geometry.deleteAttribute("uv");
		d.geometry.deleteAttribute("uv1");
		d.geometry.deleteAttribute("uv2");
	    }
		
	    if (!d.geometry.getAttribute('color')){
		d.geometry.setAttribute('color',this.genColorAttr(d.geometry.getAttribute("position").count, d.color || this.color, d.alpha || this.alpha));
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
		d.cloudBounds.rotateX(d.rotate.x);
	    }
	    if (d.rotate.y != 0.0){
		new_geom.rotateY(d.rotate.y);
		d.cloudBounds.rotateY(d.rotate.y);
	    }
	    if (d.rotate.z != 0.0){
		new_geom.rotateZ(d.rotate.z);
		d.cloudBounds.rotateZ(d.rotate.z);
	    }
	}

	if (d.randPosOrder)
	    this.constructor.randomizePositionOrder(new_geom);


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
	    console.warn("New geometry for descriptor index " + index + " has more points (" + position.count + ") than the morph cloud (" + this.num_points + ")");
	} else if (position.count < this.num_points){
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
	    const colors_array = new Float32Array(this.num_points*3*2);
	    const normals_array = new Float32Array(this.num_points*3*2);
	    const line_position = new THREE.BufferAttribute(positions_array, 3);
	    const line_color = new THREE.BufferAttribute(colors_array, 3);
	    const line_normal = new THREE.BufferAttribute(normals_array, 3);
	    var line_uv;
	    if (usesUv){
		const uv_array = new Float32Array(this.num_points*2*2);
		line_uv = new THREE.BufferAttribute(uv_array, 2);
	    }
	    const vec3 = new THREE.Vector3();
	    const vec2 = new THREE.Vector2();
	    for (let i=0; i<this.num_points; i++){
		vec3.fromBufferAttribute(normal, i);
		line_normal.setXYZ(2*i, vec3.x, vec3.y, vec3.z);
		line_normal.setXYZ(2*i+1, vec3.x, vec3.y, vec3.z);
		const normal_vec3 = vec3.clone(); 

		vec3.fromBufferAttribute(color, i);
		line_color.setXYZ(2*i, vec3.x, vec3.y, vec3.z);
		line_color.setXYZ(2*i+1, vec3.x, vec3.y, vec3.z);

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

	    this.cloudBounds.lowerLeftCorner.value[0] = d.cloudBounds.lowerLeftCorner;
	    this.cloudBounds.lowerLeftCornerDepth.value[0] = d.cloudBounds.lowerLeftCornerDepth;
	    this.cloudBounds.upperLeftCorner.value[0] = d.cloudBounds.upperLeftCorner;
	    this.cloudBounds.lowerRightCorner.value[0] = d.cloudBounds.lowerRightCorner;

	    this.morphTargetInfluences = [];
	    this.geometry.morphAttributes.position = [];
	    this.geometry.morphAttributes.color = [];
	    this.geometry.morphAttributes.normal = [];
	    if (usesUv) this.geometry.morphAttributes.uv = [];
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
	    this.geometry.setAttribute("color", color);
	    if (usesUv) new_geom.setAttribute("uv", uv);
	} else {
	    position.needsUpdate = true;
	    this.cloudBounds.lowerLeftCorner.value[morphId+1] = d.cloudBounds.lowerLeftCorner;
	    this.cloudBounds.lowerLeftCornerDepth.value[morphId+1] = d.cloudBounds.lowerLeftCornerDepth;
	    this.cloudBounds.upperLeftCorner.value[morphId+1] = d.cloudBounds.upperLeftCorner;
	    this.cloudBounds.lowerRightCorner.value[morphId+1] = d.cloudBounds.lowerRightCorner;
	
	    this.geometry.morphAttributes.position[morphId] = position;
	    this.geometry.morphAttributes.color[morphId] = color;
	    this.geometry.morphAttributes.normal[morphId] = normal;
	    if (usesUv) this.geometry.morphAttributes.uv[morphId] = uv;
	    this.morphTargetInfluences[morphId] = (morphId == this.currentMorphDescId) ? 1 : 0;
	    this.geometry.buffersNeedUpdate = true;
	}
    }
    
    finalizeLoad(x) {
	const [descriptor, firstDescriptor] = x;
	descriptor.forEach( (d, i) => {
	    if (i < firstDescriptor)
		return;
	    this.addFromDescriptor(d, i);
	});

	// If we are appending to the descriptor then we need to update
	// the material in case we have added clouds that have features
	// like texture map or displacement map that we did not have to
	// support before
	if (firstDescriptor > 0){
	    this.makeMaterial();
	}
	
	return this;
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
		    if (["gltf", "glb"].includes(file_ext)){
			this.constructor.loadGLTF(d,
						  color,
						  function (g, m) { loadDone(descriptor, g, m, idx); } );
		    } else if (file_ext == "svg"){
			this.constructor.SVGtoObject3D(d.filename,
						       color,
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

	return loaderPromise.
            then(this.finalizeLoad.bind(this),
		 function(err) {
		     console.log(err);
		 });
    }


    makeColorPointGeometryFromImage(image, num_points, normal=null, space_to_fill_ratio=0.1, intensity_scale = 1.0, tile_dim=8, pos_noise=null, threshold=0, depth=null){
	const data = image.data;
	const [w, h] = [image.width, image.height];
	var image_pixels = w*h;
	depth = depth || this.point_size;

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

	const sample_offset_x = (w-1-(scale_factor_dim*(points_w-1)))/2;
	const sample_offset_y = (h-1-(scale_factor_dim*(points_h-1)))/2;

	const c00 = new THREE.Color();
	const c01 = new THREE.Color();
	const c10 = new THREE.Color();
	const c11 = new THREE.Color();
				 
	function sample_image(x, y){
	    const pos_x = sample_offset_x+x*scale_factor_dim;
	    const pos_y = sample_offset_y+y*scale_factor_dim;

	    const pos_x_floor = Math.floor(pos_x);
	    const pos_y_floor = Math.floor(pos_y);

	    const pos_x_frac = pos_x - pos_x_floor;
	    const pos_y_frac = pos_y - pos_y_floor;
	    
	    c00.set(data[4*(pos_x_floor+pos_y_floor*w)+0]/255,
		    data[4*(pos_x_floor+pos_y_floor*w)+1]/255,
		    data[4*(pos_x_floor+pos_y_floor*w)+2]/255);
	    c01.set(data[4*(pos_x_floor+1+pos_y_floor*w)+0]/255,
		    data[4*(pos_x_floor+1+pos_y_floor*w)+1]/255,
		    data[4*(pos_x_floor+1+pos_y_floor*w)+2]/255);
	    c10.set(data[4*(pos_x_floor+(pos_y_floor+1)*w)+0]/255,
		    data[4*(pos_x_floor+(pos_y_floor+1)*w)+1]/255,
		    data[4*(pos_x_floor+(pos_y_floor+1)*w)+2]/255);
	    c11.set(data[4*(pos_x_floor+1+(pos_y_floor+1)*w)+0]/255,
		    data[4*(pos_x_floor+1+(pos_y_floor+1)*w)+1]/255,
		    data[4*(pos_x_floor+1+(pos_y_floor+1)*w)+2]/255);
	    	    
	    c00.multiplyScalar(1-pos_x_frac).add(c01.multiplyScalar(pos_x_frac));
	    c10.multiplyScalar(1-pos_x_frac).add(c11.multiplyScalar(pos_x_frac));
	    c00.multiplyScalar(1-pos_y_frac).add(c10.multiplyScalar(pos_y_frac));

	    var a00 = data[4*(pos_x_floor+pos_y_floor*w)+3]/255;
	    const a01 = data[4*(pos_x_floor+1+pos_y_floor*w)+3]/255;
	    var a10 = data[4*(pos_x_floor+(pos_y_floor+1)*w)+3]/255;
	    const a11 = data[4*(pos_x_floor+1+(pos_y_floor+1)*w)+3]/255;

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
	depth = depth || this.point_size;
	
	
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
