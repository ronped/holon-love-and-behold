import * as THREE from 'three';
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from '@tweenjs/tween.js';
import { holonLogoGeometry } from "../libs/holon_logo.js";
import { morphPointCloud, morphLineCloud } from "../libs/morph_point_cloud.js";
import { StarGeometry } from "../libs/star_geometry.js";
import { TextCloudGeometry } from "../libs/text_cloud_geometry.js";
import { Audio2Texture } from "../libs/audio2texture.js";
import { MOVE, CurveFunction } from "../libs/move.js";
import { RandomPath } from "../libs/random_path.js";
import { SeagullPointCloud } from "../libs/seagull.js";
import { JellyfishPointCloud } from "../libs/jellyfish.js";
import { FishPointCloud } from "../libs/fish.js";
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
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import 'jquery';


const x_unit = new THREE.Vector3(1,0,0);
const y_unit = new THREE.Vector3(0,1,0);
const z_unit = new THREE.Vector3(0,0,1);

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
    const reveal = document.getElementById('revealRect');
    if (reveal){
        const svg = document.querySelector('.logo');
        const vb = svg.viewBox.baseVal;  // get viewBox width
        reveal.setAttribute('width', String(vb.width*itemsLoaded/99));
    }
    console.log( 'Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );
};

THREE.DefaultLoadingManager.onError = function ( url ) {
	console.log( 'There was an error loading ' + url );
};


/*********************************************************

  Set some variable used throughout
    
***********************************************************/

const min_x_axis_visible = 12;
const min_y_axis_visible = 12;
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
camera.position.set(0.0,1,getCameraCenterDistance());
const cameraMove = new MOVE(camera, true, "cameraMove");
const cameraRotate = new MOVE(camera, true, "cameraRotate");

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

const enableAA = true;
const enableBloom = true;


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

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85, true);
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
if ( renderer.getContext() instanceof WebGL2RenderingContext && enableAA ) {
    finalComposer.renderTarget1.samples = 8;
    finalComposer.renderTarget2.samples = 8;
    bloomComposer.renderTarget1.samples = 8;
    bloomComposer.renderTarget2.samples = 8;
}
finalComposer.addPass( renderScene );

if (enableAA)
    finalComposer.addPass( smaaPass );

if (enableBloom)
    finalComposer.addPass( mixPass );

finalComposer.addPass( outputPass );

if (enableAA)
    finalComposer.addPass( fxaaPass );



function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.position.set(0.0,1,getCameraCenterDistance());
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth, window.innerHeight );
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
    finalComposer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onWindowResize );

const darkMaterial = new THREE.MeshBasicMaterial( { color: 'black'} );
const materials = {};
const waterOpacity = {}; 
const darkMaterials = {};
const bloomIntensityMaterials = {};

