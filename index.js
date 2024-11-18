import * as THREE from 'three';
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from '@tweenjs/tween.js';
import { holonLogoGeometry } from "./holon_logo.js";
import { morphPointCloud } from "./morph_point_cloud.js";
import { StarGeometry } from "./star_geometry.js";
import { TextCloudGeometry } from "./text_cloud_geometry.js";
import { audio2Texture } from "./audio2texture.js";
import { MOVE } from "./move.js";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import 'jquery';



// vars
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();
var t;
const clock = new THREE.Clock()

/*********************************************************

  Camera, Scene and renderer
    
***********************************************************/

// create camera
var camera = new THREE.PerspectiveCamera( 85, window.innerWidth/window.innerHeight, 0.1, 10000 );
camera.position.set(0.0,0.0,15);

// create a scene
var scene = new THREE.Scene();

// create renderer
var renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild( renderer.domElement );


/*********************************************************

  Pop up external pages in iframe
    
***********************************************************/


const cachedPopupElmt = {};
function popupExternal(url, popup_name, is_url=true, aspect=null, iframe_attrs=null, max_width=null, max_height=null){
    const elmt_id = "popup_window_" + popup_name; 

    if (elmt_id in cachedPopupElmt){
	cachedPopupElmt[elmt_id].appendTo(document.body);
    } else {
	var windowHeight = window.innerHeight
            || document.documentElement.clientHeight
            || document.body.clientHeight;

	var windowWidth = window.innerWidth
            || document.documentElement.clientWidth
            || document.body.clientWidth;

	var window_aspect = windowWidth/windowHeight;
	var bound_by_height = aspect ? (aspect < window_aspect) : false;
	var iframe_width, iframe_height;
	if (bound_by_height){
	    iframe_width =  ((0.8*windowHeight*aspect) / windowWidth) * 100;						    
	    iframe_height = 80;
	    
	} else {
	    iframe_height = ((0.8*windowWidth/aspect) / windowHeight) * 100;  
	    iframe_width = 80;
	}
    
	if ( max_width &&
             (iframe_width/100)*windowWidth > max_width) {
	    iframe_width = max_width*100/windowWidth;
	}
	
	if ( max_height &&
             (iframe_height/100)*windowHeight > max_height) {
	    iframe_height = max_height*100/windowHeight;
	}

	// Center
	const iframe_hor_padding = (100 - iframe_width)/2;
	const iframe_vert_padding = (100 - iframe_height)/2;
	const iframe_pixel_width = Math.round((iframe_width/100)*windowWidth);
	const iframe_pixel_height = Math.round((iframe_height/100)*windowHeight);
    
	url = url.replace("%WIDTH", iframe_pixel_width);
	url = url.replace("%HEIGHT", iframe_pixel_height);
    
	$((is_url ? ('<iframe src="' + url + '" ') : '<div ') +
	  'style="position:fixed;height:' + iframe_height + 'vh;top:' + iframe_vert_padding + 'vh;bottom:' + iframe_vert_padding +  
	  'vh;width:' + iframe_width + 'vw;left:' + iframe_hor_padding + 'vw;right:' + iframe_hor_padding + 'vw;"' +  
	  'id="' + elmt_id + '" class="popup" ' + (iframe_attrs ? iframe_attrs : "") + '>' +
	  (is_url ? '</iframe>' : url + '</div>')).appendTo(document.body); 
    }
    $(document).mouseup(function(e) {
	var cont = $('#' + elmt_id);
	if (!cont.is(e.target) && cont.has(e.target).length === 0) {
            cont.detach();
	    cachedPopupElmt[elmt_id] = cont;
	    $(document).unbind('mouseup');
	}
    });
}



/*********************************************************
 
  Handle bloom geometry by marking objects with layer
  if they should have bloom
  
***********************************************************/

const params = {
    threshold: 0,
    strength: 0.75,
    radius: 0.5,
    exposure: 1
};

const renderScene = new RenderPass(scene, camera);

// Handle bloom objects in separate pass
const BLOOM_SCENE = 1;

const bloomLayer = new THREE.Layers();
bloomLayer.set( BLOOM_SCENE );

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = params.threshold;
bloomPass.strength = params.strength;
bloomPass.radius = params.radius;

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

