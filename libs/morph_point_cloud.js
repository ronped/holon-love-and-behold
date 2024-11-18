import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import TWEEN from '@tweenjs/tween.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const imageExtension = ['gif','jpg','jpeg','png'];
const videoExtension = ['mpg', 'mp2', 'mpeg', 'mpe', 'mpv', 'mp4', 'webm']

// Make a default zero displacement texture
const defaultDisplacementMap = new THREE.DataTexture( new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType,
						      THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);

const defaultTextureMap = new THREE.DataTexture( new Uint8Array(4*4).fill(255), 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType,
						 THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);

const x_unit = new THREE.Vector3(1,0,0);
const y_unit = new THREE.Vector3(0,1,0);
const z_unit = new THREE.Vector3(0,0,1);

class cloudBounds {
    x_axis = new THREE.Vector3(1,0,0);
    y_axis = new THREE.Vector3(0,1,0);
    z_axis = new THREE.Vector3(0,0,1);
    
    constructor(geometry){
	this.geometry = geometry;
	this.lowerLeftCorner = new THREE.Vector3();
	this.upperLeftCorner = new THREE.Vector3();
	this.lowerRightCorner = new THREE.Vector3();

	this.update();
    }

    update(){
	this.geometry.computeBoundingBox();
	this.lowerLeftCorner.set(this.geometry.boundingBox.min.x,
				 this.geometry.boundingBox.min.y,
				 this.geometry.boundingBox.min.z);
	this.upperLeftCorner.set(this.geometry.boundingBox.min.x,
				 this.geometry.boundingBox.max.y,
				 this.geometry.boundingBox.min.z);
	this.lowerRightCorner.set(this.geometry.boundingBox.max.x,
				  this.geometry.boundingBox.min.y,
				  this.geometry.boundingBox.min.z);
    }

    rotateX(angle){
	this.lowerLeftCorner.applyAxisAngle(x_unit, angle);
	this.upperLeftCorner.applyAxisAngle(x_unit, angle);
	this.lowerRightCorner.applyAxisAngle(x_unit, angle);
    }
    
    rotateY(angle){
	this.lowerLeftCorner.applyAxisAngle(y_unit, angle);
	this.upperLeftCorner.applyAxisAngle(y_unit, angle);
	this.lowerRightCorner.applyAxisAngle(y_unit, angle);
    }

    rotateZ(angle){
	this.lowerLeftCorner.applyAxisAngle(z_unit, angle);
	this.upperLeftCorner.applyAxisAngle(z_unit, angle);
	this.lowerRightCorner.applyAxisAngle(z_unit, angle);
    }

