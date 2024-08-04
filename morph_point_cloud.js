import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import TWEEN from '@tweenjs/tween.js';

const imageExtension = ['gif','jpg','jpeg','png'];
const videoExtension = ['mpg', 'mp2', 'mpeg', 'mpe', 'mpv', 'mp4']

class cloudBounds {
    upperLeftCorner = new THREE.Vector3(0,0,0);
    lowerLeftCorner = new THREE.Vector3(0,0,0);
    lowerRightCorner = new THREE.Vector3(0,0,0);
    x_axis = new THREE.Vector3(1,0,0);
    y_axis = new THREE.Vector3(0,1,0);
    z_axis = new THREE.Vector3(0,0,1);
    
    constructor(llc=null, ulc=null, lrc=null){
	if (llc){
	    this.lowerLeftCorner.copy(llc);
	}
	if (ulc){
	    this.upperLeftCorner.copy(ulc);
	}
	if (lrc){
	    this.lowerRightCorner.copy(lrc);
	}
    }
    
    rotateX(angle){
	this.lowerLeftCorner.applyAxisAngle(this.x_axis, angle);
	this.upperLeftCorner.applyAxisAngle(this.x_axis, angle);
	this.lowerRightCorner.applyAxisAngle(this.x_axis, angle);
    }
    
    rotateY(angle){
	this.lowerLeftCorner.applyAxisAngle(this.y_axis, angle);
	this.upperLeftCorner.applyAxisAngle(this.y_axis, angle);
	this.lowerRightCorner.applyAxisAngle(this.y_axis, angle);
    }
    
