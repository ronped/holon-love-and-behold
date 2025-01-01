import * as THREE from 'three';
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from '@tweenjs/tween.js';
import { holonLogoGeometry } from "../libs/holon_logo.js";
import { morphPointCloud, morphLineCloud } from "../libs/morph_point_cloud.js";
import { StarGeometry } from "../libs/star_geometry.js";
import { TextCloudGeometry } from "../libs/text_cloud_geometry.js";
import { Audio2Texture } from "../libs/audio2texture.js";
import { MOVE } from "../libs//move.js";
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


/*********************************************************

  Set some variable used throughout
    
***********************************************************/

const min_x_axis_visible = 7;
const min_y_axis_visible = 9;
const camera_fov = 85;

function getCameraCenterDistance(){
    const hor_fov = camera_fov*camera.aspect;
    const camera_distance_vert = min_y_axis_visible/Math.tan(camera_fov*2*Math.PI/(2*360));
    const camera_distance_hor = min_x_axis_visible/Math.tan(hor_fov*2*Math.PI/(2*360));

    return Math.max(camera_distance_vert, camera_distance_hor);
}

/*********************************************************

  Camera, Scene and renderer
    
***********************************************************/

// create camera
var camera = new THREE.PerspectiveCamera( camera_fov, window.innerWidth/window.innerHeight, 0.1, 100 );
camera.position.set(0.0,0.0,getCameraCenterDistance(window.innerWidth/window.innerHeight));

// create a scene
var scene = new THREE.Scene();

// create renderer
var renderer = new THREE.WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.toneMappingExposure = 1;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild( renderer.domElement );




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

//const gui = new GUI();
//const bloomFolder = gui.addFolder( 'bloom' );


function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.position.z = getCameraCenterDistance();
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth, window.innerHeight );
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
    finalComposer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onWindowResize );

const darkMaterial = new THREE.MeshBasicMaterial( { color: 'black'} );
const darkPointMaterial = new THREE.PointsMaterial( { color: 'black', size: 0.01 } );
const materials = {};

function darkenNonBloomed( obj ) {
    if ( (obj.isMesh || obj.isPoints) &&  bloomLayer.test( obj.layers ) === false ) {
	darkMaterial.opacity = obj.material.opacity;
	darkMaterial.transparent = obj.material.transparent;
	darkMaterial.visible = obj.material.visible;
	materials[ obj.uuid ] = obj.material;
	//obj.visible = false;
	obj.material = darkMaterial;
    } 
}

function restoreMaterial( obj ) {
    if ( materials[ obj.uuid ] ) {
	//obj.visible = true;
	obj.material = materials[ obj.uuid ];
	delete materials[ obj.uuid ];
    }
}

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

var audioTexture;
var cover_point_cloud;
var cover_point_cloud_move;
var cover;
const coverDepthTexture = new THREE.TextureLoader().load("../assets/samsara-cover-2-depth.png");
const coverTexture = new THREE.TextureLoader().load("../assets/samsara-cover-2.png");
const dekorTexture = new THREE.TextureLoader().load("../assets/holon_dekor_outline.jpg");
coverTexture.colorSpace = THREE.SRGBColorSpace;