    copy(from){
	this.lowerLeftCorner.copy(from.lowerLeftCorner);
	this.upperLeftCorner.copy(from.upperLeftCorner);
	this.lowerRightCorner.copy(from.lowerRightCorner);
    }
    
};

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
    // Force displacement to be from center of the geometry
    // rather than in the direction of the normal
    static DISPLACEMENT_MAP_DISPLACE_FROM_CENTER = 1 << 6;

    hasAnyDisplacementMaps(){
	var found = false;
	this.descriptor.forEach( (d) => {
	    if (d.displacementMap || d.displacementMapFlags){
		found = true;
	    }
	})
	return found;
    }

    hasAnyTextureMaps(){
	var found = false;
	this.descriptor.forEach( (d) => {
	    if (d.textureMap){
		found = true;
	    }
	})
	return found;
    }



    makeMaterial(geometry) {
	if (this instanceof THREE.Points){
	    this.material = new THREE.PointsMaterial( { vertexColors: true, color: this.color, size: this.point_size, blending: THREE.NormalBlending, transparent: true, depthTest: true, depthWrite: false } );
	    if (this.point_sprite_file){
		const sprite = new THREE.TextureLoader().load( this.point_sprite_file );
		sprite.colorSpace = THREE.SRGBColorSpace;
		this.material.map = sprite;
	    }
	} else if (this instanceof THREE.Line) {
	    this.material = new THREE.LineBasicMaterial( { vertexColors: true, color: this.color, linewidth: this.point_size, blending: THREE.NormalBlending, transparent: true, depthTest: true, depthWrite: false } );
	}
	
	
	const hasDisplacementMaps = this.hasAnyDisplacementMaps();
	const hasTextureMaps = this.hasAnyTextureMaps();
	if (hasDisplacementMaps || hasTextureMaps){
	    geometry.computeBoundingBox ();
	    this.material.onBeforeCompile = shader => {
		if (hasDisplacementMaps){
		    shader.uniforms.displacementMap = this.displacementMap;
		    shader.uniforms.uDisplacementMapEnable = this.displacementMapEnable;
		    shader.uniforms.uDisplacementMapFlags = this.displacementMapFlags;
		    shader.uniforms.uDisplacementMapScale = this.displacementMapScale;
		}
		if (hasTextureMaps){
		    shader.uniforms.textureMap = this.textureMap;
		    shader.uniforms.textureMapEnable = this.textureMapEnable;
		    shader.uniforms.textureMapOffset = this.textureMapOffset;
		    shader.uniforms.textureMapScale = this.textureMapScale;
		    const pos = new THREE.Vector3(0,0,10);
		    if (this.camera){
			this.camera.getWorldPosition(pos);
		    }
		    shader.uniforms.textureViewPos = {value: pos};
		}
		shader.uniforms.upperLeftCorner =  this.cloudBounds.upperLeftCorner;
		shader.uniforms.lowerLeftCorner =  this.cloudBounds.lowerLeftCorner;
		shader.uniforms.lowerRightCorner = this.cloudBounds.lowerRightCorner;
		shader.uniforms.uTime = this.currentTime;

		var vertexShaderBegin = 
		    `uniform vec3 upperLeftCorner[${this.nextFreeMorphId+1}], lowerLeftCorner[${this.nextFreeMorphId+1}], lowerRightCorner[${this.nextFreeMorphId+1}];
	             uniform float uTime;
                    `; 

		var returnIfNotLineEnd = "";
		if (!(this instanceof THREE.Points))
		    returnIfNotLineEnd =
		    `if ((gl_VertexID & int(1)) == 0)
                        return vec3(0.0,0.0,0.0);`;
		
		// Some common code for both displacement and texture maps
		shader.vertexShader =
    		    shader.vertexShader.replace(
    			'#include <morphtarget_vertex>',
    			`#include <morphtarget_vertex>
                             vec3 llc = lowerLeftCorner[0] * morphTargetBaseInfluence;
                             vec3 ulc = upperLeftCorner[0] * morphTargetBaseInfluence;
                             vec3 lrc = lowerRightCorner[0] * morphTargetBaseInfluence;
                             for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
                                  if (morphTargetInfluences[i] > 0.0) {
                                      llc += morphTargetInfluences[ i ] * lowerLeftCorner[i+1];
                                      ulc += morphTargetInfluences[ i ] * upperLeftCorner[i+1];
                                      lrc += morphTargetInfluences[ i ] * lowerRightCorner[i+1];
                                  }
                             }

                             vec3 cloudHeight = ulc - llc;
                             vec3 cloudWidth = lrc - llc;
                             vec3 posInCloud = transformed - llc;
                             //Appendpoint
                             `);

		if (hasDisplacementMaps){
		    vertexShaderBegin +=
			`uniform sampler2D displacementMap[${this.nextFreeMorphId+1}];
			 uniform float uDisplacementMapEnable[${this.nextFreeMorphId+1}];
			 uniform uint uDisplacementMapFlags[${this.nextFreeMorphId+1}];
			 uniform float uDisplacementMapScale[${this.nextFreeMorphId+1}];
                         #define M_PI 3.1415926535897932384626433832795
                         ${perlinNoiseShader}
                         vec3 getDisplacement(uint dispMapFlags, float dispMapScale, sampler2D dispMap, float dispMapEnable, vec3 posInCloud, vec3 cloudHeight, vec3 cloudWidth, vec3 transformed, vec3 objectNormal){
                           vec2 uv;
                           vec3 posFromCenter, cloudCenter;
                           ${returnIfNotLineEnd}
                           if ((dispMapFlags &
                                (${this.constructor.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER}u |
                                 ${this.constructor.DISPLACEMENT_MAP_RADIAL_U_MAPPING}u |
                                 ${this.constructor.DISPLACEMENT_MAP_ANGULAR_U_MAPPING}u |
                                 ${this.constructor.DISPLACEMENT_MAP_RADIAL_V_MAPPING}u |
                                 ${this.constructor.DISPLACEMENT_MAP_ANGULAR_V_MAPPING}u)) != 0u){
                             cloudCenter = cloudHeight/2.0 + cloudWidth/2.0;
                             posFromCenter = posInCloud - cloudCenter;
                           }
      			 
                           if ((dispMapFlags & ${this.constructor.DISPLACEMENT_MAP_RADIAL_U_MAPPING}u) != 0u){
                             uv.x = length(posFromCenter)/length(cloudHeight-cloudCenter);
                           } else if ((dispMapFlags & ${this.constructor.DISPLACEMENT_MAP_ANGULAR_U_MAPPING}u) != 0u){
                             float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                             uv.x = pointAngleFromCenter/(2.0*M_PI);
                           } else {
                             float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
                             uv.x = length(posInCloud)*sin(pointAngle)/length(cloudWidth);
                           }
                           if ((dispMapFlags & ${this.constructor.DISPLACEMENT_MAP_RADIAL_V_MAPPING}u) != 0u){
                             uv.y = length(posFromCenter)/length(cloudHeight-cloudCenter);
                           } else if ((dispMapFlags & ${this.constructor.DISPLACEMENT_MAP_ANGULAR_V_MAPPING}u) != 0u){
                             float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                             float pointAngleFromCenterHeight = acos(dot(cloudHeight, posFromCenter)/(length(cloudHeight)*length(posFromCenter)));
                             uv.y = pointAngleFromCenterHeight > 0.5*M_PI ? 2.0*M_PI-pointAngleFromCenter : pointAngleFromCenter;
                             uv.y /= (2.0*M_PI);
                           } else {
                             float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
                             uv.y = length(posInCloud)*cos(pointAngle)/length(cloudHeight);
                           }
                           if ((dispMapFlags & ${this.constructor.DISPLACEMENT_MAP_LOG_U_MAPPING}u)!=0u){
                             uv.x = max(1.0-uv.x, 0.001);
                             uv.x = 1.0 - (log(uv.x)/2.303+3.0)/3.0;
                           }
                           float displacement = dispMapEnable == 1.0 ? texture2D( dispMap, uv ).x : 0.0;
                           if ((dispMapFlags & ${this.constructor.DISPLACEMENT_MAP_ADD_PERLIN_NOISE}u)!=0u){
                             displacement += pnoise(transformed + uTime, vec3(10.0))/10.0;
                           }
                           if ((dispMapFlags & ${this.constructor.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER}u)!=0u){
                             return dispMapScale*(displacement/length(posFromCenter))*posFromCenter;
                           } else {
                             return dispMapScale*displacement*objectNormal;
                           }
                         } 
                         `; 
		    var displacement_switch = "vec3 displacement;\nswitch (i){\n";
		    for (let i=1; i<this.displacementMapEnable.value.length; i++){
			displacement_switch += `case ${i-1}: displacement=getDisplacement(uDisplacementMapFlags[i+1], uDisplacementMapScale[i+1], displacementMap[${i}], uDisplacementMapEnable[i+1],
                                                                                          posInCloud, cloudHeight, cloudWidth, transformed, objectNormal);break;\n`;
		    }
		    displacement_switch += "}\n";
		    shader.vertexShader =
    		        shader.vertexShader.replace(
    			    '//Appendpoint',
    			    `//Appendpoint
                                 #include <beginnormal_vertex>
   			         #include <morphnormal_vertex>
	             		 if ( morphTargetBaseInfluence != 0.0 ){
                                   transformed += (morphTargetBaseInfluence * getDisplacement(uDisplacementMapFlags[0], uDisplacementMapScale[0], displacementMap[0], uDisplacementMapEnable[0],
                                                                                              posInCloud, cloudHeight, cloudWidth, transformed, objectNormal));
                                 }
				 for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
	             		   if ( morphTargetInfluences[ i ] != 0.0 ){
                                     ${displacement_switch}
                                     transformed += morphTargetInfluences[ i ] * displacement;
                                   }
                                 }
                               `
    			);
    		}

		if (hasTextureMaps){
		    vertexShaderBegin +=
			`uniform sampler2D textureMap[${this.nextFreeMorphId+1}];	
    		         uniform float textureMapEnable[${this.nextFreeMorphId+1}];
    		         uniform vec2 textureMapOffset[${this.nextFreeMorphId+1}];
    		         uniform vec2 textureMapScale[${this.nextFreeMorphId+1}];
			 uniform vec3 textureViewPos;
                         `;
		    shader.vertexShader = shader.vertexShader.replace("#include <morphcolor_vertex>", "");
		    var texture_switch = "vec4 texColor;\nswitch (i){\n";
		    for (let i=1; i<this.textureMapEnable.value.length; i++){
			if (this.textureMapEnable.value[i]==1.0){
			    texture_switch += `case ${i-1}: texColor=texture2D(textureMap[${i}], textureMapOffset[i+1] + vUv/textureMapScale[i+1] );break;\n`;
			}
		    }
		    texture_switch += "}\n";

		    shader.vertexShader =
    		        shader.vertexShader.replace(
    			    '//Appendpoint',
                            `vec3 cloudNorm = cross(cloudWidth, cloudHeight);
                                 float t = dot(cloudNorm, llc-textureViewPos)/dot(cloudNorm,-textureViewPos+transformed);
                                 vec3 projPosInCloud = textureViewPos + t*(-textureViewPos+transformed) - llc;
                                 float pointAngle = acos(dot(cloudHeight, projPosInCloud)/(length(cloudHeight)*length(projPosInCloud)));
                                 vec2 vUv;
                                 vUv.x = length(projPosInCloud)*sin(pointAngle)/length(cloudWidth);
                                 vUv.y = length(projPosInCloud)*cos(pointAngle)/length(cloudHeight);

                                 if (textureMapEnable[0] == 1.0 && morphTargetBaseInfluence != 0.0)
                                 #if defined( USE_COLOR_ALPHA )
                                    vColor = texture2D(textureMap[0], textureMapOffset[0]+vUv/textureMapScale[0]) * morphTargetBaseInfluence;
		                 #elif defined( USE_COLOR )
                                    vColor = texture2D(textureMap[0], textureMapOffset[0]+vUv/textureMapScale[0]).rgb * morphTargetBaseInfluence;
		                 #endif
                                 else
				    vColor *= morphTargetBaseInfluence;

				 for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
	             		   if ( morphTargetInfluences[ i ] != 0.0 ){
                                     ${texture_switch}
                                 #if defined( USE_COLOR_ALPHA )
                                     if (textureMapEnable[i+1]==1.0) vColor += texColor * morphTargetInfluences[ i ];
                                     else vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		                 #elif defined( USE_COLOR )
                                     if (textureMapEnable[i+1]==1.0) vColor += texColor.rgb * morphTargetInfluences[ i ];
                                     else vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		                 #endif
                                   }
    	                         }
                                `);
		}

		shader.vertexShader = vertexShaderBegin + shader.vertexShader;
	    }
	}

	this.geometry = geometry;
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
        const newPositionAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newNormalAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
        const newColorAttribute = new THREE.BufferAttribute(new Float32Array(positionAttribute.count*3), 3);
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
		newColorAttribute.setXYZ(pos_remaining,
					 colorAttribute.getX(random_idx),
					 colorAttribute.getY(random_idx),
					 colorAttribute.getZ(random_idx));
	}

	geometry.setAttribute("position", newPositionAttribute);
	if (normalAttribute)
	    geometry.setAttribute("normal", newNormalAttribute);
	if (colorAttribute)
	    geometry.setAttribute("color", newColorAttribute);

    }

    static loadGLTF(file, color, positionNoise=null, loadDone = null){
	const loader = new GLTFLoader();
	loader.load(file, function ( gltf ) {
	    var obj = gltf.scene;
	    while (!obj.constructor.name || (obj.constructor.name != "Mesh" && obj.constructor.name != "Points" ) ){
    		obj = obj.children[0];
	    }
	    obj.geometry.deleteAttribute("uv");
	    obj.geometry.deleteAttribute("uv1");
	    obj.geometry.deleteAttribute("uv2");
	    if (!obj.geometry.hasAttribute("color")){
		const position = obj.geometry.getAttribute("position");
		const colors = new Float32Array(position.count*3);
		color = new THREE.Color(color);
		for (let i=0; i<position.count; i++){
		    colors[i*3] = color.r;
		    colors[i*3+1] = color.g;
		    colors[i*3+2] = color.b;
		}
		obj.geometry.setAttribute('color',new THREE.BufferAttribute(colors, 3));
	    }
	    if (!obj.geometry.hasAttribute("normal")){
		const position = obj.geometry.getAttribute("position");
		obj.geometry.setAttribute('normal', position);
	    }

	    loadDone(obj.geometry);
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
		    const colors = new Float32Array(position.count*3);
		    color = new THREE.Color(color);
		    for (let i=0; i<position.count; i++){
			colors[i*3] = color.r;
			colors[i*3+1] = color.g;
			colors[i*3+2] = color.b;
		    }
		    merged_geometry.setAttribute('color',new THREE.BufferAttribute(colors, 3));
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


    constructor(num_points, point_size, color, point_sprite_file = null, onclick=null, renderer = null, camera = null){
	super();

	if (!num_points)
	    return;
	
	this.point_sprite_file = point_sprite_file;
	this.num_points = num_points;
	this.point_size = point_size;
	this.color = color;
	this.renderer = renderer;
	this.camera = camera;
	this.onclick = onclick;

	this.displacementMap = { value: [] };
	this.displacementMapEnable = { value: [] };
	this.displacementMapFlags = { value: [] };
	this.displacementMapScale = { value: [] };
	this.textureMap = { value: [] };
	this.textureMapEnable = { value: [] };
	this.textureMapOffset = { value: [] };
	this.textureMapScale = { value: [] };
	this.cloudBounds = { lowerLeftCorner : { value: [] },
			     upperLeftCorner : { value: [] },
			     lowerRightCorner : { value: [] } };
	this.clock = new THREE.Clock();
	this.clock.start();
	this.currentTime = {value: this.clock.getElapsedTime()};

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
	if (index != this.currentMorphDescId){
	    if (prevDescriptor.video){
		prevDescriptor.video.pause();
	    } else if (newDescriptor.video){
		newDescriptor.videoStartTime = this.clock.getElapsedTime();
		newDescriptor.video.pause();
		newDescriptor.video.currentTime = 0;
	    }
	}
	
	const morphId = this.getMorphId(index);

	if (morphId < 0){
	    this.currentMorphDescId = index;
	    this.update().then( (() => {
		this.displacementMap.value[0] = newDescriptor.displacementMap || defaultDisplacementMap;
		this.displacementMapEnable.value[0] = newDescriptor.displacementMap ? 1 : 0;
		this.displacementMapFlags.value[0] = newDescriptor.displacementMapFlags || 0;
		this.displacementMapScale.value[0] = newDescriptor.displacementMapScale || 1;
		this.textureMap.value[0] = newDescriptor.textureMap
		this.textureMapEnable.value[0] = newDescriptor.textureMap ? 1 : 0;
		this.textureMapOffset.value[0] = newDescriptor.textureMapOffset || new THREE.Vector2(0,0);
		this.textureMapScale.value[0] = newDescriptor.textureMapScale || new THREE.Vector2(1,1);
		this.cloudBounds.lowerLeftCorner.value[0] = newDescriptor.cloudBounds.lowerLeftCorner;
		this.cloudBounds.upperLeftCorner.value[0] = newDescriptor.cloudBounds.upperLeftCorner;
		this.cloudBounds.lowerRightCorner.value[0] = newDescriptor.cloudBounds.lowerRightCorner;
	    }).bind(this));
	}

	const newMorphTargetInfluences = Array(this.morphTargetInfluences.length).fill(0);

	if (morphId >= 0 && morphId < this.morphTargetInfluences.length){
	    newMorphTargetInfluences[morphId] = 1;
	}

	if (this.pendingMorphTween)
	    this.pendingMorphTween.stop();
	
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


    update(){
	this.currentTime.value = this.clock.getElapsedTime();
	const d = this.descriptor[this.currentMorphDescId];
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
		return d.video.play().then( _ => {
		    this.addFromDescriptor(d, this.currentMorphDescId);
		    d.video.pause();
		});
	    }
	}
	return null;
    }


    genColorAttr(num_points, color=null){
	const colors = new Float32Array(num_points*3);
	color = color || this.color;
	var colorFunc;
	if (color.isBufferGeometry){
	    colorAttr = color.getAttribute("color");
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
	
	for (let i=0; i<num_points; i++){
	    const c = colorFunc(i, this);
	    colors[i*3] = c.r;
	    colors[i*3+1] = c.g;
	    colors[i*3+2] = c.b;
	}
	return new THREE.BufferAttribute(colors, 3);
    }
    
    addFromDescriptor(d, index){
	var new_geom = null;
	var scale_width = null, scale_height = null, scale_depth = null;
	if (d.texture || d.video){
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
		    new_geom = this.makeColorPointGeometryFromImage(image, this.num_points, normal, d.point_space_ratio || 0.01, d.tileDim || 8, d.pos_noise || null);
		} else {
		    new_geom = this.makePointGeometryFromImage(image, this.num_points, normal, d.invert, d.point_space_ratio || 0.01,
							       d.intensity_scale || 1.0, d.normalise, d.threshold || 0, d.tileDim || 8, d.extrude_depth || 0.2,
							       d.spheric_extrude || false,
							       d.color || null, d.pos_noise || null);
		}
		d.geometry = new_geom;
	    }

	} else if (d.geometry){
	    new_geom = d.geometry;
	    if (d.pos_noise)
		this.constructor.addPositionNoise(d.geometry, d.pos_noise, d.pos_noise_normal || false);
	    d.geometry.deleteAttribute("uv");
	    if (!d.geometry.getAttribute('color')){
		d.geometry.setAttribute('color',this.genColorAttr(d.geometry.getAttribute("position").count, d.color || this.color));
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
	    new_geom.rotateX(d.rotate.x);
	    new_geom.rotateY(d.rotate.y);
	    new_geom.rotateZ(d.rotate.z);
	    d.cloudBounds.rotateX(d.rotate.x);
	    d.cloudBounds.rotateY(d.rotate.y);
	    d.cloudBounds.rotateZ(d.rotate.z);
	}

	if (d.randPosOrder)
	    this.constructor.randomizePositionOrder(new_geom);

	var morphId = this.nextFreeMorphId;
	this.descriptorToMorphIdMap[index] = this.nextFreeMorphId;
	
	// Add the rest of the position and color attributes as morph attributes 
	var position = new_geom.getAttribute("position");
	var color = new_geom.getAttribute("color");
	var normal = new_geom.getAttribute("normal");
	if (position.count < this.num_points){
	    const positions_array = new Float32Array(this.num_points*3);
	    const colors_array = new Float32Array(this.num_points*3);
	    const normals_array = new Float32Array(this.num_points*3);
	    for (let point=0; point<this.num_points*3; point++){ 
		positions_array[point] = position.array[point%(position.count*3)]; 
		colors_array[point] = color.array[point%(position.count*3)];
		normals_array[point] = normal.array[point%(position.count*3)];
	    }
	    position = new THREE.BufferAttribute(positions_array, 3);
	    color = new THREE.BufferAttribute(colors_array, 3);
	    normal = new THREE.BufferAttribute(normals_array, 3);
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
	    const vec3 = new THREE.Vector3();
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
	    }
	    position = line_position;
	    color = line_color;
	    normal = line_normal;
	}
	
	
	if (!this.materialMade){
	    position.needsUpdate = true;
	    new_geom.setAttribute("position", position);
	    new_geom.setAttribute("color", color);
	    new_geom.setAttribute("normal", normal);
	    this.makeMaterial(new_geom);
	    this.materialMade = true;
	    this.geometry.buffersNeedUpdate = true;

	    this.displacementMap.value[0] = d.displacementMap || defaultDisplacementMap;
	    this.displacementMapEnable.value[0] = d.displacementMap ? 1 : 0;
	    this.displacementMapFlags.value[0] = d.displacementMapFlags || 0;
	    this.displacementMapScale.value[0] = d.displacementMapScale || 1;
	    this.textureMap.value[0] = d.textureMap;
	    this.textureMapEnable.value[0] = d.textureMap ? 1 : 0;
	    this.textureMapOffset.value[0] = d.textureMapOffset || new THREE.Vector2(0,0);
	    this.textureMapScale.value[0] = d.textureMapScale || new THREE.Vector2(1,1);
	    this.cloudBounds.lowerLeftCorner.value[0] = d.cloudBounds.lowerLeftCorner;
	    this.cloudBounds.upperLeftCorner.value[0] = d.cloudBounds.upperLeftCorner;
	    this.cloudBounds.lowerRightCorner.value[0] = d.cloudBounds.lowerRightCorner;

	    this.morphTargetInfluences = [];
	    this.geometry.morphAttributes.position = [];
	    this.geometry.morphAttributes.color = [];
	    this.geometry.morphAttributes.normal = [];
	}


	if (d.video){
	    position.setUsage( THREE.DynamicDrawUsage );
	    position.needsUpdate = true;
	    this.geometry.setAttribute("position", position);
	    this.geometry.setAttribute("normal", normal);
	    this.geometry.setAttribute("color", color);
	} else {
	    this.nextFreeMorphId++;
	    position.needsUpdate = true;

	    this.displacementMap.value[morphId+1] = d.displacementMap;
	    this.displacementMapEnable.value[morphId+1] = d.displacementMap ? 1 : 0;
	    this.displacementMapFlags.value[morphId+1] = d.displacementMapFlags || 0;
	    this.displacementMapScale.value[morphId+1] = d.displacementMapScale || 1;
	    this.textureMap.value[morphId+1] = d.textureMap;
	    this.textureMapEnable.value[morphId+1] = d.textureMap ? 1 : 0;
	    this.textureMapOffset.value[morphId+1] = d.textureMapOffset || new THREE.Vector2(0,0);
	    this.textureMapScale.value[morphId+1] = d.textureMapScale || new THREE.Vector2(1,1);
	    this.cloudBounds.lowerLeftCorner.value[morphId+1] = d.cloudBounds.lowerLeftCorner;
	    this.cloudBounds.upperLeftCorner.value[morphId+1] = d.cloudBounds.upperLeftCorner;
	    this.cloudBounds.lowerRightCorner.value[morphId+1] = d.cloudBounds.lowerRightCorner;
	
	    this.geometry.morphAttributes.position[morphId] = position;
	    this.geometry.morphAttributes.color[morphId] = color;
	    this.geometry.morphAttributes.normal[morphId] = normal;
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
            function loadDone(descriptor,x,idx) {
		if (x.constructor.name === "Texture"){
		    descriptor[idx].texture = x;
		    descriptor[idx].texture.colorSpace = THREE.SRGBColorSpace;
		    descriptor[idx].texture.needsUpdate;
		} else if (!descriptor[idx].video) {
		    descriptor[idx].geometry = x;
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
			this.constructor.loadGLTF(d.filename,
						 color,
						 d.pos_noise || null,
						 function (t) { loadDone(descriptor,t, idx); } );
		    } else if (file_ext == "svg"){
			this.constructor.SVGtoObject3D(d.filename,
						      color,
						      function (t) { loadDone(descriptor,t, idx); } );
		    } else if (imageExtension.includes(file_ext)){
			texture_loader.load( d.filename,
					     function (t) { loadDone(descriptor,t, idx); } );
		    } else if (videoExtension.includes(file_ext)){
			const video = document.createElement('video');
			video.src = d.filename;
			video.autoplay = false;
			video.style = "display:none";
			video.muted = true;
			video.loop = d.loop || false;
			video.preload = "auto";
			d.video = video;
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
			    loadDone(descriptor,d, idx)
			} ).catch( function ( error ) {
			    console.error( 'Unable to access the camera/webcam.', error );
			} );
		    } else {
			console.error( 'MediaDevices interface not available.' );
		    }
		} else {
		    loadDone(descriptor,d.geometry, idx);
		}
	    });
	    
	}.bind(this));

	return loaderPromise.
            then(this.finalizeLoad.bind(this),
		 function(err) {
		     console.log(err);
		 });
    }


    makeColorPointGeometryFromImage(image, num_points, normal=null, space_to_fill_ratio=0.1, tile_dim=8, pos_noise=null){
	const data = image.data;
	const [w, h] = [image.width, image.height];
	const image_pixels = w*h;

	num_points = num_points || image_pixels;

	const scale_factor_dim = Math.sqrt(image_pixels / num_points);
	const points_w = Math.ceil(w/scale_factor_dim); 
	const points_h = Math.ceil(h/scale_factor_dim);

	const positions = new Float32Array(num_points*3);
	const colors = new Float32Array(num_points*3);

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

	    return c00;
	}
	
	
	for (let tile_y=0; tile_y<points_h; tile_y+=tile_dim){
	    for (let tile_x=0; tile_x<points_w; tile_x+=tile_dim){
		for (let y=tile_y; y<(Math.min(points_h,tile_y+tile_dim)); y+=1){
		    for (let x=tile_x; x<(Math.min(points_w,tile_x+tile_dim)); x+=1){
			if (pos/3 < num_points){
        		    const rand_x = pos_noise ? Math.random()*space_size*pos_noise : 0;
        		    const rand_y = pos_noise ? Math.random()*space_size*pos_noise : 0;
			    const color = sample_image(x, y);
			    colors[pos] = color.r;
        		    positions[pos++] = x*point_distance + rand_x + center_adjust_x;
			    colors[pos] = color.g;
        		    positions[pos++] = -(y*point_distance + rand_y + center_adjust_y);
			    colors[pos] = color.b;
        		    positions[pos++] = 0;
			}
		    }
		}
	    }
	}

	const geometry = new THREE.BufferGeometry();
	const positionAttribute = new THREE.BufferAttribute(positions, 3);
	const colorAttribute = new THREE.BufferAttribute(colors, 3);
	geometry.setAttribute('position', positionAttribute);
	geometry.setAttribute('color', colorAttribute);

	if (normal){
	    const normals = new Float32Array(num_points*3);
	    for (let i=0; i<num_points; i++){
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
			       pos_noise=null
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
				pixel_pos_z = Math.random()>0.5? radius : -radius;
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
	
	const last_pos = pos-3;

	if (last_pos < (num_points*3 - pos)){
	    // Over half of the points remaining so just add some points far back on z axis
            while (pos < num_points*3){
        	positions[pos++] = 0;
        	positions[pos++] = 0;
        	positions[pos++] = 20;
            }
	} else {
            // If we have more points left then distribute them over the last points
            while (pos < num_points*3){
        	const copy_pos = last_pos - pos;
        	for (let i=0; i<3; i++){
        	    positions[pos+i] = positions[last_pos+copy_pos+i];
        	}
        	pos+=3;
            }
	}
	
	const geometry = new THREE.BufferGeometry();
	const positionAttribute = new THREE.BufferAttribute(positions, 3);
	geometry.setAttribute('position', positionAttribute);
	geometry.setAttribute('color',this.genColorAttr(num_points, color));

	if (normal){
	    const normals = new Float32Array(num_points*3);
	    for (let i=0; i<num_points; i++){
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