function darkenNonBloomed( obj ) {
    if (bloomLayer.test( obj.layers ) === false){
	if (obj.isMorphCloud){
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
	} else if ( obj.isWater ) {
            // For water objects just change the color to black so that the water surface will not
            // let anything through
            obj.material.uniforms.color.value = new THREE.Color( 0x0);
            waterOpacity[obj.uuid] = obj.material.uniforms.uOpacity.value; 
            obj.material.uniforms.uOpacity.value = 1.0;
	} else if ( obj.isMesh ) {
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
    } else {
	if (obj.isMorphCloud && obj.enableBloom){
	    if (!bloomIntensityMaterials[obj.uuid]){
		const bloomMaterial = obj.material.clone();
		bloomMaterial.defines = bloomMaterial.defines || {};
		bloomMaterial.defines.USE_BLOOM_INTENSITY = 1;
		bloomMaterial.onBeforeCompile = obj.material.onBeforeCompile;
		bloomMaterial.needsUpdate = true;
		bloomIntensityMaterials[obj.uuid] = bloomMaterial;
	    }
	    materials[ obj.uuid ] = obj.material;
	    obj.material = bloomIntensityMaterials[obj.uuid];
            // Size can change so make sure we use the current size
            obj.material.size = materials[ obj.uuid ].size;
        }
    }
}

function restoreMaterial( obj ) {
    if ( materials[ obj.uuid ] ) {
	obj.material = materials[ obj.uuid ];
	delete materials[ obj.uuid ];
    } else if (obj.isWater){
        obj.material.uniforms.color.value = new THREE.Color( 0xffffff);
        obj.material.uniforms.uOpacity.value = waterOpacity[obj.uuid];
    }
        
}


/*********************************************************

 Sky
  
***********************************************************/

const skyParameters = {};
function resetSkyParameters(params){
    params.sunPosition= 2.3;
    params.sunElevation= Math.PI/2;
    params.turbidity= 10;
    params.rayleigh= 6.3;
    params.mieCoefficient= 0.005;
    params.mieDirectionalG= 0.5;
}

resetSkyParameters(skyParameters);

const gui = new GUI({closeFolders:true});

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

/*********************************************************

 Water

 Use the Water2 example from three.js but add some simplex noise
 mimicking what the point cloud surfaces do in terms of movement
 
  
***********************************************************/

// Make a planegeometry that is more dense near the center where
// things will happen when the camera is close to water - overall size should be 2000x1000
const waterGeometry = BufferGeometryUtils.mergeGeometries([new THREE.PlaneGeometry( 100, 100, 500, 500 ),
                                                           new THREE.PlaneGeometry( 950, 1000, 1, 1/*100, 100*/ ).translate(-950/2-100/2, 0, 0),
                                                           new THREE.PlaneGeometry( 950, 1000, 1, 1/*100, 100*/ ).translate(950/2+100/2, 0, 0),
                                                           new THREE.PlaneGeometry( 100, 450, 1 , 1 /*10, 45 */).translate(0, 450/2+100/2, 0),
                                                           new THREE.PlaneGeometry( 100, 450, 1, 1 /*10, 45*/ ).translate(0, -450/2-100/2, 0)]);

// Fix UV attribute
const waterUvAttribute = waterGeometry.getAttribute("uv");
const waterPosAttribute = waterGeometry.getAttribute("position");
for (let i=0; i<waterUvAttribute.count; i++){
    waterUvAttribute.setXY(i, (waterPosAttribute.getX(i)+1000)/2000, (waterPosAttribute.getY(i)+500)/1000);
}
waterUvAttribute.needsUpdate = true;

const waterShader = {... Water.WaterShader };

waterShader.uniforms.uTime = {value: 0}; 
waterShader.uniforms.uSimplexConfig = {value: new THREE.Vector4(0.0, 1.0, 0.5, 1.0)};
waterShader.uniforms.uOpacity = {value: 1.0};
waterShader.vertexShader = `
                uniform float uTime;
                uniform vec4 uSimplexConfig;
                vec4 taylorInvSqrt(vec4 r)
                {
                  return 1.79284291400159 - 0.85373472095314 * r;
                }
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
                    float noiseValue = snoise(pos * frequency + uTime * wavesSpeed);
                    displacement += amplitude * noiseValue;
                    amplitude *= wavesPersistence;
                    frequency *= 2.0;//uWavesLacunarity;
                  }
                
                  return displacement;
                }

		#include <common>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>

		uniform mat4 textureMatrix;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;
                varying vec3 vNormal;

		void main() {
			vUv = uv;
                        vec3 pos = position;

                        if (abs(pos.x) < 50.0 && abs(pos.y) < 50.0){
                          vec4 simplexSettings = uSimplexConfig.x*vec4(0.1, 8.0, 0.7, 0.25) + uSimplexConfig.y*vec4(0.05, 8.0, 0.3, 0.25);
                          float scale = uSimplexConfig.z;

                          pos.z = scale*(-0.05+getSimplexDisplacement(vec2(pos.x, -pos.y), simplexSettings));
                          float z_x0 = scale*getSimplexDisplacement(vec2(pos.x-0.05, -pos.y), simplexSettings);
                          float z_x1 = scale*getSimplexDisplacement(vec2(pos.x+0.05, -pos.y), simplexSettings);
                          float z_y0 = scale*getSimplexDisplacement(vec2(pos.x, -pos.y-0.05), simplexSettings);
                          float z_y1 = scale*getSimplexDisplacement(vec2(pos.x, -pos.y+0.05), simplexSettings);
                          vNormal = normalize(vec3(z_x0-z_x1, 0.1, z_y0-z_y1));
                        } else {
                          vNormal = vec3(0.0, 1.0, 0.0);
                        }                 
			vCoord = textureMatrix * vec4( pos, 1.0 );

			vec4 worldPosition = modelMatrix * vec4( pos, 1.0 );
			vToEye = cameraPosition - worldPosition.xyz;

			vec4 mvPosition =  viewMatrix * worldPosition; // used in fog_vertex
			gl_Position = projectionMatrix * mvPosition;

			#include <logdepthbuf_vertex>
			#include <fog_vertex>
		}`;

waterShader.fragmentShader = `
		#include <common>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>

		uniform sampler2D tReflectionMap;
		uniform sampler2D tRefractionMap;
		uniform sampler2D tNormalMap0;
		uniform sampler2D tNormalMap1;
                uniform vec4 uSimplexConfig;

		#ifdef USE_FLOWMAP
			uniform sampler2D tFlowMap;
		#else
			uniform vec2 flowDirection;
		#endif

		uniform vec3 color;
		uniform float reflectivity;
		uniform vec4 config;
                uniform float uOpacity;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;
		varying vec3 vNormal;

		void main() {

			#include <logdepthbuf_fragment>
			vec3 toEye = normalize( vToEye );
                        vec3 normal;
                        vec3 normalMap = vec3(0.0, 1.0, 0.0);;
                        if (uSimplexConfig.w != 1.0){
			  float flowMapOffset0 = config.x;
			  float flowMapOffset1 = config.y;
			  float halfCycle = config.z;
			  float scale = config.w;

			  // determine flow direction
			  vec2 flow;
			  #ifdef USE_FLOWMAP
			  	flow = texture2D( tFlowMap, vUv ).rg * 2.0 - 1.0;
			  #else
			  	flow = flowDirection;
			  #endif
			  flow.x *= - 1.0;

			  // sample normal maps (distort uvs with flowdata)
			  vec4 normalColor0 = texture2D( tNormalMap0, ( vUv * scale ) + flow * flowMapOffset0 );
			  vec4 normalColor1 = texture2D( tNormalMap1, ( vUv * scale ) + flow * flowMapOffset1 );

			  // linear interpolate to get the final normal color
			  float flowLerp = abs( halfCycle - flowMapOffset0 ) / halfCycle;
			  vec4 normalColor = mix( normalColor0, normalColor1, flowLerp );
			  normalMap = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );
                        }

                        normal = mix(normalMap, vNormal, uSimplexConfig.w);

			// calculate the fresnel term to blend reflection and refraction maps
			float theta = max( dot( toEye, normal ), 0.0 );
			float reflectance = reflectivity + ( 1.0 - reflectivity ) * pow( ( 1.0 - theta ), 5.0 );

			// calculate final uv coords
			vec3 coord = vCoord.xyz / vCoord.w;
			vec2 uv = coord.xy + coord.z * normal.xz * 0.05;

			vec4 reflectColor = texture2D( tReflectionMap, vec2( 1.0 - uv.x, uv.y ) );
			vec4 refractColor = texture2D( tRefractionMap, uv );

			// multiply water color with the mix of both textures
			gl_FragColor = vec4( color, uOpacity ) * mix( refractColor, reflectColor, reflectance );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>

		}`;


const water = new Water( waterGeometry, {
    color: 0xffffff,
    scale: 10.0,
    shader: waterShader,
    flowDirection: new THREE.Vector2( 0.1, 0.1),
    textureWidth: 2048,
    textureHeight: 2048,
    normalMap0: new THREE.TextureLoader().load("../assets/Water_1_M_Normal.jpg",function ( texture ) {
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }),
    normalMap1: new THREE.TextureLoader().load("../assets/Water_2_M_Normal.jpg",function ( texture ) {
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    })
} );

const waterMove = new MOVE(water, true, "Water Move");

const waterOnBeforeRender = water.onBeforeRender;

water.onBeforeRender = function ( renderer, scene, camera ) {
    if (cover_point_cloud)
        // If current morph is or about to change to descriptor item 0 or 2
        // then turn off reflection/refraction for those in water
        if (cover_point_cloud.nextMorphDescId != null && cover_point_cloud.nextMorphDescId[0] != null){
            if ([0, 2].includes(cover_point_cloud.nextMorphDescId[0]))
                cover_point_cloud.visible = false;
        } else if (cover_point_cloud.currentMorphDescIdForInstance != null){
            if ([0, 2].includes(cover_point_cloud.currentMorphDescIdForInstance[0]))
                cover_point_cloud.visible = false;
        }

    waterOnBeforeRender(renderer, scene, camera);
    
    if (cover_point_cloud)
        cover_point_cloud.visible = true;
    
};

water.rotation.x = Math.PI * - 0.5;
water.visible = true;
scene.add( water );

/*********************************************************

 Orbit Controls
  
***********************************************************/

// orbit controls
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableZoom = true;
controls.enableDamping = true;
controls.listenToKeyEvents( window );

/*********************************************************

 Song tempo constants
  
***********************************************************/
const songBPM = 119;
const eightNoteBPM = songBPM*3;
const songBeatFreq = songBPM/60;
const timePerBeat = 1/songBeatFreq;
const timePerBar = 4*timePerBeat;
const timePerEight = timePerBeat/3;

const loadPosMap = true;
const dumpPosMap = false;
const enableInfo = false;
const enableGUI = false;

const heartPointSprite = "../assets/heart.png"

var audioTexture;
var cover_point_cloud;
var cover_point_cloud_move;
const coverPointCloudWaterPerlinTimeScale = 0.5;
var fog_point_cloud;
var fog_point_cloud_move;
var seagull_point_cloud;
var seagull_point_cloud_move;
var seagull_point_cloud_run;
var seagullCamera = new THREE.Object3D();
var shipwreckedCamera = new THREE.Object3D();
var fishCamera = [new THREE.Object3D(), new THREE.Object3D()];
var currentFollowCamera = {value: seagullCamera};
const followCameras = [seagullCamera, ...fishCamera];
var lyricsLineCloud = [];
var lyricsEntries;
var lyricsCloudMove = [];
var lyricsCloudRotate = [];
var lyricsCloudMorph = [];
var lyricsLastMorphIdx = [];
var fishLyricsLastMorphIdx = [];
var fishPointCloudMove = []; 
var fishPointCloudRun = []; 
var fishPointCloud = [];
const jellyInstances = 32;
var jellyfishPointCloud;
var jellyfishPointCloudRun;
var jellyfishPointCloudInstanceTypes = [];
var shipwreckedPointCloud;
var shipwreckedPointCloudRun;
var seagullGuanoPointCloud;
var seagullGuanoPointCloudMove;
var whaleDescrIndex;
const lyrics = [[],[]];
const seagullLyrics = [];
const fishLyrics = [[],[]];
const jellyLyrics = [];
const jellyLyricsInstance = [];
var cover;
const coverTexture = new THREE.TextureLoader().load("../assets/love-and-behold-single-cover.png");
const waterTexture = new THREE.TextureLoader().load("../assets/water.png");
coverTexture.colorSpace = THREE.SRGBColorSpace;
coverTexture.wrapS = THREE.RepeatWrapping;
coverTexture.wrapT = THREE.RepeatWrapping;

const loadPromises = [];

// Play button to start animation
const playButton = document.getElementById('playButton');


// Vortex depth texture
const vortexDepthData = new Float32Array(100);
for (let i=0; i<vortexDepthData.length; i++){
    vortexDepthData[i] = -0.5-1/((i/vortexDepthData.length)+0.01)**1;
}

const vortexDepthTexture = new THREE.DataTexture( vortexDepthData, vortexDepthData.length, 1, THREE.RedFormat, THREE.FloatType,
						  THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
vortexDepthTexture.internalFormat = 'R32F';
vortexDepthTexture.magFilter = THREE.LinearFilter;
vortexDepthTexture.minFilter = THREE.LinearFilter;
vortexDepthTexture.needsUpdate = true;

function getVortexDepth(x){
    x = Math.min(x, 1.0);
    const samplePos = x*(vortexDepthData.length-1);
    const depth0 = vortexDepthData[Math.floor(samplePos)];
    const depth1 = vortexDepthData[Math.ceil(samplePos)];
    const coeff = samplePos - Math.floor(samplePos);
    const depth = depth0*(1-coeff)+depth1*coeff;
    return depth;
}


var audioLoaded = false;

async function makePointCloud(){

    //
    //  Audio Texture for depth
    //
    const audioTexDescriptor = [
	{ type: Audio2Texture.TIME, lowpassSmooth: true},
	{ type: Audio2Texture.LEVEL, expand: false, startFreq:0, endFreq:24000, compressThreshold: 1.0, compressRatio: 8, lowpassSmooth: true, offsetFromAverage: true, clipLow: 0.01, clipHigh: 0.3},
	{ type: Audio2Texture.LEVEL, expand: true, startFreq:0, endFreq:24000, compressThreshold: 1.0, compressRatio: 8, lowpassSmooth: false, offsetFromAverage: false},
	{ type: Audio2Texture.LEVEL, expand: true, startFreq:0, endFreq:24000, compressThreshold: 1.0, compressRatio: 8, lowpassSmooth: true, offsetFromAverage: false, clipLow: 0.01, clipHigh: 0.3},
    ];
    
    const folderKick = gui.addFolder( 'Level' );
    folderKick.add( audioTexDescriptor[3], 'compressThreshold', 0, 5, 0.1 );
    folderKick.add( audioTexDescriptor[3], 'compressRatio', 1, 16, 1 );
    folderKick.add( audioTexDescriptor[3], 'startFreq', 0, 24000, 100);
    folderKick.add( audioTexDescriptor[3], 'endFreq', 0, 24000, 100);
    folderKick.add( audioTexDescriptor[3], 'expand');
    folderKick.add( audioTexDescriptor[3], 'lowpassSmooth');
    folderKick.add( audioTexDescriptor[3], 'offsetFromAverage');

    audioTexture = new Audio2Texture("../assets/Love & Behold-master-v1 - 0135 - Group - PRINT.m4a", 18*60, audioTexDescriptor, 512, 512, 0, true, () => { audioLoaded = true;});
    loadPromises.push(audioTexture.promise);
    
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
    

    fetch("../assets/love-and-behold-lyrics-tuned.json")
	.then( (data) => {
	    return data.json();
	})
	.then( (_lyrics) => {
	    const seagullLyricsCloudDescriptor = [];
	    const lyricsCloudDescriptor = [[],[]];
	    const fishLyricsCloudDescriptor = [[],[]];
            const jellyLyricsCloudDescriptor = [];
            
            // Setup text curves to match seagull wings for the seagull lyrics
            const seagullTextCurves = [];
	    const wingWidth = 3.5;
	    const angleWingsUp = Math.PI/5;
	    const angle1WingsDown = Math.PI/6;
	    const angle2WingsDown = Math.PI*5/12;
	    const angleWingsGlide = Math.PI/20;
	    seagullTextCurves[0] = new THREE.CatmullRomCurve3([new THREE.Vector3(-wingWidth*Math.cos(angleWingsUp), wingWidth*Math.sin(angleWingsUp), 0),
							      new THREE.Vector3(0, 0, 0),
							      new THREE.Vector3(wingWidth*Math.cos(angleWingsUp), wingWidth*Math.sin(angleWingsUp), 0)]);
	    seagullTextCurves[1] = new THREE.CatmullRomCurve3([new THREE.Vector3(-wingWidth*((2/5)*Math.cos(angle1WingsDown)+(3/5)*Math.cos(angle2WingsDown)),
										-wingWidth*((2/5)*Math.sin(angle1WingsDown)+(3/5)*Math.sin(angle2WingsDown)),
										0),
							      new THREE.Vector3(-wingWidth*(2/5)*Math.cos(angle1WingsDown),
										-wingWidth*(2/5)*Math.sin(angle1WingsDown),
										0),
							      new THREE.Vector3(0, 0, 0),
							      new THREE.Vector3(wingWidth*(2/5)*Math.cos(angle1WingsDown),
										-wingWidth*(2/5)*Math.sin(angle1WingsDown),
										0),
							      new THREE.Vector3(wingWidth*((2/5)*Math.cos(angle1WingsDown)+(3/5)*Math.cos(angle2WingsDown)),
										-wingWidth*((2/5)*Math.sin(angle1WingsDown)+(3/5)*Math.sin(angle2WingsDown)),
										0)]);
	    
	    seagullTextCurves[2] = new THREE.CatmullRomCurve3([new THREE.Vector3(-wingWidth*Math.cos(angleWingsGlide), -wingWidth*Math.sin(angleWingsGlide), 0),
							       new THREE.Vector3(0, 0, 0),
							       new THREE.Vector3(wingWidth*Math.cos(angleWingsGlide), -wingWidth*Math.sin(angleWingsGlide), 0)]);
	    lyricsEntries = Object.entries(_lyrics);
	    lyricsEntries.forEach( (entry, i) => {
		var time = entry[0].split(":");
		time = Number(time[0])*60 + Number(time[1]); 
		const words = entry[1];
		const seagullLyric = (i > 25 && i < 40);
		const fishLyric = (i > 11 && i <=25);
                const jellyLyric = i>=40;
		const lyricsArray = (seagullLyric ?
                                     seagullLyrics :
                                     (fishLyric ?
                                      fishLyrics[i % 2] :
                                      (jellyLyric ?
                                       jellyLyrics :
                                       lyrics[i % 2])));
		// Check if we already have these lyrics - if so we can reuse that morph
		const idx = lyricsArray.findIndex( (elmt) => (elmt.words == words) );
		var uniqueCount = lyricsArray.length == 0 ? 1 : lyricsArray[lyricsArray.length-1].uniqueCount + 1;
		var morphIdx = uniqueCount - 1;
		if (idx != -1){
		    morphIdx = idx;
		    uniqueCount--;
		}
		lyricsArray.push({time: time, words: words, morphIdx: morphIdx, duplicate: idx != -1, uniqueCount: uniqueCount, cloudIdx: i % 2 });
	    });

            const fishWaterPlaneGeom = new THREE.CircleGeometry( 10, 25 );
            delete fishWaterPlaneGeom.attributes.color;

            const lyricsPromises = [];

            lyrics.forEach( (part, partIdx) => {
                part.forEach( (entry, i) => {
		    if (entry.duplicate) return;

                    //const dumpPosMap = true;
		    lyricsPromises.push(
		        TextCloudGeometry.factory(entry.words,
					          "../assets/Terminal Dosis_Regular.json",
					          font_params).then( text_geom => {
						      // Center text
						      text_geom.computeBoundingBox();
						      const text_geom_x_pos_move = -(text_geom.boundingBox.max.x - text_geom.boundingBox.min.x)/2;
						      
                                                      const lyricsPosMapFile = "lyrics" + partIdx + "_" + entry.morphIdx + "_position_map.json";
                                                      text_geom.deleteAttribute("color");
						      lyricsCloudDescriptor[partIdx][entry.morphIdx] =
						          { geometry: text_geom,
							    posNearestTo: (dumpPosMap &&
                                                                           // Use raft for partIdx 0 - else use water plane
								           { descId : partIdx == 0 && i == 0 ? part[part.length-1].uniqueCount + 2: part[part.length-1].uniqueCount,
									     downloadFile : lyricsPosMapFile }),
							    posMapFile: loadPosMap &&  ("../assets/posmaps/" + lyricsPosMapFile),
							    randPosOrder: !dumpPosMap && !loadPosMap,
							    rotate: null,
							    pos: new THREE.Vector3(2*text_geom_x_pos_move,0,0),
							    pos_noise: 0.03,
							    scale: new THREE.Vector3(2, 2, 2),
                                                            color: 0x7f7f7f,
                                                            alpha: 1.0,
			                                    textureMap: "../assets/water.png",
			                                    textureMapFlags: morphPointCloud.TEXTURE_MAP_BLEND_MUL | morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN,
                                                            textureMapViewPos: new THREE.Vector3(0,0,10),
			                                    displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
			                                    displacementMapOffset: 0.1
						          };
					          }));
	        });
            });
            
	    // Append to the lyrics descriptor and create morph when all the text geometries have been loaded
	    Promise.all(lyricsPromises).then(
		(x) => {
		    //
		    //  Main lyrics line cloud
		    //
                    //const dumpPosMap = true;
                    lyricsCloudDescriptor.forEach( (lyricsDescPart, lyricsIdx) => {
		        var max_points = 0;
		        lyricsDescPart.forEach( (d) => { max_points = Math.max(max_points, d.geometry.attributes.position.count);});
		        lyricsLastMorphIdx[lyricsIdx] = lyricsDescPart.length+1;
		        lyricsDescPart.push(
                            ...[{  geometry: fishWaterPlaneGeom,
                                   sortPosSpheric: dumpPosMap &&  { downloadFile: "fish_waterplane_pos_map.json" },
                                   posMapFile: loadPosMap && "../assets/posmaps/fish_waterplane_pos_map.json", 
                                   tesselate : [0.0025, 10],
	                           pos:new THREE.Vector3(0,-0.3,0),
	                           rotate:new THREE.Vector3(Math.PI/2,0,0),
	                           pos_noise: 1.0,
                                   pos_noise_normal:true,
	                           scale: new THREE.Vector3(0.01, 0.01, 0.01),
			           textureMap: "../assets/water.png",
			           textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE,
                                   colorFromMorph: lyricsIdx == 0 ? lyricsDescPart.length+4 : null,
                                   alpha: 1
                                },
                                {  geometry: fishWaterPlaneGeom,
                                   posMapFile: loadPosMap && "../assets/posmaps/fish_waterplane_pos_map.json", 
	                           tesselate : [0.0025, 10],
	                           pos:new THREE.Vector3(0,-0.3,0),
	                           rotate:new THREE.Vector3(Math.PI/2,0,0),
	                           pos_noise: 1.0,
                                   pos_noise_normal: true,
	                           scale: new THREE.Vector3(0.1, 0.05, 0.05),	
			           textureMap: "../assets/water.png",
			           textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE,
                                   colorFromMorph:  lyricsIdx == 0 ? lyricsDescPart.length+4 : null,
                                   alpha: 1
                                }
                               ]);

                        if (lyricsIdx == 0){
                            lyricsDescPart.push(
			        ...[{ filename: "../assets/glb/raft.glb",
			              sortPosSpheric: dumpPosMap && { downloadFile: "raft_pos_map.json" },
			              posMapFile: loadPosMap && "../assets/posmaps/raft_pos_map.json",
			              randPosOrder: !dumpPosMap && !loadPosMap,
			              pos:new THREE.Vector3(0,3,0),
			              rotate:new THREE.Vector3(0,0,0),
                                      bloomIntensity: 1,
			              pos_noise: 0.01,
			              scale: new THREE.Vector3(3, 3, 3),	
			              tesselate : [0.016, 8],
			              textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
			            },
	    		            { filename: "../assets/Love&Behold-SlideGuitar.mov",
			              color: 0x7f7f7f,
                                      sortPosSpheric: true,
			              randPosOrder: false,
			              pos:new THREE.Vector3(3.0,-0.7,0.2),
			              rotate:new THREE.Vector3(0,0, Math.PI/2),
			              extrude_depth: 200,
			              pos_noise: 0.1,
			              threshold: 100,
                                      bloomIntensity: 0.5,
			              scale: new THREE.Vector3(0.02,0.02,0.02),
			              textureMap: "../assets/water.png",
			              textureMapFlags: 1*morphPointCloud.TEXTURE_MAP_ENABLE | 0*morphPointCloud.TEXTURE_MAP_BLEND_AVG | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN | 0*morphPointCloud.TEXTURE_MAP_KALEIDO,
                                      textureMapViewPos: new THREE.Vector3(0, 0, 2),
	                              textureMapScale: new THREE.Vector2(1, 1),
                                      displacementMap: [audioTexture.texture[0], null],
                                      displacementMapOffset: [0.01, 0.0],
                                      displacementMapNormal: [new THREE.Vector3(0,1,0), new THREE.Vector3(0,1,0)],
                                      displacementMapScale: [0.1, 0.1],
			              displacementMapFlags: [1*morphPointCloud.DISPLACEMENT_MAP_ENABLE | 0*morphPointCloud.DISPLACEMENT_MAP_SWAP_UV | 0*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM | morphPointCloud.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL,
                                                             1*morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE | morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE_XY | 1*morphPointCloud.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL | 0*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM],
	                              displacementMapParams: [null, new THREE.Vector4(/*frequency*/1.5, /*iterations*/8, /*speed*/0.7, /*persistence*/0.5)]
			            },
			            { filename: "../assets/water.png",
                                      sortPosSpheric: /*dumpPosMap && */ false && { downloadFile: "lyrics_water_pos_map.json" },
			              posMapFile: loadPosMap && "../assets/posmaps/lyrics_water_pos_map.json",
			              pos:new THREE.Vector3(0,24,0/*1,0*/),
			              rotate:new THREE.Vector3(-Math.PI/2,0,0),
			              randPosOrder: false,
			              width: 42,
			              height: 42,
			              colorCloud: true,
			              tileDim: 1,
			              pos_noise: 5,
			              point_space_ratio: 0.1,
			              scaleTimePerlin: 0.5,
                                      bloomIntensity: 0.5,
                                      displacementMap: [audioTexture.texture[3], null],
			              displacementMapFlags: [0*morphPointCloud.DISPLACEMENT_MAP_ANGULAR_MAPPING | 1*morphPointCloud.DISPLACEMENT_MAP_MULTIPLY |
						             1*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE | 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
						             0*morphPointCloud.DISPLACEMENT_MAP_ENABLE + 0*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE],
			              displacementMapScale: [50, 0],
			              displacementMapOffset: [0.01, 0],
			            },
			            { filename: "../assets/glb/heart2.glb",
			              posNearestTo: dumpPosMap && { descId : lyricsDescPart.length + 2, downloadFile : "heart_position_map.json" }, 
			              posMapFile: loadPosMap && "../assets/posmaps/heart_position_map.json",
			              randPosOrder: !dumpPosMap && !loadPosMap,
			              scale: new THREE.Vector3(2, 2, 2),
			              pos:new THREE.Vector3(0,0.8,0),
			              tesselate : [0.0125, 5],
			              pos_noise: 0.001,
			              textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
			              displacementMap: audioTexture.texture[1],
			              displacementMapOffset: 0.02,
			              displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ENABLE | 1*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL,
			              displacementMapScale: 0.2,
			              color: 0xffffff
			            },
			            { filename: "../assets/glb/desert_island.glb",
			              posNearestTo: dumpPosMap && { descId : lyricsDescPart.length + 3, downloadFile : "desert_island_position_map.json" }, 
			              posMapFile: loadPosMap && "../assets/posmaps/desert_island_position_map.json",
			              randPosOrder: !dumpPosMap && !loadPosMap,
			              scale: new THREE.Vector3(10, 10, 10),
			              pos:new THREE.Vector3(-0.5,3,0),
			              tesselate : [0.015, 4],
			              pos_noise: 0.001,
			              textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
			              color: 0xffffff,
                                      displacementMap: null,
			              displacementMapOffset: 0.05,
			              displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ENABLE | 1*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL,
			              displacementMapScale: 1,

			            },
			            { filename: "../assets/glb/brain2.glb",
			              posNearestTo:dumpPosMap && { descId : lyricsDescPart.length + 3, downloadFile : "brain_position_map.json" }, 
			              posMapFile: loadPosMap && "../assets/posmaps/brain_position_map.json",
			              randPosOrder: !dumpPosMap && !loadPosMap,
			              scale: new THREE.Vector3(2.2, 2.2, 2.2),
			              rotate: new THREE.Vector3(0, 0.18, 0),
			              pos:new THREE.Vector3(0,0.6,0),
			              tesselate : [0.015, 10],
			              pos_noise: 0.001,
			              textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
			              color: 0xffffff,
                                      displacementMap: audioTexture.texture[1],
			              displacementMapOffset: 0.02,
			              displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ENABLE | 1*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL,
			              displacementMapScale: 0.2,

			            },
                                    { geometry: lyricsCloudDescriptor[1][2].geometry,
			              posNearestTo: dumpPosMap && { descId : lyricsDescPart.length, downloadFile : "title_pos_map.json" }, 
				      posMapFile: loadPosMap &&  ("../assets/posmaps/title_pos_map.json"),
				      randPosOrder: !dumpPosMap && !loadPosMap,
				      rotate: null,
				      pos: lyricsCloudDescriptor[1][2].pos.clone().multiplyScalar(0.5),
				      pos_noise: 0.03,
				      scale: new THREE.Vector3(1, 1, 1),
				      displacementMap: [audioTexture.texture[0], audioTexture.texture[2]],
				      displacementMapFlags: [0*morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + 1*morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING +
							     1*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
							     0*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER + morphPointCloud.DISPLACEMENT_MAP_ENABLE],
				      displacementMapScale: [0.02, 0.05]
                                    }
			           ]);
                        }
		    
		        lyricsLineCloud[lyricsIdx] = new morphLineCloud({
                            num_points: 150000 /*max_points*/,
                            point_size: 0.01,
                            color: 0xd0c0b0,
                            alpha: 1.0,
                            point_sprite_file: heartPointSprite,
                            enableBloom: true,
                            name: "Lyrics Line Cloud " + lyricsIdx
                        })

		        lyricsLineCloud[lyricsIdx].load(lyricsDescPart, lyricsDescPart.length-1).then( obj => {
			    obj.layers.enable( BLOOM_SCENE );
                            if (lyricsIdx == 1) obj.visible = false;
			    scene.add(obj);
			    lyricsCloudMove[lyricsIdx] = new MOVE(obj, true, "lyric_cloud" + lyricsIdx);
			    lyricsCloudRotate[lyricsIdx] = new MOVE(obj, true, "lyric_cloud_rotate" + lyricsIdx);
			    lyricsCloudMorph[lyricsIdx] = new MOVE(obj, true, "lyric_cloud_morph" + lyricsIdx);

                            if (lyricsIdx == 0){
                                const shipwreckedPointCloudDescr = [
                                    { filename: "../assets/glb/shipwrecked_man2.glb",
	                              tesselate : [0.02, 7],
	                              rotate: new THREE.Vector3(0,0,0),
	                              pos: new THREE.Vector3(0,0,0),
	                              pos_noise: 0.0,
	                              scale: new THREE.Vector3(1, 1, 1),
                                      color: 0xffffff,
                                      alpha: 1.0,
                                      bloomIntensity: 0.7,
	                              scaleTimeFBM: 1,
	                              scaleTimePerlin: 0.2,
	                              textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE },
                                    { filename: "../assets/glb/shipwrecked_man3.glb",
	                              tesselate : [0.02, 7],
	                              rotate: new THREE.Vector3(0,0,0),
	                              pos: new THREE.Vector3(0,0,0),
	                              pos_noise: 0.0,
	                              scale: new THREE.Vector3(1, 1, 1),
                                      color: 0xffffff,
                                      alpha: 1.0,
                                      bloomIntensity: 0.7,
	                              scaleTimeFBM: 1,
	                              scaleTimePerlin: 0.2,
	                              textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE },
                                    { geometry: new THREE.SphereGeometry( 0.01, 128, 128, 0, Math.PI, 0, Math.PI ),
	                              rotate: new THREE.Vector3(0,0,0),
	                              pos: new THREE.Vector3(0,0,0),
	                              pos_noise: 0.0,
	                              scale: new THREE.Vector3(1, 1, 1),
                                      color: 0x0,
                                      alpha: 0.0,
                                      bloomIntensity: 0.7,
	                              scaleTimeFBM: 1,
	                              scaleTimePerlin: 0.2 },
                                    { filename: "../assets/glb/shipwrecked_man_meditating.glb",
	                              tesselate : [0.02, 7],
	                              rotate: new THREE.Vector3(0,0,0),
	                              pos: new THREE.Vector3(0,0,0),
	                              pos_noise: 0.0,
	                              scale: new THREE.Vector3(1, 1, 1),
                                      color: 0xffffff,
                                      alpha: 1.0,
                                      bloomIntensity: 0.7,
	                              scaleTimeFBM: 1,
	                              scaleTimePerlin: 0.2,
	                              textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE },
                                ];
                                
                                shipwreckedPointCloud = new morphPointCloud({
                                    num_points: 100000,
                                    point_size: 0.015,
                                    color: 0xffffff,
                                    alpha: 0.0,
                                    point_sprite_file: heartPointSprite,
                                    enableBloom: true,
                                    name: "Shipwrecked Point Cloud"
                                });
                                
                                loadPromises.push(
                                    shipwreckedPointCloud.load(shipwreckedPointCloudDescr, 2).then(
	                                function (obj2) {
	                                    obj2.layers.enable( BLOOM_SCENE );
	                                    obj.add(obj2);
                                            shipwreckedCamera.position.set(2.5,0,0);
                                            obj2.add(shipwreckedCamera);
                                            shipwreckedPointCloudRun = new MOVE(obj2, true, "shipwrecked run")
                                        }
                                    )
                                );
                            }

		        });
                    });
                    
		});
	    
            loadPromises.push(...lyricsPromises);

	    const fishLyricsPromises = [];

            // Rotate the fish lyrics text so the text is correct from the
            // camera angle
            const moveRightRotation = new THREE.Vector3(0, -Math.PI/2, 0);
            const moveLeftRotation = new THREE.Vector3(0, Math.PI/2, 0);
            const fishLyricsRotation = [
                [ moveRightRotation, moveRightRotation,
                  moveLeftRotation, moveLeftRotation,
                  moveRightRotation, moveRightRotation, moveRightRotation ],
                [ moveLeftRotation, moveLeftRotation,
                  moveRightRotation, moveRightRotation,
                  moveLeftRotation, moveLeftRotation, moveLeftRotation ]
            ];
            fishLyrics.forEach( (part, partIdx) => {
                part.forEach( (entry, i) => {
		    if (entry.duplicate) return;

                    //const dumpPosMap = true;
		    fishLyricsPromises.push(
		        TextCloudGeometry.factory(entry.words,
					          "../assets/Terminal Dosis_Regular.json",
					          font_params,
                                                  null,
                                                  (_, __) => [font_params.size/8, 6]
                                                 ).then( text_geom => {
						      // Center text
						      text_geom.computeBoundingBox();
						      const text_geom_x_pos_move = -(text_geom.boundingBox.max.x - text_geom.boundingBox.min.x)/2;
                                                      text_geom.deleteAttribute("color")
                                                      const fishLyricsPosMapFile = "fish_lyrics" + partIdx + "_" + entry.morphIdx + "_position_map.json";
                                                      const fishLyricsSortedPosMapFile = "fish_lyrics_sorted_" + partIdx + "_" + entry.morphIdx + "_position_map.json";
                                                      const scale = 0.5;
						      fishLyricsCloudDescriptor[partIdx][entry.morphIdx] =
						          { geometry: text_geom,
							    // Match the fish
							    posNearestTo: (dumpPosMap &&
								           { descId : 0,
                                                                             searchRange: 1000,
									     downloadFile : fishLyricsPosMapFile }),
                                                            sortPos: (dumpPosMap &&
                                                                      { sortFunc: (a, b) => (a.z - b.z),
                                                                        downloadFile : fishLyricsSortedPosMapFile
                                                                      }),
							    posMapFile: loadPosMap &&
                                                                      [ "../assets/posmaps/" + fishLyricsSortedPosMapFile,
                                                                        "../assets/posmaps/" + fishLyricsPosMapFile],
							    randPosOrder: !dumpPosMap && !loadPosMap,
							    rotate: fishLyricsRotation[partIdx][i],
	                                                    displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                                            useFishMovement: true,
							    pos: new THREE.Vector3(text_geom_x_pos_move*scale,0,0),
							    pos_noise: 0.03,
                                                            uvFromMorph: 0,
                                                            bloomIntensity: 2,
                                                            //colorFromMorph: 0,
                                                            color: 0x7f7f7f,
                                                            alpha: 1.0,
                                                            rotateCloudBounds: true,
	                                                    textureMap: [0, "../assets/abstract.png"], 
	                                                    textureMapFlags: [1*morphPointCloud.TEXTURE_MAP_BLEND_AVG | morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV,
                                                                              morphPointCloud.TEXTURE_MAP_BLEND_AVG | morphPointCloud.TEXTURE_MAP_ENABLE | 1*morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN |  morphPointCloud.TEXTURE_MAP_VIEW_POS_RELATIVE],
	                                                    textureMapScale: [null, new THREE.Vector2(0.2, 0.2)],
                                                            textureMapViewPos: [null, new THREE.Vector3(0,10,0)],
                                                            scaleTimeFBM: 2,
	                                                    //textureMapFlags: 1*morphPointCloud.TEXTURE_MAP_BLEND_AVG | morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV,
							    scale: new THREE.Vector3(scale, scale, scale)
						          };
					          }));
	        });
            });

	    Promise.all(fishLyricsPromises).then(
		(x) => {
                    //
                    //  Fish
                    //
                    const waterColumns = ["../assets/glb/watercolumn-2.glb",
                                          "../assets/glb/watercolumn-3.glb"];
                    const waterColumnTesselate = [[0.03, 8], [0.3, 5]]

                    const fishTypes = [2, 3];
                    fishLyricsCloudDescriptor.forEach( (lyricsDescPart, fishIdx) => {
                        //const dumpPosMap = true;
                        fishPointCloud[fishIdx] = new FishPointCloud(fishTypes[fishIdx], 0.01, heartPointSprite, "Fish Point Cloud " + fishIdx, true, {}, dumpPosMap, loadPosMap);

                        fishCamera[fishIdx].position.set(0,0,-4);
                        fishPointCloud[fishIdx].add(fishCamera[fishIdx]);

                        fishLyricsLastMorphIdx[fishIdx] = lyricsDescPart.length-1;
                        lyricsDescPart.push(...
                            [
                                {
	                            geometry: fishWaterPlaneGeom,
                                    sortPosSpheric: dumpPosMap && { downloadFile: "fish_water_plane" + fishIdx + "_pos_map.json" },
			            posMapFile: loadPosMap && "../assets/posmaps/fish_water_plane" + fishIdx + "_pos_map.json",
	                            tesselate : [0.0025, 10],
	                            pos:new THREE.Vector3(0,0,0),
	                            rotate:new THREE.Vector3(Math.PI/2,0,0),
	                            pos_noise: 1,
	                            scale: new THREE.Vector3(0.001, 0.001, 0.001),
	                            textureMap: ["../assets/water.png"],
	                            textureMapFlags: [morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV],
                                    color: 0x0,
                                    alpha: 1
                                },
                                {
                                    filename: waterColumns[fishIdx],
                                    // Align points with the waterplane geometry
	                            posNearestTo: dumpPosMap && { descId : fishLyricsLastMorphIdx[fishIdx] + 1 + 1 /* Account for the fish iteself */, downloadFile : "water_column" + fishIdx + "_position_map.json" }, 
	                            posMapFile: loadPosMap && "../assets/posmaps/water_column" + fishIdx + "_position_map.json",
	                            randPosOrder: !dumpPosMap && !loadPosMap,
	                            scale: new THREE.Vector3(5, 5, 5),
			            randPosOrder: true,
	                            pos:new THREE.Vector3(0,2-0.0,0.2),
                                    pointSize: 0.05,
	                            tesselate : waterColumnTesselate[fishIdx],
	                            pos_noise: 0.001,
                                    color: 0x0,
	                            textureMap: ["../assets/water.png", null],
	                            textureMapFlags: [1*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV,
                                                      1*morphPointCloud.TEXTURE_MAP_BLEND_AVG | 1*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV],
	                            displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE | 0*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_RANDOM,
	                            displacementMapScale: 0.2,
	                            displacementMapParams: new THREE.Vector4(/*frequency*/0.5, /*iterations*/8, /*speed*/0.7, /*persistence*/0.25)
	                        },
                                {
	                            geometry: fishWaterPlaneGeom,
			            posMapFile: loadPosMap && "../assets/posmaps/fish_water_plane" + fishIdx + "_pos_map.json",
	                            tesselate : [0.0025, 10],
	                            pos:new THREE.Vector3(0,0,0.0),
	                            rotate:new THREE.Vector3(Math.PI/2,0,0),
	                            pos_noise: 1,
	                            scale: new THREE.Vector3(0.1, 0.1, 0.1),
	                            textureMap: ["../assets/water.png"],
	                            textureMapFlags: [morphPointCloud.TEXTURE_MAP_BLEND_MUL_ALPHA | morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV],
                                    color: 0xffffff,
                                    alpha: 0
                                },
                                {
                                    // Soundbar
	                            geometry: new THREE.CylinderGeometry(0.1, 0.1, 3, 32, 32),
	                            tesselate : [0.04, 10],
	                            pos:new THREE.Vector3(0,0,0),
	                            rotate:new THREE.Vector3(Math.PI/2,0,0),
                                    bloomIntensity: 0.5,
                                    pointSize: 0.0001,
	                            pos_noise: 0.1,
	                            scale: new THREE.Vector3(1, 1, 1),
	                            textureMap: ["../assets/abstract.png"],
	                            textureMapFlags: [morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV],
	                            displacementMap: [audioTexture.texture[0], audioTexture.texture[0]],
	                            displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_ENABLE | morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U | 0*morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL | morphPointCloud.DISPLACEMENT_MAP_PERP_CUSTOM_NORMAL,
                                                           0*morphPointCloud.DISPLACEMENT_MAP_ENABLE | morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U | morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL],
	                            displacementMapNormal: [new THREE.Vector3(0,0,1), new THREE.Vector3(1,0,0)],
	                            displacementMapScale: [1, 2],
	                            displacementMapOffset: [-0.25, 0/*-0.2*/],
                                    alpha: 1
                                }
                            ]);

                        if (fishIdx == 0)
                            lyricsDescPart.push(
                                {
                                    filename: "../assets/glb/siren5.glb",
                                    scale: new THREE.Vector3(2.3, 2.3, 2.3),
	                            pos:new THREE.Vector3(0,0,0),
                                    rotate:new THREE.Vector3(0,-Math.PI/2,0),
	                            tesselate : [0.014, 8],
				    posNearestTo: (dumpPosMap &&
						   { descId : 0,
                                                     searchRange: 1000,
						     downloadFile : "siren" + fishIdx + "_position_map.json" }),
                                    sortPos: (dumpPosMap &&
                                              { sortFunc: (a, b) => (a.z - b.z),
                                                downloadFile : "siren_sorted_" + fishIdx + "_position_map.json" 
                                              }),
				    posMapFile: loadPosMap &&
                                        [ "../assets/posmaps/" + "siren_sorted_" + fishIdx + "_position_map.json",
                                          "../assets/posmaps/" + "siren" + fishIdx + "_position_map.json"],
	                            randPosOrder: !dumpPosMap && !loadPosMap,
	                            pos_noise: 0.001,
	                            textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
                                    useFishMovement: true,
	                            displacementMap: fishPointCloud[fishIdx].fishMoveTexture,
	                            displacementMapNormal: new THREE.Vector3(0,1,0),
	                            displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
	                            color: 0xffffff
	                        }
                            );
                        else
                            lyricsDescPart.push(
	                        {
                                    filename: "../assets/glb/siren4.glb", 
                                    scale: new THREE.Vector3(2.3, 2.3, 2.3),
	                            pos:new THREE.Vector3(0,0,0),
                                    rotate:new THREE.Vector3(0,-Math.PI,0),
	                            tesselate : [0.019, 8],
	                            posNearestTo: dumpPosMap && { descId : 0, downloadFile : "siren" + fishIdx + "_position_map.json" }, 
	                            posMapFile: loadPosMap && "../assets/posmaps/siren" + fishIdx + "_position_map.json",
	                            randPosOrder: !dumpPosMap && !loadPosMap,
	                            pos_noise: 0.001,
	                            textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
                                    useFishMovement: true,
	                            displacementMap: fishPointCloud[fishIdx].fishMoveTexture,
	                            displacementMapNormal: new THREE.Vector3(1,0,0),
	                            displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
	                            color: 0xffffff
	                        }
                            );
                        

                        loadPromises.push(
                            fishPointCloud[fishIdx].load(lyricsDescPart,fishLyricsLastMorphIdx[fishIdx]+1).then(
                                function (obj) {
	                            obj.layers.enable ( BLOOM_SCENE );
	                            scene.add(obj);
	                            obj.visible = false;
                                    obj.startMoving();
                                    fishPointCloudMove[fishIdx] = new MOVE(obj, true, "fish_point_cloud_move" + fishIdx);
	                            fishPointCloudRun[fishIdx] = new MOVE(obj, true, "fish_point_cloud_run" + fishIdx);
                                }
                            )
                        );
                    });
                });
                    
            loadPromises.push(...fishLyricsPromises);

            const seagullLyricsPromises = [];
	    seagullLyrics.forEach( (entry, i) => {
		if (entry.duplicate) return;

                const perGroupTesselate = (group, nrGroups) => {
                    const groupsExtraTesselate = Math.ceil(0.3*nrGroups);
                    const groupsNotExtraTesselate = Math.floor((nrGroups - groupsExtraTesselate)/2)*2;
                    if ((group < groupsNotExtraTesselate/2 || (group >= (nrGroups - groupsNotExtraTesselate/2)))){
                        return [font_params.size/5, 6];
                    } else {
                        return [font_params.size/28, 6];
                    }
                };
                const loadPosMap = true;
		seagullLyricsPromises.push(
		    TextCloudGeometry.factory(entry.words,
					      "../assets/Terminal Dosis_Regular.json",
					      font_params,
					      seagullTextCurves,
                                              perGroupTesselate).then( text_geom => {
						  text_geom[2].computeBoundingBox();
						  const text_geom_y_pos_move = 0;
                                                  const scale = 0.5;
						  text_geom.forEach( (geom, geomIdx) => {
                                                      geom.deleteAttribute("color");
						      seagullLyricsCloudDescriptor[entry.morphIdx*3+geomIdx] =
							  { geometry: geom,
							    // Sort positions to match the seagull and previous lyrics 
							    posNearestTo: (dumpPosMap && (geomIdx == (text_geom.length-1)) &&
									   { descId : 2,
                                                                             searchRange: 1000,
                                                                             downloadFile : "seagull_lyrics_" + entry.morphIdx + "_position_map.json" }),
                                                            sortPos: ((dumpPosMap && (geomIdx == (text_geom.length-1))) &&
                                                                      { sortFunc: (a, b) => (a.x - b.x),
                                                                        downloadFile : "seagull_lyrics_" + entry.morphIdx + "_sorted_position_map.json"
                                                                      }),
						            posMapFile: loadPosMap &&
                                                                        [ "../assets/posmaps/seagull_lyrics_" + entry.morphIdx + "_sorted_position_map.json",
                                                                          "../assets/posmaps/seagull_lyrics_" + entry.morphIdx + "_position_map.json"],
							    // Rotate seagull lyrics 180 degrees around y axis
							    rotate: new THREE.Vector3(0, Math.PI, 0),
							    pos: new THREE.Vector3(0,text_geom_y_pos_move*scale,0),
                                                            bloomIntensity: 0.5,
							    pos_noise: 0.03,
                                                            color: 0xf0f0f0,
							    scale: new THREE.Vector3(scale, scale, scale),
							    displacementMap: [audioTexture.texture[0], audioTexture.texture[2]],
							    displacementMapFlags: [0*morphPointCloud.DISPLACEMENT_MAP_LOG_U_MAPPING + 1*morphPointCloud.DISPLACEMENT_MAP_ANGULAR_U_MAPPING +
										   1*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
										   0*morphPointCloud.DISPLACEMENT_MAP_DISPLACE_FROM_CENTER + morphPointCloud.DISPLACEMENT_MAP_ENABLE],
							    displacementMapScale: [0.02, 0.05]
							  };
						  });
					      }));
	    });
					      
	    Promise.all(seagullLyricsPromises).then(
		(x) => {
		    //
		    //  Seagull point cloud
		    //
                    const loadPosMap = true;
		    seagull_point_cloud = new SeagullPointCloud(0.02, ['../assets/zero.png', '../assets/one.png'], true, "Seagull Point Cloud", dumpPosMap, loadPosMap);
                    seagullCamera.position.set(0,-0.6,-2.5/*3.2*/);
                    seagull_point_cloud.add(seagullCamera);


                    // Add whale texture with some displacement textures for movement
                    const whaleMoveTextureData = [new Float32Array(128), new Float32Array(128)];;
	            const whaleMoveTexture = [new THREE.DataTexture( whaleMoveTextureData[0], 128, 1, THREE.RedFormat, THREE.FloatType,
		           		                             THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping),
                                              new THREE.DataTexture( whaleMoveTextureData[1], 128, 1, THREE.RedFormat, THREE.FloatType,
		           		                             THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping)];
                    whaleMoveTexture.forEach( (x) => {
	                x.internalFormat = 'R32F';
	                x.magFilter = THREE.LinearFilter;
	                x.minFilter = THREE.LinearFilter;
                    });

                    seagull_point_cloud.onUpdate( (obj, time) => {
                        whaleMoveTextureData[0].forEach( (elmt, idx) => {
                            whaleMoveTextureData[0][127-idx] = (idx < 32) ? 0 : 1.5*(((idx-32)/96)**3)*Math.sin(0.2*time*2*Math.PI);
                        });
	                whaleMoveTexture[0].needsUpdate = true;
                        whaleMoveTextureData[1].forEach( (elmt, idx) => {
                            const mirrorIdx = idx > 63 ? 127 - idx : idx;
                            const limit = 60;
                            whaleMoveTextureData[1][idx] = (mirrorIdx > limit) ? 0 : 0.7*(((limit-mirrorIdx)/limit)**2)*(0.5+0.5*Math.sin(0.3*time*2*Math.PI));
                        });;
	                whaleMoveTexture[1].needsUpdate = true;
                    });
                    
                    whaleDescrIndex = seagullLyricsCloudDescriptor.length;
                    const tesselateSettings = [0.015, 7];
                    seagullLyricsCloudDescriptor.push(...[
	                    { filename: "../assets/glb/whale.glb",
	                      scale: new THREE.Vector3(3, 3, 3),
	                      pos:new THREE.Vector3(0,0,0),
                              rotate: new THREE.Vector3(0,Math.PI,0),
	                      animationName: "Swim",
	                      animationTime: 0.0,
                              bloomIntensity: 1,
	                      tesselate : tesselateSettings,
	                      pos_noise: 0.05,
	                      textureMap: "../assets/abstract.png", 
	                      textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN |  0*morphPointCloud.TEXTURE_MAP_USE_UV,
	                      textureMapScale: new THREE.Vector2(0.1, 0.1),
                              textureMapViewPos: new THREE.Vector3(0,-10,0),
	                      displacementMap: [whaleMoveTexture[0], whaleMoveTexture[1], whaleMoveTexture[1]],
	                      displacementMapNormal: [new THREE.Vector3(0,1,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,1,0)],
	                      displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                                     morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                                     morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE],
                              scaleTimeFBM: 2,
	                    },
	                    { filename: "../assets/glb/whale.glb",
	                      scale: new THREE.Vector3(3, 3, 3),
	                      pos:new THREE.Vector3(0,0,0),
                              rotate: new THREE.Vector3(0,Math.PI,0),
	                      animationName: "Swim",
	                      animationTime: 0.04,
                              bloomIntensity: 1,
	                      tesselate : tesselateSettings,
	                      pos_noise: 0.05,
	                      textureMap: "../assets/abstract.png",
	                      textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN |  0*morphPointCloud.TEXTURE_MAP_USE_UV,
	                      textureMapScale: new THREE.Vector2(0.1, 0.1),
                              textureMapViewPos: new THREE.Vector3(0,-10,0),
	                      displacementMap: [whaleMoveTexture[0], whaleMoveTexture[1], whaleMoveTexture[1]],
	                      displacementMapNormal: [new THREE.Vector3(0,1,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,1,0)],
	                      displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                                     morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                                     morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE],
                              scaleTimeFBM: 2,
	                    },
	                    { filename: "../assets/glb/whale.glb",
	                      scale: new THREE.Vector3(3, 3, 3),
	                      pos:new THREE.Vector3(0,0,0),
                              rotate: new THREE.Vector3(0,Math.PI,0),
	                      animationName: "Swim",
	                      animationTime: 0.08,
                              bloomIntensity: 1,
	                      tesselate : tesselateSettings,
	                      pos_noise: 0.05,
	                      textureMap: "../assets/abstract.png",
	                      textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN |  0*morphPointCloud.TEXTURE_MAP_USE_UV,
	                      textureMapScale: new THREE.Vector2(0.1, 0.1),
                              textureMapViewPos: new THREE.Vector3(0,-10,0),
	                      displacementMap: whaleMoveTexture,
	                      displacementMapNormal: new THREE.Vector3(0,1,0),
	                      displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DEPTH_IS_U + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                              scaleTimeFBM: 2,
	                    },

                    ]);
                    
                    loadPromises.push(
		        seagull_point_cloud.load(seagullLyricsCloudDescriptor).then(
			    function (obj) {
			        obj.layers.enable ( BLOOM_SCENE );
			        obj.visible = false;
			        scene.add(obj);
			        seagull_point_cloud_move = new MOVE(obj, true, "seagull_point_cloud_move");
			        seagull_point_cloud_run = new MOVE(obj, true, "seagull_point_cloud_run");
			    }
		        )
                    );
		}
		
	    );

            loadPromises.push(...seagullLyricsPromises);

            const jellyLyricsPromises = [];
            for (let i=0; i<jellyInstances; i++) jellyfishPointCloudInstanceTypes[i] = i % JellyfishPointCloud.TYPE_COUNT;
            
            jellyLyrics.forEach( (entry,i) => {
		if (entry.duplicate) return;
                
                //const dumpPosMap = true;
                
		jellyLyricsPromises.push(
		    TextCloudGeometry.factory(entry.words,
					      "../assets/Terminal Dosis_Regular.json",
					      font_params,
                                              null,
                                              (_, __) => [font_params.size/8, 6]
                                             ).then( text_geom => {
						  // Center text
						  text_geom.computeBoundingBox();
                                                  const textWidth = text_geom.boundingBox.max.x - text_geom.boundingBox.min.x;
                                                  const textPosOffset = -(textWidth)/2;
                                                  const targetWidth = 1;
                                                  const scale = targetWidth/textWidth;
                                                  const lyricsPosMapFile = "jelly_lyrics_" + entry.morphIdx + "_position_map.json";
                                                  const lyricsSortedPosMapFile = "jelly_lyrics_sorted_" + entry.morphIdx + "_position_map.json";
                                                  const jellyType = jellyfishPointCloudInstanceTypes[entry.morphIdx]; 
                                                  text_geom.deleteAttribute("color");
						  jellyLyricsCloudDescriptor[entry.morphIdx] =
						      { geometry: text_geom,
							// Sort positions to match the seagull and previous lyrics 
				                        posNearestTo: (dumpPosMap &&
						                       { descId : jellyType,
                                                                         searchRange: 1000,
						                         downloadFile :  lyricsPosMapFile }),
                                                        sortPos: (dumpPosMap &&
                                                                  { sortFunc: (a, b) => (a.y - b.y),
                                                                    downloadFile : lyricsSortedPosMapFile
                                                                  }),
				                        posMapFile: loadPosMap &&
                                                        [ "../assets/posmaps/" + lyricsSortedPosMapFile,
                                                          "../assets/posmaps/" + lyricsPosMapFile],
							randPosOrder: !dumpPosMap && !loadPosMap,
							rotate: new THREE.Vector3(jellyType==JellyfishPointCloud.TYPE_SEAHORSE ? Math.PI/2 : 0,
                                                                                  0,
                                                                                  entry.morphIdx&1 ? Math.PI/2 : -Math.PI/2),
							pos: new THREE.Vector3(scale*textPosOffset,0,0),
							pos_noise: 0.03,
							scale: new THREE.Vector3(scale, scale, scale),
                                                        pointSize: entry.words.length > 13 ? 0.003 : 0.005, 
                                                        color: 0xffffff,
                                                        alpha: 1.0,
	                                                textureMap: "../assets/abstract.png",
                                                        bloomIntensity: 0.3,
	                                                scaleTimeFBM: 1,
	                                                scaleTimePerlin: 0.2,
	                                                textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN,
	                                                textureMapScale: new THREE.Vector2(0.1, 0.1),
                                                        textureMapViewPos: new THREE.Vector3(0,1,0),
                                                        textureMapUp: new THREE.Vector3(0,0,1),
                                                        useJellyDisplacement: true
						      };
					      }));
	    });


	    Promise.all(jellyLyricsPromises).then(
		(x) => {
                    //
                    //  Jellyfish
                    //
                    //const dumpPosMap = true;
                    const frequencies = [songBeatFreq/4, songBeatFreq/6, songBeatFreq/8];
                    const jellyMoveFreqs = new Array(jellyInstances);
                    for (let i=0; i<jellyInstances; i++){
                        jellyMoveFreqs[i] = frequencies[Math.floor(Math.random()*frequencies.length)];
                    }
                    jellyfishPointCloud = new JellyfishPointCloud(0.005, heartPointSprite, jellyInstances, jellyMoveFreqs, "Jellyfish Point Cloud", true, dumpPosMap, loadPosMap);
                    
                    loadPromises.push(
                        jellyfishPointCloud.load(jellyLyricsCloudDescriptor, 0, dumpPosMap, loadPosMap).then(
	                    function (obj) {
	                        obj.layers.enable( BLOOM_SCENE );
	                        scene.add(obj);
			        jellyfishPointCloudRun = new MOVE(obj, true, "jellyfish_point_cloud_run");
                            }
                        )
                    );
                });

            loadPromises.push(...jellyLyricsPromises);

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
    //  Cylinder
    //
    const cyl_geom = new THREE.CylinderGeometry( 25, 25, 10, cover_dim*2, cover_dim*2, true);
    const position = cyl_geom.getAttribute("position");
    const fog_point_count = position.count;
    for (let i=0; i<position.count; i++){
	var rand = Math.pow(Math.random(),1/3)*(0.75+0.25*Math.cos((position.getY(i)/2.5)*Math.PI/2));
	const angle_xz = Math.atan2(position.getX(i), position.getZ(i));
	const angle_xy = Math.atan2(position.getX(i), position.getY(i));
	rand += 0.2*Math.cos(angle_xz*angle_xy*11) * 0.3*Math.cos((angle_xz+angle_xy)*3);
	position.setXYZ(i, position.getX(i)*rand, position.getY(i)*rand, position.getZ(i)*rand);
    }
    

    {
        //const dumpPosMap = true;

        const waterGeom = new THREE.CircleGeometry( 40, 100 );
        const reflector = new Reflector( waterGeom, {
	    textureWidth: 1024,
	    textureHeight: 1024,
	    clipBias: 0
	} );
        
	const refractor = new Refractor( waterGeom, {
	    textureWidth: 1024,
	    textureHeight: 1024,
	    clipBias: 0
	} );
        
        reflector.rotation.x = -0.5 * Math.PI;
        refractor.rotation.x = -0.5 * Math.PI;
        reflector.updateMatrixWorld(true);
        refractor.updateMatrixWorld(true);
	reflector.matrixAutoUpdate = false;
	refractor.matrixAutoUpdate = false;
        
    const cover_pointcloud_descriptor = [
	// Add the cover first so that we can use the colors from the points for other morph shapes
	{
            geometry: new THREE.CircleGeometry( 100, 100 ),
	    tesselate : [0.03, 9],
	    posNearestTo: dumpPosMap && { descId : 3, downloadFile :  "love_and_behold_single_cover_position_map.json" }, 
            randPosOrder: !dumpPosMap && !loadPosMap,
	    posMapFile: loadPosMap && "../assets/posmaps/love_and_behold_single_cover_position_map.json",
            pointSize: 0.1,
	    pos:new THREE.Vector3(0,0,0),
	    rotate:new THREE.Vector3(-Math.PI/2,0,0),
	    pos_noise: 2.0,
	    scaleTimePerlin: coverPointCloudWaterPerlinTimeScale,
	    textureMap: ["../assets/love-and-behold-single-cover.png", reflector.getRenderTarget().texture],
	    textureMapFlags: [morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV,
                              0*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_SIZE_TO_VIEW_FRUSTRUM | morphPointCloud.TEXTURE_MAP_BLEND_ADD],
	    textureMapScale: [null, new THREE.Vector2(-1,1)],
	    textureMapOffset: [null, new THREE.Vector2(1,0)],
	    textureMapBlendCoeffs: [null, new THREE.Vector4(0.5, 0.5, 0.5, 0.5)],
	    displacementMap: [audioTexture.texture[0], null],
	    displacementMapFlags: [1*morphPointCloud.DISPLACEMENT_MAP_RADIAL_U_MAPPING + 0*morphPointCloud.DISPLACEMENT_MAP_MULTIPLY + 0*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
				   0*morphPointCloud.DISPLACEMENT_MAP_ENABLE + 1*morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE],
	    displacementMapScale: [0.2, 0.5],//[10, 2]
	    displacementMapParams: [null, new THREE.Vector4(/*frequency*/0.05, /*iterations*/8, /*speed*/0.3, /*persistence*/0.25)]//[10, 2]
	},
	{
            geometry: holon_logo_obj.geometry,
	    posMapFile: loadPosMap && "../assets/posmaps/holon_logo_position_map.json",
	    randPosOrder: dumpPosMap ? {downloadFile: "holon_logo_position_map.json"} : !loadPosMap,
	    pos:new THREE.Vector3(0,0,0),
            pointSize: 0.02,
	    pos_noise: 0.01,
	    scale: new THREE.Vector3(4, 4, 4),
	    textureMap: "../assets/love-and-behold-single-cover.png",
	    textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV,
	    textureMapScale: new THREE.Vector2(1, 3),
	    textureMapOffset: new THREE.Vector2(0, 0.6),
            uvFromMorph: 0,
	    displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
	},
	{
            geometry: new THREE.CircleGeometry( 40, 100 ),
	    tesselate : [0.03, 9],
	    pos:new THREE.Vector3(0,0,0/*-0.3*/),
	    pos_noise: 2.0,
	    rotate:new THREE.Vector3(-Math.PI/2,0,0),
            rotateCloudBound: true,
            posNearestTo: dumpPosMap && { descId : 1, downloadFile : "water_position_map.json" }, 
	    posMapFile: loadPosMap && "../assets/posmaps/water_position_map.json",
	    randPosOrder: !dumpPosMap && !loadPosMap,
            pointSize: 0.1,
            //bloomIntensity: 0,
	    scaleTimePerlin: coverPointCloudWaterPerlinTimeScale,
	    textureMap: ["../assets/water.png", reflector.getRenderTarget().texture, refractor.getRenderTarget().texture],
	    textureMapScale: [null, new THREE.Vector2(-1,1), null],
	    textureMapOffset: [null, new THREE.Vector2(1,0), null],
	    textureMapFlags: [1*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV,
                              0*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_SIZE_TO_VIEW_FRUSTRUM | 1*morphPointCloud.TEXTURE_MAP_BLEND_ADD,
                              0*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_SIZE_TO_VIEW_FRUSTRUM | 1*morphPointCloud.TEXTURE_MAP_BLEND_ADD],                     
	    textureMapBlendCoeffs: [null, new THREE.Vector4(0.7, 0.3, 0.5, 0.5), new THREE.Vector4(0.5, 0.5, 0.5, 0.5)],
	    displacementMap: [audioTexture.texture[0], null],
	    displacementMapFlags: [1*morphPointCloud.DISPLACEMENT_MAP_RADIAL_U_MAPPING + 0*morphPointCloud.DISPLACEMENT_MAP_MULTIPLY + 0*morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE + 1*morphPointCloud.DISPLACEMENT_MAP_ENABLE,
				   0*morphPointCloud.DISPLACEMENT_MAP_ENABLE + 1*morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE],
	    displacementMapScale: [0.7, 1],//[10, 2]
	    displacementMapParams: [null, new THREE.Vector4(/*frequency*/0.1, /*iterations*/8, /*speed*/0.7, /*persistence*/0.25)]//[10, 2]
	},
	{
            filename: "../assets/glb/television3.glb",
            scale: new THREE.Vector3(5, 5, 5),
	    pos:new THREE.Vector3(0,1.0,0),
	    tesselate : [0.02, 9],
	    posNearestTo: dumpPosMap && { descId : 2, downloadFile : "television3_position_map.json" }, 
	    posMapFile: loadPosMap && "../assets/posmaps/television3_position_map.json",
            pointSize: 0.1,
	    randPosOrder: !dumpPosMap && !loadPosMap,
	    pos_noise: 0.001,
	    textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE,
	    color: 0xffffff
	},
	{
            geometry: new THREE.CircleGeometry( 100, 100 ),
	    tesselate : [0.03, 9],
	    posNearestTo: dumpPosMap && { descId : 3, downloadFile : "kaleido_position_map.json" }, 
	    posMapFile: loadPosMap && "../assets/posmaps/kaleido_position_map.json",
	    randPosOrder: !dumpPosMap && !loadPosMap,
	    pos:new THREE.Vector3(0,0,-0.3),
	    rotate:new THREE.Vector3(-Math.PI/2,0,0),
            pointSize: 1,
	    pos_noise: 2,
	    scale: new THREE.Vector3(3, 3, 1),
	    textureMap: "../assets/abstract2.png", //"../assets/well-all-be-stars-zoom.png", */"../assets/auroraborealis.png",
	    textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_USE_UV,
	    textureMapScale: new THREE.Vector2(0.2, 0.2),
	    color: 0xffffff,
            bloomIntensity: 0.1,
	    scaleTimeFBM: 2,
	    displacementMap: [audioTexture.texture[0], audioTexture.texture[2], null],
	    displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_RADIAL_U_MAPPING + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                   morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                   morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE],
	    displacementMapScale: [-30,-3, 15],
	    displacementMapParams: [null, null, new THREE.Vector4(/*frequency*/0.01, /*iterations*/8, /*speed*/0.1, /*persistence*/0.25)],
            displacementMapNormal: [null, new THREE.Vector3(0,1,0), null],
            rotateCloudBounds: true
        },
	{
            geometry: new THREE.CircleGeometry( 20, 100 ),
	    tesselate : [0.03, 9],
	    posNearestTo: dumpPosMap && { descId : 0, downloadFile : "vortex_position_map.json" }, 
	    posMapFile: loadPosMap && "../assets/posmaps/vortex_position_map.json",
	    randPosOrder: !dumpPosMap && !loadPosMap,
	    pos:new THREE.Vector3(0,0,0.1),
	    rotate:new THREE.Vector3(-Math.PI/2,0,0),
            pointSize: 0.1,
	    pos_noise: 2.0,
	    scale: new THREE.Vector3(1, 1, 1),
	    textureMap: ["../assets/water.png", reflector.getRenderTarget().texture],
	    textureMapScale: [null, new THREE.Vector2(-1,1)],
	    textureMapOffset: [null, new THREE.Vector2(1,0)],
	    textureMapFlags: [1*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV,
                              0*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_SIZE_TO_VIEW_FRUSTRUM | 1*morphPointCloud.TEXTURE_MAP_BLEND_ADD],
	    textureMapBlendCoeffs: [null, new THREE.Vector4(0.7, 0.3, 0.5, 0.5)],
            color: 0x0f0f3f,
	    scaleTimeFBM: 1,
            rotateCloudBounds: true,
	    displacementMap: [vortexDepthTexture, null],
	    displacementMapFlags: [morphPointCloud.DISPLACEMENT_MAP_RADIAL_U_MAPPING + morphPointCloud.DISPLACEMENT_MAP_ENABLE,
                                   morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE + morphPointCloud.DISPLACEMENT_MAP_USE_CUSTOM_NORMAL],
	    displacementMapScale: [1,0.5],
	    displacementMapParams: [null, new THREE.Vector4(/*frequency*/0.2, /*iterations*/8, /*speed*/0.1, /*persistence*/0.25)],
            displacementMapNormal: [null, new THREE.Vector3(0,1,0)],
	},
    ];

        
    cover_point_cloud = new morphPointCloud({
        num_points: cover_dim**2,
        point_size: 0.02,
        color: 0xffffe0,
        alpha: 1.0,
        point_sprite_file: heartPointSprite,
        enableBloom: true,
        name: "Cover Point Cloud"
    });

//    cover_point_cloud.onBeforeRender = (renderer, scene, camera ) => {
//        cover_point_cloud.visible = false;
//
//        reflector.onBeforeRender( renderer, scene, camera );
//        refractor.onBeforeRender( renderer, scene, camera );
//        cover_point_cloud.visible = true;
//    };
        
    TextCloudGeometry.factory("In Loving Memory Of\n\nAlf Brenn (1955-2025)",
			      "../assets/Terminal Dosis_Regular.json",
			      font_params).then( text_geom => {
				  // Center text
				  text_geom.computeBoundingBox();
                                  const textWidth = text_geom.boundingBox.max.x - text_geom.boundingBox.min.x;
                                  const textPosOffset = -(textWidth)/2;
                                  const scale = 40;
                                  text_geom.deleteAttribute("color");
				  cover_pointcloud_descriptor.push(
				      { geometry: text_geom,
					// Sort positions to match the seagull and previous lyrics 
					posNearestTo: (dumpPosMap &&
						       { descId : 4,
							 downloadFile : "in_memory_of_posmap.json" }),
					posMapFile: loadPosMap &&  ("../assets/posmaps/in_memory_of_posmap.json"),
					randPosOrder: !dumpPosMap && !loadPosMap,
					pos: new THREE.Vector3(scale*textPosOffset,0,0),
                                        rotate: new THREE.Vector3(-Math.PI/2,0,0),
                                        pointSize: 0.05, 
					pos_noise: 0.03,
					scale: new THREE.Vector3(scale, scale, scale),
                                        color: 0xffffff,
                                        alpha: 1.0,
                                        bloomIntensity: 1.0,
		                        scaleTimePerlin: 0.1,
		                        scaleTimeFBM: 3,
		                        textureMapFlags: morphPointCloud.TEXTURE_MAP_ENABLE | 1*morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN,
	                                textureMap: "../assets/flames.png",
                                        textureMapViewPos: new THREE.Vector3(0,50,250),
                                        textureMapUp: new THREE.Vector3(0,1,0),
	                                textureMapScale: new THREE.Vector2(0.5, 0.5),
				      }
				  );

                                  cover_point_cloud.load(cover_pointcloud_descriptor, 1).then(
	                              function (obj) {
	                                  obj.layers.enable( BLOOM_SCENE );
	                                  scene.add(obj);
	                                  cover_point_cloud_move = new MOVE(obj, true, "cover_point_cloud");
                                          
                                          const tvScreenGeom = new THREE.PlaneGeometry( 20, 12, 2, 2 );
                                          delete tvScreenGeom.attributes.color;
                                          const texData = new Float32Array(100);
                                          for (let i=0; i<100; i++){
                                              texData[i] = -0.2*Math.pow(i/100,3) + 0.2;
                                          }
                                          
	                                  const tvScreenCurveTexture = new THREE.DataTexture( texData, 100, 1, THREE.RedFormat, THREE.FloatType,
						                                              THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
                                          tvScreenCurveTexture.internalFormat = 'R32F';
	                                  tvScreenCurveTexture.magFilter = THREE.LinearFilter;
	                                  tvScreenCurveTexture.minFilter = THREE.LinearFilter;
                                          tvScreenCurveTexture.needsUpdate = true;
                                          
	                                  const fog_pointcloud_descriptor = [	
		                              { geometry: holon_logo_obj2.geometry,
		                                randPosOrder: true, //dumpPosMap && {downloadFile : "fog_holon_logo_position_map.json"} || true,
		                                pos:new THREE.Vector3(0,0,0),
		                                pos_noise: 0.01,
                                                color: 0xffffff,
                                                alpha: 0.0,
		                                scale: new THREE.Vector3(4, 4, 4),
		                                scaleTimeFBM: 0.3,
		                                scaleTimePerlin: 0.1,
	                                        textureMap: "../assets/love-and-behold-single-cover.png",
	                                        textureMapFlags: 0*morphPointCloud.TEXTURE_MAP_ADD_FBM_NOISE | 0*morphPointCloud.TEXTURE_MAP_ENABLE | 0*morphPointCloud.TEXTURE_MAP_USE_UV,
	                                        textureMapScale: new THREE.Vector2(1, 1),
		                              },
		                              { geometry: cyl_geom,
		                                randPosOrder: true, //!dumpPosMap && !loadPosMap,
		                                pos:new THREE.Vector3(0,7,0),
		                                rotate:new THREE.Vector3(0,0,0),
		                                pos_noise: 0.5,
		                                scale: new THREE.Vector3(1, 1, 1),
		                                color: 0xffffff,
		                                alpha: 1.0,
		                                scaleTimePerlin: 0.1,
		                                scaleTimeFBM: 0.3,
		                                textureMapFlags: 1*morphPointCloud.TEXTURE_MAP_ADD_FBM_NOISE
		                              },
		                              { geometry: tvScreenGeom,
	                                        tesselate : [0.0001, 13],
		                                randPosOrder: false,
		                                pos:new THREE.Vector3(-0.5,0.6,1.5),
		                                scale: new THREE.Vector3(0.15, 0.15, 0.15),
		                                rotate:new THREE.Vector3(0,0,0),
		                                pos_noise: 0.01,
                                                bloomIntensity: 0.3,
		                                scaleTimeFBM: 0.3,
                                                pointSize: 0.01,
                                                displacementMap: tvScreenCurveTexture,
                                                displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ENABLE + morphPointCloud.DISPLACEMENT_MAP_RADIAL_U_MAPPING,
                                                textureMap: ["../assets/tv-screen-shape-alpha-mask.png", "../assets/love-and-behold-singing-fixed.mov", "../assets/glitch2.mp4"],
		                                textureMapFlags: [morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN,
                                                                  morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN | morphPointCloud.TEXTURE_MAP_BLEND_MUL_ALPHA,
                                                                  morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_VIEW_POS_EN | morphPointCloud.TEXTURE_MAP_BLEND_ADD | morphPointCloud.TEXTURE_MAP_BLEND_MUL_ALPHA],
                                                textureMapScale: [new THREE.Vector2(1, 0.6), new THREE.Vector2(1, 0.6), new THREE.Vector2(1, 1)],
                                                textureMapOffset: [new THREE.Vector2(0, 0.66), new THREE.Vector2(0.07, -0.35), new THREE.Vector2(0, 0)],
                                                textureMapViewPos: new THREE.Vector3(0, 0.8, 10)
		                              },
		                              { geometry: cyl_geom,
		                                randPosOrder: true, //!dumpPosMap && !loadPosMap,
		                                pos:new THREE.Vector3(0,-60,0),
		                                rotate:new THREE.Vector3(0,0,0),
		                                pos_noise: 0.2,
		                                scale: new THREE.Vector3(16, 32, 16),
		                                color: 0xffffff,
		                                alpha: 1.0,
		                                scaleTimePerlin: 0.01,
		                                scaleTimeFBM: 0.1,
		                                textureMapFlags: [morphPointCloud.TEXTURE_MAP_ENABLE | 1*morphPointCloud.TEXTURE_MAP_KALEIDO | morphPointCloud.TEXTURE_MAP_USE_UV,
                                                                  morphPointCloud.TEXTURE_MAP_ADD_FBM_NOISE | morphPointCloud.TEXTURE_MAP_BLEND_AVG],
	                                        textureMap: ["../assets/abstract.png", null],
	                                        textureMapScale: [new THREE.Vector2(0.1, 0.1), null]
		                              },
		                              { filename: "../assets/alf.png",
		                                randPosOrder: true, //!dumpPosMap && !loadPosMap,
		                                pos:new THREE.Vector3(0,0,7),
		                                rotate:new THREE.Vector3(-Math.PI/2,0,0),
		                                pos_noise: 5,
                                                color: 0xf0f0f0,
                                                alpha: 0.5,
                                                intensity_scale: 0.5,
                                                num_points: fog_point_count/16,
                                                bloomIntensity: 1,	
	                                        textureMap: ["../assets/water.png"],
	                                        textureMapFlags: [0*morphPointCloud.TEXTURE_MAP_ENABLE | morphPointCloud.TEXTURE_MAP_USE_UV],
                                                displacementMap: null,
	                                        displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_ADD_SIMPLEX_NOISE,
	                                        displacementMapScale: 5,
	                                        displacementMapOffset: 5,
	                                        displacementMapParams: new THREE.Vector4(/*frequency*/0.001, /*iterations*/8, /*speed*/0.3, /*persistence*/0.25),
		                                scale: new THREE.Vector3(3, 3, 3),
		                              },
	                                  ];
                                          
	                                  fog_point_cloud = new morphPointCloud({
                                              num_points: fog_point_count,
                                              point_size: 0.02,
                                              color: 0xffffff,
                                              alpha: 1.0,
                                              point_sprite_file: heartPointSprite,
                                              enableBloom: true,
                                              name: "Fog Point Cloud"
                                          });
                                          
                                          loadPromises.push(
	                                      fog_point_cloud.load(fog_pointcloud_descriptor, 0).then(
		                                  function (obj2) {
		                                      obj2.layers.enable( BLOOM_SCENE );
		                                      fog_point_cloud_move = new MOVE(obj2, true, "fog_point_cloud");
		                                      scene.add(obj2);
		                                  }
	                                      )
                                          );
                                      });
	                      });
    
    }    
    const seagullGuanoPointCloudDescr = [
        { filename: "../assets/glb/seagull-guano.glb",
	  rotate: new THREE.Vector3(0,0,0),
	  pos: new THREE.Vector3(0,0,0),
	  pos_noise: 0.0,
	  scale: new THREE.Vector3(0.1, 0.1, 0.1),
          color: 0xffffff,
          alpha: 1.0,
          bloomIntensity: 0.7,
	  scaleTimePerlin: 1,
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL |  morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
          displacementMapScale: 0.2,
	  textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE },
        { geometry: new THREE.SphereGeometry( 0.001, 128, 128, 0, Math.PI, 0, Math.PI ),
	  rotate: new THREE.Vector3(0,0,0),
	  pos: new THREE.Vector3(0,0,0),
	  pos_noise: 0.0,
	  scale: new THREE.Vector3(1, 1, 1),
          color: 0x0,
          alpha: 0.0,
          bloomIntensity: 0.7
        },
        { filename: "../assets/glb/seagull-guano.glb",
	  rotate: new THREE.Vector3(Math.PI,0,0),
	  pos: new THREE.Vector3(0,0,0),
          pointSize: 0.003,
	  pos_noise: 0.0,
	  scale: new THREE.Vector3(0.3, 0.2, 0.3),
          color: 0xffffff,
          alpha: 1.0,
          bloomIntensity: 0.7,
	  scaleTimePerlin: 1,
	  displacementMapFlags: morphPointCloud.DISPLACEMENT_MAP_DISPLACE_DIR_PERP_NORMAL |  morphPointCloud.DISPLACEMENT_MAP_ADD_PERLIN_NOISE,
          displacementMapScale: 0.05,
	  textureMapFlags: morphPointCloud.TEXTURE_MAP_USE_UV | morphPointCloud.TEXTURE_MAP_ENABLE },
    ];
                                
    seagullGuanoPointCloud = new morphPointCloud({
        num_points: 30000,
        point_size: 0.001,
        color: 0xffffff,
        alpha: 0.0,
        point_sprite_file: heartPointSprite,
        enableBloom: true,
        name: "Seagull Guano Point Cloud"
    });
                                
    loadPromises.push(
        seagullGuanoPointCloud.load(seagullGuanoPointCloudDescr, 0).then(
	    function (obj) {
	        obj.layers.enable( BLOOM_SCENE );
                scene.add(obj);
                seagullGuanoPointCloudMove = new MOVE(obj, true, "seagull guano run")
            }
        )
    );
    
    function handlePromises(promises, onResolved){
        const curPromisesLength = promises.length;
        Promise.all(promises).then( () => {
            if (promises.length > curPromisesLength)
                handlePromises(promises, onResolved)
            else
                onResolved();
        });
    }
    
    handlePromises(loadPromises, () => {
	const loadingScreen = document.getElementById( 'loading-screen' );
	loadingScreen.classList.add( 'fade-out' );
        setTimeout(() => {loadingScreen.remove()}, 2000);
	morphPointCloud.downloadAllPosMaps();
	morphLineCloud.downloadAllPosMaps();
	followCameraLookAtPoints = [seagull_point_cloud, ...fishPointCloud];
        currentFollowCameraLookAtPoint = {value: seagull_point_cloud};
        initJellyfishInstances();
    });
    
}


var followCameraLookAtPoints;
var currentFollowCameraLookAtPoint;

var cover_depth_scale = {value: 1};
var capturer;

var morphEvent = null;
var morphCoverCloud = false;
var ready = false;

const clock = new THREE.Clock(true);
clock.start();


var animate = async function () {
    const skyUniforms = sky.material.uniforms;

    skyUniforms[ 'sunPosition' ].value = new THREE.Vector3().setFromSphericalCoords( 1, skyParameters.sunElevation, skyParameters.sunPosition );;
    skyUniforms[ 'turbidity' ].value = skyParameters.turbidity;
    skyUniforms[ 'rayleigh' ].value = skyParameters.rayleigh;;
    skyUniforms[ 'mieCoefficient' ].value = skyParameters.mieCoefficient;
    skyUniforms[ 'mieDirectionalG' ].value = skyParameters.mieDirectionalG;

    var infoElement = document.getElementById('info');
    if (enableInfo){
        infoElement.innerHTML = ("Camera Pos | x: " + camera.position.x + " y: " + camera.position.y + " z: " + camera.position.z + "<br>" +
                                 //(seagull_point_cloud != null ? "x: " + seagull_point_cloud.position.x + " y: " + seagull_point_cloud.position.y + " z: " + seagull_point_cloud.position.z + "<br>" : "") +
			         "Camera Rot | x: " + camera.rotation.x + " rotate y: " + camera.rotation.y + " rotate z: " + camera.rotation.z + "<br>" +
			         Math.floor(cameraMove.clock.elapsedTime/60) + ":" + Math.floor(cameraMove.clock.elapsedTime%60));
    } else {
        infoElement.innerHTML = "";
    }
        

    if (morphEvent !== null){
	if (morphCoverCloud){
	    //const elmts = seagull_point_cloud.descriptor.length;
            //seagull_point_cloud.visible = true;
	    //seagull_point_cloud.morphTo(/*elmts*/morphEvent-3, TWEEN.Easing.Linear.None, 1000);
	    cover_point_cloud.morphTo(morphEvent, TWEEN.Easing.Linear.None, 1);
            //shipwreckedPointCloud.morphTo(morphEvent, TWEEN.Easing.Linear.None, 1000);
	    //fog_point_cloud.morphTo(morphEvent, TWEEN.Easing.Linear.None, 10000);
	} else {
	    const elmts = lyricsLineCloud[0].descriptor.length;
	    lyricsLineCloud[0].morphTo(elmts-morphEvent, TWEEN.Easing.Linear.None, 5000);
            //fishPointCloud[0].position.y = -4;
            //fishPointCloud[0].position.z = 5;
            //fishPointCloud[0].visible = true;
            //fishPointCloud[0].morphTo(morphEvent == 0 ? -1 : fishPointCloud[0].descriptor.length - morphEvent - 1, TWEEN.Easing.Linear.None, 1000);
            //jellyfishPointCloud.visible = true;
            //jellyfishPointCloud.position.set(0, 0, 5);
            //for (let i=0; i<jellyfishPointCloud.count; i++)
            //    jellyfishPointCloud.morphTo(morphEvent+4, TWEEN.Easing.Linear.None, 1000, null, null, i);
	    //cover_point_cloud.morphTo(morphEvent, TWEEN.Easing.Linear.None, 5000);
	}
	morphEvent = null;
    }
    
    //cover_point_cloud.rotation.y += 0.05;
    
    await morphPointCloud.updateAll();
    await morphLineCloud.updateAll();
    if (audioTexture){
	audioTexture.updateTexture();
    }

    if (cover_point_cloud)
        water.material.uniforms.uTime.value = coverPointCloudWaterPerlinTimeScale*cover_point_cloud.clock.getElapsedTime();

    MOVE.update();
    
    TWEEN.update();

    if (enableBloom){
	scene.traverse( darkenNonBloomed );
	bloomComposer.render();
	scene.traverse( restoreMaterial );
	finalComposer.render();
    } else {
	renderer.render( scene, camera );
    }
    
    requestAnimationFrame( animate );
    if (capturer){
	capturer.capture(renderer.domElement);
    }

        
};

makePointCloud();

var sunElevationTween = null;

function initJellyfishInstances(){
    const depth_base = -110;
    const depth_range = 40;
    const radius_base = 5;
    const radius_range = 40;

    jellyfishPointCloud.stopMove();
    //jellyfishPointCloud.setupMoveTexture();
    for (let i=0; i<jellyInstances; i++){
        const depth = depth_base + depth_range*Math.random();
        const radius = radius_base + Math.random()*radius_range;
        const angle = Math.random()*2*Math.PI;
        const size = 1 + Math.random()*0.4;
        const jellyfishType = jellyfishPointCloudInstanceTypes[i];
        const rotation = new THREE.Vector3(0.6*Math.random(), Math.random()*2*Math.PI, 0.6*Math.random()); 
        jellyfishPointCloud.instance[i].position.setFromSphericalCoords(Math.sqrt(radius**2+depth**2), 0.5*Math.PI+Math.atan2(-depth, radius), angle);
        jellyfishPointCloud.instance[i].rotation.setFromVector3(rotation, "XZY");
        jellyfishPointCloud.instance[i].scale.set(size, size, size);
        jellyfishPointCloud.instance[i].clear();
        jellyfishPointCloud.morphTo(jellyfishType, TWEEN.Easing.Cubic.Out, 0, null, null, i);
        // Create camera positions for all the jellyfish
        var obj = new THREE.Object3D();
        obj.position.set(jellyfishType == JellyfishPointCloud.TYPE_SEAHORSE ? 0.5 : 0,
                         0,
                         jellyfishType == JellyfishPointCloud.TYPE_SEAHORSE ? 0 : 1);
        jellyfishPointCloud.instance[i].add(obj);
        // Create camera position that spins around the instance
        obj = new THREE.Object3D();
        obj.position.set(jellyfishType == JellyfishPointCloud.TYPE_SEAHORSE ? 1 : 1.5, 0, 0);
        jellyfishPointCloud.instance[i].add(obj);
    }
}


function resetCoreography(){
    playButton.classList.remove('fade-out');

    if (sunElevationTween){
        sunElevationTween.end();
        TWEEN.remove(sunElevationTween);
        sunElevationTween = null;
    }
    water.material.uniforms.uSimplexConfig.value = new THREE.Vector4(0.0, 1.0, 0.5, 1.0);
    water.position.set(0,0,0);
    MOVE.reset();
    resetSkyParameters(skyParameters);
    camera.position.set(0.0,1,getCameraCenterDistance());
    camera.rotation.set(0,0,0);
    audioTexture.stop();
    
    fog_point_cloud.morphTo(0);
    cover_point_cloud.morphTo(1);
    cover_point_cloud.position.set(0,0,0);
    cover_point_cloud.rotation.set(0,0,0);
    
    lyricsLineCloud[0].morphTo(lyricsLineCloud[0].descriptor.length-1);
    lyricsLineCloud[0].visible = true;
    lyricsLineCloud[1].visible = false;
    
    for (let i=0; i<2; i++){
        lyricsLineCloud[i].rotation.set(0,0,0);
        lyricsLineCloud[0].position.set(0,0,0);
    }
    seagull_point_cloud.visible = false;
    
    fishPointCloudMove[0].obj.visible = false;
    fishPointCloudMove[1].obj.visible = false;

    seagull_point_cloud.remove(...fishPointCloud);
    seagullGuanoPointCloud.morphTo(1);

    initJellyfishInstances();
}


function stopCoreography(){
    MOVE.stop();
    audioTexture.stop();
}


function startCoreography(capture=false, startTime=0){
    // Set random seed
    Math.seedrandom('casdvoinaosidfvhueohfvubefvw')
    // Start with resetting
    resetCoreography();

    // Update Sky
    const finalElevation = 1.7;
    const elevationDelta = 1.7-Math.PI/2;
    skyParameters.sunElevation = Math.PI/2 + (startTime/960)*elevationDelta;
    sunElevationTween = new TWEEN.Tween(skyParameters)
        .to({sunElevation: 1.70}, 960000-startTime*1000)
        .start();
    
    const halfpi = Math.PI/2;
    const song_start_time = 1; 
    // Do some compensation as the delay from audio file start to song actually starting changed
    const audioExtraDelay = 2.44;
    const audioStartTime = song_start_time + audioExtraDelay;
    const camera_circle_radius = 8;

    const startPos = camera.position.clone();
    startPos.y=1;
    const cameraMoveCurve = new CurveFunction(function (x){
        const radius = camera_circle_radius+(x < 0.5 ? 8*x : 8*(1-x));
	return new THREE.Vector3().setFromSphericalCoords(radius, halfpi-Math.atan2(startPos.y, radius), x * 2 * Math.PI);
    })

    const cameraMoveCurveGuitar = new CurveFunction(function (x){
        const radius = camera_circle_radius-2*x;
	return new THREE.Vector3().setFromSphericalCoords(radius, halfpi-Math.atan2(startPos.y+x*2, radius), x * 2 * Math.PI);
    })

    const cameraMoveCurveHeart = new CurveFunction(function (x){
        const radius = camera_circle_radius+ 4*x;
	return new THREE.Vector3().setFromSphericalCoords(radius, halfpi-Math.atan2(0.2, radius), x * 2 * Math.PI);
    })

    function generateRockOnWavesCurve(periodsX=1, periodsY=1, periodsZ=1, angleX=0.1, angleY=0.1, angleZ=0.1){
	return new CurveFunction(function (x){
	    return new THREE.Vector3(angleX*Math.cos(2.0*Math.PI*periodsX*x), angleY*Math.sin(2*Math.PI*periodsY*x), angleZ*Math.sin(2*Math.PI*periodsZ*x));
	});
    }

    // Generate move curve for fish when morphing to lyrics
    const fishLyricsRadius = 3;
    function generateFishLyricsCurve(revolutions, theta_offset=0){
        return new CurveFunction(function (x){
            const scale = new THREE.Vector3(4 - ( x < 0.5 ? 4*x : 2), 1, 0.5);
            const offset = new THREE.Vector3(0, 0, 5-3*x);
            const radius = fishLyricsRadius;
	    return new THREE.Vector3().setFromSphericalCoords(radius, halfpi+Math.atan2(2+0.5*Math.cos(x * 2 * Math.PI), radius), theta_offset + x * revolutions * 2 * Math.PI).multiply(scale).add(offset);
        })
    }

    const fishLyricsCurve = [generateFishLyricsCurve(1.5, -Math.PI/2),
                            generateFishLyricsCurve(1.5, Math.PI/2)];

    
    // Generate random paths for seagull and fish when focus is not on them
    const randomFishPath = [];
    for (let i=0; i<2; i++){
        randomFishPath[i] = new RandomPath({startPoint: fishLyricsCurve[i].getPointAt(1.0),
                                           startDirection: fishLyricsCurve[i].getPointAt(1.0).sub(fishLyricsCurve[i].getPointAt(0.99)),
                                           pointDistance: 1,
					   deltaAngleYRandFunc: function(maxAngle) {
					       var deltaAngle = this.prevDeltaAngle || 0;
					       const changePath = Math.random() > 0.80;
					       if (changePath)
						   deltaAngle = this.deltaAngleRand(maxAngle);
					       this.prevDeltaAngle = deltaAngle;
					       return deltaAngle;
					   },
					   maxAngleXZ: Math.PI/32,
					   maxAngleY: Math.PI/4,
					   boundBox: new THREE.Box3(new THREE.Vector3(-15,-10,-15), new THREE.Vector3(15,-2,15))});
    }
    const randomSeagullPath = new RandomPath({startPoint: new THREE.Vector3(-15,10,0),
					      pointDistance: 1,
					      deltaAngleYRandFunc: function(maxAngle) {
						  var deltaAngle = this.prevDeltaAngle || 0;
						  const changePath = Math.random() > 0.80;
						  if (changePath)
						      deltaAngle = this.deltaAngleRand(maxAngle);
						  this.prevDeltaAngle = deltaAngle;
						  return deltaAngle;
					      },
					      maxAngleXZ: Math.PI/16,
					      maxAngleY: Math.PI/4,
					      boundBox: new THREE.Box3(new THREE.Vector3(-15,5,-15), new THREE.Vector3(15,15,15))});


    // Generate curves to follow when fish is being chased by seagull. Follow a circular path with some
    // offset in depth and radius that is programmable
    function generateFishChaseCurve(params){
        const curveFunc = new CurveFunction(function (x){
            var radius;
            var depth;
            const baseDepth = params.baseDepth || 0;
            if (params.zigZagPerRevolution){
                const zigZags = params.zigZagPerRevolution * params.revolutions;
                radius = params.bigRadius + params.zigZagMagnitude*Math.cos(x * zigZags * 2 * Math.PI + (params.zigZagPhase || 0));
                depth = baseDepth + params.depthMagnitude * Math.sin(x * 2 * zigZags * Math.PI + (params.depthPhase || 0));
            } else if (params.zigZagFrequency || params.zigZagFunc || params.depthFunc){
                const zigZagFunc = params.zigZagFunc || function (t, phase){ return Math.cos(t * params.zigZagFrequency * 2 * Math.PI + phase) };
                const depthFunc = params.depthFunc || function (t, phase){ return Math.sin(t * params.zigZagFrequency * 2 * Math.PI + phase) };
                const elapsedTime = x*params.duration;
                radius = params.bigRadius + params.zigZagMagnitude*zigZagFunc(elapsedTime, params.zigZagPhase || 0);
                depth = baseDepth + params.depthMagnitude * depthFunc(elapsedTime, params.depthPhase || 0, radius);
            } else {
                radius = params.bigRadius;
                depth = params.baseDepth || 0;
            }
            
	    const pos = new THREE.Vector3().setFromSphericalCoords(Math.sqrt(radius**2+depth**2), halfpi+Math.atan2(depth, radius), x * params.revolutions * 2 * Math.PI + (params.curvePhase || 0));
            return pos;
        });
        curveFunc.params = params;
        return curveFunc;
    }


    function zigZagGroupingSync(time, phase, groupings, barOffset){
        const eightBeatsInBar = groupings.length;
        const timePerBar = timePerEight*eightBeatsInBar;
        const bar = Math.floor(time / timePerBar);
        const timeInBar = time % timePerBar;
        const eightBeatInBar = Math.floor(timeInBar / timePerEight);
        const timeInEight = timeInBar % timePerEight; 
        var offset;
        const eightBeatInfo = groupings[eightBeatInBar];
        var groupOffset = ((eightBeatInBar - eightBeatInfo.groupStart)*timePerEight+timeInEight)/(eightBeatInfo.groupCount*timePerEight);
        groupOffset = 0.5-0.5*Math.cos(groupOffset*Math.PI);
        var initialOffset = 0;
        var group = 0;
        const startDirection = Math.sign(phase);
        var direction = startDirection;
        var i=0;
        while (groupings[i].groupNum < eightBeatInfo.groupNum){
            const count = groupings[i].groupCount;
            initialOffset += count*direction;
            direction *= -1;
            i += count;
        }

        const totalBarOffset = startDirection*barOffset*bar;
        return totalBarOffset + initialOffset + direction*groupOffset*eightBeatInfo.groupCount;
    }
        
    function zigZag2433(time, phase){
        const groupings = [].concat(
            Array(2).fill({groupStart:0, groupCount:2, groupNum:0}),
            Array(4).fill({groupStart:2, groupCount:4, groupNum:1}),
            Array(3).fill({groupStart:6, groupCount:3, groupNum:2}),
            Array(3).fill({groupStart:9, groupCount:3, groupNum:3})
        );
        
        const barOffset = 2 - 4 + 3 - 3;

        return zigZagGroupingSync(time, phase, groupings, barOffset);
    }

    function zigZag10_1_1_10_1_1(time, phase){
        const groupings = [].concat(
            Array(1).fill({groupStart:0, groupCount:1, groupNum:0}),
            Array(1).fill({groupStart:1, groupCount:1, groupNum:1}),
            Array(10).fill({groupStart:2, groupCount:10, groupNum:2}),
            Array(1).fill({groupStart:12, groupCount:1, groupNum:3}),
            Array(1).fill({groupStart:13, groupCount:1, groupNum:4}),
            Array(10).fill({groupStart:14, groupCount:10, groupNum:5}),
        );
        
        const barOffset = 0;

        return zigZagGroupingSync(time, phase, groupings, barOffset);
    }

    // Some random movement for the fish and seagull when not in focus
    const seagullMoveCurve1 = randomSeagullPath.generatePointPath(213);
    const seagullMoveCurve2 = randomSeagullPath.generatePointPath(128);
    
    const fishMoveCurve1 = [randomFishPath[0].generatePointPath(261), randomFishPath[1].generatePointPath(261)];

    
    // Do coordinated moves with the music here
    const numBarsPerRotation = 8;
    const fishChaseRotationDuration = timePerBar*numBarsPerRotation;
    
    const fishChaseCurve = [
        [generateFishChaseCurve({bigRadius:15, zigZagMagnitude:2, revolutions:1, zigZagFrequency:songBeatFreq/4, duration:27, baseDepth:2, depthPhase:0, depthMagnitude:1, zigZagPhase:0}).getSpacedPoints(75),
         generateFishChaseCurve({bigRadius:15, zigZagMagnitude:2, revolutions:1, zigZagFrequency:songBeatFreq/4, duration:27, baseDepth:2, depthPhase:Math.PI, depthMagnitude:1, zigZagPhase:Math.PI}).getSpacedPoints(75)],
        [generateFishChaseCurve({bigRadius:13, zigZagMagnitude:0.25, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:Math.PI, depthMagnitude:0.5, zigZagPhase:-1}),
         generateFishChaseCurve({bigRadius:17, zigZagMagnitude:0.25, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:0, depthMagnitude:0.5, zigZagPhase:-1})],
        [generateFishChaseCurve({bigRadius:13+numBarsPerRotation*2*0.25, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:Math.PI, depthMagnitude:0.5, zigZagPhase:-1}),
         generateFishChaseCurve({bigRadius:17+numBarsPerRotation*2*0.25, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:0, depthMagnitude:0.5, zigZagPhase:-1})],
        [generateFishChaseCurve({bigRadius:13+numBarsPerRotation*2*0.25, zigZagMagnitude:0.25, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:Math.PI, depthMagnitude:0.5, zigZagPhase:1}),
         generateFishChaseCurve({bigRadius:17+numBarsPerRotation*2*0.25, zigZagMagnitude:0.25, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:0, depthMagnitude:0.5, zigZagPhase:1})],
        [generateFishChaseCurve({bigRadius:13, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:Math.PI, depthMagnitude:0.5, zigZagPhase:1}),
         generateFishChaseCurve({bigRadius:17, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:0, depthMagnitude:0.5, zigZagPhase:1})],
        [generateFishChaseCurve({bigRadius:13, zigZagMagnitude:0.0, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:Math.PI, depthMagnitude:0.5, zigZagPhase:-1}),
         generateFishChaseCurve({bigRadius:17, zigZagMagnitude:0.0, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:0, depthMagnitude:0.5, zigZagPhase:-1})],
        [generateFishChaseCurve({bigRadius:13, zigZagMagnitude:0.0, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:Math.PI, depthMagnitude:0.5, zigZagPhase:-1}),
         generateFishChaseCurve({bigRadius:17, zigZagMagnitude:0.0, revolutions:1, zigZagFunc:zigZag2433, duration:fishChaseRotationDuration, zigZagFrequency:songBeatFreq/4, baseDepth:2, depthPhase:0, depthMagnitude:0.5, zigZagPhase:-1})],
        [generateFishChaseCurve({bigRadius:13, zigZagMagnitude:1.0, revolutions:15, zigZagFunc:(x) => {return -12.9*(x/(2*fishChaseRotationDuration))},
                                duration:fishChaseRotationDuration*2, zigZagFrequency:songBeatFreq/4, baseDepth:-0.3,
                                depthFunc: (_x, _y, r)=>{return -getVortexDepth(r/20)}, depthPhase:Math.PI, depthMagnitude:1, zigZagPhase:-1}).getSpacedPoints(150),
         generateFishChaseCurve({bigRadius:17, zigZagMagnitude:1.0, revolutions:15, zigZagFunc:(x) => {return -16.9*(x/(2*fishChaseRotationDuration))},
                                duration:fishChaseRotationDuration*2, zigZagFrequency:songBeatFreq/4, baseDepth:-0.3,
                                depthFunc: (_x, _y, r)=>{return -getVortexDepth(r/20)}, depthPhase:0, depthMagnitude:1, zigZagPhase:-1}).getSpacedPoints(150)],
    ];
    const seagullFishChaseCurve = [
        generateFishChaseCurve({bigRadius:13.5, zigZagMagnitude:0, revolutions:1, zigZagFrequency:songBeatFreq/4,  duration:25, baseDepth:-2, depthMagnitude:0.1, curvePhase: -0.5}).getSpacedPoints(75),
        generateFishChaseCurve({bigRadius:13.5, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag2433, zigZagFrequency:songBeatFreq/2, duration:fishChaseRotationDuration, baseDepth:-2, depthMagnitude:0.3, zigZagPhase:-1, curvePhase: -0.5}),
        generateFishChaseCurve({bigRadius:13.5+numBarsPerRotation*2*0.5, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, zigZagFrequency:songBeatFreq/2, duration:fishChaseRotationDuration-0.5, baseDepth:-1.5, depthMagnitude:0.3, zigZagPhase:-1, curvePhase: -0.5}),
        generateFishChaseCurve({bigRadius:13.5+numBarsPerRotation*2*0.5, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag2433, zigZagFrequency:songBeatFreq/2, duration:fishChaseRotationDuration-0.5, baseDepth:-1.5, depthMagnitude:0.3, zigZagPhase:1, curvePhase: -0.5}),
        generateFishChaseCurve({bigRadius:13.5, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, zigZagFrequency:songBeatFreq/2, duration:fishChaseRotationDuration-0.5, baseDepth:-1.5, depthMagnitude:0.3, zigZagPhase:1, curvePhase: -0.5}),
        generateFishChaseCurve({bigRadius:13.5, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag2433, zigZagFrequency:songBeatFreq/2, duration:fishChaseRotationDuration-0.5, baseDepth:-1.5, depthMagnitude:0.3, zigZagPhase:-1, curvePhase: -0.5}),
        generateFishChaseCurve({bigRadius:13.5+numBarsPerRotation*2*0.5, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, zigZagFrequency:songBeatFreq/2, duration:fishChaseRotationDuration-0.5, baseDepth:-1.5, depthMagnitude:0.3, zigZagPhase:-1, curvePhase: -0.5}),
        generateFishChaseCurve({bigRadius:13.5+numBarsPerRotation*2*0.5, zigZagMagnitude:1, revolutions:10, zigZagFunc:(x) => {return -21*(x/(fishChaseRotationDuration*2))},
                               zigZagFrequency:songBeatFreq/2, duration:fishChaseRotationDuration*2, baseDepth:-2.5,
                               depthFunc: (_x, _y, r)=>{return -getVortexDepth(r/20)}, depthMagnitude:1, zigZagPhase:-1, curvePhase: -0.5}).getSpacedPoints(150),
    ];

    
    //scene.add(generateFishChaseCurve({bigRadius:15, zigZagMagnitude:0.25, revolutions:1, zigZagFunc:zigZag2433, zigZagFrequency:songBeatFreq/8, duration:16, baseDepth:-1.5, depthMagnitude:0.3, zigZagPhase:-1, curvePhase: -0.15}).getLineObject(1000));
    //scene.add(generateFishChaseCurve({bigRadius:15+(16/timePerBar)*2*0.25, zigZagMagnitude:0.5, revolutions:1, zigZagFunc:zigZag10_1_1_10_1_1, zigZagFrequency:songBeatFreq/8, duration:16, baseDepth:-1.5, depthMagnitude:0.3, zigZagPhase:-1, curvePhase: -0.15}).getLineObject(1000));
    //scene.add(generateFishChaseCurve({bigRadius:15, zigZagMagnitude:2, revolutions:1, zigZagFunc:zigZag2433, duration:11.8, depthFunc:zigZag2433, baseDepth:2, depthPhase:Math.PI, depthMagnitude:1, zigZagPhase:0}).getPointsObject(200, 0x00ff00));
    //return;
    

    const origoObject = new THREE.Object3D();
    const tvScreenPosObject = new THREE.Object3D();
    tvScreenPosObject.position.set(0,0.8, 1.8);
    
    cameraMove
    // 4.2s: Move up above the paper boat
	.to([new THREE.Vector3(0,camera_circle_radius, camera_circle_radius),
	     new THREE.Vector3(0,camera_circle_radius, 0.0)], origoObject, null, song_start_time + 3.4, TWEEN.Easing.Quadratic.Out)
    // Move down towards boat
	.to(new THREE.Vector3(0, 3, 0), new THREE.Vector3(-Math.PI/2, 0, 2*Math.PI), null, song_start_time + 13.2, TWEEN.Easing.Sinusoidal.In)
    // Move in circles while lyrics pops up
	.to(new THREE.Vector3(0, startPos.y, camera_circle_radius), null /*new THREE.Vector3(0, 0, 2*Math.PI)*/ /*lyricsLineCloud[0]*/, null, song_start_time+22, null/*TWEEN.Easing.Sinusoidal.InOut*/)
	.to(cameraMoveCurve, null, null, 29.2, TWEEN.Easing.Quadratic.In)
    // Guitar pops up - circle closer and higher
	.to(cameraMoveCurveGuitar, null, 115.8 - (song_start_time + 71), song_start_time + 71, TWEEN.Easing.Quadratic.Out)
    // Ronny and TV
	.to(new THREE.Vector3(0, 0.5, 10), tvScreenPosObject, 5, song_start_time + 119, TWEEN.Easing.Quadratic.In, null, Math.PI/32)
	.to(new THREE.Vector3(0, 0.5, 7), tvScreenPosObject, 120, song_start_time + 145, TWEEN.Easing.Quadratic.InOut, null, Math.PI/32)
    // Spiral in towards top of heart
	.to(new CurveFunction( (x) => 
	    (new THREE.Vector3().setFromSphericalCoords(7-2*x, (halfpi-Math.atan2(0.5, 7))*(1-0.9*x), x*2*Math.PI))),
	    origoObject, 35, song_start_time + 265, TWEEN.Easing.Sinusoidal.In, null, Math.PI/16)
	.to(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(-Math.PI/2, 0, 2*Math.PI), 22.5, song_start_time + 265 + 35, TWEEN.Easing.Linear.None)
	.to(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(Math.PI/2, 0, 4*Math.PI), 22.5, song_start_time + 265 + 35 + 22.5, TWEEN.Easing.Sinusoidal.Out)
	.to(new THREE.Vector3(0, 5, 0), new THREE.Vector3(Math.PI/2, 0, 4*Math.PI), null, song_start_time + 265 + 80, TWEEN.Easing.Sinusoidal.In)
    // Follow seagull
	.to(seagullCamera, seagull_point_cloud, null, song_start_time+358, null, 0.1, Math.PI)
    // Move to shipwrecked man
	.to(shipwreckedCamera, shipwreckedPointCloud, null, song_start_time+370, null, 1, 10*Math.PI)
    // Move to seagull
	.to(seagullCamera, seagull_point_cloud, null, song_start_time+375, null, 1, 10*Math.PI)
	.to(seagullCamera, seagull_point_cloud, null, song_start_time+380, null, 0.1, Math.PI)
    // Follow fish 1
	.to(fishCamera[0], fishPointCloud[0], null, song_start_time+526+fishChaseRotationDuration*4, null, 0.1, Math.PI)
    // Follow fish 2
	.to(fishCamera[1], fishPointCloud[1], 2*fishChaseRotationDuration, song_start_time+526+fishChaseRotationDuration*5, null, 0.2, Math.PI)
    // Follow fish 2
	.to(fishCamera[1], fishPointCloud[1], null, song_start_time+526+fishChaseRotationDuration*7, null, 0.2, Math.PI)
    // Follow whale
	.to(seagullCamera, seagull_point_cloud, null, song_start_time+647, null, 1/*0.05*/, Math.PI/*/32*/)
    // Follow whale
	.to(seagullCamera, seagullCamera/*MOVE.ROTATE_TO_TANGENT*/, null, song_start_time+690, null, 0.05, Math.PI/32);
    

	

    lyricsCloudMorph[0]
    // 3s: Morph to raft
	.run( (obj) => { obj.morphTo(lyricsLastMorphIdx[0] + 1, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 7);
    
    lyricsCloudRotate[1]
    // Rotate towards camera while lyrics are changing
	.to( null, camera, 71-25, 26+song_start_time-1)

    lyricsCloudRotate[0]
    // Paper boat rolling in waves
        .to( null, generateRockOnWavesCurve(3, 1, 2.9, 0.2, 0.5, 0.1), /*11.8, 14.2)*/ 16, 7.5)
    // Rotate towards camera while lyrics are changing
	.to( null, camera, null, 26+song_start_time-1)
    
    fishPointCloudMove[0]
	.to( new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, 0, 0), 0.1, 0,  TWEEN.Easing.Circular.InOut)
    fishPointCloudMove[1]
	.to( new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, 0, 0), 0.1, 0,  TWEEN.Easing.Circular.InOut)


    // Morph to all the lyrics
    // First merge and sort the lyrics based on time
    const lyricsMerged = [].concat(...lyrics);
    lyricsMerged.sort( (a, b) => (a.time - b.time))

    lyricsMerged.forEach( (entry, i) => {
	var time = entry.time + audioExtraDelay;
        var cloudIdx = entry.cloudIdx;

        var newPos;
        if (i == 0)
            newPos = new THREE.Vector3(0, 5, 0);
        else
	    newPos = new THREE.Vector3((camera_circle_radius-2)*(2*Math.random()-1), cloudIdx ? 4.5: 5, (camera_circle_radius-2)*(1.5*Math.random()-1));
        
        fishPointCloudMove[cloudIdx]
	    .to( new THREE.Vector3(newPos.x, -0.1, newPos.z), new THREE.Vector3(0, 2*Math.PI*Math.random(), 0), 0.01, time+song_start_time-2.2,  TWEEN.Easing.Circular.InOut, 1.0);
        fishPointCloudRun[cloudIdx]
	    .run( (obj) => { obj.morphTo(fishLyricsLastMorphIdx[cloudIdx]+1, TWEEN.Easing.Cubic.In, 1, null, () => {obj.visible = true})}, time+song_start_time-2.1)
	    .run( (obj) => { obj.morphTo(fishLyricsLastMorphIdx[cloudIdx]+2, TWEEN.Easing.Cubic.Out, 1000)}, time+song_start_time-2)
	    .run( (obj) => { obj.morphTo(fishLyricsLastMorphIdx[cloudIdx]+3, TWEEN.Easing.Cubic.In, 2000, null, () => {obj.visible = true;})}, time+song_start_time-1);
        
        
        if (i!=0 || cloudIdx != 0){
            lyricsCloudMove[cloudIdx]
	        .to( new THREE.Vector3(newPos.x, -1, newPos.z), null, 0.5, time+song_start_time-2.5,  TWEEN.Easing.Circular.InOut, 1.0);
            lyricsCloudMorph[cloudIdx]
	        .run( (obj) => { obj.morphTo(lyricsLastMorphIdx[cloudIdx]-1, TWEEN.Easing.Cubic.In, 1)}, time+song_start_time-2.1);
        }
        
        lyricsCloudMove[cloudIdx]
	    .to( newPos, null, 1.5, time+song_start_time-2, TWEEN.Easing.Cubic.Out)
            .to( new THREE.Vector3(newPos.x, -1, newPos.z), null, 1, time+song_start_time+1.5,  TWEEN.Easing.Cubic.In);
        lyricsCloudMorph[cloudIdx]
	    .run( (obj) => { obj.morphTo(entry.morphIdx, TWEEN.Easing.Cubic.Out, 1000,  () => {obj.visible = true})}, time+song_start_time-1.5)
	    .run( (obj) => { obj.morphTo(lyricsLastMorphIdx[cloudIdx], TWEEN.Easing.Cubic.In, 1500, null, () => {obj.visible = false;})}, time+song_start_time+1.5);
        
        const cameraLookAtObject = new THREE.Object3D();
        cameraLookAtObject.position.copy(newPos);
        cameraRotate.to(null, cameraLookAtObject, null, time+song_start_time-((i==0 && cloudIdx==0) ? 4: 2), null, Math.PI/4);
        
        // After the first chorus 
	if (i == 11){
            const lyricsCloudIdx = 0;
	    // Morph to slide guitar morph
	    lyricsCloudMove[lyricsCloudIdx]
                .to( new THREE.Vector3(0, -1, 0), null, 0.1, song_start_time+70)
		.to( new THREE.Vector3(0, 1.6, 0), null, 1, song_start_time+71.5+1/3);
	    lyricsCloudMorph[lyricsCloudIdx]
		.run( (obj) => { obj.morphTo(lyricsLastMorphIdx[lyricsCloudIdx] + 2, TWEEN.Easing.Circular.InOut, 1000, () => {obj.visible = true;})}, song_start_time+71.5+1/3);
	    lyricsCloudRotate[lyricsCloudIdx]
	    	.to( null,  new THREE.Vector3(0,0,0), 1, song_start_time+70);

            fishPointCloudMove[lyricsCloudIdx]
	        .run( (obj) => { obj.scale.x *= 2; obj.scale.z *= 2; obj.scale.y *= 0.5; obj.morphTo(fishLyricsLastMorphIdx[cloudIdx]+1, TWEEN.Easing.Cubic.In, 1, null, () => {obj.visible = true})}, song_start_time+69.5)
	        .to( new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(0, 2*Math.PI*Math.random(), 0), 0.5, song_start_time+70,  TWEEN.Easing.Circular.InOut)
	        .run( (obj) => { obj.morphTo(fishLyricsLastMorphIdx[cloudIdx]+2, TWEEN.Easing.Cubic.Out, 1000)}, song_start_time+72)
	        .run( (obj) => { obj.morphTo(fishLyricsLastMorphIdx[cloudIdx]+3, TWEEN.Easing.Cubic.In, 2000, null,
                                             () => {
                                                 obj.visible = true; obj.scale.x /= 2; obj.scale.z /= 2; obj.scale.y *= 2
                                             })}, song_start_time+117);

            // Camera to ratate to guitar
            cameraRotate.to(null, lyricsLineCloud[0], 115.8 - (song_start_time+72), song_start_time+72, null, Math.PI/64);
            
	    // Done with slide guitar - go back to water plane
	    lyricsCloudMorph[lyricsCloudIdx]
		.run( (obj) => { obj.morphTo(lyricsLastMorphIdx[lyricsCloudIdx] + 3, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time+117);
	    lyricsCloudMove[lyricsCloudIdx]
		.to( new THREE.Vector3(0,0,0), null, 5, song_start_time+118, TWEEN.Easing.Circular.InOut);
            
	    // Before lyrics after first chorus then rotate to point up
	    lyricsCloudRotate[lyricsCloudIdx]
		.to( null, camera, null, song_start_time+117);
            
	    // Morph to heart
	    lyricsCloudMorph[lyricsCloudIdx]
		.run( (obj) => { obj.visible=true; obj.morphTo(lyricsLastMorphIdx[lyricsCloudIdx] + 4, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time+265);
	    lyricsCloudMove[lyricsCloudIdx]
		.to( new THREE.Vector3(0,0,0), null, 5, song_start_time+265, TWEEN.Easing.Circular.InOut);
	    lyricsCloudRotate[lyricsCloudIdx]
		.to( null, new THREE.Vector3(0,0,0), 5, song_start_time+265);

	    // Heartbeats - it is a 2+3 beat where each repetition is at 54 bpm
            const timeExpand = (2/5)*(60/53.3);
            const timeContract = (3/5)*(60/53.3);
            const startTime = song_start_time+283.55-0.5*timeExpand;
            const stopTime = song_start_time+356;

            var curTime = startTime;
            while ((curTime + timeExpand + timeExpand) < stopTime){
	        lyricsCloudMorph[lyricsCloudIdx]
		    .run( (obj) => { obj.visible=true; obj.morphTo(lyricsLastMorphIdx[lyricsCloudIdx] + 6, TWEEN.Easing.Circular.InOut, 0.5*timeExpand*1000)}, curTime);
                curTime += timeExpand;
	        lyricsCloudMorph[lyricsCloudIdx]
		    .run( (obj) => { obj.morphTo(lyricsLastMorphIdx[lyricsCloudIdx] + 4, TWEEN.Easing.Circular.InOut, 0.5*timeContract*1000)}, curTime);
                curTime += timeContract;
            }
            
	    // Morph to island
	    lyricsCloudMorph[lyricsCloudIdx]
		.run( (obj) => { obj.morphTo(lyricsLastMorphIdx[lyricsCloudIdx] + 5, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 356);
	    lyricsCloudMove[lyricsCloudIdx]
		.to( new THREE.Vector3(0,0,0), null, 5, song_start_time + 265 + 80 + 5, TWEEN.Easing.Circular.InOut);

	    // Make invisible when vortex is coming to an end
	    lyricsCloudMorph[lyricsCloudIdx]
		.run( (obj) => { obj.visible=false;}, song_start_time + 620);

        }

    });

    /***********************************************************
     *
     * Handle Segull Guano movement
     *
     ***********************************************************/
    var seagullShitPosition = new THREE.Vector3();
    var seagullShitDirection = new THREE.Vector3();
    var shipwreckedManPosition = new THREE.Vector3();
    seagullGuanoPointCloudMove
    // Morph to guano and position correctly relative to seagull
        .run((obj) => {
            seagullShitPosition=seagull_point_cloud.localToWorld(new THREE.Vector3(0, -0.1, -0.7));
            seagull_point_cloud.getWorldDirection(seagullShitDirection);
            obj.position.copy(seagullShitPosition);
            obj.morphTo(0, TWEEN.Easing.Linear.None, 0.5);
        }, song_start_time+364.9)
    // Move downwards with some speed in the seagull flight direction
        .to(new CurveFunction( (x) => 
	    (new THREE.Vector3(seagullShitPosition.x, seagullShitPosition.y - x*20, seagullShitPosition.z).sub(seagullShitDirection.clone().multiplyScalar(-5*x)))), null, 4.9, song_start_time+365, TWEEN.Easing.Quadratic.In)
    // Get position of shipwrecked man and hide
        .run((obj) => {
            obj.position.y = 100;
            shipwreckedManPosition=shipwreckedPointCloud.localToWorld(new THREE.Vector3(-0.00, 0.35, 0.05));
        }, song_start_time+370)
    // Move downwards towards head of man
        .to(new CurveFunction( (x) => 
	    (new THREE.Vector3(shipwreckedManPosition.x, shipwreckedManPosition.y + 5*(1-x), shipwreckedManPosition.z))), null, 2.5, song_start_time+370.5, TWEEN.Easing.Linear.None)
    // Morph to splashed morph when hitting the mans head
        .run((obj) => {obj.morphTo(2, TWEEN.Easing.Linear.None, 0.5);}, song_start_time+373)
    // Make invisible
        .run((obj) => {obj.morphTo(1, TWEEN.Easing.Linear.None, 0.5);}, song_start_time+617);


    const shipwreckedCameraMove = new MOVE(shipwreckedCamera, true, "Shipwrecked man camera move"); 
    shipwreckedCameraMove
        .to(new CurveFunction( function (x){
            return new THREE.Vector3().setFromSphericalCoords(2.5, Math.PI/2, (1-x)*Math.PI/2);
        }), null, 5, song_start_time+370, TWEEN.Easing.Sinusoidal.InOut);
    
    
    /***********************************************************
     *
     * Handle Segull choreography
     *
     ***********************************************************/
    
    seagull_point_cloud_run
	.run( (obj) => {obj.visible=true; obj.startFlap()}, song_start_time+145);

    seagullLyrics.forEach( (entry, i) => {
	var time = entry.time + audioExtraDelay;
	seagull_point_cloud_run
	    .run( (obj) => { obj.morphToFlapMorph(entry.morphIdx)}, time+song_start_time-1)
	    .run( (obj) => { obj.morphToFlapMorph(-1)}, time+song_start_time+2 );
    });

    // Start with random movements
    seagull_point_cloud_move
	.to(seagullMoveCurve1.points[0], MOVE.ROTATE_TO_TANGENT_AND_TILT, 1, song_start_time+140)
	.to([].concat(seagullMoveCurve1.points.slice(1), seagullMoveCurve2.points.slice(1)), MOVE.ROTATE_TO_TANGENT_AND_TILT, null, song_start_time+143)


    // Do transition where flapping and turns follows the beats
    seagull_point_cloud_run
        .run( (obj) => {obj.stopFlap();}, song_start_time+145+213+127);

    const transitionBeats = [3, 3, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3,
                             3, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3];

    const transitionStartPoint = seagullMoveCurve2.points[seagullMoveCurve2.points.length-1];
    const transitionEndPoint = seagullFishChaseCurve[0][0];
    const transitionDirection = transitionEndPoint.clone().sub(transitionStartPoint);
    const sideMoveLengthPerBeat = 0.01;
    const lengthPerMove = transitionDirection.length()/transitionBeats.length;
    const totalSideMoveLengthPerBeat = Math.sqrt(lengthPerMove**2+sideMoveLengthPerBeat**2);
    const transitionSideMove = new THREE.Vector3(transitionDirection.x, 0, transitionDirection.z).cross(transitionDirection).normalize();
    
    var timeOffset = 0;
    var direction = 1;
    const startTransition = 487.7;
    transitionBeats.forEach( (x, i) => {
        const time = (1000*x)/(eightNoteBPM/60);
        seagull_point_cloud_run
            .run( (obj) => {obj.morphTo(-2, TWEEN.Easing.Linear.None, time/2);}, song_start_time+startTransition+timeOffset/1000)
            .run( (obj) => {obj.morphTo(-3, TWEEN.Easing.Linear.None, time/2);}, song_start_time+startTransition+(timeOffset+time/2)/1000);
        const sideMoveLength = Math.sqrt((x*totalSideMoveLengthPerBeat)**2-lengthPerMove**2);
        seagull_point_cloud_move.to(transitionStartPoint.clone().lerp(transitionEndPoint, i/(transitionBeats.length)).add(transitionSideMove.clone().multiplyScalar(direction*sideMoveLength)) ,
                                    MOVE.ROTATE_TO_TANGENT_AND_TILT, null, song_start_time+startTransition+(timeOffset+time/2)/1000, null, null, 4*Math.PI); 
        direction *= -1;
        timeOffset += time;
    });

    
    seagull_point_cloud_run
    // Synced flapping to music when the fish chase begins
        .run( (obj) => {obj.startFlap(SeagullPointCloud.FLAP_FREQUENCY_MODE, songBeatFreq/2);}, song_start_time+1+488+timeOffset/1000);


    // Move camera around seagull
    const seagullCameraMove = new MOVE(seagullCamera, true, "seagull camera move")

    const seagullCameraPos = new THREE.Spherical().setFromVector3(seagullCamera.position);
    const seagullCameraCurve = new CurveFunction( function (x){
        return new THREE.Vector3().setFromSphericalCoords(seagullCameraPos.radius, seagullCameraPos.phi, seagullCameraPos.theta-x*2*Math.PI);
    });
    
    seagullCameraMove.to(seagullCameraCurve, null, 20, song_start_time+505, TWEEN.Easing.Sinusoidal.InOut, 0.5);

    // Do the fish chase
    seagull_point_cloud_move
	.to(seagullFishChaseCurve[0].slice(1), MOVE.ROTATE_TO_TANGENT_AND_TILT, null, song_start_time+487+14, null, null, Math.PI/4, -0.074)

    var nextStartTime = 526;
    for (let i=1; i<seagullFishChaseCurve.length; i++){
        seagull_point_cloud_move
            .to(seagullFishChaseCurve[i], MOVE.ROTATE_TO_TANGENT_AND_TILT, fishChaseRotationDuration, song_start_time+nextStartTime, null, 0.1, Math.PI/2, -0.0);
        nextStartTime += fishChaseRotationDuration;
    }        

    // Move seagul down to depth and morph into whale
    seagull_point_cloud_move
        .to(new THREE.Vector3(0, -75, 0), new THREE.Vector3(-Math.PI/2, 0, 0), null, song_start_time+641);

    // First morph into open mouth whale and then close mouth
    seagull_point_cloud_run
	.run( (obj) => { obj.morphTo(whaleDescrIndex+2, TWEEN.Easing.Cubic.In, 7000)}, song_start_time+640)
	.run( (obj) => { obj.morphTo(whaleDescrIndex+0, TWEEN.Easing.Cubic.In, 10000)}, song_start_time+647);

    // Move camera for whale
    seagullCameraMove
        .to(new THREE.Vector3(0, 0, 0), null, null, song_start_time+640, TWEEN.Easing.Sinusoidal.InOut)
        .to(new THREE.Vector3(0, 0, 8), null, null, song_start_time+647, TWEEN.Easing.Sinusoidal.InOut)
        .to(new CurveFunction( (x) => { return new THREE.Vector3().setFromSphericalCoords(8, halfpi, x*Math.PI);}), null, 25, song_start_time+657, TWEEN.Easing.Linear.None)
        //.to(new CurveFunction( (x) => { return new THREE.Vector3().setFromSphericalCoords(5, halfpi-x*halfpi, Math.PI/2);}), null, 20, song_start_time+690, TWEEN.Easing.Linear.None)
        .to(new THREE.Vector3(1, 0, 2), null, null, song_start_time+690, TWEEN.Easing.Linear.None)
        .to(new THREE.Vector3(0.5, 0, 8), null, 10, song_start_time+700, TWEEN.Easing.Linear.None);
    
    // Start moving whale in a spiral
    seagull_point_cloud_move
        .to(new THREE.Vector3(0, -70, 10), MOVE.ROTATE_TO_TANGENT, null, song_start_time+647, TWEEN.Easing.Sinusoidal.In)
        .to(new CurveFunction( (x) => {
            const radius = 10 + 5*x;
            const depth = +70 + 5*x;
            return new THREE.Vector3().setFromSphericalCoords(Math.sqrt(radius**2+depth**2), halfpi + Math.atan2(depth, radius), x*3*2*Math.PI);
        }).getSpacedPoints(300).slice(1), MOVE.ROTATE_TO_TANGENT, 353, song_start_time+667, null, 0.1, Math.PI/32);

    
    /***********************************************************
     *
     * Handle Fish choreography
     *
     ***********************************************************/

    // Lyrics
    fishLyrics.forEach( (lyrics, fishNr) => {
	fishPointCloudRun[fishNr].run( (obj) => { obj.visible=true; obj.morphTo(-1, TWEEN.Easing.Cubic.In, 1000); obj.startMoving() }, song_start_time+140);
        lyrics.forEach( (entry, i) => {
	    var time = entry.time+audioExtraDelay;
	    fishPointCloudRun[fishNr]
	        .run( (obj) => { obj.morphTo(entry.morphIdx)}, time+song_start_time-1)
	        .run( (obj) => { obj.morphTo(-1)}, time+song_start_time+4 );
        });
    });

    const fishCameraMove = [];
    for (let fish=0; fish<2; fish++){ 
        fishPointCloudMove[fish]
            .to(fishLyricsCurve[fish], MOVE.ROTATE_TO_TANGENT, null, song_start_time+139, null, 1, Math.PI*2)
	    .to(fishMoveCurve1[fish].points.slice(1), MOVE.ROTATE_TO_TANGENT, null, song_start_time+139+82, null, null, Math.PI/8)
	    .to(fishChaseCurve[0][fish].slice(0,2), MOVE.ROTATE_TO_TANGENT, null, song_start_time+480)	
	    .to(fishChaseCurve[0][fish].slice(2), MOVE.ROTATE_TO_TANGENT, null, song_start_time+487+12, null, null, Math.PI);
        // Change speed when chased by seagull
        fishPointCloudRun[fish].run((obj) => {obj.morphTo(-1);obj.visible=true; obj.scale.set(1,1,1); obj.baseFreq = 0.8; obj.freqVariation = 0.2;}, song_start_time+487+3);

        nextStartTime = 526;
        for (let i=1; i<fishChaseCurve.length; i++){
            fishPointCloudMove[fish]
	        .to(fishChaseCurve[i][fish], (i == fishChaseCurve.length-1) ? MOVE.ROTATE_TO_TANGENT : MOVE.ROTATE_TO_TANGENT, null, song_start_time+nextStartTime, null, 0.2, Math.PI);
            nextStartTime += fishChaseRotationDuration;
        }

        fishCameraMove[fish] = new MOVE(fishCamera[fish], true, "fish camera " + fish)
        
        const fishCameraPos = new THREE.Spherical().setFromVector3(fishCamera[fish].position);
        const fishCameraCurve = new CurveFunction( function (x){
            return new THREE.Vector3().setFromSphericalCoords(fishCameraPos.radius, fishCameraPos.phi, fishCameraPos.theta-(1-2*fish)*x*2*Math.PI);
        });
    
        fishCameraMove[fish].to(fishCameraCurve, null, 20, song_start_time+525+fishChaseRotationDuration*4+fish*fishChaseRotationDuration+3, TWEEN.Easing.Sinusoidal.InOut);
    }
    

    fishPointCloudRun[0].run((obj) => {obj.morphTo(-1);obj.visible=true; obj.scale.set(1,1,1); obj.baseFreq = 1.4; obj.freqVariation = 0.2;}, song_start_time+525);
    fishPointCloudRun[1].run((obj) => {obj.morphTo(-1);obj.visible=true; obj.scale.set(1,1,1); obj.baseFreq = 1.4; obj.freqVariation = 0.2;}, song_start_time+525);

    fishPointCloudRun[0].run((obj) => {obj.morphTo(-1);obj.visible=true; obj.scale.set(1,1,1); obj.baseFreq = 1.4; obj.freqVariation = 0.2;}, song_start_time+555);
    fishPointCloudRun[1].run((obj) => {obj.morphTo(-1);obj.visible=true; obj.scale.set(1,1,1); obj.baseFreq = 1.4; obj.freqVariation = 0.2;}, song_start_time+555);

    // Morph to sirens
    fishPointCloudRun[0].run((obj) => {obj.morphTo(fishLyricsLastMorphIdx[0]+5, TWEEN.Easing.Circular.InOut, 5000);obj.visible=true; obj.scale.set(1,1,1); obj.baseFreq = 1.4; obj.freqVariation = 0.2;}, song_start_time+595);
    fishPointCloudRun[1].run((obj) => {obj.morphTo(fishLyricsLastMorphIdx[1]+5, TWEEN.Easing.Circular.InOut, 5000);obj.visible=true; obj.scale.set(1,1,1); obj.baseFreq = 1.4; obj.freqVariation = 0.2;}, song_start_time+615);

    for (let fish=0; fish<2; fish++){ 
        // Morph to signal curves and add fish point cloud as child to the seagul point cloud so that they move with each other
        fishPointCloudRun[fish].run((obj) => {obj.morphTo(fishLyricsLastMorphIdx[fish]+4, TWEEN.Easing.Circular.InOut, 5000); seagull_point_cloud.add(obj); obj.position.set(0,-0.2,1); obj.rotation.set(0,0,0);}, song_start_time+647);

        // Move to origo when we make it a child of seagul point cloud
        fishPointCloudMove[fish]
            .to(null, null, 0.1, song_start_time+647);
    }

    // Move water out of the way for some transitions
    waterMove
        .to(new THREE.Vector3(0, -2, 0), null, 4, song_start_time + 7)
        .to(new THREE.Vector3(0, 0, 0), null, 3.8, song_start_time + 14)
        .to(new THREE.Vector3(0, -2, 0), null, 3, song_start_time + 116)
        .to(new THREE.Vector3(0, 0, 0), null, 5, song_start_time + 125)
        .to(new THREE.Vector3(0, -2, 0), null, 1, song_start_time + 261.5)
        .to(new THREE.Vector3(0, 0, 0), null, 2, song_start_time + 263);

    cover_point_cloud_move
    // 1s: Start Audio
	 .run( (obj) => { audioTexture.start(capture, startTime > audioStartTime ? startTime - audioStartTime : 0)}, audioStartTime)
    // 4s: Morph to water
	.run( (obj) => { obj.morphTo(2, TWEEN.Easing.Circular.InOut, 5000);}, song_start_time + 9.8)
	.run( (obj) => { new TWEEN.Tween(water.material.uniforms.uSimplexConfig.value).to({x:1.0, y:0.0, z:1.0, w:1.0}, 3000).start(); }, song_start_time + 11.8)
    // Morph to TV
	.run( (obj) => { obj.morphTo(3, TWEEN.Easing.Circular.InOut, 25000);}, song_start_time + 119)
	.run( (obj) => { new TWEEN.Tween(water.material.uniforms.uSimplexConfig.value).to({x:0.0, y:0.0, z:0.0, w:0.0}, 3000).start(); }, song_start_time + 125)
	.to( MOVE.NO_CHANGE, generateRockOnWavesCurve(9.6*3, 2*3, 10*3, 0.03, 0.01, 0.03), 120, song_start_time + 139, null, null, 0.1)
    // Morph to cover
	.run( (obj) => { obj.morphTo(0, TWEEN.Easing.Circular.InOut, 5000, null/*, (x) => {water.material.uniforms.uSimplexConfig.value = new THREE.Vector4(0.0, 1.0, 0.5, 1.0);}*/)}, song_start_time + 260)
	.run( (obj) => { new TWEEN.Tween(water.material.uniforms.uSimplexConfig.value).to({x:0.0, y:1.0, z:0.5, w:1.0}, 1000).start();}, song_start_time + 261.5)
        .to( MOVE.NO_CHANGE, new THREE.Vector3(0,0,0), 4, song_start_time + 261.5)
        .run( (obj) => { water.material.uniforms.uSimplexConfig.value = new THREE.Vector4(0.0, 0.0, 0.0, 0.0);}, song_start_time+526+fishChaseRotationDuration*4)
    // Morph to vortex
	.run( (obj) => { obj.morphTo(5, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 525 + 6*fishChaseRotationDuration-5)
	.to( MOVE.NO_CHANGE, new THREE.Vector3(0,20*2*Math.PI,0), 647 - (525 + 6*fishChaseRotationDuration-4.7), song_start_time + 525 + 6*fishChaseRotationDuration-4.7)
    // Morph to kaleidoscope surface
	.run( (obj) => { obj.morphTo(3, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 647)
	.run( (obj) => { obj.visible = false}, song_start_time + 652)
	.run( (obj) => { obj.visible = true}, song_start_time + 709)
	.run( (obj) => { obj.morphTo(4, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 710)
    // Morph to memorial
	.run( (obj) => { obj.morphTo(6, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 1028);

    fog_point_cloud_move
    // 4s: Morph to fog
	.run( (obj) => { obj.morphTo(1, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 3)
    // Morph to video of singing
	.run( (obj) => { obj.morphTo(2, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 139 - 0.8)
    // Start rocking motion on waves - same as TV
	.to( MOVE.NO_CHANGE, generateRockOnWavesCurve(9.6*3, 2*3, 10*3, 0.03, 0.01, 0.03), 120, song_start_time + 139)
    // Morph back to fog
	.run( (obj) => { obj.morphTo(1, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 259)
    // Morph to krill cloud
	.run( (obj) => { obj.morphTo(3, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 646)
    // Morph to image of Alf
	.run( (obj) => { obj.morphTo(4, TWEEN.Easing.Circular.InOut, 5000)}, song_start_time + 1033);


    /***********************************************************
     *
     * Handle Jellyfish choreography
     *
     ***********************************************************/

    // Start moving jellyfish
    jellyfishPointCloudRun
        .run( (obj) => { obj.startMove()}, song_start_time+647);

    // Move from jellyfish to jellyfish
    const moveTime = 4.8;
    const rotateTime = 2;
    const timePerInstance = moveTime + rotateTime;
    const instanceCameraInitRotation = new Array();
    jellyfishPointCloud.instance.forEach( (instance, i) => {
	jellyfishPointCloudRun
            .run((obj) => {
                const radius = instance.children[1].position.x;
                const dirToCurrentPos = camera.position.clone().sub(instance.position);
                const instanceYDir = instance.localToWorld(new THREE.Vector3(0,1,0)).sub(instance.position).normalize();
                // Get projection of direction vector from instance position to camera current position
                // into instance xz plane
                const localPos = instance.worldToLocal(dirToCurrentPos.sub(instanceYDir.multiplyScalar(dirToCurrentPos.clone().dot(instanceYDir))).add(instance.position)).normalize();
                instance.children[1].position.copy(localPos.multiplyScalar(radius));
            }, song_start_time + 710 + timePerInstance*i);
	cameraMove.to(instance.children[1], MOVE.ROTATE_TO_TANGENT_AND_ROLL, null,song_start_time + 711 + timePerInstance*i, null, MOVE.CATCH_UP_LINEAR, Math.PI/2, 0, true, 2*Math.PI/moveTime);
	jellyfishPointCloudRun
            .run((obj) => {
                obj.clearUpdate();
                const radius = instance.children[1].position.x;
                const timeStart = obj.clock.getElapsedTime();
                const spherical = new THREE.Spherical().setFromVector3(instance.children[1].position);
                obj.onUpdate(
                    (x, time) => {
                        // Do the rotation of the instance camera follow object one turn around the instance - and switch direction for every other instance
                        instance.children[1].position.copy(new THREE.Vector3().setFromSphericalCoords(spherical.radius, spherical.phi, spherical.theta + (i&1 ? -1 : 1)*(time-timeStart)*Math.PI));
                    });
                //scene.add(new CurveFunction((x) => {return instance.localToWorld(new THREE.Vector3().setFromSphericalCoords(spherical.radius, spherical.phi, spherical.theta + x*2*Math.PI))}).getLineObject(20))
            }, song_start_time + 711 + timePerInstance*i + moveTime);
	cameraMove.to(instance.children[1], instance, null,song_start_time + 711 + timePerInstance*i + moveTime, null, 0.5, Math.PI, 0, true);
    });

    // Jellyfish Lyrics Morph
    var curLyricTime = 0;
    const jellyInstanceUsed = [];
    const jellyfishCount = jellyfishPointCloud.count;
    jellyLyrics.forEach( (entry,i) => {
	const time = entry.time + audioExtraDelay;
        var jellyfishInstance;
        do {
            jellyfishInstance = Math.floor(Math.random()*jellyfishCount);
        } while (jellyInstanceUsed.includes(jellyfishInstance) || (jellyfishPointCloudInstanceTypes[entry.morphIdx] != jellyfishPointCloudInstanceTypes[jellyfishInstance]));
        jellyInstanceUsed.push(jellyfishInstance);
        const currentMorphDescId = jellyfishPointCloud.currentMorphDescIdForInstance[jellyfishInstance];

        // Make sure the text morph has the same scale time as the jellyfish morph
        jellyfishPointCloud.descriptor[2+entry.morphIdx].scaleTimeFBM = jellyfishPointCloud.descriptor[currentMorphDescId].scaleTimeFBM;
        jellyfishPointCloud.descriptor[2+entry.morphIdx].scaleTimePerlin = jellyfishPointCloud.descriptor[currentMorphDescId].scaleTimePerlin;
        
	jellyfishPointCloudRun
	    .run( (obj) => { obj.morphTo(JellyfishPointCloud.TYPE_COUNT+entry.morphIdx, TWEEN.Easing.Cubic.Out, 1000, null, null, jellyfishInstance)}, time+song_start_time)
	    .run( (obj) => { obj.morphTo(currentMorphDescId, TWEEN.Easing.Cubic.Out, 1000, null, null, jellyfishInstance)}, time+song_start_time+4 );

        // Add a camera object to this instance for camera to follow
        // Create camera position
        console.assert(jellyfishPointCloud.instance[jellyfishInstance].children.length == 2);
        // Create look at position
        const jellyType = jellyfishPointCloudInstanceTypes[jellyfishInstance];
        var obj = new THREE.Object3D();
        obj.up.y = 0;
        if (jellyType == JellyfishPointCloud.TYPE_SEAHORSE)
            obj.up.z = entry.morphIdx&1 ?1:-1;
        else
            obj.up.x = entry.morphIdx&1 ?-1:1;
        
        obj.up.applyEuler(jellyfishPointCloud.instance[jellyfishInstance].rotation);
        jellyfishPointCloud.instance[jellyfishInstance].add(obj);
        if (jellyfishPointCloud.instance[jellyfishInstance].children[0].position.x)
            jellyfishPointCloud.instance[jellyfishInstance].children[0].position.x += 0.5 + Math.max(-0.5, (10-entry.words.length)*0.05);
        else
            jellyfishPointCloud.instance[jellyfishInstance].children[0].position.z += Math.max(-0.5, (10-entry.words.length)*0.05); 
	cameraMove.to(jellyfishPointCloud.instance[jellyfishInstance].children[0], jellyfishPointCloud.instance[jellyfishInstance].children[2], null, time + song_start_time - 0.5, null, 0.20, Math.PI, 0, true);

        // if time between this and next lyric is more than 10s then spin around the jellyfish while waiting
        if ((i+1) < jellyLyrics.length && ((jellyLyrics[i+1].time - entry.time) > 10)){
            const rotateTime = (jellyLyrics[i+1].time - entry.time) - 4.1 - 0.5;
	    jellyfishPointCloudRun
                .run((obj) => {
                    obj.clearUpdate();
                    const radius = obj.instance[jellyfishInstance].children[1].position.x;
                    const timeStart = obj.clock.getElapsedTime();
                    const spherical = new THREE.Spherical().setFromVector3(obj.instance[jellyfishInstance].children[0].position);
                    obj.onUpdate(
                        (x, time) => {
                            // Do the rotation of the instance camera follow object one turn around the instance - and switch direction for every other instance
                            x.instance[jellyfishInstance].children[0].position.copy(new THREE.Vector3().setFromSphericalCoords(spherical.radius, spherical.phi + 2*((time-timeStart)/rotateTime)*Math.PI, spherical.theta));
                        });
                }, time+song_start_time+4.1);
        }
        curLyricTime = time;
    });

    // Move to top of scene at end
    const height = 330;
    cameraMove.to(new THREE.Vector3(0, height, 0), new THREE.Vector3(-Math.PI/2,0,0), 5, curLyricTime + song_start_time + 6, null, 0.5);

    // Move to side
    cameraMove
        .to([new THREE.Vector3(-height*Math.cos(Math.PI/4), height*Math.cos(Math.PI/4), 23), new THREE.Vector3(-height, 4, 47)], new THREE.Vector3(0, -Math.PI/2,0), 5, curLyricTime + song_start_time + 25, TWEEN.Easing.Circular.InOut, 0.5, Math.PI/8)
        .to(new THREE.Vector3(2000, 4, 47), null, 5, curLyricTime + song_start_time + 30, TWEEN.Easing.Circular.In, 0.5, Math.PI/2);
    
    
    /***********************************************************
     *
     * Handle shipwrecked man
     *
     ***********************************************************/
    shipwreckedPointCloudRun
    // Man in raft 
        .run( (obj) => {obj.position.set(0.8,2.3,0.17);  obj.rotation.set(0,0,0); obj.morphTo(0, TWEEN.Easing.Cubic.InOut, 5000);}, song_start_time+7)
    // Make invisible 
        .run( (obj) => {obj.morphTo(2, TWEEN.Easing.Cubic.InOut, 500);}, song_start_time+25)
    // Man on island 
        .run( (obj) => {obj.position.set(-1.8,1.7,-1.5); obj.rotation.set(0, Math.PI, 0); obj.morphTo(3, TWEEN.Easing.Cubic.InOut, 3000);}, song_start_time+356)
    // Make invisible
        .run( (obj) => {obj.morphTo(2, TWEEN.Easing.Cubic.InOut, 3000);}, song_start_time+617);
    
    if (capture){
	capturer = new CCapture( {
	    format: "webm",
            autoSaveTime: 60, // Autosave every minute
            timeLimit: 1070,
	    quality: 100,
	    width: 1920,
	    height: 1080,
	    framerate: 30,
	    verbose: true,
	    display: true} );
	capturer.start();
    }

    morphPointCloud.setAllClocks(startTime);
    morphLineCloud.setAllClocks(startTime);
    MOVE.start(startTime);
}

animate();

const playControl = {startTime: Number(localStorage.getItem("startTime") || 0)};
const control = gui.addFolder('Control');
control.add(playControl, 'startTime', 0, 1020, 1).onChange( value => {localStorage.setItem("startTime", value) });
gui.close();
if (!enableGUI)
    gui.hide();

var waterMode = 2;
document.addEventListener("keypress",
			  function (event) {
                              if (event.key == ' '){
                                  if (cameraMove.clock.running)
                                      stopCoreography();
                                  else
                                      startCoreography(false, cameraMove.clock.elapsedTime);
			      } else if (!isNaN(Number(event.key))) {
				  morphEvent = Number(event.key);
				  morphCoverCloud = event.ctrlKey;
			      } else if (event.key == '<'){
                                  followCameras.push(followCameras.shift())
                                  currentFollowCamera.value = followCameras[0];
                                  followCameraLookAtPoints.push(followCameraLookAtPoints.shift());
                                  currentFollowCameraLookAtPoint.value = followCameraLookAtPoints[0];
			      } else if (event.key == 'p'){
				  startCoreography(false, playControl.startTime);
			      } else if (event.key == 'r'){
				  startCoreography(true, playControl.startTime);
			      } else if (event.key == 'q'){
				  resetCoreography();
			      } else if (event.key == 'm'){
				  audioTexture.start(false)
			      } else if (event.key == 'x'){
                                  water.material.uniforms.uOpacity.value = water.material.uniforms.uOpacity.value == 1.0 ? 0.0 : 1.0; 
                                  water.material.uniforms.color.value = water.material.uniforms.uOpacity.value == 1.0 ? new THREE.Color(0,0,0) : 1.0; 
			      } else if (event.key == 'z'){
                                  waterMode = (waterMode+1) % 3;
                                  var nextConfig;
                                  if (waterMode == 0)
                                      nextConfig = {x: 0, y: 0, z: 0, w: 0};
                                  else if (waterMode == 1)
                                      nextConfig = {x: 1, y: 0, z: 1, w: 1};
                                  else
                                      nextConfig = {x: 0, y: 1, z: 0.5, w: 1};
                                  new TWEEN.Tween(water.material.uniforms.uSimplexConfig.value)
                                      .to(nextConfig, 2000)
                                      .start();
                              } else if (event.key == 'h'){
                                  const spherical = new THREE.Spherical().setFromVector3(currentFollowCamera.value.position);
                                  currentFollowCamera.value.position.setFromSphericalCoords(spherical.radius, spherical.phi-0.1, spherical.theta);
                              } else if (event.key == 'l'){
                                  const spherical = new THREE.Spherical().setFromVector3(currentFollowCamera.value.position);
                                  currentFollowCamera.value.position.setFromSphericalCoords(spherical.radius, spherical.phi+0.1, spherical.theta);
                              } else if (event.key == 'w'){
                                  const spherical = new THREE.Spherical().setFromVector3(currentFollowCamera.value.position);
                                  currentFollowCamera.value.position.setFromSphericalCoords(spherical.radius-0.1, spherical.phi, spherical.theta);
                              } else if (event.key == 's'){
                                  const spherical = new THREE.Spherical().setFromVector3(currentFollowCamera.value.position);
                                  currentFollowCamera.value.position.setFromSphericalCoords(spherical.radius+0.1, spherical.phi, spherical.theta);
                              } else if (event.key == 'a'){
                                  const spherical = new THREE.Spherical().setFromVector3(currentFollowCamera.value.position);
                                  currentFollowCamera.value.position.setFromSphericalCoords(spherical.radius, spherical.phi, spherical.theta-0.1);
                              } else if (event.key == 'd'){
                                  const spherical = new THREE.Spherical().setFromVector3(currentFollowCamera.value.position);
                                  currentFollowCamera.value.position.setFromSphericalCoords(spherical.radius, spherical.phi, spherical.theta+0.1);
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
			      } else if (event.key == 't'){
				  capturer.stop();
				  capturer.save();
			      }
			  });

renderer.domElement.addEventListener('click',
				     function (event) {
					 //startCoreography();
				     }, false);

playButton.addEventListener('click', () => {
    startCoreography(false, playControl.startTime);
    playButton.classList.add('fade-out');
});