async function makePointCloud(){

    //
    //  Audio Texture for depth
    //
    const audioTexDescriptor = [
	{ type: Audio2Texture.LEVEL, level_iir_filter: true},
    ];
    
    audioTexture = new Audio2Texture("../assets/Samsara-Teaser.mp3", 60, audioTexDescriptor, 1024, 1024, true, 0.5, 0.1);
    
       
    //
    //  End text geometry
    //
    const font_params =
	  { size: 0.8,
	    depth: 0.2,
	    curveSegments: 2,
	    bevelEnabled: false,
	    bevelThickness: 1,
	    bevelSize: 1,
	    bevelOffset: 0,
	    bevelSegments: 5
	  };
    
    const text_geom = await TextCloudGeometry.factory('New single coming\n 6th of December!',
						      "../assets/Terminal Dosis_Regular.json",
						      0.02,
						      font_params);
    // Center text
    text_geom.computeBoundingBox();
    const text_geom_x_pos_move = -(text_geom.boundingBox.max.x - text_geom.boundingBox.min.x)/2 

    //
    //  Holon logo
    //
    const holon_logo_obj = new holonLogoGeometry(0xffffff, true, 2, new THREE.Vector3(0, 0, 0), 32, 128)
    holon_logo_obj.geometry.deleteAttribute("color"); 

    const cover_dim = 512;

    //
    //  Holon logo
    //
    const sphere_geom = new THREE.SphereGeometry( 15, cover_dim, cover_dim );
    const position = sphere_geom.getAttribute("position");
    const normal = sphere_geom.getAttribute("normal");
    const vec3 = new THREE.Vector3();
    for (let i=0; i<position.count; i++){
	vec3.randomDirection().multiplyScalar(30*Math.pow(Math.random(),1/3));
	position.setXYZ(i, vec3.x, vec3.y, vec3.z);
	normal.setXYZ(i, vec3.x, vec3.y, vec3.z);
    }
    
    const cover_pointcloud_descriptor = [
	// Add the cover first so that we can use the colors from the points for other morph shapes
	{ filename: "../assets/samsara-cover-2.png",
	  pos:new THREE.Vector3(0,0,0),
	  rotate:new THREE.Vector3(-Math.PI/2,0,0),
	  colorCloud: true,
	  randPosOrder: true,
	  tileDim: 1,
	  pos_noise: 3,
	  point_space_ratio: 0.1,
	  displacementMap: coverDepthTexture,
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ENABLE,
	  displacementMapScale: 1
	},
	{ geometry: sphere_geom,
	  randPosOrder: true,
	  pos:new THREE.Vector3(0,0,0),
	  pos_noise: 0.1,
	  scale: new THREE.Vector3(1, 1, 1),
	  //textureMap: dekorTexture,
	  //textureMapScale: new THREE.Vector2(1,1),
	  displacementMapFlags: 1*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	  alpha: 1.0,
	  color: function (i, obj) {
	      const colorAttr = obj.geometry.getAttribute('color');
	      return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
	  }
	},
	{ geometry: holon_logo_obj.geometry,
	  randPosOrder: true,
	  pos:new THREE.Vector3(0,0,0),
	  pos_noise: 0.01,
	  scale: new THREE.Vector3(4, 4, 4),
	  alpha: 1.0,
	  color: function (i, obj) {
	      const colorAttr = obj.geometry.getAttribute('color');
	      return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
	  },
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	},
	{ geometry: text_geom,
	  randPosOrder: true,
	  rotate:new THREE.Vector3(-Math.PI/2,0,0),
	  pos:new THREE.Vector3(text_geom_x_pos_move, camera.aspect < 0.75 ? 4.5 : -2,3),
	  pos_noise: 0.01,
	  scale: new THREE.Vector3(1, 1, 1),
	  color: function (i, obj) {
	      const colorAttr = obj.geometry.getAttribute('color');
	      return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
	  },
	  displacementMapFlags: 0*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	},
    ]

    cover_point_cloud = new morphPointCloud(cover_dim**2, 0.02, 0xffffe0, 1.0, '../assets/heart.png');
    cover_point_cloud.load(cover_pointcloud_descriptor, 1).then(
	function (obj) {
	    obj.layers.enable( BLOOM_SCENE );
	    scene.add(obj);
	    cover_point_cloud_move = new MOVE(obj, false, true);

	    const morph_cover_width =
		  obj.cloudBounds.lowerLeftCorner.value[obj.getMorphId(0)+1].clone()
		  .sub(obj.cloudBounds.lowerRightCorner.value[obj.getMorphId(0)+1]).length();
	    const morph_cover_height =
		  obj.cloudBounds.lowerLeftCorner.value[obj.getMorphId(0)+1].clone()
		  .sub(obj.cloudBounds.upperLeftCorner.value[obj.getMorphId(0)+1]).length();
	    
	    const cover_frame_descr = [{ filename: "../assets/cover-frame.png",
					 pos:new THREE.Vector3(0,0,0),
					 rotate:new THREE.Vector3(-Math.PI/2,0,0),
					 height: morph_cover_height,
					 width: morph_cover_width,
					 randPosOrder: true,
					 colorCloud: false,
					 tileDim: 1,
					 pos_noise: 3,
					 color: function (i, obj) {
					     const colorAttr = obj.geometry.getAttribute('color');
					     return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
					 },
					 point_space_ratio: 0.1,
				       },
				       { filename: "../assets/white-dove.mp4",
					 pos:new THREE.Vector3(-5, camera.aspect < 0.75 ? 6.5 : 2 ,1),
					 scale: new THREE.Vector3(0.03, 0.03, 0.03),
					 rotate:new THREE.Vector3(-(4/5)*Math.PI/2,0,0),
					 threshold: 30,
					 normalise: true,
					 randPosOrder: false,
					 tileDim: 1,
					 pos_noise: 1,
					 color: function (i, obj) {
					     const colorAttr = obj.geometry.getAttribute('color');
					     return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
					 },
					 point_space_ratio: 0.1,
				       }
				      ];

	    obj.load(cover_frame_descr);

	    const cover_plane = new THREE.PlaneGeometry( morph_cover_width, morph_cover_height );
	    cover_plane.translate(0, 0, -0.2);
	    cover_plane.rotateX(-Math.PI/2);
	    
	    const cover_material = new THREE.MeshBasicMaterial( {color: 0xffffff,
								 side: THREE.DoubleSide,
								 map: coverTexture,
								 transparent: true,
								 opacity: 0,
								 visible: false
								} );
	    cover = new THREE.Mesh( cover_plane, cover_material );
	    cover.layers.disable( BLOOM_SCENE );
	    scene.add(cover);
	}
    );

    
}




