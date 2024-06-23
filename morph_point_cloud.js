import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import TWEEN from '@tweenjs/tween.js';



class morphPointCloud {
    makeInstance( geometry) {
	if (!this.hasOwnProperty("material")){
	    this.material = new THREE.PointsMaterial( { vertexColors: true, color: this.color, size: 0.01, alphaTest: 0.1, transparent: true } );
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

    constructor(num_points, point_size, color, contrast_levels, point_sprite_file = 'assets/heart.png'){
	this.point_sprite_file = point_sprite_file;
	this.num_points = num_points;
	this.point_size = point_size;
	this.color = color;
	this.contrast_levels = contrast_levels;
    }
    
    morphTo(index, easing=TWEEN.Easing.Cubic.Out, time=1000){
	const newMorphTargetInfluences = Array(this.obj.morphTargetInfluences.length).fill(0);
	if (index > 0 && index <= this.obj.morphTargetInfluences.length){
	    newMorphTargetInfluences[index-1] = 1;
	}
	
	new TWEEN.Tween(this.obj.morphTargetInfluences)
	    .to(newMorphTargetInfluences,time)
	    .easing(easing)
	    .start()
    }
    
    finalizeLoad(descriptor) {
	var point_img;
	var main_geom;
	descriptor.forEach( (d, i) => {
	    var new_geom;
	    if (d.texture){
		const canvas = document.createElement('canvas');
		canvas.width = d.texture.image.width;
		canvas.height = d.texture.image.height;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(d.texture.image, 0, 0,d.texture.image.width, d.texture.image.height);
		const image = ctx.getImageData(0,0,d.texture.image.width,d.texture.image.height);
		new_geom = this.makePointGeometryFromImage(image, d.invert, d.contrast_levels);
	    } else if (d.geometry){
		new_geom = d.geometry;
	    } else {
		console.error("Unknown descriptor entry:");
		console.error(d);
		return;
	    }

	    if (d.pos){
		new_geom.translate(d.pos.x, d.pos.y, d.pos.z);
	    }
	    
	    if (i==0){
		// The first texture becomes the main point geometry
		point_img = this.makeInstance(new_geom);
		main_geom = new_geom;
		if (descriptor.length > 1){
		    point_img.morphTargetInfluences = [];
		    main_geom.morphAttributes.position = [];
		    main_geom.morphAttributes.color = [];
		}
	    } else {
		// Add the rest of the position and color attributes as morph attributes 
		main_geom.morphAttributes.position.push(new_geom.getAttribute("position"));
		main_geom.morphAttributes.color.push(new_geom.getAttribute("color"));
		point_img.morphTargetInfluences.push(0);
	    }
	});
	this.obj = point_img;
	return point_img;
    }

    load(descriptor){
	const contrast_levels = this.contrast_levels;
	var loaderPromise = new Promise(function(resolve, reject) {
            function loadDone(x,idx) {
		if (!descriptor[idx].hasOwnProperty("contrast_levels")){
		    descriptor[idx].contrast_levels = contrast_levels;
		}
		if (x.constructor.name === "Texture"){
		    descriptor[idx].texture = x;
		} else {
		    descriptor[idx].geometry = x;
		}
		// Check if all entries that requires a texture load
		// are done - if not return without calling resolve
		var done = true;
		descriptor.forEach( (d) => {
		    if (d.hasOwnProperty("filename") && (!d.hasOwnProperty("texture") && !d.hasOwnProperty("geometry"))){
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
		    if (d.filename.slice(-4) == ".svg"){
			morphPointCloud.SVGtoObject3D(d.filename,
						      function (t) { loadDone(t, idx); } );
			
			
		    } else {
			texture_loader.load( d.filename,
					     function (t) { loadDone(t, idx); } );
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

    makePointGeometryFromImage(image, invert_colors, contrast_levels=17){
	const data = image.data;
	const [w, h] = [image.width, image.height];
	const max_points_per_pixel = contrast_levels-1;
	const quant_image = new Uint8Array(w*h);
	var sum_points = 0;
	
	// Find out how many pixels are of the various levels
	for (let i=0; i<data.length/4; i++){
	    var level = (data[i*4+0]/3 + data[i*4+1]/3 + data[i*4+2]/3);
	    if (invert_colors){
		level = 255-level;
	    }
	    level /= 256;
	    level *= (data[i*4+3]/255);
	    const quant = Math.floor(level*contrast_levels);
	    quant_image[i] = quant;
	    sum_points += quant;
	}
	
	// sum_points is how many points we need to represents the image with
	// the current resolution. Check how that compares to how many points
	// we have and then scale the number of levels accordingly.
	const scale_points = this.num_points/sum_points;
	var actual_max_points_per_pixel = max_points_per_pixel*scale_points;
	// We need to have at least two levels - if not we need to process
	// a group of pixels. Make sure we process square subset then.
	var scale_pixels_per_dim = 1.0;
	if (actual_max_points_per_pixel < 1.0){
	    scale_pixels_per_dim = Math.ceil(Math.sqrt(1/actual_max_points_per_pixel));
	    actual_max_points_per_pixel *= Math.pow(scale_pixels_per_dim, 2);
	}
	
	const space_to_fill_ratio = 0.1;
	const point_distance = this.point_size*(1+space_to_fill_ratio);
	
	// Round up to nearest square
	const actual_max_points_per_pixel_sqrt = Math.ceil(Math.sqrt(Math.floor(actual_max_points_per_pixel)));
	
	// Get final dimensions
	const final_width = (w/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*this.point_size*(1+space_to_fill_ratio);
	const final_height = (h/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*this.point_size*(1+space_to_fill_ratio);

	const center_adjust_x = -final_width/2;
	const center_adjust_y = final_height/2;
	
	const positions = new Float32Array(this.num_points*3);
	var pos = 0;
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
		value *= actual_max_points_per_pixel/(max_points_per_pixel*Math.pow(scale_pixels_per_dim, 2));


		if (value < 1){
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
		while (value-- > 1){
		    const selected_point = Math.floor(Math.random()*all_grid_points.length);
		    used_grid_points[all_grid_points[selected_point][0]+all_grid_points[selected_point][1]*value_sqrt] = true;
		    all_grid_points.splice(selected_point, 1);
		}
		
		// Coordinates to upper left corner of this grid
		const pixel_pos_x = (x/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_distance;
		const pixel_pos_y = (y/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_distance;
		
		for (let y_grid=0; y_grid<value_sqrt; y_grid++){
		    for (let x_grid=0; x_grid<value_sqrt; x_grid++){
			if ( used_grid_points[x_grid + value_sqrt*y_grid] && pos < this.num_points*3){
			    // Add some randomness to points so that things does not look so straight
			    const rand_x = Math.random()*space_to_fill_ratio*this.point_size;
			    const rand_y = Math.random()*space_to_fill_ratio*this.point_size;
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

