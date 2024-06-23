import * as THREE from 'three';
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from '@tweenjs/tween.js';
import { holonLogoGeometry } from "./holon_logo.js";
import { morphPointCloud } from "./morph_point_cloud.js";

// vars
var num=30;
var objects=[];
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();
var t;
const clock = new THREE.Clock()

// create camera
var camera = new THREE.PerspectiveCamera( 85, window.innerWidth/window.innerHeight, 0.1, 1000 );
camera.position.set(0.0,0.0,10);

// create a scene
var scene = new THREE.Scene();

// create renderer
var renderer = new THREE.WebGLRenderer({antialias:true});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild( renderer.domElement );


function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth, window.innerHeight );
}

window.addEventListener("resize", onWindowResize );

// orbit controls
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableZoom = true;
controls.enableDamping = true;

// Lights
const amb_light = new THREE.AmbientLight( 0xffffff, 1.5 );
scene.add(amb_light);


//const light2 = new THREE.SpotLight(0xfff0f0,10);
//light2.position.set(0,2.5,2.5);
//scene.add( light2 );

const cover_texture_names = [
    'love-and-behold-single-cover',
    'takiwatanga-cover',
    'sail-away-cover',
    'well-all-be-stars-cover',
    'silent-city-cover',
    'samsara-cover'
];


var material = [];
for (var tex_idx=0; tex_idx<cover_texture_names.length; tex_idx++){
    const cover_texture = new THREE.TextureLoader()
	  .setPath( 'assets/' )
	  .load( cover_texture_names[tex_idx] + ".png" );

    // Depthmaps generated automatically using either https://imageamigo.com/
    // or https://huggingface.co/spaces/pytorch/MiDaS

    const cover_texture_depthmap = new THREE.TextureLoader()
	  .setPath( 'assets/' )
	  .load( cover_texture_names[tex_idx] + "-depthmap.png" );

    material.push(new THREE.MeshStandardMaterial( {
	color: 0xaaaaaa,
	roughness: 1,
	metalness: 0,
	
	map: cover_texture,
	
//	displacementMap: cover_texture_depthmap,
//	displacementScale: 2,
//	displacementBias: +0.5,
	
	side: THREE.BackSide
    }));
}

						 
// geometry
var geometry = new THREE.BoxGeometry( 5, 5, 5, 256, 256, 256 );

// morph box into a sphere
const position = geometry.attributes.position;
const vector = new THREE.Vector3();
for ( var i = 0; i < position.count; i ++ ) {
    vector.fromBufferAttribute( position, i );
    vector.normalize().multiplyScalar( 5 );
    position.setXYZ(i,vector.x, vector.y, vector.z); // or whatever size you want
}
position.needsUpdate = true;

// redefine vertex normals consistent with a sphere; reset UVs
geometry.computeVertexNormals()
						 
const cover_sphere = new THREE.Mesh( geometry, material );
//mesh.position.z = -5;
cover_sphere.receiveShadow = true;
cover_sphere.scale.x = -1;
scene.add( cover_sphere );
var camera_quaternion;