const x_unit = new THREE.Vector3(1,0,0);
const y_unit = new THREE.Vector3(0,1,0);
const z_unit = new THREE.Vector3(0,0,1);

const cameraMove = new MOVE(camera);
var cover_depth_scale = {value: 2};
var capturer;

var morphEvent = null;

var animate = async function () {
    if (morphEvent !== null){
	const enableBloom = morphEvent != 0;
	cover_point_cloud.morphTo(morphEvent, TWEEN.Easing.Circular.InOut, cover_point_cloud.currentMorphDescId == 1 ? 1000 : 5000,
				  function (){
				      new TWEEN.Tween(bloomPass)
					  .to({strength: (enableBloom ? 0.75 : 0)}, 5000)
				          .onComplete(() => {
					  })
					  .start()
				  });
	morphEvent = null;
    }

    await morphPointCloud.updateAll();
    await morphLineCloud.updateAll();
    if (audioTexture){
	audioTexture.updateTexture();
	if (cover_point_cloud)
	    cover_point_cloud.displacementMapScale.value[0] = cover_depth_scale.value*audioTexture.texture[0].image.data[0];
    }

    MOVE.update();
    
    TWEEN.update();
    scene.traverse( darkenNonBloomed );
    bloomComposer.render();
    scene.traverse( restoreMaterial );
    finalComposer.render();

    requestAnimationFrame( animate );
    if (capturer){
	capturer.capture(renderer.domElement);
    }
};

makePointCloud();

