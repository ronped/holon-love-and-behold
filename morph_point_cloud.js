import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import TWEEN from '@tweenjs/tween.js';

const imageExtension = ['gif','jpg','jpeg','png'];
const videoExtension = ['mpg', 'mp2', 'mpeg', 'mpe', 'mpv', 'mp4']

class morphPointCloud {
    makeInstance(geometry) {
	if (!this.hasOwnProperty("material")){
	    this.material = new THREE.PointsMaterial( { vertexColors: true, color: this.color, size: this.point_size, blending: THREE.NormalBlending, transparent: true } );
	    if (this.point_sprite_file){
		const sprite = new THREE.TextureLoader().load( this.point_sprite_file );
		sprite.colorSpace = THREE.SRGBColorSpace;
		this.material.map = sprite;
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
	this.maxVideoMorphTargets = 3;
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
	
	var morphId = this.descriptorToMorphIdMap[index];

	if (this.descriptor[this.currentMorphDescId].video){
	    this.updateVideo();
	    morphId=-1;
	}

	const newMorphTargetInfluences = Array(this.point_img.morphTargetInfluences.length).fill(0);
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
		new_geom = this.makePointGeometryFromImage(image, d.invert, d.contrast_levels, d.point_space_ratio || 0.01, d.intensity_scale || 1.0, d.normalise);
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
	
	if (d.rotate){
	    new_geom.rotateX(d.rotate.x);
	    new_geom.rotateY(d.rotate.y);
	    new_geom.rotateZ(d.rotate.z);
	}

	var morphId = this.nextFreeMorphId;
	this.descriptorToMorphIdMap[index] = this.nextFreeMorphId++;
	
	if (!this.point_img){
	    this.point_img = this.makeInstance(new_geom);
	    this.main_geom = new_geom;
	    this.point_img.morphTargetInfluences = [];
	    this.main_geom.morphAttributes.position = [];
	    this.main_geom.morphAttributes.color = [];
	}

	// Add the rest of the position and color attributes as morph attributes 
	var position = new_geom.getAttribute("position");
	var color = new_geom.getAttribute("color");
	if (position.count < this.num_points){
	    const positions_array = new Float32Array(this.num_points*3);
	    const colors_array = new Float32Array(this.num_points*3);
	    for (let point=0; point<this.num_points*3; point++){ 
		positions_array[point] = position.array[point%(position.count*3)]; 
		colors_array[point] = color.array[point%(position.count*3)];
	    }
	    position = new THREE.BufferAttribute(positions_array, 3);
	    color = new THREE.BufferAttribute(colors_array, 3);
	}

	if (d.video){
	    position.setUsage( THREE.DynamicDrawUsage );
	    position.needsUpdate = true;
	    this.main_geom.setAttribute("position", position);
	} else {
	    position.needsUpdate = true;
	    this.main_geom.morphAttributes.position[morphId] = position;
	    this.main_geom.morphAttributes.color[morphId] = color;
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

    makePointGeometryFromImage(image, invert_colors, contrast_levels=17, space_to_fill_ratio=0.1, intensity_scale=1.0, normalise=true){
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
	for (let y=0; y<h; y+=scale_pixels_per_dim){
	    for (let x=0; x<w; x+=scale_pixels_per_dim){
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

	const last_pos = pos-3;
	// If we have more points left then distribute them over the last points
	while (pos < this.num_points*3){
	    const copy_pos = last_pos - pos;
	    for (let i=0; i<3; i++){
		positions[pos+i] = positions[last_pos+copy_pos+i];
	    }
	    pos+=3;
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
	return geometry;
    }

}

export {morphPointCloud};

