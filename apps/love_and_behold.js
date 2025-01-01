import * as THREE from 'three';
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from '@tweenjs/tween.js';
import { holonLogoGeometry } from "../libs/holon_logo.js";
import { morphPointCloud, morphLineCloud } from "../libs/morph_point_cloud.js";
import { StarGeometry } from "../libs/star_geometry.js";
import { FBMGeometry } from "../libs/fbm_geometry.js";
import { TextCloudGeometry } from "../libs/text_cloud_geometry.js";
import { Audio2Texture } from "../libs/audio2texture.js";
import { MOVE, CurveFunction } from "../libs//move.js";
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
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water2.js';
import 'jquery';


/*********************************************************

  Default loading manager
    
***********************************************************/

var loadingManagerDone = false;
THREE.DefaultLoadingManager.onStart = function ( url, itemsLoaded, itemsTotal ) {
	console.log( 'Started loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );
};

THREE.DefaultLoadingManager.onLoad = function ( ) {
    loadingManagerDone = true;
};

THREE.DefaultLoadingManager.onProgress = function ( url, itemsLoaded, itemsTotal ) {
	console.log( 'Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );
};

THREE.DefaultLoadingManager.onError = function ( url ) {
	console.log( 'There was an error loading ' + url );
};


/*********************************************************

  Set some variable used throughout
    
***********************************************************/

const min_x_axis_visible = 15;
const min_y_axis_visible = 15;
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
var camera = new THREE.PerspectiveCamera( camera_fov, window.innerWidth/window.innerHeight, 0.1, 20000 );
camera.position.set(0.0,0.1,getCameraCenterDistance(window.innerWidth/window.innerHeight));

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
const darkMaterials = {};

function darkenNonBloomed( obj ) {
    if (bloomLayer.test( obj.layers ) === false){
	if (obj.isPoints || obj.isLine){
	    if (!darkMaterials[obj.uuid]){
		const darkMaterial = obj.material.clone();
		darkMaterial.defines = darkMaterial.defines || {};
		darkMaterial.defines.DARKEN_BLOOM = 1;
		darkMaterial.onBeforeCompile = obj.material.onBeforeCompile;
		darkMaterial.needsUpdate = true;
		darkMaterials[obj.uuid] = darkMaterial;
	    }
	    materials[ obj.uuid ] = obj.material;
	    obj.material = darkMaterials[obj.uuid];
	} else if ( (obj.isMesh || obj.isPoints || obj.isLine) &&  bloomLayer.test( obj.layers ) === false ) {
	    darkMaterial.opacity = obj.material.opacity;
	    darkMaterial.transparent = obj.material.transparent;
	    darkMaterial.visible = obj.material.visible;
	    materials[ obj.uuid ] = obj.material;
	    var configUniform;
	    if (obj.material.uniforms && obj.material.uniforms.config)
	    configUniform = obj.material.uniforms.config;
	    obj.material = darkMaterial;
	    if (configUniform)
		obj.material.uniforms = { config: configUniform};
	}
    }
}

function restoreMaterial( obj ) {
    if ( materials[ obj.uuid ] ) {
	obj.material = materials[ obj.uuid ];
	delete materials[ obj.uuid ];
    }
}


/*********************************************************

 Sky
  
***********************************************************/

const skyParameters = {
    sunPosition: 2.3,
    sunElevation: Math.PI/2,
    turbidity: 10,
    rayleigh: 6.3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.5
};

const gui = new GUI();

const folderSky = gui.addFolder( 'Sky' );
folderSky.add( skyParameters, 'sunPosition', 0, 2*Math.PI, 0.1 )
folderSky.add( skyParameters, 'sunElevation', Math.PI/2 - 0.2, Math.PI/2 + 0.2, 0.01 )
folderSky.add( skyParameters, 'turbidity', 0, 100, 0.1 )
folderSky.add( skyParameters, 'rayleigh', 0, 10, 0.1 )
folderSky.add( skyParameters, 'mieCoefficient', 0, 1, 0.005 )
folderSky.add( skyParameters, 'mieDirectionalG', 0, 1, 0.01 )


const sky = new Sky();
sky.scale.setScalar( 10000 );

const phi = Math.PI / 2.0;
const theta = Math.PI;
const sunPosition = new THREE.Vector3().setFromSphericalCoords( 1, phi, theta );

sky.material.uniforms.sunPosition.value = sunPosition;

scene.add( sky );


const waterGeometry = new THREE.PlaneGeometry( 1000, 1000 );

var water = new Water( waterGeometry, {
    color: 0xffffff,
    scale: 1.0,
    flowDirection: new THREE.Vector2( 0.1, 0.1),
    textureWidth: 1024,
    textureHeight: 1024,
    normalMap0: new THREE.TextureLoader().load("../assets/Water_1_M_Normal.jpg",function ( texture ) {
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }),
    normalMap1: new THREE.TextureLoader().load("../assets/Water_2_M_Normal.jpg",function ( texture ) {
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    })
} );

water.rotation.x = Math.PI * - 0.5;
scene.add( water );

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
var fog_point_cloud;
var fog_point_cloud_move;
var lyricsLineCloud;
var cover_point_cloud_move;
var lyricsEntries;
var lyrics_cloud_move;
var lyrics_cloud_rotate;
var lyrics_cloud_morph;
var cover;
const coverDepthTexture = new THREE.TextureLoader().load("../assets/love-and-behold-single-cover-depthmap-2.png");
const televisionDepthTexture = new THREE.TextureLoader().load("../assets/vintage_television-depth-2.png");
const coverTexture = new THREE.TextureLoader().load("../assets/love-and-behold-single-cover.png");
const waterTexture = new THREE.TextureLoader().load("../assets/water.png");
const waterCrestTexture = new THREE.TextureLoader().load("../assets/water-crest-depth.png");
coverTexture.colorSpace = THREE.SRGBColorSpace;

var audioLoaded = false;

async function makePointCloud(){

    //
    //  Audio Texture for depth
    //
    const audioTexDescriptor = [
	{ type: Audio2Texture.FREQ_SPECTRUM },
	{ type: Audio2Texture.LEVEL},
	{ type: Audio2Texture.TIME},
    ];
    
    audioTexture = new Audio2Texture("../assets/LoveAndBehold.mp3", 6*60, audioTexDescriptor, 1024, 1024, true, 0.7, 0, true, () => { audioLoaded = true;});

    //
    //  Read lyrics
    //
    const font_params =
	  {
	      size: 0.8,
	      depth: 0.2,
	      curveSegments: 2,
	      bevelEnabled: false,
	      bevelThickness: 1,
	      bevelSize: 1,
	      bevelOffset: 0,
	      bevelSegments: 5
	  };
    

    var lyrics;
    fetch("../assets/love-and-behold-lyrics.json")
	.then( (data) => {
	    return data.json();
	})
	.then( (lyrics) => {
	    const lyricsCloudDescriptor = [];
	    lyricsEntries = Object.entries(lyrics);
	    lyricsEntries.forEach( (entry, i) => {
		const time = entry[0];
		const words = entry[1];
		TextCloudGeometry.factory(words,
					  "../assets/Terminal Dosis_Regular.json",
					  0.02,
					  font_params).then( text_geom => {
					      // Center text
					      text_geom.computeBoundingBox();
					      const text_geom_x_pos_move = -(text_geom.boundingBox.max.x - text_geom.boundingBox.min.x)/2 
					      
					      lyricsCloudDescriptor[i] =
						  { geometry: text_geom,
						    randPosOrder: true,
						    //rotate:new THREE.Vector3(-Math.PI/2,0,0),
						    pos:new THREE.Vector3(text_geom_x_pos_move,0,0),
						    pos_noise: 0.03,
						    scale: new THREE.Vector3(1, 1, 1),
						    displacementMap: [audioTexture.texture[2], audioTexture.texture[1]],
						    displacementMapFlags: [0*morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + 1*morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING +
						    1*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
						    0*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER + morphPointCloud.DISPLACEMENT_MAP_ENABLE],
						    displacementMapScale: [0.02, 0.05]
						  };
					      
					      if (lyricsCloudDescriptor.length == lyricsEntries.length){
						  var max_points = 0;
						  lyricsCloudDescriptor.forEach( (d) => { max_points = Math.max(max_points, d.geometry.attributes.position.count);});
						  lyricsLineCloud = new morphLineCloud(max_points, 0.01, 0xd0c0b0, 1.0,  '../assets/heart2.png');
						  lyricsLineCloud.load(lyricsCloudDescriptor, 5).then( obj => {
						      obj.layers.enable( BLOOM_SCENE );
						      scene.add(obj);
						      lyrics_cloud_move = new MOVE(obj, true, "lyric_cloud");
						      lyrics_cloud_rotate = new MOVE(obj, true, "lyric_cloud_rotate");
						      lyrics_cloud_morph = new MOVE(obj, true, "lyric_cloud_morph");
						      obj.load(   
	    						  [{ filename: "../assets/water.png",
							     pos:new THREE.Vector3(0,0.1,0),
							     rotate:new THREE.Vector3(-Math.PI/2,0,0),
							     width: 42,
							     height: 42,
							     colorCloud: true,
							     randPosOrder: true,
							     tileDim: 1,
							     pos_noise: 5,
							     point_space_ratio: 0.1,
							     scaleTimePerlin: 0.5,
							     displacementMap: [audioTexture.texture[1], null, waterCrestTexture],
							     displacementMapFlags: [0*morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + 1*morphPointCloud.DISPLACEMENT_MAP_MULTIPLY + 1*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
										    0*morphPointCloud.DISPLACEMENT_MAP_ENABLE + 0*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE],
							     displacementMapScale: [3, 2],
							   },
							   { filename: "../assets/paper_boat.glb",
							     randPosOrder: true,
							     pos:new THREE.Vector3(0,0.4,0),
							     rotate:new THREE.Vector3(0,Math.PI/2,0),
							     pos_noise: 0.01,
							     scale: new THREE.Vector3(0.005, 0.25, 0.25),	
							     tesselate : [0.02, 10],
							     color: 0xffffff},
	    						   { filename: "../assets/Love&Behold-SlideGuitar.mov",
							     //colorCloud: true,
							     color: 0xffffff,
							     //num_points: 50000,
							     randPosOrder: false,
							     pos:new THREE.Vector3(3.5,-1,0),
							     rotate:new THREE.Vector3(0,0, Math.PI/2),
							     extrude_depth: 200, 
							     pos_noise: 0.1,
							     threshold: 100,
							     scale: new THREE.Vector3(0.02,0.02,0.02),//1.5, 1.5, 1.5),
							     textureMap: waterTexture,
							     textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE,
							     displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM + morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE
							   }]
						      )
						  });
					      }
						  
					  })
	    });
	});

    //
    //  Holon logo
    //
    const holon_logo_obj = new holonLogoGeometry(0xffffff, true, 2, new THREE.Vector3(0, 0, 0), 32, 128)
    holon_logo_obj.geometry.deleteAttribute("color"); 

    const holon_logo_obj2 = new holonLogoGeometry(0xffffff, true, 2, new THREE.Vector3(0, 0, 0), 32, 128, 0.05)
    holon_logo_obj2.geometry.deleteAttribute("color"); 

    const cover_dim = 512;

    //
    //  Sphere
    //
    const sphere_geom = new THREE.SphereGeometry( 15, cover_dim, cover_dim );
    var position = sphere_geom.getAttribute("position");
    const normal = sphere_geom.getAttribute("normal");
    const vec3 = new THREE.Vector3();
    for (let i=0; i<position.count; i++){
	vec3.randomDirection().multiplyScalar(30*Math.pow(Math.random(),1/3));
	position.setXYZ(i, vec3.x, vec3.y, vec3.z);
	normal.setXYZ(i, vec3.x, vec3.y, vec3.z);
    }

    //
    //  Cylinder
    //
    const cyl_geom = new THREE.CylinderGeometry( 15/2, 15/2, 5, cover_dim, cover_dim, true);
    position = cyl_geom.getAttribute("position");
    const fog_point_count = position.count;
    for (let i=0; i<position.count; i++){
	const rand = Math.pow(Math.random(),1/3)*(0.75+0.25*Math.cos((position.getY(i)/2.5)*Math.PI/2));
	position.setXYZ(i, position.getX(i)*rand, position.getY(i)*rand, position.getZ(i)*rand);
    }
    
    
    const cover_pointcloud_descriptor = [
	// Add the cover first so that we can use the colors from the points for other morph shapes
	{ filename: "../assets/love-and-behold-single-cover.png",
	  pos:new THREE.Vector3(0,0,0),
	  rotate:new THREE.Vector3(-Math.PI/2,0,0),
	  width: 42,
	  height: 42,
	  colorCloud: true,
	  randPosOrder: true,
	  tileDim: 1,
	  pos_noise: 5,
	  point_space_ratio: 0.1,
	  displacementMap: [audioTexture.texture[2], null],
	  displacementMapFlags: [0*morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + 0*morphPointCloud.DISPLACEMENT_MAP_SWAP_UV + 0*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
				 0*morphPointCloud.DISPLACEMENT_MAP_ENABLE + 1*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE],
	  displacementMapScale: [0.01, 1]
	},
	{ geometry: holon_logo_obj.geometry,
	  randPosOrder: true,
	  pos:new THREE.Vector3(0,0,0),
	  pos_noise: 0.01,
	  scale: new THREE.Vector3(4, 4, 4),
	  color: function (i, obj) {
	      const colorAttr = obj.geometry.getAttribute('color');
	      return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
	  },
	  //textureMapFlags: 1*morphPointCloud.TEXTURE_MAP_ADD_FBM_NOISE,
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	},
	{ filename: "../assets/water.png",
	  pos:new THREE.Vector3(0,0.1,0),
	  rotate:new THREE.Vector3(-Math.PI/2,0,0),
	  width: 42,
	  height: 42,
	  colorCloud: true,
	  randPosOrder: true,
	  tileDim: 1,
	  pos_noise: 5,
	  point_space_ratio: 0.1,
	  scaleTimePerlin: 0.5,
	  displacementMap: [audioTexture.texture[1], null, waterCrestTexture],
	  displacementMapFlags: [0*morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + 1*morphPointCloud.DISPLACEMENT_MAP_MULTIPLY + 1*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
				 0*morphPointCloud.DISPLACEMENT_MAP_ENABLE + 0*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
				 0*morphPointCloud.DISPLACEMENT_MAP_ENABLE],
	  displacementMapScale: [3, 2, 1],
	  textureMap: waterCrestTexture,
	  textureMapFlags: 0*morphPointCloud.TEXTURE_MAP_ENABLE + morphPointCloud.TEXTURE_MAP_BLEND_ADD
	},
	{ filename: "../assets/vintage_television-2.png",
	  num_points : 16000,
	  randPosOrder: true,
	  threshold: 200,
	  colorCloud: true,
	  point_space_ratio: 0.1,
	  extrude_depth: 3,
	  pos:new THREE.Vector3(0,3,0),
	  rotate:new THREE.Vector3(0,0,0),
	  pos_noise: 0.1,
	  width: 10,
	  height: 7,
	  displacementMap: televisionDepthTexture,
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ENABLE,
	  displacementMapScale: 1,
	},
	
	{ geometry: sphere_geom,
	  randPosOrder: true,
	  pos:new THREE.Vector3(0,0,0),
	  pos_noise: 0.1,
	  scale: new THREE.Vector3(1, 1, 1),
	  textureMap: waterTexture,
	  textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE,
	  //textureMap: dekorTexture,
	  //textureMapScale: new THREE.Vector2(1,1),
	  //displacementMap: [audioTexture.texture[0], audioTexture.texture[2]],
	  //displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
	  //			 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE + morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING],
	  //displacementMapScale: [1, 0.4],
//	  color: function (i, obj) {
//	      const colorAttr = obj.geometry.getAttribute('color');
//	      return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
//	  }
	},
    ]

    cover_point_cloud = new morphPointCloud(cover_dim**2, 0.02, 0xffffe0, 1.0, '../assets/heart2.png');
    cover_point_cloud.load(cover_pointcloud_descriptor, 1).then(
	function (obj) {
	    obj.layers.enable( BLOOM_SCENE );
	    scene.add(obj);
	    cover_point_cloud_move = new MOVE(obj, true, "cover_point_cloud");

	    const fog_pointcloud_descriptor = [	
		{ geometry: holon_logo_obj2.geometry,
		  randPosOrder: true,
		  pos:new THREE.Vector3(0,0,0),
		  pos_noise: 0.01,
		  scale: new THREE.Vector3(4, 4, 4),
		  scaleTimeFBM: 0.3,
		  color: function (i, _obj) {
		      const colorAttr = obj.geometry.getAttribute('color');
		      return new THREE.Color(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
		  },
		  textureMapFlags: 1*morphPointCloud.TEXTURE_MAP_ADD_FBM_NOISE,
		},
		{ geometry: cyl_geom,
		  randPosOrder: false,
		  pos:new THREE.Vector3(0,3,0),
		  rotate:new THREE.Vector3(0,0,0),
		  pos_noise: 1,
		  scale: new THREE.Vector3(1, 1, 1),
		  color: 0xffffff,
		  alpha: 1.0,
		  scaleTimePerlin: 0.1,
		  scaleTimeFBM: 0.3,
		  displacementMapFlags: 1*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE | morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM,
		  textureMapFlags: 1*morphPointCloud.TEXTURE_MAP_ADD_FBM_NOISE
		},
		{ filename: "../assets/Love&Behold-singing.mov",
		  colorCloud: true,
		  num_points: 64000,
		  randPosOrder: false,
		  pos:new THREE.Vector3(0,0,0),
		  rotate:new THREE.Vector3(0,0,0),
		  pos_noise: 0.001,
		  depth: 0.1,
		  threshold: 100,
		  normalise: true,
		  scale: new THREE.Vector3(1, 1, 1),
		  //color: function (i, obj) {
		  //    return new THREE.Color().setHSL(25.0/255.0, 0.25*(cover_dim**2-i)/cover_dim**2, 0.25*(cover_dim**2-i)/cover_dim**2);// Math.random(), 0.5*Math.random());
		  //}
		}
	    ];

	    fog_point_cloud = new morphPointCloud(fog_point_count, 0.02, 0xffffff, 1.0, '../assets/heart2.png', null, null, null, true);
	    fog_point_cloud.load(fog_pointcloud_descriptor, 0).then(
		function (obj) {
		    obj.layers.enable( BLOOM_SCENE );
		    fog_point_cloud_move = new MOVE(obj, true, "fog_point_cloud");
		    scene.add(obj);
		}
	    );
	    
	    
	}
    );
}




const x_unit = new THREE.Vector3(1,0,0);
const y_unit = new THREE.Vector3(0,1,0);
const z_unit = new THREE.Vector3(0,0,1);

const cameraMove = new MOVE(camera, true);
var cover_depth_scale = {value: 1};
var capturer;

var morphEvent = null;
var morphCoverCloud = false;
var ready = false;


var animate = async function () {
    const skyUniforms = sky.material.uniforms;

    skyUniforms[ 'sunPosition' ].value = new THREE.Vector3().setFromSphericalCoords( 1, skyParameters.sunElevation, skyParameters.sunPosition );;
    skyUniforms[ 'turbidity' ].value = skyParameters.turbidity;
    skyUniforms[ 'rayleigh' ].value = skyParameters.rayleigh;;
    skyUniforms[ 'mieCoefficient' ].value = skyParameters.mieCoefficient;
    skyUniforms[ 'mieDirectionalG' ].value = skyParameters.mieDirectionalG;

    var infoElement = document.getElementById('info');
    infoElement.innerHTML = ("x: " + camera.position.x + " y: " + camera.position.y + " z: " + camera.position.z + "<br>" +
			     "rotate x: " + camera.rotation.x + " rotate y: " + camera.rotation.y + " rotate z: " + camera.rotation.z);

    if (!ready && audioLoaded && loadingManagerDone && fog_point_cloud_move){
	const loadingScreen = document.getElementById( 'loading-screen' );
	loadingScreen.classList.add( 'fade-out' );
	loadingScreen.remove();
	ready = true;
    }

    if (morphEvent !== null){
	if (morphCoverCloud){
	    cover_point_cloud.morphTo(morphEvent, TWEEN.Easing.Linear.None, 5000);
	} else {
	    const elmts = lyricsLineCloud.descriptor.length;
	    lyricsLineCloud.morphTo(elmts-morphEvent, TWEEN.Easing.Circular.InOut, 5000);
	}
	morphEvent = null;
    }

    await morphPointCloud.updateAll();
    await morphLineCloud.updateAll();
    if (audioTexture){
	audioTexture.updateTexture();
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
    const halfpi = Math.PI/2;
    const song_start_time = 1; 

    const camera_circle_radius = 8;

    const cameraMoveCurveDuration = 120;
    const startPos = camera.position.clone();
    const cameraMoveCurve = new CurveFunction(function (x){
	return new THREE.Vector3().setFromSphericalCoords(camera_circle_radius+4*x, halfpi-Math.atan2(0.2, camera_circle_radius), x * 2 * Math.PI);
    })
    
    cameraMove
    // 4.2s: Initial circular camera movement 
	.to([new THREE.Vector3(0,camera_circle_radius, camera_circle_radius),
	     new THREE.Vector3(0,camera_circle_radius, 0)], lyricsLineCloud, 10, 4.2, TWEEN.Easing.Quadratic.Out)
	.to(new THREE.Vector3(0, 2, 0), new THREE.Vector3(-Math.PI/2, 0, 2*Math.PI), 10, 14.2, TWEEN.Easing.Quadratic.In)
	.to(new THREE.Vector3(0, startPos.y, camera_circle_radius), lyricsLineCloud, 5, 24.2, TWEEN.Easing.Quadratic.Out)
	.to(cameraMoveCurve, lyricsLineCloud, 115.8, 29.2)
	.to(new THREE.Vector3(0, startPos.y, camera_circle_radius), MOVE.NO_MOVE, 60, 145);
    
    lyrics_cloud_morph
    // 3s: Morph to paper boat
	.run( (obj) => { obj.morphTo(obj.descriptor.length-2, TWEEN.Easing.Circular.InOut, 5000)}, 4);
    
    lyrics_cloud_rotate
	.to( null, new THREE.Vector3(0.1, -0.5, -0.1),   2, 7.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(0.2, 0.3, 0.1),     2, 9.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(-0.2, -0.5, -0.1),  2, 11.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(0.2, 0.1, 0.1),     2, 13.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(-0.2, -0.7, -0.1),  2, 15.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(0.2, -0.1, 0.1),    2, 17.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(-0.2, -0.9, -0.1),  2, 19.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(0.2, -0.3, 0.1),    2, 21.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, new THREE.Vector3(-0.2, -1.1, -0.1),  2, 23.5, TWEEN.Easing.Sinusoidal.InOut)
	.to( null, camera, 71-25, 26+song_start_time-1)
	.to( null,  new THREE.Vector3(0,0,0), 5, song_start_time+116)
	.to( null, camera, 80, song_start_time+140);

    
    // Morph to all the lyrics
    lyricsEntries.forEach( (entry, i) => {
	if (i==12){
	    // Morph to slide guitar morph
	    lyrics_cloud_move
		.to( new THREE.Vector3(0, 0, 0), null, 1, song_start_time+71)
	    lyrics_cloud_morph
		.run( (obj) => { obj.morphTo(obj.descriptor.length-1, TWEEN.Easing.Circular.InOut, 1000)}, song_start_time+71)
	    lyrics_cloud_morph
		.run( (obj) => { obj.morphTo(obj.descriptor.length-3, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time+116)
	    lyrics_cloud_move
		.to( new THREE.Vector3(0,0,0), null, 5, song_start_time+116, TWEEN.Easing.Circular.InOut)
	    
	}
	var time = entry[0].split(":");
	time = Number(time[0])*60 + Number(time[1]); 
	lyrics_cloud_morph
	    .run( (obj) => { obj.morphTo(i, TWEEN.Easing.Circular.InOut, 2000)}, time+song_start_time-2)
	var newPos;
	if (i >= 12){
	    newPos = new THREE.Vector3().setFromSphericalCoords(Math.random()*(camera_circle_radius-2), halfpi-Math.atan2(0.5+1*Math.random(), camera_circle_radius-2), (Math.random()-0.5) * 0.7*Math.PI);
	} else {
	    newPos = new THREE.Vector3().setFromSphericalCoords(Math.random()*(camera_circle_radius-2), halfpi-Math.atan2(0.2+5*Math.random(), camera_circle_radius-2), Math.random()*  2 * Math.PI);
	}

	lyrics_cloud_move
	    .to( newPos, null, 2, time+song_start_time-2, TWEEN.Easing.Circular.InOut)
	
    });
	
    cover_point_cloud_move
    // 1s: Start Audio
	.run( (obj) => { audioTexture.start(capture)}, song_start_time)
    // 4s: Morph to water
	.run( (obj) => { obj.morphTo(2, TWEEN.Easing.Circular.InOut, 5000)}, 9.2)
	.run( (obj) => {
	    obj.descriptor[2].displacementMapFlags[2] |= morphPointCloud.DISPLACEMENT_MAP_ENABLE;
	    obj.descriptor[2].textureMapFlags |= morphPointCloud.TEXTURE_MAP_ENABLE;
	    obj.addFromDescriptor(obj.descriptor[2], 2);
	}, song_start_time + 71)
	.run( (obj) => { obj.morphTo(3, TWEEN.Easing.Circular.InOut, 25000)}, 120);

    fog_point_cloud_move
    // 4s: Morph to fog
	.run( (obj) => { obj.morphTo(1, TWEEN.Easing.Circular.InOut, 5000)}, 4)
	.run( (obj) => { obj.morphTo(2, TWEEN.Easing.Circular.InOut, 5000,
				     null, () => {obj.layers.disable(BLOOM_SCENE);})}, 140)
	.to(new THREE.Vector3(0, 4, 0), null, 5 , 140.1);

    if (capture){
	capturer = new CCapture( {
	    format: "webm",
	    quality: 100,
	    width: 1920,
	    height: 1080,
	    framerate: 30,
	    verbose: true,
	    display: true} );
	capturer.start();
    }

    lyrics_cloud_move.start();
    lyrics_cloud_rotate.start();
    lyrics_cloud_morph.start();
    cover_point_cloud_move.start();
    fog_point_cloud_move.start();
    cameraMove.start();
}

animate();

document.addEventListener("keypress",
			  function (event) {
			      if (!isNaN(Number(event.key))) {
				  morphEvent = Number(event.key);
				  morphCoverCloud = event.ctrlKey;
			      } else if (event.key == 'p'){
				  startCoreography(false);
			      } else if (event.key == 'r'){
				  startCoreography(true);
			      } else if (event.key == 'm'){
				  audioTexture.start(false)
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