const mixPass = new ShaderPass(
    new THREE.ShaderMaterial( {
	uniforms: {
	    baseTexture: { value: null },
	    bloomTexture: { value: bloomComposer.renderTarget2.texture }
	},
	vertexShader: `varying vec2 vUv;
        	         void main() {
			 vUv = uv;
			 gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,
	fragmentShader: `
			uniform sampler2D baseTexture;
			uniform sampler2D bloomTexture;

			varying vec2 vUv;

			void main() {

				gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );

			}`,
	defines: {}
    } ), 'baseTexture'
);
mixPass.needsSwap = true;

const outputPass = new OutputPass();


const fxaaPass = new ShaderPass( FXAAShader );
const pixelRatio = renderer.getPixelRatio();
fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( window.innerWidth * pixelRatio );
fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( window.innerHeight * pixelRatio );


const smaaPass = new SMAAPass( window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio() );
const finalComposer = new EffectComposer( renderer );
if ( renderer.getContext() instanceof WebGL2RenderingContext ) {
    finalComposer.renderTarget1.samples = 8;
    finalComposer.renderTarget2.samples = 8;
    bloomComposer.renderTarget1.samples = 8;
    bloomComposer.renderTarget2.samples = 8;
}
finalComposer.addPass( renderScene );
//finalComposer.addPass( smaaPass );
finalComposer.addPass( mixPass );
finalComposer.addPass( outputPass );
//finalComposer.addPass( fxaaPass );

const gui = new GUI();

const bloomFolder = gui.addFolder( 'bloom' );

bloomFolder.add( params, 'threshold', 0.0, 1.0 ).onChange( function ( value ) {
    
    bloomPass.threshold = Number( value );
    
} );

bloomFolder.add( params, 'strength', 0.0, 3 ).onChange( function ( value ) {
    
    bloomPass.strength = Number( value );
    
} );

bloomFolder.add( params, 'radius', 0.0, 1.0 ).step( 0.01 ).onChange( function ( value ) {
    
    bloomPass.radius = Number( value );
    
} );

const toneMappingFolder = gui.addFolder( 'tone mapping' );

toneMappingFolder.add( params, 'exposure', 0.1, 2 ).onChange( function ( value ) {
    
    renderer.toneMappingExposure = Math.pow( value, 4.0 );
    
} );

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth, window.innerHeight );
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
    finalComposer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onWindowResize );


/*********************************************************

  Create skybox
    
***********************************************************/

/*
const skyboxTexture = new THREE.TextureLoader().load( 'assets/eye-skybox3.png' );
//const skyboxTexture = new RGBELoader().load( 'assets/eye-skybox-7.png' );
skyboxTexture.colorSpace = THREE.SRGBColorSpace;
skyboxTexture.mapping = THREE.EquirectangularReflectionMapping;
const skyboxGeometry = new THREE.SphereGeometry( 100, 60, 40 );
// invert the geometry on the x-axis so that all of the faces point inward
skyboxGeometry.scale( - 1, 1, 1 );

const skyboxMaterial = new THREE.MeshBasicMaterial( { map: skyboxTexture } );
const skybox = new THREE.Mesh( skyboxGeometry, skyboxMaterial );
skybox.rotateY(-Math.PI/2);
skybox.layers.disable( BLOOM_SCENE );
scene.add( skybox );	
*/

/*********************************************************

  Create Torus/Iris Background
    
***********************************************************/

const torus_geom = new THREE.TorusGeometry( 9.3, 3, 16, 100 ); 

{
    const position = torus_geom.getAttribute("position");
    const normal = torus_geom.getAttribute("normal");
    const uv = torus_geom.getAttribute("uv");
    const vector = new THREE.Vector3();
    for ( var i = 0; i < position.count; i ++ ) {
	vector.fromBufferAttribute( position, i );
	uv.setX(i, (vector.x+10+3)/26);
	uv.setY(i, (vector.y+10+3)/26);
    }
}

const torus_material = new THREE.MeshPhysicalMaterial( {
    map: new THREE.TextureLoader().load( 'assets/colorful-iris-upscale.png' ),
    roughness: 0.5,
    clearcoat: 1,
    reflectivity: 0.5
});

torus_material.map.colorSpace = THREE.SRGBColorSpace;
    
const torus = new THREE.Mesh( torus_geom, torus_material );
//scene.add( torus );

const torusMove = new MOVE(torus);
const centerVec3 = new THREE.Vector3(0,0,0);
torusMove
    .to(centerVec3, new THREE.Vector3(0,0,2*Math.PI), 120)
    .loop(1)
    .start()


/*********************************************************

 Lights
  
***********************************************************/


// orbit controls
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableZoom = true;
controls.enableDamping = true;

// Lights
const amb_light = new THREE.AmbientLight( 0xffffff, 3 );
scene.add(amb_light);


const light1 = new THREE.SpotLight(0xfff0f0,5,0,Math.PI/2);
light1.position.set(0,2.5,2.5);
scene.add( light1 );

const light2 = new THREE.SpotLight(0xfff0f0,5,0,Math.PI/2);
light2.position.set(0,-2.5,2.5);
scene.add( light2 );

/*********************************************************

 Cover sphere
  
***********************************************************/

const cover_texture_names = [
    'samsara-cover',
    'takiwatanga-cover',
    'sail-away-cover',
    'well-all-be-stars-cover',
    'silent-city-cover',
    'love-and-behold-album-cover',
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
var geometry = new THREE.BoxGeometry( 50, 50, 50, 64, 64, 64 );

// morph box into a sphere
const position = geometry.attributes.position;
const morphPosition = new Float32Array(position.count*3);
const morphNormal = new Float32Array(position.count*3);
const vector = new THREE.Vector3();
for ( var i = 0; i < position.count; i ++ ) {
    vector.fromBufferAttribute( position, i );
    vector.normalize().multiplyScalar( 15 );
    morphPosition[i*3+0] = morphNormal[i*3+0] = vector.x;
    morphPosition[i*3+1] = morphNormal[i*3+1] = vector.y;
    morphPosition[i*3+2] = morphNormal[i*3+2] = vector.z;
}
geometry.morphAttributes.position = [new THREE.BufferAttribute(morphPosition, 3)];
geometry.morphAttributes.normal = [new THREE.BufferAttribute(morphNormal, 3)];

position.needsUpdate = true;

// redefine vertex normals consistent with a sphere; reset UVs
geometry.computeVertexNormals()
						 
const cover_sphere = new THREE.Mesh( geometry, material );
cover_sphere.layers.disable( BLOOM_SCENE )

cover_sphere.position.z = 0;
cover_sphere.receiveShadow = true;
cover_sphere.scale.x = -1;
//scene.add( cover_sphere );

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

//renderer.domElement.addEventListener('click', onClick, false)

function makeInstance( geometry, color, x, pointcloud=false ) {
    var obj;
    if (pointcloud){
	const sprite = new THREE.TextureLoader().load( 'assets/heart.png' );
	sprite.colorSpace = THREE.SRGBColorSpace;
	const material = new THREE.PointsMaterial( { vertexColors: true, color: color, size: 0.01, map: sprite, blending: THREE.NormalBlending, transparent: false } );
	if (!geometry.hasAttribute("color")){
	    const position = geometry.getAttribute("position");
	    const colors = new Float32Array(position.count*3);
	    color = new THREE.Color(color);
	    for (let i=0; i<position.count; i++){
		colors[i*3] = color.r;
		colors[i*3+1] = color.g;
		colors[i*3+2] = color.b;
	    }
	    geometry.setAttribute('color',new THREE.BufferAttribute(colors, 3));
	}
	obj = new THREE.Points( geometry, material );
    } else {
	//const material = new THREE.MeshLambertMaterial( { color: 0xffaa00, /*envMap: reflectionCube, */combine: THREE.MixOperation, reflectivity: 0.3 } );
	const material = new THREE.MeshPhysicalMaterial({
	    color: 0xFF9090,
	    metalness: .7,
	    roughness: .4,
	    envMapIntensity: 0.9,
	    clearcoat: 0.2,
	    transparent: true,
	    transmission: .7,
	    opacity: .7,
	    reflectivity: 0.4,
	    refractionRatio: 0.785,
	    ior: 1,
	    side: THREE.DoubleSide,
	})
	//const material = new THREE.MeshStandardMaterial( {
	//    color,
	//    side: THREE.DoubleSide,
	//    metalness: 0.5,
	//    roughness: 0.1
	//} );
	obj = new THREE.Mesh( geometry, material );
    }    
    obj.castShadow = true;
    obj.position.x = x;
    return obj;
}



const pivot_point = new THREE.Group();
const pivot_point2 = new THREE.Group();
const pointcloud_pivot = new THREE.Object3D(0,0);
var pointcloud, pointcloud2;
var morph_point_cloud;
const morph_logo_point_cloud = [];
const morph_point_cloud_dekor = [];
var audioTexture;
var pointCloudMove, pointCloudMove2;
var cover_point_cloud;

async function makePointCloud(){
    /*
    const test_geom = new THREE.PlaneGeometry(10, 10, 100, 100);
    const pos_count = test_geom.getAttribute("position").count;
    test_geom.deleteAttribute("uv");
    const colors = new Float32Array(pos_count*3);
    const color = new THREE.Color(0xffffff);
    for (let i=0; i<pos_count; i++){
	colors[i*3] = color.r;
	colors[i*3+1] = color.g;
	colors[i*3+2] = color.b;
    }
    test_geom.setAttribute('color',new THREE.BufferAttribute(colors, 3));
    const pointcloud_descriptor_test = [
	{ geometry: test_geom,
	  pos:new THREE.Vector3(0,0,0),
	  rotate: new THREE.Vector3(0,0,0),
	  width: 10,
	  height: 10,
	  position_noise: 0.05,
	  textureMap: new THREE.TextureLoader().load("assets/love-and-behold-album-cover.png")
	}
    ];

    const morph_point_cloud_test = new morphPointCloud(100*100, 0.01, 0xffffe0, 'assets/heart.png');
    morph_point_cloud_test.load(pointcloud_descriptor_test).then(
	function (obj) {
	    obj.layers.enable(BLOOM_SCENE);
	    scene.add(obj);
	}
    );
    
    return;
*/

    const audioTexDescriptor = [
	{ type: audio2Texture.LEVEL },
	{ type: audio2Texture.FREQ_SPECTRUM_TIME},
	{ type: audio2Texture.TIME},
	{ type: audio2Texture.FREQ_SPECTRUM }
    ];
    
    audioTexture = new audio2Texture("assets/LoveAndBehold.mp3", audioTexDescriptor, 512, 512);
    
    renderer.domElement.addEventListener('click',
					 function (event) {
					     audioTexture.start()
					 }, false);
       

    const holon_logo_obj = new holonLogoGeometry(0xffffff, true, 2, new THREE.Vector3(0, 0, 0), 8, 128)

    const SoMeLogos = [
	{ filename: "assets/facebook_logo.png",
	  invert: false,
	  color: function (x) {
	      const c = new THREE.Color(0x4267B2);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  onclick: function () {
	      popupExternal('<div id="fb-root"></div><script async="1" defer="1" crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v20.0" nonce="EKVM2rSb"></script><div class="fb-page" data-href="https://www.facebook.com/holon.official" data-height="%HEIGHT" data-small-header="" data-adapt-container-width="1" data-hide-cover="" data-show-facepile="" data-show-posts="true" data-width="%WIDTH"></div>', "fb", false, 0.7, null, 500);}
	},
	{ filename: "assets/tidal_logo.png",
	  invert: false,
	  color: function (x) {
	      const c = new THREE.Color(0xA5A079);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  onclick: function () {
	      window.open('https://tidal.com/album/61812426', '_blank');
	  }
	},
	{ filename: "assets/instagram_logo.png",
	  color: function (x) {
	      const c = new THREE.Color(0x9A1751);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  invert: true,
	  onclick: function () {
	  }
	},
	{ filename: "assets/x_logo.png",
	  color: function (x) {
	      const c = new THREE.Color(0xCFC998);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  invert: true,
	  onclick: function () {
	      popupExternal('<a class="twitter-timeline" href="https://twitter.com/holon_official?ref_src=twsrc%5Etfw">Tweets by holon_official</a> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>', "x", false, 1/3); 
	  }
	},
	{ filename: "assets/apple_music_logo.png",
	  invert: true,
	  color: function (x) {
	      const c = new THREE.Color(0xE43D04);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  onclick: function () {
	      popupExternal('https://embed.music.apple.com/us/album/the-time-is-always-now/1746019507?app=music&amp;itsct=music_box_player&amp;itscg=30200&amp;ls=1&amp;theme=dark', "applemusic", true, 6/5, 'height=\'450px\' frameborder=0 sandbox=\'allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation\' allow=\'autoplay *; encrypted-media *; clipboard-write\' style=\'width: 100%; max-width: 660px; overflow: hidden; border-radius: 10px; transform: translateZ(0px); animation: 2s ease 0s 6 normal none running loading-indicator; background-color: rgb(228, 228, 228);\'', 660, 450);
	  }
	},
	{ filename: "assets/burningshed_logo.png",
	  invert: true,
	  color: function (x) {
	      const c = new THREE.Color(0x884610);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  onclick: function () {
	      window.open('https://burningshed.com/index.php?route=product/search&filter_name=holon&filter_category_id=255&filter_sub_category=true', '_blank');
	  }
	},
	{ filename: "assets/youtube_logo.png",	
	  color: function (x) {
	      const c = new THREE.Color(0xff0000);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  invert: true,
	  onclick: function () {popupExternal('https://www.youtube.com/embed/videoseries?list=PL-qSpRwSb9zbs1rvXwVR_dm1hSbTjwwsl', "yt", true, 1280/720, 'frameborder=\'0\' allowfullscreen', 1280, 720);} 
	},
	{ filename: "assets/spotify_logo.png",
	  color: function (x) {
	      const c = new THREE.Color(0x3A6D15);
	      c.r += (Math.random()-0.5)*50/255;
	      c.g += (Math.random()-0.5)*50/255;
	      c.b += (Math.random()-0.5)*50/255;
	      return c;
	  },
	  invert: true,
	  onclick: function (){
	      popupExternal('https://open.spotify.com/embed?uri=spotify:album:5Ibwv6O7IbIR0AEnOpH16j&theme=white&view=list', "spotify", true, 0.79, 'frameborder=\'0\' allowtransparency=\'true\'', 300, 380);
	  }
	},
    ]

    const angle_delta = 2*Math.PI/SoMeLogos.length;
    const SoMeLogoPoints = 3000;
    var dekorPointsInner = 10000;
    const dekorPointsOuter = 30000;
    const dekorPointsMiddle = 15000;
    const pointcloud_points = holon_logo_obj.geometry.attributes.position.count;
    const starsSplit = Array(SoMeLogos.length).fill(SoMeLogoPoints);
    starsSplit.push(pointcloud_points);
    starsSplit.push(dekorPointsInner);
    starsSplit.push(dekorPointsOuter);
    starsSplit.push(dekorPointsMiddle);    
    const starsGeom = StarGeometry.getSplitGeometry(starsSplit, StarGeometry.GEOMETRY_TYPE_DEFAULT, 0xffffff);
    const starsSpiralGeom = StarGeometry.getSplitGeometry(starsSplit, StarGeometry.GEOMETRY_TYPE_SPIRAL, 0xffffff);

    const albumCoverTexture = new THREE.TextureLoader().load("assets/love-and-behold-album-cover-cropped.png");
    const albumCoverTextureNonCropped = new THREE.TextureLoader().load("assets/love-and-behold-album-cover.png");
    const irisTexture = new THREE.TextureLoader().load("assets/gradient.jpg");
    const coverDepthTexture = new THREE.TextureLoader().load("assets/samsara-cover-2-depth.png");
    
    SoMeLogos.forEach( (logo, i) => {
	const z_axis = new THREE.Vector3(0, 0, -1);
	const logo_pointcloud_desc = [
	    { geometry: starsGeom[i],
	      pos:new THREE.Vector3(0,6,0).applyAxisAngle(z_axis, i*angle_delta).negate(),
	      textureMap: albumCoverTexture,
	      rotate: new THREE.Vector3(0,0,0),
	      displacementMap: audioTexture.texture[0],
	      displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	      displacementMapScale: 10
	    },
	    { geometry: starsSpiralGeom[i],
	      pos:new THREE.Vector3(0,6,0).applyAxisAngle(z_axis, i*angle_delta).negate(),
	      textureMap: albumCoverTexture,
	      rotate: new THREE.Vector3(0,0,0),
	      displacementMap: audioTexture.texture[0],
	      displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	      displacementMapScale: 10
	    },
	    { filename: logo.filename,
	      invert: logo.invert,
	      pos:new THREE.Vector3(0,0,0),
	      pos_noise: 0.1,
	      width: 1.5,
	      height: 1.5,
	      depth: 0.2,
	      threshold: 300,
	      displacementMap: audioTexture.texture[0],
	      displacementMapFlags: /*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER |*/ morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	      displacementMapScale: 0.5,
	      //spheric_extrude: true,
	      extrude_depth: 1.5,
	      //textureMap: albumCoverTexture,
	      //textureMapOffset: new THREE.Vector2(0.2,0.5),
	      //textureMapScale: new THREE.Vector2(5,5),
	      color: logo.color,
	      //color: function (i){return new THREE.Color().setHSL( 0.5+0.15*Math.random(), 0.5+0.5*Math.random(), 0.0 );}
	    }
	];

	function logoClick(obj){
	    console.log(logo.filename);
	    if (obj.currentMorphDescId == 1)
		logo.onclick(obj);
	}
	
	morph_logo_point_cloud.push(new morphPointCloud(SoMeLogoPoints, 0.01, 0xffffe0, 'assets/heart.png', logoClick, renderer, camera));
	morph_logo_point_cloud[morph_logo_point_cloud.length-1].load(logo_pointcloud_desc).then(
	    function (obj) {
		obj.layers.enable( BLOOM_SCENE );
		obj.position.copy(new THREE.Vector3(0,6,0).applyAxisAngle(z_axis, i*angle_delta).add(new THREE.Vector3(0/*0.5*/,0/*0.15*/,0)));
		//scene.add(obj);
	    }
	);
	
    });
    
    const pointcloud_descriptor = [
	{ geometry: starsGeom[SoMeLogos.length],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	},
	{ geometry: starsSpiralGeom[SoMeLogos.length],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	},
	{ geometry: holon_logo_obj.geometry,
	  pos:new THREE.Vector3(0,0,0),
	  rotate: new THREE.Vector3(0,0,0),
	  scale: new THREE.Vector3(3,3,3),
	  textureMap: albumCoverTextureNonCropped,
	  textureMapOffset: new THREE.Vector2(0.33,0.33),
	  textureMapScale: new THREE.Vector2(3,3),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER | morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE
	},
	{ filename: "assets/heart.glb",
	  pos:new THREE.Vector3(0,0,0),
	  rotate: new THREE.Vector3(0,0,0),
	  scale: new THREE.Vector3(2,2,2),
	  pos_noise: 0.05,
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER | morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE
	},
	{ filename: "assets/mandala.png",
	  width: 10,
	  height: 10,
	  depth: 0,
	  threshold: 300,
	  invert:false,
	  pos:new THREE.Vector3(0,0,0),
	  pos_noise: 0.5,
	  normalise: true,
	  rotate: new THREE.Vector3(0,0,0),
	  textureMap: irisTexture,
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER
	},
	{ filename: "assets/jellyfish_001.glb",
	  pos:new THREE.Vector3(0,0,0),
	  rotate: new THREE.Vector3(/*Math.PI/2*/0,0,-Math.PI/2),
	  scale: new THREE.Vector3(1,1,1),
	  pos_noise: 0.05,
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER | morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE
	},
	{ filename: "assets/brain.glb",
	  pos:new THREE.Vector3(0,0,0),
	  rotate: new THREE.Vector3(/*Math.PI/2*/0,0,0),
	  scale: new THREE.Vector3(2,2,2),
	  pos_noise: 0.02,
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER | morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE
	},

	{ filename: "assets/ScaryMaria.png",
	  invert:false,
	  pos:new THREE.Vector3(0,0,0),
	  pos_noise: 1,
	  normalise: true,
	  rotate: new THREE.Vector3(/*Math.PI/2*/0,0,0),
	  scale: new THREE.Vector3(0.3,0.3,1.0),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER
	},
	//{ webcam: true, invert: false, pos:new THREE.Vector3(0,0,6), normalise: false, rotate: new THREE.Vector3(/*Math.PI/2*/0,0,0),scale: new THREE.Vector3(0.15,0.15,1.0), threshold: 256},
	{ filename: "assets/linea.mp4",
	  intensity_scale: 1,
	  normalise: false,
	  pos:new THREE.Vector3(0,0,0),
	  pos_noise: 1,
	  rotate: new THREE.Vector3(0,0,0),
	  threshold: 512,
	  scale: new THREE.Vector3(0.3,0.3,1.0),
	  extrude_depth: 1,
	  displacementMap: audioTexture.texture[3],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE
	}
    ]


    morph_point_cloud = new morphPointCloud(pointcloud_points, 0.01, 0xffffe0, 'assets/heart.png');
    morph_point_cloud.load(pointcloud_descriptor).then(
	function (obj) {
	    pointcloud = obj
	    pointcloud.layers.enable( BLOOM_SCENE );
	    pointcloud.position.z = 0;
	    pointcloud_pivot.add(pointcloud);
	    //scene.add(pointcloud_pivot);
	    pointCloudMove = new MOVE(morph_point_cloud);
	    //startCoreography();
	}
    );

    const cover_dim = 512;
    const holon_logo_obj2 = new holonLogoGeometry(0xffffff, true, 2, new THREE.Vector3(0, 0, 0), 32, 128)
    holon_logo_obj2.geometry.deleteAttribute("color"); 
    const cover_pointcloud_descriptor = [
	{ geometry: holon_logo_obj2.geometry,
	  pos:new THREE.Vector3(0,0,5),
	  pos_noise: 0.01,
	  scale: new THREE.Vector3(4, 4, 4),
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	},
	{ filename: "assets/samsara-cover-2.png",
	  pos:new THREE.Vector3(0,0,5),
	  colorCloud: true,
	  tileDim: 1,
	  pos_noise: 3,
	  point_space_ratio: 0.1,
	  displacementMap: coverDepthTexture,
	  displacementMapFlags: 0*morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + 0*morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING + 1*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	  displacementMapScale: 2
	},
    ]

    cover_point_cloud = new morphPointCloud(cover_dim**2, 0.02, 0xffffe0, 'assets/heart.png');
    cover_point_cloud.load(cover_pointcloud_descriptor).then(
	function (obj) {
	    obj.layers.enable( BLOOM_SCENE );
	    scene.add(obj);
	}
    );

    const font_params =
	  { size: 0.5,
	    depth: 0,
	    curveSegments: 2,
	    bevelEnabled: false,
	    bevelThickness: 1,
	    bevelSize: 1,
	    bevelOffset: 0,
	    bevelSegments: 5
	  };
    
    var text_geometry = [await TextCloudGeometry.factory('"A trippy blast of metallic post-prog, a la prime Tool, with hints of Radiohead" - Glide Magazine',
							 "assets/Terminal Dosis_Regular.json",
							 0.02,
							 font_params,
							 new THREE.EllipseCurve(0,0,9,9,1.5*Math.PI,0.5*Math.PI,true,-Math.PI/2)
							),
			 await TextCloudGeometry.factory('"The debut album by Holon is my favourite of the year so far" - Prog Rock Stuff',
							 "assets/Terminal Dosis_Regular.json",
							 0.02,
							 font_params,
							 new THREE.EllipseCurve(0,0,9,9,1.5*Math.PI,0.5*Math.PI,true,-Math.PI/2)
							),
			 await TextCloudGeometry.factory('"Meticulously constructed from the ground up, the tracks on this album, perhaps inevitably, resemble the dramatic intricacy of sand mandalas made audio" -Stereo Embers Magazine',
							 "assets/Terminal Dosis_Regular.json",
							 0.02,
							 font_params,
							 new THREE.EllipseCurve(0,0,9,9,1.9*Math.PI,0.1*Math.PI,true,-Math.PI/2)
							),
			];


    const pointcloud_descriptor_dekor_inner = [	
	{ geometry: starsGeom[SoMeLogos.length+1],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	},
	{ geometry: starsSpiralGeom[SoMeLogos.length+1],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	}];

    text_geometry.forEach( (geom) => {
	dekorPointsInner = Math.max(dekorPointsInner, geom.attributes.position.count);
	pointcloud_descriptor_dekor_inner.push(
	    { geometry: geom, 
	      pos:new THREE.Vector3(0,0,3),
	      textureMap: irisTexture,
	      pos_noise: 0.1,
	      color: new THREE.Color(0xffffff),
	    }
	);
	
    });

    pointcloud_descriptor_dekor_inner.push(    
	{ filename: "assets/holon_dekor_outline_inner.png",
	  invert:true,
	  pos:new THREE.Vector3(0,0,0),
	  normalise: true,
	  pos_noise: 0.1,
	  scale: new THREE.Vector3(0.07,0.07,0.07),
	  depth: 0.1,
	  extrude_depth: 5,
	  textureMap: irisTexture,
	  textureMapOffset: new THREE.Vector2(0,0,0),
	  textureMapScale: new THREE.Vector2(1,1),
	  //color: new THREE.Color(0x566F67),
	  displacementMap: audioTexture.texture[2],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING
	});

    

    const pointcloud_descriptor_dekor_outer = [	
	{ geometry: starsGeom[SoMeLogos.length+2],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	},
	{ geometry: starsSpiralGeom[SoMeLogos.length+2],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	},
	{ filename: "assets/holon_dekor_outline_outer.png",
	  invert:true,
	  pos:new THREE.Vector3(0,0,3),
	  normalise: true,
	  pos_noise: 0.1,
	  scale: new THREE.Vector3(0.04,0.04,0.04),
	  depth: 0.1,
	  extrude_depth: 5,
	  textureMap: irisTexture,
	  textureMapOffset: new THREE.Vector2(0,0,0),
	  textureMapScale: new THREE.Vector2(1,1),
	  displacementMap: audioTexture.texture[2],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING
	},
    ];

    const pointcloud_descriptor_dekor_middle = [	
	{ geometry: starsGeom[SoMeLogos.length+3],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),	
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	},
	{ geometry: starsSpiralGeom[SoMeLogos.length+3],
	  pos:new THREE.Vector3(0,0,0),
	  textureMap: albumCoverTexture,
	  rotate: new THREE.Vector3(0,0,0),	
	  displacementMap: audioTexture.texture[0],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER /*| morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE*/,
	  displacementMapScale: 10
	},
	{ filename: "assets/holon_dekor_outline_middle.png",
	  invert:true,
	  pos:new THREE.Vector3(0,0,3),
	  normalise: true,
	  pos_noise: 0.1,
	  scale: new THREE.Vector3(0.04,0.04,0.04),
	  depth: 0.1,
	  extrude_depth: 5,
	  textureMap: irisTexture,
	  textureMapOffset: new THREE.Vector2(0,0,0),
	  textureMapScale: new THREE.Vector2(1,1),
	  displacementMap: audioTexture.texture[2],
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING
	},
    ];

    morph_point_cloud_dekor[0] = new morphPointCloud(dekorPointsOuter, 0.01, 0xffffe0, 'assets/heart.png');
    morph_point_cloud_dekor[0].load(pointcloud_descriptor_dekor_outer).then(
	function (obj) {
	    obj.layers.enable( BLOOM_SCENE );
	    //scene.add(obj);
	    
	}
    );

    morph_point_cloud_dekor[1] = new morphPointCloud(dekorPointsInner, 0.01, 0xffffe0, 'assets/heart.png');
    morph_point_cloud_dekor[1].load(pointcloud_descriptor_dekor_inner).then(
	function (obj) {
	    obj.layers.enable( BLOOM_SCENE );
	    //scene.add(obj);
	    const innerDekorMove = new MOVE(obj);
	    //innerDekorMove
	    //		.to(centerVec3, new THREE.Vector3(0,0,-2*Math.PI), 120)
	    //		.loop(1)
	    //		.start()
	}
    );

    morph_point_cloud_dekor[2] = new morphPointCloud(dekorPointsMiddle, 0.01, 0xffffe0, 'assets/heart.png');
    morph_point_cloud_dekor[2].load(pointcloud_descriptor_dekor_middle).then(
	function (obj) {
	    obj.layers.enable( BLOOM_SCENE );
	    //scene.add(obj);
	    const middleDekorMove = new MOVE(obj);
	    /*middleDekorMove
		.to(centerVec3, new THREE.Vector3(0,0,-2*Math.PI), 120)
		.loop(1)
		.start()*/
	}
    );
}


const pivot2_rotate_axis = new THREE.Vector3(Math.cos(Math.PI/4), Math.sin(Math.PI/4));

var rotate = false;
var morphEvent = null;


const darkMaterial = new THREE.MeshBasicMaterial( { color: 'black'} );
const darkPointMaterial = new THREE.PointsMaterial( { color: 'black', size: 0.01 } );
const materials = {};

function darkenNonBloomed( obj ) {
    if ( (obj.isMesh || obj.isPoints) &&  bloomLayer.test( obj.layers ) === false ) {
	materials[ obj.uuid ] = obj.material;
	obj.visible = false;
    } 
}

function restoreMaterial( obj ) {
    if ( materials[ obj.uuid ] ) {
	obj.visible = true;
	delete materials[ obj.uuid ];
    }
}

const x_unit = new THREE.Vector3(1,0,0);
const y_unit = new THREE.Vector3(0,1,0);
const z_unit = new THREE.Vector3(0,0,1);


function alignLogoToCamera(t){
    morph_logo_point_cloud.forEach( (mo, i) => {
	if (mo.currentMorphDescId == 2){
	    mo.lookAt(camera.position);

	    const mo_z_unit_world = mo.localToWorld(z_unit.clone()).sub(mo.position);
	    const mo_x_unit_world = mo.localToWorld(x_unit.clone()).sub(mo.position);
	    const camera_y_unit_world = camera.localToWorld(y_unit.clone()).sub(camera.position);

	    // Find the intersection of the xy plane of the morph object and xz plane of the camera
	    // as this will give the direction of the x-axis of the morph object when it is rorated
	    // around the z-axis to align with the camera.
	    // This vector is given by the cross products of the normal vectors of the plane so
	    // the z-axis of the morph object and y-axis of the camera object.
	    const intersect_vector = new THREE.Vector3().crossVectors(camera_y_unit_world, mo_z_unit_world);

	    // We can now find the angle between the vectors
	    var rotate_angle_z = mo_x_unit_world.angleTo(intersect_vector);
	    // We do need to know which way to rotate to get the morph object x-axis aligned to this vector
	    // We know that both vectors are in the xy-plane of the morph object so do a cross product
	    const cross_intersect_mo_x_axis = new THREE.Vector3().crossVectors(intersect_vector, mo_x_unit_world);
	    const cross_intersect_mo_x_axis_mo_local = mo.worldToLocal(cross_intersect_mo_x_axis.clone().add(mo.position));
	    // If cross product is positive in the z-axis then we must do a negative angle rotation
	    if (cross_intersect_mo_x_axis_mo_local.z > 0)
		rotate_angle_z = -rotate_angle_z;
	    
	    mo.rotateZ(rotate_angle_z);
	    mo.rotateY(0.002*t+Math.PI*i/4);
	    //mo.rotateY(Math.sin(0.003*t)*Math.PI/36);
	    //mo.rotateX(Math.cos(0.003*t)*Math.PI/36);
	} else {
	    mo.rotation.setFromVector3(new THREE.Vector3(0, 0, 0));
	}
    });
}

const cameraMove = new MOVE(camera);

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
	pointcloud_pivot.rotation.x = -Math.PI/2 + 0.2*Math.sin(0.001*t);
	pointcloud_pivot.rotation.y = 0.2*Math.sin(0.001*t);
	cover_sphere.rotation.z += delta/2;
	cover_sphere.rotation.x -= delta/4;
	cover_sphere.rotation.y -= delta/8;
    }
    //dekor.rotation.z += delta/2;
    //dekor.rotation.x += delta/4;
    //dekor.rotation.y += delta/8;

    if (morphEvent !== null){
	morph_point_cloud.morphTo(morphEvent, TWEEN.Easing.Circular.InOut, 5000);
	morph_logo_point_cloud.forEach( (mo) => { mo.morphTo(morphEvent, TWEEN.Easing.Circular.InOut, 5000)});
	morph_point_cloud_dekor.forEach( (mo) => { mo.morphTo(morphEvent, TWEEN.Easing.Circular.InOut, 5000)});
	const enableBloom = morphEvent == 0;
	cover_point_cloud.morphTo(morphEvent, TWEEN.Easing.Circular.InOut, 5000,
				  function (){
				      //if (enableBloom)
				      //cover_point_cloud.layers.enable(BLOOM_SCENE);
				      new TWEEN.Tween(bloomPass)
					  .to({strength: (enableBloom ? 0.5 : 0)}, 5000)
				          .onComplete(() => {
					      //if (!enableBloom)
					      //cover_point_cloud.layers.disable(BLOOM_SCENE);
					  })
					  .start()
				  });
	morphEvent = null;
    }

    morphPointCloud.updateAll();
    alignLogoToCamera(t);
    
    TWEEN.update();
    //renderer.render(scene, camera);
    
    scene.traverse( darkenNonBloomed );
    bloomComposer.render();
    scene.traverse( restoreMaterial );
    finalComposer.render();

    if (audioTexture){
	audioTexture.updateTexture();
    }

    MOVE.update();
    
    //light.map.rotation = time;
    //light.map.needsUpdate = true;
    requestAnimationFrame( animate );
    //logo_sine_wave1.rotation.y -= 0.01;
    //logo_sine_wave1.rotation.x -= 0.01;
    //logo_sine_wave1.scale.set(logo_scale, logo_scale, logo_scale);
    //camera.lookAt(logo_sine_wave1.position);
    
    
};

makePointCloud();

function startCoreography(){
    cameraMove.
	to([new THREE.Vector3(4,2,0),
	    new THREE.Vector3(0,-2,-4),
	    new THREE.Vector3(-4,2,0),
	    new THREE.Vector3(0,0,4)], 10, 0, null /*new THREE.Euler(0, 0, 0, 'XYZ')*/, TWEEN.Easing.Quadratic.InOut).
    to(new THREE.Vector3(0,0,10), 10, 0, new THREE.Euler(0, 0 , 0/*Math.PI, 4*Math.PI, 'XYZ'*/), TWEEN.Easing.Quadratic.Out);
    
    pointCloudMove.run( function (obj)
			{
			    obj.morphTo(2, TWEEN.Easing.Circular.InOut, 5000);    
			}, 15);
}

animate();


document.addEventListener("keypress", onKeypress);

function onKeypress(event){
    //console.log(event.key);

    if (event.key == " "){	
	rotate = !rotate;
    } else if (!isNaN(Number(event.key))) {
	morphEvent = Number(event.key);
    }
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