    rotateZ(angle){
	this.lowerLeftCorner.applyAxisAngle(this.z_axis, angle);
	this.upperLeftCorner.applyAxisAngle(this.z_axis, angle);
	this.lowerRightCorner.applyAxisAngle(this.z_axis, angle);
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


class morphPointCloud {

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

    setDisplacementMap(){
	const curDescriptor = this.descriptor[this.currentMorphDescId];
	if (curDescriptor.displacementMap){
	    this.curDisplacementMap.value = curDescriptor.displacementMap;
	} else {
	    this.curDisplacementMap.value = this.defaultDisplacementMap;
	}  
	if (curDescriptor.displacementMapFlags){
	    this.curDisplacementMapFlags.value = curDescriptor.displacementMapFlags;
	} else {
	    this.curDisplacementMapFlags.value = 0;
	}
    }
    
    makeInstance(geometry) {
	if (!this.hasOwnProperty("material")){
	    this.material = new THREE.PointsMaterial( { vertexColors: true, color: this.color, size: this.point_size, blending: THREE.NormalBlending, transparent: true, depthTest: true, depthWrite: false } );
	    if (this.point_sprite_file){
		const sprite = new THREE.TextureLoader().load( this.point_sprite_file );
		sprite.colorSpace = THREE.SRGBColorSpace;
		this.material.map = sprite;
	    }

	    
	    if (this.hasAnyDisplacementMaps()){
		geometry.computeBoundingBox ();
		this.material.onBeforeCompile = shader => {
		    shader.uniforms.displacementMap = this.curDisplacementMap;
		    shader.uniforms.uDisplacementMapFlags = this.curDisplacementMapFlags;
		    shader.uniforms.upperLeftCorner =  {value:this.currentCloudBounds.upperLeftCorner};
		    shader.uniforms.lowerLeftCorner =  {value:this.currentCloudBounds.lowerLeftCorner};
		    shader.uniforms.lowerRightCorner = {value:this.currentCloudBounds.lowerRightCorner};
		    shader.uniforms.uTime = this.currentTime;
 
		    shader.vertexShader =
			`uniform sampler2D displacementMap;
			 uniform vec3 upperLeftCorner, lowerLeftCorner, lowerRightCorner;
			 uniform float uTime;
			 uniform uint uDisplacementMapFlags;
                         #define M_PI 3.1415926535897932384626433832795\n` +
			perlinNoiseShader +
		        shader.vertexShader.replace(
			'#include <morphtarget_vertex>',
			`#include <morphtarget_vertex>
			 #include <beginnormal_vertex>
			 #include <morphnormal_vertex>
                         vec3 cloudHeight = upperLeftCorner - lowerLeftCorner;   
                         vec3 cloudWidth = lowerRightCorner - lowerLeftCorner;
                         vec3 posInCloud = transformed - lowerLeftCorner;
                         vec2 uv;
                         vec3 posFromCenter, cloudCenter;
                         if ((uDisplacementMapFlags &
                              (${morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER}u |
                               ${morphPointCloud.DISPLACEMENT_MAP_RADIAL_U_MAPPING}u |
                               ${morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING}u |
                               ${morphPointCloud.DISPLACEMENT_MAP_RADIAL_V_MAPPING}u |
                               ${morphPointCloud.DISPLACEMENT_MAP_ANGULAR_V_MAPPING}u)) != 0u){
                           cloudCenter = cloudHeight/2.0 + cloudWidth/2.0;
                           posFromCenter = posInCloud - cloudCenter;
                         }

                         if ((uDisplacementMapFlags & ${morphPointCloud.DISPLACEMENT_MAP_RADIAL_U_MAPPING}u) != 0u){
                           uv.x = length(posFromCenter)/length(cloudHeight-cloudCenter);
                         } else if ((uDisplacementMapFlags & ${morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING}u) != 0u){
                           float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                           uv.x = pointAngleFromCenter/(2.0*M_PI);
                         } else {
                           float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
                           uv.x = length(posInCloud)*sin(pointAngle)/length(cloudWidth);
                         }
                         if ((uDisplacementMapFlags & ${morphPointCloud.DISPLACEMENT_MAP_RADIAL_V_MAPPING}u) != 0u){
                           uv.y = length(posFromCenter)/length(cloudHeight-cloudCenter);
                         } else if ((uDisplacementMapFlags & ${morphPointCloud.DISPLACEMENT_MAP_ANGULAR_V_MAPPING}u) != 0u){
                           float pointAngleFromCenter = acos(dot(cloudWidth, posFromCenter)/(length(cloudWidth)*length(posFromCenter)));
                           float pointAngleFromCenterHeight = acos(dot(cloudHeight, posFromCenter)/(length(cloudHeight)*length(posFromCenter)));
                           uv.y = pointAngleFromCenterHeight > 0.5*M_PI ? 2.0*M_PI-pointAngleFromCenter : pointAngleFromCenter;
                           uv.y /= (2.0*M_PI);
                         } else {
                           float pointAngle = acos(dot(cloudHeight, posInCloud)/(length(cloudHeight)*length(posInCloud)));
                           uv.y = length(posInCloud)*cos(pointAngle)/length(cloudHeight);
                         }
                         if ((uDisplacementMapFlags & ${morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING}u)!=0u){
                           uv.x = max(1.0-uv.x, 0.001);
                           uv.x = 1.0 - (log(uv.x)/2.303+3.0)/3.0;
                         }
                         float displacement = texture2D( displacementMap, uv ).x;
                         if ((uDisplacementMapFlags & ${morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE}u)!=0u){
                           displacement += pnoise(transformed + uTime, vec3(10.0))/10.0;
                         }
                         if ((uDisplacementMapFlags & ${morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER}u)!=0u){
                           transformed += (displacement/length(posFromCenter))*posFromCenter;
                         } else {
                           transformed += displacement*objectNormal;
                         }
                        `
			);
		}
	    }
	}
	const obj = new THREE.Points( geometry, this.material );
	obj.castShadow = true;
	return obj;
    }

    static SVGtoObject3D(file, loadDone = null){
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


    constructor(num_points, point_size, color, contrast_levels, point_sprite_file = null){
	this.point_sprite_file = point_sprite_file;
	this.num_points = num_points;
	this.point_size = point_size;
	this.color = color;
	this.contrast_levels = contrast_levels;

	// Make a default zero displacement texture
	this.defaultDisplacementMap = new THREE.DataTexture( new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType,
								 THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);

	this.curDisplacementMap = { value: this.defaultDisplacementMap };
	this.curDisplacementMapFlags = { value: 0 };
	this.currentCloudBounds = new cloudBounds()
	this.clock = new THREE.Clock();
	this.currentTime = {value: this.clock.getElapsedTime()};
    }
    
    morphTo(index, easing=TWEEN.Easing.Cubic.Out, time=1000){
	if (index >= this.descriptor.length){
	    return
	}
	
	if (index != this.currentMorphDescId){
	    if (this.descriptor[this.currentMorphDescId].video){
		this.descriptor[this.currentMorphDescId].video.pause();
	    } else if (this.descriptor[index].video){
		this.descriptor[index].video.play();
	    }
	}
	
	this.currentMorphDescId = index;
	const curDescriptor = this.descriptor[this.currentMorphDescId];
	
	var morphId = this.descriptorToMorphIdMap[index];

	if (curDescriptor.video){
	    this.updateVideo();
	    morphId=-1;
	}

	this.currentCloudBounds.copy(curDescriptor.cloudBounds);
	const newMorphTargetInfluences = Array(this.point_img.morphTargetInfluences.length).fill(0);

	this.setDisplacementMap();

	if (morphId >= 0 && morphId < this.point_img.morphTargetInfluences.length){
	    newMorphTargetInfluences[morphId] = 1;
	}

	if (time == 0){
	    this.point_img.morphTargetInfluences = newMorphTargetInfluences;
	} else {
	    new TWEEN.Tween(this.point_img.morphTargetInfluences)
		.to(newMorphTargetInfluences,time)
		.easing(easing)
		.start()
	}
    }


    updateVideo(){
	this.currentTime.value = this.clock.getElapsedTime();
	if (this.descriptor[this.currentMorphDescId].video) {
	    this.addFromDescriptor(this.descriptor[this.currentMorphDescId], this.currentMorphDescId);
	}
    }

    
    
    addFromDescriptor(d, index){
	var new_geom = null;
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
	    if (!d.video || (!d.video.paused && !d.video.ended)){
		ctx.drawImage(d.video || d.texture.image, 0, 0, d.canvas.width, d.canvas.height);
		const image = ctx.getImageData(0,0,d.canvas.width,d.canvas.height);
		const normal = new THREE.Vector3(0, 0, 1);
		if (d.rotate){
		    normal.applyAxisAngle(new THREE.Vector3(1, 0, 0), d.rotate.x);
		    normal.applyAxisAngle(new THREE.Vector3(0, 1, 0), d.rotate.y);
		    normal.applyAxisAngle(new THREE.Vector3(0, 0, 1), d.rotate.z);
		}
		new_geom = this.makePointGeometryFromImage(image, normal, d.invert, d.contrast_levels, d.point_space_ratio || 0.01,
							   d.intensity_scale || 1.0, d.normalise, d.threshold || 0);
	    }
	} else if (d.geometry){
	    new_geom = d.geometry;
	} else {
	    console.error("Unknown descriptor entry:");
	    console.error(d);
	    return;
	}

	if (!new_geom){
	    return
	}
	
	if (d.scale){
	    new_geom.scale(d.scale.x, d.scale.y, d.scale.z);
	}

	if (d.pos){
	    new_geom.translate(d.pos.x, d.pos.y, d.pos.z);
	}

	// Get the boundaries of the generated point cloud
	new_geom.computeBoundingBox();
	const lowerLeftCorner = new THREE.Vector3(new_geom.boundingBox.min.x,
						  new_geom.boundingBox.min.y,
						  new_geom.boundingBox.min.z);
	const upperLeftCorner = new THREE.Vector3(new_geom.boundingBox.min.x,
						  new_geom.boundingBox.max.y,
						  new_geom.boundingBox.min.z);
	const lowerRightCorner = new THREE.Vector3(new_geom.boundingBox.max.x,
						   new_geom.boundingBox.min.y,
						   new_geom.boundingBox.min.z);
	
	d.cloudBounds = new cloudBounds(lowerLeftCorner, upperLeftCorner, lowerRightCorner);
		
	if (d.rotate){
	    new_geom.rotateX(d.rotate.x);
	    d.cloudBounds.rotateX(d.rotate.x);
	    new_geom.rotateY(d.rotate.y);
	    d.cloudBounds.rotateY(d.rotate.y);
	    new_geom.rotateZ(d.rotate.z);
	    d.cloudBounds.rotateZ(d.rotate.z);
	}

	var morphId = this.nextFreeMorphId;
	this.descriptorToMorphIdMap[index] = this.nextFreeMorphId++;
	
	if (!this.point_img){
	    this.currentCloudBounds.copy(d.cloudBounds);
	    this.point_img = this.makeInstance(new_geom);
	    this.main_geom = new_geom;
	    this.point_img.morphTargetInfluences = [];
	    this.main_geom.morphAttributes.position = [];
	    this.main_geom.morphAttributes.color = [];
	    this.main_geom.morphAttributes.normal = [];
	}

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

	if (d.video){
	    position.setUsage( THREE.DynamicDrawUsage );
	    position.needsUpdate = true;
	    this.main_geom.setAttribute("position", position);
	    this.main_geom.setAttribute("normal", normal);
	} else {
	    position.needsUpdate = true;
	    this.main_geom.morphAttributes.position[morphId] = position;
	    this.main_geom.morphAttributes.color[morphId] = color;
	    this.main_geom.morphAttributes.normal[morphId] = normal;
	    this.point_img.morphTargetInfluences[morphId] = 0;
	    this.point_img.geometry.buffersNeedUpdate = true;
	}
    }
    
    finalizeLoad(descriptor) {
	descriptor.forEach( (d, i) => {
	    this.addFromDescriptor(d, i);
	});
	return this.point_img;
    }

    load(descriptor){
	this.descriptor = descriptor;
	this.descriptorToMorphIdMap = Array(descriptor.length);
	this.nextFreeMorphId = 0;
	this.currentMorphDescId = 0;
	this.setDisplacementMap();

	const contrast_levels = this.contrast_levels;
	var loaderPromise = new Promise(function(resolve, reject) {
            function loadDone(x,idx) {
		if (!descriptor[idx].hasOwnProperty("contrast_levels")){
		    descriptor[idx].contrast_levels = contrast_levels;
		}
		if (x.constructor.name === "Texture"){
		    descriptor[idx].texture = x;
		} else if (!descriptor[idx].video) {
		    descriptor[idx].geometry = x;
		}
		// Check if all entries that requires a texture load
		// are done - if not return without calling resolve
		var done = true;
		descriptor.forEach( (d) => {
		    if ((d.hasOwnProperty("filename") || d.hasOwnProperty("webcam")) && !d.hasOwnProperty("texture") && !d.hasOwnProperty("video")){
			done = false;
		    }
		});
		if (done){
		    resolve(descriptor);
		}
	    }
	    const texture_loader = new THREE.TextureLoader();

	    // Start loading all textures
	    descriptor.forEach( (d, idx) => {
		if (d.filename){
		    const file_ext = d.filename.split(".").pop();
		    if (file_ext == ".svg"){
			morphPointCloud.SVGtoObject3D(d.filename,
						      function (t) { loadDone(t, idx); } );
		    } else if (imageExtension.includes(file_ext)){
			texture_loader.load( d.filename,
					     function (t) { loadDone(t, idx); } );
		    } else if (videoExtension.includes(file_ext)){
			const video = document.createElement('video');
			video.src = d.filename;
			video.autoplay = true;
			video.style = "display:none";
			video.muted = true;
			video.loop = true;
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
			    loadDone(d, idx)
			} ).catch( function ( error ) {
			    console.error( 'Unable to access the camera/webcam.', error );
			} );
		    } else {
			console.error( 'MediaDevices interface not available.' );
		    }
		}
	    });
	    
	});

	return loaderPromise.
            then(this.finalizeLoad.bind(this),
		 function(err) {
		     console.log(err);
		 });
    }