function startCoreography(capture=false){
    const roll_offset = 1;
    const halfpi = Math.PI/2;
    const delta_angle = 0.05;
    const bird_move_pos = {z: -4*Math.max(1, 1/camera.aspect),y:1};
    
    if (capture){
	capturer = new CCapture( {
	    format: "webm",
	    quality: 100,
	    width: 1080,
	    height: 1920,
	    framerate: 30,
	    verbose: true,
	    display: true} );
	capturer.start();
    }
	
    cameraMove
    // 0-11s: Initial circular camera movement 
	.to(new THREE.Vector3(0,roll_offset,camera.position.z),
	    cover_point_cloud,
	    1,4)
	.to([new THREE.Vector3(roll_offset,0,camera.position.z),
	     new THREE.Vector3(0,-roll_offset,camera.position.z),
	     new THREE.Vector3(-roll_offset,0,camera.position.z),
	     new THREE.Vector3(0,roll_offset,camera.position.z)],
	    cover_point_cloud,
	    5, 0)
	.to(new THREE.Vector3(0,0,camera.position.z),
	    cover_point_cloud,
	    1,0)
    // 11-39s: Move over to look down at cover 
	.to([new THREE.Vector3( -3, 2, 5 ),
	     new THREE.Vector3( -7, 2, 0 ),
	     new THREE.Vector3( 0, 2, -8 ),
	     new THREE.Vector3( 7, 3.5, 0 ),
	     new THREE.Vector3( 3, 5, 5 ),
	     new THREE.Vector3().setFromSpherical(new THREE.Spherical(camera.position.z, (1/5)*halfpi, 0))],
	    cover_point_cloud,
	    28, 0, TWEEN.Easing.Linear.None)
    // 43-49: Move over to look down at cover 
	.to(new THREE.Vector3().setFromSpherical(new THREE.Spherical(camera.position.z, (1/5)*halfpi+delta_angle, 0)),
	    cover_point_cloud,
	    1,4)
	.to([new THREE.Vector3().setFromSpherical(new THREE.Spherical(camera.position.z, (1/5)*halfpi, delta_angle)),
	     new THREE.Vector3().setFromSpherical(new THREE.Spherical(camera.position.z, (1/5)*halfpi-delta_angle, 0)),
	     new THREE.Vector3().setFromSpherical(new THREE.Spherical(camera.position.z, (1/5)*halfpi, -delta_angle)),
	     new THREE.Vector3().setFromSpherical(new THREE.Spherical(camera.position.z, (1/5)*halfpi+delta_angle, 0))],
	    cover_point_cloud,
	    5, 0)
    // 66: stop capture
	.run( () => {
	    if (capture){
		capturer.stop();
		capturer.save()
	    }}, 17) 
	.start()

    cover_point_cloud_move
    // 0s: Initial spin
	.run( (obj) => {
	    new TWEEN.Tween(obj.rotation)
		.to({y: 2*Math.PI}, 5000)
		.easing(TWEEN.Easing.Circular.InOut)
		.start();
	}, 0)
    // 3s: Start Audio
	.run( (obj) => { audioTexture.start(capture)}, 3)
    // 3s: Morph to logo
	.run( (obj) => { obj.morphTo(2, TWEEN.Easing.Cubic.In, 2000)}, 0)
    // 9s: Morph to cover and diable bloom
	.run( (obj) => {
	    obj.morphTo(0, TWEEN.Easing.Circular.InOut, 5000,
			() => {
			    new TWEEN.Tween(bloomPass)
				.to({strength: 0}, 5000)
				.onComplete(() => {
				})
				.start()
			})}, 6)
    // 39s: Morph to frame - make real cover visible
    	.run( (obj) => {
	    obj.morphTo(4, TWEEN.Easing.Circular.InOut, 5000,
			() => {
			    new TWEEN.Tween(bloomPass)
				.to({strength: 0.75}, 5000)
				.onComplete(() => {
				})
				.start()
			});
	    new TWEEN.Tween(cover_depth_scale)
		.to({value: 0}, 3000)
		.start();
	    cover.material.visible = true;
	    new TWEEN.Tween(cover.material)
		.to({opacity: 1}, 5000)
		.start();
	}, 30)
    // 46s: Morph to final text
    	.run( (obj) => {
	    obj.morphTo(3, TWEEN.Easing.Circular.InOut, 5000,
			() => {
			    new TWEEN.Tween(bloomPass)
				.to({strength: 0.75}, 5000)
				.onComplete(() => {
				})
				.start()
			})}, 7)
    // 54s: Morph to phoenix
    	.run( (obj) => {
	    obj.morphTo(5, TWEEN.Easing.Circular.InOut, 5000,
		       	() => {
			    new TWEEN.Tween(bloomPass)
				.to({strength: 0.5}, 5000)
				.start()}
			);
	    new TWEEN.Tween(obj.position)
		.to(bird_move_pos, 10000)
		.easing(TWEEN.Easing.Cubic.In)
		.start()
	}, 8)
    // 62s: Start fading out morph object
    	.run( (obj) => {
	    new TWEEN.Tween(obj.material)
		.to({opacity: 0}, 4000)
		.start();
	}, 8)
    // 66s: Stop video
    	.run( (obj) => {
	    obj.descriptor[5].video.pause();
	}, 4)
    
	.start();
}

animate();

document.addEventListener("keypress",
			  function (event) {
			      if (!isNaN(Number(event.key))) {
				  morphEvent = Number(event.key);
			      } else if (event.key == 'p'){
				  startCoreography(false);
			      } else if (event.key == 'r'){
				  startCoreography(true);
			      } else if (event.key == 'c'){
				  capturer = new CCapture( {
				      format: "webm",
				      quality: 100,
				      width: 1920,
				      height: 1080,
				      framerate: 30,
				      verbose: true,
				      display: true} );
				  capturer.start();
			      } else if (event.key == 's'){
				  capturer.stop();
				  capturer.save();
			      }
			  });

renderer.domElement.addEventListener('click',
				     function (event) {
					 //startCoreography();
				     }, false);