function onClick(event) {
    raycaster.setFromCamera(
        {
            x: (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
            y: -(event.clientY / renderer.domElement.clientHeight) * 2 + 1,
        },
        camera
    )

    const intersects = raycaster.intersectObject(cover_sphere, true)
    if (intersects.length > 0) {
	const material_index = intersects[0].face.materialIndex;
	const group = intersects[0].object.geometry.groups[material_index];
	const pos_low_left = new THREE.Vector3();
	const pos_low_right = new THREE.Vector3();
	const pos_up_left = new THREE.Vector3();
	const normal_center = new THREE.Vector3();
	var cur_uv = new THREE.Vector2();
	for (var i=0; i<group.count; ++i){
	    const idx = intersects[0].object.geometry.index.array[group.start+i];
	    cur_uv.fromBufferAttribute(intersects[0].object.geometry.attributes.uv, idx);
	    if (cur_uv.x == 0 && cur_uv.y == 0){
		pos_low_left.fromBufferAttribute(intersects[0].object.geometry.attributes.position, idx);
	    } else if (cur_uv.x == 0 && cur_uv.y == 1){
		pos_up_left.fromBufferAttribute(intersects[0].object.geometry.attributes.position, idx);
	    } else if (cur_uv.x == 1 && cur_uv.y == 0){
		pos_low_right.fromBufferAttribute(intersects[0].object.geometry.attributes.position, idx);
	    } else if (cur_uv.x == 0.5 && cur_uv.y == 0.5){
		normal_center.fromBufferAttribute(intersects[0].object.geometry.attributes.normal, idx);
	    }
	}

	// Get diagonal vector for plane
	intersects[0].object.localToWorld(pos_up_left);
	intersects[0].object.localToWorld(pos_low_left);
	intersects[0].object.localToWorld(pos_low_right);
	const height_vector = new THREE.Vector3().subVectors(pos_up_left, pos_low_left);
	const width_vector = new THREE.Vector3().subVectors(pos_low_right, pos_low_left);

	// Get center point in the plane of the edges of the texture
	const pos_center = pos_low_left.clone();
	pos_center.add(height_vector.clone().multiplyScalar(0.5));
	pos_center.add(width_vector.clone().multiplyScalar(0.5));
	// Convert center point to world coordinates
	intersects[0].object.localToWorld(pos_center);

	// Distance to camera
	const vFov = camera.fov * Math.PI / 180;
	const camera_distance = height_vector.length()/(2*Math.tan(vFov/2)); 
	const new_camera_pos = new THREE.Vector3().addVectors(pos_center, normal_center.clone().multiplyScalar(-camera_distance));

	// Rotation
	var rotate_y = Math.atan2(normal_center.x,-normal_center.z);
	if (normal_center.x == 0 && normal_center.z == 0){
	    rotate_y = 0;
	} 
	var rotate_x = Math.atan2(normal_center.y,-normal_center.z);
	if (normal_center.y == 0 && normal_center.z == 0){
	    rotate_x = 0;
	} 
	const rotate_z = Math.atan2(width_vector.y,width_vector.x);
	
	new TWEEN.Tween(camera.position)
            .to(new_camera_pos,1000)
            .easing(TWEEN.Easing.Cubic.Out)
	    .start()

	const euler_rotate = new THREE.Euler(rotate_x, rotate_y, rotate_z);
	camera_quaternion = new THREE.Quaternion().setFromEuler(euler_rotate);
	
	console.log("Centerpoint: ");
	console.log(pos_center);
	console.log("Distance: " + camera_distance);
	console.log("New Camera pos: ");
	console.log(new_camera_pos);
	console.log(euler_rotate);
    }
}

renderer.domElement.addEventListener('click', onClick, false)

function makeInstance( geometry, color, x, pointcloud=false ) {
    var obj;
    if (pointcloud){
	const sprite = new THREE.TextureLoader().load( 'assets/heart.png' );
	sprite.colorSpace = THREE.SRGBColorSpace;
	const material = new THREE.PointsMaterial( { vertexColors: true, color: color, size: 0.01, map: sprite, alphaTest: 0.1, transparent: true } );
	obj = new THREE.Points( geometry, material );
    } else {
	const material = new THREE.MeshPhysicalMaterial( {
	    color,
	    side: THREE.DoubleSide,
	    metalness: 1,
	    roughness: 0.1
	} );
	obj = new THREE.Mesh( geometry, material );
    }    
    obj.castShadow = true;
    obj.position.x = x;
    return obj;
}


function removeObject3D(object3D) {
    if (!(object3D instanceof THREE.Object3D)) return false;
    
    // for better memory management and performance
    if (object3D.geometry) object3D.geometry.dispose();
    
    if (object3D.material) {
        if (object3D.material instanceof Array) {
	    // for better memory management and performance
	    object3D.material.forEach(material => material.dispose());
        } else {
	    // for better memory management and performance
	    object3D.material.dispose();
        }
    }
    if (object3D.children){
	object3D.children.forEach(child => removeObject3D(child));
    }
    object3D.removeFromParent(); // the parent might be the scene or another Object3D, but it is sure to be removed this way
    return true;
}

const pivot_point = new THREE.Group();
const pivot_point2 = new THREE.Group();

function SVGtoObject3D(file, loadDone = null){
    // instantiate a loader
    const loader = new SVGLoader();
    
    loader.load(
	// resource URL
	file,
	// called when the resource is loaded
	function ( data ) {
	    const group = new THREE.Group();
	    const paths = data.paths;
	    for ( let i = 0; i < paths.length; i ++ ) {
		const path = paths[ i ];

		const material = new THREE.LineBasicMaterial( {
	    	    transparent: true,
	    	    color: 0xffffff,
		    blending: THREE.AdditiveBlending,
		    opacity: 0.25,
		    //depthTest: false,
		    side: THREE.DoubleSide,
		} );
		//const material = new THREE.MeshBasicMaterial( {
		//	//opacity: path.userData.style.strokeOpacity,
		//	color: 0xDEA039,
		//	//transparent: true,
		//	side: THREE.FrontSide,
		//	//depthWrite: false
		//} );
		
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
			    const mesh = new THREE.Mesh( geometry, material );
			    group.add( mesh );
			}
		    });
		    
		}
	    }

	    loadDone( group );
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