    makePointGeometryFromImage(image, normal=null, invert_colors, contrast_levels=17, space_to_fill_ratio=0.1, intensity_scale=1.0, normalise=true, threshold=0, tile_dim=8){
	const data = image.data;
	const [w, h] = [image.width, image.height];
	const max_points_per_pixel = contrast_levels-1;
	const quant_image = new Uint16Array(w*h);
	var sum_points = 0;
	var max_level = 0;
	
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
	const scale_points = this.num_points/sum_points;
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
	const center_adjust_y = final_height/2;
	
	const positions = new Float32Array(this.num_points*3);
	var pos = 0;
	var dither = 0;

	// Tile dimension must be bigger than the group of pixels we process
	tile_dim = Math.max(scale_pixels_per_dim, tile_dim);
	
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
        		
        		for (let y_grid=0; y_grid<value_sqrt; y_grid++){
        		    for (let x_grid=0; x_grid<value_sqrt; x_grid++){
        			if ( used_grid_points[x_grid + value_sqrt*y_grid] && pos < this.num_points*3){
        			    // Add some randomness to points so that things does not look so straight
        			    const rand_x = Math.random()*space_size;
        			    const rand_y = Math.random()*space_size;
        			    const rand_z = (Math.random()-0.5)*this.point_size;
        			    positions[pos++] = (pixel_pos_x+x_grid*cur_point_distance -
        						rand_x + center_adjust_x);
        			    positions[pos++] = -(pixel_pos_y+y_grid*cur_point_distance -
        						 rand_y - center_adjust_y);
        			    positions[pos++] = rand_z;
        			}
        		    }
        		}
        	    }
		}
	    }
	}
	
	const last_pos = pos-3;

	if (last_pos < (this.num_points*3 - pos)){
	    // Over half of the points remaining so just add some points far back on z axis
            while (pos < this.num_points*3){
        	positions[pos++] = 0;
        	positions[pos++] = 0;
        	positions[pos++] = 20;
            }
	} else {
            // If we have more points left then distribute them over the last points
            while (pos < this.num_points*3){
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
	const colors = new Float32Array(this.num_points*3);
	const color = new THREE.Color(this.color);
	for (let i=0; i<this.num_points; i++){
	    colors[i*3] = color.r;
	    colors[i*3+1] = color.g;
	    colors[i*3+2] = color.b;
	}
	geometry.setAttribute('color',new THREE.BufferAttribute(colors, 3));

	if (normal){
	    const normals = new Float32Array(this.num_points*3);
	    for (let i=0; i<this.num_points; i++){
		normals[i*3] = normal.x;
		normals[i*3+1] = normal.y;
		normals[i*3+2] = normal.z;
	    }
	    geometry.setAttribute('normal',new THREE.BufferAttribute(normals, 3));
	}
	return geometry;
    }

}

export {morphPointCloud};