function makeImageFromPoints(descriptor, num_points, point_size, color, contrast_levels){

    var loaderPromise = new Promise(function(resolve, reject) {
	
        function loadDone(x,idx) {
	    descriptor[idx].texture = x;
	    // Check if all entries that requires a texture load
	    // are done - if not return without calling resolve
	    var done = true;
	    descriptor.forEach( (d) => {
		if (d.hasOwnProperty("filename") && !d.hasOwnProperty("texture")){
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
		texture_loader.load( d.filename,
				     function (t) { loadDone(t, idx); } );
	    }
	});
	
    });

    return loaderPromise.
        then(function ( descriptor ) {
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
		    new_geom = makePointGeometryFromImage(image, d.invert, num_points, point_size, color, 5);
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
		    point_img = makeInstance( new_geom, color, 0, true);
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
	    return point_img;
	}, function(err) {
            console.log(err);
        });
}

function makePointGeometryFromImage(image, invert_colors, num_points, point_size, color, contrast_levels=17){
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
    const scale_points = num_points/sum_points;
    var actual_max_points_per_pixel = max_points_per_pixel*scale_points;
    // We need to have at least two levels - if not we need to process
    // a group of pixels. Make sure we process square subset then.
    var scale_pixels_per_dim = 1.0;
    if (actual_max_points_per_pixel < 1.0){
	scale_pixels_per_dim = Math.ceil(Math.sqrt(1/actual_max_points_per_pixel));
	actual_max_points_per_pixel *= Math.pow(scale_pixels_per_dim, 2);
    }

    const space_to_fill_ratio = 0.1;
    const point_distance = point_size*(1+space_to_fill_ratio);
    
    // Round up to nearest square
    const actual_max_points_per_pixel_sqrt = Math.ceil(Math.sqrt(Math.floor(actual_max_points_per_pixel)));

    // Get final dimensions
    const final_width = (w/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_size*(1+space_to_fill_ratio);
    const final_height = (h/scale_pixels_per_dim)*actual_max_points_per_pixel_sqrt*point_size*(1+space_to_fill_ratio);

    const center_adjust_x = -final_width/2;
    const center_adjust_y = final_height/2;
    
    const positions = new Float32Array(num_points*3);
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
		    if ( used_grid_points[x_grid + value_sqrt*y_grid] && pos < num_points*3){
			// Add some randomness to points so that things does not look so straight
			const rand_x = Math.random()*space_to_fill_ratio*point_size;
			const rand_y = Math.random()*space_to_fill_ratio*point_size;
			const rand_z = (Math.random()-0.5)*point_size;
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
    while (pos < num_points*3){
	const copy_pos = last_pos - pos;
	for (let i=0; i<3; i++){
	    positions[pos+i] = positions[last_pos+copy_pos+i];
	}
	pos+=3;
    }
    
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionAttribute);
    const colors = new Float32Array(num_points*3);
    color = new THREE.Color(color);
    for (let i=0; i<num_points; i++){
	colors[i*3] = color.r;
	colors[i*3+1] = color.g;
	colors[i*3+2] = color.b;
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors, 3));
    return geometry;
}


const holon_logo_obj = new holonLogoGeometry(0xd0d0d0, true, 2, new THREE.Vector3(0, 0, 0))
//const holon_logo = makeInstance( holon_logo_obj.geometry, 0xd0d0d0, 0, true);
//scene.add(holon_logo);
//holon_logo.position.z=6



const pointcloud_pivot = new THREE.Object3D(0,0);

const pointcloud_descriptor = [
    { filename: "assets/holon_dekor_outline.png", invert:true, pos:new THREE.Vector3(0,0,0) },
    { filename: "assets/ScaryMaria.png", invert:false, pos:new THREE.Vector3(0,0,5) },
    { geometry: holon_logo_obj.geometry, pos:new THREE.Vector3(0,0,6) }
]


var pointcloud;
const morph_point_cloud = new morphPointCloud(holon_logo_obj.geometry.attributes.position.count, 0.01, 0xd0d0d0, 5);
morph_point_cloud.load(pointcloud_descriptor).then(
    function (obj) {
	pointcloud = obj
	pointcloud.position.z = 0;
	pointcloud_pivot.add(pointcloud);
	scene.add(pointcloud_pivot);
    }
);


const pivot2_rotate_axis = new THREE.Vector3(Math.cos(Math.PI/4), Math.sin(Math.PI/4));

var rotate = false;

var animate = function () {
    const delta = clock.getDelta();
    t = new Date().getTime();
    //console.info(camera.rotation);
    
    if ( camera_quaternion && !camera.quaternion.equals( camera_quaternion ) ) {
	const step = 1 * delta;
	camera.quaternion.rotateTowards( camera_quaternion, step );
    } else {
	camera_quaternion = null;
    }
    
    pivot_point.rotation.y += delta;
    pivot_point2.rotateOnAxis(pivot2_rotate_axis, delta); 

    if (pointcloud && rotate){
	pointcloud_pivot.rotation.z += delta/2;
	pointcloud_pivot.rotation.x += delta/4;
	pointcloud_pivot.rotation.y += delta/8;
	cover_sphere.rotation.z += delta/2;
	cover_sphere.rotation.x -= delta/4;
	cover_sphere.rotation.y -= delta/8;
    }
    //dekor.rotation.z += delta/2;
    //dekor.rotation.x += delta/4;
    //dekor.rotation.y += delta/8;

    TWEEN.update();
    //light.map.rotation = time;
    //light.map.needsUpdate = true;
    requestAnimationFrame( animate );
    //logo_sine_wave1.rotation.y -= 0.01;
    //logo_sine_wave1.rotation.x -= 0.01;
    //logo_sine_wave1.scale.set(logo_scale, logo_scale, logo_scale);
    //camera.lookAt(logo_sine_wave1.position);
    
    
    renderer.render(scene, camera);
};
animate();


document.addEventListener("keypress", onKeypress);

function onKeypress(event){
    //console.log(event.key);

    if (event.key == " "){
	rotate = !rotate;
    } else if (!isNaN(Number(event.key))) {
	const number = Number(event.key);
	if (number <= pointcloud.morphTargetInfluences.length){
	    morph_point_cloud.morphTo(number);
	}
    }
}
